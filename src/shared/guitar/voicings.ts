import { CH, PATTERNS, CHORD_PATTERN_MAP, spellInterval, NOTE_SHARP, NOTE_FLAT, SCALES, CHORD_SCALE_MAP } from '@shared/theory/musicTheory';
import { formatChordSymbol } from '@shared/theory/core/nomenclature';
import { HARDCODED_SHAPES } from '@shared/guitar/hardcodedShapes';
// NEW IMPORTS: Pull in the separated data dictionaries
import { DROP_VOICINGS } from '@shared/guitar/dropVoicings';
import { CAGED_SCALE_TEMPLATES } from '@shared/guitar/caged';

// Embedded mask spans for 7-note scales and full arpeggios
export const SCALE_MASKS = [
  { name: 'Box 1 (E Shape)', rootStr: 0, m: { min: -1, max: 4 }, s: [[-1,3],[-1,3],[-1,3],[-1,3],[-1,3],[-1,3]] },
  { name: 'Box 2 (D Shape)', rootStr: 2, m: { min: -1, max: 3 }, s: [[0,3],[0,3],[-1,3],[-1,3],[-1,3],[-1,3]] },
  { name: 'Box 3 (C Shape)', rootStr: 1, m: { min: -3, max: 1 }, s: [[-3,1],[-3,1],[-3,1],[-3,1],[-3,1],[-3,1]] },
  { name: 'Box 4 (A Shape)', rootStr: 1, m: { min: -1, max: 3 }, s: [[0,3],[0,3],[-1,3],[-1,3],[-1,3],[-1,3]] },
  { name: 'Box 5 (G Shape)', rootStr: 0, m: { min: -3, max: 1 }, s: [[-3,1],[-3,1],[-3,1],[-3,1],[-3,1],[-3,1]] },
];

// Guitar open string MIDI values: low E to high E
export const GS = [40, 45, 50, 55, 59, 64];

export interface VoicingFret {
  fret: number | null;
  role: string | null;
  finger: number;
}

export interface Voicing {
  name: string;
  chordLabel: string;  // e.g. "B Minor", "G Major", "D Augmented"
  frets: VoicingFret[];
  fingerprint: string;
  bassNote: string;
  type: 'triad' | 'shell' | 'drop2' | 'drop3' | 'drop2and4' | 'open' | 'barre';
  capo?: number;
}

export interface VoicingGroup {
  label: string;
  stringNums: string;
  voicings: Voicing[];
}

const BARRE_SHAPES: Record<string, { name: string; rootSemi: number; variation: string; frets: (number | null)[]; roles: (string | null)[]; fingers?: (number | null)[] }[]> = {
  'maj': [
    { name: 'E Shape', rootSemi: 4, variation: 'Standard', frets: [0, 2, 2, 1, 0, 0], roles: ['root', '5th', 'root', '3rd', '5th', 'root'] },
    { name: 'A Shape', rootSemi: 9, variation: 'Standard', frets: [null, 0, 2, 2, 2, 0], roles: [null, 'root', '5th', 'root', '3rd', '5th'] },
  ],
  'min': [
    { name: 'E Shape (Minor)', rootSemi: 4, variation: 'Standard', frets: [0, 2, 2, 0, 0, 0], roles: ['root', '5th', 'root', 'b3', '5th', 'root'] },
    { name: 'A Shape (Minor)', rootSemi: 9, variation: 'Standard', frets: [null, 0, 2, 2, 1, 0], roles: [null, 'root', '5th', 'root', 'b3', '5th'] },
  ],
  'dom7': [
    { name: 'E Shape 7', rootSemi: 4, variation: 'Standard', frets: [0, 2, 0, 1, 0, 0], roles: ['root', '5th', 'b7', '3rd', '5th', 'root'] },
    { name: 'E Shape 7', rootSemi: 4, variation: 'High b7', frets: [0, 2, 0, 1, 3, 0], roles: ['root', '5th', 'b7', '3rd', 'b7', 'root'] },
    { name: 'A Shape 7', rootSemi: 9, variation: 'Standard', frets: [null, 0, 2, 0, 2, 0], roles: [null, 'root', '5th', 'b7', '3rd', '5th'] },
    { name: 'A Shape 7', rootSemi: 9, variation: 'High b7', frets: [null, 0, 2, 0, 2, 3], roles: [null, 'root', '5th', 'b7', '3rd', 'b7'] },
  ],
  'maj7': [
    { name: 'E Shape Maj7', rootSemi: 4, variation: 'Standard', frets: [0, 2, 1, 1, 0, 0], roles: ['root', '5th', '7th', '3rd', '5th', 'root'] },
    { name: 'A Shape Maj7', rootSemi: 9, variation: 'Standard', frets: [null, 0, 2, 1, 2, 0], roles: [null, 'root', '5th', '7th', '3rd', '5th'] },
  ],
  'min7': [
    { name: 'E Shape Min7', rootSemi: 4, variation: 'Standard', frets: [0, 2, 0, 0, 0, 0], roles: ['root', '5th', 'b7', 'b3', '5th', 'root'] },
    { name: 'E Shape Min7', rootSemi: 4, variation: 'High b7', frets: [0, 2, 0, 0, 3, 0], roles: ['root', '5th', 'b7', 'b3', 'b7', 'root'] },
    { name: 'A Shape Min7', rootSemi: 9, variation: 'Standard', frets: [null, 0, 2, 0, 1, 0], roles: [null, 'root', '5th', 'b7', 'b3', '5th'] },
    { name: 'A Shape Min7', rootSemi: 9, variation: 'High b7', frets: [null, 0, 2, 0, 1, 3], roles: [null, 'root', '5th', 'b7', 'b3', 'b7'] },
  ],
  'dom9': [
    { name: 'E Shape 9', rootSemi: 4, variation: 'Standard', frets: [0, 2, 0, 1, 0, 2], roles: ['root', '5th', 'b7', '3rd', '5th', '9th'] },
    { name: 'A Shape 9', rootSemi: 9, variation: 'Standard', frets: [null, 0, -1, 0, 0, 0], roles: [null, 'root', '3rd', 'b7', '9th', '5th'], fingers: [null, 2, 1, 3, 3, 3] },
  ],
  'min9': [
    { name: 'E Shape Min9', rootSemi: 4, variation: 'Standard', frets: [0, 2, 0, 0, 0, 2], roles: ['root', '5th', 'b7', 'b3', '5th', '9th'] },
    { name: 'A Shape Min9', rootSemi: 9, variation: 'Standard', frets: [null, 0, -2, 0, 0, 0], roles: [null, 'root', 'b3', 'b7', '9th', '5th'], fingers: [null, 2, 1, 3, 3, 3] },
  ]
};

const OPEN_SHAPES: Record<string, { rootSemi: number; name: string; variation?: string; frets: (number | null)[]; roles: (string | null)[] }[]> = {
  'maj': [
    { rootSemi: 0, name: 'C Shape', variation: 'Standard', frets: [null, 3, 2, 0, 1, 0], roles: [null, 'root', '3rd', '5th', 'root', '3rd'] },
    { rootSemi: 0, name: 'C Shape', variation: 'Low 5th Bass', frets: [3, 3, 2, 0, 1, 0], roles: ['5th', 'root', '3rd', '5th', 'root', '3rd'] },
    { rootSemi: 0, name: 'C Shape', variation: 'High 5th Top', frets: [null, 3, 2, 0, 1, 3], roles: [null, 'root', '3rd', '5th', 'root', '5th'] },
    { rootSemi: 2, name: 'D Shape', variation: 'Standard', frets: [null, null, 0, 2, 3, 2], roles: [null, null, 'root', '5th', 'root', '3rd'] },
    { rootSemi: 2, name: 'D Shape', variation: 'Low 5th Bass', frets: [null, 0, 0, 2, 3, 2], roles: [null, '5th', 'root', '5th', 'root', '3rd'] },
    { rootSemi: 2, name: 'D Shape', variation: 'Low 3rd Bass', frets: [2, 0, 0, 2, 3, 2], roles: ['3rd', '5th', 'root', '5th', 'root', '3rd'] },
    { rootSemi: 4, name: 'E Shape', variation: 'Standard', frets: [0, 2, 2, 1, 0, 0], roles: ['root', '5th', 'root', '3rd', '5th', 'root'] },
    { rootSemi: 7, name: 'G Shape', variation: 'Standard', frets: [3, 2, 0, 0, 0, 3], roles: ['root', '3rd', '5th', 'root', '3rd', 'root'] },
    { rootSemi: 7, name: 'G Shape', variation: 'High 5th', frets: [3, 2, 0, 0, 3, 3], roles: ['root', '3rd', '5th', 'root', '5th', 'root'] },
    { rootSemi: 9, name: 'A Shape', variation: 'Standard', frets: [null, 0, 2, 2, 2, 0], roles: [null, 'root', '5th', 'root', '3rd', '5th'] },
    { rootSemi: 9, name: 'A Shape', variation: 'Low 5th Bass', frets: [0, 0, 2, 2, 2, 0], roles: ['5th', 'root', '5th', 'root', '3rd', '5th'] },
  ],
  'min': [
    { rootSemi: 2, name: 'D Shape (m)', variation: 'Standard', frets: [null, null, 0, 2, 3, 1], roles: [null, null, 'root', '5th', 'root', 'b3'] },
    { rootSemi: 2, name: 'D Shape (m)', variation: 'Low 5th Bass', frets: [null, 0, 0, 2, 3, 1], roles: [null, '5th', 'root', '5th', 'root', 'b3'] },
    { rootSemi: 4, name: 'E Shape (m)', variation: 'Standard', frets: [0, 2, 2, 0, 0, 0], roles: ['root', '5th', 'root', 'b3', '5th', 'root'] },
    { rootSemi: 9, name: 'A Shape (m)', variation: 'Standard', frets: [null, 0, 2, 2, 1, 0], roles: [null, 'root', '5th', 'root', 'b3', '5th'] },
    { rootSemi: 9, name: 'A Shape (m)', variation: 'Low 5th Bass', frets: [0, 0, 2, 2, 1, 0], roles: ['5th', 'root', '5th', 'root', 'b3', '5th'] },
  ],
  'dom7': [
    { rootSemi: 0, name: 'C Shape (7)', variation: 'Standard', frets: [null, 3, 2, 3, 1, 0], roles: [null, 'root', '3rd', 'b7', 'root', '3rd'] },
    { rootSemi: 2, name: 'D Shape (7)', variation: 'Standard', frets: [null, null, 0, 2, 1, 2], roles: [null, null, 'root', '5th', 'b7', '3rd'] },
    { rootSemi: 4, name: 'E Shape (7)', variation: 'Standard', frets: [0, 2, 0, 1, 0, 0], roles: ['root', '5th', 'b7', '3rd', '5th', 'root'] },
    { rootSemi: 7, name: 'G Shape (7)', variation: 'Standard', frets: [3, 2, 0, 0, 0, 1], roles: ['root', '3rd', '5th', 'root', '3rd', 'b7'] },
    { rootSemi: 9, name: 'A Shape (7)', variation: 'Standard', frets: [null, 0, 2, 0, 2, 0], roles: [null, 'root', '5th', 'b7', '3rd', '5th'] },
    { rootSemi: 11, name: 'C Shape (7)', variation: 'Standard', frets: [null, 2, 1, 2, 0, 2], roles: [null, 'root', '3rd', 'b7', 'root', '5th'] },
  ],
  'maj7': [
    { rootSemi: 0, name: 'C Shape (maj7)', variation: 'Standard', frets: [null, 3, 2, 0, 0, 0], roles: [null, 'root', '3rd', '5th', '7th', '3rd'] },
    { rootSemi: 2, name: 'D Shape (maj7)', variation: 'Standard', frets: [null, null, 0, 2, 2, 2], roles: [null, null, 'root', '5th', '7th', '3rd'] },
    { rootSemi: 4, name: 'E Shape (maj7)', variation: 'Standard', frets: [0, 2, 1, 1, 0, 0], roles: ['root', '5th', '7th', '3rd', '5th', 'root'] },
    { rootSemi: 5, name: 'F Shape (maj7)', variation: 'Standard', frets: [null, null, 3, 2, 1, 0], roles: [null, null, 'root', '3rd', '5th', '7th'] },
    { rootSemi: 7, name: 'G Shape (maj7)', variation: 'Standard', frets: [3, 2, 0, 0, 0, 2], roles: ['root', '3rd', '5th', 'root', '3rd', '7th'] },
    { rootSemi: 9, name: 'A Shape (maj7)', variation: 'Standard', frets: [null, 0, 2, 1, 2, 0], roles: [null, 'root', '5th', '7th', '3rd', '5th'] },
  ],
  'min7': [
    { rootSemi: 2, name: 'D Shape (m7)', variation: 'Standard', frets: [null, null, 0, 2, 1, 1], roles: [null, null, 'root', '5th', 'b7', 'b3'] },
    { rootSemi: 4, name: 'E Shape (m7)', variation: 'Standard', frets: [0, 2, 0, 0, 0, 0], roles: ['root', '5th', 'b7', 'b3', '5th', 'root'] },
    { rootSemi: 9, name: 'A Shape (m7)', variation: 'Standard', frets: [null, 0, 2, 0, 1, 0], roles: [null, 'root', '5th', 'b7', 'b3', '5th'] },
  ],
  'maj6': [
    { rootSemi: 0, name: 'C Shape (6)', variation: 'Standard', frets: [null, 3, 2, 2, 1, 0], roles: [null, 'root', '3rd', '6th', 'root', '3rd'] },
    { rootSemi: 2, name: 'D Shape (6)', variation: 'Standard', frets: [null, null, 0, 2, 0, 2], roles: [null, null, 'root', '5th', '6th', '3rd'] },
    { rootSemi: 4, name: 'E Shape (6)', variation: 'Standard', frets: [0, 2, 2, 1, 2, 0], roles: ['root', '5th', 'root', '3rd', '6th', 'root'] },
    { rootSemi: 7, name: 'G Shape (6)', variation: 'Standard', frets: [3, 2, 0, 0, 0, 0], roles: ['root', '3rd', '5th', 'root', '3rd', '6th'] },
    { rootSemi: 7, name: 'G Shape (6)', variation: 'High 5th', frets: [3, 2, 0, 0, 3, 0], roles: ['root', '3rd', '5th', 'root', '5th', '6th'] },
    { rootSemi: 9, name: 'A Shape (6)', variation: 'Standard', frets: [null, 0, 2, 2, 2, 2], roles: [null, 'root', '5th', 'root', '3rd', '6th'] },
  ],
  'min6': [
    { rootSemi: 2, name: 'D Shape (m6)', variation: 'Standard', frets: [null, null, 0, 2, 0, 1], roles: [null, null, 'root', '5th', '6th', 'b3'] },
    { rootSemi: 4, name: 'E Shape (m6)', variation: 'Standard', frets: [0, 2, 2, 0, 2, 0], roles: ['root', '5th', 'root', 'b3', '6th', 'root'] },
    { rootSemi: 9, name: 'A Shape (m6)', variation: 'Standard', frets: [null, 0, 2, 2, 1, 2], roles: [null, 'root', '5th', 'root', 'b3', '6th'] },
  ],
  'sus4': [
    { rootSemi: 0, name: 'C Shape (sus4)', variation: 'Standard', frets: [null, 3, 3, 0, 1, 1], roles: [null, 'root', '4th', '5th', 'root', '4th'] },
    { rootSemi: 2, name: 'D Shape (sus4)', variation: 'Standard', frets: [null, null, 0, 2, 3, 3], roles: [null, null, 'root', '5th', 'root', '4th'] },
    { rootSemi: 4, name: 'E Shape (sus4)', variation: 'Standard', frets: [0, 2, 2, 2, 0, 0], roles: ['root', '5th', 'root', '4th', '5th', 'root'] },
    { rootSemi: 7, name: 'G Shape (sus4)', variation: 'Standard', frets: [3, 3, 0, 0, 1, 3], roles: ['root', '4th', '5th', 'root', '4th', 'root'] },
    { rootSemi: 9, name: 'A Shape (sus4)', variation: 'Standard', frets: [null, 0, 2, 2, 3, 0], roles: [null, 'root', '5th', 'root', '4th', '5th'] },
  ],
  'sus2': [
    { rootSemi: 0, name: 'C Shape (sus2)', variation: 'Standard', frets: [null, 3, 0, 0, 3, 3], roles: [null, 'root', '2nd', '5th', '2nd', '5th'] },
    { rootSemi: 2, name: 'D Shape (sus2)', variation: 'Standard', frets: [null, null, 0, 2, 3, 0], roles: [null, null, 'root', '5th', 'root', '2nd'] },
    { rootSemi: 7, name: 'G Shape (sus2)', variation: 'Standard', frets: [3, 0, 0, 0, 3, 3], roles: ['root', '2nd', '5th', 'root', '2nd', '5th'] },
    { rootSemi: 9, name: 'A Shape (sus2)', variation: 'Standard', frets: [null, 0, 2, 2, 0, 0], roles: [null, 'root', '5th', 'root', '2nd', '5th'] },
  ]
};

export function buildBarreVoicings(
  chordType: string,
  rootSemi: number,
  rootNoteName: string = '',
  fullChordName: string = ''
): VoicingGroup[] {
  const shapes = BARRE_SHAPES[chordType];
  if (!shapes) return [];

  const targetSemi = rootSemi % 12;
  const groupMap = new Map<string, Voicing[]>();

  for (const shape of shapes) {
    let rootFret = (targetSemi - shape.rootSemi + 12) % 12;
    if (rootFret === 0) continue; 

    const fretsArr: VoicingFret[] = [];
    for (let i = 0; i < 6; i++) {
      const fret = shape.frets[i];
      if (fret === null) {
        fretsArr.push({ fret: null, role: null, finger: 0 });
      } else {
        fretsArr.push({ fret: fret + rootFret, role: shape.roles[i], finger: 0 });
      }
    }

    const fp = makeFingerprint(fretsArr);
    const bassIdx = fretsArr.findIndex(f => f.fret !== null);
    const bassNote = bassIdx >= 0 ? (fretsArr[bassIdx].role ?? '') : '';

    const groupLabel = `${shape.name} (Barre at ${rootFret})`;

    if (!groupMap.has(groupLabel)) groupMap.set(groupLabel, []);
    if (groupMap.get(groupLabel)!.some(v => v.fingerprint === fp)) continue;

    const variationName = shape.variation ? shape.variation : 'Standard';
    const finalFrets = assignFingers(fretsArr);

    // STRICT OVERRIDE: Only intercepts A Shape for Dominant 9 and Minor 9
    if ((chordType === 'dom9' || chordType === 'min9') && shape.name.includes('A Shape')) {
      finalFrets[1].finger = 2; // Middle finger on Root (A string)
      finalFrets[2].finger = 1; // Index finger on 3rd/b3 (D string)
      finalFrets[3].finger = 3; // Ring finger barres the G string
      finalFrets[4].finger = 3; // Ring finger barres the B string
      finalFrets[5].finger = 3; // Ring finger barres the e string
    }

    groupMap.get(groupLabel)!.push({
      name: variationName,
      chordLabel: fullChordName || rootNoteName,
      frets: finalFrets,
      fingerprint: fp,
      bassNote,
      type: 'barre',
    });
  }

  const groups: VoicingGroup[] = [];
  groupMap.forEach((voicings, label) => {
    if (voicings.length > 0) {
      groups.push({ label, stringNums: 'CAGED', voicings });
    }
  });

  return sortVoicingGroups(groups);
}

export function buildOpenVoicings(
  chordType: string,
  rootSemi: number,
  rootNoteName: string = '',
  fullChordName: string = ''
): VoicingGroup[] {
  const shapes = OPEN_SHAPES[chordType];
  if (!shapes) return [];

  const groupMap = new Map<string, Voicing[]>();

  for (const shape of shapes) {
    let capo = (rootSemi - shape.rootSemi) % 12;
    if (capo < 0) capo += 12;

    if (capo !== 0) continue;

    const fretsArr: VoicingFret[] = [];
    for (let i = 0; i < 6; i++) {
      const fret = shape.frets[i];
      if (fret === null) {
        fretsArr.push({ fret: null, role: null, finger: 0 });
      } else {
        fretsArr.push({ fret: fret, role: shape.roles[i], finger: 0 });
      }
    }

    const fp = makeFingerprint(fretsArr);
    const bassIdx = fretsArr.findIndex(f => f.fret !== null);
    const bassNote = bassIdx >= 0 ? (fretsArr[bassIdx].role ?? '') : '';

    const groupLabel = `${shape.name} (Open)`;
    
    if (!groupMap.has(groupLabel)) groupMap.set(groupLabel, []);
    if (groupMap.get(groupLabel)!.some(v => v.fingerprint === fp)) continue;

    const variationName = shape.variation ? shape.variation : 'Standard';

    groupMap.get(groupLabel)!.push({
      name: variationName,
      chordLabel: fullChordName || rootNoteName,
      frets: assignFingers(fretsArr),
      fingerprint: fp,
      bassNote,
      type: 'open',
    });
  }

  const groups: VoicingGroup[] = [];
  groupMap.forEach((voicings, label) => {
    if (voicings.length > 0) {
      groups.push({ label, stringNums: 'CAGED', voicings });
    }
  });

  return sortVoicingGroups(groups);
}

const TRIAD_TYPES: Record<string, { iv: number[]; roles: string[] }> = {
  maj:    { iv: [0,4,7],  roles: ['root','3rd','5th'] },
  min:    { iv: [0,3,7],  roles: ['root','3rd','5th'] },
  aug:    { iv: [0,4,8],  roles: ['root','3rd','5th'] },
  dim:    { iv: [0,3,6],  roles: ['root','3rd','5th'] },
  sus4:   { iv: [0,5,7],  roles: ['root','4th','5th'] },
  sus2:   { iv: [0,2,7],  roles: ['root','2nd','5th'] },
  maj_b5: { iv: [0,4,6],  roles: ['root','3rd','b5'] },
  sus2_b5:{ iv: [0,2,6],  roles: ['root','2nd','b5'] },
};

// String groups for triads — indices into GS array (0=low E, 5=high E)
// Displayed as EADGBE left to right
const TRIAD_STRING_GROUPS = [
  { label: 'Strings 3-2-1', stringNums: '3 2 1', indices: [3, 4, 5] },
  { label: 'Strings 4-3-2', stringNums: '4 3 2', indices: [2, 3, 4] },
  { label: 'Strings 5-4-3', stringNums: '5 4 3', indices: [1, 2, 3] },
  { label: 'Strings 6-5-4', stringNums: '6 5 4', indices: [0, 1, 2] },
];

// ============================================================
// findSpan — finds best octave arrangement for playability
// ============================================================
function findSpan(
  notes: { fret: number; role: string; stringIdx: number }[],
  noOpen: boolean,
  maxSpan: number
): { fret: number; role: string; stringIdx: number }[] | null {
  const candidates: { v: any[]; span: number; min: number }[] = [];

  for (let a = 0; a < 3; a++)
  for (let b = 0; b < 3; b++)
  for (let c = 0; c < 3; c++) {
    const shifts = [a, b, c];
    const adj = notes.map((f, i) => {
      let fr = f.fret;
      if (shifts[i] === 1) fr += 12;
      if (shifts[i] === 2) fr -= 12;
      return { ...f, fret: fr };
    });

    if (adj.some(f => f.fret < 0 || f.fret > 19)) continue;
    if (noOpen && adj.some(f => f.fret === 0)) continue;

    const nonZero = adj.filter(f => f.fret > 0);
    const allFrets = adj.map(f => f.fret);
    const hasOpen = allFrets.some(f => f === 0);
    const maxFret = Math.max(...allFrets);

    if (hasOpen && maxFret > 5) continue;

    if (!nonZero.length) {
      candidates.push({ v: adj, span: 0, min: 0 });
      continue;
    }

    const mn = Math.min(...nonZero.map(f => f.fret));
    const mx = Math.max(...nonZero.map(f => f.fret));
    if (mx > 16) continue;
    if (mx - mn > maxSpan) continue;
    if (mx - mn <= maxSpan) {
      candidates.push({ v: adj, span: mx - mn, min: mn });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const aOpen = a.v.some((f: any) => f.fret === 0) ? 1 : 0;
    const bOpen = b.v.some((f: any) => f.fret === 0) ? 1 : 0;
    if (aOpen !== bOpen) return aOpen - bOpen;
    if (a.span !== b.span) return a.span - b.span;
    return a.min - b.min;
  });

  return candidates[0].v;
}

// ============================================================
// assignFingers — assigns finger numbers 1-4
// ============================================================
function assignFingers(frets: VoicingFret[]): VoicingFret[] {
  const active = frets
    .map((f, i) => ({ ...f, idx: i }))
    .filter(f => f.fret !== null && (f.fret as number) > 0)
    .sort((a, b) => (a.fret as number) - (b.fret as number));

  if (!active.length) return frets;

  const minFret = active[0].fret as number;
  const result = frets.map(f => ({ ...f }));

  active.forEach(f => {
    const fingerNum = Math.min((f.fret as number) - minFret + 1, 4);
    result[f.idx].finger = fingerNum;
  });

  return result;
}

function makeFingerprint(frets: VoicingFret[]): string {
  return frets.map(f => f.fret === null ? 'x' : f.fret).join('-');
}

// ============================================================
// findTriads — finds all triads embedded in a chord
// e.g. Gmaj9 contains G maj, B min, D maj triads
// ============================================================
export function findTriads(
  chordDef: { iv: number[]; r: string[] }
): { triadType: string; rootInterval: number; rootRole: string; triadDef: { iv: number[]; roles: string[] }; parentRoles: string[] }[] {
  const pcs = new Set(chordDef.iv.map(iv => iv % 12));
  const result: any[] = [];

  for (let ci = 0; ci < chordDef.iv.length; ci++) {
    for (const [triadKey, triadDef] of Object.entries(TRIAD_TYPES)) {
      const triadRoot = chordDef.iv[ci] % 12;
      const triadPCs = triadDef.iv.map(iv => (triadRoot + iv) % 12);

      if (!triadPCs.every(pc => pcs.has(pc))) continue;

      const parentRoles = triadPCs.map(pc => {
        const idx = chordDef.iv.findIndex(iv => iv % 12 === pc);
        return chordDef.r[idx];
      });

      const isDup = result.some(
        x => x.triadType === triadKey && x.rootInterval === chordDef.iv[ci]
      );

      if (!isDup) {
        result.push({
          triadType: triadKey,
          rootInterval: chordDef.iv[ci],
          rootRole: chordDef.r[ci],
          triadDef,
          parentRoles,
        });
      }
    }
  }

  const roleOrder: Record<string, number> = {
    root: 0, '3rd': 1, '5th': 2, '7th': 3,
    '9th': 4, '11th': 5, '13th': 6,
  };
  result.sort((a, b) =>
    (roleOrder[a.rootRole] ?? 9) - (roleOrder[b.rootRole] ?? 9)
  );

  return result;
}


const TRIAD_FULL_NAMES: Record<string, string> = {
  maj:     'Major',
  min:     'Minor',
  aug:     'Augmented',
  dim:     'Diminished',
  sus4:    'Sus4',
  sus2:    'Sus2',
  maj_b5:  'Major ♭5',
  sus2_b5: 'Sus2 ♭5',
};

function triadChordLabel(triadType: string, triadRootSemi: number, namingMode: 'sharp' | 'flat' = 'sharp', spelledRootName?: string): string {
  const names = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;
  const noteName = spelledRootName ?? names[triadRootSemi % 12];
  const typeName = TRIAD_FULL_NAMES[triadType] ?? triadType;
  return `${noteName} ${typeName}`;
}

const BASS_ROLE_RANK: Record<string, number> = {
  'root': 0, 'b2': 1, '2nd': 2, 'b3': 3, '3rd': 4,
  '4th': 5, 'b5': 6, '#4': 6, '5th': 7, '#5': 8, 'b6': 8, '6th': 9,
  'b7': 10, '7th': 11, 'b9': 12, '9th': 13, '#9': 14,
  '11th': 15, '#11': 16, 'b13': 17, '13th': 18
};

function sortVoicingGroups(groups: VoicingGroup[]): VoicingGroup[] {
  groups.sort((a, b) => b.label.localeCompare(a.label)); // Guarantees 6-5-4-3 before 5-4-3-2
  groups.forEach(g => {
    g.voicings.sort((a, b) => {
      // KEEP DROP & SHELL VOICINGS IN STRICT FRETBOARD ORDER
      if (a.type === 'drop2' || a.type === 'drop3' || a.type === 'drop2and4' || a.type === 'shell') {
        const aFrets = a.frets.filter(f => f.fret !== null).map(f => f.fret as number);
        const bFrets = b.frets.filter(f => f.fret !== null).map(f => f.fret as number);
        const aMin = aFrets.length ? Math.min(...aFrets) : 0;
        const bMin = bFrets.length ? Math.min(...bFrets) : 0;
        return aMin - bMin;
      }

      const aHasRoot = a.name.includes('R') ? 0 : 1;
      const bHasRoot = b.name.includes('R') ? 0 : 1;
      if (aHasRoot !== bHasRoot) return aHasRoot - bHasRoot;

      const rankA = BASS_ROLE_RANK[a.bassNote] ?? 99;
      const rankB = BASS_ROLE_RANK[b.bassNote] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      
      const aFrets = a.frets.filter(f => f.fret !== null).map(f => f.fret as number);
      const bFrets = b.frets.filter(f => f.fret !== null).map(f => f.fret as number);
      const aMin = aFrets.length ? Math.min(...aFrets) : 0;
      const bMin = bFrets.length ? Math.min(...bFrets) : 0;
      
      return aMin - bMin;
    });
  });
  return groups;
}

// ============================================================
// buildTriadVoicings — Layer 1 main export
// ============================================================
export function buildTriadVoicings(
  chordDef: { iv: number[]; r: string[]; f?: string[] },
  rootSemi: number,
  rootNoteName: string = '',
  namingMode: 'sharp' | 'flat' = 'sharp'
): VoicingGroup[] {
  const triads = findTriads(chordDef);
  const groupMap = new Map<string, Voicing[]>();

  for (const triad of triads) {
    const triadRootSemi = (rootSemi + triad.rootInterval) % 12;
    const formulaIdx = chordDef.r.indexOf(triad.rootRole);
    const formulaForTriadRoot = chordDef.f ? chordDef.f[formulaIdx] : triad.rootRole;
    const spelledRoot = spellInterval(rootSemi, formulaForTriadRoot, namingMode === 'flat');
    
    const groupLabel = (triad.rootRole === 'root' && rootNoteName)
      ? `${rootNoteName} ${TRIAD_FULL_NAMES[triad.triadType] ?? triad.triadType}`
      : triadChordLabel(triad.triadType, triadRootSemi, namingMode, spelledRoot);

    const inversions = [
      { name: 'Root Position',   order: [0, 1, 2] },
      { name: '1st Inversion',   order: [1, 2, 0] },
      { name: '2nd Inversion',   order: [2, 0, 1] },
    ];

    for (const inv of inversions) {
      for (const sg of TRIAD_STRING_GROUPS) {
        if (!groupMap.has(sg.label)) groupMap.set(sg.label, []);

        const fretInputs = sg.indices.map((strIdx, i) => {
          const noteIdx = inv.order[i];
          const targetPC = (triadRootSemi + triad.triadDef.iv[noteIdx]) % 12;
          const openPC = GS[strIdx] % 12;
          const fret = ((targetPC - openPC) % 12 + 12) % 12;
          return { fret, role: triad.parentRoles[noteIdx], stringIdx: strIdx };
        });

        const best = findSpan(fretInputs, false, 5);
        if (!best) continue;

        const fretArr: VoicingFret[] = Array(6).fill(null).map(() => ({ fret: null, role: null, finger: 0 }));
        best.forEach(f => { fretArr[f.stringIdx] = { fret: f.fret, role: f.role, finger: 0 }; });

        const fp = makeFingerprint(fretArr);
        if (groupMap.get(sg.label)!.some(v => v.fingerprint === fp)) continue;

        const withFingers = assignFingers(fretArr);
        const bassIdx = withFingers.findIndex(f => f.fret !== null);
        const bassNote = bassIdx >= 0 ? (withFingers[bassIdx].role ?? '') : '';

        groupMap.get(sg.label)!.push({
          name: inv.name,
          chordLabel: groupLabel,
          frets: withFingers,
          fingerprint: fp,
          bassNote,
          type: 'triad',
        });
      }
    }
  }

  const groups: VoicingGroup[] = [];
  groupMap.forEach((voicings, label) => {
    if (voicings.length > 0) {
      groups.push({ label, stringNums: label, voicings });
    }
  });

  return sortVoicingGroups(groups);
}



// ============================================================
// LAYER 2: Shell voicings
// ============================================================

// Shell definitions per chord quality
// Each shell is an array of role names to include
// Shell definitions per chord quality
// Each shell is an array of role names to include
const SHELL_DEFS: Record<string, string[][]> = {
  // 7th chords - Added rootless (3-5-7)
  'maj7':     [['root','3rd','7th'], ['root','7th','3rd'], ['3rd','5th','7th'], ['5th','7th','3rd']],
  'min7':     [['root','3rd','7th'], ['root','7th','3rd'], ['3rd','5th','7th'], ['5th','7th','3rd']],
  'dom7':     [['root','3rd','7th'], ['root','7th','3rd'], ['3rd','5th','7th'], ['5th','7th','3rd']],
  'hdim7':    [['root','3rd','7th'], ['root','7th','3rd'], ['3rd','5th','7th'], ['5th','7th','3rd']],
  'fdim7':    [['root','3rd','7th'], ['root','7th','3rd']],
  'minMaj7':  [['root','3rd','7th'], ['root','7th','3rd']],
  'dom7sus4': [['root','4th','7th'], ['root','7th','4th'], ['4th','5th','7th']],
  // 9th chords - Added rootless (3-7-9) and (3-5-9)
  'maj9':     [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th'], ['3rd','5th','9th'], ['5th','9th','3rd']],
  'min9':     [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th'], ['3rd','5th','9th'], ['5th','9th','3rd']],
  'dom9':     [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th'], ['3rd','5th','9th'], ['5th','9th','3rd']],
  // Altered 7ths
  'dom7b9':   [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th']],
  'dom7s9':   [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th']],
  'dom7alt':  [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th']],
  'dom7b13':  [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','13th'], ['root','7th','13th'], ['3rd','7th','13th'], ['7th','3rd','13th']],
  'dom7s13':  [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','13th'], ['root','7th','13th'], ['3rd','7th','13th'], ['7th','3rd','13th']],
  // 11th chords
  'maj7s11':  [['root','3rd','7th'], ['root','7th','3rd'], ['root','7th','11th'], ['3rd','7th','11th'], ['7th','3rd','11th']],
  'dom7s11':  [['root','3rd','7th'], ['root','7th','3rd'], ['root','7th','11th'], ['3rd','7th','11th'], ['7th','3rd','11th']],
  'maj11':    [['root','3rd','7th'], ['root','7th','3rd'], ['root','7th','11th'], ['3rd','7th','11th']],
  'min11':    [['root','3rd','7th'], ['root','7th','3rd'], ['root','7th','11th'], ['3rd','7th','11th']],
  'dom11':    [['root','3rd','7th'], ['root','7th','3rd'], ['root','7th','11th'], ['3rd','7th','11th']],
  // 13th chords - Added rootless (3-7-13)
  'maj13':    [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','13th'], ['root','7th','13th'], ['3rd','7th','13th'], ['7th','3rd','13th']],
  'min13':    [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','13th'], ['root','7th','13th'], ['3rd','7th','13th'], ['7th','3rd','13th']],
  'dom13':    [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','13th'], ['root','7th','13th'], ['3rd','7th','13th'], ['7th','3rd','13th']],
  // 6th chords
  'maj6':     [['root','3rd','6th'], ['root','6th','3rd'], ['3rd','5th','6th']],
  'min6':     [['root','3rd','6th'], ['root','6th','3rd'], ['3rd','5th','6th']],
  'maj69':    [['root','3rd','6th'], ['root','6th','3rd'], ['root','6th','9th'], ['root','3rd','9th'], ['3rd','6th','9th'], ['6th','3rd','9th']],
  'min69':    [['root','3rd','6th'], ['root','6th','3rd'], ['root','6th','9th'], ['root','3rd','9th'], ['3rd','6th','9th'], ['6th','3rd','9th']],
  // Newly Extracted Advanced Shells
  'maj7s5':   [['root','3rd','7th'], ['root','7th','3rd']],
  'dom9sus4': [['root','4th','9th'], ['root','7th','9th'], ['4th','7th','9th']],
  'dom13sus4':[['root','4th','13th'], ['root','7th','13th'], ['4th','7th','13th']],
  'minMaj9':  [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th']],
  'dom13b9':  [['root','3rd','13th'], ['root','7th','13th'], ['3rd','7th','13th'], ['7th','3rd','13th']],
  'dom13s9':  [['root','3rd','13th'], ['root','7th','13th'], ['3rd','7th','13th'], ['7th','3rd','13th']],
  'dom7b5b9': [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th']],
  'dom7b5s9': [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th']],
  'dom7s5b9': [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th']],
  'dom7s5s9': [['root','3rd','7th'], ['root','7th','3rd'], ['root','3rd','9th'], ['root','7th','9th'], ['3rd','7th','9th'], ['7th','3rd','9th']],
};

// Shell string groups — grouped by Bass String
const SHELL_STRING_GROUPS = [
  { label: 'A String Bass', stringNums: '543 & 532', bassIdx: 1, upperSets: [[2, 3], [3, 4]] },
  { label: 'E String Bass', stringNums: '643 & 632', bassIdx: 0, upperSets: [[2, 3], [3, 4]] },
];

function roleToInterval(
  role: string,
  chordDef: { iv: number[]; r: string[] }
): number | null {
  const idx = chordDef.r.indexOf(role);
  if (idx !== -1) return chordDef.iv[idx] % 12;

  // ROBUST FALLBACK: If a rootless sub injects an altered note (like #9), parse the interval manually
  const match = role.match(/^([#b]*)(\d+)(?:st|nd|rd|th)?$/);
  if (match) {
    const accidentals = match[1] ?? '';
    const degree = parseInt(match[2], 10);
    const intervalMap: Record<number, number> = { 1:0, 2:2, 3:4, 4:5, 5:7, 6:9, 7:11, 8:12, 9:14, 10:16, 11:17, 12:19, 13:21 };
    
    if (intervalMap[degree] !== undefined) {
       let offset = 0;
       for (const ch of accidentals) {
         if (ch === '#') offset++;
         else if (ch === 'b') offset--;
       }
       return (intervalMap[degree] + offset + 12) % 12;
    }
  }
  return null;
}

function formatShellLabel(roles: string[]): string {
  const short: Record<string, string> = {
    'root': 'R', '3rd': '3', '5th': '5', '7th': '7',
    '9th': '9', '11th': '11', '13th': '13',
    '4th': '4', '6th': '6', '2nd': '2',
  };
  return roles.map(r => short[r] ?? r).join(' · ');
}

// Priority order — most specific / most common first
const CHORD_ID_PRIORITY = [
  'dom13sus4', 'dom9sus4', 'dom7sus4',
  'maj7s5', 'maj7', 'min7', 'dom7', 'hdim7', 'fdim7', 'minMaj9', 'minMaj7',
  'maj9', 'min9', 'dom9',
  'maj7s11', 'dom7s11',
  'maj13', 'min13', 'dom13b9', 'dom13s9', 'dom13',
  'maj6', 'min6', 'maj69', 'min69',
  'dom7b5b9', 'dom7b5s9', 'dom7s5b9', 'dom7s5s9', 'dom7alt',
  'dom7b9', 'dom7s9', 'dom7b13', 'dom7s13',
  'maj11', 'min11', 'dom11',
  'maj', 'min', 'aug', 'dim', 'sus4', 'sus2',
];

// Given a set of pitch classes, identify the best matching chord name.
// Returns e.g. "B Minor 7" or null if no match found.
export function identifyChord(
  pcs: number[], 
  namingMode: 'sharp' | 'flat' = 'sharp',
  spelledRootMap?: Record<number, string>,
  expectedRootSemi?: number
): string | null {
  if (!pcs.length) return null;
  const pcSet = new Set(pcs.map(p => ((p % 12) + 12) % 12));
  if (pcSet.size < 2) return null;

  const names = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;

  // Pass 0: Context-Aware Shell Matches (Resolves 6th shells looking like inverted triads)
  if (pcSet.size === 3 && expectedRootSemi !== undefined) {
    const expectedRootPC = expectedRootSemi % 12;
    const SHELL_PATTERNS = [
      { label: 'Major 7', iv: [0, 4, 11] }, // R 3 7
      { label: 'Minor 7', iv: [0, 3, 10] }, // R b3 b7
      { label: '7',       iv: [0, 4, 10] }, // R 3 b7
      { label: '6',       iv: [0, 4, 9] },  // R 3 6
      { label: 'Minor 6', iv: [0, 3, 9] },  // R b3 6
      { label: 'm7b5',    iv: [0, 6, 10] }, // R b5 b7
      { label: '7sus4',   iv: [0, 5, 10] }, // R 4 b7
    ];
    for (const pattern of SHELL_PATTERNS) {
      const transposed = new Set(pattern.iv.map(iv => (iv + expectedRootPC) % 12));
      if ([...transposed].every(pc => pcSet.has(pc))) {
        const name = spelledRootMap && spelledRootMap[expectedRootPC] ? spelledRootMap[expectedRootPC] : names[expectedRootPC];
        if (typeof name === 'string') {
          return `${name} ${pattern.label}`;
        }
      }
    }
  }

  // Pass 1: Exact matches for fully voiced chords
  for (const type of CHORD_ID_PRIORITY) {
    const def = CH[type];
    if (!def) continue;
    const chordPCs = def.iv.map(iv => iv % 12);
    const uniqueChordPCs = [...new Set(chordPCs)];
    if (uniqueChordPCs.length !== pcSet.size) continue;

    for (let root = 0; root < 12; root++) {
      const transposed = new Set(uniqueChordPCs.map(pc => (pc + root) % 12));
      if ([...transposed].every(pc => pcSet.has(pc))) {
        const name = spelledRootMap && spelledRootMap[root] ? spelledRootMap[root] : names[root];
        const label = def.l;
        if (typeof name === 'string' && typeof label === 'string') {
          return `${name} ${label}`;
        }
      }
    }
  }

  // Pass 2: Common 3-note shell subsets (rootless or 5th-less voicings)
  if (pcSet.size === 3) {
    const SHELL_PATTERNS = [
      { label: 'Major 7', iv: [0, 4, 11] }, // R 3 7
      { label: 'Minor 7', iv: [0, 3, 10] }, // R b3 b7
      { label: '7',       iv: [0, 4, 10] }, // R 3 b7
      { label: '6',       iv: [0, 4, 9] },  // R 3 6
      { label: 'Minor 6', iv: [0, 3, 9] },  // R b3 6
      { label: 'm7b5',    iv: [0, 6, 10] }, // R b5 b7
      { label: '7sus4',   iv: [0, 5, 10] }, // R 4 b7
      { label: 'Major ♭5', iv: [0, 4, 6] },  // R 3 b5
      { label: 'Sus2 ♭5',  iv: [0, 2, 6] },  // R 2 b5
    ];

    for (const pattern of SHELL_PATTERNS) {
      for (let root = 0; root < 12; root++) {
        const transposed = new Set(pattern.iv.map(iv => (iv + root) % 12));
        if ([...transposed].every(pc => pcSet.has(pc))) {
          const name = spelledRootMap && spelledRootMap[root] ? spelledRootMap[root] : names[root];
          if (typeof name === 'string') {
            return `${name} ${pattern.label}`;
          }
        }
      }
    }
  }

  return null;
}

export function getEffectiveChordLabel(
  chordType: string,
  rolesUsed: string[],
  rootSemi: number,
  rootNoteName: string,
  fullChordName: string,
  namingMode: 'sharp' | 'flat' = 'sharp'
): string {
  const chordDef = CH[chordType];
  if (!chordDef) return fullChordName || '';

  const spelledRootMap: Record<number, string> = {};
  const pcs = rolesUsed.map(role => {
    const idx = chordDef.r.indexOf(role);
    if (idx === -1) return null;
    const pc = (rootSemi + chordDef.iv[idx]) % 12;
    const formula = chordDef.f?.[idx] ?? role;
    spelledRootMap[pc] = spellInterval(rootSemi, formula, namingMode === 'flat');
    return pc;
  }).filter((p): p is number => p !== null);

  if (pcs.length < 2) return fullChordName || '';

  const identified = identifyChord(pcs, namingMode, spelledRootMap, rootSemi);
  if (typeof identified === 'string' && identified.length > 0) return identified;

  return fullChordName || '';
}

export function buildShellVoicings(
  chordType: string,
  chordDef: { iv: number[]; r: string[]; f?: string[] },
  rootSemi: number,
  rootNoteName: string = '',
  fullChordName: string = '',
  namingMode: 'sharp' | 'flat' = 'sharp'
): VoicingGroup[] {
  const fallbackMap: Record<string, string> = {
    'maj69': 'maj6', 'maj7s11': 'maj7', 'maj7s5': 'maj7',
    'min69': 'min6', 'minMaj7': 'min7',
    'dom7sus4': 'dom7',
    'dom7b5': 'dom7',
  };
  const effectiveType = fallbackMap[chordType] || chordType;
  const shellDefs = (DROP_VOICINGS.shells as any)[chordType] || (DROP_VOICINGS.shells as any)[effectiveType];
  if (!shellDefs) return [];

  const groupMap = new Map<number, Voicing[]>();

  for (const shape of shellDefs) {
    const bassNoteDef = shape.notes[0];
    const bassStr = bassNoteDef[0];
    const bassRefOffset = bassNoteDef[1];
    const bassIntervalIdx = bassNoteDef[2];

    if (bassIntervalIdx >= chordDef.iv.length) continue;

    const targetPC = (rootSemi + chordDef.iv[bassIntervalIdx]) % 12;
    const openPC = GS[bassStr] % 12;
    let baseFret = (targetPC - openPC + 12) % 12;

    // Stamp across available octaves
    for (const octaveShift of [0, 12]) {
        const actualBaseFret = baseFret + octaveShift;
        const fretArr: VoicingFret[] = Array(6).fill(null).map(() => ({ fret: null, role: null, finger: 0 }));
        let isValid = true;
        const rolesUsed: string[] = [];
        const formulasUsed: string[] = [];

        for (const [strIdx, offset, intIdx, formulaOverride] of shape.notes) {
          if (intIdx >= chordDef.iv.length && !formulaOverride) { isValid = false; break; }
          const fret = actualBaseFret + (offset - bassRefOffset);
          if (fret < 0 || fret > 22) { isValid = false; break; }
          const role = typeof formulaOverride === 'string' ? formulaOverride : chordDef.r[intIdx];
          const rawFormula = typeof formulaOverride === 'string' ? formulaOverride : (chordDef.f?.[intIdx] ?? role);
          const formula = rawFormula.replace(/root/gi, 'R').replace(/nd|rd|th/gi, '');
          rolesUsed.push(role);
          formulasUsed.push(formula === 'root' ? 'R' : formula);
          fretArr[strIdx] = { fret, role, finger: 0 };
        }

        if (isValid) {
          const fp = makeFingerprint(fretArr);
          const shellChordLabel = getEffectiveChordLabel(chordType, rolesUsed, rootSemi, rootNoteName, fullChordName, namingMode)
            || fullChordName
            || shape.label;

          const finalName = formulasUsed.join('-');

          const voicing: Voicing = {
            name: finalName,
          chordLabel: String(shellChordLabel),
          frets: assignFingers(fretArr),
          fingerprint: fp,
          bassNote: chordDef.r[bassIntervalIdx],
          type: 'shell',
        };

        if (!groupMap.has(bassStr)) groupMap.set(bassStr, []);
        if (!groupMap.get(bassStr)!.some(v => v.fingerprint === fp)) {
          groupMap.get(bassStr)!.push(voicing);
          break; // Stop after finding the lowest valid octave version
        }
      }
    }
  }

  const groups: VoicingGroup[] = [];
  if (groupMap.has(2)) groups.push({ label: 'D String Bass', stringNums: 'D-root', voicings: groupMap.get(2)! });
  if (groupMap.has(1)) groups.push({ label: 'A String Bass', stringNums: 'A-root', voicings: groupMap.get(1)! });
  if (groupMap.has(0)) groups.push({ label: 'E String Bass', stringNums: 'E-root', voicings: groupMap.get(0)! });

  return sortVoicingGroups(groups);
}

// ============================================================
// LAYER 3 & 4: Drop 2 and Drop 3 Voicings
// ============================================================

// ============================================================
// CAGED box definitions — fret offsets relative to root fret
// ============================================================
// CAGED box span definitions — per-string [minOffset, maxOffset] relative to root fret
function getCagedSpans(rootSemi: number) {
  const getAnchor = (rootStr: number) => {
    const openPC = [4, 9, 2, 7, 11, 4][rootStr];
    return (rootSemi - openPC + 12) % 12;
  };

  return SCALE_MASKS.map(s => {
    const ref = getAnchor(s.rootStr);
    return {
      name: s.name,
      ref,
      mask: s.m,
      // Pass the strict spans for legacy deduplication priority
      spans: s.s as [number, number][]
    };
  });
}

export interface ScaleNote {
  stringIdx: number;
  fret: number;
  role: string;
  formula: string;   // short degree label e.g. 'R', 'b3', '#11'
  noteName: string;
  isChordTone: boolean;
}

export interface ScaleVoicing {
  boxName: string;
  boxNumber: number;
  scaleName: string;
  scaleId: string;
  notes: ScaleNote[];
  minFret: number;
  maxFret: number;
}

export function buildScaleVoicings(
  scaleIds: string[],
  scales: Record<string, { name: string; iv: number[]; r: string[]; f: string[] }>,
  rootSemi: number,
  chordIvs: number[],
  namingMode: 'sharp' | 'flat' = 'sharp'
): ScaleVoicing[] {
  const results: ScaleVoicing[] = [];
  const chordPCs = new Set(chordIvs.map(iv => (rootSemi + iv) % 12));
  const TUNING = [0, 5, 10, 15, 19, 24]; // Standard tuning offsets from Low E

  scaleIds.forEach(scaleId => {
    const scaleDef = scales[scaleId];
    const templateBoxes = CAGED_SCALE_TEMPLATES[scaleId];
    if (!scaleDef || !templateBoxes) return;

    Object.keys(templateBoxes).forEach((boxName, index) => {
      const notesData = templateBoxes[boxName];
      if (!notesData || notesData.length === 0) return;

      // Find the native root of this specific box template to anchor the shift correctly
      const rootNotes = notesData.filter(n => n[2] === 'R' || n[2] === '1');
      if (rootNotes.length === 0) return;
      
      const primaryRoot = rootNotes.reduce((prev, curr) => {
        const prevMidi = TUNING[prev[0]] + prev[1];
        const currMidi = TUNING[curr[0]] + curr[1];
        return currMidi < prevMidi ? curr : prev;
      });

      const nativePC = (4 + TUNING[primaryRoot[0]] + primaryRoot[1]) % 12;
      
      let shift = (rootSemi - nativePC) % 12;
      if (shift < 0) shift += 12;

      // Enforce standard CAGED positioning: 
      // Keep the primary root fret in the lower region of the neck (frets 0-11)
      let anchorFret = primaryRoot[1] + shift;
      while (anchorFret >= 12) {
          shift -= 12;
          anchorFret -= 12;
      }
      while (anchorFret < 0) {
          shift += 12;
          anchorFret += 12;
      }

      // Derived mode templates subtract shortestOffset from every relFret, which can push
      // non-root notes well below 0 even after the anchor is correctly placed.
      // If any note would land at a negative fret (and be filtered out), shift the entire
      // box up one octave so all notes remain on the physical neck.
      const minRelFret = Math.min(...notesData.map(n => n[1] + shift));
      if (minRelFret < 0) {
          shift += 12;
      }

      const mappedNotes = notesData.map(([strIdx, relFret, formula]) => {
        const roleIdx = scaleDef.f.indexOf(formula);
        const role = roleIdx !== -1 ? scaleDef.r[roleIdx] : formula;
        const pc = (4 + TUNING[strIdx] + (relFret + shift)) % 12;
        const noteName = spellInterval(rootSemi, formula, namingMode === 'flat');
        
        return {
          stringIdx: strIdx,
          fret: relFret + shift,
          formula,
          role,
          noteName,
          isChordTone: chordPCs.has(pc)
        };
      }).filter(n => n.fret >= 0 && n.fret <= 22);

      if (mappedNotes.length === 0) return;

      results.push({
        boxName,
        boxNumber: index + 1,
        scaleName: scaleDef.name || scaleId,
        scaleId,
        notes: mappedNotes,
        minFret: Math.min(...mappedNotes.map(n => n.fret)),
        maxFret: Math.max(...mappedNotes.map(n => n.fret))
      });
    });
  });

  // Sort the boxes sequentially up the neck by their physical minFret!
  // This completely stops them from overlapping or jumping out of order.
  return results.sort((a, b) => {
    if (a.scaleId !== b.scaleId) return scaleIds.indexOf(a.scaleId) - scaleIds.indexOf(b.scaleId);
    return a.minFret - b.minFret; 
  });
}

export interface ArpSubset {
  label: string;
  subLabel: string;
  ivs: number[];
  roles: string[];
  formulaLabels: string[];
}

export interface PatternSubset {
  label: string;
  subLabel: string;
  ivs: number[];
  roles: string[];
  formulaLabels: string[];
}

export function getPatternSubsets(
  chordType: string,
  rootSemi: number,
  namingMode: 'sharp' | 'flat' = 'sharp'
): PatternSubset[] {
  const baseQualityMap: Record<string, string> = {
    'maj9': 'maj7', 'maj11': 'maj7', 'maj13': 'maj7', 'maj6': 'maj7', 'maj69': 'maj7', 'maj7s11': 'maj7', 'maj7s5': 'maj7',
    'min9': 'min7', 'min11': 'min7', 'min13': 'min7', 'min6': 'min7', 'min69': 'min7', 'minMaj7': 'min7', 'minMaj9': 'min7',
    'dom9': 'dom7', 'dom11': 'dom7', 'dom13': 'dom7', 'dom7sus4': 'dom7', 'dom9sus4': 'dom7', 'dom13sus4': 'dom7',
    'dom7s9': 'dom7b9', 'dom7alt': 'dom7b9', 'dom7b13': 'dom7b9', 'dom13b9': 'dom7b9', 'dom13s9': 'dom7b9',
    'dom7b5b9': 'dom7b9', 'dom7b5s9': 'dom7b9', 'dom7s5b9': 'dom7b9', 'dom7s5s9': 'dom7b9'
  };

  const mappedType = CHORD_PATTERN_MAP[chordType] ? chordType : (baseQualityMap[chordType] || chordType);
  const suggestions = CHORD_PATTERN_MAP[mappedType] || [];
  const subsets: PatternSubset[] = [];

  const chordDef = CH[chordType] || { iv: [], r: [] };
      const getParentRelativeLabels = (pc: number, patternName: string, offset: number) => {
        const interval = (pc - rootSemi + 12) % 12;
        const idx = chordDef.iv.findIndex((iv: number) => (iv % 12) === interval);
        if (idx !== -1) {
          return { role: chordDef.r[idx], formula: chordDef.f ? chordDef.f[idx] : chordDef.r[idx] };
        }

        // Contextual override for the Diminished 4th pattern
        if (patternName === 'dim_4' && offset === 0 && interval === 4) return { role: 'b4th', formula: 'b4' };
        if (patternName === 'dim_4' && offset === 0 && interval === 9) return { role: 'bb7th', formula: 'bb7' };

        const defaultRoles = ['root', 'b2', '2nd', 'b3', '3rd', '4th', '#4', '5th', 'b6', '6th', 'b7', '7th'];
        const defaultFormulas = ['R', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
        return { role: defaultRoles[interval], formula: defaultFormulas[interval] };
      };

      for (const sug of suggestions) {
        const pat = PATTERNS[sug.pattern];
        if (!pat) continue;

        const shiftedIvs = pat.iv.map(iv => (iv + sug.offset) % 12);
        
        // Convert absolute intervals back to relative to chord root to feed existing systems smoothly
        const relativeIvs = shiftedIvs.map(iv => {
          let relative = iv;
          while (relative < 0) relative += 12;
          return relative;
        });

        const relRoles: string[] = [];
        const relFormulas: string[] = [];
        pat.iv.forEach(iv => {
          const pc = (rootSemi + sug.offset + iv) % 12;
          const rel = getParentRelativeLabels(pc, sug.pattern, sug.offset);
          relRoles.push(rel.role);
          relFormulas.push(rel.formula);
        });

    subsets.push({
      label: pat.name,
      subLabel: sug.label,
      ivs: relativeIvs,
      roles: relRoles,
      formulaLabels: relFormulas
    });
  }
  return subsets;
}

export function getArpSubsets(
  chordIvs: number[],
  chordRoles: string[],
  chordFormula: string[],
  rootSemi: number = 0,
  namingMode: 'sharp' | 'flat' = 'sharp' //
): ArpSubset[] {
  const subsets: ArpSubset[] = [];
  
  for (let start = 0; start <= chordIvs.length - 3; start++) {
    for (let len = 3; len <= chordIvs.length - start; len++) {
      const ivs = chordIvs.slice(start, start + len);
      const roles = chordRoles.slice(start, start + len);
      const formula = chordFormula.slice(start, start + len);
      
      const pcs = ivs.map(iv => (rootSemi + iv) % 12);
      
      const spelledRootMap: Record<number, string> = {};
      ivs.forEach((iv, i) => {
        const pc = (rootSemi + iv) % 12;
        spelledRootMap[pc] = spellInterval(rootSemi, formula[i], namingMode === 'flat');
      });

      const identified = identifyChord(pcs, namingMode, spelledRootMap);
      
      const topLabel = formula[formula.length - 1] ?? roles[roles.length - 1];
      const baseLabel = formula[0] ?? roles[0];

      let subLabel = `(to ${topLabel})`;
      if (start > 0) {
        subLabel = `(from ${baseLabel} to ${topLabel})`;
      }

      subsets.push({
            label: identified || 'Arpeggio',
            subLabel,
            ivs,
            roles,
            formulaLabels: formula 
          });
        }
      }

      // NEW: Sort globally by length first (smallest arps first), then by starting position
      subsets.sort((a, b) => {
        if (a.ivs.length !== b.ivs.length) return a.ivs.length - b.ivs.length;
        return a.ivs[0] - b.ivs[0];
      });

      return subsets;
    }

export function getIntervalSubsets(
  chordIvs: number[],
  chordRoles: string[],
  chordFormula: string[]
): ArpSubset[] {
  const subsets: ArpSubset[] = [];
  for (let i = 0; i < chordIvs.length - 1; i++) {
    for (let j = i + 1; j < chordIvs.length; j++) {
      const r1 = chordFormula[i] ?? chordRoles[i];
      const r2 = chordFormula[j] ?? chordRoles[j];
      const st = Math.abs(chordIvs[j] - chordIvs[i]);
      const intNames = ['P1','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','P8','m9','M9','m10','M10','P11','aug11','P12','m13','M13'];
      const intLabel = intNames[st] || `${st}st`;

      subsets.push({
        label: intLabel,
        subLabel: `${r1} & ${r2}`,
        ivs: [chordIvs[i], chordIvs[j]],
        roles: [chordRoles[i], chordRoles[j]],
        formulaLabels: [chordFormula[i], chordFormula[j]],
      });
    }
  }
  return subsets;
}

export function proximitySort(voicings: Voicing[]): Voicing[] {
  if (!voicings || voicings.length <= 1) return voicings;
  const res = [voicings[0]], rem = voicings.slice(1);
  while (rem.length > 0) {
    const last = res[res.length - 1];
    let bestIdx = 0, minD = Infinity;
    for (let i = 0; i < rem.length; i++) {
      let d = 0;
      for (let j = 0; j < 6; j++) {
        const f1 = last.frets[j].fret, f2 = rem[i].frets[j].fret;
        if (f1 !== null && f2 !== null) d += Math.abs(f1 - f2);
        else if (f1 !== null || f2 !== null) d += 4;
      }
      if (d < minD) { minD = d; bestIdx = i; }
    }
    res.push(rem[bestIdx]); rem.splice(bestIdx, 1);
  }
  return res;
}

export function buildArpVoicings(
  parentScaleVoicings: ScaleVoicing[],
  rootSemi: number,
  chordIvs: number[],
  chordRoles: string[],
  chordFormula: string[],
  chordName: string = 'Arpeggio'
): ScaleVoicing[] {
  const voicings: ScaleVoicing[] = [];
  
  // We only care about interval pitch classes that are in the arpeggio/interval subset
  const arpIvsMod12 = new Set(chordIvs.map(iv => iv % 12));

  parentScaleVoicings.forEach(parentBox => {
    // Filter the parent box notes down to ONLY the notes that match the requested subset
    const filteredNotes = parentBox.notes.map(note => {
      const pc = (GS[note.stringIdx] + note.fret) % 12;
      const iv = (pc - rootSemi + 12) % 12;
      
      if (arpIvsMod12.has(iv)) {
        // Assign the specific role and formula from the subset (e.g. tracking the 3rd vs 10th)
        const arpIdx = chordIvs.findIndex(cIv => (cIv % 12) === iv);
        return {
          ...note,
          role: chordRoles[arpIdx] || note.role,
          formula: chordFormula[arpIdx] || note.formula,
          isChordTone: true
        };
      }
      return null;
    }).filter((n): n is ScaleNote => n !== null);

    if (filteredNotes.length === 0) return;

    voicings.push({
      boxName: parentBox.boxName,
      boxNumber: parentBox.boxNumber,
      scaleName: chordName,
      scaleId: 'arp', // Used by the UI to style it as a subset
      notes: filteredNotes,
      // THE FIX: Inherit the rigid physical fretboard boundaries of the parent box!
      // This stops the UI from shrinking the box and preserves the 5-position context.
      minFret: parentBox.minFret,
      maxFret: parentBox.maxFret
    });
  });

  return voicings; 
}

const DROP2_STRING_GROUPS = [
  { label: 'Strings 4-3-2-1', stringNums: '4 3 2 1', indices: [2, 3, 4, 5] },
  { label: 'Strings 5-4-3-2', stringNums: '5 4 3 2', indices: [1, 2, 3, 4] },
];

const DROP3_STRING_GROUPS = [
  { label: 'Strings 5-3-2-1', stringNums: '5 3 2 1', indices: [1, 3, 4, 5] },
  { label: 'Strings 6-4-3-2', stringNums: '6 4 3 2', indices: [0, 2, 3, 4] },
];

// Generates all 4-note combinations for chords with >4 notes (like 9ths or 13ths)
function getDropCombinations(arr: string[], k: number): string[][] {
  const results: string[][] = [];
  function helper(start: number, combo: string[]) {
    if (combo.length === k) { results.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

// 4-String span finder using recursion
function findSpan4(
  notes: { fret: number; role: string; stringIdx: number }[],
  noOpen: boolean,
  maxSpan: number
): { fret: number; role: string; stringIdx: number }[] | null {
  const candidates: { v: any[]; span: number; min: number }[] = [];
  const n = notes.length;
  const octs = new Array(n).fill(0);

  function recurse(idx: number) {
    if (idx === n) {
      const adj = notes.map((f, i) => {
        let fr = f.fret;
        if (octs[i] === 1) fr += 12;
        if (octs[i] === 2) fr -= 12;
        return { ...f, fret: fr };
      });

      if (adj.some(f => f.fret < 0 || f.fret > 19)) return;
      if (noOpen && adj.some(f => f.fret === 0)) return;

      const nonZero = adj.filter(f => f.fret > 0);
      const allFrets = adj.map(f => f.fret);
      const hasOpen = allFrets.some(f => f === 0);
      const maxFret = Math.max(...allFrets);

      if (hasOpen && maxFret > 5) return;
      if (!nonZero.length) {
        candidates.push({ v: adj, span: 0, min: 0 });
        return;
      }

      const mn = Math.min(...nonZero.map(f => f.fret));
      const mx = Math.max(...nonZero.map(f => f.fret));
      if (mx > 16) return;
      if (mx - mn > maxSpan) return;
      if (mx - mn <= maxSpan) candidates.push({ v: adj, span: mx - mn, min: mn });
      return;
    }
    for (let o = 0; o < 3; o++) {
      octs[idx] = o;
      recurse(idx + 1);
    }
  }
  
  recurse(0);
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const aOpen = a.v.some((f: any) => f.fret === 0) ? 1 : 0;
    const bOpen = b.v.some((f: any) => f.fret === 0) ? 1 : 0;
    if (aOpen !== bOpen) return aOpen - bOpen;
    if (a.span !== b.span) return a.span - b.span;
    return a.min - b.min;
  });

  return candidates[0].v;
}

export function buildDropVoicings(
  chordType: string,
  chordDef: { iv: number[]; r: string[]; f?: string[] },
  rootSemi: number,
  rootNoteName: string = '',
  fullChordName: string = '',
  namingMode: 'sharp' | 'flat' = 'sharp'
): VoicingGroup[] {
  const ROOTLESS_SUB_MAP: Record<string, { type: string, ivOffset: number, roleMap: string[], rootFormula: string }> = {
    'maj9': { type: 'min7', ivOffset: 4, roleMap: ['3rd', '5th', '7th', '9th'], rootFormula: '3' },
    'min9': { type: 'maj7', ivOffset: 3, roleMap: ['b3', '5th', 'b7', '9th'], rootFormula: 'b3' },
    'dom9': { type: 'hdim7', ivOffset: 4, roleMap: ['3rd', '5th', 'b7', '9th'], rootFormula: '3' },
    'minMaj9': { type: 'maj7s5', ivOffset: 3, roleMap: ['b3', '5th', '7th', '9th'], rootFormula: 'b3' },
    'maj11': { type: 'maj7', ivOffset: 7, roleMap: ['5th', '7th', '9th', '11th'], rootFormula: '5' },
    'dom11': { type: 'min7', ivOffset: 7, roleMap: ['5th', 'b7', '9th', '11th'], rootFormula: '5' },
    'maj69': { type: 'min7', ivOffset: 9, roleMap: ['6th', 'root', '3rd', '5th'], rootFormula: '6' },
    'min69': { type: 'hdim7', ivOffset: 9, roleMap: ['6th', 'root', 'b3', '5th'], rootFormula: '6' },
    'dom7b9': { type: 'fdim7', ivOffset: 4, roleMap: ['3rd', '5th', 'b7', 'b9'], rootFormula: '3' },
    'dom13b9': { type: 'fdim7', ivOffset: 4, roleMap: ['3rd', '5th', 'b7', 'b9'], rootFormula: '3' },
    'dom7alt': { type: 'min7', ivOffset: 3, roleMap: ['#9', 'b5', 'b7', 'b9'], rootFormula: '#9' },
    'dom7b13': { type: 'dom7b5', ivOffset: 4, roleMap: ['3rd', 'b13', 'b7', '9th'], rootFormula: '3' },
    'dom7b5b9': { type: 'dom7', ivOffset: 6, roleMap: ['b5', 'b7', 'b9', '3rd'], rootFormula: 'b5' },
    // Removed dom7b5s9, dom7s5b9, dom7s5s9 because the substitutions incorrectly generate b9s and b5s!
    'dom9sus4': { type: 'maj7', ivOffset: 10, roleMap: ['b7', '9th', '4th', '5th'], rootFormula: 'b7' },
    'dom13sus4': { type: 'maj7', ivOffset: 10, roleMap: ['b7', '9th', '4th', '13th'], rootFormula: 'b7' },
  };

  const fallbackMap: Record<string, string> = {
    'maj7s5': 'maj7s5',
    'minMaj9': 'minMaj7',
    'dom11': 'dom7sus4',
    // Removed dom7b9, dom7s9, dom13b9, dom7alt, maj7s11, min11, and dom7s5s9 so the engine uses explicit shapes!
    'dom7b13': 'dom7s5',
    'dom13s9': 'dom7alt',
    'dom7b5b9': 'dom7b5', 'dom7b5s9': 'dom7alt',
    'dom7s5b9': 'dom7s5',
    'dom9sus4': 'dom7sus4', 'dom13sus4': 'dom7sus4'
  };

  const passes = [
    { effectiveType: fallbackMap[chordType] || chordType, effectiveRootSemi: rootSemi, isRootless: false, roleMap: null as string[] | null, rootFormula: '' }
  ];

  const sub = ROOTLESS_SUB_MAP[chordType];
  if (sub) passes.push({ effectiveType: sub.type, effectiveRootSemi: (rootSemi + sub.ivOffset) % 12, isRootless: true, roleMap: sub.roleMap, rootFormula: sub.rootFormula });

  const groupMap = new Map<string, Voicing[]>();
  const dropCategories = ['drop2', 'drop3', 'drop2and4'] as const;

  for (const dropType of dropCategories) {
    for (const pass of passes) {
      const dropDefs = (DROP_VOICINGS[dropType] as any)[pass.effectiveType];
      if (!dropDefs) continue;
      const effectiveDef = CH[pass.effectiveType] || chordDef;

      for (const shape of dropDefs) {
        const bassNoteDef = shape.notes[0];
        const bassStr = bassNoteDef[0];
        const bassRefOffset = bassNoteDef[1];
        const bassIntervalIdx = bassNoteDef[2];

        if (bassIntervalIdx >= effectiveDef.iv.length) continue;

        const targetPC = (pass.effectiveRootSemi + effectiveDef.iv[bassIntervalIdx]) % 12;
        const openPC = GS[bassStr] % 12;
        let baseFret = (targetPC - openPC + 12) % 12;

        for (const octaveShift of [0, 12]) {
          const actualBaseFret = baseFret + octaveShift;
          const fretArr: VoicingFret[] = Array(6).fill(null).map(() => ({ fret: null, role: null, finger: 0 }));
          let isValid = true;
          const rolesUsed: string[] = [];
          const formulasUsed: string[] = [];

          for (const [strIdx, offset, intIdx, formulaOverride] of shape.notes) {
            if (intIdx >= effectiveDef.iv.length && !formulaOverride) { isValid = false; break; }
            const fret = actualBaseFret + (offset - bassRefOffset);
            if (fret < 0 || fret > 22) { isValid = false; break; }
            
            const role = pass.isRootless && pass.roleMap ? pass.roleMap[intIdx] : (typeof formulaOverride === 'string' ? formulaOverride : effectiveDef.r[intIdx]);
              
            let formula = role;
            if (pass.isRootless && pass.roleMap) {
               formula = role.replace(/root/gi, 'R').replace(/nd|rd|th/gi, '');
            } else {
               const rawFormula = typeof formulaOverride === 'string' ? formulaOverride : (effectiveDef.f?.[intIdx] ?? role);
               formula = rawFormula.replace(/root/gi, 'R').replace(/nd|rd|th/gi, '');
            }

            rolesUsed.push(role);
            formulasUsed.push(formula === 'root' ? 'R' : formula);
            fretArr[strIdx] = { fret, role, finger: 0 };
          }

          if (isValid) {
            const fp = makeFingerprint(fretArr);
            let chordLabelText = '';
            if (pass.isRootless) {
              const subRootName = spellInterval(rootSemi, pass.rootFormula, namingMode === 'flat');
              const subDef = CH[pass.effectiveType];
              const subTypeName = subDef ? subDef.l : pass.effectiveType;
              chordLabelText = `${subRootName} ${subTypeName} (as ${fullChordName || rootNoteName || chordType})`;
            } else {
              chordLabelText = getEffectiveChordLabel(chordType, rolesUsed, rootSemi, rootNoteName, fullChordName, namingMode) || fullChordName || shape.label;
            }
            
            const finalName = formulasUsed.join('-');
            const typeLabel = dropType === 'drop2' ? 'Drop 2' : dropType === 'drop3' ? 'Drop 3' : 'Drop 2 & 4';

            const voicing: Voicing = {
              name: `${shape.label} [${finalName}]`,
              chordLabel: String(chordLabelText),
              frets: assignFingers(fretArr),
              fingerprint: fp,
              bassNote: pass.isRootless && pass.roleMap ? pass.roleMap[bassIntervalIdx] : effectiveDef.r[bassIntervalIdx],
              type: dropType,
            };
            
            const groupLabel = `${typeLabel} (${bassStr === 0 ? 'E Bass' : bassStr === 1 ? 'A Bass' : 'D Bass'})`;

            if (!groupMap.has(groupLabel)) groupMap.set(groupLabel, []);
            if (!groupMap.get(groupLabel)!.some(v => v.fingerprint === fp)) {
              groupMap.get(groupLabel)!.push(voicing);
            }
            break; 
          }
        }
      }
    }
  }

  const groups: VoicingGroup[] = [];
  groupMap.forEach((voicings, label) => { if (voicings.length > 0) groups.push({ label, stringNums: label, voicings }); });
  return sortVoicingGroups(groups);
}

// ── STACKING SHAPES ──────────────────────────────────────────────────────────

/**
 * Bridge function to make HARDCODED_SHAPES work with the current UI.
 * This maps the nested array format to the ScaleVoicing interface.
 */
export function buildHardcodedShapeVoicings(
  chordType: string,
  rootSemi: number,
  namingMode: 'sharp' | 'flat' = 'sharp',
  baseOnly: boolean = false
): ScaleVoicing[] {
  // Upper Structure Superimposition Dictionary
  const CHORD_STACKS: Record<string, { shapeKey: string, offset: number }[]> = {
    'maj': [{ shapeKey: 'maj_shape', offset: 0 }],
    'min': [{ shapeKey: 'min_shape', offset: 0 }],
    'aug': [{ shapeKey: 'aug_shape', offset: 0 }],
    'dim': [{ shapeKey: 'dim_4_shape', offset: 0 }],
    'sus4': [{ shapeKey: 'sus4_shape', offset: 0 }],
    'sus2': [{ shapeKey: 'sus2_shape', offset: 0 }],
    
    'maj7': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 4 }],
    'maj9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 4 }],
    // Maj11 implies Lydian, so stacking a Major shape on the 2nd gives us 9, #11, 13
    'maj11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 2 }],
    // Maj13 gets a Minor shape stacked on the 6th (e.g. Am over C gives 13, R, 3)
    'maj13': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 9 }],
    'maj6': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 9 }],
    'maj69': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 9 }],
    'maj7s5': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 4 }],
    'maj7s11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 2 }],

    'min7': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
    'min9': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
    // Min11 gets a Minor shape stacked on the 5th (e.g. Gm over C gives 5, b7, 9, 11)
    'min11': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }],
    // Min13 gets a Major shape stacked on the b7 (e.g. Bb over C gives b7, 9, 11, 13)
    'min13': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
    'min6': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 9 }],
    'min69': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 9 }],
    'minMaj7': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'aug_shape', offset: 3 }],
    'minMaj9': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'aug_shape', offset: 3 }],

    'dom7': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 4 }],
    'dom9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 4 }],
    // Superimposing a Minor shape from the 2nd (e.g. Dm over C) maps the 9th, 11th, and 13th perfectly.
    'dom11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 2 }],
    'dom13': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 2 }],
    'dom7sus4': [{ shapeKey: 'sus4_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }],
    'dom9sus4': [{ shapeKey: 'sus4_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }],
    'dom13sus4': [{ shapeKey: 'sus4_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }],

    'dom7b9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'dim_4_shape', offset: 4 }],
    // 7#9: Stack Maj on Root (C E G) + Maj on b3 (Eb G Bb) to map #9 perfectly
    'dom7s9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
    // 7alt: Stack Aug on Root (C E G#) + Min on b3 (Eb Gb Bb) to capture #5, #9, and b5
    'dom7alt': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 3 }],
    'dom7b13': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
    'dom13b9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'dim_4_shape', offset: 4 }],
    'dom13s9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
    'dom7b5': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'aug_shape', offset: 10 }],
    'dom7s5': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
    
    'hdim7': [{ shapeKey: 'min_b5_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 3 }],
    'fdim7': [{ shapeKey: 'dim_4_shape', offset: 0 }, { shapeKey: 'dim_4_shape', offset: 3 }]
  };

  const fullStack = CHORD_STACKS[chordType] || [{ shapeKey: 'maj_shape', offset: 0 }];
  const stack = baseOnly ? [fullStack[0]] : fullStack;
  const baseShapeKey = stack[0].shapeKey;
  const baseShapes = (HARDCODED_SHAPES as any)[baseShapeKey];
  if (!baseShapes) return [];

  const results: ScaleVoicing[] = [];
  const GS_PC = [4, 9, 2, 7, 11, 4]; // Perfect pitch class map for standard tuning

  baseShapes.forEach((baseShape: any, index: number) => {
        // 1. Calculate Base Shape Shift (using specific string pitch class)
        let bFret = 0;
        let bString = 0;
        for (let s = 0; s < 6; s++) {
          const rIdx = baseShape.roles[s].indexOf('1');
          if (rIdx !== -1) { bFret = baseShape.frets[s][rIdx]; bString = s; break; }
        }
        
        let baseShift = (rootSemi - GS_PC[bString] - bFret) % 12;
        if (baseShift < 0) baseShift += 12;

        // FORCE OPEN POSITION: If shifting the shape down 12 frets keeps all notes >= 0, do it!
        let canShiftDown = true;
        for (let s = 0; s < 6; s++) {
          if (!baseShape.frets[s]) continue;
          baseShape.frets[s].forEach((fret: number) => {
             if (fret + baseShift - 12 < 0) canShiftDown = false;
          });
        }
        if (canShiftDown) {
          baseShift -= 12;
        }
        
        // 2. Find Exact Bounds of the Base Shape to calculate its center
        let minF = 99; let maxF = -99;
        for (let s = 0; s < 6; s++) {
          baseShape.frets[s].forEach((fret: number) => {
            const actualFret = fret + baseShift;
            if (actualFret > 0) { 
              if (actualFret < minF) minF = actualFret;
              if (actualFret > maxF) maxF = actualFret;
            }
          });
        }
        if (minF === 99) { minF = 0; maxF = 4; }
        const baseCenter = (minF + maxF) / 2;
        
        // 3. Process the entire stack
        const chordDef = CH[chordType] || { iv: [], r: [], f: [] };
        const getParentRelativeLabels = (pc: number, shapeKey: string, offset: number) => {
          const interval = (pc - rootSemi + 12) % 12;
          const idx = chordDef.iv.findIndex((iv: number) => (iv % 12) === interval);
          if (idx !== -1) {
            return { role: chordDef.r[idx], formula: chordDef.f ? chordDef.f[idx] : chordDef.r[idx] };
          }

          // Contextual override for the Diminished 4th shape
          if (shapeKey === 'dim_4_shape' && offset === 0 && interval === 4) return { role: 'b4th', formula: 'b4' };
          if (shapeKey === 'dim_4_shape' && offset === 0 && interval === 9) return { role: 'bb7th', formula: 'bb7' };

          const defaultRoles = ['root', 'b2', '2nd', 'b3', '3rd', '4th', '#4', '5th', 'b6', '6th', 'b7', '7th'];
          const defaultFormulas = ['R', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
          return { role: defaultRoles[interval], formula: defaultFormulas[interval] };
        };

        stack.forEach(({ shapeKey, offset }, stackIdx) => {
          const upperShapes = (HARDCODED_SHAPES as any)[shapeKey];
          if (!upperShapes) return;
          const targetRoot = (rootSemi + offset) % 12;
          
          let bestUpperShape: any = null;
          let bestUpperShift = 0;
          let minDistance = 999;

          // Find the single best upper shape that aligns with the base center
          upperShapes.forEach((upperShape: any) => {
            let uFret = 0; let uString = 0;
            for (let s = 0; s < 6; s++) {
              const rIdx = upperShape.roles[s].indexOf('1');
              if (rIdx !== -1) { uFret = upperShape.frets[s][rIdx]; uString = s; break; }
            }
            
            for (let oct = -2; oct <= 2; oct++) {
              let uShift = (targetRoot - GS_PC[uString] - uFret) % 12 + (oct * 12);
              let uMin = 99; let uMax = -99;
              let valid = true;
              
              for (let s = 0; s < 6; s++) {
                if (!upperShape.frets[s]) continue;
                upperShape.frets[s].forEach((fret: number) => {
                  const af = fret + uShift;
                  if (af < 0 || af > 22) valid = false;
                  if (af > 0) { uMin = Math.min(uMin, af); uMax = Math.max(uMax, af); }
                });
              }
              
              if (valid && uMin !== 99) {
                const uCenter = (uMin + uMax) / 2;
                const dist = Math.abs(uCenter - baseCenter);
                if (dist < minDistance) {
                  minDistance = dist;
                  bestUpperShape = upperShape;
                  bestUpperShift = uShift;
                }
              }
            }
          });

          if (bestUpperShape) {
            const boxNotesMap = new Map<string, ScaleNote>();
            for (let s = 0; s < 6; s++) {
              if (!bestUpperShape.frets[s]) continue;
              bestUpperShape.frets[s].forEach((fret: number, i: number) => {
                const actualFret = fret + bestUpperShift;
                if (actualFret >= 0 && actualFret <= 22) {
                  const pc = (GS_PC[s] + actualFret) % 12;
                  const relLabels = getParentRelativeLabels(pc, shapeKey, offset);
                  const finalRole = relLabels.role;
                  const finalFormula = relLabels.formula;

                  const noteKey = `${s}-${actualFret}`;
                  boxNotesMap.set(noteKey, {
                    stringIdx: s,
                    fret: actualFret,
                    role: finalRole,
                    formula: finalFormula,
                    noteName: spellInterval(rootSemi, finalFormula === 'R' ? '1' : finalFormula, namingMode === 'flat'),
                    isChordTone: true 
                  });
                }
              });
            }

            const boxNotes = Array.from(boxNotesMap.values());
            if (boxNotes.length > 0) {
              const noteNames = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;
              const rootLetter = noteNames[targetRoot];
              
              const SHAPE_DISPLAY_NAMES: Record<string, string> = {
                'maj_shape': 'Maj', 'min_shape': 'Min', 'aug_shape': 'Aug',
                'dim_4_shape': 'Dim', 'sus4_shape': 'Sus4', 'sus2_shape': 'Sus2',
                'min_b5_shape': 'm7b5', 'min_2_shape': 'Min 2', '7b9_shape': '7b9',
                'lydian_shape': 'Lydian', 'phrygian_shape': 'Phrygian', 'blues_shape': 'Blues'
              };
              const shapeDisplayName = SHAPE_DISPLAY_NAMES[shapeKey] || shapeKey.replace('_shape', '');

              const BOX_MAP: Record<string, string> = {
                'E Shape': 'Box 1 (E Shape)',
                'D Shape': 'Box 2 (D Shape)',
                'C Shape': 'Box 3 (C Shape)',
                'A Shape': 'Box 4 (A Shape)',
                'G Shape': 'Box 5 (G Shape)'
              };

              results.push({
                boxName: BOX_MAP[baseShape.name] || baseShape.name,
                boxNumber: index + 1,
                scaleName: `${rootLetter} ${shapeDisplayName} Shape`,
                scaleId: `hardcoded-${stackIdx}-${shapeKey}`,
                notes: boxNotes.sort((a, b) => a.stringIdx - b.stringIdx || a.fret - b.fret),
                minFret: Math.min(...boxNotes.map(n => n.fret).filter(f => f > 0)),
                maxFret: Math.max(...boxNotes.map(n => n.fret).filter(f => f > 0))
              });
            }
          }
        });
      });

  return results;
}