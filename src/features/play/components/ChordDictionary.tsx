import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NOTE_SHARP, NOTE_FLAT } from '@shared/theory/musicTheory';
import { Theme, getNoteColor } from '@shared/ui/themes';
import { TYPE } from '@shared/ui/typography';
import { MiniChordDiagram, MiniPianoDiagram, miniChordFootprint, CountChip } from '@shared/ui';
import { useDictionaryStore, DictionaryCategory } from '@features/play/store/dictionaryStore';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { useAudio } from '@shared/audio/AudioContext';
import { getDictionaryVoicings, getDictionaryVoicingsAllRoots, isArpFamily, dictCorners, formulaGlyph, DictMiniItem } from '@features/play/util/dictionaryVoicings';
import { dictionaryGroups, tabKind, ALL_CATEGORIES, DictGroup } from '@features/play/util/dictionaryGroups';

// ─── EXPLORE — DICTIONARY MODE (version 2) ──────────────────────────────────
// A self-contained reference grid. Pick a voicing TYPE (chips) + ROOT (sticky
// controls); the scrollable list shows that tab's natural items grouped — chord
// qualities for chord-voicing tabs, scales for Scales, intervals for Intervals,
// CAGED shapes for Shapes. Each item is a collapsible accordion of mini diagrams
// at the chosen root. Instrument comes from the global header. Tapping plays.

const FLAT_ROOTS = [0, 1, 3, 5, 8, 10];
const rootName = (r: number) => (FLAT_ROOTS.includes(r) ? NOTE_FLAT : NOTE_SHARP)[r];
const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const screenW = Dimensions.get('window').width;
const H_PAD = 12;
// Match the tuner/play/progression sticky players: 12 top pad + 56 button + bottom inset.
const DOCK_H = 12 + 56 + (Platform.OS === 'ios' ? 24 : 12); // bottom dock height (picker floats above it)
// Root picker: 12 plain circles in a horizontal scroller. NOT a spin dial — no infinite loop,
// no recenter, no scroll-driven scaling/mask. Just tap the circle you want.
const DIAL_CIRCLE = 52; // diameter of one root circle
const DIAL_GAP = 12;    // gap between circles
const DIAL_STEP = DIAL_CIRCLE + DIAL_GAP; // x advance per circle
const DIAL_SLIDE = 52;  // px the picker slides up from behind the dock on open

// Per-column-count layout: cell width + how big the diagrams render + the diagram
// area height. Fewer columns → wider cells → larger diagrams so big chords read.
function layoutFor(cols: number) {
  const c = cols === 1 || cols === 2 ? cols : 3;
  // Gap-less flat grid, flush to the screen edges: cells tile the full width and share 1px borders.
  const cellW = Math.floor(screenW / c);
  return {
    cols: c,
    cellW,
    pianoMaxWidth: cellW - 10,
    guitarScale: c === 1 ? 2.2 : c === 2 ? 1.6 : 1.15,
    diagramH: c === 1 ? 132 : c === 2 ? 100 : 72,
    // Caption (piano inversion / scale) font size, sized to the cell width.
    labelFs: c === 1 ? 15 : c === 2 ? 12 : 10,
    // Corner labels (guitar) — a touch smaller so four fit without crowding the diagram.
    cornerFs: c === 1 ? 12 : c === 2 ? 10 : 9,
  };
}

// ─── One item's row of diagrams (memoized + lazy) ───────────────────────────
// getDictionaryVoicings runs INSIDE this memoized row, keyed on (item, root,
// instrument, octave), so collapsed sections never build their diagrams.
const DictSectionRow = React.memo(function DictSectionRow({
  itemKey, isChordQuality, category, instrument, rootSemi, allRoots, octave, selectedScaleId, labelMode, t, onPlay, L,
}: {
  itemKey: string; isChordQuality: boolean; category: DictionaryCategory; instrument: 'piano' | 'guitar';
  rootSemi: number; allRoots: boolean; octave: number; selectedScaleId: string | null;
  labelMode: 'degrees' | 'notes' | 'none'; t: Theme;
  onPlay: (it: DictMiniItem) => void; L: ReturnType<typeof layoutFor>;
}) {
  // Colour the formula corner's degrees with the SAME role colours as the diagram dots, so it
  // respects the user's colour mode (roles / theme / selective) — read from the store like the dots do.
  const colorMode = useSettingsStore((s: any) => s.colorMode);
  const selectiveRoles = useSettingsStore((s: any) => s.selectiveRoles);
  // Spell labels against the shown root (its key signature); "any root" movable grips
  // pass no root so note-name mode falls back to the actual pitch of the drawn shape.
  const namingMode: 'sharp' | 'flat' = FLAT_ROOTS.includes(rootSemi) ? 'flat' : 'sharp';
  const labelRoot = allRoots ? undefined : rootSemi;
  const items = React.useMemo(
    () => allRoots
      ? getDictionaryVoicingsAllRoots(category, instrument, itemKey, octave, selectedScaleId)
      : getDictionaryVoicings(category, instrument, rootSemi, itemKey, octave, selectedScaleId),
    [category, instrument, rootSemi, allRoots, itemKey, octave, selectedScaleId]
  );
  if (!items.length) {
    return <Text style={{ color: t.txt3, fontSize: 12, marginBottom: 16 }}>—</Text>;
  }
  // Stretch each diagram to fill its cell (contained, so nothing touches the edges)
  // and size every box in this row to its TALLEST grip — mirrors the progression
  // measure grid, where all cells share one height fitted to the biggest diagram.
  const CELL_PAD = 8;
  const innerW = Math.max(40, L.cellW - CELL_PAD * 2);
  const MAX_SCALE = L.cols === 1 ? 4.2 : L.cols === 2 ? 2.8 : 2.0;
  const MAX_BOX_H = L.cols === 1 ? 240 : L.cols === 2 ? 168 : 116;
  const boxH = instrument === 'piano'
    ? L.diagramH
    : Math.min(MAX_BOX_H, Math.max(60, ...items.map(it => {
        const fp = miniChordFootprint(it.voicing, it.arpShape);
        return fp.h * Math.min(MAX_SCALE, innerW / fp.w);
      })));
  // Flat grid (no card panels) — cells tile the full width and share 1px borders, matching the
  // progression measure grid. The container draws the top + left edge; each cell draws its
  // right + bottom edge.
  // Each corner label sits in a pill anchored flush to that cell corner (only its inner corner is
  // rounded), echoing the old root ribbon. Root is accent-filled; the rest are subtle chips.
  const pill = (text: string | undefined, anchor: any, accent?: boolean) => !text ? null : (
    <View style={[styles.cornerPill, anchor, accent ? { backgroundColor: t.accent } : { backgroundColor: t.bg2, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <Text numberOfLines={1} style={{ fontSize: L.cornerFs, fontWeight: accent ? '800' : '700', color: accent ? '#fff' : t.txt3, maxWidth: L.cellW * 0.5 }}>{text}</Text>
    </View>
  );
  // Formula corner: each degree coloured by its role colour (one nested <Text> per token). Falls back
  // to the plain muted pill if the item has no token list.
  const formulaPill = (tokens: string[] | undefined, fallback: string | undefined, anchor: any) => {
    if (!tokens || !tokens.length) return pill(fallback, anchor);
    return (
      <View style={[styles.cornerPill, anchor, { backgroundColor: t.bg2, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Text numberOfLines={1} style={{ fontSize: L.cornerFs, fontWeight: '700', maxWidth: L.cellW * 0.5 }}>
          {tokens.map((tk, i) => (
            // fontWeight pinned to match the other corners (the Android Text patch otherwise renders a
            // nested span with no explicit weight at the regular face, making these read lighter).
            <Text key={i} style={{ fontWeight: '700', color: getNoteColor(tk, colorMode, t, selectiveRoles) }}>{formulaGlyph(tk)}{i < tokens.length - 1 ? ' ' : ''}</Text>
          ))}
        </Text>
      </View>
    );
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderLeftWidth: 1, borderColor: t.border }}>
      {items.map(it => {
        // Guitar cells carry four corner pills in place of the old caption; piano keeps its caption.
        const c = instrument === 'guitar' ? dictCorners(it, category, rootSemi, allRoots) : null;
        return (
          <TouchableOpacity
            key={it.key}
            activeOpacity={0.7}
            onPress={() => onPlay(it)}
            style={[styles.cell, { width: `${100 / L.cols}%`, borderColor: t.border, paddingVertical: instrument === 'guitar' ? L.cornerFs + 9 : 8 }]}
          >
            <View style={{ height: boxH, justifyContent: 'center', alignItems: 'center' }}>
              {instrument === 'guitar'
                ? <MiniChordDiagram voicing={it.voicing} arpShape={it.arpShape} theme={t} fitWidth={innerW} fitHeight={boxH} labelMode={labelMode} namingMode={namingMode} rootSemi={labelRoot} />
                : <MiniPianoDiagram chord={isChordQuality ? { rootSemi, chordType: itemKey } : undefined} notes={it.notes} noteFormulas={it.noteFormulas} theme={t} octave={octave} maxWidth={innerW} maxHeight={boxH} labelMode={labelMode} namingMode={namingMode} rootSemi={labelRoot} />}
            </View>
            {c ? (
              <>
                {pill(c.root, styles.cTL, true)}
                {pill(c.topRight, styles.cTR)}
                {formulaPill(c.formulaTokens, c.formula, styles.cBL)}
                {pill(c.bass, styles.cBR)}
              </>
            ) : (!!it.caption && (
              <Text numberOfLines={1} style={{ color: t.txt2, fontSize: L.labelFs, fontWeight: '700', marginTop: Math.round(L.labelFs * 0.4), maxWidth: L.cellW - 12 }}>{it.caption}</Text>
            ))}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ─── Root picker: 12 plain circles in a horizontal scroller ──────────────────
// NOT a spin dial. The 12 roots are 12 real circular buttons that slide left/right.
// Tap one to pick it. No infinite loop, no recenter, no scroll-driven scaling or mask —
// so nothing can glitch/restart, and there's no dark ghost behind the text (the old white
// mask is gone). The selected circle is just filled with the accent colour.
function RootPicker({ open, rootSemi, t, onPick, onClose }: {
  open: boolean; rootSemi: number; t: Theme; onPick: (r: number) => void; onClose: () => void;
}) {
  const slide = React.useRef(new Animated.Value(0)).current;
  const scrollRef = React.useRef<ScrollView>(null);

  // Slide the picker up from behind the dock on open, back down on close. This is the ONLY
  // animation — a one-shot entrance; the circles themselves never animate.
  React.useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 170,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  // On open, jump (no animation) so the selected circle sits centred in the scroller.
  React.useEffect(() => {
    if (!open) return;
    const target = rootSemi * DIAL_STEP + DIAL_CIRCLE / 2 - screenW / 2;
    const id = requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: Math.max(0, target), animated: false }));
    return () => cancelAnimationFrame(id);
  }, [open, rootSemi]);

  return (
    <>
      {open && <TouchableOpacity activeOpacity={1} onPress={onClose} style={[styles.dialBackdrop, { bottom: DOCK_H }]} />}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.dialWrap, { bottom: DOCK_H, backgroundColor: t.bg, borderTopColor: t.border, borderBottomColor: t.border, opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [DIAL_SLIDE, 0] }) }] }]}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dialRow}
        >
          {ROOTS.map(r => {
            const sel = r === rootSemi;
            return (
              <TouchableOpacity
                key={r}
                activeOpacity={0.7}
                onPress={() => { onPick(r); onClose(); }}
                style={[styles.rootCircle, { backgroundColor: sel ? t.accent : t.bg2, borderColor: sel ? t.accent : t.border }]}
              >
                <Text style={[styles.rootCircleText, { color: sel ? '#fff' : t.txt2 }]}>{rootName(r)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
    </>
  );
}

interface Props { t: Theme; }

export default function ChordDictionary({ t }: Props) {
  // Instrument + octave come from the GLOBAL header / settings (single source).
  const instrument = useSettingsStore((s: any) => s.instrument);
  const octave = useSettingsStore((s: any) => s.octave);
  const labelMode = useSettingsStore((s: any) => s.labelMode);
  const selectedScaleId = useChordStore((s: any) => s.selectedScaleId);
  const setChord = useChordStore((s: any) => s.setChord);
  const setPendingVoicingTab = useChordStore((s: any) => s.setPendingVoicingTab);
  const setPendingVoicingKey = useChordStore((s: any) => s.setPendingVoicingKey);
  const { category, setCategory, rootSemi, setRootSemi, allRoots, setAllRoots, cols, setCols, setMode } = useDictionaryStore();
  // "All roots" is guitar-only — never let a piano frame paint the aggregated view.
  const effectiveAllRoots = allRoots && instrument === 'guitar';
  const { playChord, stopAudio } = useAudio();
  const L = React.useMemo(() => layoutFor(cols), [cols]);

  // Grouped items per category (root-independent → keyed only on instrument).
  const groupsByCat = React.useMemo(() => {
    const m: Record<string, DictGroup[]> = {};
    ALL_CATEGORIES.forEach(c => { m[c.key] = dictionaryGroups(c.key, instrument); });
    return m;
  }, [instrument]);

  // Per-category availability for the CURRENT root/instrument: how many families have ≥1 chord
  // with a real voicing. Uses early-exit (one option proves the family) so it stays cheap — only
  // a fully-empty family pays for building all its items. Lets us HIDE voicing tabs / families /
  // chords that produce nothing for this root (e.g. open chords don't exist for B♭).
  const availability = React.useMemo(() => {
    const m: Record<string, { available: boolean; availFamilies: number }> = {};
    for (const c of ALL_CATEGORIES) {
      const groups = groupsByCat[c.key] || [];
      let availFamilies = 0;
      for (const g of groups) {
        let famHas = false;
        for (const item of g.items) {
          const built = effectiveAllRoots
            ? getDictionaryVoicingsAllRoots(c.key, instrument, item.key, octave, selectedScaleId)
            : getDictionaryVoicings(c.key, instrument, rootSemi, item.key, octave, selectedScaleId);
          if (built.length > 0) { famHas = true; break; } // one option is enough → stop
        }
        if (famHas) availFamilies++;
      }
      m[c.key] = { available: availFamilies > 0, availFamilies };
    }
    return m;
  }, [groupsByCat, instrument, rootSemi, effectiveAllRoots, octave, selectedScaleId]);

  const categories = React.useMemo(
    () => ALL_CATEGORIES.filter(c => availability[c.key]?.available),
    [availability]
  );
  // Voicing-type pill chip count: available families for multi-family tabs, else the item count.
  const categoryCounts = React.useMemo(() => {
    const m: Record<string, number> = {};
    ALL_CATEGORIES.forEach(c => {
      const groups = groupsByCat[c.key] || [];
      m[c.key] = groups.length > 1 ? (availability[c.key]?.availFamilies ?? 0) : groups.reduce((n, g) => n + g.items.length, 0);
    });
    return m;
  }, [groupsByCat, availability]);

  // If the stored category isn't valid for this instrument, fall back to the first valid one.
  // We RENDER with effectiveCategory immediately (no invalid frame), and sync the store in an
  // effect — writing to the store during render updates PlayScreen mid-render (React warning).
  const effectiveCategory: DictionaryCategory =
    categories.some(c => c.key === category) ? category : (categories[0]?.key ?? 'triads');
  React.useEffect(() => {
    if (effectiveCategory !== category) setCategory(effectiveCategory);
  }, [effectiveCategory, category, setCategory]);

  const isChordQuality = tabKind(effectiveCategory) === 'chordQuality';
  const groupedSections = groupsByCat[effectiveCategory] ?? [];

  // Accordion: items collapsed by default so only opened ones build their diagrams
  // (keeps scrolling smooth + the list short). Category/instrument change collapses all.
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  // Sub-category (family) tab within the voicing tab — reset to the first when the tab changes.
  const [familyIdx, setFamilyIdx] = React.useState(0);
  // Floating section header — our own replacement for native stickyHeaderIndices (which renders
  // differently on web vs phone). Holds the OPEN item whose diagrams are currently scrolled under the
  // top of the list; driven by scroll position + measured item layouts → identical on both platforms.
  const [floatingKey, setFloatingKey] = React.useState<string | null>(null);
  const floatingKeyRef = React.useRef<string | null>(null);          // mirror of floatingKey, to dedupe scroll updates
  const itemLayouts = React.useRef<Record<string, { top?: number; bottom?: number }>>({}); // per item: header top + content bottom (content-coords)
  React.useEffect(() => { setExpanded(new Set()); setFamilyIdx(0); setFloatingKey(null); floatingKeyRef.current = null; }, [effectiveCategory, instrument]);

  // For the ACTIVE category: option count per item (header chip + to hide empty items) and the
  // number of items that actually HAVE voicings per family (the family-tab chip, and to hide an
  // empty family). Data only via the module-memoized builders — no SVG render, no scroll lag.
  const { itemCounts, familyAvailItems } = React.useMemo(() => {
    const perItem: Record<string, number> = {};
    const availItems = groupedSections.map(g => {
      let n = 0;
      for (const item of g.items) {
        const built = effectiveAllRoots
          ? getDictionaryVoicingsAllRoots(effectiveCategory, instrument, item.key, octave, selectedScaleId)
          : getDictionaryVoicings(effectiveCategory, instrument, rootSemi, item.key, octave, selectedScaleId);
        perItem[item.key] = built.length;
        if (built.length > 0) n++;
      }
      return n;
    });
    return { itemCounts: perItem, familyAvailItems: availItems };
  }, [groupedSections, effectiveCategory, instrument, rootSemi, effectiveAllRoots, octave, selectedScaleId]);
  const familyCounts = itemCounts; // alias used by the item headers below
  // Active family = the stored one, unless it's empty for this root → fall to the first that isn't.
  const rawIdx = familyIdx < groupedSections.length ? familyIdx : 0;
  const fIdx = familyAvailItems[rawIdx] > 0 ? rawIdx : Math.max(0, familyAvailItems.findIndex(n => n > 0));
  const activeGroup = groupedSections[fIdx];
  // Items shown for this root (empties hidden so header counts match what's rendered).
  const visibleItems = (activeGroup?.items ?? []).filter(i => itemCounts[i.key] > 0);
  const toggleSection = React.useCallback((key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  // Tap a "Comp with"/"Solo with" chip → load that chord at the dictionary's current root on the
  // Chord screen (switch Explore out of Dictionary mode). Closes the explore loop.
  const openChord = React.useCallback((type: string, voicingKey?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopAudio?.();
    setChord(rootSemi, type);
    setPendingVoicingTab(effectiveCategory);    // land on the same voicing tab we were browsing
    setPendingVoicingKey(voicingKey ?? null);   // …and on the same voicing (combo pc-key) when known
    setMode('chord');
  }, [stopAudio, setChord, setPendingVoicingTab, setPendingVoicingKey, setMode, rootSemi, effectiveCategory]);

  // One section header — rendered both in the scrolling list (measured via onLayout) and as the
  // floating copy pinned at the top. `floating` skips onLayout (its position is fixed); the chevron
  // points up for an open item either way.
  const renderHeader = (item: any, open: boolean, floating: boolean) => (
    <TouchableOpacity
      key={floating ? `fh-${item.key}` : `h-${item.key}`}
      activeOpacity={0.7}
      onPress={() => toggleSection(item.key)}
      onLayout={floating ? undefined : (e) => { const l = itemLayouts.current[item.key] || {}; l.top = e.nativeEvent.layout.y; itemLayouts.current[item.key] = l; }}
      style={[styles.sectionHeader, { backgroundColor: t.bg2, borderBottomColor: t.border }]}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.txt1 }}>{item.label}</Text>
        {!!item.sub && <Text style={{ fontSize: 11, fontWeight: '700', color: t.txt3 }}>{item.sub}</Text>}
        {familyCounts[item.key] > 0 && <CountChip count={familyCounts[item.key]} t={t} solid />}
      </View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.txt3} />
    </TouchableOpacity>
  );

  const handlePlay = React.useCallback((it: DictMiniItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopAudio?.();
    if (!it.playMidi || !it.playMidi.length) return;
    const arp = isArpFamily(effectiveCategory);
    const midi = arp ? Array.from(new Set(it.playMidi)).sort((a, b) => a - b) : it.playMidi;
    playChord(midi, { guitar: instrument === 'guitar', forceArp: arp, scale: effectiveCategory === 'scales' });
  }, [stopAudio, playChord, instrument, effectiveCategory]);

  // ── Bottom-dock root control: ‹ › stepper for quick nudges + a 12-circle root picker ──
  // <RootPicker> stays MOUNTED (hidden when closed) so opening only fires its slide-up animation.
  const [dialOpen, setDialOpen] = React.useState(false);
  React.useEffect(() => { setDialOpen(false); }, [instrument]); // close on instrument switch

  const pickRoot = React.useCallback((r: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopAudio?.();
    setAllRoots(false);
    setRootSemi(r);
  }, [stopAudio, setAllRoots, setRootSemi]);
  const nudgeRoot = (d: number) => pickRoot((((rootSemi + d) % 12) + 12) % 12);
  const closeDial = React.useCallback(() => setDialOpen(false), []);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* ── Voicing-type tabs (matches the chord screen's tab bar) ── */}
      <View style={[styles.chipBar, { backgroundColor: t.bg2, borderBottomColor: t.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
          {categories.map(c => {
            const isActive = effectiveCategory === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                activeOpacity={0.7}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCategory(c.key); }}
                style={[styles.catTab, isActive && { backgroundColor: t.accent }]}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: isActive ? '#fff' : t.txt3, includeFontPadding: false }}>{c.label}</Text>
                <CountChip count={categoryCounts[c.key] ?? 0} t={t} onAccent={isActive} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Family tabs: the sub-categories inside the selected voicing tab. Same text size as the
            category pills above (they sit one level down, above the chord items) but rendered as
            underline text-tabs (no pill fill) with the shared CountChip, so they read as SECONDARY
            to the filled voicing-type pills — one primary bar + one quiet bar, instead of two
            identical stacked rows. Empty families are hidden; shown only when ≥2 have chords. ── */}
      {familyAvailItems.filter(n => n > 0).length > 1 && (
        <View style={[styles.familyBar, { backgroundColor: t.bg, borderBottomColor: t.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 2 }}>
            {groupedSections.map((g, gi) => {
              if (familyAvailItems[gi] === 0) return null; // nothing here for this root → hide it
              const isActive = gi === fIdx;
              return (
                <TouchableOpacity
                  key={g.label}
                  activeOpacity={0.7}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFamilyIdx(gi); }}
                  style={[styles.familyTab, { borderBottomColor: isActive ? t.accent : 'transparent' }]}
                >
                  <Text style={[TYPE.body, { fontWeight: '700', color: isActive ? t.accent : t.txt3, includeFontPadding: false }]}>{g.label}</Text>
                  <CountChip count={familyAvailItems[gi]} t={t} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Collapsible sections + a FLOATING header. We don't use native stickyHeaderIndices (it
            renders differently web vs phone — lingering/clipping); instead we pin our own copy of the
            OPEN item's header at the top while its diagrams are scrolled under it, driven by scroll
            position + measured layouts. Same behaviour on both platforms. ── */}
      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          scrollEventThrottle={16}
          onScroll={(e) => {
            // Active floating item = the OPEN item whose [headerTop, contentBottom) range contains the
            // scroll offset (its real header is above the top, its diagrams not yet fully past).
            const y = e.nativeEvent.contentOffset.y;
            let active: string | null = null;
            for (const it of visibleItems) {
              if (!expanded.has(it.key)) continue;
              const lay = itemLayouts.current[it.key];
              if (lay && lay.top != null && lay.bottom != null && y >= lay.top && y < lay.bottom) { active = it.key; break; }
            }
            if (active !== floatingKeyRef.current) { floatingKeyRef.current = active; setFloatingKey(active); }
          }}
        >
          {visibleItems.length === 0 ? (
            <Text style={{ color: t.txt3, fontSize: 13, textAlign: 'center', marginTop: 32 }}>Nothing here for this root.</Text>
          ) : (
            visibleItems.flatMap(item => {
              const open = expanded.has(item.key);
              const header = renderHeader(item, open, false);
              if (!open) return [header];
              const foundInLabel = (tabKind(effectiveCategory) === 'scale' || effectiveCategory === 'shapes') ? 'Solo with' : 'Comp with';
              const content = (
                <View
                  key={`c-${item.key}`}
                  onLayout={(e) => { const l = itemLayouts.current[item.key] || {}; l.bottom = e.nativeEvent.layout.y + e.nativeEvent.layout.height; itemLayouts.current[item.key] = l; }}
                  style={{ borderBottomWidth: 1, borderBottomColor: t.border }}
                >
                  {/* "Comp with" (voicings) / "Solo with" (scales/shapes): the chords this item works for.
                      Each chip is tappable → loads that chord at the current root on the Chord screen. */}
                  {!!item.foundIn?.length && (
                    <View style={styles.foundInRow}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: t.txt3 }}>{foundInLabel}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 12 }}>
                        {item.foundIn.map((c: any) => (
                          <TouchableOpacity key={c.type} activeOpacity={0.7} onPress={() => openChord(c.type, tabKind(effectiveCategory) === 'formulaCombo' ? item.key : undefined)} style={{ backgroundColor: t.accent + '22', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: t.accent }}>{c.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  <DictSectionRow
                    itemKey={item.key}
                    isChordQuality={isChordQuality}
                    category={effectiveCategory}
                    instrument={instrument}
                    rootSemi={rootSemi}
                    allRoots={effectiveAllRoots}
                    octave={octave}
                    selectedScaleId={selectedScaleId}
                    labelMode={labelMode}
                    t={t}
                    onPlay={handlePlay}
                    L={L}
                  />
                </View>
              );
              return [header, content];
            })
          )}
        </ScrollView>
        {/* The floating header itself — only while an open item's diagrams sit under the top. */}
        {!!floatingKey && expanded.has(floatingKey) && (() => {
          const item = visibleItems.find(i => i.key === floatingKey);
          return item ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 }} pointerEvents="box-none">
              {renderHeader(item, true, true)}
            </View>
          ) : null;
        })()}
      </View>

      {/* ── Spin dial (slides up from behind the dock when the root chip is tapped) ── */}
      <RootPicker open={dialOpen} rootSemi={rootSemi} t={t} onPick={pickRoot} onClose={closeDial} />

      {/* ── Bottom dock: all-roots toggle · ‹ root › stepper · diagrams-per-row ── */}
      <View style={[styles.dock, { backgroundColor: t.bg, borderTopColor: t.border }]}>
        {instrument === 'guitar' && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); stopAudio?.(); setAllRoots(!effectiveAllRoots); }}
            style={[styles.dockIcon, { borderColor: effectiveAllRoots ? t.accent : t.border, backgroundColor: effectiveAllRoots ? t.accent : t.bg2 }]}
          >
            <Ionicons name="grid-outline" size={16} color={effectiveAllRoots ? '#fff' : t.txt3} />
            <Text style={{ fontSize: 11, fontWeight: '800', marginTop: 2, color: effectiveAllRoots ? '#fff' : t.txt2 }}>All</Text>
          </TouchableOpacity>
        )}
        {/* When "All" is active the root isn't used, so the stepper reads as inactive:
            neutral fill + dimmed glyphs instead of the themed accent. */}
        <View style={[styles.stepper, { backgroundColor: effectiveAllRoots ? t.bg2 : t.accent, borderWidth: effectiveAllRoots ? 1 : 0, borderColor: t.border }]}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => nudgeRoot(-1)} style={styles.stepArrow}><Ionicons name="chevron-back" size={24} color={effectiveAllRoots ? t.txt3 : '#fff'} /></TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setDialOpen(o => !o)} style={styles.stepCenter}>
            <Text style={{ color: effectiveAllRoots ? t.txt3 : '#fff', fontSize: 24, fontWeight: '800' }}>{rootName(rootSemi)}</Text>
            <Ionicons name={dialOpen ? 'chevron-down' : 'chevron-up'} size={16} color={effectiveAllRoots ? t.txt3 : 'rgba(255,255,255,0.85)'} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => nudgeRoot(1)} style={styles.stepArrow}><Ionicons name="chevron-forward" size={24} color={effectiveAllRoots ? t.txt3 : '#fff'} /></TouchableOpacity>
        </View>
        <View style={[styles.densitySeg, { borderColor: t.border }]}>
          {[1, 2, 3].map((n, i) => {
            const isActive = L.cols === n;
            const barW = (22 - (n - 1) * 2) / n;
            return (
              <TouchableOpacity
                key={n}
                activeOpacity={0.7}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCols(n); }}
                style={[styles.densitySegItem, { borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: t.border, backgroundColor: isActive ? t.accent : t.bg2 }]}
              >
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {Array.from({ length: n }).map((_, bi) => (
                    <View key={bi} style={{ width: barW, height: 20, borderRadius: 1.5, backgroundColor: isActive ? '#fff' : t.txt2 }} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipBar: { paddingVertical: 8, borderBottomWidth: 1 },
  catTab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 10, paddingHorizontal: 14 },
  // Family sub-tabs: quiet underline text-tabs, deliberately shorter + flatter than the catTab
  // pills above so the two bars read as a hierarchy (primary pills → secondary underline) not twins.
  familyBar: { borderBottomWidth: 1 },
  familyTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 2 },
  // width:100% so a DOCKED (sticky) header keeps spanning the full bar — otherwise the sticky wrapper
  // shrinks it to its content width and space-between pulls the chevron in next to the label.
  sectionHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: H_PAD, paddingVertical: 12, borderBottomWidth: 1 },
  // "Comp with" / "Solo with" row at the top of an expanded item: muted label + a horizontal scroller of
  // borderless soft chips (faint accent fill, accent text), one per chord quality. Slides instead of a
  // "+N more" cap, so every chord is reachable. Label stays fixed; the scroller takes the rest.
  foundInRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: H_PAD, paddingVertical: 8 },
  // Flat grid cell (no card): sharp corners, shared right/bottom 1px borders, content centred.
  cell: { alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderBottomWidth: 1, paddingVertical: 8, paddingHorizontal: 2, position: 'relative', overflow: 'hidden' },
  // Corner-label pill: flush to the cell corner, only the inner corner rounded (set per-anchor).
  cornerPill: { position: 'absolute', zIndex: 2, paddingHorizontal: 5, paddingVertical: 2 },
  cTL: { top: 0, left: 0, borderBottomRightRadius: 8 },
  cTR: { top: 0, right: 0, borderBottomLeftRadius: 8 },
  cBL: { bottom: 0, left: 0, borderTopRightRadius: 8 },
  cBR: { bottom: 0, right: 0, borderTopLeftRadius: 8 },
  // Bottom dock — sized to match the tuner/play/progression sticky players (56-tall controls).
  dock: { flexDirection: 'row', alignItems: 'stretch', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12, borderTopWidth: 1, zIndex: 6 },
  dockIcon: { width: 56, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 20, overflow: 'hidden' },
  stepArrow: { width: 36, height: 56, alignItems: 'center', justifyContent: 'center' },
  stepCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, paddingHorizontal: 6 },
  densitySeg: { flexDirection: 'row', borderWidth: 1, borderRadius: 20, overflow: 'hidden', height: 56 },
  densitySegItem: { width: 44, height: 56, alignItems: 'center', justifyContent: 'center' },
  // Root picker (12 circles, horizontal scroll)
  dialBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4 },
  dialWrap: {
    position: 'absolute', left: 0, right: 0, zIndex: 5, borderTopWidth: 1, borderBottomWidth: 1, paddingTop: 12, paddingBottom: 12,
  },
  dialRow: { flexDirection: 'row', alignItems: 'center', gap: DIAL_GAP, paddingHorizontal: 16 },
  // One root = a real circular button. Plain RN <Text>, flex-centred, no shadow/mask.
  rootCircle: { width: DIAL_CIRCLE, height: DIAL_CIRCLE, borderRadius: DIAL_CIRCLE / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // No includeFontPadding:false here — on Android it tightens the line box to the glyph's own extent,
  // and the taller ♯/♭ accidental glyphs then sit off-centre vs plain letters. Default padding centres
  // every root (plain or accidental) consistently in the circle.
  rootCircleText: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
});
