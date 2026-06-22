import { buildMorphSections, SHELL_MORPH_SETS } from './src/features/play/util/dictionaryVoicings';

// compact string set of a grip, e.g. [0,2,3] → "643"
const setOf = (v: any) => (v.frets || []).map((f: any, i: number) => (f && f.fret != null ? 6 - i : null)).filter(Boolean).join('');

let fails = 0;
// Each of the six shell sets is its OWN clean morph: every cell sits on exactly that string set, and no
// quality repeats within an inversion section.
for (const s of SHELL_MORPH_SETS) {
  const secs = buildMorphSections('shells', 0, s.key, false);
  console.log(`\n[shells] ${s.label} (key ${s.key})  sections=${secs.length}`);
  if (secs.length === 0) { fails++; console.log('  ✗ no sections'); continue; }
  for (const sec of secs) {
    let bad = 0;
    for (const c of sec.cells) if (setOf(c.voicing) !== s.set) bad++;
    const q = sec.cells.map(c => c.symbol);
    const dup = q.length !== new Set(q).size;
    if (bad) { fails++; console.log(`  ✗ ${sec.inversionLabel}: ${bad} cells off set ${s.set}`); }
    if (dup) { fails++; console.log(`  ✗ ${sec.inversionLabel}: duplicate quality`); }
    console.log(`  ${bad || dup ? '✗' : '✓'} ${sec.inversionLabel}: ${sec.cells.length} cells`);
  }
}
// All six sets exist (two per bass — no skip-string shape hidden).
const expected = ['654', '643', '543', '532', '432', '421'];
for (const e of expected) if (!SHELL_MORPH_SETS.some(s => s.set === e)) { fails++; console.log(`✗ missing set ${e}`); }

// ANY normalization still lands lowest fret = 1.
const any = buildMorphSections('shells', 0, '0,1,2', true);
const minF = (v: any) => Math.min(...(v.frets || []).filter((f: any) => f && f.fret != null).map((f: any) => f.fret));
for (const sec of any) { const g = Math.min(...sec.cells.map(c => minF(c.voicing))); if (g !== 1) { fails++; console.log(`  ✗ ANY ${sec.inversionLabel}: lowFret=${g}`); } }

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
process.exit(fails === 0 ? 0 : 1);
