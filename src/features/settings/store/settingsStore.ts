import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES } from '@shared/ui/themes';
import type { FontKey } from '@shared/fonts/fonts';
import type { ProFeature } from '@features/pro/proConstants';

const DEFAULT_BPM = 120;
const DEFAULT_PIANO_OCTAVE = 4;
// Floor at octave 2 (root = C2). The piano keyboard renders from C1 up (PianoView's OCTAVE_LIST
// starts at 2), and an octave-2 drop voicing bottoms out at exactly C1 — anything lower is both
// inaudible (<33 Hz) and would render off the left edge of the keyboard, so we don't allow it.
const MIN_PIANO_OCTAVE = 2;
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
  // Transient (NOT persisted): set by the Play/Quiz screens to force the header
  // arp toggle to show — and lock to — arpeggio mode while the current voicing
  // tab / quiz category can only arpeggiate (intervals/arps/shapes/scales). The
  // user's real `arp` preference is left untouched, so leaving the tab reverts.
  arpForced: boolean;
  bassEnabled: boolean;
  metronomeEnabled: boolean;
  voiceLeading: boolean;
  // Directional mode for the Song-screen guitar voice leading.
  // 'zone' = stay near the fret zone; 'up'/'down' = drift that way; 'bounce' = ping-pong.
  voiceLeadDir: 'zone' | 'up' | 'down' | 'bounce';
  // App-wide UI font. 'system' keeps the OS default; others are custom-loaded.
  fontFamily: FontKey;
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
  tunerTone: string; // selected tuner play-tone timbre (epiano / bell / musicbox / marimba / glass)
  isSettingsOpen: boolean;
  isTutorialOpen: boolean;
  octaveNumbering: boolean;
  isPro: boolean;
  // Which Pro feature triggered the paywall, or null when the paywall is closed.
  // Drives the global PaywallModal overlay (mounted once in App, like SettingsScreen).
  paywallFeature: ProFeature | null;

  // Mixer
  mixChordVol:  number; // 0-100  chord instrument level         (default 80)
  mixBassVol:   number; // 0-100  bass level                     (default 70)
  mixClickVol:  number; // 0-100  metronome click level          (default 80)

  // Actions
  setTheme: (theme: keyof typeof THEMES) => void;
  setInstrument: (inst: 'piano' | 'guitar') => void;
  setBpm: (bpm: number) => void;
  setOctave: (oct: number) => void;
  setArp: (arp: boolean) => void;
  setArpSwing: (swing: boolean) => void;
  setArpForced: (forced: boolean) => void;
  setBassEnabled: (enabled: boolean) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setVoiceLeading: (enabled: boolean) => void;
  setVoiceLeadDir: (dir: 'zone' | 'up' | 'down' | 'bounce') => void;
  setFontFamily: (f: FontKey) => void;
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
  setTunerTone: (tone: string) => void;
  setIsSettingsOpen: (isOpen: boolean) => void;
  setIsTutorialOpen: (isOpen: boolean) => void;
  setMixChordVol:  (v: number) => void;
  setMixBassVol:   (v: number) => void;
  setMixClickVol:  (v: number) => void;
  setOctaveNumbering: (enabled: boolean) => void;
  setIsPro: (isPro: boolean) => void;
  // Open the paywall, attributing it to the feature the user just hit. closePaywall() dismisses.
  openPaywall: (feature: ProFeature) => void;
  closePaywall: () => void;
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
      arpForced: false,
      bassEnabled: false,
      metronomeEnabled: false,
      voiceLeading: true,
      voiceLeadDir: 'zone',
      fontFamily: 'Inter',
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
      tunerTone: 'epiano',
      isSettingsOpen: false,
      isTutorialOpen: false,
      octaveNumbering: false,
      isPro: false,
      paywallFeature: null,

      // Mixer defaults
      mixChordVol:  70,
      mixBassVol:   100,
      mixClickVol:  21,

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
      setArpForced: (arpForced) => set({ arpForced }),
      setBassEnabled: (bassEnabled) => set({ bassEnabled }),
      setMetronomeEnabled: (metronomeEnabled) => set({ metronomeEnabled }),
      setVoiceLeading: (voiceLeading) => set({ voiceLeading }),
      setVoiceLeadDir: (voiceLeadDir) => set({ voiceLeadDir }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
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
      setTunerTone: (tunerTone) => set({ tunerTone }),
      setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
      setIsTutorialOpen: (isTutorialOpen) => set({ isTutorialOpen }),
      setMixChordVol:  (mixChordVol)  => set({ mixChordVol }),
      setMixBassVol:   (mixBassVol)   => set({ mixBassVol }),
      setMixClickVol:  (mixClickVol)  => set({ mixClickVol }),
      setOctaveNumbering: (octaveNumbering) => set({ octaveNumbering }),
      setIsPro: (isPro) => set({ isPro }),
      openPaywall: (paywallFeature) => set({ paywallFeature }),
      closePaywall: () => set({ paywallFeature: null }),

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
        octaveNumbering: false,
        fontFamily: 'Inter',
        // Previously missed by the reset — added so "Restore Defaults" is complete.
        arpForced: false,
        voiceLeading: true,
        voiceLeadDir: 'zone',
        fretCap: 5,
        pianoZone: 4,
        colorMode: 'roles',
        referenceFrequency: 440,
        tunerTone: 'epiano',
        mixChordVol: 70,
        mixBassVol: 100,
        mixClickVol: 21,
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
        voiceLeadDir: state.voiceLeadDir,
        fontFamily: state.fontFamily,
        fretCap: state.fretCap,
        pianoZone: state.pianoZone,
        scaleOverlay: state.scaleOverlay,
        playMode: state.playMode,
        instrument: state.instrument,
        sortMode: state.sortMode,
        referenceFrequency: state.referenceFrequency,
        tunerTone: state.tunerTone,
        mixChordVol:  state.mixChordVol,
        mixBassVol:   state.mixBassVol,
        mixClickVol:  state.mixClickVol,
        octaveNumbering: state.octaveNumbering,
        isPro: state.isPro,
      }),
      // Clamp a persisted octave into the current valid range on rehydrate. Without this, anyone
      // who'd saved piano octave 1 (before the floor moved to 2) would reload with low voicings
      // rendering off the trimmed keyboard's left edge until they nudged the octave control.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const merged = { ...current, ...p } as SettingsState;
        const isGuitar = merged.instrument === 'guitar';
        const min = isGuitar ? MIN_GUITAR_OCTAVE : MIN_PIANO_OCTAVE;
        const max = isGuitar ? MAX_GUITAR_OCTAVE : MAX_PIANO_OCTAVE;
        const def = isGuitar ? DEFAULT_GUITAR_OCTAVE : DEFAULT_PIANO_OCTAVE;
        merged.octave = Math.max(min, Math.min(max, merged.octave ?? def));
        // isPro now comes straight from persisted state (default false). The blanket
        // dev override was removed when the paywall shipped — use the "Unlock for testing"
        // toggle in Settings (devSetPro) to exercise Pro until RevenueCat is live.
        // The paywall is a transient UI overlay, never persisted.
        merged.paywallFeature = null;
        return merged;
      },
    }
  )
);
