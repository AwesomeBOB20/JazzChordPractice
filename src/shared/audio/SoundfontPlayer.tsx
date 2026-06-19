import React, { forwardRef, useImperativeHandle, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Audio } from 'expo-av'; // BRING THIS BACK just for OS configuration
import { AUDIO_ASSETS } from '@shared/audio/audioAssets';
import { getAudioEngineHtml } from './audioEngine'; // Update this import
import { ARP_SLOTS, buildArpPattern } from './arpPattern';
import { useSettingsStore } from '@features/settings/store/settingsStore';

// (Keep your interfaces here: PlayNotesConfig, PlayMeasureConfig, ProgressionMeasure, SoundfontPlayerRef)
export interface PlayNotesConfig { arp: boolean; bpm: number; volume: number; guitar?: boolean; scale?: boolean; hold?: boolean; arpSwing?: boolean; refFreq?: number; }
export interface PlayMeasureConfig { bpm: number; volume: number; guitar?: boolean; arp?: boolean; resetClock?: boolean; bassEnabled?: boolean; metronomeEnabled?: boolean; arpSwing?: boolean; beats?: number; rhythm?: string; voiceLeading?: boolean; intervals?: number[]; nextRoot?: number; rootSemi?: number; refFreq?: number; bassLine?: number[]; countOff?: boolean; bassVolume?: number; clickVolume?: number; skipTransitionFade?: boolean; }
export interface ProgressionMeasure { chordIdx: number; midiNotes: number[]; beats: number; bpm: number; volume: number; guitar: boolean; arp: boolean; arpSwing: boolean; rhythm: string; intervals: number[]; nextRoot: number; rootSemi: number; bassLine: number[]; bassEnabled: boolean; metronomeEnabled: boolean; voiceLeading: boolean; resetBassState: boolean; bassVolume: number; clickVolume: number; }

export interface SoundfontPlayerRef {
  playNotes: (midiNotes: number[], config: PlayNotesConfig) => void;
  playSingleNote: (midi: number, volume: number, guitar?: boolean, durationMs?: number | null) => void;
  playArpLoop: (midiNotes: number[], bpm: number, volume: number, guitar?: boolean, arpSwing?: boolean) => void;
  stop: () => void;
  playMeasure: (midiNotes: number[], config: PlayMeasureConfig) => void;
  playTone: (midi: number, volume: number) => void;
  stopTone: () => void;
  playHoldChord: (midiNotes: number[], volume: number) => void;
  playProgression: (sequence: ProgressionMeasure[], onChordChange: (seqIdx: number, chordIdx: number) => void, onEnd: () => void, loop?: boolean) => void;
  stopProgression: () => void;
  setProgressionLooping: (loop: boolean) => void;
  // Tap-ahead: queue a skip to the measure whose original progression index is chordIdx,
  // applied at the next measure boundary. Pass null to cancel a pending queue.
  queueProgressionJump: (chordIdx: number | null) => void;
  // Live chord edit: patch the running sequence's NOTE data (midiNotes/bass/intervals) in
  // place while keeping each measure's timing (beats/bpm), so an edit mid-playback is heard
  // the next time that measure plays without disturbing the absolute-time clock.
  updateProgressionNotes: (sequence: ProgressionMeasure[]) => void;
}

const SoundfontPlayer = React.memo(forwardRef<SoundfontPlayerRef>((_, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);

  // Build the audio-engine HTML (with all embedded samples) ONCE. Passing a fresh
  // `source={{ html: ... }}` object on every render makes react-native-webview reload the
  // WebView — which tears down the live AudioContext and silently kills any progression that's
  // mid-playback. Memoizing keeps the source reference stable so the engine mounts exactly once
  // and is never reloaded by an incidental re-render (e.g. a store rehydrate on first launch).
  const engineSource = useMemo(() => ({ html: getAudioEngineHtml(AUDIO_ASSETS) }), []);
  
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
  // Tap-ahead queue: chordIdx to jump to at the next boundary (null = none), plus an
  // accumulated timeline shift so a jumped-to measure starts exactly where the linear-next
  // one would have. measureStartMs adds progTimeShiftRef so the absolute-time clock stays
  // continuous across jumps. Both reset at the start of every playProgression.
  const progQueuedChordIdxRef = useRef<number | null>(null);
  const progTimeShiftRef = useRef(0);
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
      }
    } catch (e) {
      console.warn("WebView Message Error:", e);
    }
  };

  const sendSchedule = (events: any[], durationMs?: number, downbeat?: { seqIdx: number; chordIdx: number }, xfadeDelayMs?: number) => {
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
      downbeat: downbeat,
      // Delay the previous-chord crossfade until THIS measure's first chord strike (rhythms like
      // two-step/reggae hit on the backbeat, not the downbeat). Without it the old chord is cut at
      // the bar line while the new chord hasn't sounded yet → an audible gap before the new hit.
      xfadeDelayMs: xfadeDelayMs,
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

    playSingleNote: (midi, volume, guitar = false, durationMs = 1000) => {
      // durationMs === null → ring the full sample (held out) until STOP_ALL stops it.
      sendSchedule([{ instrument: guitar ? 'guitar' : 'piano', midi, volume: volume / 100, timeOffset: 0, durationMs, releaseMs: 350 }]);
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
      const arpReleaseMs = 140;
      const playNextArp = () => {
          // Re-read BPM and swing on every beat so live control changes take effect immediately.
          const { bpm: currentBpm, arpSwing: currentSwing } = useSettingsStore.getState();
          const beatMs = 60000 / currentBpm;
          const slotMs = beatMs * 0.5;
          const midi = pattern[slot % ARP_SLOTS];
          sendSchedule([{ instrument, midi, volume: vol, timeOffset: 0, durationMs: slotMs + arpReleaseMs, releaseMs: arpReleaseMs }]);

          const isOffbeat = slot % 2 === 1;
          const delayToNext = isOffbeat ? beatMs * (currentSwing ? 0.66 : 0.5) : beatMs * (currentSwing ? 1.34 : 0.5);

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
      progQueuedChordIdxRef.current = null;
      progTimeShiftRef.current = 0;

      const runNextMeasure = () => {
       try {
        // Tap-ahead diversion: if a measure is queued, redirect the measure we're ABOUT to
        // schedule to the queued one, so it plays right after the current (already-scheduled)
        // measure finishes — no mid-measure interruption. progTimeShiftRef is bumped so the
        // queued measure starts exactly where the linear-next one would have, keeping the
        // absolute-time clock continuous. Done before the end/loop check so a jump queued on
        // the final measure diverts instead of ending.
        if (progQueuedChordIdxRef.current !== null) {
          const seq = progSeqRef.current;
          const offsets = progMeasureOffsetsRef.current;
          const targetChordIdx = progQueuedChordIdxRef.current;
          const from = progSeqIdxRef.current; // index the linear path is about to play
          // Next occurrence of the queued cell at/after the linear position, wrapping to the
          // start if needed (repeats can place one chord at several sequence positions).
          let target = -1;
          for (let i = from; i < seq.length; i++) { if (seq[i].chordIdx === targetChordIdx) { target = i; break; } }
          if (target === -1) { for (let i = 0; i < from && i < seq.length; i++) { if (seq[i].chordIdx === targetChordIdx) { target = i; break; } } }
          if (target !== -1 && target !== from) {
            const linearStart = from < offsets.length ? offsets[from] : progTotalDurationRef.current;
            progTimeShiftRef.current += linearStart - offsets[target];
            progSeqIdxRef.current = target;
          }
          progQueuedChordIdxRef.current = null;
        }

        if (progSeqIdxRef.current >= progSeqRef.current.length) {
            if (progIsLoopingRef.current) { 
                progLoopOffsetRef.current += progTotalDurationRef.current;
                progSeqIdxRef.current = 0; 
            } else { 
                // Schedule onEnd so the final chord ring-out isn't cut short. Must include
                // progTimeShiftRef — after a tap-ahead jump the real timeline is shifted, so
                // omitting it fired onEnd at the wrong time (late on a forward jump, leaving the
                // UI stuck in playback mode after the audio had already stopped).
                const onEndTargetMs = progBaseTimeRef.current + progLoopOffsetRef.current + progTimeShiftRef.current + progTotalDurationRef.current + 250;
                const onEndDelay = Math.max(0, onEndTargetMs - Date.now());
                progSchedulerRef.current = setTimeout(onEnd, onEndDelay);
                return;
            }
        }

        const measure = progSeqRef.current[progSeqIdxRef.current];
        const currentIdx = progSeqIdxRef.current;
        const currentChordIdx = measure.chordIdx;

        // Wall-clock start of this measure's audio, derived from the absolute JS timeline.
        // progTimeShiftRef folds in any tap-ahead jumps so the clock stays continuous.
        const measureStartMs = progBaseTimeRef.current + progLoopOffsetRef.current + progTimeShiftRef.current + progMeasureOffsetsRef.current[currentIdx];

        // Schedule the visual highlight from the JS side using measureStartMs directly.
        // This avoids the WebView bridge round-trip (30–80 ms) that previously made the
        // border update arrive late. We know the wall-clock target here in JS already —
        // no need to wait for MEASURE_DOWNBEAT to bounce back through the bridge.
        // RENDER_LEAD_MS compensates for setState → reconcile → native commit → GPU paint.
        // The highlight fires this many ms BEFORE the measure's audio downbeat so the paint
        // lands on the beat. Bumped 150 → 230: at 150 the highlight still arrived a touch
        // late on device (paint pipeline > 150 ms), so we lead a little harder to sit on time.
        const RENDER_LEAD_MS = 230;
        const highlightDelay = Math.max(0, measureStartMs - Date.now() - RENDER_LEAD_MS);
        const highlightTid = setTimeout(() => {
          timersRef.current = timersRef.current.filter(t => t !== highlightTid);
          progOnChordChangeRef.current?.(currentIdx, currentChordIdx);
        }, highlightDelay);
        timersRef.current.push(highlightTid);

        const instrument = measure.guitar ? 'guitar' : 'piano';
        const vol = Math.min(1.5, (measure.volume / 100) * 1.5);
        const beatSecs = 60 / measure.bpm; 
        const measureMs = beatSecs * 1000 * measure.beats;
        
        const isSplit = measure.beats === 2;

        let cumulativeBeats = 0;
        for (let i = 0; i < currentIdx; i++) {
            cumulativeBeats += progSeqRef.current[i].beats;
        }
        // Which half of a split pair is this? Pair splits by their ORDER in the run of consecutive
        // beats:2 measures (1st = left/first-half, 2nd = right/second-half, repeating), rather than
        // by cumulativeBeats % 4. The latter mislabels the halves when the split isn't bar-aligned
        // — which swapped the per-half rhythm patterns (e.g. reggae's 2nd chord got the 1st-half
        // two-hit skank instead of its single quarter-note hit). Spacers are absent from the
        // sequence, so consecutive splits here are genuinely adjacent.
        let splitRunPos = 0;
        if (isSplit) {
            for (let i = currentIdx; i >= 0 && progSeqRef.current[i].beats === 2; i--) splitRunPos++;
        }
        const isSecondHalf = isSplit && (splitRunPos % 2 === 0);

        const events: any[] = [];
        let hasCustomScheduling = false;
        let chordStrikesSecs: number[] = [0];

        // Center the strum on the beat: shift the whole stagger back by half its span so
        // the middle string lands on the downbeat instead of the first string. Without this,
        // the perceived attack (last string) arrives ~60ms late, which sounds behind the click.
        const strumStepSecs = 0.004;
        const strumPrerollSecs = measure.guitar ? (measure.midiNotes.length - 1) * strumStepSecs : 0;

        // ── Humanization (comp chord strikes only; bass + click stay locked to the grid) ──
        // A gentle back-beat lift (2 & 4 a touch louder, off-beats lighter) plus small per-hit
        // velocity/timing variance so a looping comp breathes instead of sounding machine-stamped.
        // Amounts are deliberately conservative — feel, not chaos. Pass allowTimeJitter=false to
        // keep a downbeat tight against the bar line. Returns the adjusted volume + time (seconds).
        const humanizeStrike = (timeSecs: number, baseVol: number, allowTimeJitter = true) => {
            const beatPos = beatSecs > 0 ? timeSecs / beatSecs : 0;
            const frac = beatPos - Math.floor(beatPos);
            const onBeat = frac < 0.12 || frac > 0.88;
            const nearestBeat = Math.round(beatPos);
            const accent = onBeat ? (nearestBeat % 2 === 1 ? 1.08 : 0.96) : 0.9; // 2&4 lift, off-beats lighter
            const vel = accent * (1 + (Math.random() - 0.5) * 0.14);             // ±7% velocity
            const vol = Math.max(0, Math.min(1.5, baseVol * vel));
            const tj = allowTimeJitter ? (Math.random() - 0.5) * 0.020 : 0;      // ±10 ms
            return { vol, t: Math.max(0, timeSecs + tj) };
        };

        // Swing comp patterns over a 4-beat bar in TRIPLET slots (12 = 4 beats × 3). Each entry is the
        // slots where the chord is struck (two-chord patterns + one busier three-hit). Swing rotates
        // through these per bar for life; Charleston is locked to the first one.
        const SWING_TRIPLET_PATTERNS = [
            [0, 5], [2, 6], [2, 8], [0, 8], [3, 8], [5, 9], [3, 5, 8], [2, 5],
        ];
        // Convert a triplet pattern → strike times (seconds). For a split (2-beat half-bar) the engine
        // sees each half separately: the 1st half plays the pattern's first hit, the 2nd half its last
        // hit, each mapped into its own 0-2 beat window — so chord 1 lands on the 1st hit, chord 2 on
        // the 2nd, per the rule that a split's two hits voice its two chords.
        const tripletStrikes = (pat: number[]): number[] => {
            if (!isSplit) return pat.map(s => (s / 3) * beatSecs);
            const slot = isSecondHalf ? Math.max(0, pat[pat.length - 1] - 6) : pat[0];
            return [Math.min(5, slot) / 3 * beatSecs];
        };

        // Arpeggio mode fills the bar with eighth notes that cycle through the chord/
        // shape notes (a 5-note chord in 4/4 → notes 1 2 3 4 5 1 2 3). The eighth-note
        // count tracks the time signature (beats × 2): 8 per 4-beat bar, 6 per 3, 4 per
        // a 2-beat split. Notes roll low→high, echoing the play screen's hold-arp feel.
        const isArpMeasure = measure.arp && measure.midiNotes.some(n => n != null && !isNaN(n));
        if (isArpMeasure) {
            // Dedupe exact pitches (a CAGED box doubles some notes across adjacent strings);
            // a repeated unison would stutter the otherwise-even arp. Octaves are kept.
            const arpNotes = Array.from(new Set(measure.midiNotes.filter(n => n != null && !isNaN(n)))).sort((a, b) => a - b);
            const slots = measure.beats * 2;              // eighth notes per measure
            const arpReleaseMs = 140;                     // gentle crossfade tail
            const SWING_FEELS = ['swing', 'charleston', 'swingsparse', 'reggae'];
            const useSwing = measure.arpSwing || SWING_FEELS.includes(measure.rhythm);

            // Pre-compute each slot's time offset so we can derive per-note hold duration.
            const slotOffsets: number[] = [];
            for (let i = 0; i < slots; i++) {
                const beatIndex = Math.floor(i / 2);
                const isOffbeat = i % 2 === 1;
                slotOffsets.push(beatIndex * beatSecs + (isOffbeat ? beatSecs * (useSwing ? 0.66 : 0.5) : 0));
            }

            for (let i = 0; i < slots; i++) {
                const midi = arpNotes[i % arpNotes.length];
                // Hold until the next note's attack so the release crossfades smoothly into it.
                // With swing the off-beat slot is only 0.34× a beat — using a fixed half-beat
                // slotMs left those notes still at full volume when the next attack landed.
                const nextOffsetSecs = i + 1 < slots ? slotOffsets[i + 1] : beatSecs * measure.beats;
                const slotMs = (nextOffsetSecs - slotOffsets[i]) * 1000;
                events.push({ instrument, midi, volume: vol, timeOffset: slotOffsets[i], durationMs: slotMs + arpReleaseMs, releaseMs: arpReleaseMs });
            }
        } else
        switch (measure.rhythm) {
            case 'swing': {
                // Swing rotates through the triplet comp patterns (one per bar, deterministic so a
                // split's two halves agree) for variety. Strikes ring until the next hit (evenComp
                // below) so re-hits don't pile up into clicks. Falls through to the generic loop.
                const barIdx = Math.floor(cumulativeBeats / 4);
                const pat = SWING_TRIPLET_PATTERNS[(barIdx * 3) % SWING_TRIPLET_PATTERNS.length];
                chordStrikesSecs = tripletStrikes(pat);
                break;
            }
            case 'charleston': {
                // Charleston: the locked x....x...... pattern — beat 1 + the swung "and of 2".
                chordStrikesSecs = tripletStrikes([0, 5]);
                break;
            }
            case 'swingsparse': {
                // Sparse/open comp: beat 1 + the swung "and of 3" — lots of space.
                chordStrikesSecs = tripletStrikes([0, 8]);
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

            // Straight feel: re-struck chords must NOT pile up. Previously every strike sustained
            // to the end of the bar, so each beat stacked another ringing copy of the chord —
            // beat 4 had 4 overlapping copies and read as a loud accent (same for the 2nd hit of
            // each split half). In straight mode each strike now rings only until the NEXT strike,
            // fading out right as it lands, so every beat hits at the same level. The FINAL strike
            // rings to the end of the bar for a natural tail into the boundary crossfade. Other
            // rhythms keep their sustained ring-out (unchanged).
            // Straight + the swing comps ring each strike only until the NEXT strike (+ short tail),
            // not to the bar end. This stops a re-struck chord from stacking ringing copies of the
            // same notes — the pile-up that caused the clicks/pops on Charleston & Swing.
            const evenComp = (!measure.rhythm || ['straight', 'swing', 'charleston', 'swingsparse'].includes(measure.rhythm));
            const barEndSecs = beatSecs * measure.beats;
            chordStrikesSecs.forEach((strikeTime, si) => {
                const isLast = si === chordStrikesSecs.length - 1;
                let strikeDurMs: number, strikeReleaseMs: number;
                if (evenComp && !isLast) {
                    // Legato, but without the pile-up. The note sustains at FULL through its whole
                    // beat (so beats connect smoothly — not staccato), then releases over a tail
                    // that overlaps the next strike for a connected feel. The tail is capped at one
                    // beat so only CONSECUTIVE strikes overlap (~2 copies) instead of every strike
                    // ringing to the bar end and stacking 4-deep (which was the last-beat accent).
                    const gapMs = (chordStrikesSecs[si + 1] - strikeTime) * 1000;
                    const legatoTailMs = Math.min(400, gapMs);
                    strikeDurMs = gapMs + legatoTailMs;
                    strikeReleaseMs = legatoTailMs;
                } else {
                    strikeDurMs = (barEndSecs - strikeTime) * 1000 + 400;
                    strikeReleaseMs = 400;
                }
                const h = humanizeStrike(strikeTime, vol, si > 0); // keep the downbeat tight
                measure.midiNotes.forEach((midi, i) => {
                    const guitarStaggerSecs = measure.guitar ? i * strumStepSecs - strumPrerollSecs : 0;
                    events.push({ instrument, midi, volume: h.vol, timeOffset: Math.max(0, h.t + guitarStaggerSecs), durationMs: strikeDurMs, releaseMs: strikeReleaseMs });
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
        // When this measure's first chord strike is offset from the downbeat (backbeat rhythms like
        // two-step / reggae), tell the engine to hold the PREVIOUS chord until that strike so it
        // doesn't cut out a beat early and leave a gap. Measured from the chord events only (not
        // bass/metronome). 0 for straight (strikes on the downbeat) → crossfade at the bar line.
        const chordEvts = events.filter(e => e.instrument === instrument);
        const firstChordStrikeMs = chordEvts.length ? Math.max(0, Math.min(...chordEvts.map(e => e.timeOffset))) * 1000 : 0;
        sendSchedule(events, currentMeasureMs, undefined, firstChordStrikeMs);
        
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
       } catch (err) {
        // Self-heal: a transient error must NOT kill the whole progression. Log it, skip the bad
        // measure, and keep the chain alive so playback continues instead of silently freezing.
        console.warn('Progression: skipped a measure after an error, continuing playback.', err);
        progSeqIdxRef.current++;
        progSchedulerRef.current = setTimeout(runNextMeasure, 200);
       }
      };

      runNextMeasure();
    },

    stopProgression: stopAll,
    setProgressionLooping: (loop) => { progIsLoopingRef.current = loop; },
    queueProgressionJump: (chordIdx) => { progQueuedChordIdxRef.current = chordIdx; },
    updateProgressionNotes: (sequence) => {
      // Only valid when the structure is unchanged (same length + same per-position chordIdx),
      // which holds for a chord edit during playback. Patch note fields only; keep beats/bpm so
      // the precomputed offsets/clock stay valid. Atomic ref swap → safe between scheduler ticks.
      const cur = progSeqRef.current;
      if (!sequence || sequence.length !== cur.length) return;
      progSeqRef.current = cur.map((old, i) => {
        const fresh = sequence[i];
        if (!fresh || fresh.chordIdx !== old.chordIdx) return old;
        return { ...old, midiNotes: fresh.midiNotes, rootSemi: fresh.rootSemi, intervals: fresh.intervals, bassLine: fresh.bassLine, nextRoot: fresh.nextRoot };
      });
    }
  }));

return (
    <View style={{ width: 0, height: 0, opacity: 0 }}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        // Inject the HTML and the Assets simultaneously! (Stable, memoized source — never rebuilt,
        // so the WebView/audio engine is never reloaded out from under a playing progression.)
        source={engineSource}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}));
SoundfontPlayer.displayName = 'SoundfontPlayer';

export default SoundfontPlayer;