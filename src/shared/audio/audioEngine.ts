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
    const buffers = { piano: {}, guitar: {}, bass: {} };
    let activeSources = [];
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
            const XFADE = 0.06; // 60ms: fast enough to feel instant, long enough to be click-free
            activeSources.forEach(existing => {
              if (existing.batchId !== thisBatchId && existing.gain && existing.source) {
                try {
                  existing.gain.gain.cancelScheduledValues(startTime);
                  existing.gain.gain.setValueAtTime(existing.volume || 0, startTime);
                  existing.gain.gain.linearRampToValueAtTime(0, startTime + XFADE);
                  existing.source.stop(startTime + XFADE + 0.02);
                  existing.scheduledStop = startTime + XFADE;
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
                gainNode.connect(audioCtx.destination);

                const time = startTime + ev.timeOffset;
                const isAccent = ev.midi === 84;
                const freq = isAccent ? 1000 : 800;

                source.type = 'triangle';
                source.frequency.setValueAtTime(freq, time);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(3500, time);
                filter.Q.setValueAtTime(1, time);

                gainNode.gain.setValueAtTime(0, time);
                gainNode.gain.linearRampToValueAtTime(ev.volume * (isAccent ? 1.0 : 0.75), time + 0.002);
                gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

                source.start(time);
                source.stop(time + 0.08);

                const entry = { source, gain: gainNode };
                source.onended = () => {
                  const idx = activeSources.indexOf(entry);
                  if (idx !== -1) activeSources.splice(idx, 1);
                };
                activeSources.push(entry);
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
            gainNode.connect(audioCtx.destination);

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
              const timeConstant = releaseSecs / 3;
              gainNode.gain.setTargetAtTime(0, releaseStartTime, timeConstant);
              source.stop(stopTime + 0.05);
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
          const vol = tunerMode ? 0.25 : 0.20;
          const now = audioCtx.currentTime;

          const masterGain = audioCtx.createGain();
          masterGain.gain.setValueAtTime(0, now);
          masterGain.gain.linearRampToValueAtTime(vol, now + (tunerMode ? 0.06 : 0.08)); // gentle attack; overlaps the outgoing tone's release for a click-free crossfade
          masterGain.connect(audioCtx.destination);

          const newOscillators = [];
          midis.forEach(midi => {
            let m = midi;
            if (tunerMode) {
              // Tuner: shift exactly +1 octave — preserves the E·A·D·G·B·E low→high
              // order while moving all strings into a comfortable listening range.
              m = midi + 12;
            } else {
              // Hold chord: normalise to a comfortable middle register (C4–B5). High
              // pure sines sound sharp/distorted on phone speakers, so keep it mid-range.
              while (m < 60) m += 12;
              while (m > 83) m -= 12;
            }
            const freq = 440 * Math.pow(2, (m - 69) / 12);

            // Pure single sine per note. 1/N scaling keeps the worst-case sum at vol
            // (no clipping) for both the hold pad and the tuner.
            const noteGain = audioCtx.createGain();
            noteGain.gain.value = 1.0 / numNotes;
            noteGain.connect(masterGain);

            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(noteGain);
            osc.start(now);
            newOscillators.push(osc);
          });

          // Register as a tracked voice so future PLAY_TONEs and STOP_TONEs
          // can reach it even after it would otherwise become "orphaned".
          toneVoices.push({ oscillators: newOscillators, masterGain, stopAt: Infinity });
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