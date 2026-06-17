import { CH, SCALES, CHORD_SCALE_MAP, NOTE_SHARP, NOTE_FLAT, spellInterval } from '@shared/theory/musicTheory';
import { findTriads, TRIAD_FULL_NAMES, deriveShellToneSets } from '@shared/guitar/voicings';
import { formatChordSymbol } from '@shared/theory/core/nomenclature';
import { UnifiedVoicing } from '@shared/types/models';

// Memoized like the guitar builders (see voicings.ts): PlayScreen's eligiblePairs
// sweep and per-tab memos call this synchronously on every tab switch. Cached
// results are SHARED references — callers copy (`[...pV.triads]`) before sorting.
function memoizePiano<F extends (...args: any[]) => any>(
  fn: F,
  keyFn: (...args: Parameters<F>) => string
): F {
  const cache = new Map<string, ReturnType<F>>();
  return ((...args: Parameters<F>): ReturnType<F> => {
    const key = keyFn(...args);
    if (cache.has(key)) return cache.get(key) as ReturnType<F>;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as F;
}

export const buildPianoVoicings = memoizePiano(
  buildPianoVoicingsUncached,
  (rootSemi, chordType, octave = 4, selectedScaleId = null, namingMode = 'sharp') =>
    `${rootSemi}|${chordType}|${octave}|${selectedScaleId ?? ''}|${namingMode}`
);

function buildPianoVoicingsUncached(rootSemi: number, chordType: string, octave: number = 4, selectedScaleId: string | null = null, namingMode: 'sharp' | 'flat' = 'sharp') {
  const ch = CH[chordType];
  const emptyRes = { triads: [], shells: [], drop2: [], drop3: [], drop2and4: [] };
  if (!ch) return emptyRes;

  // Base midi is typically C-1 = 0. Therefore Octave 4 C = 60.
  // We add 12 to shift the internal representation to standard MIDI pitch values.
  const rootMidi = ((octave + 1) * 12) + rootSemi; 
  const rootNoteName = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[rootSemi];
  const defaultChordLabel = formatChordSymbol(ch.l ? `${rootNoteName} ${ch.l}` : rootNoteName);

  // For extended chords (>4 tones), the rooted Pass-1 drops below voice only R-3-5-7 — the core 7th
  // (or 6th) chord. Label them as that core (e.g. C13#9 → "C7") so they form their OWN "CHORD" group,
  // separate from the rootless Pass-2 drops that carry the color tones. This gives piano the same
  // CHORD → VOICING drill-down the guitar has (pick the chord, then the voicing under it), and mirrors
  // how the piano's superimposed triads already group.
  let coreLabel = defaultChordLabel;
  if (ch.iv.length > 4) {
    const base4 = ch.iv.slice(0, 4).join(',');
    const coreType = Object.keys(CH).find((k) => CH[k].iv.length === 4 && CH[k].iv.join(',') === base4);
    if (coreType) coreLabel = formatChordSymbol(`${rootNoteName} ${CH[coreType].l}`);
  }

  const triads: UnifiedVoicing[] = [];
  const shells: UnifiedVoicing[] = [];
  const drop2: UnifiedVoicing[] = [];
  const drop3: UnifiedVoicing[] = [];
  const drop2and4: UnifiedVoicing[] = [];

  // Helper to standardise all outputs
  const createVoicing = (name: string, rawNotes: number[], customLabel?: string, overrideRoles?: string[], overrideFormulas?: string[]): UnifiedVoicing => {
    let notes = [...rawNotes];
    
    // OCTAVE LOGIC FIX: Prevent symmetrical triads or high inversions from running away up the keyboard.
    // This forces the bass note of EVERY generated voicing to stay anchored to the root's octave set.
    while (notes[0] >= rootMidi + 12) notes = notes.map(n => n - 12);
    while (notes[0] < rootMidi - 12)  notes = notes.map(n => n + 12);
    while (notes[notes.length-1] >= rootMidi + 24) notes = notes.map(n => n - 12);

    const roles: string[] = [];
    const formulas: string[] = [];
    notes.forEach((midi, i) => {
      if (overrideRoles && overrideFormulas) {
        roles.push(overrideRoles[i]);
        formulas.push(overrideFormulas[i]);
      } else {
        const pc = midi % 12;
        const idx = ch.iv.findIndex(iv => (rootSemi + iv) % 12 === pc);
        roles.push(idx !== -1 ? ch.r[idx] : '');
        formulas.push(idx !== -1 && ch.f ? ch.f[idx] : '');
      }
    });
    return { name, chordLabel: customLabel || defaultChordLabel, notes, roles, formulas };
  };

  const getFormulaStack = (notesArray: number[]) => {
    return notesArray.map(midi => {
      const pc = midi % 12;
      const idx = ch.iv.findIndex(iv => (rootSemi + iv) % 12 === pc);
      if (idx !== -1) {
        const f = ch.f ? ch.f[idx] : ch.r[idx];
        return f.replace(/root/gi, '1').replace(/(nd|rd|th|st)/g, '');
      }
      return '?';
    }).join('-');
  };

  // 1. Superimposed Triads
  const rhRootMidi = rootMidi;
  const baseChord = ch.iv.slice(0, 4); 
  const triadsList = findTriads(ch);
  const triadInvNames = ['Root Position', '1st Inversion', '2nd Inversion'];

  for (const triad of triadsList) {
    const triadBaseMidi = rhRootMidi + triad.rootInterval;
    let currentInv = triad.triadDef.iv.map(iv => triadBaseMidi + iv);

    for (let i = 1; i < currentInv.length; i++) {
      while (currentInv[i] <= currentInv[i - 1]) currentInv[i] += 12;
    }

    const formulaIdx = ch.r.indexOf(triad.rootRole);
    const formulaForTriadRoot = ch.f ? ch.f[formulaIdx] : triad.rootRole;
    const spelledRoot = spellInterval(rootSemi, formulaForTriadRoot, namingMode === 'flat');
    const typeName = TRIAD_FULL_NAMES[triad.triadType] ?? triad.triadType;
    const chordLabel = formatChordSymbol((triad.rootRole === 'root' && rootNoteName) ? `${rootNoteName} ${typeName}` : `${spelledRoot} ${typeName}`);

    let triadRoles = [...triad.parentRoles];

    for (let i = 0; i < 3; i++) {
      triads.push(createVoicing(triadInvNames[i], [...currentInv], chordLabel));
      if (i < 2) {
        currentInv = [...currentInv];
        currentInv[0] += 12;
        currentInv.sort((a, b) => a - b);
        const r0 = triadRoles.shift();
        if (r0) triadRoles.push(r0);
      }
    }
  }

  // Generate Drop 2, Drop 3, and Drop 2 & 4
  
  // Pass 1: Standard Rooted Voicings (R-3-5-7)
  if (baseChord.length >= 4) {
    let dInv = baseChord.map(iv => rhRootMidi + iv);
    dInv.sort((a,b) => a - b);
    for (let i = 0; i < 4; i++) {
      const d2 = [dInv[2] - 12, dInv[0], dInv[1], dInv[3]];
      const d2Sorted = d2.sort((a,b) => a - b);
      drop2.push(createVoicing(getFormulaStack(d2Sorted), d2Sorted, coreLabel));

      const d3 = [dInv[1] - 12, dInv[0], dInv[2], dInv[3]];
      const d3Sorted = d3.sort((a,b) => a - b);
      drop3.push(createVoicing(getFormulaStack(d3Sorted), d3Sorted, coreLabel));

      const d24 = [dInv[0] - 12, dInv[2] - 12, dInv[1], dInv[3]];
      const d24Sorted = d24.sort((a,b) => a - b);
      drop2and4.push(createVoicing(getFormulaStack(d24Sorted), d24Sorted, coreLabel));

      dInv = [...dInv];
      dInv[0] += 12;
      dInv.sort((a,b) => a - b);
    }
  }

  // Pass 2: Rootless Substitutions for Extended Chords (3-5-7-9, 3-7-9-11, 3-7-9-13)
  const dHas3 = ch.iv.find(iv => iv === 3 || iv === 4);
  const dHas5 = ch.iv.find(iv => iv === 6 || iv === 7 || iv === 8);
  const dHas7 = ch.iv.find(iv => iv === 10 || iv === 11 || iv === 9);
  const dHas9 = ch.iv.find(iv => iv === 13 || iv === 14 || iv === 15);
  const dHas11 = ch.iv.find(iv => iv === 17 || iv === 18);
  const dHas13 = ch.iv.find(iv => iv === 21 || iv === 20);
  const dHas6 = ch.iv.find(iv => iv === 9 && !chordType.includes('7'));

  let d2base: number[] | null = null;
  if (ch.iv.length > 4 && dHas3 !== undefined && dHas7 !== undefined && dHas9 !== undefined) {
    // Prioritize 13th over 5th for 13th chords, and 11th over 5th for 11th chords
    const fifthOrExtension = dHas13 !== undefined ? dHas13 : (dHas11 !== undefined ? dHas11 : (dHas5 !== undefined ? dHas5 : 7));
    d2base = [dHas3, fifthOrExtension, dHas7, dHas9 % 12].sort((a,b)=>a-b);
  } else if (chordType.includes('69') && dHas3 !== undefined && dHas5 !== undefined && dHas6 !== undefined && dHas9 !== undefined) {
    d2base = [dHas3, dHas5, dHas6, dHas9 % 12].sort((a,b)=>a-b);
  }

  // The Pass-2 rootless drops carry the chord's defining color tones (9 / #9 / b9 / 11 / 13), so they
  // ARE the full extended chord — label them as such (e.g. "C13#9"). Together with the Pass-1 core
  // ("C7") this yields exactly two CHORD groups for an extended chord: the plain 7th and the full color.
  if (d2base && d2base.length >= 4) {
    let dInv = d2base.map(iv => rhRootMidi + iv);
    dInv.sort((a, b) => a - b);
    for (let i = 0; i < 4; i++) {
      const d2 = [dInv[2] - 12, dInv[0], dInv[1], dInv[3]];
      const d2Sorted = d2.sort((a,b) => a - b);
      drop2.push(createVoicing(getFormulaStack(d2Sorted), d2Sorted, defaultChordLabel));

      const d3 = [dInv[1] - 12, dInv[0], dInv[2], dInv[3]];
      const d3Sorted = d3.sort((a,b) => a - b);
      drop3.push(createVoicing(getFormulaStack(d3Sorted), d3Sorted, defaultChordLabel));

      const d24 = [dInv[0] - 12, dInv[2] - 12, dInv[1], dInv[3]];
      const d24Sorted = d24.sort((a,b) => a - b);
      drop2and4.push(createVoicing(getFormulaStack(d24Sorted), d24Sorted, defaultChordLabel));

      dInv = [...dInv];
      dInv[0] += 12;
      dInv.sort((a,b) => a - b);
    }
  }

  // 2. Shell Voicings — converged onto the guitar's deriveShellToneSets (the single
  // source of truth for what a shell contains), so the sounding tones and the
  // Dictionary's shell combos match across instruments. A shell is the 3-note
  // skeleton root + guide tones (perfect 5th omitted), plus its rootless variants
  // (guide tones + one color tone). Every shell has ≥3 notes — 2-note guide-tone
  // dyads were removed per user request. Pure triads (no 7th/6th) produce no shells.
  const shellToneSets = deriveShellToneSets(ch);
  if (shellToneSets.length) {
    const orderedSets: string[][] = [
      shellToneSets[0],          // R-3-7  (rooted base)
      shellToneSets[1],          // R-7-3
      ...shellToneSets.slice(2), // rootless guide tones + one color tone
    ];

    const seenShell = new Set<string>();
    for (const roles of orderedSets) {
      // Stack the tone-set upward from the root's octave; roles[0] is the bass and
      // each upper voice takes the nearest octave above the previous (compact grip).
      let prev = -Infinity;
      const notes: number[] = [];
      const rolesArr: string[] = [];
      const formulasArr: string[] = [];
      let ok = true;
      for (const role of roles) {
        const idx = ch.r.indexOf(role);
        if (idx === -1) { ok = false; break; }
        let midi = rootMidi + (ch.iv[idx] % 12);
        while (midi <= prev) midi += 12;
        prev = midi;
        notes.push(midi);
        const rawF = (ch.f && ch.f[idx]) ? ch.f[idx] : role;
        const formula = rawF.replace(/root/gi, '1').replace(/(nd|rd|th|st)/g, '');
        rolesArr.push(role);
        formulasArr.push(formula === 'root' ? '1' : formula);
      }
      if (!ok) continue;
      const key = notes.join(',');
      if (seenShell.has(key)) continue;
      seenShell.add(key);
      shells.push(createVoicing(formulasArr.join('-'), notes, undefined, rolesArr, formulasArr));
    }
  }

  return { triads, shells, drop2, drop3, drop2and4 };
}

export function applyInversion(
  notes: number[],
  inversion: 'root' | '1st' | '2nd' | '3rd'
): number[] {
  if (inversion === 'root' || notes.length === 0) return [...notes];

  let inverted = [...notes].sort((a, b) => a - b);
  const shifts = inversion === '1st' ? 1 : inversion === '2nd' ? 2 : inversion === '3rd' ? 3 : 0;

  // Guard against trying to shift more notes than exist (e.g. 3rd inv on a triad)
  if (shifts >= inverted.length) return inverted;

  for (let i = 0; i < shifts; i++) {
    // Move the lowest pitch up by exactly one octave
    const lowest = inverted.shift();
    if (lowest !== undefined) {
      inverted.push(lowest + 12);
    }
  }

  return inverted.sort((a, b) => a - b);
}