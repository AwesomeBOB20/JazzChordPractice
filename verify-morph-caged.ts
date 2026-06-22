import { buildCagedMorphSections, CAGED_MORPH_BOXES } from './src/features/play/util/dictionaryVoicings';

let fails = 0;
for (const cat of ['scales', 'arps', 'intervals', 'shapes'] as const) {
  console.log(`\n=== ${cat} ===`);
  for (let box = 0; box < CAGED_MORPH_BOXES; box++) {
    const secs = buildCagedMorphSections(cat, 0, box, 4, null);
    const totalCells = secs.reduce((s, sec) => s + sec.cells.length, 0);
    // every cell must carry an arpShape (not a voicing) and have notes
    let bad = 0;
    for (const sec of secs) for (const c of sec.cells) {
      if (!c.arpShape || !(c.arpShape.notes || []).length) bad++;
      if (!c.label) bad++;
    }
    if (bad) { fails++; console.log(`  ✗ Box ${box + 1}: ${bad} bad cells`); }
    const sample = secs[0];
    console.log(`  Box ${box + 1}: ${secs.length} sections, ${totalCells} cells${sample ? `  e.g. [${sample.inversionLabel}] ${sample.cells.slice(0,3).map(c => c.label).join(', ')}` : ''}`);
  }
}

// neck-order check: within a family, box 1's minFret <= box 2's for the SAME item
const scaleB1 = buildCagedMorphSections('scales', 0, 0, 4, null);
const scaleB2 = buildCagedMorphSections('scales', 0, 1, 4, null);
const find = (secs: any[], label: string) => { for (const s of secs) for (const c of s.cells) if (c.label === label) return c; return null; };
const ion1 = find(scaleB1, 'Ionian'), ion2 = find(scaleB2, 'Ionian');
if (ion1 && ion2) {
  const f1 = ion1.arpShape.minFret, f2 = ion2.arpShape.minFret;
  console.log(`\nneck order: Ionian box1 minFret=${f1}, box2 minFret=${f2}  ${f1 <= f2 ? '✓' : '✗'}`);
  if (f1 > f2) fails++;
}
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
process.exit(fails === 0 ? 0 : 1);
