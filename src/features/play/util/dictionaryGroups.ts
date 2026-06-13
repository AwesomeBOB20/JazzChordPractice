// ─── DICTIONARY GROUPS ──────────────────────────────────────────────────────
// The dictionary's collapsible item list is tab-dependent: chord-voicing tabs
// (and Arps) list chord QUALITIES grouped by CHORD_CATEGORIES; Scales list the
// scales (grouped by family); Intervals list the 12 intervals; Shapes list the
// movable CAGED shape templates. The root selector is the secondary axis for all.

import { CH, CHORD_CATEGORIES, SCALES, CHORD_SCALE_MAP, GUITAR_TUNING } from '@shared/theory/musicTheory';
import { voicingTabSupportsType, SHAPE_DISPLAY_NAMES, INTERVAL_SCALES, buildShapeTemplate } from '@shared/guitar';
import { DictionaryCategory } from '@features/play/store/dictionaryStore';
import { formulaCombos, formulaString } from '@features/play/util/dictionaryVoicings';

// Glyph formula string for a degree-token list (e.g. ['R','b3','5'] → "1 ♭3 5"), degree-sorted and
// deduped — the SAME look as the triads/shells/drops combo subs, so every tab's items read alike.
const toFormula = (toks: string[]): string =>
  formulaString(Array.from(new Set((toks || []).filter(Boolean).map(t => (t === 'R' || t === 'root') ? '1' : t))));

// A CAGED shape's formula = the distinct degree tokens across its boxes (root-independent, built at
// root 0). Lets the Shapes tab show "1 3 5", "1 3 5 ♭7 ♭9", "1 2 3 ♯4 5 6 7", etc. Some template
// notes can carry no role token, so skip falsy formulas (toFormula/formulaString also guard).
const shapeFormula = (shapeKey: string): string => {
  const toks = new Set<string>();
  buildShapeTemplate(shapeKey, 0, 'sharp').forEach(b => b.notes.forEach((n: any) => { if (n.formula) toks.add(n.formula); }));
  return toFormula(Array.from(toks));
};

export type TabKind = 'chordQuality' | 'formulaCombo' | 'scale' | 'interval' | 'shape';

const TAB_KIND: Record<DictionaryCategory, TabKind> = {
  block: 'chordQuality', open: 'chordQuality', barre: 'chordQuality',
  arps: 'chordQuality',          // an arpeggio is a chord note-by-note → chord-quality list
  // these voice a 3–4 note slice of a chord → list the distinct formula combos
  triads: 'formulaCombo', shells: 'formulaCombo', drop2: 'formulaCombo', drop3: 'formulaCombo', drop2and4: 'formulaCombo',
  scales: 'scale', intervals: 'interval', shapes: 'shape',
};
export const tabKind = (t: DictionaryCategory): TabKind => TAB_KIND[t];

export interface DictItem { key: string; label: string; sub?: string; foundIn?: string[]; }
export interface DictGroup { label: string; items: DictItem[]; }

export const ALL_CATEGORIES: { key: DictionaryCategory; label: string }[] = [
  { key: 'block', label: 'Block' }, { key: 'open', label: 'Open' }, { key: 'barre', label: 'Barre' },
  { key: 'triads', label: 'Triads' }, { key: 'shells', label: 'Shells' }, { key: 'drop2', label: 'Drop 2' },
  { key: 'drop3', label: 'Drop 3' }, { key: 'drop2and4', label: 'Drop 2 & 4' },
  { key: 'intervals', label: 'Intervals' }, { key: 'arps', label: 'Arps' }, { key: 'shapes', label: 'Shapes' },
  { key: 'scales', label: 'Scales' },
];

// Canonical chord-quality order, then any CH keys the categories don't list.
export const ORDERED_TYPES: string[] = (() => {
  const fromCats = CHORD_CATEGORIES.flatMap((c: { keys: string[] }) => c.keys);
  const leftover = Object.keys(CH).filter(k => !fromCats.includes(k));
  return [...fromCats, ...leftover];
})();

// ── "Found in" / "Used by" chord lists ──────────────────────────────────────
// Maps a set of chord-type keys to their display labels (CH[ct].l), in canonical order, deduped.
// Powers the chip row shown inside an expanded dictionary item (rootless/partial combos + scales).
const orderIdxOf = (ct: string) => { const i = ORDERED_TYPES.indexOf(ct); return i === -1 ? 999 : i; };
const foundInLabels = (chordTypes: string[]): string[] => {
  const seen = new Set<string>();
  return (chordTypes || [])
    .slice()
    .sort((a, b) => orderIdxOf(a) - orderIdxOf(b))
    .map(ct => CH[ct]?.l)
    .filter((l): l is string => !!l && !seen.has(l) && (seen.add(l), true));
};

// Inverse of CHORD_SCALE_MAP (chord → scales): scaleId → the chord types that pair with it.
const SCALE_TO_CHORDS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const ct of Object.keys(CHORD_SCALE_MAP)) {
    for (const sid of CHORD_SCALE_MAP[ct]) (m[sid] ??= []).push(ct);
  }
  return m;
})();

// Chords a CAGED shape works for (its "Solo with" list). Two kinds of shape:
//  • a scale shape (lydian/phrygian/blues) → reuse the scale→chords table.
//  • a chord shape (maj/7b9/…) → the chords whose chord tones CONTAIN all the shape's notes, i.e.
//    you can arpeggiate/solo this shape safely over them. Built at root 0, so pitch-classes are
//    root-relative; root-independent like the rest of the dictionary grouping.
const GS_PC = GUITAR_TUNING.map(m => ((m % 12) + 12) % 12);
const shapeChords = (shapeKey: string): string[] => {
  const scaleId = shapeKey.replace('_shape', '');
  if (SCALES[scaleId]) return foundInLabels(SCALE_TO_CHORDS[scaleId] ?? []);
  const shapePcs = new Set<number>();
  buildShapeTemplate(shapeKey, 0, 'sharp').forEach((b: any) => b.notes.forEach((n: any) => shapePcs.add((GS_PC[n.stringIdx] + n.fret) % 12)));
  const matches = ORDERED_TYPES.filter(ct => {
    const ch = CH[ct];
    if (!ch) return false;
    const chordPcs = new Set(ch.iv.map((iv: number) => ((iv % 12) + 12) % 12));
    return Array.from(shapePcs).every(pc => chordPcs.has(pc));
  });
  return foundInLabels(matches);
};

// Curated, musically-canonical subset of voicingTabSupportsType (Triads=3-note,
// Shells=4+ with a 6th/7th, Drops=4+; else the shared predicate). Only ever REMOVES.
export function dictionaryMember(category: DictionaryCategory, instrument: string, type: string): boolean {
  const ch = CH[type];
  if (!ch) return false;
  switch (category) {
    case 'triads': return ch.iv.length === 3;
    case 'shells': return ch.iv.length >= 4 && ch.iv.some(iv => iv === 9 || iv === 10 || iv === 11);
    case 'drop2': case 'drop3': case 'drop2and4': return ch.iv.length >= 4;
    default: return voicingTabSupportsType(category, instrument, type);
  }
}

// ── Scales grouped by family (ids filtered to those present in SCALES) ──
const SCALE_FAMILIES: { label: string; ids: string[] }[] = [
  { label: 'Major Modes', ids: ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'] },
  { label: 'Melodic / Harmonic Minor', ids: ['mel_min', 'harm_min', 'lydian_dom', 'phryg_dom', 'locrian_nat2', 'lydian_aug', 'ionian_aug', 'aeolian_dom', 'altered'] },
  { label: 'Pentatonic & Blues', ids: ['maj_pent', 'min_pent', 'blues', 'blues_maj'] },
  { label: 'Symmetric', ids: ['whole_tone', 'dim_hw', 'dim_wh', 'augmented_sym'] },
  { label: 'Bebop', ids: ['bebop_maj', 'bebop_dom', 'bebop_min', 'bebop_mel_min'] },
  { label: 'World / Other', ids: ['hung_min', 'hung_maj', 'neapolitan_maj', 'neapolitan_min', 'hijaz', 'byzantine'] },
];

// ── Interval list (semitone distance 1..12 from the root) ──
export const INTERVAL_NAMES: Record<number, string> = {
  1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd', 5: 'Perfect 4th', 6: 'Tritone',
  7: 'Perfect 5th', 8: 'Minor 6th', 9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th', 12: 'Octave',
};

// ── Shape templates grouped ──
const SHAPE_FAMILIES: { label: string; keys: string[] }[] = [
  { label: 'Triad & Sus Shapes', keys: ['maj_shape', 'min_shape', 'aug_shape', 'dim_4_shape', 'sus4_shape', 'sus2_shape', 'maj_b5_shape', 'min_b5_shape', 'min_2_shape'] },
  { label: 'Altered Dominant Shapes', keys: ['7b9_shape', 'b5_shape', 'b5_b9_shape', 'b5_s9_shape', 's5_b9_shape', 's5_s9_shape'] },
  { label: 'Scale Shapes', keys: ['lydian_shape', 'phrygian_shape', 'blues_shape'] },
];

/** The grouped, collapsible item list for a tab + instrument. */
export function dictionaryGroups(tab: DictionaryCategory, instrument: 'piano' | 'guitar'): DictGroup[] {
  const kind = tabKind(tab);

  if (kind === 'scale') {
    const covered = new Set<string>();
    const scaleItem = (id: string): DictItem => ({ key: id, label: SCALES[id].name, sub: toFormula(SCALES[id].f), foundIn: foundInLabels(SCALE_TO_CHORDS[id] ?? []) });
    const groups = SCALE_FAMILIES.map(fam => {
      const items = fam.ids.filter(id => { covered.add(id); return !!SCALES[id]; }).map(scaleItem);
      return { label: fam.label, items };
    }).filter(g => g.items.length > 0);
    const leftover = Object.keys(SCALES).filter(id => !covered.has(id));
    if (leftover.length) groups.push({ label: 'Other', items: leftover.map(scaleItem) });
    return groups;
  }

  if (kind === 'interval') {
    return [{ label: 'Intervals', items: Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return { key: `iv-${n}`, label: INTERVAL_NAMES[n], sub: toFormula(INTERVAL_SCALES[`iv-${n}`]?.f ?? []) };
    }) }];
  }

  if (kind === 'shape') {
    // Guitar shows CAGED fingerings; piano shows each shape's note-set on the keyboard (see
    // getDictionaryVoicings). Same item list for both — only the per-item rendering differs.
    return SHAPE_FAMILIES.map(fam => ({
      label: fam.label,
      items: fam.keys.map(k => ({ key: k, label: (SHAPE_DISPLAY_NAMES[k] || k.replace('_shape', '')) + ' shape', sub: shapeFormula(k), foundIn: shapeChords(k) })),
    }));
  }

  if (kind === 'formulaCombo') {
    // Distinct formula combos this technique voices, grouped: named combos under
    // their chord-type category (6th/7th…), the rootless/partial slices last.
    const combos = formulaCombos(tab, instrument);
    const byCat = new Map<string, typeof combos>();
    combos.forEach(c => { const a = byCat.get(c.category); if (a) a.push(c); else byCat.set(c.category, [c]); });
    // Order combos by their chord's canonical position (same as the command sheets),
    // not by pc-set key — so Triads read Major, Minor, Aug, Dim, Sus4, Sus2, Maj♭5.
    const orderIdx = (ct: string) => { const i = ORDERED_TYPES.indexOf(ct); return i === -1 ? 999 : i; };
    const mk = (label: string, list: typeof combos): DictGroup => ({
      label,
      items: list.slice()
        .sort((a, b) => orderIdx(a.sourceChordType) - orderIdx(b.sourceChordType) || a.tokens.length - b.tokens.length || a.key.localeCompare(b.key))
        // Named combos already say what they are; only the rootless/partial ones get the
        // "Found in" chord list (that's where it's actually illuminating).
        .map(c => c.name
          ? { key: c.key, label: c.name, sub: formulaString(c.tokens) }
          : { key: c.key, label: formulaString(c.tokens), foundIn: foundInLabels(c.chordTypes) }),
    });
    const groups: DictGroup[] = [];
    CHORD_CATEGORIES.forEach((cat: { label: string }) => { const l = byCat.get(cat.label); if (l && l.length) groups.push(mk(cat.label, l)); });
    byCat.forEach((l, label) => { if (label !== 'Rootless & Partial' && !CHORD_CATEGORIES.some((c: { label: string }) => c.label === label) && l.length) groups.push(mk(label, l)); });
    // Split the leftover slices into their own families: no root → Rootless, has root but
    // incomplete → Partial.
    const rp = byCat.get('Rootless & Partial');
    if (rp && rp.length) {
      const rootless = rp.filter(c => c.rootless);
      const partial = rp.filter(c => !c.rootless);
      if (rootless.length) groups.push(mk('Rootless', rootless));
      if (partial.length) groups.push(mk('Partial', partial));
    }
    return groups;
  }

  // chordQuality — grouped by CHORD_CATEGORIES (same as the command sheets). Arps show the chord's
  // formula like the triads/shells/drops tabs; Block/Open/Barre keep their bare chord-name headers.
  const mkItem = (ct: string): DictItem =>
    tab === 'arps' && CH[ct].f ? { key: ct, label: CH[ct].l, sub: toFormula(CH[ct].f) } : { key: ct, label: CH[ct].l };
  const covered = new Set<string>();
  const groups = CHORD_CATEGORIES.map((cat: { label: string; keys: string[] }) => {
    cat.keys.forEach(k => covered.add(k));
    const items = cat.keys.filter(ct => dictionaryMember(tab, instrument, ct)).map(mkItem);
    return { label: cat.label, items };
  }).filter(g => g.items.length > 0);
  const leftover = ORDERED_TYPES.filter(ct => !covered.has(ct) && dictionaryMember(tab, instrument, ct));
  if (leftover.length) groups.push({ label: 'Other', items: leftover.map(mkItem) });
  return groups;
}
