# Project Audit Report

## 1. Redundancy Report

### Unused Files
- `src/hooks/useAnimatedPress.ts`: A search across the codebase reveals that this hook is defined but never actually imported or used in any `.tsx` components.

### Chord Logic Analysis
The user mentioned a `chordStore`, but no file by that exact name currently exists. Instead, the chord-related state and logic are handled by a few different areas:

1.  **`src/store/settingsStore.ts`**: This store acts as a monolith. It currently holds global app settings (`theme`, `instrument`, `bpm`, `fretCap`, etc.) alongside ephemeral "Play Screen" state (`rootSemi`, `chordType`, `randomChord()`, `shiftRoot()`).
2.  **`src/store/progressionStore.ts`**: Handles the logic for managing sequences of chords (songs/progressions), including transposing the entire progression.
3.  **`src/lib/musicTheory.ts`**: Contains pure data and functions for chord intervals, spellings, scales, and patterns.

**Duplication & Architectural Feedback**:
While there isn't strict copy-paste duplication of logic, there is a clear **violation of the Single Responsibility Principle** in `settingsStore.ts`. The state for the currently active chord (used primarily in the Play tab) is tightly coupled with global application settings. 

**Recommendation**: Extract the active chord state (`rootSemi`, `chordType`, `shiftRoot`, `randomChord`) out of `settingsStore.ts` into a dedicated `chordStore.ts` (or `playStore.ts`). This will make the state much easier to manage and prevent unnecessary re-renders across the app when the user changes a chord.

---

## 2. Migration Plan: Feature-Based Folder Structure

The current folder structure organizes files by their technical role (`components`, `screens`, `store`, `lib`, `hooks`). As the app grows, this leads to messy directories and context-switching when working on a single feature.

I propose migrating to a **Feature-Driven Architecture**. This groups files by their domain/feature rather than their technical type.

### Proposed Structure

```text
src/
├── app/                      # App entry point, global providers, global routing
│   ├── App.tsx
│   └── navigation/           # Tab navigators, route definitions
├── features/                 # Feature modules
│   ├── play/                 # Play Tab Domain
│   │   ├── screens/          # PlayScreen.tsx
│   │   ├── components/       # ChordCard.tsx, FretboardView.tsx, PianoView.tsx
│   │   └── store/            # New chordStore.ts (extracted from settingsStore)
│   ├── progression/          # Song/Progression Domain
│   │   ├── screens/          # ProgressionScreen.tsx
│   │   ├── components/       # ProgressionToolbar.tsx, ProgressionPlayerDock.tsx
│   │   └── store/            # progressionStore.ts
│   ├── quiz/                 # Quiz Domain
│   │   ├── screens/          # QuizScreen.tsx
│   │   └── store/            # quizStore.ts
│   ├── tuner/                # Tuner Domain
│   │   └── screens/          # TunerScreen.tsx
│   └── settings/             # User Preferences
│       ├── screens/          # SettingsScreen.tsx
│       ├── components/       # SharedSettingsPanel.tsx, SettingRow.tsx
│       └── store/            # Refactored settingsStore.ts
├── shared/                   # Shared/Common modules used across features
│   ├── ui/                   # Generic components (BpmModal, CommandSheet, FadeIn)
│   ├── hooks/                # Generic hooks (useTapTempo, useAnimatedPress - if kept)
│   ├── audio/                # Audio Context, SoundfontPlayer, Pitchfinder logic
│   ├── theory/               # musicTheory.ts, nomenclature.ts
│   ├── guitar/               # guitar lib (voicings, caged, dropVoicings)
│   ├── piano/                # piano lib
│   └── types/                # Global TypeScript models
└── assets/                   # Static assets (fonts, images, audio files)
```

### Migration Steps
1.  **Create Directories**: Scaffold the new `src/features/` and `src/shared/` folder structure.
2.  **Extract `chordStore`**: Refactor `settingsStore.ts` to separate global settings from active chord state, creating `src/features/play/store/chordStore.ts`.
3.  **Move Feature Files**: Relocate screens, specific components, and specific stores into their respective `src/features/<feature_name>/` directories.
4.  **Move Shared Files**: Relocate generic UI components, core audio logic, and theory logic to `src/shared/`.
5.  **Fix Imports**: Update all relative import paths across the project. (A tool like `tsc` will help identify broken imports).
6.  **Cleanup**: Remove the old `screens/`, `components/`, and `store/` folders once empty.