// Ground-truth check for the Phase-4 CHORD navigator (sub-chord axis).
//
// The CHORD nav appears on the Triads tab when a chord decomposes into >1 triad.
// That decomposition is exactly findTriads(chordDef). This harness extracts the
// real CH dictionary and runs findTriads + TRIAD_TYPES (copied verbatim from
// src/shared/guitar/voicings.ts) over every chord type, reporting how many
// sub-chords each yields — i.e. exactly where the CHORD nav SHOULD show.
//
// Run: node verify-chord-axis.js
'use strict';
const fs = require('fs');

// ---- Pull the real CH literal out of musicTheory.ts (no transcription) ----
const mtSrc = fs.readFileSync('src/shared/theory/musicTheory.ts', 'utf8');
const start = mtSrc.indexOf('export const CH');
const braceStart = mtSrc.indexOf('= {', start) + 2;
const objEnd = mtSrc.indexOf('\n};', braceStart);
const chLiteral = mtSrc.slice(braceStart, objEnd + 2);
// eslint-disable-next-line no-eval
const CH = eval('(' + chLiteral + ')');

// ===== copied verbatim from voicings.ts =====
const TRIAD_TYPES = {
  maj:    { iv: [0,4,7],  roles: ['root','3rd','5th'] },
  min:    { iv: [0,3,7],  roles: ['root','3rd','5th'] },
  aug:    { iv: [0,4,8],  roles: ['root','3rd','5th'] },
  dim:    { iv: [0,3,6],  roles: ['root','3rd','5th'] },
  sus4:   { iv: [0,5,7],  roles: ['root','4th','5th'] },
  sus2:   { iv: [0,2,7],  roles: ['root','2nd','5th'] },
  maj_b5: { iv: [0,4,6],  roles: ['root','3rd','b5'] },
};
const TRIAD_FULL_NAMES = {
  maj: 'Major', min: 'Minor', aug: 'Augmented', dim: 'Diminished',
  sus4: 'Sus4', sus2: 'Sus2', maj_b5: 'Major b5',
};

function findTriads(chordDef) {
  const pcs = new Set(chordDef.iv.map(iv => iv % 12));
  const result = [];
  const isSourceTriad = chordDef.iv.length === 3;
  for (let ci = 0; ci < chordDef.iv.length; ci++) {
    if (isSourceTriad && chordDef.r[ci] !== 'root') continue;
    for (const [triadKey, triadDef] of Object.entries(TRIAD_TYPES)) {
      const triadRoot = chordDef.iv[ci] % 12;
      const triadPCs = triadDef.iv.map(iv => (triadRoot + iv) % 12);
      if (!triadPCs.every(pc => pcs.has(pc))) continue;
      const pcSetKey = [...triadPCs].sort((a, b) => a - b).join(',');
      const isDup = result.some(x => {
        const xPCs = x.triadDef.iv.map(iv => (x.rootInterval % 12 + iv) % 12).sort((a, b) => a - b).join(',');
        return xPCs === pcSetKey;
      });
      if (!isDup) {
        result.push({ triadType: triadKey, rootInterval: chordDef.iv[ci], rootRole: chordDef.r[ci], triadDef });
      }
    }
  }
  const roleOrder = { root: 0, '3rd': 1, '5th': 2, '7th': 3, '9th': 4, '11th': 5, '13th': 6 };
  result.sort((a, b) => (roleOrder[a.rootRole] ?? 9) - (roleOrder[b.rootRole] ?? 9));
  return result;
}

const NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function triadLabel(t) {
  const rootPc = t.rootInterval % 12;
  return `${NOTE[rootPc]} ${TRIAD_FULL_NAMES[t.triadType]}`;
}

// ===== sweep =====
const multi = [];
const single = [];
let total = 0;
for (const [type, def] of Object.entries(CH)) {
  if (!def || !Array.isArray(def.iv) || !Array.isArray(def.r)) continue;
  total++;
  const triads = findTriads(def);
  const labels = triads.map(triadLabel);
  const distinct = [...new Set(labels)];
  const row = { type, n: distinct.length, labels: distinct };
  (distinct.length > 1 ? multi : single).push(row);
}

console.log(`\n=== CHORD-axis ground truth over ${total} chord types (root = C) ===\n`);
console.log(`Chord types that SHOW the CHORD nav on Triads (>1 sub-chord): ${multi.length}`);
for (const r of multi) console.log(`  ${r.type.padEnd(12)} ${r.n}  [${r.labels.join(' | ')}]`);
console.log(`\nChord types with a SINGLE sub-chord (no CHORD nav): ${single.length}`);
console.log('  ' + single.map(r => r.type).join(', '));

// Machine-readable formula -> expected count, for cross-checking the live UI.
// The UI chord-card formula line is def.f joined; map it to the predicted count.
const byFormula = {};
for (const [type, def] of Object.entries(CH)) {
  if (!def || !Array.isArray(def.iv)) continue;
  const n = findTriads(def).length;
  byFormula[def.f.join(' · ')] = n;
}
console.log('\n=== FORMULA_LOOKUP ===');
console.log(JSON.stringify(byFormula));

// sanity assertions
let fails = 0;
for (const r of multi) {
  if (r.labels.length !== new Set(r.labels).size) { console.log(`DUP LABELS: ${r.type}`); fails++; }
}
console.log(`\n${fails === 0 ? 'OK' : 'FAIL'}: no duplicate sub-chord labels in any multi entry.`);
