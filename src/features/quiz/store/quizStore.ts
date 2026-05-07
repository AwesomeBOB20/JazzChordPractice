import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface QuizState {
  quizMode: 'visual' | 'audio';
  quizScore: number;
  quizTotal: number;
  quizStreak: number;

  setQuizMode: (mode: 'visual' | 'audio') => void;
  resetQuiz: () => void;
  incrementQuiz: (correct: boolean) => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      quizMode: 'visual',
      quizScore: 0,
      quizTotal: 0,
      quizStreak: 0,

      setQuizMode: (quizMode) => set({ quizMode }),
      resetQuiz: () => set({ quizScore: 0, quizTotal: 0, quizStreak: 0 }),
      incrementQuiz: (correct) => set((state) => ({
        quizTotal: state.quizTotal + 1,
        quizScore: correct ? state.quizScore + 1 : state.quizScore,
        quizStreak: correct ? state.quizStreak + 1 : 0,
      })),
    }),
    {
      name: 'jazz-quiz-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);