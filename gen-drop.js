const fs = require('fs');

const GS = [40, 45, 50, 55, 59, 64];
const GS12 = GS.map(g => g % 12);

const CH = {
  'maj': [0,4,7], 'min': [0,3,7], 'aug': [0,4,8], 'dim': [0,3,6], 'sus4': [0,5,7], 'sus2': [0,2,7],
  'maj7': [0,4,7,11], 'min7': [0,3,7,10], 'dom7': [0,4,7,10], 'hdim7': [0,3,6,10], 'fdim7': [0,3,6,9],
  'minMaj7': [0,3,7,11], 'dom7sus4': [0,5,7,10], 'maj7s5': [0,4,8,11], 'dom7b5': [0,4,6,10],
  'dom7s5': [0,4,8,10], 'maj6': [0,4,7,9], 'min6': [0,3,7,9],
  'dom7b9': [0,4,7,10,13], 'dom7s9': [0,4,7,10,15], 'dom7s5s9': [0,4,8,10,15],
  'dom7alt': [0,4,8,10,13,15], 'dom13b9': [0,4,7,10,13,17,21], 'dom13': [0,4,7,10,14,21],
  'maj13': [0,4,7,11,14,21], 'min13': [0,3,7,10,14,21], 'maj9': [0,4,7,11,14],
  'min9': [0,3,7,10,14], 'dom9': [0,4,7,10,14], 'maj69': [0,4,7,9,14], 'min69': [0,3,7,9,14],
  'min11': [0,3,7,10,14,17], 'dom7s11': [0,4,7,10,18], 'maj7s11': [0,4,7,11,18],
  'maj11': [0,4,7,11,14,17], 'dom11': [0,4,7,10,14,17],
  'minMaj9': [0,3,7,11,14], 'dom13s9': [0,4,7,10,15,17,21], 'dom13sus4': [0,5,7,10,14,21],
  'dom9sus4': [0,5,7,10,14], 'add9': [0,4,7,14], 'minAdd9': [0,3,7,14], 'dimMaj7': [0,3,6,11],
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

const existingFile = fs.readFileSync('src/shared/guitar/dropVoicings.ts', 'utf8');

const categories = {};
let currentCategory = '';
let currentChordType = '';

// Parse using a more robust approach - find all shape objects first
const shapeRegex = /\{ label: '([^']+)', notes: \[([^\]]+(?:\[[^\]]+\][^\]]*)*)\] \}/g;
let match;
let totalParsed = 0;

// First pass: find category boundaries
const categoryMatches = existingFile.match(/(drop2|drop3|drop2and4|shells):\s*\{/g);
if (!categoryMatches) {
  console.error('Could not find category markers');
  process.exit(1);
}

// Re-parse with state machine
const lines = existingFile.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  if (line.includes('drop2:')) currentCategory = 'drop2';
  else if (line.includes('drop3:')) currentCategory = 'drop3';
  else if (line.includes('drop2and4:')) currentCategory = 'drop2and4';
  else if (line.includes('shells:')) currentCategory = 'shells';

  const chordMatch = line.match(/'([\w]+)':\s*\[/);
  if (chordMatch && currentCategory) {
    currentChordType = chordMatch[1];
    if (!categories[currentCategory]) categories[currentCategory] = {};
    if (!categories[currentCategory][currentChordType]) {
      categories[currentCategory][currentChordType] = [];
    }
  }

  // Look for shape start
  if (line.includes('{ label:') && currentCategory && currentChordType) {
    // Accumulate lines until we find the closing }
    let shapeLines = [line];
    let j = i + 1;
    while (j < lines.length && !lines[j].trim().includes('},')) {
      shapeLines.push(lines[j]);
      j++;
    }
    if (j < lines.length) {
      shapeLines.push(lines[j]); // include the closing line
    }

    const shapeStr = shapeLines.join(' ');
    // Match the label and extract the notes array (which contains nested arrays)
    const labelMatch = shapeStr.match(/\{ label: '([^']+)'/);
    if (labelMatch) {
      const label = labelMatch[1];
      // Extract the notes array content: notes: [[...], [...], ...]
      const notesMatch = shapeStr.match(/notes:\s*(\[\[.*\]\])/);
      if (notesMatch) {
        const notesStr = notesMatch[1];
        const notes = [];
        const noteRegex = /\[(\d+),\s*(-?\d+),\s*(\d+)(?:,\s*'([^']+)')?\]/g;
        let noteMatch;
        while ((noteMatch = noteRegex.exec(notesStr)) !== null) {
          notes.push({
            strIdx: parseInt(noteMatch[1]),
            intIdx: parseInt(noteMatch[3]),
            formulaOverride: noteMatch[4] || undefined
          });
        }
        if (notes.length > 0) {
          categories[currentCategory][currentChordType].push({ label, notes });
          totalParsed++;
        }
      } else {
        console.log(`No notes match at line ${i+1} for label ${labelMatch[1]}`);
      }
    } else {
      console.log(`No label match at line ${i+1}: ${line.substring(0, 80)}`);
    }
  }
}

let output = `export const DROP_VOICINGS = {\n`;

for (const [category, chords] of Object.entries(categories)) {
  if (Object.keys(chords).length === 0) continue;
  output += `  ${category}: {\n`;

  for (const [chordType, chordShapes] of Object.entries(chords)) {
    const iv = CH[chordType];
    if (!iv) {
      console.warn(`No intervals for ${chordType}`);
      continue;
    }

    output += `    '${chordType}': [\n`;

    for (const shape of chordShapes) {
      const stringSet = shape.notes.map(n => n.strIdx);
      const intIdxs = shape.notes.map(n => n.intIdx);
      const formulaOverrides = shape.notes.map(n => n.formulaOverride);

      const correctOffsets = computeOffsets(iv, stringSet, intIdxs);

      const noteEntries = shape.notes.map((n, i) => {
        if (n.formulaOverride) {
          return `[${n.strIdx}, ${correctOffsets[i]}, ${n.intIdx}, '${n.formulaOverride}']`;
        }
        return `[${n.strIdx}, ${correctOffsets[i]}, ${n.intIdx}]`;
      });

      output += `      { label: '${shape.label}', notes: [${noteEntries.join(', ')}] },\n`;
    }

    output += `    ],\n`;
  }

  output += `  },\n`;
}

output += `};\n\n`;
output += existingFile.split('};')[1];

fs.writeFileSync('src/shared/guitar/dropVoicings.ts', output);

let totalShapes = 0;
for (const c of Object.values(categories)) {
  for (const s of Object.values(c)) {
    totalShapes += s.length;
  }
}
console.log(`Generated corrected dropVoicings.ts`);
console.log(`Categories: ${Object.keys(categories).length}, Chord types: ${Object.values(categories).reduce((a,c) => a + Object.keys(c).length, 0)}, Shapes: ${totalShapes}`);
