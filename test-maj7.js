const GS = [40, 45, 50, 55, 59, 64];
const GS12 = GS.map(g => g % 12);

// Test Cmaj7 Drop 2 Root Pos [E Str]
const iv = [0,4,7,11]; // maj7 intervals
const stringSet = [0,1,2,3]; // E A D G
const intIdxs = [0,1,2,3]; // root position

// Original generated offsets
const offsets = [0, -1, -3, -4];

// Test for C (rootSemi = 0)
const rootSemi = 0;
const bassStr = stringSet[0];
const bassIntIdx = intIdxs[0];

// Find base fret for bass note
const baseFret = ((rootSemi + iv[bassIntIdx] - GS[bassStr]) % 12 + 12) % 12;
console.log(`Base fret for C on E string: ${baseFret}`);

for (let i = 0; i < stringSet.length; i++) {
  const strIdx = stringSet[i];
  const intIdx = intIdxs[i];
  const offset = offsets[i];
  const fret = baseFret + offset;
  const midi = GS[strIdx] + fret;
  const noteName = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12];
  const expectedNote = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][(rootSemi + iv[intIdx]) % 12];
  console.log(`String ${strIdx}: fret ${fret}, MIDI ${midi}, note ${noteName}, expected ${expectedNote}, match: ${noteName === expectedNote}`);
}
