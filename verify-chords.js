// Standalone correctness check for the CH chord dictionary — the foundation every
// voicing, label, and quiz answer is built on. Extracts the real CH literal from
// src/shared/theory/musicTheory.ts (no transcription) and asserts, for every chord:
//
//   (i)    iv / r / f are parallel arrays of equal length, with the root first
//   (ii)   every FORMULA label (R, 3, b7, #11, 13, …) matches its semitone interval
//   (iii)  every ROLE  label (root, 3rd, b7th, #11th, 13th, …) matches its interval
//   (iv)   intervals are strictly ascending and contain no duplicate pitch classes
//   (v)    a display symbol (s) and label (l) are present
//
// Run: node verify-chords.js
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

// Canonical semitone for each formula degree (EXACT, including the octave for
// extensions: 9=14, 11=17, 13=21 — matches how CH stores iv).
const FORMULA_SEMI = {
  'R': 0, '1': 0,
  'b2': 1, '2': 2, '#2': 3,
  'b3': 3, '3': 4,
  '4': 5, '#4': 6,
  'b5': 6, '5': 7, '#5': 8, 'b6': 8,
  '6': 9, 'bb7': 9, 'b7': 10, '7': 11,
  'b9': 13, '9': 14, '#9': 15,
  '11': 17, '#11': 18,
  'b13': 20, '13': 21,
};

// Canonical semitone for each ROLE label (the role array drives note coloring).
const ROLE_SEMI = {
  'root': 0,
  'b2nd': 1, '2nd': 2, '#2nd': 3,
  'b3rd': 3, '3rd': 4,
  '4th': 5, '#4th': 6,
  'b5th': 6, '5th': 7, '#5th': 8, 'b6th': 8,
  '6th': 9, 'bb7': 9, 'b7th': 10, '7th': 11,
  'b9th': 13, '9th': 14, '#9th': 15,
  '11th': 17, '#11th': 18,
  'b13th': 20, '13th': 21,
};

let errors = 0;
let warnings = 0;
const fail = (type, msg) => { console.log(`  ✗ [${type}] ${msg}`); errors++; };
const warn = (type, msg) => { console.log(`  ⚠ [${type}] ${msg}`); warnings++; };

const types = Object.keys(CH);
for (const type of types) {
  const ch = CH[type];
  const { iv, r, f, s, l } = ch;

  // (i) parallel arrays + root first
  if (!(iv && r && f)) { fail(type, 'missing iv/r/f'); continue; }
  if (iv.length !== r.length || iv.length !== f.length) {
    fail(type, `array length mismatch: iv=${iv.length} r=${r.length} f=${f.length}`);
  }
  if (iv[0] !== 0) fail(type, `first interval is ${iv[0]}, expected 0 (root)`);
  if (f[0] !== 'R' && f[0] !== '1') fail(type, `first formula is "${f[0]}", expected R`);
  if (r[0] !== 'root') fail(type, `first role is "${r[0]}", expected root`);

  // (v) display fields
  if (!s) warn(type, 'missing symbol (s)');
  if (!l) warn(type, 'missing label (l)');

  const n = Math.min(iv.length, r.length, f.length);
  for (let i = 0; i < n; i++) {
    // (ii) formula ↔ interval
    if (!(f[i] in FORMULA_SEMI)) {
      fail(type, `unknown formula "${f[i]}" at index ${i}`);
    } else if (FORMULA_SEMI[f[i]] !== iv[i]) {
      fail(type, `formula "${f[i]}" should be ${FORMULA_SEMI[f[i]]} semitones but iv says ${iv[i]} (index ${i})`);
    }
    // (iii) role ↔ interval
    if (!(r[i] in ROLE_SEMI)) {
      fail(type, `unknown role "${r[i]}" at index ${i}`);
    } else if (ROLE_SEMI[r[i]] !== iv[i]) {
      fail(type, `role "${r[i]}" should be ${ROLE_SEMI[r[i]]} semitones but iv says ${iv[i]} (index ${i})`);
    }
  }

  // (iv) strictly ascending + no duplicate pitch classes
  for (let i = 1; i < iv.length; i++) {
    if (iv[i] <= iv[i - 1]) fail(type, `intervals not strictly ascending: ${iv[i - 1]} then ${iv[i]} (index ${i})`);
  }
  const pcs = iv.map(x => ((x % 12) + 12) % 12);
  const dupPcs = pcs.filter((pc, i) => pcs.indexOf(pc) !== i);
  if (dupPcs.length) warn(type, `duplicate pitch class(es) ${[...new Set(dupPcs)].join(',')} — two labels share the same note`);
}

console.log(`\nChecked ${types.length} chord types.`);
console.log(`${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
