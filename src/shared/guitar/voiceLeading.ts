import { CH, NOTE_FLAT, NOTE_SHARP } from '@shared/theory/musicTheory';
import { buildDropVoicings, buildShellVoicings, buildTriadVoicings, buildOpenVoicings, buildBarreVoicings } from '@shared/guitar/voicings';
import { ProgressionChord } from '@shared/types/models';

export function calculateOptimalVoiceLeading(progression: (ProgressionChord | null)[], useVoiceLeading: boolean = true, fretCap: number = 5, targetZone: number | null = null) {
  let lastFrets: any = null;
  let lastType: string | null = null;
  let lastMinFret: number = 0;
  
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

    if (!useVoiceLeading && targetZone === null) {
      if (drop2Voicings.length) { lastFrets = drop2Voicings[0].frets; lastType = 'drop2'; return drop2Voicings[0]; }
      if (drop3Voicings.length) { lastFrets = drop3Voicings[0].frets; lastType = 'drop3'; return drop3Voicings[0]; }
      if (shellVoicings.length) { lastFrets = shellVoicings[0].frets; lastType = 'shell'; return shellVoicings[0]; }
      if (openVoicings.length) { lastFrets = openVoicings[0].frets; lastType = 'open'; return openVoicings[0]; }
      if (barreVoicings.length) { lastFrets = barreVoicings[0].frets; lastType = 'barre'; return barreVoicings[0]; }
      if (triadVoicings.length) { lastFrets = triadVoicings[0].frets; lastType = 'triad'; return triadVoicings[0]; }
      lastFrets = allVoicings[0].frets;
      lastType = allVoicings[0].type;
      return allVoicings[0];
    }

    if (!lastFrets || (!useVoiceLeading && targetZone !== null)) {
      let best = allVoicings[0];
      let bestScore = Infinity;

      // Score every voicing to find the perfect starting anchor
      for (const v of allVoicings) {
        let score = 0;
        
        // 1. Type Penalty: Strict Hierarchy
        if (v.type === 'drop2') score += 0; // King
        else if (v.type === 'drop3') score += 4; // Second best
        else if (v.type === 'drop24') score += 12; // A level below
        else if (v.type === 'shell') score += 25; // Try to avoid shells
        else if (v.type === 'open') score += 40;
        else if (v.type === 'barre' || v.type === 'triad') score += 50;
        else score += 60;

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
      let best = allVoicings[0];

      // When a targetZone is set, pre-filter to zone-adjacent voicings so that zone
      // compliance is a hard constraint rather than a soft penalty competing against
      // voice leading. Voice leading then picks the smoothest option *within* the zone.
      // Fall back to the full set only if no voicings exist near the zone.
      const ZONE_WINDOW = 5; // frets each side of targetZone treated as "in zone"
      let candidates: typeof allVoicings;
      if (targetZone !== null) {
        const inZone = allVoicings.filter((v: any) => {
          const active = v.frets.filter((f: any) => f.fret !== null && f.fret > 0).map((f: any) => f.fret);
          if (!active.length) return false;
          const minF = Math.min(...active);
          return minF >= Math.max(0, targetZone - ZONE_WINDOW) && minF <= targetZone + ZONE_WINDOW;
        });
        candidates = inZone.length > 0 ? inZone : allVoicings;
      } else {
        candidates = allVoicings;
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

            // Greatly reduced rigid zone penalties. Smoothness > Position.
            if (targetZone !== null) {
              d += Math.abs(minF - targetZone) * 4; 
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
      
      const bActive = best.frets.filter((f: any) => f.fret !== null && f.fret > 0).map((f: any) => f.fret);
      if (bActive.length) lastMinFret = Math.min(...bActive);
      
      return best;
    }
  });
}