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
            if (nextMeasureTime > now && nextMeasureTime < now + 2.5) {
              startTime = nextMeasureTime;
            } else {
              startTime = now + 0.02;
            }
            nextMeasureTime = startTime + (data.durationMs / 1000);
          } else {
            nextMeasureTime = 0;
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

            // Per-note voice stealing:
            // - Never steal from the same batch (future-scheduled sub-beats within this rhythm pattern).
            // - Steal from a previous batch only if the old note's stop time is within the
            //   crossfade window (0.45s) of this note's start — meaning it is stale or being
            //   replaced. Notes with stop time further in the future are intentional ring-out
            //   tails crossing a measure boundary; leave them to decay naturally.
            const thisNoteStart = startTime + ev.timeOffset;
            const crossfadeSec = 0.45;
            activeSources.forEach(existing => {
              if (existing.batchId !== thisBatchId
                  && existing.instrument === ev.instrument
                  && existing.midi === ev.midi
                  && existing.scheduledStop <= thisNoteStart + crossfadeSec) {
                try {
                  const fadeAt = Math.max(now, existing.scheduledStart);
                  const fadeSecs = 0.02; // 20ms clean fade
                  existing.gain.gain.cancelScheduledValues(fadeAt);
                  existing.gain.gain.setTargetAtTime(0, fadeAt, fadeSecs / 3);
                  existing.source.stop(fadeAt + fadeSecs + 0.01);
                } catch(e) {}
              }
            });

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
            const entry = { source, gain: gainNode, midi: ev.midi, instrument: ev.instrument, scheduledStart: eventStartTime, scheduledStop, batchId: thisBatchId };
            source.onended = () => {
              const idx = activeSources.indexOf(entry);
              if (idx !== -1) activeSources.splice(idx, 1);
            };
            activeSources.push(entry);
            bridgeLog('Successfully started playback for MIDI ' + ev.midi);
          });
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