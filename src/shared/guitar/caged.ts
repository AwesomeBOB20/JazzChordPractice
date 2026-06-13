import { SCALES, CHORD_SCALE_MAP, NOTE_FLAT, NOTE_SHARP, CH, GUITAR_TUNING_SEMITONES } from '@shared/theory/musicTheory';
import { ScaleVoicing } from '@shared/guitar/voicings';

const TUNING = GUITAR_TUNING_SEMITONES;

// ─── 1. PASTE YOUR BUILDER EXPORT HERE ──────────────────────────────
export const PARENT_SCALE_TEMPLATES: Record<string, Record<string, [number, number, string][]>> = {
  'ionian': {
    'Box 1 (E Shape)': [[0, -1, '7'], [0, 0, 'R'], [0, 2, '2'], [1, -1, '3'], [1, 0, '4'], [1, 2, '5'], [2, -1, '6'], [2, 1, '7'], [2, 2, 'R'], [3, -1, '2'], [3, 1, '3'], [3, 2, '4'], [4, 0, '5'], [4, 2, '6'], [5, -1, '7'], [5, 0, 'R'], [5, 2, '2']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 2, '3'], [0, 3, '4'], [1, 0, '5'], [1, 2, '6'], [2, -1, '7'], [2, 0, 'R'], [2, 2, '2'], [3, -1, '3'], [3, 0, '4'], [3, 2, '5'], [4, 0, '6'], [4, 2, '7'], [4, 3, 'R'], [5, 0, '2'], [5, 2, '3'], [5, 3, '4']],
    'Box 3 (C Shape)': [[0, -3, '3'], [0, -2, '4'], [0, 0, '5'], [1, -3, '6'], [1, -1, '7'], [1, 0, 'R'], [2, -3, '2'], [2, -1, '3'], [2, 0, '4'], [3, -3, '5'], [3, -1, '6'], [4, -3, '7'], [4, -2, 'R'], [4, 0, '2'], [5, -3, '3'], [5, -2, '4'], [5, 0, '5']],
    'Box 4 (A Shape)': [[0, 0, '5'], [0, 2, '6'], [1, -1, '7'], [1, 0, 'R'], [1, 2, '2'], [2, -1, '3'], [2, 0, '4'], [2, 2, '5'], [3, -1, '6'], [3, 1, '7'], [3, 2, 'R'], [4, 0, '2'], [4, 2, '3'], [4, 3, '4'], [5, 0, '5'], [5, 2, '6']],
    'Box 5 (G Shape)': [[0, -3, '6'], [0, -1, '7'], [0, 0, 'R'], [1, -3, '2'], [1, -1, '3'], [1, 0, '4'], [2, -3, '5'], [2, -1, '6'], [3, -4, '7'], [3, -3, 'R'], [3, -1, '2'], [4, -3, '3'], [4, -2, '4'], [4, 0, '5'], [5, -3, '6'], [5, -1, '7'], [5, 0, 'R']]
  },
  'maj_pent': {
    'Box 1 (E Shape)': [[0, 0, 'R'], [0, 2, '2'], [1, -1, '3'], [1, 2, '5'], [2, -1, '6'], [2, 2, 'R'], [3, -1, '2'], [3, 1, '3'], [4, 0, '5'], [4, 2, '6'], [5, 0, 'R'], [5, 2, '2']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 2, '3'], [1, 0, '5'], [1, 2, '6'], [2, 0, 'R'], [2, 2, '2'], [3, -1, '3'], [3, 2, '5'], [4, 0, '6'], [4, 3, 'R'], [5, 0, '2'], [5, 2, '3']],
    'Box 3 (C Shape)': [[0, -3, '3'], [0, 0, '5'], [1, -3, '6'], [1, 0, 'R'], [2, -3, '2'], [2, -1, '3'], [3, -3, '5'], [3, -1, '6'], [4, -2, 'R'], [4, 0, '2'], [5, -3, '3'], [5, 0, '5']],
    'Box 4 (A Shape)': [[0, 0, '5'], [0, 2, '6'], [1, 0, 'R'], [1, 2, '2'], [2, -1, '3'], [2, 2, '5'], [3, -1, '6'], [3, 2, 'R'], [4, 0, '2'], [4, 2, '3'], [5, 0, '5'], [5, 2, '6']],
    'Box 5 (G Shape)': [[0, -3, '6'], [0, 0, 'R'], [1, -3, '2'], [1, -1, '3'], [2, -3, '5'], [2, -1, '6'], [3, -3, 'R'], [3, -1, '2'], [4, -3, '3'], [4, 0, '5'], [5, -3, '6'], [5, 0, 'R']]
  },
  'mel_min': {
    'Box 1 (E Shape)': [[0, -1, '7'], [0, 0, 'R'], [0, 2, '2'], [0, 3, 'b3'], [1, 0, '4'], [1, 2, '5'], [2, -1, '6'], [2, 1, '7'], [2, 2, 'R'], [3, -1, '2'], [3, 0, 'b3'], [3, 2, '4'], [4, 0, '5'], [4, 2, '6'], [5, -1, '7'], [5, 0, 'R'], [5, 2, '2'], [5, 3, 'b3']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 1, 'b3'], [0, 3, '4'], [1, 0, '5'], [1, 2, '6'], [2, -1, '7'], [2, 0, 'R'], [2, 2, '2'], [2, 3, 'b3'], [3, 0, '4'], [3, 2, '5'], [4, 0, '6'], [4, 2, '7'], [4, 3, 'R'], [5, 0, '2'], [5, 1, 'b3'], [5, 3, '4']],
    'Box 3 (C Shape)': [[0, -2, '4'], [0, 0, '5'], [1, -3, '6'], [1, -1, '7'], [1, 0, 'R'], [2, -3, '2'], [2, -2, 'b3'], [2, 0, '4'], [3, -3, '5'], [3, -1, '6'], [4, -3, '7'], [4, -2, 'R'], [4, 0, '2'], [4, 1, 'b3'], [5, -2, '4'], [5, 0, '5']],
    'Box 4 (A Shape)': [[0, 0, '5'], [0, 2, '6'], [1, -1, '7'], [1, 0, 'R'], [1, 2, '2'], [1, 3, 'b3'], [2, 0, '4'], [2, 2, '5'], [3, -1, '6'], [3, 1, '7'], [3, 2, 'R'], [4, 0, '2'], [4, 1, 'b3'], [4, 3, '4'], [5, 0, '5'], [5, 2, '6']],
    'Box 5 (G Shape)': [[0, -3, '6'], [0, -1, '7'], [0, 0, 'R'], [1, -3, '2'], [1, -2, 'b3'], [1, 0, '4'], [2, -3, '5'], [2, -1, '6'], [3, -4, '7'], [3, -3, 'R'], [3, -1, '2'], [3, 0, 'b3'], [4, -2, '4'], [4, 0, '5'], [5, -3, '6'], [5, -1, '7'], [5, 0, 'R']]
  },
  'harm_min': {
    'Box 1 (E Shape)': [[0, -1, '7'], [0, 0, 'R'], [0, 2, '2'], [0, 3, 'b3'], [1, 0, '4'], [1, 2, '5'], [1, 3, 'b6'], [2, 1, '7'], [2, 2, 'R'], [3, -1, '2'], [3, 0, 'b3'], [3, 2, '4'], [4, 0, '5'], [4, 1, 'b6'], [5, -1, '7'], [5, 0, 'R'], [5, 2, '2'], [5, 3, 'b3']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 1, 'b3'], [0, 3, '4'], [1, 0, '5'], [1, 1, 'b6'], [2, -1, '7'], [2, 0, 'R'], [2, 2, '2'], [2, 3, 'b3'], [3, 0, '4'], [3, 2, '5'], [3, 3, 'b6'], [4, 2, '7'], [4, 3, 'R'], [5, 0, '2'], [5, 1, 'b3'], [5, 3, '4']],
    'Box 3 (C Shape)': [[0, -2, '4'], [0, 0, '5'], [0, 1, 'b6'], [1, -1, '7'], [1, 0, 'R'], [2, -3, '2'], [2, -2, 'b3'], [2, 0, '4'], [3, -3, '5'], [3, -2, 'b6'], [4, -3, '7'], [4, -2, 'R'], [4, 0, '2'], [4, 1, 'b3'], [5, -2, '4'], [5, 0, '5'], [5, 1, 'b6']],
    'Box 4 (A Shape)': [[0, 0, '5'], [0, 1, 'b6'], [1, -1, '7'], [1, 0, 'R'], [1, 2, '2'], [1, 3, 'b3'], [2, 0, '4'], [2, 2, '5'], [2, 3, 'b6'], [3, 1, '7'], [3, 2, 'R'], [4, 0, '2'], [4, 1, 'b3'], [4, 3, '4'], [5, 0, '5'], [5, 1, 'b6']],
    'Box 5 (G Shape)': [[0, -1, '7'], [0, 0, 'R'], [1, -3, '2'], [1, -2, 'b3'], [1, 0, '4'], [2, -3, '5'], [2, -2, 'b6'], [3, -4, '7'], [3, -3, 'R'], [3, -1, '2'], [3, 0, 'b3'], [4, -2, '4'], [4, 0, '5'], [4, 1, 'b6'], [5, -1, '7'], [5, 0, 'R']]
  },
  'dim_wh': {
    'Box 1 (E Shape)': [[0, -1, '7'], [0, 0, 'R'], [0, 2, '2'], [0, 3, 'b3'], [1, 0, '4'], [1, 1, 'b5'], [1, 3, 'b6'], [2, -1, '6'], [2, 1, '7'], [2, 2, 'R'], [3, -1, '2'], [3, 0, 'b3'], [3, 2, '4'], [4, -1, 'b5'], [4, 1, 'b6'], [4, 2, '6'], [5, -1, '7'], [5, 0, 'R'], [5, 2, '2'], [5, 3, 'b3']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 1, 'b3'], [0, 3, '4'], [0, 4, 'b5'], [1, 1, 'b6'], [1, 2, '6'], [1, 4, '7'], [2, 0, 'R'], [2, 2, '2'], [2, 3, 'b3'], [3, 0, '4'], [3, 1, 'b5'], [3, 3, 'b6'], [4, 0, '6'], [4, 2, '7'], [4, 3, 'R'], [5, 0, '2'], [5, 1, 'b3'], [5, 3, '4'], [5, 4, 'b5']],
    'Box 3 (C Shape)': [[0, -2, '4'], [0, -1, 'b5'], [0, 1, 'b6'], [0, 2, '6'], [1, -1, '7'], [1, 0, 'R'], [1, 2, '2'], [2, -2, 'b3'], [2, 0, '4'], [2, 1, 'b5'], [3, -2, 'b6'], [3, -1, '6'], [3, 1, '7'], [4, -2, 'R'], [4, 0, '2'], [4, 1, 'b3'], [5, -2, '4'], [5, -1, 'b5'], [5, 1, 'b6'], [5, 2, '6']],
    'Box 4 (A Shape)': [[0, 1, 'b6'], [0, 2, '6'], [0, 4, '7'], [1, 0, 'R'], [1, 2, '2'], [1, 3, 'b3'], [2, 0, '4'], [2, 1, 'b5'], [2, 3, 'b6'], [3, -1, '6'], [3, 1, '7'], [3, 2, 'R'], [4, 0, '2'], [4, 1, 'b3'], [4, 3, '4'], [5, -1, 'b5'], [5, 1, 'b6'], [5, 2, '6']],
    'Box 5 (G Shape)': [[0, -1, '7'], [0, 0, 'R'], [0, 2, '2'], [1, -2, 'b3'], [1, 0, '4'], [1, 1, 'b5'], [2, -2, 'b6'], [2, -1, '6'], [2, 1, '7'], [3, -3, 'R'], [3, -1, '2'], [3, 0, 'b3'], [4, -2, '4'], [4, -1, 'b5'], [4, 1, 'b6'], [5, -3, '6'], [5, -1, '7'], [5, 0, 'R']]
  },
  // Whole tone has no perfect 5th, so it is spelled #4/#5 (matching SCALES['whole_tone'].f).
  // These formulas MUST match the scale definition exactly — deriveModeTemplates looks each
  // one up in the scale def and silently drops any it can't find. (They were 'b5'/'b6'
  // here, which aren't in the def, so the #4 and #5 were being dropped from every box.)
  'whole_tone': {
    'Box 1 (E Shape)': [[0, 0, 'R'], [0, 2, '2'], [1, -1, '3'], [1, 1, '#4'], [1, 3, '#5'], [2, 0, 'b7'], [2, 2, 'R'], [3, -1, '2'], [3, 1, '3'], [3, 3, '#4'], [4, -1, '#4'], [4, 1, '#5'], [4, 3, 'b7'], [5, 0, 'R'], [5, 2, '2']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 2, '3'], [0, 4, '#4'], [1, 1, '#5'], [1, 3, 'b7'], [2, 0, 'R'], [2, 2, '2'], [2, 4, '3'], [3, 1, '#4'], [3, 3, '#5'], [4, 1, 'b7'], [4, 3, 'R'], [5, 0, '2'], [5, 2, '3'], [5, 4, '#4']],
    'Box 3 (C Shape)': [[0, -3, '3'], [0, -1, '#4'], [0, 1, '#5'], [1, -2, 'b7'], [1, 0, 'R'], [2, -3, '2'], [2, -1, '3'], [2, 1, '#4'], [3, -2, '#5'], [3, 0, 'b7'], [4, -2, 'R'], [4, 0, '2'], [5, -3, '3'], [5, -1, '#4'], [5, 1, '#5']],
    'Box 4 (A Shape)': [[0, -1, '#4'], [0, 1, '#5'], [0, 3, 'b7'], [1, 0, 'R'], [1, 2, '2'], [2, -1, '3'], [2, 1, '#4'], [2, 3, '#5'], [3, 0, 'b7'], [3, 2, 'R'], [4, 0, '2'], [4, 2, '3'], [5, -1, '#4'], [5, 1, '#5'], [5, 3, 'b7']],
    'Box 5 (G Shape)': [[0, -4, '#5'], [0, -2, 'b7'], [0, 0, 'R'], [1, -3, '2'], [1, -1, '3'], [2, -4, '#4'], [2, -2, '#5'], [2, 0, 'b7'], [3, -3, 'R'], [3, -1, '2'], [4, -3, '3'], [4, -1, '#4'], [5, -4, '#5'], [5, -2, 'b7'], [5, 0, 'R']]
  },
  'blues': {
    'Box 1 (E Shape)': [[0, 0, 'R'], [0, 3, 'b3'], [1, 0, '4'], [1, 1, 'b5'], [1, 2, '5'], [2, 0, 'b7'], [2, 2, 'R'], [3, 0, 'b3'], [3, 2, '4'], [3, 3, 'b5'], [4, 0, '5'], [4, 3, 'b7'], [5, 0, 'R'], [5, 3, 'b3']],
    'Box 2 (D Shape)': [[0, 1, 'b3'], [0, 3, '4'], [0, 4, 'b5'], [1, 0, '5'], [1, 3, 'b7'], [2, 0, 'R'], [2, 3, 'b3'], [3, 0, '4'], [3, 1, 'b5'], [3, 2, '5'], [4, 1, 'b7'], [4, 3, 'R'], [5, 1, 'b3'], [5, 3, '4'], [5, 4, 'b5']],
    'Box 3 (C Shape)': [[0, -2, '4'], [0, -1, 'b5'], [0, 0, '5'], [1, -2, 'b7'], [1, 0, 'R'], [2, -2, 'b3'], [2, 0, '4'], [2, 1, 'b5'], [3, -3, '5'], [3, 0, 'b7'], [4, -2, 'R'], [4, 1, 'b3'], [5, -2, '4'], [5, -1, 'b5'], [5, 0, '5']],
    'Box 4 (A Shape)': [[0, -1, 'b5'], [0, 0, '5'], [0, 3, 'b7'], [1, 0, 'R'], [1, 3, 'b3'], [2, 0, '4'], [2, 1, 'b5'], [2, 2, '5'], [3, 0, 'b7'], [3, 2, 'R'], [4, 1, 'b3'], [4, 3, '4'], [5, -1, 'b5'], [5, 0, '5'], [5, 3, 'b7']],
    'Box 5 (G Shape)': [[0, -2, 'b7'], [0, 0, 'R'], [1, -2, 'b3'], [1, 0, '4'], [1, 1, 'b5'], [2, -3, '5'], [2, 0, 'b7'], [3, -3, 'R'], [3, 0, 'b3'], [4, -2, '4'], [4, -1, 'b5'], [4, 0, '5'], [5, -2, 'b7'], [5, 0, 'R']]
  },
  'bebop_maj': {
    'Box 1 (E Shape)': [[0, -1, '7'], [0, 0, 'R'], [0, 2, '2'], [1, -1, '3'], [1, 0, '4'], [1, 2, '5'], [2, -2, 'b6'], [2, -1, '6'], [2, 1, '7'], [2, 2, 'R'], [3, -1, '2'], [3, 1, '3'], [3, 2, '4'], [4, 0, '5'], [4, 1, 'b6'], [4, 2, '6'], [5, -1, '7'], [5, 0, 'R'], [5, 2, '2']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 2, '3'], [0, 3, '4'], [1, 0, '5'], [1, 1, 'b6'], [1, 2, '6'], [2, -1, '7'], [2, 0, 'R'], [2, 2, '2'], [3, -1, '3'], [3, 0, '4'], [3, 2, '5'], [3, 3, 'b6'], [4, 0, '6'], [4, 2, '7'], [4, 3, 'R'], [5, 0, '2'], [5, 2, '3'], [5, 3, '4']],
    'Box 3 (C Shape)': [[0, -3, '3'], [0, -2, '4'], [0, 0, '5'], [0, 1, 'b6'], [1, -3, '6'], [1, -1, '7'], [1, 0, 'R'], [2, -3, '2'], [2, -1, '3'], [2, 0, '4'], [3, -3, '5'], [3, -2, 'b6'], [3, -1, '6'], [4, -3, '7'], [4, -2, 'R'], [4, 0, '2'], [5, -3, '3'], [5, -2, '4'], [5, 0, '5'], [5, 1, 'b6']],
    'Box 4 (A Shape)': [[0, 0, '5'], [0, 1, 'b6'], [0, 2, '6'], [1, -1, '7'], [1, 0, 'R'], [1, 2, '2'], [2, -1, '3'], [2, 0, '4'], [2, 2, '5'], [2, 3, 'b6'], [3, -1, '6'], [3, 1, '7'], [3, 2, 'R'], [4, 0, '2'], [4, 2, '3'], [4, 3, '4'], [5, 0, '5'], [5, 1, 'b6'], [5, 2, '6']],
    'Box 5 (G Shape)': [[0, -4, 'b6'], [0, -3, '6'], [0, -1, '7'], [0, 0, 'R'], [1, -3, '2'], [1, -1, '3'], [1, 0, '4'], [2, -3, '5'], [2, -2, 'b6'], [2, -1, '6'], [3, -4, '7'], [3, -3, 'R'], [3, -1, '2'], [4, -3, '3'], [4, -2, '4'], [4, 0, '5'], [5, -4, 'b6'], [5, -3, '6'], [5, -1, '7'], [5, 0, 'R']]
  },
  'bebop_dom': {
    'Box 1 (E Shape)': [[0, -1, '7'], [0, 0, 'R'], [0, 2, '2'], [1, -1, '3'], [1, 0, '4'], [1, 2, '5'], [2, -1, '6'], [2, 0, 'b7'], [2, 1, '7'], [2, 2, 'R'], [3, -1, '2'], [3, 1, '3'], [3, 2, '4'], [4, 0, '5'], [4, 2, '6'], [4, 3, 'b7'], [5, -1, '7'], [5, 0, 'R'], [5, 2, '2']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 2, '3'], [0, 3, '4'], [1, 0, '5'], [1, 2, '6'], [1, 3, 'b7'], [2, -1, '7'], [2, 0, 'R'], [2, 2, '2'], [3, -1, '3'], [3, 0, '4'], [3, 2, '5'], [4, 0, '6'], [4, 1, 'b7'], [4, 2, '7'], [4, 3, 'R'], [5, 0, '2'], [5, 2, '3'], [5, 3, '4']],
    'Box 3 (C Shape)': [[0, -3, '3'], [0, -2, '4'], [0, 0, '5'], [1, -3, '6'], [1, -2, 'b7'], [1, -1, '7'], [1, 0, 'R'], [2, -3, '2'], [2, -1, '3'], [2, 0, '4'], [3, -3, '5'], [3, -1, '6'], [3, 0, 'b7'], [4, -3, '7'], [4, -2, 'R'], [4, 0, '2'], [5, -3, '3'], [5, -2, '4'], [5, 0, '5']],
    'Box 4 (A Shape)': [[0, 0, '5'], [0, 2, '6'], [0, 3, 'b7'], [1, -1, '7'], [1, 0, 'R'], [1, 2, '2'], [2, -1, '3'], [2, 0, '4'], [2, 2, '5'], [3, -1, '6'], [3, 0, 'b7'], [3, 1, '7'], [3, 2, 'R'], [4, 0, '2'], [4, 2, '3'], [4, 3, '4'], [5, 0, '5'], [5, 2, '6'], [5, 3, 'b7']],
    'Box 5 (G Shape)': [[0, -3, '6'], [0, -2, 'b7'], [0, -1, '7'], [0, 0, 'R'], [1, -3, '2'], [1, -1, '3'], [1, 0, '4'], [2, -3, '5'], [2, -1, '6'], [2, 0, 'b7'], [3, -4, '7'], [3, -3, 'R'], [3, -1, '2'], [4, -3, '3'], [4, -2, '4'], [4, 0, '5'], [5, -3, '6'], [5, -2, 'b7'], [5, -1, '7'], [5, 0, 'R']]
  }
};

// ─── 2. THE CAGED ARCHITECTURE ──────────────────────────────────────
const BOX_DEFS = [
  { name: 'Box 1 (E Shape)', rootString: 0, globalOffset: 0,  scanSpan: [-2, 5] },
  { name: 'Box 2 (D Shape)', rootString: 2, globalOffset: 2,  scanSpan: [-3, 5] },
  { name: 'Box 3 (C Shape)', rootString: 1, globalOffset: 7,  scanSpan: [-4, 3] },
  { name: 'Box 4 (A Shape)', rootString: 1, globalOffset: 7,  scanSpan: [-3, 4] },
  { name: 'Box 5 (G Shape)', rootString: 0, globalOffset: 12, scanSpan: [-4, 3] }
];

// ─── 3. MODE MAPPINGS ───────────────────────────────────────────────
// Maps every app scale to its Parent Scale and its root offset in semitones
const MODE_DERIVATIONS: Record<string, { parent: string, offset: number }> = {
  'ionian':       { parent: 'ionian', offset: 0 },
  'dorian':       { parent: 'ionian', offset: 2 },
  'phrygian':     { parent: 'ionian', offset: 4 },
  'lydian':       { parent: 'ionian', offset: 5 },
  'mixolydian':   { parent: 'ionian', offset: 7 },
  'aeolian':      { parent: 'ionian', offset: 9 },
  'locrian':      { parent: 'ionian', offset: 11 },
  
  'maj_pent':     { parent: 'maj_pent', offset: 0 },
  'min_pent':     { parent: 'maj_pent', offset: 9 }, // A is +9 from C
  
  'mel_min':      { parent: 'mel_min', offset: 0 },
  'lydian_aug':   { parent: 'mel_min', offset: 3 },
  'lydian_dom':   { parent: 'mel_min', offset: 5 },
  'locrian_nat2': { parent: 'mel_min', offset: 9 },
  'altered':      { parent: 'mel_min', offset: 11 },
  
  'harm_min':     { parent: 'harm_min', offset: 0 },
  'phryg_dom':    { parent: 'harm_min', offset: 7 },
  'ionian_aug':   { parent: 'harm_min', offset: 3 },  // 3rd mode of harmonic minor

  'aeolian_dom':  { parent: 'mel_min', offset: 7 },   // 5th mode of melodic minor (Mixolydian ♭6)

  'dim_wh':       { parent: 'dim_wh', offset: 0 },
  'dim_hw':       { parent: 'dim_wh', offset: 2 },

  'whole_tone':   { parent: 'whole_tone', offset: 0 },
  'bebop_maj':    { parent: 'bebop_maj', offset: 0 },
  'bebop_dom':    { parent: 'bebop_dom', offset: 0 },
  'blues':        { parent: 'blues', offset: 0 },
  'blues_maj':    { parent: 'blues', offset: 3 }       // major blues = minor blues up a ♭3
};

// ─── 4. THE DERIVATION ENGINE ───────────────────────────────────────
export const CAGED_SCALE_TEMPLATES: Record<string, Record<string, [number, number, string][]>> = {};

function deriveModeTemplates(modeId: string, parentId: string, offset: number) {
  const parentTemplate = PARENT_SCALE_TEMPLATES[parentId];
  const modeScale = SCALES[modeId];
  const parentScale = SCALES[parentId];
  const modeTemplates: Record<string, [number, number, string][]> = {};

  if (!parentTemplate || !modeScale || !parentScale) return modeTemplates;

  // Use the shortest path offset to keep shapes physically centered 
  // (e.g., shifting down 11 frets is the exact same physical shape as shifting up 1 fret)
  let shortestOffset = offset;
  if (shortestOffset > 6) shortestOffset -= 12;

  BOX_DEFS.forEach(box => {
    const parentNotes = parentTemplate[box.name] || [];
    const boxData: [number, number, string][] = [];

    parentNotes.forEach(([s, relFret, parentFormula]) => {
      // Shift the exact physical shape to align with the new mode root
      const newRelFret = relFret - shortestOffset;

      // Find the interval of the parent note
      const pIdx = parentScale.f.indexOf(parentFormula);
      if (pIdx !== -1) {
        const pInterval = parentScale.iv[pIdx];
        
        // Calculate the interval relative to the new mode root
        const modeInterval = (pInterval - offset + 12) % 12;

        const mIdx = modeScale.iv.indexOf(modeInterval);
        if (mIdx !== -1) {
          boxData.push([s, newRelFret, modeScale.f[mIdx]]);
        }
      }
    });

    modeTemplates[box.name] = boxData;
  });

  return modeTemplates;
}

// ─── 4b. GENERATIVE FALLBACK ────────────────────────────────────────
// Hand-authored parents + mode derivation only cover the common scales. Any other
// scale (Hungarian, Neapolitan, Byzantine, the 8-note bebops, the symmetric augmented…)
// has no parent to derive from, so it would render BLANK. This builds 5 CAGED-position
// boxes for ANY scale straight from its interval set, anchored to E (pitch class 4) —
// the same convention the hand templates use — so every scale is fully playable and
// every note carries its correct formula (→ correct colour). It NEVER overrides a
// hand/derived template; it only fills the gaps.
const GEN_BOX_NAMES = ['Box 1 (E Shape)', 'Box 2 (D Shape)', 'Box 3 (C Shape)', 'Box 4 (A Shape)', 'Box 5 (G Shape)'];
const GEN_BOX_STARTS = [0, 2, 4, 7, 9]; // low fret of each position window (E root); each spans 5 frets
const GEN_WINDOW = 4;

function generateTemplate(def: { iv: number[]; f: string[] } | undefined): Record<string, [number, number, string][]> {
  const out: Record<string, [number, number, string][]> = {};
  if (!def) return out;
  GEN_BOX_STARTS.forEach((lo, bi) => {
    const box: [number, number, string][] = [];
    for (let s = 0; s < 6; s++) {
      for (let f = lo; f <= lo + GEN_WINDOW; f++) {
        const interval = (TUNING[s] + f) % 12; // semitones above the E root on this string/fret
        const idx = def.iv.indexOf(interval);
        if (idx !== -1) box.push([s, f, def.f[idx]]);
      }
    }
    out[GEN_BOX_NAMES[bi]] = box;
  });
  return out;
}

// ─── 5. BOOTSTRAP ───────────────────────────────────────────────────
// Run derivation once on startup to populate the hand-anchored scale families…
Object.keys(MODE_DERIVATIONS).forEach(modeId => {
  const { parent, offset } = MODE_DERIVATIONS[modeId];
  CAGED_SCALE_TEMPLATES[modeId] = deriveModeTemplates(modeId, parent, offset);
});
// …then generatively fill every remaining scale so NONE render blank.
Object.keys(SCALES).forEach(scaleId => {
  const t = CAGED_SCALE_TEMPLATES[scaleId];
  const empty = !t || Object.keys(t).length === 0 || Object.values(t).every(box => box.length === 0);
  if (empty) CAGED_SCALE_TEMPLATES[scaleId] = generateTemplate(SCALES[scaleId]);
});

// ─── INTERVALS AS 2-NOTE "SCALES" ───────────────────────────────────
// Each interval is treated as a tiny scale (root + the interval note) so it flows through
// the exact same CAGED box pipeline as real scales — giving full-neck CAGED diagrams for
// the Intervals tab on guitar. Keys are `iv-1`..`iv-12`, matching the dictionary item keys.
const IV_DEF: Record<number, { f: string; r: string; name: string }> = {
  1: { f: 'b2', r: 'b2nd', name: 'Minor 2nd' }, 2: { f: '2', r: '2nd', name: 'Major 2nd' },
  3: { f: 'b3', r: 'b3rd', name: 'Minor 3rd' }, 4: { f: '3', r: '3rd', name: 'Major 3rd' },
  5: { f: '4', r: '4th', name: 'Perfect 4th' }, 6: { f: 'b5', r: 'b5th', name: 'Tritone' },
  7: { f: '5', r: '5th', name: 'Perfect 5th' }, 8: { f: 'b6', r: 'b6th', name: 'Minor 6th' },
  9: { f: '6', r: '6th', name: 'Major 6th' }, 10: { f: 'b7', r: 'b7th', name: 'Minor 7th' },
  11: { f: '7', r: '7th', name: 'Major 7th' }, 12: { f: 'R', r: 'root', name: 'Octave' },
};
export const INTERVAL_SCALES: Record<string, { name: string; iv: number[]; r: string[]; f: string[] }> = {};
for (let n = 1; n <= 12; n++) {
  const x = IV_DEF[n];
  INTERVAL_SCALES[`iv-${n}`] = n === 12
    ? { name: x.name, iv: [0], r: ['root'], f: ['R'] }                 // octave → root positions
    : { name: x.name, iv: [0, n], r: ['root', x.r], f: ['R', x.f] };
  CAGED_SCALE_TEMPLATES[`iv-${n}`] = generateTemplate(INTERVAL_SCALES[`iv-${n}`]);
}

export type ShapeDisplayMode = 'list' | 'voicing';

/**
 * Takes the raw CAGED mode templates (which are locked to E) 
 * and shifts them dynamically to the user's selected root note.
 */
export function buildCagedScaleVoicings(
  chordType: string,
  rootSemi: number,
  namingMode: 'sharp' | 'flat',
  displayMode: ShapeDisplayMode,
  selectedScaleId?: string | null
): ScaleVoicing[] {
  // 1. Determine which scales are allowed for this chord type
  const allowedScales = CHORD_SCALE_MAP[chordType] || [];
  if (allowedScales.length === 0) return [];

  // 2. Filter if the user has a specific scale selected
  const scalesToProcess = selectedScaleId && allowedScales.includes(selectedScaleId)
    ? [selectedScaleId]
    : allowedScales;

  const results: ScaleVoicing[] = [];

  scalesToProcess.forEach(scaleId => {
    const scaleDef = SCALES[scaleId];
    const templateBoxes = CAGED_SCALE_TEMPLATES[scaleId];
    if (!scaleDef || !templateBoxes) return;

    Object.keys(templateBoxes).forEach((boxName, index) => { // <-- Add 'index' here
      const notesData = templateBoxes[boxName];
      if (!notesData || notesData.length === 0) return;

      // Our templates were built with E as the root (Pitch Class 4).
      // We need to calculate how many frets to shift to hit the target rootSemi.
      let shift = (rootSemi - 4) % 12;
      if (shift < 0) shift += 12;

      // Find the natural minimum fret if we applied this shift
      const tempMin = Math.min(...notesData.map(n => n[1] + shift));
      
      // Adjust octaves to keep the shape playable on the physical neck 
      // (Keep the lowest fret between 0 and 11)
      if (tempMin < 0) shift += 12;
      else if (tempMin >= 12) shift -= 12;

      // Fetch the exact chord formulas for dynamic chord tone highlighting
      const activeChordFormulas = CH[chordType]?.f || ['R', '3', '5', 'b3', '7', 'b7'];

      // Apply the shift to all notes
      const mappedNotes = notesData.map(([strIdx, relFret, formula]) => {
        const roleIdx = scaleDef.f.indexOf(formula);
        const role = roleIdx !== -1 ? scaleDef.r[roleIdx] : formula;
        
        // Calculate the actual note name
        // Low E string is pitch class 4 (E). TUNING array is [0, 5, 10, 15, 19, 24]
        const pc = (4 + TUNING[strIdx] + (relFret + shift)) % 12;
        const noteName = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[pc];

        // Highlight if the scale note is literally in the chord, OR handle the diminished 7th enharmonic edge case
        const isChordTone = activeChordFormulas.includes(formula) || 
                           (formula === '6' && activeChordFormulas.includes('bb7'));

        return {
          stringIdx: strIdx,
          fret: relFret + shift,
          formula,
          role,
          noteName,     // Added to satisfy ScaleNote type
          isChordTone   // Added to satisfy ScaleNote type
        };
      }).filter(n => n.fret >= 0 && n.fret <= 22); // Prune anything that falls off the guitar

      if (mappedNotes.length === 0) return;

      const minFret = Math.min(...mappedNotes.map(n => n.fret));
      const maxFret = Math.max(...mappedNotes.map(n => n.fret));

      const rootLetter = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[rootSemi];

      results.push({
        scaleId,
        scaleName: `${rootLetter} ${scaleDef.name || scaleId}`,
        boxName,
        boxNumber: index + 1, // <-- ADD THIS LINE
        notes: mappedNotes,
        minFret,
        maxFret
      });
    });
  });

  return results;
}