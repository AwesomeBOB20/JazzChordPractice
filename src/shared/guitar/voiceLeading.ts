import { CH, NOTE_FLAT, NOTE_SHARP } from '@shared/theory/musicTheory';
import { buildDropVoicings, buildShellVoicings, buildTriadVoicings, buildOpenVoicings, buildBarreVoicings } from '@shared/guitar/voicings';
import { ProgressionChord } from '@shared/types/models';

// Kept as a local union (not imported from the progression store) so this shared
// guitar module has no dependency on a feature store.
type ForcedVoicingType = 'auto' | 'triads' | 'drop2' | 'drop3' | 'shells';

// ── Idiomatic-jazz voicing character ──────────────────────────────────────────
// Score a voicing by how well it spells the chord the way a jazz comper would:
// guide tones (3rd + 7th) present, the chord's colour tones (9/11/13 + alterations)
// highlighted, and the dead-weight perfect 5th / doubled root kept out. Lower = more
// idiomatic, so it adds straight into the existing voice-leading distance score.
const GUIDE_ROLES = new Set(['3rd', 'b3rd', '7th', 'b7th', 'bb7']);
const COLOR_ROLES = new Set(['9th', 'b9th', '#9th', '11th', '#11th', '13th', 'b13th', 'b5th', '#5th', '6th']);

const activeRoles = (v: any): string[] => v.frets.filter((f: any) => f && f.fret !== null).map((f: any) => f.role);

// Canonical key for a voicing's string set = the sorted active string indices
// (0 = low E … 5 = high E), e.g. "2,3,4,5" for the 4-3-2-1 set.
const activeStringKey = (v: any): string =>
  v.frets.map((f: any, i: number) => (f && f.fret !== null) ? i : null).filter((i: any) => i !== null).join(',');

function jazzCharacter(v: any, def: { r: string[] }): number {
  const roles = activeRoles(v);
  const present = new Set(roles);
  let s = 0;
  // Guide tones the chord HAS but the voicing omits → ambiguous quality, un-jazzy.
  for (const r of def.r) if (GUIDE_ROLES.has(r) && !present.has(r)) s += 14;
  // Colour tones (extensions / alterations) the chord HAS: reward when shown,
  // penalise when omitted — this is the "highlight the higher extensions" bias.
  for (const r of def.r) if (COLOR_ROLES.has(r)) { if (present.has(r)) s -= 9; else s += 7; }
  // The natural 5th is filler in a jazz voicing; gently nudge it out.
  s += roles.filter((r: string) => r === '5th').length * 5;
  // Avoid doubling the root.
  const roots = roles.filter((r: string) => r === 'root').length;
  if (roots > 1) s += (roots - 1) * 6;
  return s;
}

const TYPE_RANK: Record<string, number> = { drop2: 0, drop3: 4, drop24: 12, shell: 25, open: 40, barre: 50, triad: 50 };
const typeRank = (t: string): number => TYPE_RANK[t] ?? 60;

// Root-position = the lowest-sounding note (lowest active string) is the root.
const ROOT_ROLES = new Set(['root', '1', 'R']);
function isRootBass(v: any): boolean {
  for (let i = 0; i < v.frets.length; i++) {
    const f = v.frets[i];
    if (f && f.fret !== null) return ROOT_ROLES.has(f.role);
  }
  return false;
}
const minActiveFret = (v: any): number => {
  const fs = v.frets.filter((f: any) => f && f.fret !== null && f.fret > 0).map((f: any) => f.fret as number);
  return fs.length ? Math.min(...fs) : 0;
};

export function calculateOptimalVoiceLeading(progression: (ProgressionChord | null)[], useVoiceLeading: boolean = true, fretCap: number = 5, targetZone: number | null = null, forcedType: ForcedVoicingType = 'auto', forcedStringSet: string | null = null) {
  let lastFrets: any = null;
  let lastType: string | null = null;

  return progression.map(chord => {
    if (!chord || chord.spacer) return null;
    const def = CH[chord.chordType];
    if (!def) return null;
    
    const mode = chord.namingMode || 'flat';
    const rootName = (mode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[chord.rootSemi];
    
    const open = buildOpenVoicings(chord.chordType, chord.rootSemi, rootName, '') || [];
    const barre = buildBarreVoicings(chord.chordType, chord.rootSemi, rootName, '') || [];
    const drops = buildDropVoicings(chord.chordType, def, chord.rootSemi, rootName, '', mode) || [];
    const shells = buildShellVoicings(chord.chordType, def, chord.rootSemi, rootName, '', mode) || [];
    const triads = buildTriadVoicings(def, chord.rootSemi, rootName, mode) || [];

    const openVoicings = open.flatMap((g: any) => g.voicings || []);
    const barreVoicings = barre.flatMap((g: any) => g.voicings || []);
    const drop2Voicings = drops.filter((g: any) => g.label.startsWith('Drop 2 ')).flatMap((g: any) => g.voicings || []);
    const drop3Voicings = drops.filter((g: any) => g.label.startsWith('Drop 3 ')).flatMap((g: any) => g.voicings || []);
    const shellVoicings = shells.flatMap((g: any) => g.voicings || []);
    const triadVoicings = triads.flatMap((g: any) => g.voicings || []);

    const allVoicings = [
      ...drop2Voicings,
      ...drop3Voicings,
      ...shellVoicings,
      ...openVoicings,
      ...barreVoicings,
      ...triadVoicings
    ];

    if (!allVoicings.length) return null;

    // Phase 5: a forced voicing type constrains the candidate pool to that family.
    // Falls back to the full set when this chord has no voicing of the chosen type,
    // so a progression never shows a blank cell just because (say) a plain triad
    // has no drop voicing. Everything downstream scores within `pool`, so the neck
    // zone and voice-leading still pick the smoothest option inside the chosen type.
    const forcedSubset =
      forcedType === 'triads' ? triadVoicings :
      forcedType === 'drop2'  ? drop2Voicings :
      forcedType === 'drop3'  ? drop3Voicings :
      forcedType === 'shells' ? shellVoicings : null;
    let pool = (forcedSubset && forcedSubset.length) ? forcedSubset : allVoicings;

    // Strict string-set lock: keep every chord on the chosen set of strings so the
    // whole progression sits in one place on the neck. Only relax (fall back to the
    // wider pool) when this particular chord can't be voiced on that set at all.
    if (forcedStringSet) {
      const onSet = pool.filter((v: any) => activeStringKey(v) === forcedStringSet);
      if (onSet.length) pool = onSet;
    }

    if (!useVoiceLeading) {
      // Voice leading OFF → a plain, predictable root-position voicing (root in the
      // bass), to match the piano and Shapes views. Among the root-position options we
      // take the lowest playable one (or the one nearest the requested zone). Falls back
      // to the idiomatic pick only when the chord/type/set has no root-position voicing
      // at all (e.g. rootless shells), so no cell ever comes up blank.
      const rootPos = pool.filter((v: any) => isRootBass(v));
      const choose = rootPos.length ? rootPos : pool;
      let best = choose[0];
      let bestScore = Infinity;
      for (const v of choose) {
        const minF = minActiveFret(v);
        const anchor = targetZone !== null ? Math.abs(minF - targetZone) * 10 : minF;
        const score = anchor + typeRank(v.type) + jazzCharacter(v, def);
        if (score < bestScore) { bestScore = score; best = v; }
      }
      lastFrets = best.frets;
      lastType = best.type;
      return best;
    }

    if (!lastFrets) {
      // Pin the FIRST chord inside the zone window too — the same hard pre-filter the rest of
      // the progression uses. Otherwise type/jazz penalties could pull the opening chord out
      // of the zone while every later chord is hard-constrained to it (the first chord then
      // visibly sat in a different position from the rest).
      const ZONE_WINDOW = 5;
      let firstPool = pool;
      if (targetZone !== null) {
        const lo = Math.max(0, targetZone - ZONE_WINDOW);
        const hi = targetZone + ZONE_WINDOW;
        const inZone = pool.filter((v: any) => {
          const active = v.frets.filter((f: any) => f.fret !== null && f.fret > 0).map((f: any) => f.fret);
          if (!active.length) return false;
          const minF = Math.min(...active);
          return minF >= lo && minF <= hi;
        });
        if (inZone.length > 0) firstPool = inZone;
      }

      let best = firstPool[0];
      let bestScore = Infinity;

      // Score every voicing to find the perfect starting anchor
      for (const v of firstPool) {
        let score = 0;
        
        // 1. Type Penalty: Strict Hierarchy
        if (v.type === 'drop2') score += 0; // King
        else if (v.type === 'drop3') score += 4; // Second best
        else if (v.type === 'drop24') score += 12; // A level below
        else if (v.type === 'shell') score += 25; // Try to avoid shells
        else if (v.type === 'open') score += 40;
        else if (v.type === 'barre' || v.type === 'triad') score += 50;
        else score += 60;

        // 1b. Idiomatic-jazz character (guide tones + extensions, no filler 5th)
        score += jazzCharacter(v, def);

        const activeFrets = v.frets.filter((f: any) => f.fret !== null && f.fret > 0).map((f: any) => f.fret);
        const minF = activeFrets.length ? Math.min(...activeFrets) : 0;

        // 2. Anchor Penalty
        if (targetZone !== null) {
          score += Math.abs(minF - targetZone) * 15; // Strict penalty for leaving the requested zone
        } else if (minF > fretCap) {
          score += (minF - fretCap) * 10; // Heavy penalty for exceeding the zone
        } else {
          score += (fretCap - minF) * 2; // Mild penalty for being too low, pulls it UP to the zone
        }

        if (score < bestScore) {
          bestScore = score;
          best = v;
        }
      }
      
      lastFrets = best.frets;
      lastType = best.type;
      return best;
    } else {
      let minD = Infinity;
      let best = pool[0];

      // When a targetZone is set, pre-filter to zone-adjacent voicings so that zone
      // compliance is a hard constraint rather than a soft penalty competing against
      // voice leading. Voice leading then picks the smoothest option *within* the zone.
      // Fall back to the full set only if no voicings exist near the zone.
      // The zone is a symmetric ±ZONE_WINDOW band: every chord stays put near the chosen
      // fret rather than walking up or down the neck across the progression.
      const ZONE_WINDOW = 5;
      let candidates: typeof pool;
      if (targetZone !== null) {
        const lo = Math.max(0, targetZone - ZONE_WINDOW);
        const hi = targetZone + ZONE_WINDOW;
        const inZone = pool.filter((v: any) => {
          const active = v.frets.filter((f: any) => f.fret !== null && f.fret > 0).map((f: any) => f.fret);
          if (!active.length) return false;
          const minF = Math.min(...active);
          return minF >= lo && minF <= hi;
        });
        candidates = inZone.length > 0 ? inZone : pool;
      } else {
        candidates = pool;
      }

      // Calculate last position bounds for strict position locking
      const lastActive = lastFrets.filter((f: any) => f && f.fret !== null && f.fret > 0).map((f: any) => f.fret);
      const lastMin = lastActive.length ? Math.min(...lastActive) : 0;
      const lastCenter = lastActive.length ? lastActive.reduce((sum: number, val: number) => sum + val, 0) / lastActive.length : 0;
      
      // Pre-calculate the highest active string of the previous chord for Soprano weighting
      const lastHighestStr = [0, 1, 2, 3, 4, 5].find(s => lastFrets[s] && lastFrets[s].fret !== null && lastFrets[s].fret > 0);

      for (const v of candidates) {
        let d = 0;
        
        // 1. TYPE PENALTY: Strict Hierarchy
        if (v.type === 'drop2') {
          d += 0; // King of jazz chords
        } else if (v.type === 'drop3') {
          d += 4; // Top tier alternative
        } else if (v.type === 'drop24') {
          d += 12; // A level below drop 2 and drop 3
        } else if (v.type === 'shell') {
          d += 25; // Massive penalty to avoid shells replacing 7th chords
        } else if (v.type === 'open') {
          d += 40; 
        } else if (v.type === 'barre' || v.type === 'triad') {
          d += 50;
        } else {
          d += 60;
        }

        // 1b. Idiomatic-jazz character (guide tones + extensions, no filler 5th)
        d += jazzCharacter(v, def);

        // 2. TYPE CONTINUITY: Stop the random jumping!
        if (lastType !== null && v.type !== lastType) {
          d += 8; // If you started on a Drop 2, try REALLY hard to stay on Drop 2s
        }

        const TUNING = [40, 45, 50, 55, 59, 64]; // Standard tuning MIDI pitch offsets
        const vHighestStr = [0, 1, 2, 3, 4, 5].find(s => v.frets[s] && v.frets[s].fret !== null && v.frets[s].fret > 0);
        
        // 3. SOPRANO-WEIGHTED VOICE LEADING (Absolute Pitch Tracking)
        let lastMelodyPitch = null;
        if (lastHighestStr !== undefined && lastFrets[lastHighestStr] && lastFrets[lastHighestStr].fret !== null) {
            lastMelodyPitch = TUNING[lastHighestStr] + lastFrets[lastHighestStr].fret;
        }

        let vMelodyPitch = null;
        if (vHighestStr !== undefined && v.frets[vHighestStr] && v.frets[vHighestStr].fret !== null) {
            vMelodyPitch = TUNING[vHighestStr] + v.frets[vHighestStr].fret;
        }

        if (lastMelodyPitch !== null && vMelodyPitch !== null) {
            // INCREASED to 15: The top voice is the most critical part of jazz voice leading
            d += Math.abs(vMelodyPitch - lastMelodyPitch) * 15; 
        }

        // Standard physical finger travel penalty for remaining voices
        for (let i = 0; i < 6; i++) {
          const f1 = lastFrets[i]?.fret;
          const f2 = v.frets[i]?.fret;
          
          if (f1 !== null && f1 !== undefined && f2 !== null && f2 !== undefined) {
              // Exact common tone (same string, same fret) costs 0. Small moves cost little.
              d += Math.abs(f1 - f2); 
          } else if ((f1 !== null && f1 !== undefined) || (f2 !== null && f2 !== undefined)) {
              d += 5; // Slight bump to strongly discourage dropping/adding strings mid-phrase
          }
        }
        
        // 4. POSITION PENALTY: Lock to the Neck Zone (DE-WEIGHTED)
        const activeFrets = v.frets.filter((f: any) => f.fret !== null && f.fret > 0).map((f: any) => f.fret);
        if (activeFrets.length > 0) {
          const minF = Math.min(...activeFrets);
          const centerF = activeFrets.reduce((sum: number, val: number) => sum + val, 0) / activeFrets.length;
          
          if (useVoiceLeading) {
            const shiftDiff = Math.abs(minF - lastMin);
            if (shiftDiff > 2) {
              d += (shiftDiff * 3); // Let the hand move if the melody demands it.
            }

            d += Math.abs(centerF - lastCenter) * 1; // Let it drift smoothly.

            // Zone anchor: every chord is pinned toward the chosen fret zone so the whole
            // progression stays in one place on the neck. The weight (×6) is firm but sits
            // below the soprano-motion term (×15), so smoothness still chooses *among* the
            // in-zone voicings rather than the anchor overriding good voice leading. When
            // there's no zone (AUTO) we fall back to the soft fretCap pull.
            if (targetZone !== null) {
              d += Math.abs(minF - targetZone) * 6;
            } else if (minF > fretCap) {
              d += (minF - fretCap) * 4;
            } else if (minF < Math.max(1, fretCap - 4)) {
              d += (Math.max(1, fretCap - 4) - minF) * 1;
            }
          }
        }
        
        if (d < minD) { minD = d; best = v; }
      }
      lastFrets = best.frets;
      lastType = best.type;
      return best;
    }
  });
}