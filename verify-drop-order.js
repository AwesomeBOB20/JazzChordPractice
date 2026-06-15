// Verify the EXPLORER group ordering (PlayScreen `guitarGroups` memo). Groups are ordered by the
// bass string = index of the first fretted string (0 = low-E … 5 = high-e). Most families read
// thickest-first (ascending: E→A→D). DROP families invert it (descending) so 1/3 = 4-3-2-1 (D bass),
// 2/3 = 5-4-3-2, 3/3 = 6-5-4-3. Mirrors the comparator in PlayScreen.tsx.
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
    const isDrop = ty === 'drop2' || ty === 'drop3' || ty === 'drop2and4';
    return isDrop ? bassB - bassA : bassA - bassB;
  }).map(g => g.tag);
};

let fails = 0;
const expect = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { console.log(`FAIL ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); fails++; }
  else console.log(`ok   ${name} -> ${JSON.stringify(got)}`);
};

// Drop 2 fed in arbitrary order → must come out 4321 (D bass, idx2), 5432 (A, idx1), 6543 (E, idx0).
expect('drop2', sortExplorer([
  mk('drop2', 0, '6543'), mk('drop2', 2, '4321'), mk('drop2', 1, '5432'),
]), ['4321', '5432', '6543']);

// Drop 3 (E idx0 + A idx1) → thin first = A (idx1) then E (idx0).
expect('drop3', sortExplorer([
  mk('drop3', 0, 'E'), mk('drop3', 1, 'A'),
]), ['A', 'E']);

// Shells UNCHANGED — thickest first: E (idx0) → A (idx1) → D (idx2).
expect('shells', sortExplorer([
  mk('shell', 2, 'D'), mk('shell', 0, 'E'), mk('shell', 1, 'A'),
]), ['E', 'A', 'D']);

console.log(`\nFAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
