import { SCALES, CHORD_SCALE_MAP, NOTE_FLAT, NOTE_SHARP, CH } from '@shared/theory/musicTheory';
import { ScaleVoicing } from '@shared/guitar/voicings';

const TUNING = [0, 5, 10, 15, 19, 24]; // Standard tuning semitones from Low E

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
  'whole_tone': {
    'Box 1 (E Shape)': [[0, 0, 'R'], [0, 2, '2'], [1, -1, '3'], [1, 1, 'b5'], [1, 3, 'b6'], [2, 0, 'b7'], [2, 2, 'R'], [3, -1, '2'], [3, 1, '3'], [3, 3, 'b5'], [4, -1, 'b5'], [4, 1, 'b6'], [4, 3, 'b7'], [5, 0, 'R'], [5, 2, '2']],
    'Box 2 (D Shape)': [[0, 0, '2'], [0, 2, '3'], [0, 4, 'b5'], [1, 1, 'b6'], [1, 3, 'b7'], [2, 0, 'R'], [2, 2, '2'], [2, 4, '3'], [3, 1, 'b5'], [3, 3, 'b6'], [4, 1, 'b7'], [4, 3, 'R'], [5, 0, '2'], [5, 2, '3'], [5, 4, 'b5']],
    'Box 3 (C Shape)': [[0, -3, '3'], [0, -1, 'b5'], [0, 1, 'b6'], [1, -2, 'b7'], [1, 0, 'R'], [2, -3, '2'], [2, -1, '3'], [2, 1, 'b5'], [3, -2, 'b6'], [3, 0, 'b7'], [4, -2, 'R'], [4, 0, '2'], [5, -3, '3'], [5, -1, 'b5'], [5, 1, 'b6']],
    'Box 4 (A Shape)': [[0, -1, 'b5'], [0, 1, 'b6'], [0, 3, 'b7'], [1, 0, 'R'], [1, 2, '2'], [2, -1, '3'], [2, 1, 'b5'], [2, 3, 'b6'], [3, 0, 'b7'], [3, 2, 'R'], [4, 0, '2'], [4, 2, '3'], [5, -1, 'b5'], [5, 1, 'b6'], [5, 3, 'b7']],
    'Box 5 (G Shape)': [[0, -4, 'b6'], [0, -2, 'b7'], [0, 0, 'R'], [1, -3, '2'], [1, -1, '3'], [2, -4, 'b5'], [2, -2, 'b6'], [2, 0, 'b7'], [3, -3, 'R'], [3, -1, '2'], [4, -3, '3'], [4, -1, 'b5'], [5, -4, 'b6'], [5, -2, 'b7'], [5, 0, 'R']]
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
  
  'dim_wh':       { parent: 'dim_wh', offset: 0 },
  'dim_hw':       { parent: 'dim_wh', offset: 2 },
  
  'whole_tone':   { parent: 'whole_tone', offset: 0 },
  'bebop_maj':    { parent: 'bebop_maj', offset: 0 },
  'bebop_dom':    { parent: 'bebop_dom', offset: 0 },
  'blues':        { parent: 'blues', offset: 0 }
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

// ─── 5. BOOTSTRAP ───────────────────────────────────────────────────
// Run derivation once on startup to populate all 22 scales
Object.keys(MODE_DERIVATIONS).forEach(modeId => {
  const { parent, offset } = MODE_DERIVATIONS[modeId];
  CAGED_SCALE_TEMPLATES[modeId] = deriveModeTemplates(modeId, parent, offset);
});

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