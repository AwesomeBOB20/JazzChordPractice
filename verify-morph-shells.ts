import { buildMorphSections } from './src/features/play/util/dictionaryVoicings';

// bass string = index of the first fretted string
const bassStr = (v: any) => { const fr = v.frets || []; for (let i = 0; i < fr.length; i++) if (fr[i] && fr[i].fret != null) return i; return -1; };
const NAME: Record<string, string> = { '0': 'E', '1': 'A', '2': 'D' };

// compact string set of a grip, e.g. [0,2,3] → "643"
const setOf = (v: any) => (v.frets || []).map((f: any, i: number) => (f && f.fret != null ? 6 - i : null)).filter(Boolean).join('');
// the two physical sets each bass string hosts (consecutive + skip), both must appear.
const EXPECTED: Record<string, string[]> = { '0': ['654', '643'], '1': ['543', '532'], '2': ['432', '421'] };

let fails = 0;
for (const set of ['0', '1', '2'] as const) {
  const secs = buildMorphSections('shells', 0, set, false);
  console.log(`\n[shells] ${NAME[set]} Bass (string ${set})  sections=${secs.length}`);
  if (secs.length === 0) { fails++; console.log('  ✗ no sections'); continue; }
  const setsSeen = new Set<string>();
  for (const sec of secs) {
    let bad = 0;
    const pfx = sec.inversionLabel.split(' · ')[0]; // "654"
    for (const c of sec.cells) { setsSeen.add(setOf(c.voicing)); if (bassStr(c.voicing) !== Number(set) || setOf(c.voicing) !== pfx) bad++; }
    const qualities = sec.cells.map(c => c.symbol);
    const dup = qualities.length !== new Set(qualities).size;
    if (bad) { fails++; console.log(`  ✗ ${sec.inversionLabel}: ${bad} cells off bass/set`); }
    if (dup) { fails++; console.log(`  ✗ ${sec.inversionLabel}: duplicate quality`); }
    console.log(`  ${bad || dup ? '✗' : '✓'} ${sec.inversionLabel}: ${sec.cells.length} cells`);
  }
  // BOTH string sets for this bass must be present (the half-missing-shells fix).
  for (const want of EXPECTED[set]) if (!setsSeen.has(want)) { fails++; console.log(`  ✗ missing string set ${want}`); }
}
// every shell across the 3 bass sets should be reachable (no bass string outside 0/1/2)
const all = buildMorphSections('shells', 0, '0', false).concat(buildMorphSections('shells', 0, '1', false), buildMorphSections('shells', 0, '2', false));
console.log(`\ntotal cells across E/A/D: ${all.reduce((s, x) => s + x.cells.length, 0)}`);
// ANY normalization still lands lowest fret = 1
const any = buildMorphSections('shells', 0, '0', true);
const minF = (v: any) => Math.min(...(v.frets || []).filter((f: any) => f && f.fret != null).map((f: any) => f.fret));
for (const sec of any) { const g = Math.min(...sec.cells.map(c => minF(c.voicing))); if (g !== 1) { fails++; console.log(`  ✗ ANY ${sec.inversionLabel}: lowFret=${g}`); } }
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
process.exit(fails === 0 ? 0 : 1);
