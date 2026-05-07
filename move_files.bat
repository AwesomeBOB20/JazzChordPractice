move App.tsx src\app\
move src\screens\PlayScreen.tsx src\features\play\screens\
move src\components\ChordCard.tsx src\features\play\components\
move src\components\FretboardView.tsx src\features\play\components\
move src\components\PianoView.tsx src\features\play\components\
move src\store\chordStore.ts src\features\play\store\

move src\screens\ProgressionScreen.tsx src\features\progression\screens\
move src\components\ProgressionToolbar.tsx src\features\progression\components\
move src\components\ProgressionPlayerDock.tsx src\features\progression\components\
move src\store\progressionStore.ts src\features\progression\store\

move src\screens\QuizScreen.tsx src\features\quiz\screens\
move src\store\quizStore.ts src\features\quiz\store\

move src\screens\TunerScreen.tsx src\features\tuner\screens\

move src\screens\SettingsScreen.tsx src\features\settings\screens\
move src\components\SharedSettingsPanel.tsx src\features\settings\components\
move src\components\SettingRow.tsx src\features\settings\components\
move src\store\settingsStore.ts src\features\settings\store\

move src\components\BpmModal.tsx src\shared\ui\
move src\components\CommandSheet.tsx src\shared\ui\
move src\components\FadeIn.tsx src\shared\ui\
move src\components\ErrorBoundary.tsx src\shared\ui\
move src\components\SharedModals.tsx src\shared\ui\
move src\components\index.ts src\shared\ui\
move src\components\diagrams src\shared\ui\

move src\hooks\useTapTempo.ts src\shared\hooks\
move src\hooks\useProgressionPlayer.ts src\shared\hooks\

move src\context\AudioContext.tsx src\shared\audio\
move src\components\SoundfontPlayer.tsx src\shared\audio\
move src\lib\audioAssets.ts src\shared\audio\

move src\lib\musicTheory.ts src\shared\theory\
mkdir src\shared\theory\core
move src\lib\core\nomenclature.ts src\shared\theory\core\
move src\lib\themes.ts src\shared\ui\

move src\lib\guitar\* src\shared\guitar\
move src\lib\piano\* src\shared\piano\
move src\types\* src\shared\types\
