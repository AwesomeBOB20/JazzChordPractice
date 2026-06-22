// Verify the EXPLORER group ordering (PlayScreen `guitarGroups` memo). Groups are ordered by the
// bass string = index of the first fretted string (0 = low-E … 5 = high-e). Two conventions:
//   • TREBLE-FIRST (triads, Drop 2): descending bass index — 3-2-1 / 4-3-2-1 (high) come first.
//   • BASS-FIRST (shells, Drop 3, Drop 2&4): ascending bass index — E bass (idx0) comes first.
// Mirrors the comparator in PlayScreen.tsx and TREBLE_FIRST_TYPES/BASS_FIRST_TYPES in voicings.ts.
'use strict';

// build a 6-string fret array with a 4-note voicing whose bass sits at `bassIdx` (0 = low E).
const mk = (type, bassIdx, tag) => {
  const frets = Array.from({ length: 6 }, (_, i) => ({ fret: (i >= bassIdx && i <= bassIdx + 3) ? 5 : null }));
  return { tag, voicings: [{ type, frets }] };
};
const sortExplorer = (groups) => {
  return [...groups].sort((a, b) => {
    const bassA = a.voicings[0]?.frets.findIndex(f => f.fret !== null) ?? 99;
    const bassB = b.voicings[0]?.frets.findIndex(f => f.fret !== null) ?? 99;
    const ty = a.voicings[0]?.type;
    const trebleFirst = ty === 'triad' || ty === 'drop2';
    return trebleFirst ? bassB - bassA : bassA - bassB;
  }).map(g => g.tag);
};

let fails = 0;
const expect = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { console.log(`FAIL ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); fails++; }
  else console.log(`ok   ${name} -> ${JSON.stringify(got)}`);
};

// TREBLE-FIRST. Triads → 3-2-1 (idx3) → 4-3-2 → 5-4-3 → 6-5-4 (idx0), highest string set first.
expect('triads', sortExplorer([
  mk('triad', 0, '654'), mk('triad', 3, '321'), mk('triad', 1, '543'), mk('triad', 2, '432'),
]), ['321', '432', '543', '654']);

// TREBLE-FIRST. Drop 2 → 4321 (D bass, idx2), 5432 (A, idx1), 6543 (E, idx0).
expect('drop2', sortExplorer([
  mk('drop2', 0, '6543'), mk('drop2', 2, '4321'), mk('drop2', 1, '5432'),
]), ['4321', '5432', '6543']);

// BASS-FIRST. Drop 3 (E idx0 + A idx1) → lowest bass first = E (idx0) then A (idx1).
expect('drop3', sortExplorer([
  mk('drop3', 1, 'A'), mk('drop3', 0, 'E'),
]), ['E', 'A']);

// BASS-FIRST. Drop 2&4 (E idx0 + A idx1) → E then A.
expect('drop2and4', sortExplorer([
  mk('drop2and4', 1, 'A'), mk('drop2and4', 0, 'E'),
]), ['E', 'A']);

// BASS-FIRST. Shells UNCHANGED — thickest first: E (idx0) → A (idx1) → D (idx2).
expect('shells', sortExplorer([
  mk('shell', 2, 'D'), mk('shell', 0, 'E'), mk('shell', 1, 'A'),
]), ['E', 'A', 'D']);

console.log(`\nFAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
