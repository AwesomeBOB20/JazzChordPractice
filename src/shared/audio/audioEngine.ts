export const getAudioEngineHtml = (assets: any) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Audio Engine</title>
</head>
<body>
  <script>
    const bridgeLog = (msg) => {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: msg }));
    };

    // Catch any uncaught errors in the WebView and bridge them
    window.onerror = function(message, source, lineno, colno, error) {
      bridgeLog('FATAL WEBVIEW ERROR: ' + message);
      return true;
    };

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();

    // ── MASTER BUS: gentle makeup gain → transparent safety limiter → speakers ──
    // Every voice (samples + tone oscillators + metronome) routes through this. The
    // earlier setup (1.5× drive into a hard-knee 20:1 brick-wall limiter) made the app
    // louder but slammed the limiter on anything loud, which a Web Audio compressor
    // turns into harmonic distortion (the "fuzzy/distorted" sound). Cleanliness vs.
    // loudness is a tradeoff; this leans CLEAN: only a touch of makeup, and a soft-knee
    // low-ratio limiter that merely catches true peaks instead of crushing everything.
    const MASTER_DRIVE = 1.15; // light makeup. Raise = louder but pushes the limiter harder (more distortion).
    const masterBus = audioCtx.createGain();
    masterBus.gain.value = MASTER_DRIVE;
    const masterLimiter = audioCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -1.5; // only act near full scale
    masterLimiter.knee.value = 6;          // soft knee → smooth, musical, no hard-clip fuzz
    masterLimiter.ratio.value = 6;         // gentle catch, not a brick wall
    masterLimiter.attack.value = 0.005;
    masterLimiter.release.value = 0.2;     // smooth recovery, no pumping
    masterBus.connect(masterLimiter);
    masterLimiter.connect(audioCtx.destination); // dry path

    // ── Subtle master reverb (adds 'space'/polish so nothing sounds dry & cheap) ──
    // Algorithmically-generated impulse (decaying stereo noise) → no audio asset
    // needed. Runs as a parallel send off the master bus and is summed back INTO the
    // limiter, so the tail can never push the output past the ceiling. REVERB_WET
    // controls the amount; keep it low so it's ambience, not a wash.
    const REVERB_WET = 0.12;
    function makeImpulse(seconds, decay) {
      const rate = audioCtx.sampleRate;
      const len = Math.max(1, Math.floor(rate * seconds));
      const buf = audioCtx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buf;
    }
    const reverb = audioCtx.createConvolver();
    reverb.buffer = makeImpulse(1.8, 2.8); // ~1.8s soft room/hall
    const reverbWet = audioCtx.createGain();
    reverbWet.gain.value = REVERB_WET;
    masterBus.connect(reverb);
    reverb.connect(reverbWet);
    reverbWet.connect(masterLimiter); // wet summed back in, then limited

    // Dry bus that BYPASSES the reverb (for the metronome — clicks must stay tight and
    // precise for practice, not get a wash of tail). Same makeup gain + limiter as the
    // main bus, just no reverb send.
    const dryBus = audioCtx.createGain();
    dryBus.gain.value = MASTER_DRIVE;
    dryBus.connect(masterLimiter);

    // Selectable tuner play-tones (PLAY_TONE tunerMode): STRUCK 2-operator FM voices — a modulator sine
    // FMs a carrier sine, and the modulation index decays FASTER than the amplitude, so each note has a
    // bright bloom on the attack that mellows into a pure ring (the e-piano/bell signature). The carrier
    // is the exact pitch (no vibrato → still a precise reference). ratio = modulator:carrier frequency
    // (non-integer = inharmonic / bell-like); index = peak FM depth; ampDecay/modDecay in seconds; lp = top.
    const FM_PRESETS = {
      epiano:   { ratio: 1.0,  index: 2.6, ampDecay: 2.2, modDecay: 0.45, lp: 4500 }, // Rhodes-ish electric piano
      bell:     { ratio: 3.5,  index: 4.5, ampDecay: 4.5, modDecay: 1.8,  lp: 7000 }, // inharmonic bell, long ring
      musicbox: { ratio: 3.0,  index: 2.2, ampDecay: 1.7, modDecay: 0.6,  lp: 8000 }, // bright, delicate
      marimba:  { ratio: 4.0,  index: 1.8, ampDecay: 0.7, modDecay: 0.28, lp: 6000 }, // short, woody mallet
      glass:    { ratio: 2.41, index: 3.5, ampDecay: 3.2, modDecay: 1.1,  lp: 9000 }, // shimmery inharmonic glass
    };

    const buffers = { piano: {}, guitar: {}, bass: {} };
    let activeSources = [];
    // Metronome click oscillators are tracked separately (NOT in activeSources, which the
    // measure-boundary crossfade reads) so a STOP can silence already-scheduled future clicks.
    let activeMetronomes = [];
    let nextMeasureTime = 0;
    let currentBatchId = 0;
    // All active + fading tone voices. Tracking every voice (not just the latest)
    // is what prevents orphaned oscillators from causing clicks on rapid switches.
    let toneVoices = []; // { oscillators: OscillatorNode[], masterGain: GainNode, stopAt: number }

    const INJECTED_ASSETS = ${JSON.stringify(assets)};

    const midiToNoteName = (midi) => {
      const notes = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
      const octave = Math.floor(midi / 12) - 1;
      return notes[midi % 12] + octave;
    };

    async function initEngine() {
      try {
        for (const instrument of ['piano', 'guitar', 'bass']) {
          if (!INJECTED_ASSETS[instrument]) continue;
          for (const [noteName, base64Data] of Object.entries(INJECTED_ASSETS[instrument])) {
            try {
              const base64Str = base64Data.split(',').pop();
              const binaryString = window.atob(base64Str);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              const buffer = await audioCtx.decodeAudioData(bytes.buffer);
              buffers[instrument][noteName] = buffer;
            } catch (e) {
              bridgeLog('Failed to decode ' + instrument + ' ' + noteName + ': ' + e.message);
            }
          }
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ENGINE_READY', state: audioCtx.state }));
      } catch (err) {
        bridgeLog('INIT CRASH: ' + err.message);
      }
    }

    function getBufferAndRate(instrument, midi) {
      if (!buffers[instrument]) {
         throw new Error('Unknown instrument requested: ' + instrument);
      }
      const targetName = midiToNoteName(midi);
      if (buffers[instrument][targetName]) {
        return { buffer: buffers[instrument][targetName], rate: 1.0 };
      }
      for (let d = 1; d <= 12; d++) {
        const upName = midiToNoteName(midi + d);
        if (buffers[instrument][upName]) return { buffer: buffers[instrument][upName], rate: Math.pow(2, -d / 12) };
        const downName = midiToNoteName(midi - d);
        if (buffers[instrument][downName]) return { buffer: buffers[instrument][downName], rate: Math.pow(2, d / 12) };
      }
      return { buffer: null, rate: 1.0 };
    }

    function stopAllToneVoices(fadeMs) {
      const fadeSecs = Math.max(0.02, (fadeMs || 120) / 1000);
      const now = audioCtx.currentTime;
      // Prune voices whose scheduled stop has already passed — they're silent.
      toneVoices = toneVoices.filter(v => v.stopAt > now);
      if (!toneVoices.length) return;
      toneVoices.forEach(voice => {
        const g = voice.masterGain.gain;
        // Robust de-click fade. We deliberately AVOID cancelAndHoldAtTime: it is
        // missing/buggy on some mobile WebViews, and there its failure fell through
        // to cancelScheduledValues + a linearRamp anchored on the stale setValueAtTime(0)
        // event — so the gain snapped from full to ~0 in a single block (the harsh
        // click). Instead we pin a fresh anchor at the CURRENT value, then ramp to
        // TRUE zero (0, not 0.0001) so the source is silent before it is stopped.
        try {
          g.cancelScheduledValues(now);
          g.setValueAtTime(Math.max(0.00001, g.value), now);
          g.linearRampToValueAtTime(0, now + fadeSecs);
        } catch (e) {}
        const stopAt = now + fadeSecs + 0.03;
        voice.stopAt = stopAt; // keep pruning accurate
        voice.oscillators.forEach(osc => { try { osc.stop(stopAt); } catch(e) {} });
      });
    }

    document.addEventListener("message", function(event) {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'STOP_ALL') {
          const now = audioCtx.currentTime;
          const fadeSecs = 0.015; // 15ms quick de-click fade
          activeSources.forEach(entry => {
            try {
              entry.gain.gain.cancelScheduledValues(now);
              entry.gain.gain.setTargetAtTime(0, now, fadeSecs / 3);
              entry.source.stop(now + fadeSecs + 0.01);
            } catch(e) {}
          });
          activeSources = [];
          activeMetronomes.forEach(m => { try { m.gain.gain.cancelScheduledValues(now); m.gain.gain.setValueAtTime(0, now); m.source.stop(now); } catch(e) {} });
          activeMetronomes = [];
          nextMeasureTime = 0;
          stopAllToneVoices(40);
        }
        else if (data.type === 'RELEASE_ALL') {
          const fadeMs = (data.fadeMs != null) ? data.fadeMs : 150;
          const fadeSecs = fadeMs / 1000;
          const now = audioCtx.currentTime;
          activeSources.forEach(entry => {
            try {
              entry.gain.gain.cancelScheduledValues(now);
              const timeConstant = fadeSecs / 3;
              entry.gain.gain.setTargetAtTime(0, now, timeConstant);
              entry.source.stop(now + fadeSecs + 0.05);
            } catch(e) {}
          });
          activeSources = [];
          activeMetronomes.forEach(m => { try { m.gain.gain.cancelScheduledValues(now); m.gain.gain.setValueAtTime(0, now); m.source.stop(now); } catch(e) {} });
          activeMetronomes = [];
          nextMeasureTime = 0;
        }
        else if (data.type === 'GENTLE_RELEASE') {
          const fadeMs = (data.fadeMs != null) ? data.fadeMs : 150;
          const fadeSecs = fadeMs / 1000;
          const now = audioCtx.currentTime;
          activeSources.forEach(entry => {
            try {
              entry.gain.gain.cancelScheduledValues(now);
              const timeConstant = fadeSecs / 3;
              entry.gain.gain.setTargetAtTime(0, now, timeConstant);
              entry.source.stop(now + fadeSecs + 0.05);
            } catch(e) {}
          });
          activeSources = [];
          // NOTE: intentionally do NOT reset nextMeasureTime here so the
          // audio timeline remains intact across measure boundaries.
        }
        else if (data.type === 'PLAY_SCHEDULE') {
          bridgeLog('PLAY_SCHEDULE triggered. Notes to play: ' + data.events.length);
          
          if (audioCtx.state === 'suspended') {
              audioCtx.resume();
          }
          const now = audioCtx.currentTime;
          const thisBatchId = ++currentBatchId;
          
          let startTime = now;
          if (data.durationMs) {
            // Accept nextMeasureTime even if the bridge message arrived up to 100ms late
            // (now - 0.1 grace). Without this, a >20ms latency spike caused the engine to
            // fall back to now+0.02, creating a brief gap at the bar 1→2 boundary.
            // Floor startTime at now+0.005 so we never schedule nodes in the past.
            if (nextMeasureTime > now - 0.1 && nextMeasureTime < now + 2.5) {
              startTime = Math.max(now + 0.005, nextMeasureTime);
            } else {
              startTime = now + 0.02;
            }
            nextMeasureTime = startTime + (data.durationMs / 1000);

            // Report this measure's downbeat to RN as an ABSOLUTE wall-clock target so the
            // visual highlight lines up with the audio. We convert the audio-clock startTime
            // to wall-clock (Date.now is the same system clock here and in RN) and send it
            // immediately — ~250ms ahead of the beat. RN then schedules its OWN timer to this
            // exact target, keeping the WebView->RN bridge latency out of the firing path and
            // preventing any drift from the audio over the course of the song.
            if (data.downbeat) {
              const targetWallMs = Date.now() + (startTime - audioCtx.currentTime) * 1000;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'MEASURE_DOWNBEAT',
                seqIdx: data.downbeat.seqIdx,
                chordIdx: data.downbeat.chordIdx,
                targetWallMs: targetWallMs
              }));
            }
          } else {
            nextMeasureTime = 0;
          }

          // For measure-level schedules: do an audio-clock-accurate crossfade of ALL
          // previous-batch sources at startTime. This replaces per-note voice stealing
          // for measures because voice stealing fired at wall-clock 'now' — up to 250ms
          // before startTime — cutting notes early and leaving a gap before the new
          // notes started. Scheduling the fade at startTime (= nextMeasureTime) means
          // the crossfade is perfectly synchronised with the new notes' attack regardless
          // of bridge latency. Per-note voice stealing is kept only for non-measure events.
          if (data.durationMs) {
            // Crossfade length for the previous chord. Default 120ms legato (smooth chord changes);
            // cut-off feels (bossa/two-step/reggae) pass a short value so the old chord ends cleanly at
            // the bar line instead of ringing into the next measure.
            const XFADE = (data.xfadeMs != null ? data.xfadeMs : 120) / 1000;
            const now2 = audioCtx.currentTime;
            // Hold the previous chord until THIS measure's first chord strike, then crossfade.
            // For downbeat rhythms (straight) this is the bar line (delay 0); for backbeat rhythms
            // (two-step/reggae) it's the offset hit, so the old chord rings through the gap instead
            // of cutting out early. Clamp so a late bridge never schedules the fade in the past.
            const xfadeAt = Math.max(now2 + 0.005, startTime + (data.xfadeDelayMs ? data.xfadeDelayMs / 1000 : 0));
            activeSources.forEach(existing => {
              if (existing.batchId !== thisBatchId && existing.gain && existing.source) {
                try {
                  // Anchor at the ACTUAL current gain value, not the stored target volume.
                  // If the bridge arrived late the release ramp may have already started,
                  // so cancelScheduledValues(xfadeAt) won't catch it and a naive
                  // setValueAtTime(existing.volume) would snap the gain back up — the click.
                  // Cancelling from now2 and anchoring at g.value freezes any in-progress
                  // decay at its current point. The second setValueAtTime(anchorVol, xfadeAt)
                  // holds the level steady until the new chord's strike so chords don't
                  // audibly fade during the look-ahead/hold window.
                  const anchorVol = Math.max(0.00001, existing.gain.gain.value);
                  existing.gain.gain.cancelScheduledValues(now2);
                  existing.gain.gain.setValueAtTime(anchorVol, now2);
                  existing.gain.gain.setValueAtTime(anchorVol, xfadeAt);
                  existing.gain.gain.linearRampToValueAtTime(0, xfadeAt + XFADE);
                  existing.source.stop(xfadeAt + XFADE + 0.02);
                  existing.scheduledStop = xfadeAt + XFADE;
                } catch(e) {}
              }
            });
          }

          data.events.forEach(ev => {
            bridgeLog('Attempting to play MIDI ' + ev.midi + ' on ' + ev.instrument);

            if (ev.instrument === 'metronome') {
              try {
                const source = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                const filter = audioCtx.createBiquadFilter();

                source.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(dryBus); // metronome bypasses reverb (stays tight)

                const time = startTime + ev.timeOffset;
                const isAccent = ev.midi === 84;
                const freq = isAccent ? 1000 : 800;

                source.type = 'triangle';
                source.frequency.setValueAtTime(freq, time);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(3500, time);
                filter.Q.setValueAtTime(1, time);

                gainNode.gain.setValueAtTime(0, time);
                // METRO_SCALE attenuates the click globally — the synthesized triangle is a sharp
                // transient that reads much louder than its raw gain vs the sampled chord/bass, so
                // even mixer level 2 felt too loud. 0.5 ≈ -6 dB across every level.
                const METRO_SCALE = 0.5;
                gainNode.gain.linearRampToValueAtTime(ev.volume * (isAccent ? 1.0 : 0.75) * METRO_SCALE, time + 0.002);
                gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

                source.start(time);
                source.stop(time + 0.08);
                // Metronome clicks are short self-stopping oscillators. Keeping them out of
                // activeSources prevents the measure-boundary crossfade from reading their
                // pre-fire gain (WebAudio default 1.0), cancelling their envelope, and blasting
                // a full-volume triangle wave for the rest of the beat. They ARE tracked in
                // activeMetronomes so a STOP can kill clicks already scheduled on the audio clock
                // (look-ahead queues up to a measure of clicks that would otherwise keep firing).
                const metroEntry = { source, gain: gainNode };
                activeMetronomes.push(metroEntry);
                source.onended = () => { const i = activeMetronomes.indexOf(metroEntry); if (i !== -1) activeMetronomes.splice(i, 1); };
              } catch (e) {
                bridgeLog('Metronome synthesis error: ' + e.message);
              }
              return;
            }

            // Per-note voice stealing for non-measure (one-shot) events only.
            // Measure-level transitions are handled by the audio-clock crossfade above.
            if (!data.durationMs) {
              const thisNoteStart = startTime + ev.timeOffset;
              const crossfadeSec = 0.45;
              activeSources.forEach(existing => {
                if (existing.batchId !== thisBatchId
                    && existing.instrument === ev.instrument
                    && existing.midi === ev.midi
                    && existing.scheduledStop <= thisNoteStart + crossfadeSec) {
                  try {
                    const fadeAt = Math.max(now, existing.scheduledStart);
                    const fadeSecs = 0.02;
                    existing.gain.gain.cancelScheduledValues(fadeAt);
                    existing.gain.gain.setTargetAtTime(0, fadeAt, fadeSecs / 3);
                    existing.source.stop(fadeAt + fadeSecs + 0.01);
                  } catch(e) {}
                }
              });
            }

            const { buffer, rate } = getBufferAndRate(ev.instrument, ev.midi);
            
            if (!buffer) {
               bridgeLog('SILENT EXIT: No buffer found for MIDI ' + ev.midi + ' on ' + ev.instrument);
               return;
            }

            const source = audioCtx.createBufferSource();
            const gainNode = audioCtx.createGain();

            source.buffer = buffer;
            source.playbackRate.value = rate;
            
            source.connect(gainNode);
            gainNode.connect(masterBus);

            const eventStartTime = startTime + ev.timeOffset;
            gainNode.gain.setValueAtTime(0, eventStartTime);
            gainNode.gain.linearRampToValueAtTime(ev.volume, eventStartTime + 0.003); // 3ms smooth attack ramp
            
            // FIX: Start must precede Stop
            source.start(eventStartTime);
            
            if (ev.durationMs) {
              const durationSecs = ev.durationMs / 1000;
              const releaseMs = (ev.releaseMs != null) ? ev.releaseMs : 50;
              // Clamp release so the ramp never starts before the note's start time + 3ms.
              const minPreRelease = 0.005;
              const releaseSecs = Math.max(0.005, Math.min(releaseMs / 1000, durationSecs - minPreRelease));
              const stopTime = eventStartTime + durationSecs;
              const releaseStartTime = Math.max(eventStartTime + 0.003, stopTime - releaseSecs);
              gainNode.gain.setValueAtTime(ev.volume, releaseStartTime);
              // Exponential decay (natural-sounding, like before) but to a tiny floor that's
              // REACHED at stopTime, then a 6ms linear glide to TRUE zero before the hard stop().
              // The old setTargetAtTime is asymptotic — it never hit 0 — so source.stop() could cut
              // the buffer mid-amplitude → click/pop (heard on the last measure + short bass notes,
              // which the measure-boundary crossfade doesn't cover). exponentialRamp needs a >0
              // start, guaranteed for any audible note; silent notes just hold at 0.
              if (ev.volume > 0.001) gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime);
              else gainNode.gain.setValueAtTime(0, stopTime);
              gainNode.gain.linearRampToValueAtTime(0, stopTime + 0.006);
              source.stop(stopTime + 0.012);
            }

            const scheduledStop = ev.durationMs ? eventStartTime + ev.durationMs / 1000 + 0.05 : Infinity;
            const entry = { source, gain: gainNode, midi: ev.midi, instrument: ev.instrument, scheduledStart: eventStartTime, scheduledStop, batchId: thisBatchId, volume: ev.volume };
            source.onended = () => {
              const idx = activeSources.indexOf(entry);
              if (idx !== -1) activeSources.splice(idx, 1);
            };
            activeSources.push(entry);
            bridgeLog('Successfully started playback for MIDI ' + ev.midi);
          });
        }
        else if (data.type === 'PLAY_TONE') {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          // Crossfade: ramp the previous tone(s) down over 60 ms while the new one
          // ramps up over the same 60 ms window (below). The overlap is what makes
          // note-to-note switches click-free yet still feel instant. Targets EVERY
          // tracked voice (active + fading orphans) so rapid switches never leave
          // old oscillators ringing underneath the new one.
          stopAllToneVoices(60);

          const midis = Array.isArray(data.midis) ? data.midis : [data.midi];
          const numNotes = midis.length;
          const tunerMode = !!data.tunerMode;
          // Hold pad runs well below the tuner: a pure sine puts all its energy at one
          // frequency, so a high/loud one makes small phone speakers distort. Lower level
          // = smoother, non-harsh tone with headroom.
          const vol = tunerMode ? 0.24 : 0.20;
          const now = audioCtx.currentTime;

          const masterGain = audioCtx.createGain();
          masterGain.gain.setValueAtTime(0, now);
          // Tuner notes are STRUCK (the per-note envelope shapes the strike+ring), so the master rises
          // almost instantly; the hold pad keeps its soft swell. Both overlap the outgoing tone's 60 ms
          // release for a click-free crossfade.
          masterGain.gain.linearRampToValueAtTime(vol, now + (tunerMode ? 0.004 : 0.08));
          masterGain.connect(masterBus);

          const newOscillators = [];
          let voiceStopAt = Infinity; // struck tuner voices auto-decay → finite stop; hold pad = Infinity
          midis.forEach(midi => {
            let m = midi;
            if (tunerMode) {
              // Tuner: shift up one octave. Phone speakers can't reproduce the true
              // low-string fundamentals (~82 Hz E), where a pure sine just rattles and
              // sounds bad — an octave up lands every string in the range the speaker
              // handles cleanly. The loudness tilt below keeps the top strings smooth.
              m = midi + 12;
            } else {
              // Hold chord: normalise to a comfortable middle register (C4–B5). High
              // pure sines sound sharp/distorted on phone speakers, so keep it mid-range.
              while (m < 60) m += 12;
              while (m > 83) m -= 12;
            }
            const freq = 440 * Math.pow(2, (m - 69) / 12);

            // 1/N scaling keeps the worst-case sum at vol (no clipping) for both modes.
            const noteGain = audioCtx.createGain();
            let level = 1.0 / numNotes;
            if (tunerMode) {
              // Equal-loudness tilt: phone speakers under-reproduce lows (so low strings
              // sound quiet) and the ear is very sensitive up high (so high strings sound
              // loud). Boost the lows and cut the highs hard to even them out. Centre is
              // ~330 Hz: below that gets louder, above gets quieter.
              let tilt = 330 / freq; // ~2.0 at the low E, ~0.5 at the high E
              // Higher strings sit above the ~330 Hz centre (tilt < 1). Steepen ONLY that cut side so
              // the top notes ease off a little more, while the low-string boost (tilt >= 1) is
              // untouched. The lower floor lets the high strings actually drop below the old 0.5 clamp.
              if (tilt < 1) tilt = Math.pow(tilt, 1.3);
              level *= Math.max(0.35, Math.min(1.7, tilt));
            }
            if (tunerMode) {
              // STRUCK 2-operator FM voice (e-piano / bell / music-box / marimba / glass). modulator → FMs
              // the carrier's frequency; modGain (the FM depth) decays fast so the bright attack settles
              // into a pure ring, while the amplitude rings out more slowly. Carrier = exact pitch.
              const preset = FM_PRESETS[data.tone] || FM_PRESETS.epiano;
              const t0 = now;
              const ampDecay = preset.ampDecay;

              const lp = audioCtx.createBiquadFilter();
              lp.type = 'lowpass';
              lp.frequency.value = preset.lp;
              lp.Q.value = 0.5;
              lp.connect(noteGain);
              noteGain.connect(masterGain);

              // Struck amplitude: near-instant attack, exponential ring-out to silence.
              noteGain.gain.setValueAtTime(0.0001, t0);
              noteGain.gain.exponentialRampToValueAtTime(level, t0 + 0.004);
              noteGain.gain.exponentialRampToValueAtTime(Math.max(0.00001, level * 0.0008), t0 + ampDecay);

              const carrier = audioCtx.createOscillator();
              carrier.type = 'sine';
              carrier.frequency.value = freq;
              carrier.connect(lp);

              const modulator = audioCtx.createOscillator();
              modulator.type = 'sine';
              modulator.frequency.value = freq * preset.ratio;
              const modGain = audioCtx.createGain();
              const modPeak = preset.index * freq * preset.ratio; // FM depth in Hz
              modGain.gain.setValueAtTime(modPeak, t0);
              modGain.gain.exponentialRampToValueAtTime(Math.max(1, modPeak * 0.02), t0 + preset.modDecay);
              modulator.connect(modGain);
              modGain.connect(carrier.frequency);

              const stopT = t0 + ampDecay + 0.15;
              carrier.start(t0); modulator.start(t0);
              carrier.stop(stopT); modulator.stop(stopT);
              newOscillators.push(carrier, modulator);
              voiceStopAt = stopT;
            } else {
              noteGain.gain.value = level;
              noteGain.connect(masterGain);
              const osc = audioCtx.createOscillator();
              osc.type = 'sine'; // hold pad stays a single pure sine
              osc.frequency.value = freq;
              osc.connect(noteGain);
              osc.start(now);
              newOscillators.push(osc);
            }
          });

          // Register as a tracked voice so future PLAY_TONEs and STOP_TONEs
          // can reach it even after it would otherwise become "orphaned".
          toneVoices.push({ oscillators: newOscillators, masterGain, stopAt: voiceStopAt });
        }
        else if (data.type === 'STOP_TONE') {
          stopAllToneVoices(data.fadeMs || 200);
        }
      } catch (err) {
        bridgeLog('CRASH IN MESSAGE LISTENER: ' + err.message);
      }
    });

    initEngine();
  </script>
</body>
</html>
`;