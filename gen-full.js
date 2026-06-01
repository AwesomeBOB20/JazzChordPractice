const fs = require('fs');

const GS = [40, 45, 50, 55, 59, 64];
const GS12 = GS.map(g => g % 12);

const CH = {
  'maj7': [0,4,7,11], 'min7': [0,3,7,10], 'dom7': [0,4,7,10], 'hdim7': [0,3,6,10], 'fdim7': [0,3,6,9], 'minMaj7': [0,3,7,11],
  'dom7sus4': [0,5,7,10], 'maj7s5': [0,4,8,11], 'dom7b5': [0,4,6,10], 'dom7s5': [0,4,8,10], 'maj6': [0,4,7,9], 'min6': [0,3,7,9],
  'dom7b9': [0,4,7,10,13], 'dom7s9': [0,4,7,10,15], 'dom7s5s9': [0,4,8,10,15], 'dom7alt': [0,4,8,10,13,15],
  'dom13b9': [0,4,7,10,13,17,21], 'dom13': [0,4,7,10,14,21], 'maj13': [0,4,7,11,14,21], 'min13': [0,3,7,10,14,21],
  'maj9': [0,4,7,11,14], 'min9': [0,3,7,10,14], 'dom9': [0,4,7,10,14], 'maj69': [0,4,7,9,14], 'min69': [0,3,7,9,14],
  'min11': [0,3,7,10,14,17], 'dom7s11': [0,4,7,10,18], 'maj7s11': [0,4,7,11,18], 'maj11': [0,4,7,11,14,17], 'dom11': [0,4,7,10,14,17],
  'minMaj9': [0,3,7,11,14], 'dom13s9': [0,4,7,10,15,17,21], 'dom13sus4': [0,5,7,10,14,21], 'dom9sus4': [0,5,7,10,14],
  'add9': [0,4,7,14], 'minAdd9': [0,3,7,14], 'dimMaj7': [0,3,6,11]
};

const STRING_SETS = {
  drop2: [
    { label: '[E Str]', strings: [0, 1, 2, 3] },
    { label: '[A Str]', strings: [1, 2, 3, 4] },
    { label: '[D Str]', strings: [2, 3, 4, 5] }
  ],
  drop3: [
    { label: '[E Str]', strings: [0, 2, 3, 4] },
    { label: '[A Str]', strings: [1, 3, 4, 5] }
  ],
  drop2and4: [
    { label: '[E Str]', strings: [0, 1, 3, 4] },
    { label: '[A Str]', strings: [1, 2, 4, 5] }
  ],
  shells: [
    { label: '(E Bass)', strings: [0, 2, 3] },
    { label: '(A Bass)', strings: [1, 2, 3] },
    { label: '(A Bass)', strings: [1, 3, 4] },
    { label: '(D Bass)', strings: [2, 3, 4] },
    { label: '(D Bass)', strings: [2, 4, 5] },
    { label: '(G Bass)', strings: [3, 4, 5] },
    { label: '(G Bass)', strings: [3, 4, 5] }
  ]
};

function computeOffsets(iv, stringSet, intIdxs) {
  const bassStr = stringSet[0];
  const bassIntIdx = intIdxs[0];
  const baseMods = stringSet.map((strIdx, i) => {
    let diff = (iv[intIdxs[i]] - iv[bassIntIdx] + GS12[bassStr] - GS12[strIdx]) % 12;
    if (diff < 0) diff += 12;
    return diff;
  });
  const choices = baseMods.map(m => [m - 12, m, m + 12]);
  let bestScore = Infinity;
  let bestOffsets = baseMods.slice();
  function tryCombo(idx, current) {
    if (idx === stringSet.length) {
      const score = scoreOffsets(iv, stringSet, intIdxs, current);
      if (score !== null && score < bestScore) {
        bestScore = score;
        bestOffsets = current.slice();
      }
      return;
    }
    for (const c of choices[idx]) {
      current.push(c);
      tryCombo(idx + 1, current);
      current.pop();
    }
  }
  tryCombo(0, []);
  return bestOffsets;
}

function scoreOffsets(iv, stringSet, intIdxs, offsets) {
  const bassStr = stringSet[0];
  const bassIntIdx = intIdxs[0];
  let globalMax = 0;
  for (let rootSemi = 0; rootSemi < 12; rootSemi++) {
    const baseFret = ((rootSemi + iv[bassIntIdx] - GS[bassStr]) % 12 + 12) % 12;
    const frets0 = stringSet.map((strIdx, i) => baseFret + offsets[i]);
    const min0 = Math.min(...frets0);
    const max0 = Math.max(...frets0);
    if (min0 >= 0 && max0 <= 22) {
      globalMax = Math.max(globalMax, max0);
      continue;
    }
    const frets12 = stringSet.map((strIdx, i) => baseFret + 12 + offsets[i]);
    const min12 = Math.min(...frets12);
    const max12 = Math.max(...frets12);
    if (min12 >= 0 && max12 <= 22) {
      globalMax = Math.max(globalMax, max12);
      continue;
    }
    return null;
  }
  return globalMax;
}

function generateInversions(iv) {
  const inversions = [];
  for (let i = 0; i < iv.length; i++) {
    const intIdxs = [];
    for (let j = 0; j < iv.length; j++) {
      intIdxs.push((i + j) % iv.length);
    }
    inversions.push(intIdxs);
  }
  return inversions;
}

const invNames = ['Root Pos', '1st Inv', '2nd Inv', '3rd Inv'];

// Extended chords use specific interval selections (formula overrides)
const EXTENDED_IV_SELECTIONS = {
  'dom7b9': [0,1,2,3], 'dom7s9': [0,1,2,3], 'dom7s5s9': [1,2,3,4], 'dom7alt': [0,1,2,3],
  'dom13b9': [0,1,2,3], 'dom13': [1,2,3,5], 'maj13': [1,3,4,5], 'min13': [1,2,4,5],
  'maj9': [0,1,3,4], 'min9': [0,1,2,4], 'dom9': [0,1,2,4], 'maj69': [0,1,3,4], 'min69': [0,1,3,4],
  'min11': [1,2,4,5], 'dom7s11': [1,2,4,5], 'maj7s11': [1,3,4,5], 'maj11': [1,3,4,5], 'dom11': [1,2,4,5],
  'minMaj9': [0,1,3,4], 'dom13s9': [1,2,3,4], 'dom13sus4': [1,2,4,5], 'dom9sus4': [1,2,3,4],
  'add9': [0,1,2,4], 'minAdd9': [0,1,2,4]
};

let output = `export const DROP_VOICINGS = {\n`;

// Generate drop2
output += `  drop2: {\n`;
for (const [chordType, iv] of Object.entries(CH)) {
  output += `    '${chordType}': [\n`;
  const effectiveIv = EXTENDED_IV_SELECTIONS[chordType] ? EXTENDED_IV_SELECTIONS[chordType].map(i => iv[i]) : iv;
  const inversions = generateInversions(effectiveIv);
  
  for (const stringSet of STRING_SETS.drop2) {
    for (let invIdx = 0; invIdx < inversions.length; invIdx++) {
      const intIdxs = inversions[invIdx];
      const offsets = computeOffsets(effectiveIv, stringSet.strings, intIdxs);
      const noteEntries = stringSet.strings.map((strIdx, i) => 
        `[${strIdx}, ${offsets[i]}, ${intIdxs[i]}]`
      );
      output += `      { label: 'Drop 2 (${invNames[invIdx]}) ${stringSet.label}', notes: [${noteEntries.join(', ')}] },\n`;
    }
  }
  output += `    ],\n`;
}
output += `  },\n`;

// Generate drop3
output += `  drop3: {\n`;
for (const [chordType, iv] of Object.entries(CH)) {
  if (iv.length !== 4) continue;
  output += `    '${chordType}': [\n`;
  const effectiveIv = EXTENDED_IV_SELECTIONS[chordType] ? EXTENDED_IV_SELECTIONS[chordType].map(i => iv[i]) : iv;
  const inversions = generateInversions(effectiveIv);
  
  for (const stringSet of STRING_SETS.drop3) {
    for (let invIdx = 0; invIdx < inversions.length; invIdx++) {
      const intIdxs = inversions[invIdx];
      const offsets = computeOffsets(effectiveIv, stringSet.strings, intIdxs);
      const noteEntries = stringSet.strings.map((strIdx, i) => 
        `[${strIdx}, ${offsets[i]}, ${intIdxs[i]}]`
      );
      output += `      { label: 'Drop 3 (${invNames[invIdx]}) ${stringSet.label}', notes: [${noteEntries.join(', ')}] },\n`;
    }
  }
  output += `    ],\n`;
}
output += `  },\n`;

// Generate drop2and4
output += `  drop2and4: {\n`;
for (const [chordType, iv] of Object.entries(CH)) {
  if (iv.length !== 4) continue;
  output += `    '${chordType}': [\n`;
  const effectiveIv = EXTENDED_IV_SELECTIONS[chordType] ? EXTENDED_IV_SELECTIONS[chordType].map(i => iv[i]) : iv;
  const inversions = generateInversions(effectiveIv);
  
  for (const stringSet of STRING_SETS.drop2and4) {
    for (let invIdx = 0; invIdx < inversions.length; invIdx++) {
      const intIdxs = inversions[invIdx];
      const offsets = computeOffsets(effectiveIv, stringSet.strings, intIdxs);
      const noteEntries = stringSet.strings.map((strIdx, i) => 
        `[${strIdx}, ${offsets[i]}, ${intIdxs[i]}]`
      );
      output += `      { label: 'Drop 2 & 4 (${invNames[invIdx]}) ${stringSet.label}', notes: [${noteEntries.join(', ')}] },\n`;
    }
  }
  output += `    ],\n`;
}
output += `  },\n`;

// Shells are no longer generated here. They are derived at runtime in
// src/shared/guitar/voicings.ts (deriveShellToneSets + placeShellToneSet)
// from the chord's own role list, so labels always match the sounding pitch
// and no perfect 5th is ever included.

output += `};\n`;

// Add formatting function from original file
output += `
// Automatically format flats and sharps and clean labels for UI presentation
export function formatDropVoicingLabel(shape: any, namingMode: 'sharp' | 'flat' = 'sharp') {
  if (shape.label) {
    if (shape.label.includes('Drop 2 & 4')) {
      shape.label = shape.label.replace('[E Str]', '[6-5-3-2]').replace('[A Str]', '[5-4-2-1]');
    } else if (shape.label.includes('Drop 3')) {
      shape.label = shape.label.replace('[E Str]', '[6-4-3-2]').replace('[A Str]', '[5-3-2-1]');
    } else if (shape.label.includes('Drop 2')) {
      shape.label = shape.label.replace('[A Str]', '[5-4-3-2]').replace('[D Str]', '[4-3-2-1]');
    }
  }
  return shape.label;
}
`;

fs.writeFileSync('src/shared/guitar/dropVoicings.ts', output);
console.log('Generated full dropVoicings.ts with all chord types and categories');
