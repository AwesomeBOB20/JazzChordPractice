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
          activeSources.forEach(source => {
            try { source.stop(); } catch(e) {}
          });
          activeSources = [];
        }
        else if (data.type === 'PLAY_SCHEDULE') {
          bridgeLog('PLAY_SCHEDULE triggered. Notes to play: ' + data.events.length);
          
          if (audioCtx.state === 'suspended') {
              audioCtx.resume();
          }
          const now = audioCtx.currentTime;
          
          data.events.forEach(ev => {
            bridgeLog('Attempting to play MIDI ' + ev.midi + ' on ' + ev.instrument);
            
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

            gainNode.gain.setValueAtTime(ev.volume, now + ev.timeOffset);
            
            // FIX: Start must precede Stop
            source.start(now + ev.timeOffset);
            
            if (ev.durationMs) {
              const durationSecs = ev.durationMs / 1000;
              gainNode.gain.setValueAtTime(ev.volume, now + ev.timeOffset + durationSecs - 0.05);
              gainNode.gain.linearRampToValueAtTime(0, now + ev.timeOffset + durationSecs);
              source.stop(now + ev.timeOffset + durationSecs);
            }

            activeSources.push(source);
            bridgeLog('Successfully started playback for MIDI ' + ev.midi);
          });

          activeSources = activeSources.filter(s => s.playbackState !== "finished");
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