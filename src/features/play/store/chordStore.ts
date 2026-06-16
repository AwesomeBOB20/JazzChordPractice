import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHORD_CATEGORIES, getRandomChord } from '@shared/theory/musicTheory';
import { isChordTypeFree } from '@features/pro/proConstants';
import { useSettingsStore } from '@features/settings/store/settingsStore';

// The chord qualities a user may land on right now: every type when Pro, only the
// free essentials otherwise. Used by random/cycle so a free user never gets stuck on
// a locked chord. (Selecting a locked type from the picker still routes to the paywall.)
const selectablesFor = (types: string[]) =>
  useSettingsStore.getState().isPro ? types : types.filter(isChordTypeFree);

// A one-shot "land on this exact voicing" instruction left by the Dictionary's chip→diagram flow.
// The Chord screen reads whichever fields apply to the current instrument/tab, applies them once,
// then clears it. Combos carry fingerprint (guitar grip) + pcKey (piano pitch-class set); scales
// carry scaleId + boxName; shapes carry scaleName (matched by name across the two shape models) +
// boxName. Everything optional — each matcher uses what it can.
export interface PendingVoicing {
  fingerprint?: string;      // guitar chord grip (exact group + voicing)
  pcKey?: string;            // piano: root-relative pitch-class set, e.g. "0,4,7,11"
  notes?: number[];          // piano: exact MIDI notes (distinguishes block inversions of one pc-set)
  scaleId?: string;          // scales: the scale id to select
  scaleName?: string;        // shapes: display name (e.g. "C Major Shape") matched across shape builders
  boxName?: string;          // scales/shapes/arps: the box to select
  arpSubsetIdx?: number;     // arps: which arp subset (1:1 with the dictionary's build order)
  intervalSemitone?: number; // intervals: select the interval subset whose pair spans this many semitones
}

export interface ChordState {
  rootSemi: number;
  chordType: string;
  activeTypes: string[];
  selectedBoxName: string | null;
  selectedScaleId: string | null;
  selectedArpSubsetIdx: number;
  resetPulse: number;
  namingMode: 'sharp' | 'flat';
  inputMode: 'random' | 'manual';
  // One-shot: when the Dictionary "Comp/Solo with" chip navigates to a chord, it stashes the voicing
  // tab it was browsing here; the Chord screen reads it once, applies it, then clears it. Transient
  // (not persisted).
  pendingVoicingTab: string | null;
  // Alongside the tab: the exact voicing the Dictionary diagram was on (see PendingVoicing). The
  // Chord screen selects the matching grip/box once, then clears it.
  pendingVoicing: PendingVoicing | null;

  setNamingMode: (mode: 'sharp' | 'flat') => void;
  setPendingVoicingTab: (tab: string | null) => void;
  setPendingVoicing: (v: PendingVoicing | null) => void;
  setInputMode: (mode: 'random' | 'manual') => void;
  setChord: (rootSemi: number, type: string) => void;
  randomChord: (preferredTypes?: string[]) => void;
  shiftRoot: (direction: 'up' | 'down') => void;
  cycleType: (direction: 'next' | 'prev') => void;
  toggleType: (type: string) => void;
  setActiveTypes: (types: string[]) => void;
  setSelectedBoxName: (box: string | null) => void;
  setSelectedScaleId: (id: string | null) => void;
  setSelectedArpSubsetIdx: (idx: number) => void;
  resetChordState: () => void;
}

export const useChordStore = create<ChordState>()(
  persist(
    (set, get) => ({
      rootSemi: 0,
      chordType: 'maj',
      activeTypes: CHORD_CATEGORIES.flatMap((c: { label: string, keys: string[] }) => c.keys),
      selectedBoxName: null,
      selectedScaleId: null,
      selectedArpSubsetIdx: 0,
      resetPulse: 0,
      namingMode: 'sharp',
      inputMode: 'random',
      pendingVoicingTab: null,
      pendingVoicing: null,

      setNamingMode: (namingMode) => set({ namingMode }),
      setPendingVoicingTab: (pendingVoicingTab) => set({ pendingVoicingTab }),
      setPendingVoicing: (pendingVoicing) => set({ pendingVoicing }),
      setInputMode: (inputMode) => set({ inputMode }),

      setChord: (rootSemi, chordType) => set({ 
        rootSemi, 
        chordType,
        namingMode: [0, 1, 3, 5, 8, 10].includes(rootSemi) ? 'flat' : 'sharp'
      }),

      shiftRoot: (direction) => set((state) => {
        const delta = direction === 'up' ? 1 : -1;
        return { 
          rootSemi: (state.rootSemi + delta + 12) % 12,
          namingMode: direction === 'up' ? 'sharp' : 'flat'
        };
      }),

      randomChord: (preferredTypes?: string[]) => {
        const { activeTypes } = get();
        let pool = activeTypes;
        if (preferredTypes && preferredTypes.length > 0) {
          const intersection = activeTypes.filter(t => preferredTypes.includes(t));
          if (intersection.length > 0) pool = intersection;
        }
        // Free users only ever get the free essentials; fall back to them if the active
        // pool happens to be all-locked.
        const free = selectablesFor(pool);
        pool = free.length > 0 ? free : selectablesFor(CHORD_CATEGORIES.flatMap((c) => c.keys));
        const { type, rootSemi } = getRandomChord(pool);
        const namingMode = [0, 1, 3, 5, 8, 10].includes(rootSemi) ? 'flat' : 'sharp';
        set({ chordType: type, rootSemi, namingMode });
      },

      cycleType: (direction) => set((state) => {
        // Cycle only through the qualities this user can actually open (free set when
        // not Pro), so the next/prev arrows never strand a free user on a locked chord.
        const allTypes = selectablesFor(CHORD_CATEGORIES.flatMap((c) => c.keys));
        const idx = allTypes.indexOf(state.chordType);
        const delta = direction === 'next' ? 1 : -1;
        // If the current chord isn't in the list (e.g. a locked one persisted), idx = -1;
        // start from the first free type so 'next' lands on a valid one.
        const nextIdx = idx === -1
          ? (direction === 'next' ? 0 : allTypes.length - 1)
          : (idx + delta + allTypes.length) % allTypes.length;
        return { chordType: allTypes[nextIdx] };
      }),

      toggleType: (type) => set((state) => {
        const next = new Set(state.activeTypes);
        if (next.has(type)) { if (next.size > 1) next.delete(type); }
        else next.add(type);
        return { activeTypes: Array.from(next) };
      }),

      setActiveTypes: (activeTypes) => set({ activeTypes }),
      setSelectedBoxName: (selectedBoxName) => set({ selectedBoxName }),
      setSelectedScaleId: (selectedScaleId) => set({ selectedScaleId }),
      setSelectedArpSubsetIdx: (selectedArpSubsetIdx) => set({ selectedArpSubsetIdx }),

      resetChordState: () => set((state) => ({
        resetPulse: state.resetPulse + 1,
        rootSemi: 0,
        chordType: 'maj',
        activeTypes: CHORD_CATEGORIES.flatMap((c: { label: string, keys: string[] }) => c.keys),
        namingMode: 'sharp',
        inputMode: 'random',
        selectedBoxName: null,
        selectedScaleId: null,
        selectedArpSubsetIdx: 0,
      })),
    }),
    {
      name: 'jazz-chord-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        namingMode: state.namingMode,
        activeTypes: state.activeTypes,
        inputMode: state.inputMode,
        selectedBoxName: state.selectedBoxName,
        selectedScaleId: state.selectedScaleId,
        selectedArpSubsetIdx: state.selectedArpSubsetIdx,
      }),
    }
  )
);
