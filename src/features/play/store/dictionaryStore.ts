import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Explore "Dictionary" mode (version 2) ──────────────────────────────────
// An ISOLATED slice alongside chordStore. The chord-based Explore screen (v1)
// reads chordStore exactly as before and is never touched here. This store holds
// only the dictionary's browse state: which Explore mode is shown, the selected
// voicing-family category, and the root the grid is keyed to. The dictionary's
// instrument comes from the GLOBAL header (settingsStore), so it lives there.

// Category === one of the existing PlayScreen voicing-family tabs.
export type DictionaryCategory =
  | 'block' | 'open' | 'barre' | 'triads' | 'shells'
  | 'drop2' | 'drop3' | 'drop2and4' | 'intervals' | 'arps' | 'shapes' | 'scales';

export type ExploreMode = 'chord' | 'dictionary';

export interface DictionaryState {
  mode: ExploreMode;
  category: DictionaryCategory;
  rootSemi: number;
  allRoots: boolean; // guitar-only "All roots" view (dedup distinct shapes across all 12 roots)
  cols: number; // diagrams per row in the grid (1 | 2 | 3)
  // MORPH view (guitar, triads/shells/drop families only): when a string-set key is selected, the grid
  // flips from "browse qualities" to "compare every quality on THIS string set, grouped by inversion,
  // in voice-leading (morph) order". null = off = normal browse. The key is one of STRING_SETS_BY_TYPE
  // for the current category; cleared automatically when it isn't valid for the active category.
  stringSet: string | null;

  setMode: (mode: ExploreMode) => void;
  setCategory: (category: DictionaryCategory) => void;
  setRootSemi: (rootSemi: number) => void;
  setAllRoots: (allRoots: boolean) => void;
  setCols: (cols: number) => void;
  setStringSet: (stringSet: string | null) => void;
  reset: () => void;
}

const DICTIONARY_DEFAULTS = { mode: 'chord' as ExploreMode, category: 'triads' as DictionaryCategory, rootSemi: 0, allRoots: false, cols: 2, stringSet: null as string | null };

export const useDictionaryStore = create<DictionaryState>()(
  persist(
    (set) => ({
      ...DICTIONARY_DEFAULTS,

      setMode: (mode) => set({ mode }),
      setRootSemi: (rootSemi) => set({ rootSemi }),
      setAllRoots: (allRoots) => set({ allRoots }),
      setCols: (cols) => set({ cols }),
      setStringSet: (stringSet) => set({ stringSet }),
      // Switching the voicing family invalidates any selected string set (the sets differ per family),
      // so clear morph mode on category change.
      setCategory: (category) => set({ category, stringSet: null }),
      reset: () => set({ ...DICTIONARY_DEFAULTS }),
    }),
    {
      name: 'jazz-dictionary-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // `mode` is intentionally NOT persisted → the Explore screen always opens on the
      // Chord section, regardless of where you left it last session. The merge forces it
      // back to 'chord' on rehydrate so any stale persisted value can't override that.
      partialize: (state) => ({ category: state.category, rootSemi: state.rootSemi, allRoots: state.allRoots, cols: state.cols }),
      merge: (persisted, current) => ({ ...current, ...(persisted as object), mode: 'chord' as ExploreMode }),
    }
  )
);
