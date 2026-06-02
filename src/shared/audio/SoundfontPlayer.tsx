import React, { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Audio } from 'expo-av'; // BRING THIS BACK just for OS configuration
import { AUDIO_ASSETS } from '@shared/audio/audioAssets';
import { getAudioEngineHtml } from './audioEngine'; // Update this import
import { ARP_SLOTS, buildArpPattern } from './arpPattern';

// (Keep your interfaces here: PlayNotesConfig, PlayMeasureConfig, ProgressionMeasure, SoundfontPlayerRef)
export interface PlayNotesConfig { arp: boolean; bpm: number; volume: number; guitar?: boolean; scale?: boolean; hold?: boolean; arpSwing?: boolean; refFreq?: number; }
export interface PlayMeasureConfig { bpm: number; volume: number; guitar?: boolean; arp?: boolean; resetClock?: boolean; bassEnabled?: boolean; metronomeEnabled?: boolean; arpSwing?: boolean; beats?: number; rhythm?: string; voiceLeading?: boolean; intervals?: number[]; nextRoot?: number; rootSemi?: number; refFreq?: number; bassLine?: number[]; countOff?: boolean; bassVolume?: number; clickVolume?: number; hiCutFreq?: number; hiCutGain?: number; skipTransitionFade?: boolean; }
export interface ProgressionMeasure { chordIdx: number; midiNotes: number[]; beats: number; bpm: number; volume: number; guitar: boolean; arp: boolean; arpSwing: boolean; rhythm: string; intervals: number[]; nextRoot: number; rootSemi: number; bassLine: number[]; bassEnabled: boolean; metronomeEnabled: boolean; voiceLeading: boolean; resetBassState: boolean; bassVolume: number; clickVolume: number; hiCutFreq: number; hiCutGain: number; }

export interface SoundfontPlayerRef {
  playNotes: (midiNotes: number[], config: PlayNotesConfig) => void;
  playSingleNote: (midi: number, volume: number, guitar?: boolean) => void;
  playArpLoop: (midiNotes: number[], bpm: number, volume: number, guitar?: boolean, arpSwing?: boolean) => void;
  stop: () => void;
  playMeasure: (midiNotes: number[], config: PlayMeasureConfig) => void;
  playTone: (midi: number, volume: number) => void;
  stopTone: () => void;
  playHoldChord: (midiNotes: number[], volume: number) => void;
  playProgression: (sequence: ProgressionMeasure[], onChordChange: (seqIdx: number, chordIdx: number) => void, onEnd: () => void, loop?: boolean) => void;
  stopProgression: () => void;
  setProgressionLooping: (loop: boolean) => void;
}

const SoundfontPlayer = forwardRef<SoundfontPlayerRef>((_, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  
  const progSchedulerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progSeqRef = useRef<ProgressionMeasure[]>([]);
  const progSeqIdxRef = useRef(0);
  const progIsLoopingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const progBaseTimeRef = useRef(0);
  const progTotalDurationRef = useRef(0);
  const progLoopOffsetRef = useRef(0);
  const progMeasureOffsetsRef = useRef<number[]>([]);
  const bossaMeasureCounterRef = useRef(0);
  // Highlight callback for the running progression. Fired from the WebView's
  // audio-clock-anchored MEASURE_DOWNBEAT message so the highlight lands on the beat.
  const progOnChordChangeRef = useRef<((seqIdx: number, chordIdx: number) => void) | null>(null);

  // Configure OS Audio Session on mount
  useEffect(() => {
    const initOSAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true, // This allows WebView to play when switch is set to silent
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {
        console.warn('Failed to set OS audio mode:', e);
      }
    };
    initOSAudio();

    return () => stopAll();
  }, []);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ENGINE_READY') {
        console.log("Audio Engine Ready! Initial Context State:", data.state); 
        setIsEngineReady(true);
      } else if (data.type === 'LOG') {
        console.log("[WebView Engine]:", data.message);
      } else if (data.type === 'MEASURE_DOWNBEAT') {
        // The engine sent this measure's downbeat as an absolute wall-clock target, well
        // ahead of the beat. Schedule our own timer to that target (minus a small render
        // lead) so the highlight border lands on the beat — locked to the audio clock,
        // free of bridge latency, and with no cumulative drift over the song.
        if (progOnChordChangeRef.current && typeof data.targetWallMs === 'number') {
          const RENDER_LEAD_MS = 62; // compensate the setState -> re-render -> paint delay (~4 frames)
          const delay = Math.max(0, data.targetWallMs - Date.now() - RENDER_LEAD_MS);
          const tid = setTimeout(() => {
            timersRef.current = timersRef.current.filter(t => t !== tid);
            progOnChordChangeRef.current?.(data.seqIdx, data.chordIdx);
          }, delay);
          timersRef.current.push(tid);
        }
      }
    } catch (e) {
      console.warn("WebView Message Error:", e);
    }
  };

  const sendSchedule = (events: any[], durationMs?: number, downbeat?: { seqIdx: number; chordIdx: number }) => {
    if (!isEngineReady || !webViewRef.current) {
        console.warn("Dropped audio: Engine not ready yet");
        return;
    }
    
    // Log telemetry before bridging
    if (events.length > 0) {
      console.log(`Sending ${events.length} notes. First note volume: ${events[0].volume}`);
    }

    webViewRef.current.postMessage(JSON.stringify({
      type: 'PLAY_SCHEDULE',
      events: events,
      durationMs: durationMs,
      downbeat: downbeat
    }));
  };

  const stopAll = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (progSchedulerRef.current) clearTimeout(progSchedulerRef.current);
    progOnChordChangeRef.current = null; // stop any in-flight MEASURE_DOWNBEAT from updating the highlight

    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'STOP_ALL' }));
    }
  };

  // Click-free voice stealing: ramps any currently sounding voices to 0 over fadeMs
  // and stops them. Unlike stopAll, this does NOT clear scheduled timers, so it can
  // be used at note/measure boundaries to prevent the previous notes from ringing
  // through (the "sustain pedal" effect) without interrupting the running sequence.
  const releaseAll = (fadeMs: number = 60) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'RELEASE_ALL', fadeMs }));
    }
  };

  // Like releaseAll but preserves nextMeasureTime so the audio clock stays locked
  // across measure boundaries in a running progression.
  const gentleRelease = (fadeMs: number = 60) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'GENTLE_RELEASE', fadeMs }));
    }
  };


  useImperativeHandle(ref, () => ({
    stop: stopAll,
    
    playNotes: (midiNotes, config) => {
      stopAll();
      const instrument = config.guitar ? 'guitar' : 'piano';
      const vol = Math.min(1.5, (config.volume / 100) * 1.5);
      const cleanNotes = midiNotes.filter(n => n !== null && !isNaN(n));
      const events: any[] = [];

      const arpBeatSecs = 60 / config.bpm;
      // For arpeggios, ring each note for one slot then fade out over a generous
      // release tail so notes crossfade naturally into the next attack instead of
      // stacking like a held sustain pedal or being chopped off mid-attack.
      const arpSlotMs = arpBeatSecs * 500; // 0.5 beat slot in ms
      const arpReleaseMs = 140;
      cleanNotes.forEach((midi, index) => {
        let delaySecs = 0;
        if (config.arp) {
          const beatIndex = Math.floor(index / 2);
          const isOffbeat = index % 2 === 1;
          delaySecs = beatIndex * arpBeatSecs + (isOffbeat ? arpBeatSecs * (config.arpSwing ? 0.66 : 0.5) : 0);
        } else if (config.guitar) {
          delaySecs = index * 0.012;
        }

        let durationMs: number | null;
        let releaseMs: number | undefined;
        if (config.hold) {
          durationMs = null;
        } else if (config.arp) {
          durationMs = arpSlotMs + arpReleaseMs;
          releaseMs = arpReleaseMs;
        } else {
          durationMs = 1100; // 1100ms total
          releaseMs = 350;   // 350ms smooth release
        }

        events.push({
          instrument,
          midi,
          volume: vol,
          timeOffset: delaySecs,
          durationMs,
          releaseMs,
        });
      });

      sendSchedule(events);
    },

    playSingleNote: (midi, volume, guitar = false) => {
      sendSchedule([{ instrument: guitar ? 'guitar' : 'piano', midi, volume: volume / 100, timeOffset: 0, durationMs: 1000, releaseMs: 350 }]);
    },

    playTone: (midi, volume) => {
      if (!isEngineReady || !webViewRef.current) return;
      // tunerMode=true → engine shifts +1 octave, preserving E-A-D-G-B-E order.
      webViewRef.current.postMessage(JSON.stringify({ type: 'PLAY_TONE', midis: [midi], volume: volume / 100, tunerMode: true }));
    },

    stopTone: () => {
      if (!webViewRef.current) return;
      webViewRef.current.postMessage(JSON.stringify({ type: 'STOP_TONE', fadeMs: 200 }));
    },

    playHoldChord: (midiNotes, volume) => {
      if (!isEngineReady || !webViewRef.current) return;
      const cleanNotes = midiNotes.filter(n => n !== null && !isNaN(n));
      if (!cleanNotes.length) return;
      // Stop any JS-scheduled sequence (progression/arp) WITHOUT firing STOP_ALL,
      // which would also fade the held tone and collide with PLAY_TONE's own
      // crossfade below (the source of the note-to-note click).
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (progSchedulerRef.current) clearTimeout(progSchedulerRef.current);
      // Fade out any ringing strummed (sample) voices. RELEASE_ALL touches only
      // activeSources, never the tone voices, so the crossfade stays click-free.
      webViewRef.current.postMessage(JSON.stringify({ type: 'RELEASE_ALL', fadeMs: 60 }));
      webViewRef.current.postMessage(JSON.stringify({ type: 'PLAY_TONE', midis: cleanNotes, volume: volume / 100 }));
    },

    playArpLoop: (midiNotes, bpm, volume, guitar = false, arpSwing = false) => {
      stopAll();
      const instrument = guitar ? 'guitar' : 'piano';
      const vol = volume / 100;
      const pattern = buildArpPattern(midiNotes);
      if (!pattern.length) return;

      let slot = 0;
      const beatMs = 60000 / bpm;

      // Each note rings for one slot (half a beat) plus a release tail, so the
      // next note's attack arrives while the previous is gently fading out.
      const slotMs = beatMs * 0.5;
      const arpReleaseMs = 140;
      const playNextArp = () => {
          const midi = pattern[slot % ARP_SLOTS];
          sendSchedule([{ instrument, midi, volume: vol, timeOffset: 0, durationMs: slotMs + arpReleaseMs, releaseMs: arpReleaseMs }]);

          const isOffbeat = slot % 2 === 1;
          const delayToNext = isOffbeat ? beatMs * (arpSwing ? 0.66 : 0.5) : beatMs * (arpSwing ? 1.34 : 0.5);

          slot++;
          timersRef.current.push(setTimeout(playNextArp, delayToNext));
      };
      playNextArp();
    },

    playMeasure: (midiNotes, config) => {
      if (config.countOff) {
        const beatSecs = 60 / config.bpm;
        const beats = config.beats || 4;
        const clickVol = (config.clickVolume ?? 80) / 100;
        const events = [];
        for (let i = 0; i < beats; i++) {
          events.push({ instrument: 'metronome', midi: i === 0 ? 84 : 76, volume: clickVol, timeOffset: i * beatSecs, durationMs: 100 });
        }
        sendSchedule(events, beatSecs * beats * 1000);
        return;
      }

      const instrument = config.guitar ? 'guitar' : 'piano';
      const vol = Math.min(1.5, (config.volume / 100) * 1.5);
      const cleanNotes = midiNotes.filter(n => n !== null && !isNaN(n));
      const events: any[] = [];

      // Release any previously sounding voices so the new chord doesn't ring on top of the old.
      if (!config.skipTransitionFade) gentleRelease(150);

      const beatSecs = 60 / config.bpm;
      const beats = config.beats || 4;
      const measureMs = beatSecs * beats * 1000;

      cleanNotes.forEach((midi, index) => {
         const delaySecs = config.guitar ? index * 0.012 : 0;
         events.push({ instrument, midi, volume: vol, timeOffset: delaySecs, durationMs: measureMs * 0.8 + 150, releaseMs: 150 });
      });

      if (config.bassEnabled && cleanNotes.length > 0) {
         events.push({ instrument: 'bass', midi: cleanNotes[0], volume: Math.min(1.5, ((config.bassVolume ?? 70) / 100) * 1.5), timeOffset: 0, durationMs: measureMs * 0.8 + 150, releaseMs: 150 });
      }

      sendSchedule(events);
    },

    playProgression: (sequence, onChordChange, onEnd, loop = false) => {
      if (!sequence.length) return;
      // Clear only the JS-side scheduler/timers so the WebView audio clock
      // (nextMeasureTime) is preserved — crucial when the count-off has
      // already primed the timeline.
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (progSchedulerRef.current) clearTimeout(progSchedulerRef.current);
      
      progSeqRef.current = sequence;
      progSeqIdxRef.current = 0;
      progIsLoopingRef.current = loop;
      bossaMeasureCounterRef.current = 0;
      progOnChordChangeRef.current = onChordChange; // fired from the WebView's audio-clock downbeat message

      // Pre-compute cumulative start offsets for each measure.
      // This enables absolute-time scheduling so timer jitter never compounds.
      const offsets: number[] = [];
      let cumulativeMs = 0;
      for (const m of sequence) {
        offsets.push(cumulativeMs);
        const beatSecs = 60 / m.bpm;
        cumulativeMs += (beatSecs * 1000) * m.beats;
      }
      progMeasureOffsetsRef.current = offsets;
      progTotalDurationRef.current = cumulativeMs;
      progBaseTimeRef.current = Date.now() + 100;
      progLoopOffsetRef.current = 0;

      const runNextMeasure = () => {
        if (progSeqIdxRef.current >= progSeqRef.current.length) {
            if (progIsLoopingRef.current) { 
                progLoopOffsetRef.current += progTotalDurationRef.current;
                progSeqIdxRef.current = 0; 
            } else { 
                // Schedule onEnd so the final chord ring-out isn't cut short.
                const onEndTargetMs = progBaseTimeRef.current + progLoopOffsetRef.current + progTotalDurationRef.current + 250;
                const onEndDelay = Math.max(0, onEndTargetMs - Date.now());
                progSchedulerRef.current = setTimeout(onEnd, onEndDelay); 
                return; 
            }
        }

        const measure = progSeqRef.current[progSeqIdxRef.current];
        const currentIdx = progSeqIdxRef.current;
        const currentChordIdx = measure.chordIdx;

        // Wall-clock start of this measure's audio. Used ONLY to pace the look-ahead
        // scheduler below — NOT to drive the highlight. The highlight is fired from the
        // WebView's audio clock via MEASURE_DOWNBEAT (passed as the downbeat meta on the
        // schedule call), which stays locked to the audio and never drifts over the song.
        const measureStartMs = progBaseTimeRef.current + progLoopOffsetRef.current + progMeasureOffsetsRef.current[currentIdx];

        const instrument = measure.guitar ? 'guitar' : 'piano';
        const vol = Math.min(1.5, (measure.volume / 100) * 1.5);
        const beatSecs = 60 / measure.bpm; 
        const measureMs = beatSecs * 1000 * measure.beats;
        
        const isSplit = measure.beats === 2;

        let cumulativeBeats = 0;
        for (let i = 0; i < currentIdx; i++) {
            cumulativeBeats += progSeqRef.current[i].beats;
        }
        const isSecondHalf = isSplit && (cumulativeBeats % 4 === 2);

        const events: any[] = [];
        let hasCustomScheduling = false;
        let chordStrikesSecs: number[] = [0];

        // Center the strum on the beat: shift the whole stagger back by half its span so
        // the middle string lands on the downbeat instead of the first string. Without this,
        // the perceived attack (last string) arrives ~60ms late, which sounds behind the click.
        const strumStepSecs = 0.004;
        const strumPrerollSecs = measure.guitar ? (measure.midiNotes.length - 1) * strumStepSecs : 0;

        // Arpeggio mode fills the bar with eighth notes that cycle through the chord/
        // shape notes (a 5-note chord in 4/4 → notes 1 2 3 4 5 1 2 3). The eighth-note
        // count tracks the time signature (beats × 2): 8 per 4-beat bar, 6 per 3, 4 per
        // a 2-beat split. Notes roll low→high, echoing the play screen's hold-arp feel.
        const isArpMeasure = measure.arp && measure.midiNotes.some(n => n != null && !isNaN(n));
        if (isArpMeasure) {
            const arpNotes = measure.midiNotes.filter(n => n != null && !isNaN(n)).slice().sort((a, b) => a - b);
            const slots = measure.beats * 2;              // eighth notes per measure
            const slotMs = beatSecs * 500;                // half-beat ring (ms)
            const arpReleaseMs = 140;                     // gentle crossfade tail
            for (let i = 0; i < slots; i++) {
                const midi = arpNotes[i % arpNotes.length];
                const beatIndex = Math.floor(i / 2);
                const isOffbeat = i % 2 === 1;
                const offsetSecs = beatIndex * beatSecs + (isOffbeat ? beatSecs * (measure.arpSwing ? 0.66 : 0.5) : 0);
                events.push({ instrument, midi, volume: vol, timeOffset: offsetSecs, durationMs: slotMs + arpReleaseMs, releaseMs: arpReleaseMs });
            }
        } else
        switch (measure.rhythm) {
            case 'swing': {
                hasCustomScheduling = true;
                if (isSplit) {
                    // Split swing: each half-measure chord is handled by its own PLAY_SCHEDULE.
                    // Just play the current chord at beat 0, sustaining to end of its window.
                    const strikeDur = measureMs + 400;
                    measure.midiNotes.forEach((midi, i) => {
                        const guitarStaggerSecs = measure.guitar ? i * strumStepSecs - strumPrerollSecs : 0;
                        events.push({ instrument, midi, volume: vol, timeOffset: Math.max(0, guitarStaggerSecs), durationMs: strikeDur, releaseMs: 400 });
                    });
                } else {
                    // Non-split swing: play at 0 and 5/3 beats — both sustain to end of measure
                    const strike1Dur = measureMs + 400;
                    measure.midiNotes.forEach((midi, i) => {
                        const guitarStaggerSecs = measure.guitar ? i * strumStepSecs - strumPrerollSecs : 0;
                        events.push({ instrument, midi, volume: vol, timeOffset: Math.max(0, guitarStaggerSecs), durationMs: strike1Dur, releaseMs: 400 });
                    });

                    const strike2Offset = (5/3) * beatSecs;
                    const strike2Dur = (measureMs - strike2Offset * 1000) + 400;
                    measure.midiNotes.forEach((midi, i) => {
                        const guitarStaggerSecs = measure.guitar ? i * strumStepSecs - strumPrerollSecs : 0;
                        events.push({ instrument, midi, volume: vol, timeOffset: strike2Offset + guitarStaggerSecs, durationMs: strike2Dur, releaseMs: 400 });
                    });
                }
                break;
            }
            case 'bossanova': {
                const isEvenBossa = (Math.floor(cumulativeBeats / 4) % 2 === 0);
                if (isSplit) {
                    if (isSecondHalf) {
                        chordStrikesSecs = isEvenBossa ? [beatSecs * 1.0] : [beatSecs * 0.5];
                    } else {
                        chordStrikesSecs = isEvenBossa ? [0, beatSecs * 1.5] : [beatSecs * 1.0];
                    }
                } else {
                    chordStrikesSecs = isEvenBossa
                        ? [0, beatSecs * 1.5, beatSecs * 3.0]
                        : [beatSecs * 1.0, beatSecs * 2.5];
                }
                break;
            }
            case 'twostep': {
                if (isSplit) {
                    chordStrikesSecs = [beatSecs * 1.0];
                } else {
                    chordStrikesSecs = [beatSecs * 1.0, beatSecs * 3.0];
                }
                break;
            }
            case 'reggae': {
                if (isSplit) {
                    if (isSecondHalf) {
                        chordStrikesSecs = [beatSecs * 1.0];
                    } else {
                        chordStrikesSecs = [beatSecs * 1.0, beatSecs * (5 / 3)];
                    }
                } else {
                    chordStrikesSecs = [beatSecs * 1.0, beatSecs * (5 / 3), beatSecs * 3.0];
                }
                break;
            }
            case 'straight':
            default: {
                if (isSplit) {
                    // Two strikes per 2-beat split measure: beats 0 and 1.
                    // Result across a full bar: chord1 chord1 chord2 chord2.
                    chordStrikesSecs = [0, beatSecs];
                } else {
                    chordStrikesSecs = [];
                    for (let i = 0; i < measure.beats; i++) {
                        chordStrikesSecs.push(i * beatSecs);
                    }
                }
                break;
            }
        }

        if (!isArpMeasure && !hasCustomScheduling) {
            // Clamp: remove any strikes that fall at or beyond the measure window
            chordStrikesSecs = chordStrikesSecs.filter(t => t < beatSecs * measure.beats);

            chordStrikesSecs.forEach((strikeTime) => {
                // Each strike sustains to the end of the measure so chords ring out
                // naturally and crossfade into the next chord via the measure-boundary
                // RELEASE_ALL fade rather than being cut short mid-ring.
                const remainingMs = (beatSecs * measure.beats - strikeTime) * 1000;
                const strikeDurMs = remainingMs + 400;
                measure.midiNotes.forEach((midi, i) => {
                    const guitarStaggerSecs = measure.guitar ? i * strumStepSecs - strumPrerollSecs : 0;
                    events.push({ instrument, midi, volume: vol, timeOffset: Math.max(0, strikeTime + guitarStaggerSecs), durationMs: strikeDurMs, releaseMs: 400 });
                });
            });
        }

        if (measure.bassEnabled && measure.bassLine && measure.bassLine.length > 0) {
            measure.bassLine.forEach((bassMidi, i) => {
                events.push({ instrument: 'bass', midi: bassMidi, volume: Math.min(1.5, (measure.bassVolume / 100) * 1.5), timeOffset: i * beatSecs, durationMs: beatSecs * 1000 * 0.8 + 150, releaseMs: 120 });
            });
        } else if (measure.bassEnabled && measure.midiNotes.length > 0) {
             events.push({ instrument: 'bass', midi: measure.midiNotes[0], volume: Math.min(1.5, (measure.bassVolume / 100) * 1.5), timeOffset: 0, durationMs: measureMs * 0.8 + 150, releaseMs: 150 });
        }

        if (measure.metronomeEnabled) {
            for (let i = 0; i < measure.beats; i++) {
                events.push({ instrument: 'metronome', midi: i === 0 ? 84 : 76, volume: measure.clickVolume / 100, timeOffset: i * beatSecs, durationMs: 100 });
            }
        }

        const currentMeasureMs = (beatSecs * 1000) * measure.beats;
        sendSchedule(events, currentMeasureMs, { seqIdx: currentIdx, chordIdx: currentChordIdx });
        
        // Schedule the next check at absolute time: 250ms before next measure starts.
        // 100ms was too tight — the JS→WebView bridge can add 30–80ms of latency, and the
        // audio engine's nextMeasureTime window is only 20ms wide. If the message arrived
        // even slightly late, the engine fell back to now+20ms, creating a brief cutout at
        // the bar 1→2 boundary. 250ms gives ~200ms of margin after bridge latency.
        const nextMeasureStartMs = measureStartMs + currentMeasureMs;
        const nextCheckTargetMs = nextMeasureStartMs - 250;
        const nextCheckDelay = Math.max(100, nextCheckTargetMs - Date.now());

        progSeqIdxRef.current++;
        progSchedulerRef.current = setTimeout(runNextMeasure, nextCheckDelay);
      };

      runNextMeasure();
    },

    stopProgression: stopAll,
    setProgressionLooping: (loop) => { progIsLoopingRef.current = loop; }
  }));

return (
    <View style={{ width: 0, height: 0, opacity: 0 }}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        // Inject the HTML and the Assets simultaneously!
        source={{ html: getAudioEngineHtml(AUDIO_ASSETS) }} 
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
});

export default SoundfontPlayer;