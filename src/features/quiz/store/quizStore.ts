import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_VOICING_TYPES = ['block', 'open', 'barre', 'triads', 'shells', 'drop2', 'drop3', 'drop2and4', 'intervals', 'arps', 'shapes', 'scales'];
const DEFAULT_INVERSIONS = ['root', '1st', '2nd', '3rd'];

export interface QuizState {
  quizMode: 'visual' | 'audio';
  quizScore: number;
  quizTotal: number;
  quizStreak: number;
  activeVoicingTypes: string[];
  activeInversions: string[];

  setQuizMode: (mode: 'visual' | 'audio') => void;
  resetQuiz: () => void;
  resetPreferences: () => void;
  incrementQuiz: (correct: boolean) => void;
  toggleVoicingType: (type: string) => void;
  setActiveVoicingTypes: (types: string[]) => void;
  toggleInversion: (inversion: string) => void;
  setActiveInversions: (inversions: string[]) => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      quizMode: 'visual',
      quizScore: 0,
      quizTotal: 0,
      quizStreak: 0,
      activeVoicingTypes: [...DEFAULT_VOICING_TYPES],
      activeInversions: [...DEFAULT_INVERSIONS],

      setQuizMode: (quizMode) => set({ quizMode }),
      resetQuiz: () => set({ quizScore: 0, quizTotal: 0, quizStreak: 0 }),
      // Reset quiz PREFERENCES (mode + which voicings/inversions are quizzed) to defaults.
      // Scores are kept — those are wiped by "Clear Stored Progress" via resetQuiz.
      resetPreferences: () => set({ quizMode: 'visual', activeVoicingTypes: [...DEFAULT_VOICING_TYPES], activeInversions: [...DEFAULT_INVERSIONS] }),
      incrementQuiz: (correct) => set((state) => ({
        quizTotal: state.quizTotal + 1,
        quizScore: correct ? state.quizScore + 1 : state.quizScore,
        quizStreak: correct ? state.quizStreak + 1 : 0,
      })),
      toggleVoicingType: (type) => set((state) => {
        const next = new Set(state.activeVoicingTypes);
        if (next.has(type)) {
          if (next.size > 1) next.delete(type);
        } else {
          next.add(type);
        }
        return { activeVoicingTypes: Array.from(next) };
      }),
      setActiveVoicingTypes: (activeVoicingTypes) => set({ activeVoicingTypes }),
      toggleInversion: (inversion) => set((state) => {
        const next = new Set(state.activeInversions);
        if (next.has(inversion)) {
          if (next.size > 1) next.delete(inversion);
        } else {
          next.add(inversion);
        }
        return { activeInversions: Array.from(next) };
      }),
      setActiveInversions: (activeInversions) => set({ activeInversions }),
    }),
    {
      name: 'jazz-quiz-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        quizMode: state.quizMode,
        activeVoicingTypes: state.activeVoicingTypes,
        activeInversions: state.activeInversions,
      }),
    }
  )
);