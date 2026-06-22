// Guards the dom7♭13 spelling/colour: it borrows dom7♯5's drop SHAPES, but its +8 tone must stay a
// ♭13 (F over A, coloured as a 13) — never a ♯5 (E♯, coloured as a 5th). See FALLBACK_RELABEL in
// voicings.ts. Run: npx tsx verify-b13-spelling.ts
import { CH, spellInterval, ROLE_SHORT } from './src/shared/theory/musicTheory';
import { buildDropVoicings } from './src/shared/guitar';

let fails = 0;
// (1) spelling: b13 over A is F, #5 over A is E♯ — distinct on purpose.
if (spellInterval(9, 'b13', false) !== 'F') { fails++; console.log('✗ b13/A should spell F'); }
if (spellInterval(9, '#5', false) !== 'E♯') { fails++; console.log('✗ #5/A should spell E♯'); }

// (2) every dom7♭13 drop voicing labels its +8 tone b13, never #5.
const drops = buildDropVoicings('dom7b13', (CH as any)['dom7b13'], 9, 'A', 'A 7♭13', 'sharp');
let sharp5 = 0, total = 0;
for (const g of drops) for (const v of g.voicings) {
  total++;
  if ((v.frets || []).some((f: any) => f && f.fret != null && (f.role === '#5th' || ROLE_SHORT[f.role] === '#5'))) sharp5++;
}
if (sharp5 > 0) { fails++; console.log(`✗ ${sharp5}/${total} dom7♭13 drops still carry #5`); }

// (3) dom7♯5 itself MUST still spell its 5th as #5 (no over-correction).
const s5 = buildDropVoicings('dom7s5', (CH as any)['dom7s5'], 9, 'A', 'A 7♯5', 'sharp');
if (!s5.some(g => g.voicings.some(v => (v.frets || []).some((f: any) => f && f.role === '#5th')))) {
  fails++; console.log('✗ dom7♯5 lost its #5 (over-correction)');
}

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'} — ${total} dom7♭13 drops checked`);
process.exit(fails === 0 ? 0 : 1);
