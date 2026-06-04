// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for "which voicing categories work for which chords".
//
// A given voicing category (Block, Open, Barre, Triads, Shells, Drop 2/3/2&4,
// Intervals, Arps, Shapes, Scales) only makes sense for certain chord types on a
// given instrument — e.g. a 7♭5 has no Open shape, intervals need ≥2 valid
// interval subsets, scales need a chord→scale mapping, drops need enough notes.
// This used to live privately inside PlayScreen; it's lifted here so the Play
// screen AND the quiz settings (CommandSheet) and quiz generation all agree.
//
// Note on roots: eligibility is intentionally root-INDEPENDENT. Open/Barre check
// membership in the shape tables (keyed by chord type, not root), and every other
// category builds algorithmically for any root, so a category that exists for a
// type exists for it at some root.
// ─────────────────────────────────────────────────────────────────────────────
import { CH, CHORD_SCALE_MAP } from '@shared/theory/musicTheory';
import {
  OPEN_SHAPES,
  BARRE_SHAPES,
  getArpSubsets,
  getIntervalSubsets,
  buildHardcodedShapeVoicings,
} from '@shared/guitar/voicings';

/** True if the given voicing category is playable for this chord type + instrument. */
export function voicingTabSupportsType(tab: string, instrument: string, type: string): boolean {
  const isPiano = instrument === 'piano';
  const ch: any = (CH as any)[type];
  if (!ch) return false;
  switch (tab) {
    case 'block':
      return isPiano;
    case 'open':
      return !isPiano && type in OPEN_SHAPES;
    case 'barre':
      return !isPiano && type in BARRE_SHAPES;
    case 'triads':
      return true;
    case 'shells': {
      if (isPiano) {
        return ch.iv.length >= 4 && ch.iv.some((iv: number) => iv === 9 || iv === 10 || iv === 11);
      }
      return ch.iv.length >= 3; // triads get shells too (full triad on the 6 shell string sets)
    }
    case 'drop2':
    case 'drop3':
    case 'drop2and4': {
      if (isPiano) return ch.iv.length >= 4;
      return ch.iv.length >= 3; // triads included — doubled note on 4-string shapes
    }
    case 'scales':
      return ((CHORD_SCALE_MAP as any)[type] ?? []).length > 0;
    case 'arps':
      return getArpSubsets(ch.iv, ch.r, ch.f || []).length > 0;
    case 'intervals':
      return getIntervalSubsets(ch.iv, ch.r, ch.f || []).length > 0;
    case 'shapes':
      return buildHardcodedShapeVoicings(type, 0, 'sharp').length > 0;
    default:
      return true;
  }
}

/** True if AT LEAST ONE of the given chord types supports this voicing category. */
export function anyTypeSupportsVoicingTab(tab: string, instrument: string, types: string[]): boolean {
  return types.some(t => voicingTabSupportsType(tab, instrument, t));
}
