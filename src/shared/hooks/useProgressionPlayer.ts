import { useRef, useState, useEffect } from 'react';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { useProgressionStore } from '@features/progression/store/progressionStore';
import { useAudio } from '@shared/audio/AudioContext';
import { getChordNotes, getChordIntervals, getBassLineMidi, GUITAR_TUNING } from '@shared/theory/musicTheory';
import { ProgressionMeasure } from '@shared/audio/SoundfontPlayer';

export function useProgressionPlayer(selectedCell: number | null, diagramVoicings: any[] = []) {
  const { playChord: onPlay, stopAudio: onStop, playProgression, stopProgression, setProgressionLooping } = useAudio();
  const resetPulse = useChordStore((s: any) => s.resetPulse);

  const [playingIdx, setPlayingIdx]         = useState<number | null>(null);
  const [isPlayingSystem, setIsPlayingSystem] = useState<boolean>(false);
  const [isLooping, setIsLooping]           = useState<boolean>(false);

  const isLoopingRef  = useRef(false);
  const timers        = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isPlayingRef  = useRef(false);
  const prePlaybackChord = useRef<{ rootSemi: number; chordType: string } | null>(null);

  const diagramVoicingsRef = useRef(diagramVoicings);
  useEffect(() => { diagramVoicingsRef.current = diagramVoicings; }, [diagramVoicings]);

  // ── Loop toggle ─────────────────────────────────────────────────────────────
  const toggleLooping = () => {
    const next = !isLooping;
    setIsLooping(next);
    isLoopingRef.current = next;
    setProgressionLooping(next); // live update inside the scheduler — no restart needed
  };

  useEffect(() => {
    if (resetPulse > 0) {
      setIsLooping(false);
      isLoopingRef.current = false;
      setProgressionLooping(false);
    }
  }, [resetPulse]);

  // ── Stop ────────────────────────────────────────────────────────────────────
  const stopPlayback = (restoreChord = false) => {
    isPlayingRef.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlayingIdx(null);
    setIsPlayingSystem(false);
    onStop?.();
    stopProgression(); // halt the look-ahead scheduler immediately
    if (restoreChord && prePlaybackChord.current) {
      useChordStore.setState(prePlaybackChord.current);
      prePlaybackChord.current = null;
    }
  };

  useEffect(() => { return () => stopPlayback(true); }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Expand repeat marks into a flat, ordered list of progression indices.
  // Volta (1st/2nd ending) rules:
  //   - pass 1 through a repeat region: play volta:1 measures, skip volta:2 measures
  //   - pass 2 (after jumping back from repeatEnd): skip volta:1 measures, play volta:2 measures
  const unrollRepeats = (progression: any[]): number[] => {
    const result: number[] = [];
    const hasRepeated: Record<number, boolean> = {};
    // passCount tracks which pass we are on for each repeatEnd barline index
    const passCount: Record<number, number> = {};
    let i = 0;
    while (i < progression.length) {
      if (!progression[i]) { i++; continue; }

      // Determine which repeat region (if any) this chord belongs to, and what pass we're on
      const chord = progression[i];

      // Find the nearest enclosing repeatEnd to determine current pass for this position
      // We use the passCount of the nearest upcoming/enclosing repeatEnd
      let enclosingRepeatEndIdx: number | null = null;
      for (let j = i; j < progression.length; j++) {
        if (progression[j]?.repeatEnd) { enclosingRepeatEndIdx = j; break; }
      }
      const currentPass = enclosingRepeatEndIdx !== null ? (passCount[enclosingRepeatEndIdx] ?? 1) : 1;

      // Skip this chord if its volta doesn't match the current pass
      if (chord.volta === 1 && currentPass === 2) { i++; continue; }
      if (chord.volta === 2 && currentPass === 1) { i++; continue; }

      result.push(i);

      if (chord.repeatEnd && !hasRepeated[i]) {
        hasRepeated[i] = true;
        passCount[i] = 2; // next time through this repeatEnd it will be pass 2
        let startIdx = 0;
        for (let j = i; j >= 0; j--) {
          if (progression[j]?.repeatStart) { startIdx = j; break; }
        }
        i = startIdx; // jump back to repeat start
      } else {
        if (chord.repeatEnd) {
          hasRepeated[i] = false;
          passCount[i] = 1; // reset for any future loops (e.g. when the player loops the whole piece)
        }
        i++;
      }
    }
    return result;
  };

  // Resolve MIDI notes for one chord.
  // Priority: displayed diagram voicing → theory fallback.
  // Handles all four voicing formats produced by the progression screen:
  //   guitar  — { frets: (number|string|{fret})[] }  (diagramVoicings)
  //   guitar  — { notes: {fret,stringIdx,...}[]    }  (diagramShapes - ScaleNote[])
  //   piano   — { notes: number[]                  }  (pianoVoicings / pianoShapes)
  const resolveMidiNotes = (chord: any, voicing: any, instrument: string, octave: number): number[] => {
    const GS = GUITAR_TUNING;
    const validMidi = (n: any): n is number => typeof n === 'number' && !isNaN(n) && n >= 0 && n <= 127;

    if (voicing) {
      // ── Guitar: frets format ── { frets: (number|string|{fret})[] }
      if (instrument === 'guitar' && voicing.frets && Array.isArray(voicing.frets)) {
        const midi = (voicing.frets as any[]).map((f: any, idx: number) => {
          if (idx >= 6 || f === null || f === undefined) return null;
          const fretVal = typeof f === 'object' ? f.fret : f;
          if (fretVal === null || fretVal === undefined) return null;
          if (typeof fretVal === 'string' && fretVal.toLowerCase() === 'x') return null;
          const parsed = parseInt(String(fretVal), 10);
          return isNaN(parsed) || parsed < 0 ? null : GS[idx] + parsed;
        }).filter(validMidi);
        if (midi.length > 0) return midi;
      }

      // ── Guitar shapes: notes format ── { notes: {fret,stringIdx,...}[] } (ScaleNote[])
      if (instrument === 'guitar' && voicing.notes && Array.isArray(voicing.notes)) {
        const midi = (voicing.notes as any[]).map((n: any) => {
          if (!n) return null;
          // Already-computed MIDI value
          if (typeof n === 'number' && validMidi(n)) return n;
          if (n.midi !== undefined) { const m = parseInt(String(n.midi), 10); return validMidi(m) ? m : null; }
          // ScaleNote format: { stringIdx, fret, role, formula, noteName, isChordTone }
          const fretVal = typeof n === 'object' ? n.fret : n;
          if (fretVal === null || fretVal === undefined) return null;
          if (typeof fretVal === 'string' && fretVal.toLowerCase() === 'x') return null;
          const parsed = parseInt(String(fretVal), 10);
          const strIdx = typeof n === 'object' && n.stringIdx !== undefined ? Number(n.stringIdx) : -1;
          if (isNaN(parsed) || parsed < 0 || strIdx < 0 || strIdx > 5) return null;
          const computed = GS[strIdx] + parsed;
          return validMidi(computed) ? computed : null;
        }).filter(validMidi);
        if (midi.length > 0) return midi;
      }

      // ── Piano: notes format ── { notes: number[] }
      if (instrument === 'piano' && voicing.notes && Array.isArray(voicing.notes)) {
        // Check if notes are numbers (pianoVoicings/pianoShapes) or objects (ScaleNote[])
        const firstNote = (voicing.notes as any[])[0];
        if (typeof firstNote === 'number') {
          const midi = (voicing.notes as any[]).filter(validMidi) as number[];
          if (midi.length > 0) return midi;
        } else if (typeof firstNote === 'object' && firstNote !== null) {
          // Handle ScaleNote[] format for piano shapes (though unlikely)
          const midi = (voicing.notes as any[]).map((n: any) => {
            if (!n) return null;
            if (n.midi !== undefined) { const m = parseInt(String(n.midi), 10); return validMidi(m) ? m : null; }
            return null;
          }).filter(validMidi);
          if (midi.length > 0) return midi;
        }
      }
    }

    // Fallback: generate notes from music theory
    return getChordNotes(chord.rootSemi, chord.chordType, octave);
  };

  // Build the full ordered sequence of ProgressionMeasure objects.
  // All computation (voicing resolution, repeat unrolling) happens once here,
  // before handing the sequence to the look-ahead scheduler.
  const buildSequence = (startChordIdx: number = 0): ProgressionMeasure[] => {
    const progressionStore = useProgressionStore.getState();
    const settingsStore    = useSettingsStore.getState();
    const { progression, rhythm } = progressionStore;
    const { bpm, octave, instrument, arp, arpSwing, bassEnabled, metronomeEnabled, voiceLeading,
            mixChordVol, mixBassVol, mixClickVol, mixHiCutFreq, mixHiCutGain } = settingsStore;

    const orderedIndices = unrollRepeats(progression);
    if (!orderedIndices.length) return [];

    // Slice from the first occurrence of startChordIdx in the unrolled list.
    // Fall back to 0 if not found (e.g. empty cell selected).
    const startPos = startChordIdx > 0 ? orderedIndices.indexOf(startChordIdx) : 0;
    const slicedIndices = startPos > 0 ? orderedIndices.slice(startPos) : orderedIndices;

    return slicedIndices.map((chordIdx, seqPos): ProgressionMeasure | null => {
      const chord   = progression[chordIdx];
      if (!chord) return null;
      const nextProgIdx  = seqPos + 1 < slicedIndices.length ? slicedIndices[seqPos + 1] : chordIdx;
      const nextRoot     = progression[nextProgIdx]?.rootSemi ?? chord.rootSemi;
      const beats        = chord.beats || 4;
      // Safely access voicing data with bounds checking
      const voicing = diagramVoicingsRef.current && chordIdx < diagramVoicingsRef.current.length 
        ? diagramVoicingsRef.current[chordIdx] 
        : undefined;
      const midiNotes    = resolveMidiNotes(chord, voicing, instrument, octave);

      return {
        chordIdx,
        midiNotes,
        beats,
        bpm,
        volume:           mixChordVol,
        guitar:           instrument === 'guitar',
        arp,
        arpSwing,
        rhythm,
        intervals:        getChordIntervals(chord.chordType),
        nextRoot,
        rootSemi:         chord.rootSemi,
        bassLine:         getBassLineMidi(chord.rootSemi, chord.chordType, nextRoot, beats),
        bassEnabled,
        metronomeEnabled,
        voiceLeading,
        resetBassState:   seqPos === 0, // bass state machine resets at the start of each pass
        bassVolume:       mixBassVol,
        clickVolume:      mixClickVol,
        hiCutFreq:        mixHiCutFreq,
        hiCutGain:        mixHiCutGain,
      } as ProgressionMeasure;
    }).filter((m): m is ProgressionMeasure => m !== null);
  };

  // ── Play ─────────────────────────────────────────────────────────────────────
  const handlePlayProgression = () => {
    stopPlayback();

    const progressionStore = useProgressionStore.getState();
    if (progressionStore.progression.length === 0) return;

    // Snapshot the chord that was active before playback so we can restore it
    const chordStore = useChordStore.getState();
    prePlaybackChord.current = { rootSemi: chordStore.rootSemi, chordType: chordStore.chordType };

    const sequence = buildSequence(selectedCell ?? 0);
    if (!sequence.length) return;

    isPlayingRef.current = true;
    setIsPlayingSystem(true);

    // Play the count-off measure. This also resets the audio clock baseline in
    // SoundfontPlayer (resetClock: true), so the scheduler's first tick lands
    // exactly after the count-off finishes.
    const firstChord = sequence[0];
    const settingsStore = useSettingsStore.getState();
    const bpm = settingsStore.bpm;
    const beatSecs = 60 / bpm;
    const countOffDurationMs = beatSecs * firstChord.beats * 1000;

    onPlay([], {
      isMeasure:   true,
      resetClock:  true,
      beats:       firstChord.beats,
      countOff:    true,
    });

    // Start the progression scheduler 100 ms before the count-off ends.
    // This matches the scheduler's internal early-fire pattern so the first
    // chord is already queued and lands seamlessly right as the last click
    // finishes, with no perceptible gap.
    timers.current.push(setTimeout(() => {
      // Hand the entire pre-computed sequence to the player's internal look-ahead
      // scheduler. From this point the JS thread is out of the timing loop —
      // the Web Audio clock drives everything.
      playProgression(
        sequence,
        (_seqIdx, chordIdx) => {
          // This callback is fired by an audio-clock-synchronised setTimeout inside
          // SoundfontPlayer — accurate to within a few ms regardless of JS load.
          setPlayingIdx(chordIdx);
          const chord = useProgressionStore.getState().progression[chordIdx];
          if (chord) useChordStore.setState({ rootSemi: chord.rootSemi, chordType: chord.chordType });
        },
        () => stopPlayback(true),
        isLoopingRef.current,
      );
    }, Math.max(0, countOffDurationMs - 100)));
  };

  return {
    playingIdx,
    isPlayingSystem,
    isLooping,
    toggleLooping,
    handlePlayProgression,
    stopPlayback,
  };
}
