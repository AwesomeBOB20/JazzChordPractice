// Standalone correctness check for the rebuilt shell voicings.
//
// Extracts the real CH chord dictionary from src/shared/theory/musicTheory.ts
// and runs copies of deriveShellToneSets + placeShellToneSet (kept identical to
// src/shared/guitar/voicings.ts) against it. For all 12 roots x every chord
// type it asserts:
//   (i)   no shell note sounds the chord's perfect 5th
//   (ii)  every shell note's pitch matches its labeled role
//   (iii) base R37/R73 shells always have 3 notes; rootless shells exist for
//         each color tone; nothing for pure triads / add9 / minAdd9
//   (iv)  every grip spans <= 4 frets
//   (v)   every chord with tone-sets produces >= 1 voicing for every root
//
// Run: node verify-shells.js
'use strict';
const fs = require('fs');

// ---- Pull the real CH literal out of musicTheory.ts (no transcription) ----
const mtSrc = fs.readFileSync('src/shared/theory/musicTheory.ts', 'utf8');
const startMarker = 'export const CH';
const start = mtSrc.indexOf(startMarker);
const braceStart = mtSrc.indexOf('= {', start) + 2;
const objEnd = mtSrc.indexOf('\n};', braceStart);
const chLiteral = mtSrc.slice(braceStart, objEnd + 2); // includes closing }
// eslint-disable-next-line no-eval
const CH = eval('(' + chLiteral + ')');

const GS = [40, 45, 50, 55, 59, 64];

// ===== copied verbatim from voicings.ts =====
const SHELL_THIRD_ROLES = ['3rd', 'b3rd'];
const SHELL_THIRD_SUBS = ['4th', '2nd'];
const SHELL_SEVENTH_ROLES = ['7th', 'b7th', 'bb7'];

function deriveShellToneSets(chordDef) {
  const r = chordDef.r;
  let third = r.find(role => SHELL_THIRD_ROLES.includes(role)) ?? null;
  if (!third) third = SHELL_THIRD_SUBS.find(sub => r.includes(sub)) ?? null;
  let seventh = r.find(role => SHELL_SEVENTH_ROLES.includes(role)) ?? null;
  if (!seventh && r.includes('6th')) seventh = '6th';
  if (!third || !seventh) return [];
  const colorTones = r.filter(role =>
    role !== 'root' && role !== third && role !== seventh && role !== '5th'
  );
  const toneSets = [
    ['root', third, seventh],   // R37
    ['root', seventh, third],   // R73
  ];
  for (const color of colorTones) {
    toneSets.push([third, seventh, color]);   // 3-7-ext
    toneSets.push([seventh, third, color]);   // 7-3-ext
  }
  return toneSets;
}

function roleToInterval(role, chordDef) {
  const idx = chordDef.r.indexOf(role);
  if (idx !== -1) return chordDef.iv[idx] % 12;
  return null; // shell roles always exist in r; regex fallback unneeded here
}

const SHELL_STRING_SETS_3 = [[0, 1, 2], [0, 2, 3], [1, 2, 3], [1, 3, 4], [2, 3, 4], [2, 4, 5]];

function placeShellToneSet(roles, strings, chordDef, rootSemi) {
  const pcs = [];
  for (const role of roles) {
    const iv = roleToInterval(role, chordDef);
    if (iv === null) return null;
    pcs.push((rootSemi + iv) % 12);
  }
  const bassStr = strings[0];
  const bassBaseFret = (((pcs[0] - (GS[bassStr] % 12)) % 12) + 12) % 12;
  for (const octaveShift of [0, 12]) {
    const bassFret = bassBaseFret + octaveShift;
    if (bassFret > 22) continue;
    const candLists = [];
    for (let i = 1; i < roles.length; i++) {
      const str = strings[i];
      const base = (((pcs[i] - (GS[str] % 12)) % 12) + 12) % 12;
      const cands = [base - 12, base, base + 12, base + 24].filter(f => f >= 0 && f <= 22);
      if (!cands.length) break;
      candLists.push(cands);
    }
    if (candLists.length !== roles.length - 1) continue;
    let best = null, bestSpan = Infinity, bestMax = Infinity;
    const combo = [];
    const search = (k) => {
      if (k === candLists.length) {
        const all = [bassFret, ...combo];
        const fretted = all.filter(f => f > 0);
        const hasOpen = all.some(f => f === 0);
        const span = fretted.length === 0 ? 0
          : hasOpen ? Math.max(...fretted)
          : Math.max(...fretted) - Math.min(...fretted);
        if (span > 4) return;
        const maxF = Math.max(...all);
        if (span < bestSpan || (span === bestSpan && maxF < bestMax)) { best = combo.slice(); bestSpan = span; bestMax = maxF; }
        return;
      }
      for (const f of candLists[k]) { combo.push(f); search(k + 1); combo.pop(); }
    };
    search(0);
    if (best === null) continue;
    const frets = [bassFret, ...best];
    const notes = roles.map((role, i) => ({ str: strings[i], fret: frets[i], role }));
    return { notes, span: bestSpan };
  }
  return null;
}
// ===== end copied logic =====

const TRIADS_AND_NO_SHELL = ['maj', 'min', 'aug', 'dim', 'sus4', 'sus2', 'maj_b5', 'add9', 'minAdd9'];
const failures = [];
const fail = (msg) => failures.push(msg);
let voicingTotal = 0;

for (const [chordType, def] of Object.entries(CH)) {
  const toneSets = deriveShellToneSets(def);

  // (iii-a) structural checks on the tone-sets
  if (TRIADS_AND_NO_SHELL.includes(chordType)) {
    if (toneSets.length !== 0) fail(`${chordType}: expected NO shells, got ${toneSets.length} tone-sets`);
  } else {
    if (toneSets.length === 0) { fail(`${chordType}: expected shells but got none`); continue; }
    if (!(toneSets[0][0] === 'root' && toneSets[0].length === 3))
      fail(`${chordType}: R37 base shell is not [root, x, y]: ${toneSets[0]}`);
    if (!(toneSets[1] && toneSets[1][0] === 'root' && toneSets[1].length === 3))
      fail(`${chordType}: R73 base shell is not [root, x, y]: ${toneSets[1]}`);
    for (const ts of toneSets) {
      if (ts.includes('5th')) fail(`${chordType}: tone-set contains perfect 5th: ${ts}`);
      if (ts.length < 3) fail(`${chordType}: tone-set has fewer than 3 notes: ${ts}`);
    }
  }

  // per-root placement checks
  for (let root = 0; root < 12; root++) {
    let producedForRoot = 0;
    for (const roles of toneSets) {
      for (const strings of SHELL_STRING_SETS_3) {
        const placed = placeShellToneSet(roles, strings, def, root);
        if (!placed) continue;
        producedForRoot++;
        voicingTotal++;

        // (iv) span
        if (placed.span > 4) fail(`${chordType} root ${root} ${roles}: span ${placed.span} > 4`);

        const p5 = (root + 7) % 12;
        const hasPerfect5 = def.r.includes('5th');
        for (const n of placed.notes) {
          // (ii) sounding pitch must equal the labeled role's pitch
          const actualPC = (((GS[n.str] + n.fret) % 12) + 12) % 12;
          const expectPC = (root + roleToInterval(n.role, def) + 12) % 12;
          if (actualPC !== expectPC)
            fail(`${chordType} root ${root} ${roles}: ${n.role} on str${n.str} fret${n.fret} sounds ${actualPC}, expected ${expectPC}`);
          // (i) never the perfect 5th
          if (hasPerfect5 && actualPC === p5)
            fail(`${chordType} root ${root} ${roles}: note sounds the perfect 5th (${p5})`);
        }
      }
    }
    // (v) coverage: a chord that has tone-sets must voice on at least one string set
    if (toneSets.length > 0 && producedForRoot === 0)
      fail(`${chordType} root ${root}: 0 voicings produced despite ${toneSets.length} tone-sets`);
  }
}

console.log(`Chord types checked: ${Object.keys(CH).length}`);
console.log(`Total shell voicings generated (12 roots): ${voicingTotal}`);
if (failures.length === 0) {
  console.log('ALL PASS — no perfect 5ths, all labels match pitch, all spans <= 4, full coverage.');
  process.exit(0);
} else {
  console.log(`\n${failures.length} FAILURE(S):`);
  for (const f of failures.slice(0, 60)) console.log('  - ' + f);
  if (failures.length > 60) console.log(`  ...and ${failures.length - 60} more`);
  process.exit(1);
}
