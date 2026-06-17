/**
 * Generates rootless "guide-tone + color" drop-2-style grips for extended/altered chords,
 * in the DROP_VOICINGS note format [stringIdx, offsetFret, intervalIdx]. These surface via
 * buildDropVoicings' SELF PASS (the chord is fallback-mapped AND has its own DROP_VOICINGS
 * entry), labelled by the chord's own roles — so a 13#9 shows a voicing that actually contains
 * the #9 and 13, not just the R-3-5-b7 core.
 *
 * Each grip: 4 adjacent strings, pitches strictly ascending low->high, fret span <= MAX_SPAN.
 * Offsets are relative to the bass note (notes[0]), which is root-invariant — the builder
 * recomputes the absolute base fret per root at render time.
 *
 * Run: node scripts/genRootlessDrops.cjs
 */
const GS = [40, 45, 50, 55, 59, 64]; // standard tuning MIDI, low->high
const MAX_SPAN = 5;

// Dominant family. iv = semitone intervals from root; f = degree labels (for verification/labels).
const CH = {
  dom9:    { iv: [0,4,7,10,14],          f: ['R','3','5','b7','9'] },
  dom13:   { iv: [0,4,7,10,14,21],       f: ['R','3','5','b7','9','13'] },
  dom7s9:  { iv: [0,4,7,10,15],          f: ['R','3','5','b7','#9'] },
  dom7b9:  { iv: [0,4,7,10,13],          f: ['R','3','5','b7','b9'] },
  dom7alt: { iv: [0,4,8,10,13,15],       f: ['R','3','#5','b7','b9','#9'] },
  dom13b9: { iv: [0,4,7,10,13,17,21],    f: ['R','3','5','b7','b9','11','13'] },
  dom13s9: { iv: [0,4,7,10,15,17,21],    f: ['R','3','5','b7','#9','11','13'] },
};

// Rootless voicing tone sets, as intIdx into each chord's iv. Guide tones (3 & b7) + the
// color tones that define the chord; 5th/11th dropped where they don't earn their place.
const VOICINGS = {
  dom9:    [[1,2,3,4]],             // 3 5 b7 9
  dom13:   [[1,3,4,5]],             // 3 b7 9 13
  dom7s9:  [[1,2,3,4]],             // 3 5 b7 #9
  dom7b9:  [[1,2,3,4]],             // 3 5 b7 b9
  dom7alt: [[1,2,3,4],[1,2,3,5]],   // 3 #5 b7 b9   and   3 #5 b7 #9
  dom13b9: [[1,3,4,6]],             // 3 b7 b9 13
  dom13s9: [[1,3,4,6]],             // 3 b7 #9 13
};

const STRING_SETS = [
  { strs: [0,1,2,3], bass: 'E Bass' },
  { strs: [1,2,3,4], bass: 'A Bass' },
  { strs: [2,3,4,5], bass: 'D Bass' },
];

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

// Build one ascending grip for a tone->string assignment; null if span too wide.
function buildGrip(strs, tonesOnStrings, iv) {
  const frets = [];
  // bass (lowest string) at its lowest fret 0..11
  const bassPc = ((iv[tonesOnStrings[0]] % 12) + 12) % 12;
  let f0 = (((bassPc - (GS[strs[0]] % 12)) % 12) + 12) % 12;
  frets[0] = f0;
  let prevPitch = GS[strs[0]] + f0;
  for (let i = 1; i < 4; i++) {
    const pc = ((iv[tonesOnStrings[i]] % 12) + 12) % 12;
    let f = (((pc - (GS[strs[i]] % 12)) % 12) + 12) % 12;
    while (GS[strs[i]] + f <= prevPitch) f += 12; // strictly ascending pitch
    frets[i] = f;
    prevPitch = GS[strs[i]] + f;
  }
  const span = Math.max(...frets) - Math.min(...frets);
  if (span > MAX_SPAN) return null;
  return { frets, span };
}

// Verify a grip at several roots: each string's sounding pitch class must equal root+iv[intIdx].
function verifyGrip(strs, tonesOnStrings, frets, iv) {
  for (const root of [0, 3, 7, 11]) {
    const baseFret = (((root + iv[tonesOnStrings[0]]) % 12) - (GS[strs[0]] % 12) + 144) % 12;
    for (let i = 0; i < 4; i++) {
      const offset = frets[i] - frets[0];
      const fret = baseFret + offset;
      const soundingPc = (GS[strs[i]] + fret) % 12;
      const wantPc = ((root + iv[tonesOnStrings[i]]) % 12 + 12) % 12;
      if (((soundingPc % 12) + 12) % 12 !== wantPc) return false;
    }
  }
  return true;
}

let totalOk = 0, totalBad = 0;
const output = {};

// Guide-tone bass intervals: 3rd (iv semitone 4) and b7 (iv semitone 10). We voice the two classic
// rootless forms — "A" (3rd in the bass) and "B" (b7 in the bass) — per string set, choosing the
// most compact (min-span) ascending ordering of the upper three tones for playability.
const guideSemis = [4, 10];

for (const [type, sets] of Object.entries(VOICINGS)) {
  const iv = CH[type].iv;
  const f = CH[type].f;
  const grips = [];
  const seen = new Set();
  for (const toneSet of sets) {
    const guideBasses = toneSet.filter((t) => guideSemis.includes(iv[t] % 12));
    for (const ss of STRING_SETS) {
      for (const bass of guideBasses) {
        const upper = toneSet.filter((t) => t !== bass);
        let best = null;
        for (const ord of permutations(upper)) {
          const perm = [bass, ...ord];
          const g = buildGrip(ss.strs, perm, iv);
          if (!g) continue;
          if (!verifyGrip(ss.strs, perm, g.frets, iv)) { totalBad++; continue; }
          if (!best || g.span < best.g.span) best = { perm, g };
        }
        if (!best) continue;
        const sig = ss.strs.map((s, i) => `${s}:${best.g.frets[i]}`).join(',');
        if (seen.has(sig)) continue;
        seen.add(sig);
        const off = best.g.frets.map((fr) => fr - best.g.frets[0]);
        const notes = ss.strs.map((s, i) => [s, off[i], best.perm[i]]);
        const degrees = best.perm.map((t) => f[t]).join('-');
        grips.push({ ss: ss.bass, notes, degrees, span: best.g.span, bassDeg: f[bass] });
        totalOk++;
      }
    }
  }
  const ssOrder = { 'E Bass': 0, 'A Bass': 1, 'D Bass': 2 };
  grips.sort((a, b) => ssOrder[a.ss] - ssOrder[b.ss]);
  output[type] = grips;
}

// Emit pasteable DROP_VOICINGS entries
for (const [type, grips] of Object.entries(output)) {
  console.log(`\n    '${type}': [`);
  for (const g of grips) {
    const notesStr = g.notes.map((n) => `[${n[0]}, ${n[1]}, ${n[2]}]`).join(', ');
    console.log(`      { label: 'Rootless ${g.degrees} [${g.ss.split(' ')[0]} Str]', notes: [${notesStr}] },`);
  }
  console.log(`    ],`);
}

console.log(`\n// VERIFY: ${totalOk} grips OK, ${totalBad} rejected (pitch mismatch). Counts per type:`);
for (const [type, grips] of Object.entries(output)) {
  console.log(`//   ${type}: ${grips.length}`);
}
