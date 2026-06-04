import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getChordIntervals } from '@shared/theory/musicTheory';
import { ProgressionChord, SavedSong } from '@shared/types/models'; // We will create this type file next!
import { useSettingsStore } from '@features/settings/store/settingsStore';

export interface ProgressionState {
  progression: (ProgressionChord | null)[];
  rhythm: string;
  guitarNeckZone: number | null;
  savedSongs: SavedSong[];
  categories: string[];

  setProgressionChord: (index: number, rootSemi: number, chordType: string, instrument?: 'piano' | 'guitar', arp?: boolean) => void;
  setGuitarNeckZone: (zone: number | null) => void;
  removeProgressionChord: (index: number) => void;
  clearProgression: () => void;
  addMeasure: (insertAfterIndex?: number | null) => void;
  removeMeasure: (selectedIndex?: number | null) => void;
  toggleRepeatStart: (index: number) => void;
  toggleRepeatEnd: (index: number) => void;
  setVolta: (index: number, volta: 1 | 2 | undefined) => void;
  toggleSection: (index: number) => void;
  transposeProgression: (semitones: number) => void;
  setChordBeats: (index: number, beats: 2 | 3 | 4) => void;
  insertBlanks: (beforeIdx: number, count: number) => void;
  setRhythm: (rhythm: string) => void;

  saveSong: (name: string, bpm: number) => void;
  loadSong: (id: string) => void;
  deleteSong: (id: string) => void;
  importSongs: (songs: SavedSong[]) => void;
  addCategory: (name: string) => void;
  setSongCategory: (id: string, category: string) => void;
}

// Built-in library categories. Always present (merged in on rehydrate); users can add more.
export const DEFAULT_CATEGORIES = ['Exercises', 'Songs'];

// A "spacer" is indent padding: it occupies a grid cell to push the measures after it
// onto the next row, but it is NOT a measure. It renders as empty background (no border,
// number, or dash) and is skipped by playback/voicing. This is deliberately distinct from
// a `null` cell, which is a real but empty measure (shown with a dash and a measure number).
export const makeSpacer = (): ProgressionChord => ({ rootSemi: 0, chordType: 'maj', namingMode: 'flat', spacer: true });
export const isSpacer = (c: ProgressionChord | null | undefined): boolean => !!c && c.spacer === true;

const buildMajorCircle = (): (ProgressionChord | null)[] => {
  const res: (ProgressionChord | null)[] = [];
  const circle = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7];
  circle.forEach(root => {
    const ii = (root + 2) % 12;
    const v = (root + 7) % 12;
    const mode = [0, 5, 10, 3, 8, 1].includes(root) ? 'flat' : 'sharp';
    res.push({ rootSemi: ii, chordType: 'min7', namingMode: mode, beats: 4 });
    res.push({ rootSemi: v, chordType: 'dom7', namingMode: mode, beats: 4 });
    res.push({ rootSemi: root, chordType: 'maj7', namingMode: mode, beats: 4 });
    res.push({ rootSemi: root, chordType: 'maj6', namingMode: mode, beats: 4 }); // 4th bar of each line → 6th chord
  });
  return res;
};

const buildMinorCircle = (): (ProgressionChord | null)[] => {
  const res: (ProgressionChord | null)[] = [];
  const circle = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7];
  circle.forEach(root => {
    const ii = (root + 2) % 12;
    const v = (root + 7) % 12;
    const mode = [0, 5, 10, 3, 8, 1].includes(root) ? 'flat' : 'sharp';
    res.push({ rootSemi: ii, chordType: 'hdim7', namingMode: mode, beats: 4 });
    res.push({ rootSemi: v, chordType: 'dom7b9', namingMode: mode, beats: 4 });
    res.push({ rootSemi: root, chordType: 'min7', namingMode: mode, beats: 4 });
    res.push({ rootSemi: root, chordType: 'min7', namingMode: mode, beats: 4 });
  });
  return res;
};

export const DEFAULT_SONGS: SavedSong[] = [
  { id: 'default-ii-v-i', name: 'Major ii-V-I (All Keys)', bpm: 120, rhythm: 'straight', category: 'Exercises', progression: buildMajorCircle() },
  { id: 'minor-ii-v-i', name: 'Minor ii-V-i (All Keys)', bpm: 120, rhythm: 'straight', category: 'Exercises', progression: buildMinorCircle() },
  { id: 'autumn-leaves', name: 'Autumn Leaves', bpm: 110, rhythm: 'straight', progression: [
    // [ Am7 D7 Gmaj7 Cmaj7 | F#m7b5 B7 Em7 E7 ]
    { rootSemi: 9, chordType: 'min7', namingMode: 'flat', beats: 4, repeatStart: true, section: true },
    { rootSemi: 2, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'maj7', namingMode: 'flat', beats: 4 },
    { rootSemi: 0, chordType: 'maj7', namingMode: 'flat', beats: 4 },
    { rootSemi: 6, chordType: 'hdim7', namingMode: 'sharp', beats: 4 },
    { rootSemi: 11, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'dom7', namingMode: 'flat', beats: 4, repeatEnd: true },

    // F#m7b5 B7b9 Em7 Em7
    { rootSemi: 6, chordType: 'hdim7', namingMode: 'sharp', beats: 4 },
    { rootSemi: 11, chordType: 'dom7b9', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'min7', namingMode: 'flat', beats: 4 },

    // Am7 D7 Gmaj7 Gmaj7
    { rootSemi: 9, chordType: 'min7', namingMode: 'flat', beats: 4, section: true },
    { rootSemi: 2, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'maj7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'maj7', namingMode: 'flat', beats: 4 },

    // F#m7b5 B7b9 (Em7 A7) (Dm7 G7)
    { rootSemi: 6, chordType: 'hdim7', namingMode: 'sharp', beats: 4 },
    { rootSemi: 11, chordType: 'dom7b9', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'min7', namingMode: 'flat', beats: 2 }, // Em7 (Split measure)
    { rootSemi: 9, chordType: 'dom7', namingMode: 'flat', beats: 2 }, // A7
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 2 }, // Dm7 (Split measure)
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 2 }, // G7

    // F#m7b5 B7b9 Em7 E7
    { rootSemi: 6, chordType: 'hdim7', namingMode: 'sharp', beats: 4 },
    { rootSemi: 11, chordType: 'dom7b9', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'dom7', namingMode: 'flat', beats: 4 },
  ]},
  { id: 'blue-bossa', name: 'Blue Bossa', bpm: 140, rhythm: 'straight', progression: [
    // [ Cm7 Cm7 Fm7 Bb7
    { rootSemi: 0, chordType: 'min7', namingMode: 'flat', beats: 4, repeatStart: true },
    { rootSemi: 0, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 5, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 10, chordType: 'dom7', namingMode: 'flat', beats: 4 },

    // Dm7b5 G7#5#9 Cm7 Cm7
    { rootSemi: 2, chordType: 'hdim7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7s5s9', namingMode: 'sharp', beats: 4 },
    { rootSemi: 0, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 0, chordType: 'min7', namingMode: 'flat', beats: 4 },

    // Ebm7 Ab7 Dbmaj7 Dbmaj7
    { rootSemi: 3, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 8, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 1, chordType: 'maj7', namingMode: 'flat', beats: 4 },
    { rootSemi: 1, chordType: 'maj7', namingMode: 'flat', beats: 4 },

    // Dm7b5 G7#5 Cm7 [Dm7b5 G7#5] ]
    { rootSemi: 2, chordType: 'hdim7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7s5', namingMode: 'sharp', beats: 4 },
    { rootSemi: 0, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'hdim7', namingMode: 'flat', beats: 2 }, // Split measure
    { rootSemi: 7, chordType: 'dom7s5', namingMode: 'sharp', beats: 2, repeatEnd: true },

    // Cm7 A7#9 Dm7b5 G7#5
    { rootSemi: 0, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 9, chordType: 'dom7s9', namingMode: 'sharp', beats: 4 },
    { rootSemi: 2, chordType: 'hdim7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7s5', namingMode: 'sharp', beats: 4 },

    // Cm7 A7#9 Dm7b5 G7#5
    { rootSemi: 0, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 9, chordType: 'dom7s9', namingMode: 'sharp', beats: 4 },
    { rootSemi: 2, chordType: 'hdim7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7s5', namingMode: 'sharp', beats: 4 },
  ]},
  { id: 'take-the-a-train', name: 'Take the A Train', bpm: 160, rhythm: 'straight', progression: [
    // [ C6 C6 D7b5 D7b5
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4, repeatStart: true },
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'dom7b5', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'dom7b5', namingMode: 'flat', beats: 4 },

    // Dm7 G7 C6 | [1st] (Dm7 G7) ]
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 2, volta: 1 },
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 2, repeatEnd: true },

    // [2nd] (Gm7 C7) — blank cells indent the Fmaj7 section to the next row
    { rootSemi: 7, chordType: 'min7', namingMode: 'flat', beats: 2, volta: 2 },
    { rootSemi: 0, chordType: 'dom7', namingMode: 'flat', beats: 2 },
    makeSpacer(), makeSpacer(), makeSpacer(),

    // Fmaj7 Fmaj7 Fmaj7 Fmaj7
    { rootSemi: 5, chordType: 'maj7', namingMode: 'flat', beats: 4 },
    { rootSemi: 5, chordType: 'maj7', namingMode: 'flat', beats: 4 },
    { rootSemi: 5, chordType: 'maj7', namingMode: 'flat', beats: 4 },
    { rootSemi: 5, chordType: 'maj7', namingMode: 'flat', beats: 4 },

    // D7 D7 Dm7 (G7 G7b9)
    { rootSemi: 2, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 2 },
    { rootSemi: 7, chordType: 'dom7b9', namingMode: 'flat', beats: 2 },

    // C6 C6 D7b5 D7b5
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4 },
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'dom7b5', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'dom7b5', namingMode: 'flat', beats: 4 },

    // Dm7 G7 C6 (Dm7 G7)
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 2 },
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 2 },
  ]},
  { id: 'all-of-me', name: 'All of Me', bpm: 120, rhythm: 'straight', progression: [
    // C6 C6 E7 E7
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4, section: true },
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    // A7 A7 Dm7 Dm7
    { rootSemi: 9, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 9, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    // E7 E7 Am7 Am7
    { rootSemi: 4, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 9, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 9, chordType: 'min7', namingMode: 'flat', beats: 4 },
    // D7 D7 Dm7 G7
    { rootSemi: 2, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    // C6 C6 E7 E7
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4, section: true },
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 4, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    // A7 A7 Dm7 Dm7
    { rootSemi: 9, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 9, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    // F6 Fm6 (Cmaj7 Ebm7b5) A7
    { rootSemi: 5, chordType: 'maj6', namingMode: 'flat', beats: 4 },
    { rootSemi: 5, chordType: 'min6', namingMode: 'flat', beats: 4 },
    { rootSemi: 0, chordType: 'maj7', namingMode: 'flat', beats: 2 },
    { rootSemi: 3, chordType: 'hdim7', namingMode: 'flat', beats: 2 },
    { rootSemi: 9, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    // Dm7 G7 (C6 Ebfullydim7) (Dm7 G7)
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 4 },
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 0, chordType: 'maj6', namingMode: 'flat', beats: 2 },
    { rootSemi: 3, chordType: 'fdim7', namingMode: 'flat', beats: 2 },
    { rootSemi: 2, chordType: 'min7', namingMode: 'flat', beats: 2 },
    { rootSemi: 7, chordType: 'dom7', namingMode: 'flat', beats: 2 },
  ]},
  { id: 'blue-monk', name: 'Blue Monk', bpm: 120, rhythm: 'swing', progression: [
    // Bb7 Eb7 Bb7 (Fm7 Bb7)
    { rootSemi: 10, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 3, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 10, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 5, chordType: 'min7', namingMode: 'flat', beats: 2 },
    { rootSemi: 10, chordType: 'dom7', namingMode: 'flat', beats: 2 },
    // Eb7 Eb7 Bb7 Bb7
    { rootSemi: 3, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 3, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 10, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 10, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    // F7 F7 Bb7 Bb7
    { rootSemi: 5, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 5, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 10, chordType: 'dom7', namingMode: 'flat', beats: 4 },
    { rootSemi: 10, chordType: 'dom7', namingMode: 'flat', beats: 4 },
  ]}
];

export const useProgressionStore = create<ProgressionState>()(
  persist(
    (set) => ({
      progression: Array(8).fill(null) as (ProgressionChord | null)[],
      rhythm: 'straight',
      guitarNeckZone: null,
      savedSongs: DEFAULT_SONGS,
      categories: [...DEFAULT_CATEGORIES],

      setGuitarNeckZone: (zone) => set({ guitarNeckZone: zone }),

      setProgressionChord: (index, rootSemi, chordType, instrument = 'piano', arp = false) => set((state) => {
        const next = [...state.progression];
        const existing = next[index];
        const smartNamingMode = [0, 1, 3, 5, 8, 10].includes(rootSemi) ? 'flat' : 'sharp';
        next[index] = {
          ...existing,
          rootSemi,
          chordType,
          namingMode: smartNamingMode,
          repeatStart: existing?.repeatStart,
          repeatEnd: existing?.repeatEnd,
          volta: existing?.volta,
          spacer: false, // filling a cell turns a spacer into a real measure
          intervals: getChordIntervals(chordType),
        };
        return { progression: next };
      }),
      removeProgressionChord: (index) => set((state) => {
        const next = [...state.progression];
        next[index] = null;
        return { progression: next };
      }),
      clearProgression: () => set({ progression: Array(8).fill(null) }),
      addMeasure: (insertAfterIndex = null) => set((state) => {
        const next = [...state.progression];
        if (insertAfterIndex !== null && insertAfterIndex >= 0 && insertAfterIndex < next.length) {
          next.splice(insertAfterIndex + 1, 0, null);
        } else {
          next.push(null);
        }
        return { progression: next };
      }),
      removeMeasure: (selectedIndex = null) => set((state) => {
        if (state.progression.length <= 4) return state;
        const next = [...state.progression];
        if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < next.length) {
          next.splice(selectedIndex, 1);
        } else {
          next.pop();
        }
        return { progression: next };
      }),
      toggleRepeatStart: (index) => set((state) => {
        const next = [...state.progression];
        if (next[index] && !next[index]!.spacer) next[index] = { ...next[index]!, repeatStart: !next[index]!.repeatStart };
        return { progression: next };
      }),
      toggleRepeatEnd: (index) => set((state) => {
        const next = [...state.progression];
        if (next[index] && !next[index]!.spacer) next[index] = { ...next[index]!, repeatEnd: !next[index]!.repeatEnd };
        return { progression: next };
      }),
      setVolta: (index, volta) => set((state) => {
        const next = [...state.progression];
        if (next[index] && !next[index]!.spacer) next[index] = { ...next[index]!, volta };
        return { progression: next };
      }),
      toggleSection: (index) => set((state) => {
        const next = [...state.progression];
        if (next[index] && !next[index]!.spacer) next[index] = { ...next[index]!, section: !next[index]!.section };
        return { progression: next };
      }),
      transposeProgression: (semitones) => set((state) => {
        const next = state.progression.map(chord => {
          if (!chord) return null;
          return { ...chord, rootSemi: ((chord.rootSemi + semitones) % 12 + 12) % 12 };
        });
        return { progression: next };
      }),
      setChordBeats: (index, beats) => set((state) => {
        const next = [...state.progression];
        if (next[index]) next[index] = { ...next[index]!, beats };
        return { progression: next };
      }),
      insertBlanks: (beforeIdx, count) => set((state) => {
        const next = [...state.progression];
        // Indent inserts spacers (empty background), not blank measures — so the chord
        // keeps its number and the gap reads as open space rather than added measures.
        next.splice(beforeIdx, 0, ...Array.from({ length: count }, makeSpacer));
        return { progression: next };
      }),
      setRhythm: (rhythm) => set({ rhythm }),
      
      saveSong: (name, bpm) => set((state) => ({
        savedSongs: [...state.savedSongs, {
          id: Date.now().toString(),
          name,
          progression: state.progression,
          bpm,
          rhythm: state.rhythm,
          category: 'Songs',
        }]
      })),
      loadSong: (id) => set((state) => {
        const song = state.savedSongs.find(s => s.id === id);
        if (!song) return state;
        
        // Push the saved tempo to the global settings store
        if (song.bpm) {
          useSettingsStore.getState().setBpm(song.bpm);
        }
        
        return { progression: song.progression, rhythm: song.rhythm || 'straight' };
      }),
      deleteSong: (id) => set((state) => ({
        savedSongs: state.savedSongs.filter(s => s.id !== id)
      })),
      importSongs: (newSongs) => set((state) => {
        // Create a list of current IDs to prevent duplicates
        const existingIds = new Set(state.savedSongs.map(s => s.id));
        
        const songsToAdd = newSongs.map((song, idx) => ({
          ...song,
          // Give it a fresh ID if it matches an existing one so we don't overwrite anything
          id: existingIds.has(song.id) ? `${Date.now()}-${idx}` : song.id 
        }));
        
        return { savedSongs: [...state.savedSongs, ...songsToAdd] };
      }),
      addCategory: (name) => set((state) => {
        const trimmed = name.trim();
        if (!trimmed || state.categories.includes(trimmed)) return state;
        return { categories: [...state.categories, trimmed] };
      }),
      setSongCategory: (id, category) => set((state) => ({
        savedSongs: state.savedSongs.map((s) => (s.id === id ? { ...s, category } : s)),
      })),
    }),
    {
      name: 'jazz-progression-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Preset songs are read-only references keyed by a fixed id. saveSong() always
      // mints a fresh numeric id, so user songs never collide with presets. Re-deriving
      // presets from DEFAULT_SONGS on every rehydrate means code edits to a preset (new
      // endings, fixed chords, etc.) actually reach the user instead of being shadowed by
      // their persisted snapshot. User-saved songs (non-preset ids) are preserved.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProgressionState>;
        const presetIds = new Set(DEFAULT_SONGS.map((s) => s.id));
        const userSongs = (p.savedSongs ?? []).filter((s) => !presetIds.has(s.id));
        // Built-in categories always present; user-added categories preserved and appended.
        const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...(p.categories ?? [])]));
        return {
          ...current,
          ...p,
          savedSongs: [...DEFAULT_SONGS, ...userSongs],
          categories,
        };
      },
    }
  )
);