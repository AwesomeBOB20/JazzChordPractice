import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHORD_CATEGORIES, getRandomChord } from '@shared/theory/musicTheory';

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

  setNamingMode: (mode: 'sharp' | 'flat') => void;
  setPendingVoicingTab: (tab: string | null) => void;
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

      setNamingMode: (namingMode) => set({ namingMode }),
      setPendingVoicingTab: (pendingVoicingTab) => set({ pendingVoicingTab }),
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
        const { type, rootSemi } = getRandomChord(pool);
        const namingMode = [0, 1, 3, 5, 8, 10].includes(rootSemi) ? 'flat' : 'sharp';
        set({ chordType: type, rootSemi, namingMode });
      },

      cycleType: (direction) => set((state) => {
        const allTypes = CHORD_CATEGORIES.flatMap((c) => c.keys);
        const idx = allTypes.indexOf(state.chordType);
        const delta = direction === 'next' ? 1 : -1;
        const nextIdx = (idx + delta + allTypes.length) % allTypes.length;
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
