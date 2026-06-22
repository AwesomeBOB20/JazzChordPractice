import { buildMorphSections } from './src/features/play/util/dictionaryVoicings';

// bass string = index of the first fretted string
const bassStr = (v: any) => { const fr = v.frets || []; for (let i = 0; i < fr.length; i++) if (fr[i] && fr[i].fret != null) return i; return -1; };
const NAME: Record<string, string> = { '0': 'E', '1': 'A', '2': 'D' };

let fails = 0;
for (const set of ['0', '1', '2'] as const) {
  const secs = buildMorphSections('shells', 0, set, false);
  console.log(`\n[shells] ${NAME[set]} Bass (string ${set})  sections=${secs.length}`);
  if (secs.length === 0) { fails++; console.log('  ✗ no sections'); continue; }
  for (const sec of secs) {
    let bad = 0;
    for (const c of sec.cells) if (bassStr(c.voicing) !== Number(set)) bad++;
    const qualities = sec.cells.map(c => c.symbol);
    const dup = qualities.length !== new Set(qualities).size;
    if (bad) { fails++; console.log(`  ✗ ${sec.inversionLabel}: ${bad} cells off bass string`); }
    if (dup) { fails++; console.log(`  ✗ ${sec.inversionLabel}: duplicate quality`); }
    console.log(`  ${bad || dup ? '✗' : '✓'} ${sec.inversionLabel}: ${sec.cells.length} cells`);
  }
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
