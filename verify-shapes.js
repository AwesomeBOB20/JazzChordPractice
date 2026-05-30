const fs = require('fs');

const GS = [40, 45, 50, 55, 59, 64];
const GS12 = GS.map(g => g % 12);

const CH = {
  'maj7': [0,4,7,11], 'min7': [0,3,7,10], 'dom7': [0,4,7,10]
};

// Read the generated dropVoicings.ts
const dropVoicingsContent = fs.readFileSync('src/shared/guitar/dropVoicings.ts', 'utf8');

// Manually test shapes from the generated file
const testShapes = [
  {
    type: 'maj7',
    label: 'Drop 2 (Root Pos) [E Str]',
    notes: [
      { strIdx: 0, offset: 0, intIdx: 0 },
      { strIdx: 1, offset: -1, intIdx: 1 },
      { strIdx: 2, offset: -3, intIdx: 2 },
      { strIdx: 3, offset: -4, intIdx: 3 }
    ]
  },
  {
    type: 'dom7',
    label: 'Drop 2 (Root Pos) [E Str]',
    notes: [
      { strIdx: 0, offset: 0, intIdx: 0 },
      { strIdx: 1, offset: -1, intIdx: 1 },
      { strIdx: 2, offset: -3, intIdx: 2 },
      { strIdx: 3, offset: -5, intIdx: 3 }
    ]
  },
  {
    type: 'min7',
    label: 'Drop 2 (Root Pos) [E Str]',
    notes: [
      { strIdx: 0, offset: 0, intIdx: 0 },
      { strIdx: 1, offset: -2, intIdx: 1 },
      { strIdx: 2, offset: -3, intIdx: 2 },
      { strIdx: 3, offset: -5, intIdx: 3 }
    ]
  }
];

console.log(`Testing ${testShapes.length} shapes\n`);

const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

for (const testShape of testShapes) {
  console.log(`=== Testing C${testShape.type} ===`);
  console.log(`Shape: ${testShape.label}`);
  const iv = CH[testShape.type];
  const rootSemi = 0;

  const bassStr = testShape.notes[0].strIdx;
  const bassIntIdx = testShape.notes[0].intIdx;
  const baseFret = ((rootSemi + iv[bassIntIdx] - GS[bassStr]) % 12 + 12) % 12;

  let allCorrect = true;
  for (const note of testShape.notes) {
    const fret = baseFret + note.offset;
    const midi = GS[note.strIdx] + fret;
    const actualNote = noteNames[midi % 12];
    const expectedNote = noteNames[(rootSemi + iv[note.intIdx]) % 12];
    const match = actualNote === expectedNote;
    if (!match) allCorrect = false;
    console.log(`  String ${note.strIdx}: fret ${fret}, note ${actualNote}, expected ${expectedNote} ${match ? '✓' : '✗'}`);
  }
  console.log(allCorrect ? 'All notes correct ✓\n' : 'Some notes incorrect ✗\n');
}
