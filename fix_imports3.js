const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const appDir = path.join(__dirname, 'src', 'app');

function getFiles(dir, filesList = []) {
  if (!fs.existsSync(dir)) return filesList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, filesList);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

const files = getFiles(srcDir);
files.push(path.join(__dirname, 'index.ts'));

const fileMap = {
  'App': '@app/App',
  'PlayScreen': '@features/play/screens/PlayScreen',
  'ChordCard': '@features/play/components/ChordCard',
  'FretboardView': '@features/play/components/FretboardView',
  'PianoView': '@features/play/components/PianoView',
  'chordStore': '@features/play/store/chordStore',
  'ProgressionScreen': '@features/progression/screens/ProgressionScreen',
  'ProgressionToolbar': '@features/progression/components/ProgressionToolbar',
  'ProgressionPlayerDock': '@features/progression/components/ProgressionPlayerDock',
  'progressionStore': '@features/progression/store/progressionStore',
  'QuizScreen': '@features/quiz/screens/QuizScreen',
  'quizStore': '@features/quiz/store/quizStore',
  'TunerScreen': '@features/tuner/screens/TunerScreen',
  'SettingsScreen': '@features/settings/screens/SettingsScreen',
  'SharedSettingsPanel': '@features/settings/components/SharedSettingsPanel',
  'SettingRow': '@features/settings/components/SettingRow',
  'settingsStore': '@features/settings/store/settingsStore',
  'BpmModal': '@shared/ui/BpmModal',
  'CommandSheet': '@shared/ui/CommandSheet',
  'FadeIn': '@shared/ui/FadeIn',
  'ErrorBoundary': '@shared/ui/ErrorBoundary',
  'SharedModals': '@shared/ui/SharedModals',
  'MiniChordDiagram': '@shared/ui/diagrams/MiniChordDiagram',
  'MiniPianoDiagram': '@shared/ui/diagrams/MiniPianoDiagram',
  'useTapTempo': '@shared/hooks/useTapTempo',
  'useProgressionPlayer': '@shared/hooks/useProgressionPlayer',
  'AudioContext': '@shared/audio/AudioContext',
  'SoundfontPlayer': '@shared/audio/SoundfontPlayer',
  'audioAssets': '@shared/audio/audioAssets',
  'musicTheory': '@shared/theory/musicTheory',
  'nomenclature': '@shared/theory/core/nomenclature',
  'themes': '@shared/ui/themes',
  'caged': '@shared/guitar/caged',
  'dropVoicings': '@shared/guitar/dropVoicings',
  'hardcodedShapes': '@shared/guitar/hardcodedShapes',
  'voiceLeading': '@shared/guitar/voiceLeading',
  'voicings': '@shared/guitar/voicings',
  'pianoVoicings': '@shared/piano/pianoVoicings',
  'models': '@shared/types/models'
};

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  content = content.replace(/(from|import)\s+['"]([^'"]+)['"]/g, (match, p1, p2) => {
    // Ignore external modules
    if (!p2.startsWith('.') && !p2.startsWith('@app') && !p2.startsWith('@features') && !p2.startsWith('@shared')) return match;
    
    // Extract base name
    const parts = p2.split('/');
    let baseName = parts[parts.length - 1];
    
    if (baseName === 'index' || baseName === '') {
      // It's an index import, let's try to infer from the folder name
      baseName = parts[parts.length - 2];
      if (baseName === 'components' && fileMap['ChordCard']) {
        return `${p1} '@shared/ui'`;
      } else if (baseName === 'guitar' || baseName === 'lib' || baseName === 'piano') {
        // We'll handle these manually
      }
    }
    
    if (fileMap[baseName]) {
      changed = true;
      return `${p1} '${fileMap[baseName]}'`;
    }
    
    // Special handling for index files
    if (p2.includes('components')) {
      changed = true; return `${p1} '@shared/ui'`;
    }
    if (p2.includes('lib/guitar')) {
      changed = true; return `${p1} '@shared/guitar'`;
    }
    if (p2.includes('lib/piano')) {
      changed = true; return `${p1} '@shared/piano'`;
    }

    return match;
  });
  
  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
