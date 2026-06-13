import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Text as SvgText } from 'react-native-svg';
import { getNoteColor } from '@shared/ui/themes';
import { NOTE_SHARP, NOTE_FLAT, spellInterval, ROLE_SHORT } from '@shared/theory/musicTheory';
import { familyForWeight } from '@shared/fonts/fonts';
import { useSettingsStore } from '@features/settings/store/settingsStore';

interface Props {
  revealed: boolean;
  isPlaying: boolean;
  pulse: number; // increments on every chord strike — drives a burst for single-hit (block) chords
  notes: number[];
  roles: string[];
  formulas: string[];
  namingMode: 'sharp' | 'flat';
  theme: any;
  onNotePress?: (midi: number) => void;
}

// Compact interval names between adjacent notes — works for any chord/scale size.
const IV: Record<number, string> = { 1: 'm2', 2: 'M2', 3: 'm3', 4: 'M3', 5: 'P4', 6: 'TT', 7: 'P5', 8: 'm6', 9: 'M6', 10: 'm7', 11: 'M7', 0: '8ve' };
function ivName(semi: number): string {
  const within = ((semi % 12) + 12) % 12;
  const base = IV[within] ?? `${within}st`;
  return semi > 12 ? `${base}+` : base;
}

// Role/formula → plain diatonic degree: R, 2, 3, 4, 5, 6, 7 (accidentals dropped,
// extensions folded back: 9→2, 11→4, 13→6).
function degreeLabel(s: string): string {
  if (!s) return '';
  if (/root/i.test(s) || s === 'R' || s === '1') return 'R';
  const m = s.match(/\d+/);
  if (!m) return '';
  let num = parseInt(m[0], 10);
  if (num > 7) num = ((num - 1) % 7) + 1;
  return String(num);
}

const ANATOMY_HEIGHT = 210;

// The VISIBLE note dot — a colored circle with its note name, that bounce-scales
// on tap exactly like the ChordCard AnimatedPill (scale 1→1.35→1, native driver).
function AnimatedNoteDot({ cx, cy, r, color, name, fBold, midi, index, onNotePress }: {
  cx: number; cy: number; r: number; color: string; name: string; fBold?: string; midi: number; index: number;
  onNotePress?: (midi: number) => void;
}) {
  // Entrance: cascade in left→right with a springy overshoot + fade, so the chord
  // "assembles" note by note instead of popping in all at once.
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const delay = 60 + index * 75;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, delay, friction: 5, tension: 140, useNativeDriver: true }),
    ]).start();
  }, []);
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 170, useNativeDriver: true }),
    ]).start();
    onNotePress?.(midi);
  };
  return (
    <Animated.View style={{ position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color, alignItems: 'center', justifyContent: 'center', opacity, transform: [{ scale }] }}>
      <TouchableOpacity disabled={!onNotePress} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: r }} activeOpacity={0.85} onPress={handlePress}>
        <Text style={{ color: '#fff', fontSize: Math.min(20, r * 0.85), fontFamily: fBold }}>{name}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Listening-phase equaliser bars ───────────────────────────────────────────
const BAR_COUNT = 11;
const BAR_H = 150;

function Bar({ v, color }: { v: Animated.Value; color: string }) {
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [BAR_H / 2, 0] });
  return (
    <Animated.View style={{ width: 10, height: BAR_H, borderRadius: 6, backgroundColor: color, transform: [{ translateY }, { scaleY: v }] }} />
  );
}

function EqualizerBars({ isPlaying, pulse, theme }: { isPlaying: boolean; pulse: number; theme: any }) {
  const bars = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))).current;
  const animsRef = useRef<Animated.CompositeAnimation[]>([]);

  // Single-hit (block) chords don't sustain `isPlaying`, so each strike fires a one-shot
  // burst — the bars jump to varied peaks and decay back to rest, like a level meter spike.
  useEffect(() => {
    if (pulse === 0 || isPlaying) return;
    bars.forEach((v, i) => {
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5 + Math.random() * 0.5, duration: 90 + i * 7, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 640, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    });
  }, [pulse]);

  useEffect(() => {
    animsRef.current.forEach((a) => a.stop());
    animsRef.current = [];
    if (isPlaying) {
      bars.forEach((v, i) => {
        const dur = 520 + (i % 5) * 90;
        const peak = 0.6 + ((i * 37) % 41) / 100;
        const seq = Animated.sequence([
          Animated.timing(v, { toValue: peak, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.28, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]);
        const anim = Animated.sequence([Animated.delay(i * 55), Animated.loop(seq)]);
        animsRef.current.push(anim);
        anim.start();
      });
    } else {
      bars.forEach((v) => Animated.timing(v, { toValue: 0.3, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true }).start());
    }
    return () => { animsRef.current.forEach((a) => a.stop()); };
  }, [isPlaying]);

  return (
    <View style={{ alignItems: 'center', gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_H, gap: 6 }}>
        {bars.map((v, i) => (
          <Bar key={i} v={v} color={i % 2 === 0 ? theme.accent : theme.accent + '80'} />
        ))}
      </View>
      <Ionicons name="headset-outline" size={28} color={theme.txt3} />
    </View>
  );
}

// Split N notes evenly into rows (≤4 per row) so they're never crammed into one line.
// With the basic anatomy (one note per degree, ≤7) this is at most two rows.
function splitRows(n: number): number[] {
  const rows = Math.max(1, Math.ceil(n / 4));
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

// ── Reveal-phase chord anatomy ───────────────────────────────────────────────
function ChordAnatomy({ notes, roles, formulas, namingMode, theme, onNotePress }: Omit<Props, 'revealed' | 'isPlaying' | 'pulse'>) {
  const colorMode = useSettingsStore((s: any) => s.colorMode);
  const selectiveRoles = useSettingsStore((s: any) => s.selectiveRoles);
  const fontFamily = useSettingsStore((s: any) => s.fontFamily);
  const fBold = familyForWeight(fontFamily, '800');
  const fMed = familyForWeight(fontFamily, '700');
  const [w, setW] = useState<number>(() => Dimensions.get('window').width);
  // The connector lines + interval/degree labels fade in just after the dots start
  // cascading, so the chord wires itself together.
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(reveal, { toValue: 1, duration: 340, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  // Basic anatomy: ONE note per scale/chord degree (no octave doublings, no actual-voicing
  // spread), ordered ascending from the root within a single octave → R 2 3 4 5 6 7. Caps
  // the count at ≤7 so a 7-note scale never blows out into overlapping rows.
  const NOTE = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;
  const byDeg = new Map<string, { deg: string; m: number; role: string; formula: string }>();
  notes.forEach((m, i) => {
    if (m == null || isNaN(m)) return;
    const deg = degreeLabel(formulas[i] || roles[i] || '');
    if (!deg || byDeg.has(deg)) return;
    byDeg.set(deg, { deg, m, role: roles[i] || '', formula: formulas[i] || '' });
  });
  const items = [...byDeg.values()];
  const rootItem = items.find((x) => x.deg === 'R') || items[0];
  const rootPc = rootItem ? (((rootItem.m % 12) + 12) % 12) : 0;
  const withOff = items.map((it) => {
    const raw = it.formula || it.role || '';
    const effFormula = ROLE_SHORT[raw] || raw || '1';
    const name = spellInterval(rootPc, effFormula, namingMode === 'flat') || NOTE[((it.m % 12) + 12) % 12];
    return { ...it, name, off: (((((it.m % 12) + 12) % 12) - rootPc + 12) % 12) };
  });
  withOff.sort((a, b) => a.off - b.off);
  const N = withOff.length;

  return (
    <View style={{ width: '100%', height: ANATOMY_HEIGHT }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {N > 0 && (() => {
        const W = w;
        const H = ANATOMY_HEIGHT;
        const counts = splitRows(N);
        const rows = counts.length;
        const maxCols = Math.max(...counts);
        const padX = 26, padTop = 28, padBottom = 12;
        const usableW = Math.max(0, W - 2 * padX);
        const usableH = Math.max(0, H - padTop - padBottom);
        const colW = usableW / maxCols;
        const rowH = usableH / rows;
        // Clamp radius so each row's interval label (above) and degree label (below) always
        // fit inside its own band — guarantees rows never overlap, however tight the area.
        const r = Math.max(13, Math.min(28, colW * 0.36, rowH / 2 - 22));

        const dots: any[] = [];
        let idx = 0;
        counts.forEach((cnt, ri) => {
          const cy = padTop + rowH * ri + rowH / 2;
          const startCol = (maxCols - cnt) / 2;
          for (let c = 0; c < cnt; c++) {
            const cx = padX + (startCol + c + 0.5) * colW;
            const it = withOff[idx];
            const color = getNoteColor(it.role === '1' ? 'R' : (it.role || it.deg), colorMode, theme, selectiveRoles);
            dots.push({ ...it, cx, cy, color, rowFirst: c === 0, prevX: c > 0 ? dots[dots.length - 1].cx : 0, prevOff: c > 0 ? withOff[idx - 1].off : 0 });
            idx++;
          }
        });

        return (
          <>
            <Animated.View style={{ opacity: reveal }}>
              <Svg width={W} height={H}>
                {dots.map((d, i) => (!d.rowFirst ? (
                  <Line key={`l${i}`} x1={d.prevX} y1={d.cy} x2={d.cx} y2={d.cy} stroke={theme.border} strokeWidth={2} />
                ) : null))}
                {dots.map((d, i) => (!d.rowFirst ? (
                  <SvgText key={`iv${i}`} x={(d.prevX + d.cx) / 2} y={d.cy - r - 9} fill={theme.txt3} fontSize={12} fontFamily={fMed} textAnchor="middle">{ivName(d.off - d.prevOff)}</SvgText>
                ) : null))}
                {/* Degree labels stay in the SVG, beneath each note. The colored note
                    circles themselves are now visible animated Views (below) so they
                    bounce on tap like the ChordCard pills. */}
                {dots.map((d, i) => (
                  <SvgText key={`deg${i}`} x={d.cx} y={d.cy + r + 19} fill={theme.txt2} fontSize={13} fontFamily={fMed} textAnchor="middle">{d.deg}</SvgText>
                ))}
              </Svg>
            </Animated.View>
            <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }} pointerEvents="box-none">
              {dots.map((d, i) => (
                <AnimatedNoteDot key={i} cx={d.cx} cy={d.cy} r={r} color={d.color} name={d.name || ''} fBold={fBold} midi={d.m} index={i} onNotePress={onNotePress} />
              ))}
            </View>
          </>
        );
      })()}
    </View>
  );
}

export default function ListeningVisual({ revealed, isPlaying, pulse, notes, roles, formulas, namingMode, theme, onNotePress }: Props) {
  return (
    <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
      {revealed
        ? <ChordAnatomy notes={notes} roles={roles} formulas={formulas} namingMode={namingMode} theme={theme} onNotePress={onNotePress} />
        : <EqualizerBars isPlaying={isPlaying} pulse={pulse} theme={theme} />}
    </View>
  );
}
