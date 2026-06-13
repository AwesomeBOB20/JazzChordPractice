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
  const border = theme?.border ?? '#333';

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
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.row}>

        <View style={[styles.left, { position: 'relative' }]} {...panResponder.panHandlers}>
          {/* Background Play Button */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={0.7}
            onPress={onPress}
          />

          {/* Top Chevron */}
          <TouchableOpacity
            onPress={onTopChevronPress}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            style={{ position: 'absolute', top: 4, left: '50%', marginLeft: -10, zIndex: 10, padding: 4 }}
          >
            <Ionicons name="chevron-up" size={20} color={txt3} style={{ opacity: 0.6 }} />
          </TouchableOpacity>

          {/* Bottom Chevron */}
          <TouchableOpacity
            onPress={onBottomChevronPress}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            style={{ position: 'absolute', bottom: 4, left: '50%', marginLeft: -10, zIndex: 10, padding: 4 }}
          >
            <Ionicons name="chevron-down" size={20} color={txt3} style={{ opacity: 0.6 }} />
          </TouchableOpacity>

          {/* Foreground Content Wrapper */}
          <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }} pointerEvents="box-none">
            <View style={[styles.nameRow, { marginBottom: 0 }]} pointerEvents="none">
              <Text style={[styles.root, { color: txt1 }]}>{rootName}</Text>
              <Text
                style={[styles.type, { color: accent }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatChordSymbol(mainSuffix)}
              </Text>
            </View>
          </View>

          <View style={{ height: 4 }} pointerEvents="none" />
          
          {subLabelRoot || subLabelType || subLabel || needsFallbackSubLabel ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', maxWidth: '100%' }} pointerEvents="none">

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
        </View>

        <View style={[styles.divider, { backgroundColor: border }]} />

        <View style={styles.right}>
          <View style={styles.pillRow}>
            {topRow.map((p, i) => renderPill(p, i))}
          </View>
          {bottomRow.length > 0 && (
            <View style={styles.pillRow}>
              {bottomRow.map((p, i) => renderPill(p, i + topRow.length))}
            </View>
          )}
        </View>

        {/* Left Chevron */}
        <TouchableOpacity
          onPress={onLeftChevronPress}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={{ position: 'absolute', left: 4, top: '50%', marginTop: -18, zIndex: 10, height: 36, width: 36, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={22} color={txt3} style={{ opacity: 0.6 }} />
        </TouchableOpacity>

        {/* Right Chevron */}
        <TouchableOpacity
          onPress={onRightChevronPress}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={{ position: 'absolute', left: '42%', marginLeft: -40, top: '50%', marginTop: -18, zIndex: 10, height: 36, width: 36, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-forward" size={22} color={txt3} style={{ opacity: 0.6 }} />
        </TouchableOpacity>

      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderBottomWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch', height: 150, position: 'relative' },
  
  left: { width: '42%', paddingVertical: 20, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  divider: { width: 1, alignSelf: 'stretch' },
  right: { width: '58%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 8, gap: 6 },
  pillRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center', gap: 4, marginBottom: 4 },
  root: { ...TYPE.display, lineHeight: 44, textAlign: 'center' },
  type: { ...TYPE.subtitle, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center', marginBottom: 4 },
  subLabel: { ...TYPE.label, textAlign: 'center', marginBottom: 4 },
  formula: { ...TYPE.caption, letterSpacing: 1, textAlign: 'center' },
  
  pillContainer: { alignItems: 'center', gap: 0 },
  pill: { 
    width: 38, 
    height: 38, 
    borderRadius: 19, // Perfect circle!
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