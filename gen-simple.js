const fs = require('fs');

const GS = [40, 45, 50, 55, 59, 64];
const GS12 = GS.map(g => g % 12);

const CH = {
  'maj7': [0,4,7,11], 'min7': [0,3,7,10], 'dom7': [0,4,7,10], 'hdim7': [0,3,6,10], 'fdim7': [0,3,6,9], 'minMaj7': [0,3,7,11]
};

const STRING_SETS = {
  drop2: [
    { label: '[E Str]', strings: [0, 1, 2, 3] },
    { label: '[A Str]', strings: [1, 2, 3, 4] },
    { label: '[D Str]', strings: [2, 3, 4, 5] }
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

let output = `export const DROP_VOICINGS = {\n  drop2: {\n`;

for (const [chordType, iv] of Object.entries(CH)) {
  output += `    '${chordType}': [\n`;
  const inversions = generateInversions(iv);
  
  for (const stringSet of STRING_SETS.drop2) {
    for (let invIdx = 0; invIdx < inversions.length; invIdx++) {
      const intIdxs = inversions[invIdx];
      const offsets = computeOffsets(iv, stringSet.strings, intIdxs);
      const noteEntries = stringSet.strings.map((strIdx, i) => 
        `[${strIdx}, ${offsets[i]}, ${intIdxs[i]}]`
      );
      output += `      { label: 'Drop 2 (${invNames[invIdx]}) ${stringSet.label}', notes: [${noteEntries.join(', ')}] },\n`;
    }
  }
  output += `    ],\n`;
}

output += `  }\n};\n`;
fs.writeFileSync('src/shared/guitar/dropVoicings.ts', output);
console.log('Generated simple dropVoicings.ts');
