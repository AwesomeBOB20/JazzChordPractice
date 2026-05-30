const fs = require('fs');

// Guitar string open string MIDI values
const GS = [40, 45, 50, 55, 59, 64];
const GS12 = GS.map(g => g % 12); // [4, 9, 2, 7, 11, 4]

// Chord definitions (only need intervals)
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

function computeOffsets(iv, stringSet, intIdxs, bassRefOffset) {
  const bassStr = stringSet[0];
  const bassIntIdx = intIdxs[0];

  // For each note position, find the modularly-correct offset
  const baseMods = stringSet.map((strIdx, i) => {
    const diff = (iv[intIdxs[i]] - iv[bassIntIdx] + GS12[bassStr] - GS12[strIdx]) % 12;
    return diff < 0 ? diff + 12 : diff;
  });

  // We need to choose actual offset values ≡ baseMods (mod 12)
  // Try all combinations of {baseMod - 12, baseMod, baseMod + 12} for each position
  // and find the one that makes all 12 roots playable with the smallest max fret

  const choices = baseMods.map(m => [m - 12, m, m + 12]);

  let bestScore = Infinity;
  let bestOffsets = baseMods.slice();

  function tryCombo(idx, current) {
    if (idx === stringSet.length) {
      const score = scoreOffsets(iv, stringSet, intIdxs, current, bassRefOffset);
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

function scoreOffsets(iv, stringSet, intIdxs, offsets, bassRefOffset) {
  const bassStr = stringSet[0];
  const bassIntIdx = intIdxs[0];
  let globalMax = 0;

  for (let rootSemi = 0; rootSemi < 12; rootSemi++) {
    const baseFret = ((rootSemi + iv[bassIntIdx] - GS[bassStr]) % 12 + 12) % 12;

    // Try without octave shift
    const frets0 = stringSet.map((strIdx, i) => baseFret + (offsets[i] - bassRefOffset));
    const min0 = Math.min(...frets0);
    const max0 = Math.max(...frets0);

    if (min0 >= 0 && max0 <= 22) {
      globalMax = Math.max(globalMax, max0);
      continue;
    }

    // Try with octave shift
    const frets12 = stringSet.map((strIdx, i) => baseFret + 12 + (offsets[i] - bassRefOffset));
    const min12 = Math.min(...frets12);
    const max12 = Math.max(...frets12);

    if (min12 >= 0 && max12 <= 22) {
      globalMax = Math.max(globalMax, max12);
      continue;
    }

    // Unplayable for this root
    return null;
  }

  return globalMax;
}

// Parse the existing dropVoicings.ts to extract intIdx patterns
const existingFile = fs.readFileSync('src/shared/guitar/dropVoicings.ts', 'utf8');

// Extract each shape definition
const shapeRegex = /\{ label: '([^']+)', notes: \[([^\]]+)\] \}/g;
const noteRegex = /\[(\d+),\s*(-?\d+),\s*(\d+)(?:,\s*'([^']+)')?\]/g;

const shapes = [];
let match;
while ((match = shapeRegex.exec(existingFile)) !== null) {
  const label = match[1];
  const notesStr = match[2];
  const notes = [];
  let noteMatch;
  while ((noteMatch = noteRegex.exec(notesStr)) !== null) {
    notes.push({
      strIdx: parseInt(noteMatch[1]),
      offset: parseInt(noteMatch[2]),
      intIdx: parseInt(noteMatch[3]),
      formulaOverride: noteMatch[4] || undefined
    });
  }
  shapes.push({ label, notes });
}

// Group shapes by category and chord type
const categories = { drop2: {}, drop3: {}, shells: {}, drop2and4: {} };

// Find category context for each shape
const lines = existingFile.split('\n');
let currentCategory = '';
let currentChordType = '';

for (const shape of shapes) {
  // Find the line containing this shape's label
  const lineIdx = lines.findIndex(l => l.includes(shape.label));
  if (lineIdx === -1) continue;

  // Scan backward to find category and chord type
  for (let i = lineIdx; i >= 0; i--) {
    const line = lines[i];
    if (line.includes("drop2and4:")) currentCategory = 'drop2and4';
    else if (line.includes("drop2:")) currentCategory = 'drop2';
    else if (line.includes("drop3:")) currentCategory = 'drop3';
    else if (line.includes("shells:")) currentCategory = 'shells';

    const chordMatch = line.match(/'([\w]+)':\s*\[/);
    if (chordMatch) {
      currentChordType = chordMatch[1];
      break;
    }
  }

  if (!currentCategory || !currentChordType) continue;

  if (!categories[currentCategory][currentChordType]) {
    categories[currentCategory][currentChordType] = [];
  }
  categories[currentCategory][currentChordType].push(shape);
}

// Now regenerate all shapes with correct offsets
let output = `export const DROP_VOICINGS = {\n`;

for (const [category, chords] of Object.entries(categories)) {
  if (Object.keys(chords).length === 0) continue;
  output += `  ${category}: {\n`;

  for (const [chordType, chordShapes] of Object.entries(chords)) {
    const iv = CH[chordType];
    if (!iv) {
      console.warn(`No intervals for ${chordType}, skipping`);
      continue;
    }

    output += `    '${chordType}': [\n`;

    for (const shape of chordShapes) {
      const stringSet = shape.notes.map(n => n.strIdx);
      const intIdxs = shape.notes.map(n => n.intIdx);
      const formulaOverrides = shape.notes.map(n => n.formulaOverride);
      const bassRefOffset = shape.notes[0].offset;

      // Compute correct offsets
      const correctOffsets = computeOffsets(iv, stringSet, intIdxs, bassRefOffset);

      // Build note array with corrected offsets, preserving formula overrides
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

// Add the formatting code at the end
output += `// Automatically format flats and sharps and clean labels for UI presentation\n`;
output += `Object.values(DROP_VOICINGS).forEach((category: any) => {\n`;
output += `  Object.values(category).forEach((chordShapes: any) => {\n`;
output += `    chordShapes.forEach((shape: any) => {\n`;
output += `      if (shape.label) {\n`;
output += `        // Map the string sets to exact fretboard numbers\n`;
output += `        if (shape.label.includes('Drop 2 & 4')) {\n`;
output += `          shape.label = shape.label.replace('[E Str]', '[6-5-3-2]').replace('[A Str]', '[5-4-2-1]');\n`;
output += `        } else if (shape.label.includes('Drop 3')) {\n`;
output += `          shape.label = shape.label.replace('[E Str]', '[6-4-3-2]').replace('[A Str]', '[5-3-2-1]');\n`;
output += `        } else if (shape.label.includes('Drop 2')) {\n`;
output += `          shape.label = shape.label.replace('[E Str]', '[6-5-4-3]').replace('[A Str]', '[5-4-3-2]').replace('[D Str]', '[4-3-2-1]');\n`;
output += `        }\n`;
output += `\n`;
output += `        shape.label = shape.label\n`;
output += `          .replace(/bb7/g, '𝄫7')\n`;
output += `          .replace(/b([235679])/g, '♭$1')\n`;
output += `          .replace(/b11/g, '♭11')\n`;
output += `          .replace(/b13/g, '♭13')\n`;
output += `          .replace(/#([459])/g, '♯$1')\n`;
output += `          .replace(/#11/g, '♯11')\n`;
output += `          .replace(/\\bPos\\b/g, 'Position')\n`;
output += `          .replace(/\\((.*?)\\)/g, '$1'); // Remove parentheses\n`;
output += `      }\n`;
output += `    });\n`;
output += `  });\n`;
output += `});\n`;

fs.writeFileSync('src/shared/guitar/dropVoicings.ts', output);
console.log('Generated corrected dropVoicings.ts');
console.log(`Processed ${Object.values(categories).reduce((a, c) => a + Object.keys(c).length, 0)} chord types`);
