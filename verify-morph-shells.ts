import { buildMorphSections } from './src/features/play/util/dictionaryVoicings';

const G3 = new Set(['3rd', 'b3rd', '4th', '2nd']);
const G7 = new Set(['7th', 'b7th', 'bb7', '6th']);
const LOCK: Record<string, [number, number]> = { b01: [2, 3], b12: [3, 4] };

let fails = 0;
for (const lock of ['b01', 'b12'] as const) {
  const secs = buildMorphSections('shells', 0, lock, false);
  console.log(`\n[shells] lock=${lock} (${LOCK[lock].join('&')})  sections=${secs.length}`);
  if (secs.length === 0) { fails++; console.log('  ✗ no sections'); continue; }
  for (const sec of secs) {
    const qualities = sec.cells.map(c => c.symbol);
    // every cell's guide tones must sit on the locked pair
    let bad = 0;
    for (const c of sec.cells) {
      let s3: number | null = null, s7: number | null = null;
      (c.voicing.frets || []).forEach((f: any, i: number) => {
        if (f && f.fret != null) { if (G3.has(f.role)) s3 = i; else if (G7.has(f.role)) s7 = i; }
      });
      const pair = LOCK[lock];
      const ok = s3 != null && s7 != null && s3 !== s7 &&
        (s3 === pair[0] || s3 === pair[1]) && (s7 === pair[0] || s7 === pair[1]);
      if (!ok) { bad++; }
    }
    // one voicing per quality (no dup quality within a section)
    const dup = qualities.length !== new Set(qualities).size;
    if (bad) { fails++; console.log(`  ✗ ${sec.inversionLabel}: ${bad} cells off-lock`); }
    if (dup) { fails++; console.log(`  ✗ ${sec.inversionLabel}: duplicate quality`); }
    console.log(`  ${bad || dup ? '✗' : '✓'} ${sec.inversionLabel}: ${sec.cells.length} cells [${qualities.join(' ')}]`);
  }
}

// All-roots normalization sanity for shells
const any = buildMorphSections('shells', 0, 'b01', true);
const minF = (v: any) => Math.min(...(v.frets || []).filter((f: any) => f && f.fret != null).map((f: any) => f.fret));
for (const sec of any) {
  const g = Math.min(...sec.cells.map(c => minF(c.voicing)));
  if (g !== 1) { fails++; console.log(`  ✗ ANY ${sec.inversionLabel}: lowFret=${g}`); }
}
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
process.exit(fails === 0 ? 0 : 1);
