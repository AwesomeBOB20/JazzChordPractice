import { CH, PATTERNS, CHORD_PATTERN_MAP, spellInterval, NOTE_SHARP, NOTE_FLAT, SCALES, CHORD_SCALE_MAP, GUITAR_TUNING, GUITAR_TUNING_SEMITONES } from '@shared/theory/musicTheory';
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

export const GS = GUITAR_TUNING;

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

export const BARRE_SHAPES: Record<string, { name: string; rootSemi: number; variation: string; frets: (number | null)[]; roles: (string | null)[]; fingers?: (number | null)[] }[]> = {
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
  ],
};

export const OPEN_SHAPES: Record<string, { rootSemi: number; name: string; variation?: string; frets: (number | null)[]; roles: (string | null)[] }[]> = {
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
    { rootSemi: 7, name: 'G Shape (sus2)', variation: 'Standard', frets: [3, 0, 0, 0, 3, 3], roles: ['root', '2nd', '5th', 'root', '5th', 'root'] },
    { rootSemi: 9, name: 'A Shape (sus2)', variation: 'Standard', frets: [null, 0, 2, 2, 0, 0], roles: [null, 'root', '5th', 'root', '2nd', '5th'] },
  ],
  // Common open-position extension chords (interval-verified against standard tuning).
  // Each only renders when the selected root matches rootSemi (open chords can't transpose).
  'add9': [
    { rootSemi: 0, name: 'C Shape (add9)', variation: 'Standard', frets: [null, 3, 2, 0, 3, 0], roles: [null, 'root', '3rd', '5th', '9th', '3rd'] },
    { rootSemi: 9, name: 'A Shape (add9)', variation: 'Standard', frets: [null, 0, 2, 4, 2, 0], roles: [null, 'root', '5th', '9th', '3rd', '5th'] },
    { rootSemi: 4, name: 'E Shape (add9)', variation: 'Standard', frets: [0, 2, 2, 1, 0, 2], roles: ['root', '5th', 'root', '3rd', '5th', '9th'] },
    { rootSemi: 7, name: 'G Shape (add9)', variation: 'Standard', frets: [3, 2, 0, 2, 0, 3], roles: ['root', '3rd', '5th', '9th', '3rd', 'root'] },
  ],
  'minAdd9': [
    { rootSemi: 4, name: 'E Shape (m add9)', variation: 'Standard', frets: [0, 2, 2, 0, 0, 2], roles: ['root', '5th', 'root', 'b3', '5th', '9th'] },
    { rootSemi: 9, name: 'A Shape (m add9)', variation: 'Standard', frets: [null, 0, 2, 4, 1, 0], roles: [null, 'root', '5th', '9th', 'b3', '5th'] },
  ],
  'dom9': [
    { rootSemi: 4, name: 'E Shape (9)', variation: 'Standard', frets: [0, 2, 0, 1, 0, 2], roles: ['root', '5th', 'b7', '3rd', '5th', '9th'] },
    { rootSemi: 0, name: 'C Shape (9)', variation: 'Standard', frets: [null, 3, 2, 3, 3, 0], roles: [null, 'root', '3rd', 'b7', '9th', '3rd'] },
  ],
  'maj9': [
    { rootSemi: 9, name: 'A Shape (maj9)', variation: 'Standard', frets: [null, 0, 2, 1, 0, 0], roles: [null, 'root', '5th', '7th', '9th', '5th'] },
    { rootSemi: 4, name: 'E Shape (maj9)', variation: 'Standard', frets: [0, 2, 1, 1, 0, 2], roles: ['root', '5th', '7th', '3rd', '5th', '9th'] },
  ],
  'min9': [
    { rootSemi: 4, name: 'E Shape (m9)', variation: 'Standard', frets: [0, 2, 0, 0, 0, 2], roles: ['root', '5th', 'b7', 'b3', '5th', '9th'] },
  ],
  'maj69': [
    { rootSemi: 0, name: 'C Shape (6/9)', variation: 'Standard', frets: [null, 3, 2, 2, 3, 3], roles: [null, 'root', '3rd', '6th', '9th', '5th'] },
    { rootSemi: 9, name: 'A Shape (6/9)', variation: 'Standard', frets: [null, 0, 2, 4, 2, 2], roles: [null, 'root', '5th', '9th', '3rd', '6th'] },
  ],
  'dom7sus4': [
    { rootSemi: 9, name: 'A Shape (7sus4)', variation: 'Standard', frets: [null, 0, 2, 0, 3, 0], roles: [null, 'root', '5th', 'b7', '4th', '5th'] },
    { rootSemi: 2, name: 'D Shape (7sus4)', variation: 'Standard', frets: [null, null, 0, 2, 1, 3], roles: [null, null, 'root', '5th', 'b7', '4th'] },
    { rootSemi: 4, name: 'E Shape (7sus4)', variation: 'Standard', frets: [0, 2, 0, 2, 0, 0], roles: ['root', '5th', 'b7', '4th', '5th', 'root'] },
    { rootSemi: 7, name: 'G Shape (7sus4)', variation: 'Standard', frets: [3, 3, 0, 0, 1, 1], roles: ['root', '4th', '5th', 'root', '4th', 'b7'] },
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

  const isSourceTriad = chordDef.iv.length === 3;

  for (let ci = 0; ci < chordDef.iv.length; ci++) {
    if (isSourceTriad && chordDef.r[ci] !== 'root') continue;

    for (const [triadKey, triadDef] of Object.entries(TRIAD_TYPES)) {
      const triadRoot = chordDef.iv[ci] % 12;
      const triadPCs = triadDef.iv.map(iv => (triadRoot + iv) % 12);

      if (!triadPCs.every(pc => pcs.has(pc))) continue;

      const parentRoles = triadPCs.map(pc => {
        const idx = chordDef.iv.findIndex(iv => iv % 12 === pc);
        return chordDef.r[idx];
      });

      const pcSetKey = [...triadPCs].sort((a, b) => a - b).join(',');
      const isDup = result.some(x => {
        const xPCs = x.triadDef.iv.map((iv: number) => (x.rootInterval % 12 + iv) % 12).sort((a: number, b: number) => a - b).join(',');
        return xPCs === pcSetKey;
      });

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


export const TRIAD_FULL_NAMES: Record<string, string> = {
  maj:     'Major',
  min:     'Minor',
  aug:     'Augmented',
  dim:     'Diminished',
  sus4:    'Sus4',
  sus2:    'Sus2',
  maj_b5:  'Major ♭5',
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
  const bassRank = (label: string) => label.includes('D Bass') ? 0 : label.includes('A Bass') ? 1 : label.includes('E Bass') ? 2 : label.charCodeAt(0);
  groups.sort((a, b) => bassRank(a.label) - bassRank(b.label));
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

// Shell tone-set derivation — the single source of truth for which notes a
// shell contains. Tone-sets are derived from the chord's own role list (CH) so
// the displayed labels and the sounding pitches can never disagree.
//
// Rules:
//  - guide tones = the 3rd-role (3rd/b3rd, or 4th/2nd for sus chords) and the
//    7th-role (7th/b7th/bb7, or the 6th for 6th chords).
//  - the perfect 5th (role exactly '5th') is NEVER included; altered fifths
//    (b5th/#5th) count as ordinary color tones.
//  - base shell  = root + both guide tones.
//  - rootless shells = both guide tones + one color tone, one per color tone.
//  - plain 7th/6th chords (no color tones) also get the bare 2-note guide-tone
//    shell (3 + 7).
//  - chords with no 7th-role and no 6th (pure triads, add9/minAdd9) get nothing.
const SHELL_THIRD_ROLES = ['3rd', 'b3rd'];
const SHELL_THIRD_SUBS = ['4th', '2nd']; // sus chords have no 3rd
const SHELL_SEVENTH_ROLES = ['7th', 'b7th', 'bb7'];

export function deriveShellToneSets(
  chordDef: { iv: number[]; r: string[]; f?: string[] }
): string[][] {
  const r = chordDef.r;

  let third = r.find(role => SHELL_THIRD_ROLES.includes(role)) ?? null;
  if (!third) third = SHELL_THIRD_SUBS.find(sub => r.includes(sub)) ?? null;

  let seventh = r.find(role => SHELL_SEVENTH_ROLES.includes(role)) ?? null;
  if (!seventh && r.includes('6th')) seventh = '6th';

  // No usable upper guide tone (pure triads, add9/minAdd9) → no shells.
  if (!third || !seventh) return [];

  const colorTones = r.filter(role =>
    role !== 'root' && role !== third && role !== seventh && role !== '5th'
  );

  const toneSets: string[][] = [
    ['root', third, seventh],   // R37
    ['root', seventh, third],   // R73
  ];
  for (const color of colorTones) {
    toneSets.push([third, seventh, color]);   // 3-7-ext
    toneSets.push([seventh, third, color]);   // 7-3-ext
  }
  return toneSets;
}

// String sets used to voice a shell, grouped by which string carries the bass
// (the first index). 3-note sets skip an interior string (classic shell shapes);
// 2-note sets use an adjacent pair.
const SHELL_STRING_SETS_3: number[][] = [
  [0, 1, 2],  // 654
  [0, 2, 3],  // 643
  [1, 2, 3],  // 543
  [1, 3, 4],  // 532
  [2, 3, 4],  // 432
  [2, 4, 5],  // 421
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
  'dom7b9', 'dom7s9', 'dom7b13',
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
      { label: 'Δ7',      iv: [0, 4, 11] }, // R 3 7
      { label: 'm7',      iv: [0, 3, 10] }, // R b3 b7
      { label: '7',       iv: [0, 4, 10] }, // R 3 b7
      { label: '6',       iv: [0, 4, 9] },  // R 3 6
      { label: 'm6',      iv: [0, 3, 9] },  // R b3 6
      { label: 'ø7',      iv: [0, 6, 10] }, // R b5 b7
      { label: '7sus4',   iv: [0, 5, 10] }, // R 4 b7
      { label: '(♭5)',    iv: [0, 4, 6] },  // R 3 b5
      { label: 'sus2(♭5)', iv: [0, 2, 6] },  // R 2 b5
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
  const matches: { type: string; complexity: number; root: number; name: string; label: string }[] = [];
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
        const label = def.s;  // short Berklee symbol (Δ7/ø7/…) — keeps the "Root symbol" shape consumers depend on
        if (typeof name === 'string' && typeof label === 'string') {
          matches.push({ type, complexity: def.iv.length, root, name, label });
        }
      }
    }
  }
  
  // Sort by complexity (fewer notes = simpler = priority)
  matches.sort((a, b) => a.complexity - b.complexity);
  
  if (matches.length > 0) {
    const best = matches[0];
    return `${best.name} ${best.label}`;
  }

  // Pass 2: Common 3-note shell subsets (rootless or 5th-less voicings)
  if (pcSet.size === 3) {
    const SHELL_PATTERNS = [
      { label: 'Δ7',      iv: [0, 4, 11] }, // R 3 7
      { label: 'm7',      iv: [0, 3, 10] }, // R b3 b7
      { label: '7',       iv: [0, 4, 10] }, // R 3 b7
      { label: '6',       iv: [0, 4, 9] },  // R 3 6
      { label: 'm6',      iv: [0, 3, 9] },  // R b3 6
      { label: 'ø7',      iv: [0, 6, 10] }, // R b5 b7
      { label: '7sus4',   iv: [0, 5, 10] }, // R 4 b7
      { label: '(♭5)',    iv: [0, 4, 6] },  // R 3 b5
      { label: 'sus2(♭5)', iv: [0, 2, 6] },  // R 2 b5
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

// Place a shell tone-set on a string set at the lowest fretable, compact
// (span ≤ 4) position. roles[0] is the bass and goes on the lowest string;
// each upper voice picks the octave closest to the bass fret. Labels come
// directly from the roles, so they always match the sounding pitch.
// Returns null when no octave of the grip fits within a 4-fret hand span.
function placeShellToneSet(
  roles: string[],
  strings: number[],
  chordDef: { iv: number[]; r: string[]; f?: string[] },
  rootSemi: number
): { fretArr: VoicingFret[]; rolesUsed: string[]; formulasUsed: string[] } | null {
  const pcs: number[] = [];
  for (const role of roles) {
    const iv = roleToInterval(role, chordDef);
    if (iv === null) return null;
    pcs.push((rootSemi + iv) % 12);
  }

  const bassStr = strings[0];
  const bassBaseFret = (((pcs[0] - (GS[bassStr] % 12)) % 12) + 12) % 12; // 0..11

  for (const octaveShift of [0, 12]) {
    const bassFret = bassBaseFret + octaveShift;
    if (bassFret > 22) continue;

    // Each upper voice can sound its pitch at several octaves on the neck.
    const candLists: number[][] = [];
    for (let i = 1; i < roles.length; i++) {
      const str = strings[i];
      const base = (((pcs[i] - (GS[str] % 12)) % 12) + 12) % 12; // 0..11
      const cands = [base - 12, base, base + 12, base + 24].filter(f => f >= 0 && f <= 22);
      if (!cands.length) break;
      candLists.push(cands);
    }
    if (candLists.length !== roles.length - 1) continue;

    // Choose the upper-voice octaves that minimise the hand span (ignoring open
    // strings, same rule as the rest of the app); ties prefer the lower position.
    let best: number[] | null = null;
    let bestSpan = Infinity;
    let bestMax = Infinity;
    const combo: number[] = [];
    const search = (k: number) => {
      if (k === candLists.length) {
        const all = [bassFret, ...combo];
        const fretted = all.filter(f => f > 0);
        const hasOpen = all.some(f => f === 0);
        // When open strings mix with fretted notes, measure from fret 0 to the
        // highest fret so grips like [0, 0, 11] are rejected as unplayable.
        const span = fretted.length === 0 ? 0
          : hasOpen ? Math.max(...fretted)
          : Math.max(...fretted) - Math.min(...fretted);
        if (span > 4) return;
        const maxF = Math.max(...all);
        if (span < bestSpan || (span === bestSpan && maxF < bestMax)) {
          best = combo.slice();
          bestSpan = span;
          bestMax = maxF;
        }
        return;
      }
      for (const f of candLists[k]) { combo.push(f); search(k + 1); combo.pop(); }
    };
    search(0);
    if (best === null) continue;

    const frets: number[] = [bassFret, ...best];

    const fretArr: VoicingFret[] = Array(6).fill(null).map(() => ({ fret: null, role: null, finger: 0 }));
    const rolesUsed: string[] = [];
    const formulasUsed: string[] = [];
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      const idx = chordDef.r.indexOf(role);
      const rawFormula = (idx !== -1 && chordDef.f?.[idx] != null) ? chordDef.f[idx] : role;
      const formula = rawFormula.replace(/root/gi, '1').replace(/(nd|rd|th|st)/g, '');
      rolesUsed.push(role);
      formulasUsed.push(formula === 'root' ? '1' : formula);
      fretArr[strings[i]] = { fret: frets[i], role, finger: 0 };
    }
    return { fretArr, rolesUsed, formulasUsed };
  }
  return null;
}

export function buildShellVoicings(
  chordType: string,
  chordDef: { iv: number[]; r: string[]; f?: string[] },
  rootSemi: number,
  rootNoteName: string = '',
  fullChordName: string = '',
  namingMode: 'sharp' | 'flat' = 'sharp'
): VoicingGroup[] {
  const toneSets = deriveShellToneSets(chordDef);
  if (!toneSets.length) return [];

  // Group by which physical string the bass note sits on so that R37 and R73
  // (plus rootless extensions) land in the same bucket regardless of whether
  // they use the consecutive or skip-string variant of that string group.
  const BASS_STR_LABEL: Record<number, string> = { 0: 'E Bass', 1: 'A Bass', 2: 'D Bass' };
  const groupMap = new Map<string, Voicing[]>();

  for (const roles of toneSets) {
    for (const strings of SHELL_STRING_SETS_3) {
      const placed = placeShellToneSet(roles, strings, chordDef, rootSemi);
      if (!placed) continue;

      const groupKey = BASS_STR_LABEL[strings[0]] ?? `String ${6 - strings[0]} Bass`;
      const fp = makeFingerprint(placed.fretArr);

      const chordLabel = fullChordName
        || getEffectiveChordLabel(chordType, placed.rolesUsed, rootSemi, rootNoteName, fullChordName, namingMode)
        || formatShellLabel(roles);

      const voicing: Voicing = {
        name: placed.formulasUsed.join('-'),
        chordLabel: String(chordLabel),
        frets: assignFingers(placed.fretArr),
        fingerprint: fp,
        bassNote: roles[0],
        type: 'shell',
      };

      if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
      if (!groupMap.get(groupKey)!.some(v => v.fingerprint === fp)) {
        groupMap.get(groupKey)!.push(voicing);
      }
    }
  }

  const groups: VoicingGroup[] = [];
  groupMap.forEach((voicings, label) => {
    if (voicings.length > 0) groups.push({ label, stringNums: label, voicings });
  });
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
  const TUNING = GUITAR_TUNING_SEMITONES;

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
      let minRelFret = Math.min(...notesData.map(n => n[1] + shift));
      while (minRelFret < 0) {
          shift += 12;
          minRelFret = Math.min(...notesData.map(n => n[1] + shift));
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
            label: identified || formula.join('-'),
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
  { label: 'Strings 6-5-4-3', stringNums: '6 5 4 3', indices: [0, 1, 2, 3] },
];

const DROP3_STRING_GROUPS = [
  { label: 'Strings 5-3-2-1', stringNums: '5 3 2 1', indices: [1, 3, 4, 5] },
  { label: 'Strings 6-4-3-2', stringNums: '6 4 3 2', indices: [0, 2, 3, 4] },
  { label: 'Strings 6-5-3-1', stringNums: '6 5 3 1', indices: [0, 1, 3, 5] },
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
  // Rootless voicings: drop the root and voice the upper structure as another
  // chord's shape. This ONLY works when the requested chord's upper structure
  // genuinely IS the substitute chord. The entries below are verified correct
  // by tests/guitar-drop-voicings.test.ts (every drawn note matches its label).
  //
  // REMOVED (2026-05-30): 11 substitutions that produced mislabeled / wrong
  // notes — maj11, dom7s11, maj7s11, min69, add9, minAdd9, dom7s9, dom7b5s9,
  // dom7s5b9, dom7s5s9, dimMaj7. Their borrowed source chord doesn't contain the
  // chord's defining tones (e.g. maj7♯11 from a min7-of-the-3rd yields the 9th,
  // not the ♯11), so no role map could label them correctly. These chords keep
  // their correct ROOTED drop voicings; they just no longer emit a wrong
  // rootless one. A learning app must never display a wrong note.
  const ROOTLESS_SUB_MAP: Record<string, { type: string, ivOffset: number, roleMap: string[], rootFormula: string }> = {
    // 9th chords — rootless = core 7th from 3rd or b3
    'maj9':     { type: 'min7',     ivOffset: 4,  roleMap: ['3rd', '5th', '7th', '9th'],     rootFormula: '3'  },
    'min9':     { type: 'maj7',     ivOffset: 3,  roleMap: ['b3', '5th', 'b7', '9th'],       rootFormula: 'b3' },
    'dom9':     { type: 'hdim7',    ivOffset: 4,  roleMap: ['3rd', '5th', 'b7', '9th'],      rootFormula: '3'  },
    'minMaj9':  { type: 'maj7s5',   ivOffset: 3,  roleMap: ['b3', '5th', '7th', '9th'],      rootFormula: 'b3' },
    // 11th chords — rootless = core 7th from 5th
    'min11':    { type: 'min7',     ivOffset: 7,  roleMap: ['5th', 'b7', '9th', '11th'],     rootFormula: '5'  },
    'dom11':    { type: 'min7',     ivOffset: 7,  roleMap: ['5th', 'b7', '9th', '11th'],     rootFormula: '5'  },
    // maj11 rootless = dom7 on the 5th (5-7-9-11; e.g. Cmaj11 → G7). Keeps the 9 & 11,
    // drops the root and the 3rd (which clashes a ♭9 against the 11th).
    'maj11':    { type: 'dom7',     ivOffset: 7,  roleMap: ['5th', '7th', '9th', '11th'],    rootFormula: '5'  },
    // 13th chords — rootless voices the 13th where a standard borrow covers it
    // maj13: borrow dom7sus4 from 3rd → E A B D = [3rd, 13th, 7th, 9th] (includes the 13th)
    'maj13':    { type: 'dom7sus4', ivOffset: 4,  roleMap: ['3rd', '13th', '7th', '9th'],    rootFormula: '3'  },
    // min13/dom13: no standard borrow reaches [b3/3, b7, 9, 13] exactly → voice the 9th instead
    'min13':    { type: 'maj7',     ivOffset: 3,  roleMap: ['b3', '5th', 'b7', '9th'],       rootFormula: 'b3' },
    'dom13':    { type: 'hdim7',    ivOffset: 4,  roleMap: ['3rd', '5th', 'b7', '9th'],      rootFormula: '3'  },
    'dom13b9':  { type: 'fdim7',    ivOffset: 4,  roleMap: ['3rd', '5th', 'b7', 'b9'],       rootFormula: '3'  },
    'dom13s9':  { type: 'min7',     ivOffset: 3,  roleMap: ['#9', 'b5', 'b7', 'b9'],         rootFormula: '#9' },
    // 6/9 chords
    'maj69':    { type: 'dom7sus4', ivOffset: 9,  roleMap: ['6th', '9th', '3rd', '5th'],     rootFormula: '6'  },
    // Altered / sus dominant chords
    'dom7b9':   { type: 'fdim7',    ivOffset: 4,  roleMap: ['3rd', '5th', 'b7', 'b9'],       rootFormula: '3'  },
    // dom7s9: borrow dimMaj7 from 3rd → E G Bb Eb = [3rd, 5th, b7, #9] (includes the #9)
    'dom7s9':   { type: 'dimMaj7',  ivOffset: 4,  roleMap: ['3rd', '5th', 'b7', '#9'],       rootFormula: '3'  },
    'dom7alt':  { type: 'min7',     ivOffset: 3,  roleMap: ['#9', 'b5', 'b7', 'b9'],         rootFormula: '#9' },
    'dom7b13':  { type: 'dom7b5',   ivOffset: 4,  roleMap: ['3rd', 'b13', 'b7', '9th'],      rootFormula: '3'  },
    'dom7b5b9': { type: 'dom7',     ivOffset: 6,  roleMap: ['b5', 'b7', 'b9', '3rd'],        rootFormula: 'b5' },
    // 7♯5♭9 rootless upper structure = a min6 built on the ♭9 (e.g. C7♯5♭9 → D♭m6).
    // min6 [root,b3,5,6] on the ♭9 spells exactly [♭9, 3rd, ♯5, ♭7] — every note correct.
    'dom7s5b9': { type: 'min6',     ivOffset: 1,  roleMap: ['b9', '3rd', '#5', 'b7'],        rootFormula: 'b9' },
    'dom9sus4':  { type: 'maj6',    ivOffset: 10, roleMap: ['b7', '9th', '4th', '5th'],      rootFormula: 'b7' },
    'dom13sus4': { type: 'maj7',    ivOffset: 10, roleMap: ['b7', '9th', '4th', '13th'],     rootFormula: 'b7' },
  };

  const fallbackMap: Record<string, string> = {
    'maj7s5': 'maj7s5',
    // 9th chords → core 7th rooted voicings
    'maj9': 'maj7', 'min9': 'min7', 'dom9': 'dom7', 'minMaj9': 'minMaj7',
    // 11th chords
    'maj11': 'maj7', 'min11': 'min7', 'dom11': 'dom7sus4',
    'dom7s11': 'dom7', 'maj7s11': 'maj7',
    // 13th chords
    'maj13': 'maj7', 'min13': 'min7', 'dom13': 'dom7',
    'dom13b9': 'dom7', 'dom13s9': 'dom7',
    // 6/9 — drop the (un-drawable) 9th; every shown note (R-3-5-6) is still a real chord tone
    'maj69': 'maj6', 'min69': 'min6',
    // add9 / minAdd9 are 4-note chords (R-3-5-9) with their OWN correct drop shapes in
    // DROP_VOICINGS. They must NOT fall back to maj7/min7 — that would draw a 7th the chord
    // doesn't contain and omit the defining 9th. (No fallback entry → uses 'add9'/'minAdd9'.)
    // Altered dominants — all map to core shapes that exist in drop2+drop3+drop2and4
    // dom7b9/dom7s9 drop2 shapes are pitch-identical to dom7 (voice R-3-5-b7)
    // dom7alt drop2 shapes are pitch-identical to dom7s5 (both voice R-3-#5-b7)
    'dom7b9': 'dom7', 'dom7s9': 'dom7', 'dom7alt': 'dom7s5',
    'dom7b13': 'dom7s5',
    'dom7b5b9': 'dom7b5', 'dom7b5s9': 'dom7b5',
    'dom7s5b9': 'dom7s5', 'dom7s5s9': 'dom7s5',
    // Sus chords
    'dom9sus4': 'dom7sus4', 'dom13sus4': 'dom7sus4',
    // dimMaj7 is NOT here: it has its own correct R-b3-b5-7 grids in DROP_VOICINGS.
    // Mapping it to minMaj7 drew a natural 5th instead of the ♭5 (wrong note) and
    // shadowed those grids — same class of bug as the old add9→maj7 fallback.
  };

  const passes = [
    { effectiveType: fallbackMap[chordType] || chordType, effectiveRootSemi: rootSemi, isRootless: false, roleMap: null as string[] | null, rootFormula: '' }
  ];

  // Self pass: a chord routed to a smaller base shape via fallbackMap can ALSO carry
  // its own authored grids (e.g. an extension voicing that includes a tone the base
  // omits). Those grids index the chord's full iv, so they're labelled by its own
  // roles — no synthetic chord type or rootless borrow needed. Only fires for chords
  // that are both fallback-mapped AND have a DROP_VOICINGS entry under their own key.
  if (fallbackMap[chordType] && fallbackMap[chordType] !== chordType) {
    passes.push({ effectiveType: chordType, effectiveRootSemi: rootSemi, isRootless: false, roleMap: null as string[] | null, rootFormula: '' });
  }

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
               formula = role.replace(/root/gi, '1').replace(/(nd|rd|th|st)/g, '');
            } else {
               const rawFormula = typeof formulaOverride === 'string' ? formulaOverride : (effectiveDef.f?.[intIdx] ?? role);
               formula = rawFormula.replace(/root/gi, '1').replace(/(nd|rd|th|st)/g, '');
            }

            rolesUsed.push(role);
            formulasUsed.push(formula === 'root' ? '1' : formula);
            fretArr[strIdx] = { fret, role, finger: 0 };
          }

          if (isValid) {
            const fp = makeFingerprint(fretArr);
            let chordLabelText = '';
            if (pass.isRootless) {
              const subRootName = spellInterval(rootSemi, pass.rootFormula, namingMode === 'flat');
              const subDef = CH[pass.effectiveType];
              const subTypeName = subDef ? subDef.l : pass.effectiveType;
              // Show the shape's OWN compact chord (e.g. "D♭ 7"); the card title
              // already names the parent, so the old "(as <parent>)" suffix was redundant.
              chordLabelText = `${subRootName} ${subDef?.s ?? subTypeName}`;
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
    'maj_b5': [{ shapeKey: 'maj_b5_shape', offset: 0 }],
    
    'maj7': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 4 }],
    'maj9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 4 }],
    // Maj11: Stack maj at 0 + min at 11 (C major + B minor) for 7, 9, 11
    'maj11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 11 }],
    // Maj13: Stack maj at 0 + min at 4 + sus2 at 7 for R, 3, 5, 7, 9, 13
    'maj13': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 4 }, { shapeKey: 'sus2_shape', offset: 7 }],
    'add9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'sus2_shape', offset: 0 }],
    
    'maj6': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 9 }],
    'maj69': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 9 }],
    'maj7s5': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 4 }],
    'maj7s11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 2 }],

    'minAdd9': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'sus2_shape', offset: 0 }],
    'min7': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
    'min9': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
    // Min11: Stack min at 0 + maj at 10 (C minor + Bb major) for b7, 9, 11
    'min11': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
    // Min13: Stack min at 0 + maj at 10 + min at 2 for R, b3, 5, b7, 9, 11, 13
    'min13': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }, { shapeKey: 'min_shape', offset: 2 }],
    'min6': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 9 }],
    'min69': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 9 }],
    'minMaj7': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'aug_shape', offset: 3 }],
    'minMaj9': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'aug_shape', offset: 3 }],

    'dom7': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 4 }],
    'dom9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 4 }],
    // Dom11: Stack sus4 at 0 + maj at 10 (Csus4 + Bb major) for b7, 9, 11
    'dom11': [{ shapeKey: 'sus4_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
    // Dom13: Stack maj at 0 + min at 7 + sus2 at 2 for R, 3, 5, b7, 9, 13
    'dom13': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }, { shapeKey: 'sus2_shape', offset: 2 }],
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
    'dom7b5': [{ shapeKey: 'b5_shape', offset: 0 }],
    'dom7s5': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
    
    'dom7s11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 2 }],
    'dom7b5b9': [{ shapeKey: 'b5_b9_shape', offset: 0 }],
    'dom7b5s9': [{ shapeKey: 'b5_s9_shape', offset: 0 }],
    'dom7s5b9': [{ shapeKey: 's5_b9_shape', offset: 0 }],
    'dom7s5s9': [{ shapeKey: 's5_s9_shape', offset: 0 }],
    
    'dimMaj7': [{ shapeKey: 'dim_4_shape', offset: 0 }],
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

          // Contextual override for b5 shapes to show 3rd for visualization
          if (shapeKey === 'maj_b5_shape' && offset === 0 && interval === 4) return { role: '3rd', formula: '3' };

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

export function filterVoicingsByInversion(
  voicings: Voicing[],
  inversion: 'root' | '1st' | '2nd' | '3rd'
): Voicing[] {
  if (inversion === 'root') {
    // Match both "Root Position" (triads) and "Root Pos" (drop voicings)
    return voicings.filter(v => v.name.includes('Root Position') || v.name.includes('Root Pos') || !v.name.includes('Inv'));
  }
  // Match both "1st Inversion" (triads) and "1st Inv" (drop voicings)
  return voicings.filter(v => v.name.includes(`${inversion} Inversion`) || v.name.includes(`${inversion} Inv`));
}