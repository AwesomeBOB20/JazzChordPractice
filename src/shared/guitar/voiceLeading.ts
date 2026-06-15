import { CH, NOTE_FLAT, NOTE_SHARP } from '@shared/theory/musicTheory';
import { buildDropVoicings, buildShellVoicings, buildTriadVoicings, buildOpenVoicings, buildBarreVoicings } from '@shared/guitar/voicings';
import { ProgressionChord } from '@shared/types/models';

// Kept as a local union (not imported from the progression store) so this shared
// guitar module has no dependency on a feature store.
type ForcedVoicingType = 'auto' | 'open' | 'barre' | 'triads' | 'drop2' | 'drop3' | 'shells';

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

// AUTO comps with Drop 2 on the two idiomatic upper string sets only — 4-3-2-1 ([2,3,4,5]) and
// 5-4-3-2 ([1,2,3,4]) — and leans on Drop 3 for the lower register, instead of letting Drop 2 sink
// onto the muddy 6-5-4-3 set. Keys are activeStringKey() output (sorted active string indices).
const AUTO_DROP2_SETS = new Set(['2,3,4,5', '1,2,3,4']);

// Shell string-set lock — GUIDE-TONE anchored. A lock pins the 3rd + 7th to one fixed pair of
// strings (the top two voices) and lets the root ride whichever bass string sits below them, so
// the line slides down the same two strings instead of hopping the neck:
//   b01 (E & A Bass) → guides on the D & G strings (idx 2 & 3); root on the 6th or 5th → 643 / 543
//   b12 (A & D Bass) → guides on the G & B strings (idx 3 & 4); root on the 5th or 4th → 532 / 432
// The two strings are the highest in the grip, so the guides are always the top two notes.
const SHELL_LOCK_GUIDE_STRINGS: Record<string, [number, number]> = {
  b01: [2, 3],
  b12: [3, 4],
};

// Guide-tone pitches (the 3rd and 7th) of a voicing, for shell voice leading. The 3rd may be a sus
// substitute (4th/2nd); the 7th may be a 6th. Measured as absolute MIDI pitch so the line can move to
// any string — what matters is how far the 3 & 7 travel, not which strings they sit on.
const TUNING_MIDI = [40, 45, 50, 55, 59, 64];
const SHELL_G3 = new Set(['3rd', 'b3rd', '4th', '2nd']);
const SHELL_G7 = new Set(['7th', 'b7th', 'bb7', '6th']);
const shellGuides = (frets: any): { g3: number | null; g7: number | null } => {
  let g3: number | null = null, g7: number | null = null;
  frets.forEach((f: any, i: number) => {
    if (!f || f.fret === null) return;
    const pitch = TUNING_MIDI[i] + f.fret;
    if (SHELL_G3.has(f.role)) g3 = pitch;
    else if (SHELL_G7.has(f.role)) g7 = pitch;
  });
  return { g3, g7 };
};

// Which STRING (0 = low E … 5 = high E) each guide tone sits on. Pitch tells us how far the
// 3 & 7 travel; this tells us whether they travel *on the same string*. Keeping both guides on
// their prior strings turns a chord change into a tiny same-string slide — the thing that makes
// a descending ii–V–I shell line feel effortless under the hand.
const shellGuideStrings = (frets: any): { g3: number | null; g7: number | null } => {
  let g3: number | null = null, g7: number | null = null;
  frets.forEach((f: any, i: number) => {
    if (!f || f.fret === null) return;
    if (SHELL_G3.has(f.role)) g3 = i;
    else if (SHELL_G7.has(f.role)) g7 = i;
  });
  return { g3, g7 };
};
// Cost for each guide tone that hops to a NEW string vs. the previous shell. Sits just under the
// pitch term (×12/semitone): a genuinely smoother cross-string move still wins, but among options
// that are equally smooth in pitch this firmly prefers the one that keeps the line on its strings.
const GUIDE_STRING_PENALTY = 10;

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

export function calculateOptimalVoiceLeading(progression: (ProgressionChord | null)[], useVoiceLeading: boolean = true, fretCap: number = 5, targetZone: number | null = null, forcedType: ForcedVoicingType = 'auto', forcedStringSet: string | null = null, voiceLeadDir: 'zone' | 'up' | 'down' | 'bounce' = 'zone') {
  let lastFrets: any = null;
  let lastType: string | null = null;
  let bounceDir: 'up' | 'down' = 'up';   // current travel direction for bounce mode
  let wrapResetNext = false;             // up/down: next chord snaps back to the far end (staircase)

  // Up/Down deliberately WALK the neck, so a fixed neck zone is contradictory with them —
  // the zone is ignored for those two modes (and its button is hidden in the UI). Zone and
  // Bounce both keep the zone: Zone stays anchored to it, Bounce ping-pongs across its window.
  const effectiveZone = (voiceLeadDir === 'up' || voiceLeadDir === 'down') ? null : targetZone;
  // Neck extremes used by the staircase wrap and the bounce turnarounds.
  const NECK_CEIL = 9, NECK_FLOOR = 2;

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
      // Open: prefer open chords, but fall back to BARRE (a sibling standard-guitar shape) before the
      // generic pool — so a chord with no open form shows a barre, not a random drop/shell voicing.
      forcedType === 'open'   ? (openVoicings.length ? openVoicings : barreVoicings) :
      forcedType === 'barre'  ? barreVoicings :
      forcedType === 'triads' ? triadVoicings :
      forcedType === 'drop2'  ? drop2Voicings :
      forcedType === 'drop3'  ? drop3Voicings :
      forcedType === 'shells' ? shellVoicings :
      // Auto = Drop 2 (only on the 4-3-2-1 / 5-4-3-2 comping sets) + Drop 3 for the lower register —
      // no triads, no shells. Falls back to the full set below when a chord has neither (e.g. a plain
      // triad can't be a drop voicing), so no cell renders blank.
      forcedType === 'auto'   ? [...drop2Voicings.filter((v: any) => AUTO_DROP2_SETS.has(activeStringKey(v))), ...drop3Voicings] : null;
    let pool = (forcedSubset && forcedSubset.length) ? forcedSubset : allVoicings;

    // Strict string-set lock: keep every chord on the chosen set of strings so the
    // whole progression sits in one place on the neck. Only relax (fall back to the
    // wider pool) when this particular chord can't be voiced on that set at all.
    if (forcedStringSet) {
      let onSet: typeof pool;
      if (forcedType === 'shells') {
        // Pin the two GUIDE TONES to the lock's string pair and require nothing voiced above them,
        // so the 3rd & 7th are the top two notes on those exact strings and the root just bounces
        // onto a lower bass string (643/543 for E&A, 532/432 for A&D). An unknown/legacy key
        // (e.g. a removed single 'b0') matches the pair table as undefined → no filter, acts as ANY.
        const pair = SHELL_LOCK_GUIDE_STRINGS[forcedStringSet];
        onSet = pair
          ? pool.filter((v: any) => {
              const gs = shellGuideStrings(v.frets);
              if (gs.g3 === null || gs.g7 === null) return false;
              const guides = [gs.g3, gs.g7];
              if (!guides.includes(pair[0]) || !guides.includes(pair[1])) return false;
              const maxStr = v.frets.reduce((m: number, f: any, i: number) => (f && f.fret !== null && i > m) ? i : m, -1);
              return maxStr <= pair[1]; // guides are the highest two strings — nothing voiced above them
            })
          : pool;
      } else {
        onSet = pool.filter((v: any) => activeStringKey(v) === forcedStringSet);
      }
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
      if (effectiveZone !== null) {
        const lo = Math.max(0, effectiveZone - ZONE_WINDOW);
        const hi = effectiveZone + ZONE_WINDOW;
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
        if (effectiveZone !== null) {
          score += Math.abs(minF - effectiveZone) * 15; // Strict penalty for leaving the requested zone
        } else if (voiceLeadDir === 'down') {
          // DOWN: start high on the neck so there's room to descend
          score += Math.max(0, NECK_CEIL - minF) * 6;
        } else if (voiceLeadDir === 'up' || voiceLeadDir === 'bounce') {
          // UP / BOUNCE: start low so there's room to climb
          score += Math.max(0, minF - (NECK_FLOOR + 2)) * 6;
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
      if (effectiveZone !== null) {
        const lo = Math.max(0, effectiveZone - ZONE_WINDOW);
        const hi = effectiveZone + ZONE_WINDOW;
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

      // Staircase wrap chord (Up/Down only): on this one chord we IGNORE smoothness so the
      // hand snaps cleanly to the far end of the neck, then the walk resumes. Without gating
      // smoothness off, the ×15 soprano term would pin it near the top and it'd never reset.
      const inWrap = wrapResetNext && (voiceLeadDir === 'up' || voiceLeadDir === 'down');

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

        if (!inWrap) {
          if (forcedType === 'shells') {
            // SHELL VOICE LEADING: a shell is a guide-tone instrument, so minimise how far the 3 & 7
            // travel and let the ROOT bounce freely. Match the two guides by the closer pairing (the
            // 7→3 line crosses roles) and measure by PITCH — the strings can change as long as the
            // line stays smooth. The third "free" note (root, or a color in a rootless shell) is not
            // scored for motion; the root just gets a light tether to the 6th/5th string below.
            const cur = shellGuides(v.frets), prev = shellGuides(lastFrets);
            if (cur.g3 !== null && cur.g7 !== null && prev.g3 !== null && prev.g7 !== null) {
              const direct = Math.abs(cur.g3 - prev.g3) + Math.abs(cur.g7 - prev.g7);
              const crossed = Math.abs(cur.g3 - prev.g7) + Math.abs(cur.g7 - prev.g3);
              d += Math.min(direct, crossed) * 12;

              // SAME-STRING CONTINUITY: keep the two guide tones on the strings they already occupy,
              // so a descending line slides down the same pair instead of hopping the neck. A prior
              // string set lets EITHER guide land there — so a 7→3 role swap still counts as "stayed",
              // matching the closer-pairing pitch logic above. Each guide that hops is taxed.
              const cs = shellGuideStrings(v.frets), ps = shellGuideStrings(lastFrets);
              if (cs.g3 !== null && cs.g7 !== null) {
                const prevStrs = new Set([ps.g3, ps.g7]);
                let jumped = 0;
                if (!prevStrs.has(cs.g3)) jumped++;
                if (!prevStrs.has(cs.g7)) jumped++;
                d += jumped * GUIDE_STRING_PENALTY;
              }
            } else if (lastMelodyPitch !== null && vMelodyPitch !== null) {
              d += Math.abs(vMelodyPitch - lastMelodyPitch) * 12; // fallback: top-voice motion
            }
            // Root free to bounce between the 6th/5th strings (no penalty); only nudge it back if it
            // wanders onto an inner string, so the bass stays sensible. Rootless shells (no root) are
            // unaffected.
            const rootStr = v.frets.findIndex((f: any) => f && f.fret !== null && f.role === 'root');
            if (rootStr > 1) d += 6;
          } else {
            // SOPRANO-WEIGHTED top voice + per-string finger travel (all other voicing types).
            if (lastMelodyPitch !== null && vMelodyPitch !== null) {
              // The top voice is the most critical part of jazz voice leading.
              d += Math.abs(vMelodyPitch - lastMelodyPitch) * 15;
            }
            for (let i = 0; i < 6; i++) {
              const f1 = lastFrets[i]?.fret;
              const f2 = v.frets[i]?.fret;
              if (f1 !== null && f1 !== undefined && f2 !== null && f2 !== undefined) {
                d += Math.abs(f1 - f2); // common tone (same string+fret) costs 0; small moves cost little
              } else if ((f1 !== null && f1 !== undefined) || (f2 !== null && f2 !== undefined)) {
                d += 5; // discourage dropping/adding strings mid-phrase
              }
            }
          }
        }
        
        // 4. POSITION PENALTY: Lock to the Neck Zone (DE-WEIGHTED)
        const activeFrets = v.frets.filter((f: any) => f.fret !== null && f.fret > 0).map((f: any) => f.fret);
        if (activeFrets.length > 0) {
          const minF = Math.min(...activeFrets);
          const centerF = activeFrets.reduce((sum: number, val: number) => sum + val, 0) / activeFrets.length;
          
          if (useVoiceLeading) {
            if (!inWrap) {
              const shiftDiff = Math.abs(minF - lastMin);
              if (shiftDiff > 2) {
                d += (shiftDiff * 3); // Let the hand move if the melody demands it.
              }

              d += Math.abs(centerF - lastCenter) * 1; // Let it drift smoothly.
            }

            // Zone anchor: pin toward the chosen fret zone so the progression stays put. The
            // weight (×6) is firm but below the soprano-motion term (×15), so smoothness still
            // chooses *among* the in-zone voicings. Skipped for Bounce, which deliberately
            // swings to the edges of the zone window (the ±window pre-filter keeps it in range).
            // With no zone (AUTO / Up / Down) we fall back to the soft fretCap pull.
            if (effectiveZone !== null) {
              if (voiceLeadDir !== 'bounce') d += Math.abs(minF - effectiveZone) * 6;
            } else if (minF > fretCap) {
              d += (minF - fretCap) * 4;
            } else if (minF < Math.max(1, fretCap - 4)) {
              d += (Math.max(1, fretCap - 4) - minF) * 1;
            }

            // ── Directional modes (UP / DOWN / BOUNCE) ──────────────────────
            // The walk is driven by a firm non-advance PENALTY (not a soft reward): any voicing
            // that doesn't continue in the current direction is taxed enough to overcome the
            // smoothness terms, so the hand actually moves — while smoothness still chooses the
            // best voicing *among* those that do advance. Bounce flips its direction at the ends
            // (a smooth triangle); Up/Down snap back via the smoothness-gated wrap chord above.
            if (voiceLeadDir === 'up' || voiceLeadDir === 'down' || voiceLeadDir === 'bounce') {
              if (inWrap) {
                // Wrap chord: snap to the far end (smoothness already gated off for this chord).
                if (voiceLeadDir === 'up') d += minF * 8;             // pull to the lowest voicing
                else if (voiceLeadDir === 'down') d += (12 - minF) * 8; // pull to the highest voicing
              } else {
                const curDir = voiceLeadDir === 'bounce' ? bounceDir : voiceLeadDir;
                if (curDir === 'up' && minF <= lastMin) d += 40;   // must climb
                else if (curDir === 'down' && minF >= lastMin) d += 40; // must descend
              }
            }
          }
        }

        if (d < minD) { minD = d; best = v; }
      }

      // Advance the neck-walk state from the chosen voicing for the next chord.
      const bestActive = best.frets.filter((f: any) => f && f.fret !== null && f.fret > 0).map((f: any) => f.fret as number);
      const newMinF = bestActive.length ? Math.min(...bestActive) : 0;
      if (voiceLeadDir === 'bounce') {
        // Turn around near the neck extremes — or near the zone-window edges when a zone is set.
        if (effectiveZone !== null) {
          if (bounceDir === 'up' && newMinF >= effectiveZone + 3) bounceDir = 'down';
          else if (bounceDir === 'down' && newMinF <= effectiveZone - 3) bounceDir = 'up';
        } else {
          if (bounceDir === 'up' && newMinF >= NECK_CEIL) bounceDir = 'down';
          else if (bounceDir === 'down' && newMinF <= NECK_FLOOR) bounceDir = 'up';
        }
      } else if (voiceLeadDir === 'up') {
        if (wrapResetNext) wrapResetNext = false;             // just reset — resume climbing
        else if (newMinF >= NECK_CEIL) wrapResetNext = true;  // hit the top → wrap on the next chord
      } else if (voiceLeadDir === 'down') {
        if (wrapResetNext) wrapResetNext = false;
        else if (newMinF <= NECK_FLOOR) wrapResetNext = true;
      }

      lastFrets = best.frets;
      lastType = best.type;
      return best;
    }
  });
}