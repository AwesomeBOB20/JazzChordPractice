// DIAGNOSTIC: chord/parent-scale mismatches where a chord tone is ABSENT from the chord's parent
// scale(s). This was the root cause of the quiz "interval shows only the root" bug: the quiz drew an
// interval by filtering the chord's PARENT SCALE box down to the interval's two pitch classes
// (buildArpVoicings), so a tone missing from the parent scale (e.g. dom7b13's natural 5th vs the
// altered/whole-tone scale) was dropped — a "P5" rendered as just the root.
//
// FIXED for INTERVALS (QuizScreen now builds interval diagrams from INTERVAL_SCALES, which always
// contains both notes — independent of the parent scale). The findings below remain as documentation
// and a watch-list: the ARP quiz path still filters the parent scale, so a chord tone missing from
// its parent scale could still drop there. Run: node verify-quiz-intervals.js
'use strict';
const fs = require('fs');

const src = fs.readFileSync('src/shared/theory/musicTheory.ts', 'utf8');
function extractObj(marker) {
  const start = src.indexOf(marker);
  const braceStart = src.indexOf('= {', start) + 2; // skip the TS type annotation's braces
  // find matching close brace
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const lit = src.slice(braceStart, i + 1);
  // eslint-disable-next-line no-eval
  return eval('(' + lit + ')');
}
const CH = extractObj('export const CH');
const SCALES = extractObj('export const SCALES');
const CHORD_SCALE_MAP = extractObj('export const CHORD_SCALE_MAP');

const intNames = ['P1','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','P8','m9','M9','m10','M10','P11','aug11','P12','m13','M13'];

let broken = 0, totalPairs = 0;
const brokenByChord = {};

for (const ct of Object.keys(CH)) {
  const ivs = CH[ct].iv;
  const scaleIds = CHORD_SCALE_MAP[ct] || [];
  // union of parent-scale pitch classes
  const scalePcs = new Set();
  for (const sid of scaleIds) {
    const sc = SCALES[sid];
    if (!sc) continue;
    sc.iv.forEach(iv => scalePcs.add(((iv % 12) + 12) % 12));
  }
  for (let i = 0; i < ivs.length - 1; i++) {
    for (let j = i + 1; j < ivs.length; j++) {
      totalPairs++;
      const st = Math.abs(ivs[j] - ivs[i]);
      const label = intNames[st] || `${st}st`;
      const pcLo = ((ivs[i] % 12) + 12) % 12;
      const pcHi = ((ivs[j] % 12) + 12) % 12;
      const missLo = !scalePcs.has(pcLo);
      const missHi = !scalePcs.has(pcHi);
      if (scaleIds.length === 0 || missLo || missHi) {
        broken++;
        (brokenByChord[ct] = brokenByChord[ct] || []).push(
          `${label} [${ivs[i]},${ivs[j]}] pcs{${pcLo},${pcHi}}` +
          (scaleIds.length === 0 ? ' NO-PARENT-SCALE' : `${missLo ? ` missing pc${pcLo}` : ''}${missHi ? ` missing pc${pcHi}` : ''}`)
        );
      }
    }
  }
}

console.log(`Chord types: ${Object.keys(CH).length}, interval pairs: ${totalPairs}, BROKEN (a note would drop): ${broken}\n`);
for (const ct of Object.keys(brokenByChord)) {
  console.log(`${ct} (${CH[ct].l}) parent=[${(CHORD_SCALE_MAP[ct]||[]).join(',')||'NONE'}]`);
  brokenByChord[ct].forEach(s => console.log(`   ${s}`));
}
