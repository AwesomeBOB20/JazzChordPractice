import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CH, NOTE_SHARP, NOTE_FLAT, spellInterval, formatDegree, ROLE_SHORT, getGlobalLabel } from '@shared/theory/musicTheory';
import { formatChordSymbol } from '@shared/theory/core/nomenclature';
import { Theme, ROLE_COLORS_GLOBAL } from '@shared/ui/themes';
import { TYPE, FONT_WEIGHT } from '@shared/ui/typography';
import { useSettingsStore } from '@features/settings/store/settingsStore';

interface Props {
  rootSemi: number;
  chordType: string;
  namingMode: 'sharp' | 'flat';
  subLabel?: string;
  subLabelRoot?: string;
  subLabelType?: string;
  overrideType?: string;
  onPress: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onLeftChevronPress?: () => void;
  onRightChevronPress?: () => void;
  onTopChevronPress?: () => void;
  onBottomChevronPress?: () => void;
  onNotePress?: (midi: number) => void;
  octave?: number;
  theme?: Theme;
  activeIvs?: number[];
  activeRoles?: string[];
  activeFormula?: string[];
}

function AnimatedPill({ p, color, onNotePress }: any) {
  const anim = React.useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.35, duration: 80, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    onNotePress?.(p.midi);
  };

  return (
    <Animated.View style={{ transform: [{ scale: anim }] }}>
      <TouchableOpacity
        activeOpacity={1} // Changed from 0.75 to 1 to remove the flashing/dimming effect
        onPress={handlePress}
        style={[styles.pill, { backgroundColor: color }]}
      >
        <Text style={styles.pillText}>{p.name}</Text>
        <Text style={styles.pillRole}>{p.shortRole}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ChordCard({
  rootSemi, chordType, namingMode, subLabel, subLabelRoot, subLabelType,
  onPress, onSwipeLeft, onSwipeRight, onLeftChevronPress, onRightChevronPress, 
  onTopChevronPress, onBottomChevronPress, onNotePress, octave = 4, theme, activeIvs, activeRoles, activeFormula, overrideType
}: Props) {
  const ch = CH[chordType];
  const labelMode = useSettingsStore(s => s.labelMode);
  if (!ch) return null;

  const panResponder = React.useRef(
    PanResponder.create({
      // Swipe-to-change-root is disabled — use the side chevrons instead. Returning false
      // means this responder never claims horizontal drags, so swipes are ignored.
      onMoveShouldSetPanResponder: () => false,
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 40) {
          onSwipeRight?.();
        } else if (gestureState.dx < -40) {
          onSwipeLeft?.();
        }
      }
    })
  ).current;

  const notes = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;
  const rootName = String(notes[rootSemi % 12] ?? '');
  const bg = theme?.bg2 ?? '#1e1e2e';
  const txt1 = theme?.txt1 ?? '#ffffff';
  const txt2 = theme?.txt2 ?? '#aaaacc';
  const txt3 = theme?.txt3 ?? '#6666aa';
  const accent = theme?.accent ?? '#D85A30';

  // Force a pleasant middle register (Octave 4) for the UI note pills,
  // ignoring the global instrument octave which might be tuned down for the fretboard.
  const base = 12 * (4 + 1) + rootSemi;
  
  // Use passed subsets (for Arps/Intervals) or fallback to full chord
  const ivsToUse = activeIvs ?? ch.iv ?? [];
  const rolesToUse = activeRoles ?? ch.r ?? [];
  const formulaToUse = activeFormula ?? ch.f ?? [];

  const lowestIv = ivsToUse.length > 0 ? ivsToUse[0] : 0;
  const bassMidi = base + lowestIv;
  const bassSemi = ((bassMidi % 12) + 12) % 12;
  const safeRootSemi = ((rootSemi % 12) + 12) % 12;
  const isSlash = ivsToUse.length > 0 && bassSemi !== safeRootSemi;
  
  const bassRole = rolesToUse[0];
  const bassFormulaStr = formulaToUse[0] ?? ROLE_SHORT[bassRole ?? ''] ?? bassRole;
  const bassName = isSlash ? (bassFormulaStr ? spellInterval(rootSemi, bassFormulaStr, namingMode === 'flat') : String(notes[bassSemi] ?? '')) : '';
  
  // Unified source of truth for the main text suffix
  const mainSuffix = overrideType || String(ch.s ?? '');
  
  // Detect if the target text strings already explicitly state the slash bass note
  const mainHasSlash = /\/\s*[A-G]/i.test(mainSuffix);
  const subLabelHasSlash = subLabel && /\/\s*[A-G]/i.test(subLabel);
  const subLabelTypeHasSlash = subLabelType && /\/\s*[A-G]/i.test(subLabelType);
  
  // Only generate a fallback sub-label if it's a physical slash chord AND the main text doesn't already state it
  const needsFallbackSubLabel = isSlash && !subLabelRoot && !subLabelType && !subLabel && !mainHasSlash;

  const notePills = ivsToUse.map((iv, i) => {
    const midi = base + iv; 
    const role = String(rolesToUse[i] ?? 'unknown');
    
    const formula = formulaToUse[i] ?? ROLE_SHORT[role] ?? role;
    // ALWAYS force 'notes' mode here so the pills never go blank
    const label = getGlobalLabel('notes', namingMode, rootSemi, formula, role, midi);
    
    return {
      name: label,
      role,
      shortRole: formatDegree(formula),
      midi,
      rawFormula: formula,
    };
  });

  // Structural Grouping Logic
  let topRow: typeof notePills = [];
  let bottomRow: typeof notePills = [];
  if (notePills.length <= 4) {
    topRow = notePills;
  } else if (notePills.length === 5 || notePills.length === 6) {
    topRow = notePills.slice(0, 3);
    bottomRow = notePills.slice(3);
  } else {
    // Fallback for huge 7+ note chords (e.g., 13ths)
    const mid = Math.ceil(notePills.length / 2);
    topRow = notePills.slice(0, mid);
    bottomRow = notePills.slice(mid);
  }

  const renderPill = (p: typeof notePills[0], i: number) => {
    const rawFormula = p.rawFormula;
    // Intercept '1' and map it to 'R' for the color dictionary
    const normFormula = rawFormula === '1' ? 'R' : rawFormula;
    const normRole = p.role === '1' ? 'R' : p.role;
    const color = ROLE_COLORS_GLOBAL[normFormula] ?? ROLE_COLORS_GLOBAL[normRole] ?? '#888';

    return (
      <AnimatedPill 
        key={`${p.midi}-${p.role}-${p.shortRole}-${i}`} 
        p={p} 
        color={color} 
        onNotePress={onNotePress} 
      />
    );
  };

  

  return (
    <View style={[styles.card, { backgroundColor: bg }]} {...panResponder.panHandlers}>
      {/* Background Play Button */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={0.7}
        onPress={onPress}
      />

      {/* Stacked steppers — root on top, quality below. Sized to read as a matched pair. */}
      <View style={{ width: '100%', gap: 2 }} pointerEvents="box-none">
        <View style={styles.stepRow}>
          <TouchableOpacity onPress={onLeftChevronPress} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={styles.stepBtn}>
            <Ionicons name="chevron-back" size={18} color={txt3} />
          </TouchableOpacity>
          <Text style={[styles.root, { color: txt1, flex: 1, textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>{rootName}</Text>
          <TouchableOpacity onPress={onRightChevronPress} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={styles.stepBtn}>
            <Ionicons name="chevron-forward" size={18} color={txt3} />
          </TouchableOpacity>
        </View>
        <View style={styles.stepRow}>
          <TouchableOpacity onPress={onBottomChevronPress} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={styles.stepBtn}>
            <Ionicons name="chevron-back" size={18} color={txt3} />
          </TouchableOpacity>
          <Text style={[styles.type, { color: accent, flex: 1, textAlign: 'center', marginBottom: 0 }]} numberOfLines={1} adjustsFontSizeToFit>{formatChordSymbol(mainSuffix)}</Text>
          <TouchableOpacity onPress={onTopChevronPress} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={styles.stepBtn}>
            <Ionicons name="chevron-forward" size={18} color={txt3} />
          </TouchableOpacity>
        </View>
      </View>

      {subLabelRoot || subLabelType || subLabel || needsFallbackSubLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', maxWidth: '100%', marginTop: 2 }} pointerEvents="none">

          {(subLabelRoot || subLabelType) ? (
            <>
              {subLabelRoot ? <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.subLabel, { color: txt1, marginRight: 2, flexShrink: 1 }]}>{formatChordSymbol(subLabelRoot)}</Text> : null}
              {subLabelType ? <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.subLabel, { color: accent, marginRight: 4, flexShrink: 1 }]}>{formatChordSymbol(subLabelType)}</Text> : null}
              {isSlash && !subLabelTypeHasSlash ? (
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.subLabel, { color: txt1, marginLeft: 4, flexShrink: 1 }]}>/ {bassName}</Text>
              ) : null}
            </>
          ) : null}

          {subLabel && !subLabelRoot && !subLabelType ? (
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.subLabel, { color: txt2, marginRight: 4, flexShrink: 1 }]}>
              {formatChordSymbol(subLabel).replace(/\s*\/\s*(?=[A-G])/gi, ' / ')}
            </Text>
          ) : null}

          {needsFallbackSubLabel ? (
            <>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.subLabel, { color: txt1, marginRight: 2, flexShrink: 1 }]}>{rootName}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.subLabel, { color: accent, flexShrink: 1 }]}>{formatChordSymbol(mainSuffix)}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.subLabel, { color: txt1, marginLeft: 4, flexShrink: 1 }]}>/ {bassName}</Text>
            </>
          ) : null}

        </View>
      ) : null}

      <Text style={[styles.formula, { color: txt3 }]}>
        {formulaToUse.map(formatDegree).join(' · ')}
      </Text>

      {/* Note pills — moved into the card's (left) column, stacked under the formula. */}
      <View style={styles.pillStack} pointerEvents="box-none">
        <View style={styles.pillRow}>
          {topRow.map((p, i) => renderPill(p, i))}
        </View>
        {bottomRow.length > 0 && (
          <View style={styles.pillRow}>
            {bottomRow.map((p, i) => renderPill(p, i + topRow.length))}
          </View>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  // The card is now a single (left) column: steppers → sub-label → formula → note pills,
  // all stacked. The POSITION/VOICING navigators sit beside it (provided by the instrument
  // view as the right column of the band), so the card no longer owns a divider/right split.
  card: { paddingVertical: 12, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },

  pillStack: { alignItems: 'center', gap: 6, marginTop: 6 },
  pillRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },

  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  stepBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  // Root + quality are sized as a matched pair (title over subtitle) so the two steppers read
  // together. lineHeight gives the cap/ascenders headroom so the glyphs aren't clipped.
  root: { ...TYPE.title, lineHeight: 30, textAlign: 'center' },
  type: { ...TYPE.subtitle, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center', lineHeight: 26 },
  subLabel: { ...TYPE.label, textAlign: 'center', marginBottom: 2 },
  formula: { ...TYPE.caption, letterSpacing: 1, textAlign: 'center', marginTop: 4 },

  pillContainer: { alignItems: 'center', gap: 0 },
  pill: {
    width: 34,
    height: 34,
    borderRadius: 17, // Perfect circle!
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3
  },
  pillText: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center', lineHeight: 14 },
  pillRole: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center', lineHeight: 10, marginTop: 1 },
});