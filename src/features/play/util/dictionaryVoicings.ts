// ─── DICTIONARY VOICINGS ────────────────────────────────────────────────────
// Produces the mini-diagram inputs for ONE dictionary item, lazily (per expanded
// accordion). The item depends on the tab KIND:
//   chordQuality (block/open/barre/arps) → itemKey is a chord type.
//   formulaCombo (triads/shells/drop2/drop3/drop2and4) → itemKey is a formula-set
//       key; these tabs list the distinct formula COMBOS a technique can voice
//       (deduped across all chords), named when the combo is a recognized chord
//       (1-3-5-7 → "Maj 7") and shown as a rootless/partial formula otherwise.
//   scale    → itemKey is a scaleId.  interval → `iv-<n>`.  shape → shape key.

import { CH, NOTE_FLAT, NOTE_SHARP, getChordNotes, GUITAR_TUNING, SCALES, CHORD_SCALE_MAP, CHORD_CATEGORIES, ROLE_SHORT } from '@shared/theory/musicTheory';
import {
  buildOpenVoicings, buildBarreVoicings, buildTriadVoicings, buildShellVoicings,
  buildDropVoicings, buildScaleVoicings, buildArpVoicings, getArpSubsets,
  buildShapeTemplate, INTERVAL_SCALES, VoicingGroup,
} from '@shared/guitar';
import { buildPianoVoicings } from '@shared/piano';
import { DictionaryCategory } from '@features/play/store/dictionaryStore';
import { tabKind, dictionaryMember, ORDERED_TYPES } from '@features/play/util/dictionaryGroups';

const FLAT_ROOTS = [0, 1, 3, 5, 8, 10];
const rootNameOf = (r: number) => (FLAT_ROOTS.includes(r) ? NOTE_FLAT : NOTE_SHARP)[r];
const namingOf = (r: number): 'sharp' | 'flat' => (FLAT_ROOTS.includes(r) ? 'flat' : 'sharp');

const GS = GUITAR_TUNING; // absolute MIDI of open strings, low→high
const voicingMidi = (v: any): number[] =>
  (v?.frets || []).map((f: any, i: number) => (f && f.fret != null ? GS[i] + f.fret : null)).filter((m: any): m is number => m != null);
const shapeMidi = (s: any): number[] =>
  (s?.notes || []).filter((n: any) => n && n.fret != null).map((n: any) => GS[n.stringIdx] + n.fret);

export interface DictMiniItem {
  key: string;
  caption: string;
  playMidi: number[];
  voicing?: any;    // guitar chord voicing → MiniChordDiagram `voicing`
  arpShape?: any;   // guitar shape/scale/arp/interval box → MiniChordDiagram `arpShape`
  notes?: number[]; // piano → MiniPianoDiagram `notes`
  noteFormulas?: string[]; // piano: degree token per note (for scale-degree colour + labels)
  rootTag?: string; // "All roots" view badge: a root letter (locked) or "Any" (movable)
}

const ARP_FAMILIES: DictionaryCategory[] = ['scales', 'arps', 'intervals', 'shapes'];
export const isArpFamily = (tab: DictionaryCategory) => ARP_FAMILIES.includes(tab);

// Drop/shell/triad voicing names carry the technique ("Drop 2 (1st Inv) [A Str]"), but the
// dictionary's voicing tab already shows it — strip the redundant prefix and tidy the
// brackets so the caption reads just "1st Inv · A Str".
function cleanComboCaption(name: string | undefined): string {
  const s = (name || '').replace(/^(Drop\s*2\s*&\s*4|Drop\s*[23]|Shell|Triad)\s*/i, '').trim();
  const m = s.match(/^\(([^)]*)\)\s*\[([^\]]*)\]$/);
  if (m) return `${m[1].trim()} · ${m[2].trim()}`;
  return s.replace(/[()[\]]/g, '').trim();
}

// Plain-language caption for a technique voicing: the inversion becomes "<bass tone> in
// bass" (derived from the actual lowest note, so it's right for any chord), and the name's
// bracket — the voice-order formula (Drop 3 / Drop 2&4) or string set (Drop 2) — is kept
// alongside it. The redundant technique prefix is dropped (the tab already shows it).
function comboCaption(v: any): string {
  const frets = v?.frets || [];
  let bassRole = '';
  for (const f of frets) { if (f && f.fret != null) { bassRole = f.role; break; } }
  const plain = !bassRole ? ''
    : (bassRole === 'root' || bassRole === 'R' || bassRole === '1') ? 'Root'
    : String(bassRole).replace(/b/g, '♭').replace(/#/g, '♯');
  const m = String(v?.name || '').match(/\[([^\]]*)\]/);
  const second = m ? m[1].trim() : '';
  const parts: string[] = [];
  if (plain) parts.push(`${plain} in bass`);
  if (second) parts.push(second);
  return parts.length ? parts.join(' · ') : cleanComboCaption(v?.name);
}

function flattenGuitar(groups: VoicingGroup[]): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  (groups || []).forEach(g => g.voicings.forEach((v: any) => {
    if (!seen.has(v.fingerprint)) { seen.add(v.fingerprint); out.push(v); }
  }));
  return out;
}

function scaleToPianoNotes(svs: any[], rootSemi: number, octave: number): { name: string; notes: number[]; formulas: string[] }[] {
  const out: { name: string; notes: number[]; formulas: string[] }[] = [];
  const seen = new Set<string>();
  svs.forEach(sv => {
    if (seen.has(sv.scaleName)) return;
    seen.add(sv.scaleName);
    const pcs = new Set<number>();
    sv.notes.forEach((n: any) => pcs.add((GS[n.stringIdx] + n.fret) % 12));
    const startMidi = (octave + 1) * 12 + rootSemi;
    const notes: number[] = [];
    for (const pc of pcs) {
      let midi = Math.floor(startMidi / 12) * 12 + pc;
      if (midi < startMidi) midi += 12;
      if (midi >= 0 && midi <= 127) notes.push(midi);
    }
    notes.sort((a, b) => a - b);
    // Degree token per note from the scale definition → correct scale-degree colour.
    const def: any = (SCALES as any)[sv.scaleId];
    const formulas = notes.map(midi => {
      const interval = ((((midi % 12) - rootSemi) % 12) + 12) % 12;
      const idx = def ? def.iv.indexOf(interval) : -1;
      return idx !== -1 ? def.f[idx] : '';
    });
    out.push({ name: sv.scaleName, notes, formulas });
  });
  return out;
}

// ─── FORMULA COMBOS (triads / shells / drops) ───────────────────────────────
// formula token → semitone (used to derive the pitch-class set + sort for labels)
const FORMULA_IV: Record<string, number> = {
  '1': 0, 'b2': 1, '2': 2, '#2': 3, 'b3': 3, '3': 4, 'b4': 4, '4': 5, '#4': 6, 'b5': 6,
  '5': 7, '#5': 8, 'b6': 8, '6': 9, 'bb7': 9, 'b7': 10, '7': 11,
  'b9': 1, '9': 2, '#9': 3, 'b11': 4, '11': 5, '#11': 6, 'b13': 8, '13': 9, '#13': 10,
};
const normTok = (t: string) => (t === 'R' || t === 'root') ? '1' : t;

export interface Combo {
  key: string;            // sorted pitch-class set, e.g. "0,4,7,11"
  tokens: string[];       // representative formula tokens, e.g. ['1','3','5','7']
  name: string | null;    // chord-quality name when the pc-set is a known chord
  category: string;       // CHORD_CATEGORIES label, or 'Rootless & Partial'
  rootless: boolean;      // no root in the voiced tones
  sourceChordType: string;// a chord whose technique voicings contain this combo (used to render diagrams)
  chordTypes: string[];   // EVERY chord whose technique voicings produce this combo, in canonical order
                          // (the "Found in" list — most useful for rootless/partial combos)
}

const TECH_TABS = ['triads', 'shells', 'drop2', 'drop3', 'drop2and4'] as const;

// Raw technique voicings for a (tab, instrument, chord, root). Guitar → flattened
// Voicing[]; piano → items carrying { notes, formulas, name }. Shared by the combo
// derivation AND the per-combo diagram rendering.
function techniqueVoicings(
  tab: DictionaryCategory, instrument: 'piano' | 'guitar',
  rootSemi: number, chordType: string, octave: number, selectedScaleId: string | null,
): { guitar?: any[]; piano?: any[] } {
  const def: any = (CH as any)[chordType];
  if (!def) return {};
  const namingMode = namingOf(rootSemi);
  const rootName = rootNameOf(rootSemi);
  const chordName = `${rootName} ${def.l}`;

  if (instrument === 'guitar') {
    let groups: VoicingGroup[] = [];
    if (tab === 'triads') groups = buildTriadVoicings(def, rootSemi, rootName, namingMode);
    else if (tab === 'shells') groups = buildShellVoicings(chordType, def, rootSemi, rootName, chordName, namingMode);
    else {
      const all = buildDropVoicings(chordType, def, rootSemi, rootName, chordName, namingMode);
      groups = all.filter((g: any) => g.voicings[0]?.type === tab);
    }
    return { guitar: flattenGuitar(groups) };
  }
  const pV: any = buildPianoVoicings(rootSemi, chordType, octave, selectedScaleId, namingMode);
  const arr: any[] = (tab === 'triads' ? pV.triads : tab === 'shells' ? pV.shells
    : tab === 'drop2' ? pV.drop2 : tab === 'drop3' ? pV.drop3 : pV.drop2and4) || [];
  return { piano: arr };
}

// Formula tokens + pitch-class key for one voicing (guitar Voicing or piano item).
function comboKeyOf(v: any, instrument: 'piano' | 'guitar'): { tokens: string[]; key: string } {
  let toks: string[];
  if (instrument === 'guitar') {
    toks = (v.frets || [])
      .filter((f: any) => f && f.fret != null && f.role)
      .map((f: any) => normTok(ROLE_SHORT[f.role] || f.role));
  } else {
    toks = (v.formulas || []).map((f: string) => normTok(f));
  }
  const tokens = Array.from(new Set(toks)).filter(t => FORMULA_IV[t] !== undefined);
  const pcs = Array.from(new Set(tokens.map(t => FORMULA_IV[t]))).sort((a, b) => a - b);
  return { tokens, key: pcs.join(',') };
}

const categoryOf = (ct: string): string =>
  (CHORD_CATEGORIES.find((c: { keys: string[] }) => c.keys.includes(ct))?.label) || 'Other';

// Name a pc-set by matching it against the chord table (clean quality name + category).
function nameForPcs(pcKey: string): { name: string; category: string; sourceChord: string } | null {
  for (const ct of ORDERED_TYPES) {
    const ch: any = (CH as any)[ct];
    if (!ch) continue;
    const ivKey = Array.from(new Set((ch.iv as number[]).map((iv: number) => ((iv % 12) + 12) % 12))).sort((a, b) => a - b).join(',');
    if (ivKey === pcKey) return { name: ch.l, category: categoryOf(ct), sourceChord: ct };
  }
  return null;
}

const comboCache = new Map<string, Combo[]>();
/** The distinct formula combos a technique can voice, deduped across all chords. */
export function formulaCombos(tab: DictionaryCategory, instrument: 'piano' | 'guitar'): Combo[] {
  const cacheKey = `${tab}|${instrument}`;
  const cached = comboCache.get(cacheKey);
  if (cached) return cached;

  const combos = new Map<string, Combo>();
  // Collect EVERY chord that yields each combo key (the "Found in" list). Iterating ORDERED_TYPES
  // means each set fills in canonical chord order, so Array.from() is already correctly ordered.
  const memberChords = new Map<string, Set<string>>();
  for (const ct of ORDERED_TYPES) {
    if (!dictionaryMember(tab, instrument, ct)) continue;
    const tv = techniqueVoicings(tab, instrument, 0, ct, 4, null);
    const list = instrument === 'guitar' ? (tv.guitar || []) : (tv.piano || []);
    for (const v of list) {
      const { tokens, key } = comboKeyOf(v, instrument);
      if (!tokens.length) continue;
      (memberChords.get(key) ?? memberChords.set(key, new Set()).get(key)!).add(ct);
      if (combos.has(key)) continue;
      const named = nameForPcs(key);
      combos.set(key, {
        key,
        tokens,
        name: named?.name ?? null,
        category: named?.category ?? 'Rootless & Partial',
        rootless: !tokens.includes('1'),
        sourceChordType: named?.sourceChord ?? ct,
        chordTypes: [],
      });
    }
  }
  combos.forEach(c => { c.chordTypes = Array.from(memberChords.get(c.key) ?? []); });
  const out = Array.from(combos.values());
  comboCache.set(cacheKey, out);
  return out;
}

/** "1 3 5 ♭7 9 13" — tokens in scale-degree order with proper accidental glyphs. Sorting on the
 * DEGREE NUMBER first (not pitch class) keeps compound extensions where a musician reads them: a 9th
 * after the 7th, a 13th after the 11th — instead of folding 9/11/13 down next to 2/4/6. Ties on the
 * same degree (e.g. a bebop scale's ♭7 and 7) break by pitch so the lower one comes first. */
const degreeOf = (t: string): number => { const m = (t || '').match(/^[#b]*(\d+)$/); return m ? parseInt(m[1], 10) : 99; };
// Degree-ordered ASCII tokens (e.g. ['1','b3','5','b7','9','13']) — drops falsy entries; the shared
// order used by both the joined formula string and the coloured per-degree corner label.
export function sortFormulaTokens(tokens: string[]): string[] {
  return tokens.slice()
    .filter((t): t is string => !!t)
    .sort((a, b) => (degreeOf(a) - degreeOf(b)) || ((FORMULA_IV[a] ?? 99) - (FORMULA_IV[b] ?? 99)));
}
/** ASCII degree token → glyph display ('b3' → '♭3', '#11' → '♯11'). */
export const formulaGlyph = (t: string): string => (t || '').replace(/b/g, '♭').replace(/#/g, '♯');
export function formulaString(tokens: string[]): string {
  return sortFormulaTokens(tokens).map(formulaGlyph).join(' ');
}

// ─── CORNER LABELS (guitar diagram cells) ───────────────────────────────────
// The flat dictionary grid packs four corner labels into each guitar cell:
//   TL root · TR string-set OR shape/box name · BL formula (always) · BR bass.
// All derived from data the item already carries (voicing.frets / arpShape.notes).

export interface DictCorners { root?: string; topRight?: string; formula?: string; formulaTokens?: string[]; bass?: string; }

// Tabs where a compact string set ("6 5 4 3") is meaningful. Everything else
// (open/barre/arps/scales/shapes/intervals) shows its shape/box name instead.
const STRING_SET_TABS = new Set<DictionaryCategory>(['triads', 'shells', 'drop2', 'drop3', 'drop2and4']);

// role/formula token → plain bass label fragment ("Root", "3rd", "♭7th").
const bassPlain = (role: string): string =>
  !role ? '' : (role === 'root' || role === 'R' || role === '1') ? 'Root' : role.replace(/b/g, '♭').replace(/#/g, '♯');

// Played strings of a chord voicing as guitar string numbers (index 0 = string 6 = low E), e.g. "3-2-1".
const stringSetLabel = (frets: any[]): string =>
  (frets || []).map((f: any, i: number) => (f && f.fret != null ? 6 - i : null)).filter((n: any): n is number => n != null).join('-');

// "E Shape (Barre at 1)" → "E Shape"; otherwise the raw name.
const shortShape = (name: string): string => {
  const m = String(name || '').match(/([A-G])\s*Shape/);
  return m ? `${m[1]} Shape` : String(name || '');
};

/** The four corner labels for one guitar dictionary cell. */
export function dictCorners(it: DictMiniItem, tab: DictionaryCategory, rootSemi: number, allRoots: boolean): DictCorners {
  const root = allRoots ? (it.rootTag === 'Any' ? 'ANY' : it.rootTag) : rootNameOf(rootSemi);
  const out: DictCorners = { root };

  if (it.voicing) {
    const frets = it.voicing.frets || [];
    out.formulaTokens = sortFormulaTokens(comboKeyOf(it.voicing, 'guitar').tokens);
    out.formula = out.formulaTokens.map(formulaGlyph).join(' ');
    let bassRole = '';
    for (const f of frets) { if (f && f.fret != null) { bassRole = f.role; break; } }
    const bp = bassPlain(bassRole);
    if (bp) out.bass = `${bp} in bass`;
    out.topRight = STRING_SET_TABS.has(tab) ? stringSetLabel(frets) : shortShape(it.voicing.name);
    return out;
  }

  if (it.arpShape) {
    const notes = it.arpShape.notes || [];
    const toks = Array.from(new Set(notes.map((n: any) => normTok(n.formula)))).filter((t: any) => FORMULA_IV[t] !== undefined) as string[];
    out.formulaTokens = sortFormulaTokens(toks);
    out.formula = out.formulaTokens.map(formulaGlyph).join(' ');
    // Lowest-pitch note → its degree = the bass.
    let lo: any = null, loPitch = Infinity;
    for (const n of notes) { if (n && n.fret != null) { const p = GS[n.stringIdx] + n.fret; if (p < loPitch) { loPitch = p; lo = n; } } }
    const bp = lo ? bassPlain(lo.role) : '';
    if (bp) out.bass = `${bp} in bass`;
    out.topRight = String(it.arpShape.boxName || ''); // e.g. "Box 3 (C Shape)"
    return out;
  }

  return out;
}

/** Mini-diagram inputs for a single (tab, instrument, root, item). */
export function getDictionaryVoicings(
  tab: DictionaryCategory,
  instrument: 'piano' | 'guitar',
  rootSemi: number,
  itemKey: string,
  octave: number,
  selectedScaleId: string | null,
): DictMiniItem[] {
  const kind = tabKind(tab);
  const namingMode = namingOf(rootSemi);

  // ── SCALE ──
  if (kind === 'scale') {
    const boxes = buildScaleVoicings([itemKey], SCALES, rootSemi, [], namingMode);
    if (instrument === 'guitar') {
      return boxes.map((sv: any, i: number) => ({
        key: `scale-${itemKey}-${sv.boxNumber ?? i}`, caption: sv.boxName || '', playMidi: shapeMidi(sv), arpShape: sv,
      }));
    }
    return scaleToPianoNotes(boxes, rootSemi, octave).map((s, i) => ({ key: `scale-${itemKey}-${i}`, caption: '', playMidi: s.notes, notes: s.notes, noteFormulas: s.formulas }));
  }

  // ── INTERVAL ──
  if (kind === 'interval') {
    const n = parseInt(itemKey.replace('iv-', ''), 10);
    if (!n) return [];
    if (instrument === 'guitar') {
      // Treat the interval as a 2-note scale → full-neck CAGED boxes (same pipeline as scales).
      const boxes = buildScaleVoicings([`iv-${n}`], INTERVAL_SCALES, rootSemi, [], namingMode);
      return boxes.map((sv: any, i: number) => ({
        key: `iv-${n}-${sv.boxNumber ?? i}`, caption: sv.boxName || '', playMidi: shapeMidi(sv), arpShape: sv,
      }));
    }
    const rootMidi = (octave + 1) * 12 + rootSemi;
    const notes = [rootMidi, rootMidi + n];
    const fmla = (INTERVAL_SCALES[`iv-${n}`]?.f[1]) || 'R'; // octave has only 'R'
    return [{ key: `iv-${n}`, caption: '', playMidi: notes, notes, noteFormulas: ['R', fmla] }];
  }

  // ── SHAPE ──
  if (kind === 'shape') {
    const boxes = buildShapeTemplate(itemKey, rootSemi, namingMode);
    if (instrument === 'guitar') {
      return boxes.map((sv: any, i: number) => ({
        key: `shape-${itemKey}-${sv.boxNumber ?? i}`, caption: sv.boxName || '', playMidi: shapeMidi(sv), arpShape: sv,
      }));
    }
    // PIANO: a CAGED shape has no fingering on piano, so show its NOTE-SET on the keyboard — the
    // unique pitch classes the shape contains, stacked ascending from the root octave (one item).
    const startMidi = (octave + 1) * 12 + rootSemi;
    const pcToFormula = new Map<number, string>();
    boxes.forEach((b: any) => (b.notes || []).forEach((n: any) => {
      const pc = (((GS[n.stringIdx] + n.fret) % 12) + 12) % 12;
      if (!pcToFormula.has(pc)) pcToFormula.set(pc, n.formula || '');
    }));
    if (!pcToFormula.size) return [];
    const fByMidi = new Map<number, string>();
    pcToFormula.forEach((f, pc) => {
      let midi = Math.floor(startMidi / 12) * 12 + pc;
      if (midi < startMidi) midi += 12;
      if (midi >= 0 && midi <= 127) fByMidi.set(midi, f);
    });
    const notes = Array.from(fByMidi.keys()).sort((a, b) => a - b);
    return [{ key: `shape-${itemKey}-piano`, caption: '', playMidi: notes, notes, noteFormulas: notes.map(m => fByMidi.get(m) || '') }];
  }

  // ── FORMULA COMBO (triads / shells / drops): itemKey is a combo pc-set key ──
  if (kind === 'formulaCombo') {
    const combo = formulaCombos(tab, instrument).find(c => c.key === itemKey);
    if (!combo) return [];
    const tv = techniqueVoicings(tab, instrument, rootSemi, combo.sourceChordType, octave, selectedScaleId);
    if (instrument === 'guitar') {
      return (tv.guitar || [])
        .filter((v: any) => comboKeyOf(v, 'guitar').key === combo.key)
        .map((v: any, i: number) => ({ key: v.fingerprint || `${tab}-${i}`, caption: comboCaption(v) || v.bassNote || '', playMidi: voicingMidi(v), voicing: v }));
    }
    return (tv.piano || [])
      .filter((it: any) => comboKeyOf(it, 'piano').key === combo.key)
      .map((it: any, i: number) => ({ key: `${tab}-${i}`, caption: cleanComboCaption(it.name) || it.chordLabel || '', playMidi: it.notes || [], notes: it.notes || [], noteFormulas: it.formulas }));
  }

  // ── CHORD QUALITY (block / open / barre / arps) ──
  const chordType = itemKey;
  const def: any = (CH as any)[chordType];
  if (!def) return [];
  const rootName = rootNameOf(rootSemi);
  const chordName = `${rootName} ${def.l}`;

  if (instrument === 'guitar') {
    if (tab === 'open' || tab === 'barre') {
      const groups = tab === 'open'
        ? buildOpenVoicings(chordType, rootSemi, rootName, chordName)
        : buildBarreVoicings(chordType, rootSemi, rootName, chordName);
      return flattenGuitar(groups).map((v, i) => ({ key: v.fingerprint || `${tab}-${i}`, caption: v.name || v.bassNote || '', playMidi: voicingMidi(v), voicing: v }));
    }
    if (tab === 'arps') {
      const ids = (CHORD_SCALE_MAP as any)[chordType] ?? [];
      const allBoxes = buildScaleVoicings(ids, SCALES, rootSemi, def.iv, namingMode);
      const activeId = (selectedScaleId && ids.includes(selectedScaleId)) ? selectedScaleId : ids[0];
      const activeBoxes = allBoxes.filter((sv: any) => sv.scaleId === activeId);
      const subsets = getArpSubsets(def.iv, def.r, def.f || [], rootSemi, namingMode);
      const out: DictMiniItem[] = [];
      subsets.forEach((subset: any, si: number) => {
        const boxes = buildArpVoicings(activeBoxes, rootSemi, subset.ivs, subset.roles, subset.formulaLabels, chordName);
        boxes.forEach((b: any, bi: number) => out.push({ key: `arps-${si}-${bi}`, caption: subset.label || '', playMidi: shapeMidi(b), arpShape: b }));
      });
      return out;
    }
    return [];
  }

  // ── PIANO ──
  if (tab === 'block') {
    const rootNotes = getChordNotes(rootSemi, chordType, octave);
    const INV = ['Root Position', '1st Inversion', '2nd Inversion', '3rd Inversion', '4th Inversion', '5th Inversion', '6th Inversion'];
    const out: DictMiniItem[] = [];
    for (let inv = 0; inv < rootNotes.length; inv++) {
      const notes = [...rootNotes].sort((a, b) => a - b);
      for (let k = 0; k < inv; k++) {
        const lo = notes.shift();
        if (lo === undefined) break;
        const hi = notes.length ? notes[notes.length - 1] : lo;
        let raised = lo;
        while (raised <= hi) raised += 12;
        notes.push(raised);
      }
      out.push({ key: `block-${inv}`, caption: INV[inv] || `${inv}th Inversion`, playMidi: notes, notes });
    }
    return out;
  }
  if (tab === 'arps') {
    const subsets = getArpSubsets(def.iv, def.r, def.f || [], rootSemi, namingMode);
    const startMidi = (octave + 1) * 12 + rootSemi;
    return subsets.map((subset: any, i: number) => {
      const notes = (subset.ivs || []).map((iv: number) => startMidi + iv);
      return { key: `arps-${i}`, caption: subset.label || '', playMidi: notes, notes, noteFormulas: subset.formulaLabels };
    });
  }
  return [];
}

// ─── "ALL ROOTS" DEDUP (guitar only) ────────────────────────────────────────
// Collapse a Dictionary item across all 12 roots into its DISTINCT shapes:
//   • a CHORD GRIP with a played OPEN string can't transpose → kept per-root,
//     tagged with its root letter (surfaces every open C/A/G/E/D form together);
//   • everything else is movable → one representative drawn at the lowest
//     playable position, tagged "Any".
// CAGED boxes (scales/arps/shapes/intervals — `arpShape` items) are ALWAYS movable
// even when they touch an open string: the box transposes rigidly, so its relative
// pattern is identical at every root, and the open string is just where it happens
// to sit at the bottom of the neck — locking those would re-emit the same box per
// root (~5 redundant sets). Only genuine open chord grips stay position-locked.

// Per-string/per-note frets for a guitar DictMiniItem (chord voicing or box).
function shapeFrets(it: DictMiniItem): { stringIdx: number; fret: number }[] {
  if (it.voicing) {
    return (it.voicing.frets || [])
      .map((f: any, i: number) => (f && f.fret != null ? { stringIdx: i, fret: f.fret } : null))
      .filter((x: any): x is { stringIdx: number; fret: number } => x != null);
  }
  if (it.arpShape) {
    return (it.arpShape.notes || [])
      .filter((n: any) => n && n.fret != null)
      .map((n: any) => ({ stringIdx: n.stringIdx, fret: n.fret }));
  }
  return [];
}

// Transposition-invariant signature + whether the shape is movable + its top fret.
function shapeSignature(it: DictMiniItem): { sig: string; movable: boolean; maxFret: number } | null {
  const fs = shapeFrets(it);
  if (!fs.length) return null;
  const frets = fs.map(f => f.fret);
  // Open strings lock the POSITION only for chord grips (an open C voicing can't move).
  // CAGED boxes (arpShape) transpose rigidly even through the open position, so they're
  // always movable — see the block comment above.
  const hasOpen = frets.some(f => f === 0) && !!it.voicing;
  const maxFret = Math.max(...frets);
  const sorted = fs.slice().sort((a, b) => a.stringIdx - b.stringIdx || a.fret - b.fret);
  if (hasOpen) {
    // Position-locked: absolute pattern, so different roots never collide.
    const abs = it.voicing?.fingerprint || sorted.map(f => `${f.stringIdx}:${f.fret}`).join(',');
    return { sig: `L|${abs}`, movable: false, maxFret };
  }
  const minFret = Math.min(...frets);
  const rel = sorted.map(f => `${f.stringIdx}:${f.fret - minFret}`).join(',');
  return { sig: `M|${rel}`, movable: true, maxFret };
}

/** GUITAR-ONLY: distinct shapes of one Dictionary item across all 12 roots. */
export function getDictionaryVoicingsAllRoots(
  tab: DictionaryCategory,
  instrument: 'piano' | 'guitar',
  itemKey: string,
  octave: number,
  selectedScaleId: string | null,
): DictMiniItem[] {
  if (instrument !== 'guitar') return [];
  // Representative item per signature, plus the maxFret we picked it at.
  const chosen = new Map<string, { item: DictMiniItem; maxFret: number; order: number }>();
  let order = 0;
  for (let r = 0; r < 12; r++) {
    const items = getDictionaryVoicings(tab, 'guitar', r, itemKey, octave, selectedScaleId);
    for (const it of items) {
      const s = shapeSignature(it);
      if (!s) continue;
      // Only the Open tab keeps position-locked (open-string) grips per root — open chords genuinely
      // can't transpose. Every other tab drops them and shows ONLY the universal movable shapes; their
      // closed instances at other roots still surface as the "Any" representative, so nothing is lost
      // and the All view stays uncluttered (one shape, not one-per-note).
      if (!s.movable && tab !== 'open') continue;
      const prev = chosen.get(s.sig);
      if (!prev) {
        const rootTag = s.movable ? 'Any' : rootNameOf(r);
        chosen.set(s.sig, { item: { ...it, key: `all-${s.sig}`, rootTag }, maxFret: s.maxFret, order: order++ });
      } else if (s.movable && s.maxFret < prev.maxFret) {
        // Keep the lowest, most readable transposition of a movable shape.
        chosen.set(s.sig, { item: { ...it, key: prev.item.key, rootTag: 'Any' }, maxFret: s.maxFret, order: prev.order });
      }
    }
  }
  // Locked (open) shapes first, then movable; stable within each by discovery order.
  return Array.from(chosen.values())
    .sort((a, b) => {
      const al = a.item.rootTag !== 'Any', bl = b.item.rootTag !== 'Any';
      if (al !== bl) return al ? -1 : 1;
      return a.order - b.order;
    })
    .map(c => c.item);
}

// ─── MORPH VIEW (guitar) ─────────────────────────────────────────────────────
// "Pick a string set, see every quality on it." Fixes the root + voicing family + string set, then
// lays the qualities out grouped by INVERSION, each group in voice-leading (morph) order — so you
// watch a note slide a fret as the quality changes (maj7 → 7 → m7 → m7♭5 → dim7).

export interface MorphCell {
  key: string;
  voicing: any;            // guitar grip → MiniChordDiagram `voicing`
  chordName: string;       // "C m7" (root + def.s)
  chordType: string;
  formula: string;         // "1 ♭3 5 ♭7"
  formulaTokens: string[];
  bass: string;            // "♭3 in bass"
  playMidi: number[];
}
export interface MorphSection { inversionLabel: string; cells: MorphCell[]; }

const MORPH_INV_LABELS = ['Root Position', '1st Inversion', '2nd Inversion', '3rd Inversion'];
// Voicing families that support the morph view (clean, fixed string sets). Guitar only.
export const MORPH_CATEGORIES = new Set<DictionaryCategory>(['triads', 'drop2', 'drop3', 'drop2and4']);

// The active string-index set of a grip, as a STRING_SETS_BY_TYPE key (sorted indices, 0 = low E).
const activeStringKey = (frets: any[]): string =>
  (frets || []).map((f: any, i: number) => (f && f.fret != null ? i : null))
    .filter((x: any): x is number => x != null).sort((a, b) => a - b).join(',');

// Which chord tone sits in the bass → the inversion bucket (0 root · 1 third · 2 fifth · 3 seventh/sixth).
function bassBucket(role: string): number {
  const r = (role || '').toLowerCase();
  if (r.includes('root') || r === 'r' || r === '1') return 0;
  if (r.includes('3')) return 1;
  if (r.includes('5')) return 2;
  return 3;
}
// Voice-leading "darkness": how flat a chord's tones sit vs major. Lower = brighter. Sorting ascending
// yields the morph order — aug(-1) → maj7(0) → 7(1) → m7(2) → m7♭5(3) → dim7(4).
function morphDarkness(iv: number[]): number {
  let d = 0;
  for (const x of iv) {
    const pc = (((x % 12) + 12) % 12);
    if (pc === 3) d += 1;        // ♭3
    else if (pc === 6) d += 1;   // ♭5
    else if (pc === 8) d -= 1;   // ♯5 (brighter)
    else if (pc === 10) d += 1;  // ♭7
    else if (pc === 9) d += 2;   // ♭♭7 / 6
  }
  return d;
}

export function buildMorphSections(category: DictionaryCategory, rootSemi: number, stringSetKey: string): MorphSection[] {
  if (!MORPH_CATEGORIES.has(category)) return [];
  const namingMode = namingOf(rootSemi);
  const rootName = rootNameOf(rootSemi);
  const types = ORDERED_TYPES.filter(ct => dictionaryMember(category, 'guitar', ct));

  type Entry = { type: string; ch: any; voicing: any; bucket: number };
  const entries: Entry[] = [];
  for (const ct of types) {
    const def = (CH as any)[ct];
    if (!def) continue;
    const chordName = `${rootName} ${def.l}`;
    let groups: any[] = [];
    if (category === 'triads') groups = buildTriadVoicings(def, rootSemi, rootName, namingMode);
    else groups = buildDropVoicings(ct, def, rootSemi, rootName, chordName, namingMode).filter((g: any) => g.voicings[0]?.type === category);
    for (const g of groups) {
      for (const v of g.voicings) {
        if (activeStringKey(v.frets) !== stringSetKey) continue;
        entries.push({ type: ct, ch: def, voicing: v, bucket: bassBucket(v.bassNote) });
      }
    }
  }

  const sections: MorphSection[] = [];
  for (let inv = 0; inv < 4; inv++) {
    const byType = new Map<string, Entry>();
    for (const e of entries) if (e.bucket === inv && !byType.has(e.type)) byType.set(e.type, e);
    if (byType.size === 0) continue;
    const list = [...byType.values()].sort((a, b) =>
      morphDarkness(a.ch.iv) - morphDarkness(b.ch.iv) || types.indexOf(a.type) - types.indexOf(b.type));
    const cells: MorphCell[] = list.map((e, i) => {
      const toks = sortFormulaTokens(comboKeyOf(e.voicing, 'guitar').tokens);
      let bassRole = '';
      for (const f of e.voicing.frets) { if (f && f.fret != null) { bassRole = f.role; break; } }
      const bp = bassPlain(bassRole);
      return {
        key: `${e.type}-${inv}-${i}`,
        voicing: e.voicing,
        chordName: `${rootName} ${(CH as any)[e.type].s}`,
        chordType: e.type,
        formula: toks.map(formulaGlyph).join(' '),
        formulaTokens: toks,
        bass: bp ? `${bp} in bass` : '',
        playMidi: voicingMidi(e.voicing),
      };
    });
    sections.push({ inversionLabel: MORPH_INV_LABELS[inv], cells });
  }
  return sections;
}
