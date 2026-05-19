import React, { createContext, useContext, useRef, useCallback } from 'react';
import SoundfontPlayer, { SoundfontPlayerRef, ProgressionMeasure } from '@shared/audio/SoundfontPlayer';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { getChordNotes } from '@shared/theory/musicTheory';

export interface PlaybackOptions {
  guitar?: boolean;
  forceArp?: boolean;
  scale?: boolean;
  hold?: boolean;
  isMeasure?: boolean;
  resetClock?: boolean;
  beats?: number;
  rhythm?: string;
  intervals?: number[];
  nextRoot?: number;
  rootSemi?: number;
  bassLine?: number[];
  countOff?: boolean;
}

interface AudioContextType {
  playChord: (overrideNotes?: number[], options?: PlaybackOptions) => void;
  playSingleNote: (midi: number, volume: number, guitar?: boolean) => void;
  stopAudio: () => void;
  playTone: (midi: number, volume: number) => void;
  stopTone: () => void;
  playArpLoop: (midiNotes: number[], guitar?: boolean) => void;
  playProgression: (sequence: ProgressionMeasure[], onChordChange: (seqIdx: number, chordIdx: number) => void, onEnd: () => void, loop?: boolean) => void;
  stopProgression: () => void;
  setProgressionLooping: (loop: boolean) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const playerRef = useRef<SoundfontPlayerRef>(null);

  const playChord = useCallback((overrideNotes?: number[], options: PlaybackOptions = {}) => {
    const { guitar = false, forceArp, scale = false, hold = false, isMeasure = false, resetClock = false, beats = 4, rhythm = 'straight', intervals, nextRoot, rootSemi: optionRootSemi, bassLine, countOff = false } = options;
    const { octave, bpm, arp, arpSwing, bassEnabled, metronomeEnabled, voiceLeading, referenceFrequency, mixClickVol } = useSettingsStore.getState();
    const { rootSemi: storeRootSemi, chordType } = useChordStore.getState();
    const volume = 80;
    const rootSemi = optionRootSemi ?? storeRootSemi;
    const notes = overrideNotes ?? getChordNotes(rootSemi, chordType, octave);
    if (!notes.length && !countOff) return;
    
    // Bypass the player's internal voice leading if explicit notes are provided to match UI diagrams
    const finalVoiceLeading = overrideNotes ? false : voiceLeading;
    
    if (isMeasure) {
      playerRef.current?.playMeasure(notes, { bpm, volume, guitar, arp: forceArp ?? arp, resetClock, bassEnabled, metronomeEnabled, arpSwing, beats, rhythm, voiceLeading: finalVoiceLeading, intervals, nextRoot, rootSemi, refFreq: referenceFrequency, bassLine, countOff, clickVolume: mixClickVol });
    } else {
      playerRef.current?.playNotes(notes, { arp: forceArp ?? arp, bpm, volume, guitar, scale, hold, arpSwing, refFreq: referenceFrequency });
    }
  }, []);

  const playSingleNote = useCallback((midi: number, volume: number, guitar?: boolean) => {
    playerRef.current?.playSingleNote(midi, volume, guitar ?? false);
  }, []);

  const stopAudio = useCallback(() => {
    playerRef.current?.stop();
  }, []);

  const playTone = useCallback((midi: number, volume: number) => {
    playerRef.current?.playTone(midi, volume);
  }, []);

  const stopTone = useCallback(() => {
    playerRef.current?.stopTone();
  }, []);

  const playArpLoop = useCallback((midiNotes: number[], guitar?: boolean) => {
    const { bpm, arpSwing } = useSettingsStore.getState();
    playerRef.current?.playArpLoop(midiNotes, bpm, 80, guitar ?? false, arpSwing);
  }, []);

  const playProgression = useCallback((
    sequence: ProgressionMeasure[],
    onChordChange: (seqIdx: number, chordIdx: number) => void,
    onEnd: () => void,
    loop = false,
  ) => {
    playerRef.current?.playProgression(sequence, onChordChange, onEnd, loop);
  }, []);

  const stopProgression = useCallback(() => {
    playerRef.current?.stopProgression();
  }, []);

  const setProgressionLooping = useCallback((loop: boolean) => {
    playerRef.current?.setProgressionLooping(loop);
  }, []);

  return (
    <AudioContext.Provider value={{ playChord, playSingleNote, stopAudio, playTone, stopTone, playArpLoop, playProgression, stopProgression, setProgressionLooping }}>
      <SoundfontPlayer ref={playerRef as any} />
      {children}
    </AudioContext.Provider>
  );
}

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAudio must be used within an AudioProvider');
  return context;
};