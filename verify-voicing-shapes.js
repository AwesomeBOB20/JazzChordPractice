// Standalone correctness check for the HAND-ENTERED open & barre chord shapes in
// src/shared/guitar/voicings.ts. These fret/role tables are typed by hand (a single
// wrong fret = a wrong note), so for every shape variation we compute the real note
// from each fret and assert:
//   (i)   the note's interval above the shape's root matches its labeled role
//   (ii)  that interval is an actual chord tone for the chord type
//   (iii) the shape contains the root, and uses only that chord's tones
//
// CH pitch-class sets are pulled from musicTheory.ts; the shape tables from
// voicings.ts. No transcription. Run: node verify-voicing-shapes.js
'use strict';
const fs = require('fs');

const GS = [40, 45, 50, 55, 59, 64]; // E A D G B E (open string MIDI)

function extractLiteral(src, decl) {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error('not found: ' + decl);
  // Anchor on the assignment "= {" so we skip any type annotation braces (e.g.
  // Record<string, { ... }>) that appear before the actual value.
  const braceStart = src.indexOf('= {', start) + 2;
  let depth = 0, end = braceStart;
  for (let i = braceStart; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval('(' + src.slice(braceStart, end + 1) + ')');
}

const mtSrc = fs.readFileSync('src/shared/theory/musicTheory.ts', 'utf8');
const vSrc = fs.readFileSync('src/shared/guitar/voicings.ts', 'utf8');

const CH = extractLiteral(mtSrc, 'export const CH');
const OPEN_SHAPES = extractLiteral(vSrc, 'export const OPEN_SHAPES');
const BARRE_SHAPES = extractLiteral(vSrc, 'export const BARRE_SHAPES');

// Role label -> semitone (mod 12). Shapes mix ordinal ('3rd','5th') and flat/sharp
// formula ('b3','b7','#5') styles, so cover both.
const ROLE_SEMI = {
  'root': 0, 'R': 0, '1': 0,
  '2nd': 2, '2': 2, 'b2': 1, '#2': 3,
  '3rd': 4, '3': 4, 'b3': 3, 'b3rd': 3,
  '4th': 5, '4': 5, '#4': 6,
  '5th': 7, '5': 7, 'b5': 6, 'b5th': 6, '#5': 8, '#5th': 8,
  '6th': 9, '6': 9, 'bb7': 9,
  'b7th': 10, 'b7': 10, '7th': 11, '7': 11,
  'b9': 1, '9th': 2, '9': 2, '#9': 3,
  '11th': 5, '11': 5, '#11': 6,
  'b13': 8, '13th': 9, '13': 9,
};

let errors = 0, warnings = 0, shapesChecked = 0;
const fail = (ctx, msg) => { console.log(`  ✗ ${ctx}: ${msg}`); errors++; };
const warn = (ctx, msg) => { console.log(`  ⚠ ${ctx}: ${msg}`); warnings++; };

function checkTable(tableName, table) {
  for (const type of Object.keys(table)) {
    const ch = CH[type];
    if (!ch) { fail(`${tableName}.${type}`, 'chord type not in CH'); continue; }
    const chordPcs = new Set(ch.iv.map(x => ((x % 12) + 12) % 12));

    table[type].forEach((shape, si) => {
      const ctx = `${tableName} ${type}[${si}] "${shape.name || ''}${shape.variation ? ' / ' + shape.variation : ''}"`;
      const R = ((shape.rootSemi % 12) + 12) % 12;
      const { frets, roles } = shape;
      if (!frets || !roles || frets.length !== roles.length) {
        fail(ctx, `frets/roles length mismatch (${frets && frets.length} vs ${roles && roles.length})`);
        return;
      }
      shapesChecked++;
      let sawRoot = false;
      for (let i = 0; i < frets.length; i++) {
        const fret = frets[i];
        const role = roles[i];
        if (fret === null || fret === undefined) {
          if (role !== null && role !== undefined) warn(ctx, `string ${i}: muted fret but role "${role}" labeled`);
          continue;
        }
        if (role === null || role === undefined) { warn(ctx, `string ${i}: fret ${fret} sounding but no role`); continue; }
        const notePc = (GS[i] + fret) % 12;
        const interval = ((notePc - R) % 12 + 12) % 12;
        if (role === 'root' || role === 'R' || role === '1') sawRoot = true;
        // (i) role label matches the interval
        if (!(role in ROLE_SEMI)) {
          warn(ctx, `string ${i}: unknown role "${role}"`);
        } else if (ROLE_SEMI[role] % 12 !== interval) {
          fail(ctx, `string ${i} fret ${fret}: role "${role}" implies ${ROLE_SEMI[role] % 12} but note is ${interval} semitones above root`);
        }
        // (ii) the note is an actual chord tone
        if (!chordPcs.has(interval)) {
          fail(ctx, `string ${i} fret ${fret}: interval ${interval} is NOT a chord tone of ${type} (tones: ${[...chordPcs].sort((a,b)=>a-b).join(',')})`);
        }
      }
      // (iii) shape contains the root
      if (!sawRoot) warn(ctx, 'no root note in this shape (rootless)');
    });
  }
}

checkTable('OPEN', OPEN_SHAPES);
checkTable('BARRE', BARRE_SHAPES);

console.log(`\nChecked ${shapesChecked} open/barre shape variations.`);
console.log(`${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
