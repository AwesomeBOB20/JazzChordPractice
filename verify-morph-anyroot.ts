import { buildMorphSections } from './src/features/play/util/dictionaryVoicings';

const minFret = (v: any) => {
  let m = Infinity;
  for (const f of (v?.frets || [])) if (f && f.fret != null && f.fret < m) m = f.fret;
  return m;
};

let fails = 0;
const note = (s: string) => console.log(s);

for (const cat of ['triads', 'drop2', 'drop3', 'drop2and4'] as const) {
  // probe a few plausible string-set keys
  const sets = ['0,1,2,3', '1,2,3,4', '2,3,4,5', '0,2,3,4', '0,1,2', '1,2,3', '2,3,4', '3,4,5'];
  for (const ss of sets) {
    const atC = buildMorphSections(cat, 0, ss, false);   // specific root C
    const any = buildMorphSections(cat, 0, ss, true);    // ALL roots → should normalize
    if (any.length === 0) continue;
    note(`\n[${cat}] stringSet=${ss}  sections=${any.length}`);
    for (let si = 0; si < any.length; si++) {
      const secC = atC[si], secAny = any[si];
      const mins = secAny.cells.map(c => minFret(c.voicing));
      const gmin = Math.min(...mins);
      // (a) lowest fret == 1
      if (gmin !== 1) { fails++; note(`  ✗ ${secAny.inversionLabel}: gmin=${gmin} (expected 1)`); }
      // (b) same shift across all cells: anyFret - cFret constant per cell
      const shifts = secAny.cells.map((c, i) => minFret(c.voicing) - minFret(secC.cells[i].voicing));
      const uniform = shifts.every(s => s === shifts[0]);
      if (!uniform) { fails++; note(`  ✗ ${secAny.inversionLabel}: non-uniform shift ${JSON.stringify(shifts)}`); }
      // (c) morph order (quality list) identical between C and ANY
      const ordC = secC.cells.map(c => c.symbol).join('>');
      const ordA = secAny.cells.map(c => c.symbol).join('>');
      if (ordC !== ordA) { fails++; note(`  ✗ ${secAny.inversionLabel}: order changed`); }
      note(`  ✓ ${secAny.inversionLabel}: lowFret=${gmin}, shift=${shifts[0]}, order=[${ordA}]`);
    }
  }
}
note(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
process.exit(fails === 0 ? 0 : 1);
