// True drop-voicing generator for dropVoicings.ts
// Computes Drop 2, Drop 3, Drop 2&4 from music-theory first principles.
//
// Drop 2  = take close-position 4-voice chord, drop the 2nd-from-top voice an octave.
// Drop 3  = drop the 3rd-from-top voice an octave.
// Drop 2&4= drop both 2nd-from-top AND 4th-from-top (bass) voices an octave.
//
// Run: node gen-drops.js
//   → prints updated dropVoicings.ts to stdout
// Run: node gen-drops.js --apply
//   → writes directly to src/shared/guitar/dropVoicings.ts

const fs = require('fs');
const path = require('path');

// Guitar standard tuning
const GS_PC   = [4, 9, 2, 7, 11, 4];          // pitch class of each open string (E A D G B e)
const GS_MIDI = [40, 45, 50, 55, 59, 64];      // MIDI note of each open string

// ─────────────────────────────────────────────────────────────────
// Chord types: intervals in semitones from root (mod-12 pitch class)
// ─────────────────────────────────────────────────────────────────
const CHORD_TYPES = {
  'maj7':     [0, 4, 7, 11],
  'min7':     [0, 3, 7, 10],
  'dom7':     [0, 4, 7, 10],
  'hdim7':    [0, 3, 6, 10],
  'fdim7':    [0, 3, 6, 9],
  'minMaj7':  [0, 3, 7, 11],
  'dom7sus4': [0, 5, 7, 10],
  'maj7s5':   [0, 4, 8, 11],
  'dom7b5':   [0, 4, 6, 10],
  'dom7s5':   [0, 4, 8, 10],
  'maj6':     [0, 4, 7, 9],
  'min6':     [0, 3, 7, 9],
  'add9':     [0, 4, 7, 14],   // 9th = 14 st; pitch class 2 but placed above other tones
  'minAdd9':  [0, 3, 7, 14],
  'dimMaj7':  [0, 3, 6, 11],
};

// ─────────────────────────────────────────────────────────────────
// Voice orders: which intIdx goes on each string, from LOWEST to HIGHEST string.
// Derived from the drop-voicing formula applied to each inversion of close position.
//
//   Close-position inversions (v0=bass, v3=top, intIdx 0–3):
//   Root: v=[0,1,2,3]   1st: v=[1,2,3,0+oct]   2nd: v=[2,3,0+2oct,1+oct]   3rd: v=[3,0+2oct,1+oct,2+oct]
//
//   Drop 2 (drop v2 down an octave → it becomes new bass):
//   Root:[2,0,1,3]  1st:[3,1,2,0]  2nd:[0,2,3,1]  3rd:[1,3,0,2]
//
//   Drop 3 (drop v1 down an octave → new bass):
//   Root:[1,0,2,3]  1st:[2,1,3,0]  2nd:[3,2,0,1]  3rd:[0,3,1,2]
//
//   Drop 2&4 (drop v0 AND v2 → order: v0',v2',v1,v3):
//   Root:[0,2,1,3]  1st:[1,3,2,0]  2nd:[2,0,3,1]  3rd:[3,1,0,2]
// ─────────────────────────────────────────────────────────────────
const VOICE_ORDERS = {
  drop2:    [[2,0,1,3],[3,1,2,0],[0,2,3,1],[1,3,0,2]],
  drop3:    [[1,0,2,3],[2,1,3,0],[3,2,0,1],[0,3,1,2]],
  drop2and4:[[0,2,1,3],[1,3,2,0],[2,0,3,1],[3,1,0,2]],
};

// ─────────────────────────────────────────────────────────────────
// String groups: indices of guitar strings (0=low E … 5=high e)
// used for each drop type, listed low-to-high.
// ─────────────────────────────────────────────────────────────────
const STRING_GROUPS = {
  drop2:    [[0,1,2,3],[1,2,3,4],[2,3,4,5]],   // E-A-D-G, A-D-G-B, D-G-B-e
  drop3:    [[0,2,3,4],[1,3,4,5]],              // E-D-G-B, A-G-B-e
  drop2and4:[[0,1,3,4],[1,2,4,5]],             // E-A-G-B, A-D-B-e
};

// Label suffix for each string group
const STRING_LABELS = {
  drop2:    ['E Str','A Str','D Str'],
  drop3:    ['E Str','A Str'],
  drop2and4:['E Str','A Str'],
};

// Max fret-span allowed per drop type (non-open fretted notes only)
const MAX_SPAN = { drop2: 5, drop3: 6, drop2and4: 6 };

// Inversion names
const INV_NAMES = ['Root Pos','1st Inv','2nd Inv','3rd Inv'];

// ─────────────────────────────────────────────────────────────────
// computeShape: try to place 4 voices on 4 strings with pitches ascending
// and fret span ≤ maxSpan.
// Returns [[strIdx, offsetFromBass, intIdx], ...] or null.
// ─────────────────────────────────────────────────────────────────
function computeShape(ivs, voiceOrder, strings, maxSpan) {
  const bassIntIdx = voiceOrder[0];
  const bassPC = ivs[bassIntIdx] % 12;
  const bassStr = strings[0];

  for (let bassOct = 0; bassOct <= 1; bassOct++) {
    const baseFret = (bassPC - GS_PC[bassStr] + 12) % 12 + bassOct * 12;
    if (baseFret > 22) continue;
    const baseMidi = GS_MIDI[bassStr] + baseFret;

    const frets = [baseFret];
    let valid = true;

    for (let i = 1; i < 4; i++) {
      const vi = voiceOrder[i];
      const pc = ivs[vi] % 12;
      const s = strings[i];
      const strMidi = GS_MIDI[s];
      const prevMidi = GS_MIDI[strings[i-1]] + frets[i-1];
      const baseF = (pc - GS_PC[s] + 12) % 12;

      let placed = false;
      for (let oct = 0; oct <= 2; oct++) {
        const fv = baseF + oct * 12;
        if (fv > 22) break;
        if (strMidi + fv > prevMidi) {
          frets.push(fv);
          placed = true;
          break;
        }
      }
      if (!placed) { valid = false; break; }
    }

    if (!valid) continue;

    // Compute span: if any open string (fret 0), span = max(fretted); otherwise max-min of fretted
    const fretted = frets.filter(f => f > 0);
    let span;
    if (fretted.length === 0) span = 0;
    else if (frets.some(f => f === 0)) span = Math.max(...fretted);  // open strings inflate span
    else span = Math.max(...fretted) - Math.min(...fretted);

    if (span > maxSpan) continue;

    const bassFret0 = frets[0];
    const notes = strings.map((s, i) => [s, frets[i] - bassFret0, voiceOrder[i]]);
    return notes;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Generate all shapes for one chord type and drop category
// ─────────────────────────────────────────────────────────────────
function generateForType(ivs, dropType) {
  const voiceOrders = VOICE_ORDERS[dropType];
  const strGroups = STRING_GROUPS[dropType];
  const strLabels = STRING_LABELS[dropType];
  const dropLabel = dropType === 'drop2' ? 'Drop 2' : dropType === 'drop3' ? 'Drop 3' : 'Drop 2 & 4';
  const maxSpan = MAX_SPAN[dropType];

  const shapes = [];
  // Iterate: for each string group, for each inversion
  // (matching the existing label order: [E Str] inv0..3, [A Str] inv0..3, [D Str] inv0..3)
  for (let gi = 0; gi < strGroups.length; gi++) {
    const strings = strGroups[gi];
    const strLabel = strLabels[gi];
    for (let inv = 0; inv < 4; inv++) {
      const voiceOrder = voiceOrders[inv];
      const label = `${dropLabel} (${INV_NAMES[inv]}) [${strLabel}]`;
      const notes = computeShape(ivs, voiceOrder, strings, maxSpan);
      if (notes) {
        shapes.push({ label, notes });
      }
      // If null: no playable shape for this combination (skip)
    }
  }
  return shapes;
}

// ─────────────────────────────────────────────────────────────────
// Build the full DROP_VOICINGS object
// ─────────────────────────────────────────────────────────────────
function buildDropVoicings() {
  const result = { drop2: {}, drop3: {}, drop2and4: {} };

  for (const [typeName, ivs] of Object.entries(CHORD_TYPES)) {
    result.drop2[typeName]     = generateForType(ivs, 'drop2');
    result.drop3[typeName]     = generateForType(ivs, 'drop3');
    result.drop2and4[typeName] = generateForType(ivs, 'drop2and4');
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Serialise to TypeScript source
// ─────────────────────────────────────────────────────────────────
function serialise(dv) {
  const lines = [];
  lines.push('export const DROP_VOICINGS = {');

  for (const dropType of ['drop2', 'drop3', 'drop2and4']) {
    const dropLabel = dropType === 'drop2' ? 'Drop 2' : dropType === 'drop3' ? 'Drop 3' : 'Drop 2 & 4';
    lines.push(`  ${dropType}: {`);

    for (const [typeName, shapes] of Object.entries(dv[dropType])) {
      lines.push(`    '${typeName}': [`);
      for (const sh of shapes) {
        const notesStr = sh.notes.map(n => `[${n.join(', ')}]`).join(', ');
        lines.push(`      { label: '${sh.label}', notes: [${notesStr}] },`);
      }
      lines.push(`    ],`);
    }

    lines.push(`  },`);
  }

  lines.push('};');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// Verify: check that each generated shape actually sounds correct
// ─────────────────────────────────────────────────────────────────
function verify(dv) {
  let errors = 0;
  for (const [dropType, types] of Object.entries(dv)) {
    for (const [typeName, shapes] of Object.entries(types)) {
      const ivs = CHORD_TYPES[typeName];
      for (const sh of shapes) {
        // Simulate buildDropVoicings for root = C (rootSemi = 0)
        const bassNote = sh.notes[0];
        const bassStr = bassNote[0];
        const bassRefOffset = bassNote[1]; // 0
        const bassIntIdx = bassNote[2];
        const bassPC = ivs[bassIntIdx] % 12;
        const baseFret = (bassPC - GS_PC[bassStr] + 12) % 12;

        let prevMidi = -Infinity;
        for (const [strIdx, offset, intIdx] of sh.notes) {
          const fret = baseFret + (offset - bassRefOffset);
          const actualPC = (GS_PC[strIdx] + fret) % 12;
          const expectedPC = ivs[intIdx] % 12;
          if (actualPC !== expectedPC) {
            console.error(`PITCH ERR ${typeName}/${dropType} "${sh.label}": str${strIdx} fret${fret} PC=${actualPC} expected=${expectedPC} (intIdx=${intIdx})`);
            errors++;
          }
          const midi = GS_MIDI[strIdx] + fret;
          if (midi <= prevMidi) {
            console.error(`ORDER ERR ${typeName}/${dropType} "${sh.label}": midi ${midi} not above ${prevMidi}`);
            errors++;
          }
          prevMidi = midi;
        }
      }
    }
  }
  if (errors === 0) console.error('✓ All shapes verified correct');
  else console.error(`✗ ${errors} errors`);
}

// ─────────────────────────────────────────────────────────────────
// Print coverage summary
// ─────────────────────────────────────────────────────────────────
function summarise(dv) {
  for (const [dropType, types] of Object.entries(dv)) {
    for (const [typeName, shapes] of Object.entries(types)) {
      if (shapes.length === 0) {
        console.error(`WARNING: ${typeName}/${dropType} has 0 shapes!`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
const dv = buildDropVoicings();
verify(dv);
summarise(dv);

const src = serialise(dv);

const apply = process.argv.includes('--apply');
if (apply) {
  const dest = path.join(__dirname, 'src/shared/guitar/dropVoicings.ts');
  fs.writeFileSync(dest, src, 'utf8');
  console.error(`Written to ${dest}`);
} else {
  process.stdout.write(src);
}
