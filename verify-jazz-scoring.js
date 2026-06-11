// Unit check for the idiomatic-jazz voicing scorer + string-set key (copied verbatim
// from src/shared/guitar/voiceLeading.ts). Asserts that, for a maj9 chord, a voicing
// that shows the 3rd + 7th + 9th (and drops the filler 5th) beats voicings that keep
// the 5th, drop the 7th, or omit the 9th — i.e. the "highlight extensions, keep guide
// tones" behaviour the feature is supposed to produce.
//
// Run: node verify-jazz-scoring.js
'use strict';

// ===== copied verbatim from voiceLeading.ts =====
const GUIDE_ROLES = new Set(['3rd', 'b3rd', '7th', 'b7th', 'bb7']);
const COLOR_ROLES = new Set(['9th', 'b9th', '#9th', '11th', '#11th', '13th', 'b13th', 'b5th', '#5th', '6th']);
const activeRoles = (v) => v.frets.filter((f) => f && f.fret !== null).map((f) => f.role);
const activeStringKey = (v) =>
  v.frets.map((f, i) => (f && f.fret !== null) ? i : null).filter((i) => i !== null).join(',');
function jazzCharacter(v, def) {
  const roles = activeRoles(v);
  const present = new Set(roles);
  let s = 0;
  for (const r of def.r) if (GUIDE_ROLES.has(r) && !present.has(r)) s += 14;
  for (const r of def.r) if (COLOR_ROLES.has(r)) { if (present.has(r)) s -= 9; else s += 7; }
  s += roles.filter((r) => r === '5th').length * 5;
  const roots = roles.filter((r) => r === 'root').length;
  if (roots > 1) s += (roots - 1) * 6;
  return s;
}

// ===== fixtures =====
// maj9 = root,3rd,5th,7th,9th
const maj9 = { r: ['root', '3rd', '5th', '7th', '9th'] };
// build a mock voicing from a list of roles (frets on strings 2..5, value irrelevant)
const mk = (roles) => ({ frets: [null, null, ...roles.map((role, i) => ({ fret: 3 + i, role }))].concat(Array(6).fill(null)).slice(0, 6) });

const cases = {
  'R-3-7-9 (idiomatic, no 5)': mk(['root', '3rd', '7th', '9th']),
  'rootless 3-7-9-13?':        mk(['3rd', '7th', '9th']),
  'R-3-5-9 (no 7th)':          mk(['root', '3rd', '5th', '9th']),
  'R-3-5-7 (no 9th)':          mk(['root', '3rd', '5th', '7th']),
  'R-3-5 (triad, bare)':       mk(['root', '3rd', '5th']),
};

console.log('\n=== jazzCharacter scores for a maj9 voicing (lower = more idiomatic) ===\n');
const scored = Object.entries(cases).map(([name, v]) => ({ name, score: jazzCharacter(v, maj9) }));
scored.sort((a, b) => a.score - b.score);
for (const r of scored) console.log(`  ${String(r.score).padStart(4)}  ${r.name}`);

// assertions
let fails = 0;
const S = (n) => jazzCharacter(cases[n], maj9);
const assert = (cond, msg) => { if (!cond) { console.log('FAIL: ' + msg); fails++; } };
assert(S('R-3-7-9 (idiomatic, no 5)') < S('R-3-5-9 (no 7th)'), 'showing 7th+9th should beat keeping the 5th & dropping the 7th');
assert(S('R-3-7-9 (idiomatic, no 5)') < S('R-3-5-7 (no 9th)'), 'showing the 9th should beat omitting it');
assert(S('R-3-7-9 (idiomatic, no 5)') < S('R-3-5 (triad, bare)'), 'guide+extension should beat a bare triad');
assert(S('R-3-7-9 (idiomatic, no 5)') === Math.min(...scored.map(r => r.score)), 'R-3-7-9 must be the single best');

// string-set key
console.log('\n=== activeStringKey ===');
const k = activeStringKey({ frets: [null, null, { fret: 3, role: 'root' }, { fret: 4, role: '3rd' }, { fret: 5, role: '7th' }, { fret: 2, role: '9th' }] });
console.log('  active strings 2,3,4,5 ->', JSON.stringify(k));
assert(k === '2,3,4,5', 'activeStringKey should be "2,3,4,5"');

console.log(`\n${fails === 0 ? 'OK — all assertions passed' : fails + ' ASSERTION(S) FAILED'}`);
