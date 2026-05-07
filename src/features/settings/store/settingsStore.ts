import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES } from '@shared/ui/themes';

const DEFAULT_BPM = 120;
const DEFAULT_PIANO_OCTAVE = 4;
const MIN_PIANO_OCTAVE = 1;
const MAX_PIANO_OCTAVE = 7;
const DEFAULT_GUITAR_OCTAVE = 1;
const MIN_GUITAR_OCTAVE = 1;
const MAX_GUITAR_OCTAVE = 2;

export interface SettingsState {
  // Settings State
  theme: keyof typeof THEMES;
  instrument: 'piano' | 'guitar';
  bpm: number;
  octave: number;
  arp: boolean;
  arpSwing: boolean;
  bassEnabled: boolean;
  metronomeEnabled: boolean;
  voiceLeading: boolean;
  fretCap: number;
  pianoZone: number;
  scaleOverlay: boolean;
  playMode: 'once' | 'hold';
  labelMode: 'degrees' | 'notes' | 'none';
  colorMode: 'roles' | 'theme' | 'selective';
  selectiveRoles: string[];
  sortMode: 'list' | 'voicings';
  pianoKeyWidth: number;
  referenceFrequency: number;
  isSettingsOpen: boolean;

  // Mixer
  mixChordVol:  number; // 0-100  chord instrument level         (default 80)
  mixBassVol:   number; // 0-100  bass level                     (default 70)
  mixClickVol:  number; // 0-100  metronome click level          (default 80)
  mixHiCutFreq: number; // 500-8000  highshelf start freq in Hz  (default 3500)
  mixHiCutGain: number; // -20 to 0  shelf cut in dB             (default -8)

  // Actions
  setTheme: (theme: keyof typeof THEMES) => void;
  setInstrument: (inst: 'piano' | 'guitar') => void;
  setBpm: (bpm: number) => void;
  setOctave: (oct: number) => void;
  setArp: (arp: boolean) => void;
  setArpSwing: (swing: boolean) => void;
  setBassEnabled: (enabled: boolean) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setVoiceLeading: (enabled: boolean) => void;
  setFretCap: (cap: number) => void;
  setPianoZone: (zone: number) => void;
  setScaleOverlay: (enabled: boolean) => void;
  setPlayMode: (mode: 'once' | 'hold') => void;
  setLabelMode: (mode: 'degrees' | 'notes' | 'none') => void;
  setColorMode: (mode: 'roles' | 'theme' | 'selective') => void;
  toggleSelectiveRole: (role: string) => void;
  setSelectiveRoles: (roles: string[]) => void;
  setSortMode: (mode: 'list' | 'voicings') => void;
  setPianoKeyWidth: (width: number) => void;
  setReferenceFrequency: (freq: number) => void;
  setIsSettingsOpen: (isOpen: boolean) => void;
  setMixChordVol:  (v: number) => void;
  setMixBassVol:   (v: number) => void;
  setMixClickVol:  (v: number) => void;
  setMixHiCutFreq: (v: number) => void;
  setMixHiCutGain: (v: number) => void;
  factoryReset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Initial State
      theme: 'light',
      instrument: 'piano',
      bpm: DEFAULT_BPM,
      octave: DEFAULT_PIANO_OCTAVE,
      arp: false,
      arpSwing: false,
      bassEnabled: false,
      metronomeEnabled: false,
      voiceLeading: true,
      fretCap: 5,
      pianoZone: 4,
      scaleOverlay: false,
      playMode: 'once',
      labelMode: 'notes',
      colorMode: 'roles',
      selectiveRoles: ['root', '3', '5', '7'],
      sortMode: 'list',
      pianoKeyWidth: 24,
      referenceFrequency: 440,
      isSettingsOpen: false,

      // Mixer defaults
      mixChordVol:  70,
      mixBassVol:   70,
      mixClickVol:  80,
      mixHiCutFreq: 3500,
      mixHiCutGain: -8,

      // Setters
      setTheme: (theme) => set({ theme }),
      setInstrument: (instrument) => set((state) => {
        if (state.instrument === instrument) return {};
        return { 
          instrument, 
          octave: instrument === 'guitar' ? DEFAULT_GUITAR_OCTAVE : DEFAULT_PIANO_OCTAVE 
        };
      }),
      setBpm: (bpm) => set({ bpm }),
      setOctave: (octave) => set((state) => {
        if (state.instrument === 'guitar') {
          return { octave: Math.max(MIN_GUITAR_OCTAVE, Math.min(MAX_GUITAR_OCTAVE, octave)) };
        }
        return { octave: Math.max(MIN_PIANO_OCTAVE, Math.min(MAX_PIANO_OCTAVE, octave)) };
      }),
      setArp: (arp) => set({ arp }),
      setArpSwing: (arpSwing) => set({ arpSwing }),
      setBassEnabled: (bassEnabled) => set({ bassEnabled }),
      setMetronomeEnabled: (metronomeEnabled) => set({ metronomeEnabled }),
      setVoiceLeading: (voiceLeading) => set({ voiceLeading }),
      setFretCap: (fretCap) => set({ fretCap }),
      setPianoZone: (pianoZone) => set({ pianoZone }),
      setScaleOverlay: (scaleOverlay) => set({ scaleOverlay }),
      setPlayMode: (playMode) => set({ playMode }),
      setLabelMode: (labelMode) => set({ labelMode }),
      setColorMode: (colorMode) => set({ colorMode }),
      toggleSelectiveRole: (role) => set((state) => ({
        selectiveRoles: state.selectiveRoles.includes(role)
          ? state.selectiveRoles.filter((r) => r !== role)
          : [...state.selectiveRoles, role]
      })),
      setSelectiveRoles: (selectiveRoles) => set({ selectiveRoles }),
      setSortMode: (sortMode) => set({ sortMode }),
      setPianoKeyWidth: (pianoKeyWidth) => set({ pianoKeyWidth }),
      setReferenceFrequency: (referenceFrequency) => set({ referenceFrequency }),
      setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
      setMixChordVol:  (mixChordVol)  => set({ mixChordVol }),
      setMixBassVol:   (mixBassVol)   => set({ mixBassVol }),
      setMixClickVol:  (mixClickVol)  => set({ mixClickVol }),
      setMixHiCutFreq: (mixHiCutFreq) => set({ mixHiCutFreq }),
      setMixHiCutGain: (mixHiCutGain) => set({ mixHiCutGain }),

      factoryReset: () => set({
        bpm: DEFAULT_BPM,
        octave: DEFAULT_PIANO_OCTAVE,
        arp: false,
        arpSwing: false,
        bassEnabled: false,
        metronomeEnabled: false,
        scaleOverlay: false,
        playMode: 'once',
        labelMode: 'notes',
        instrument: 'piano',
        sortMode: 'list',
        theme: 'light',
        selectiveRoles: ['root', '3', '5', '7'],
        pianoKeyWidth: 24,
      }),
    }),
    {
      name: 'jazz-settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        pianoKeyWidth: state.pianoKeyWidth,
        labelMode: state.labelMode,
        colorMode: state.colorMode,
        selectiveRoles: state.selectiveRoles,
        octave: state.octave,
        bpm: state.bpm,
        arp: state.arp,
        arpSwing: state.arpSwing,
        bassEnabled: state.bassEnabled,
        metronomeEnabled: state.metronomeEnabled,
        voiceLeading: state.voiceLeading,
        fretCap: state.fretCap,
        pianoZone: state.pianoZone,
        scaleOverlay: state.scaleOverlay,
        playMode: state.playMode,
        instrument: state.instrument,
        sortMode: state.sortMode,
        referenceFrequency: state.referenceFrequency,
        mixChordVol:  state.mixChordVol,
        mixBassVol:   state.mixBassVol,
        mixClickVol:  state.mixClickVol,
        mixHiCutFreq: state.mixHiCutFreq,
        mixHiCutGain: state.mixHiCutGain,
      }),
    }
  )
);
