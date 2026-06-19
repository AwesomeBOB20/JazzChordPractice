import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions, Animated, Easing, Platform, InteractionManager, PixelRatio } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NOTE_SHARP, NOTE_FLAT, CH, CHORD_CATEGORIES } from '@shared/theory/musicTheory';
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
// An interval diagram has no chord of its own, so long-pressing it jumps to a RANDOM chord that
// contains that interval (the root + the interval are both chord tones → the chord's Intervals tab
// will show it). Iterates the full chord table, not the user's active set.
const ALL_TYPES: string[] = CHORD_CATEGORIES.flatMap((c: any) => c.keys);
function randomChordWithInterval(semitone: number): string | null {
  const semi = (((semitone % 12) + 12) % 12);
  const pool = ALL_TYPES.filter((ct) => {
    const def: any = (CH as any)[ct];
    return def && def.iv.some((iv: number) => ((((iv % 12) + 12) % 12)) === semi);
  });
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

const screenW = Dimensions.get('window').width;
const H_PAD = 12;
// Divider thickness. On Android's fractional-density screens (e.g. 2.75×) a 1-DP border is ~2.75
// physical px, which rounds to 2 or 3 px inconsistently (some dividers look darker/lighter). A single
// physical px (hairlineWidth) is uniform but, when a row's edge lands mid-pixel, splits ~50/50 across
// two pixel rows and can vanish entirely. TWO physical px is the sweet spot: a whole-pixel width so it
// never rounds unevenly, and thick enough that it always fully covers at least one pixel regardless of
// sub-pixel position — so every divider is present and identical. iOS/web render 1 DP crisply → keep 1.
const DIVIDER = Platform.OS === 'android' ? StyleSheet.hairlineWidth * 2 : 1;
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
  itemKey, isChordQuality, category, instrument, rootSemi, allRoots, octave, selectedScaleId, labelMode, t, onPlay, armedType, onCommit, onHold, armedDiagramKey, L,
}: {
  itemKey: string; isChordQuality: boolean; category: DictionaryCategory; instrument: 'piano' | 'guitar';
  rootSemi: number; allRoots: boolean; octave: number; selectedScaleId: string | null;
  labelMode: 'degrees' | 'notes' | 'none'; t: Theme;
  onPlay: (it: DictMiniItem) => void;
  // When a "Comp/Solo with" chip is armed for THIS item, armedType is its chord type and a diagram
  // tap commits (opens on the Chord screen) instead of playing a preview.
  armedType: string | null;
  onCommit: (it: DictMiniItem, type: string, itemKey: string) => void;
  // Long-press a diagram → the parent decides (open directly for named chords, prompt a chip for
  // combos/scales/shapes, or pop the chord picker for intervals). armedDiagramKey rings the held one.
  onHold: (it: DictMiniItem, itemKey: string) => void;
  armedDiagramKey: string | null;
  L: ReturnType<typeof layoutFor>;
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
  // Render the whole section's diagrams in one pass so they all appear together instead of streaming
  // in row by row. The data is already warm (the count memos built it), so this is just the SVG mount,
  // and it's bounded to the single expanded section, so the one-frame cost stays reasonable.
  const shown = items.length;
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
  // Round to a whole pixel so every cell in the row is exactly the same height — a fractional box
  // height lands the row's 1px bottom border on a sub-pixel boundary, making some row dividers render
  // thicker/sharper than others (the "rows have different border thicknesses" look).
  const boxH = instrument === 'piano'
    ? L.diagramH
    : Math.round(Math.min(MAX_BOX_H, Math.max(60, ...items.map(it => {
        const fp = miniChordFootprint(it.voicing, it.arpShape);
        return fp.h * Math.min(MAX_SCALE, innerW / fp.w);
      }))));
  // The diagrams streamed in so far, plus a spacer reserving the height of the rows still to mount so
  // the section (and the list below) doesn't jump while it fills. Cell height ≈ box + vertical padding.
  const shownItems = items.slice(0, shown);
  // Guitar cells get a fixed height snapped to a whole physical pixel so every grid row is identical
  // and its bottom divider lands crisply — same fix as the section headers. Piano keeps a caption, so
  // leave it content-sized. The inner diagram box centres within the fixed height.
  const guitarCellH = PixelRatio.roundToNearestPixel(boxH + (L.cornerFs + 9) * 2);
  const rowH = instrument === 'guitar' ? guitarCellH : boxH + 16 + Math.round(L.labelFs * 1.6);
  const pendingRows = Math.ceil(items.length / L.cols) - Math.ceil(shownItems.length / L.cols);
  const spacerH = Math.max(0, pendingRows * rowH);
  // Flat grid (no card panels) — cells tile the full width and share 1px borders, matching the
  // progression measure grid. The container draws the top + left edge; each cell draws its
  // right + bottom edge.
  // Each corner label sits in a pill anchored flush to that cell corner (only its inner corner is
  // rounded), echoing the old root ribbon. Root is accent-filled; the rest are subtle chips.
  const pill = (text: string | undefined, anchor: any, accent?: boolean) => !text ? null : (
    <View style={[styles.cornerPill, anchor, accent ? { backgroundColor: t.accent } : { backgroundColor: t.bg2 }]}>
      <Text numberOfLines={1} style={{ fontSize: L.cornerFs, fontWeight: accent ? '800' : '700', color: accent ? '#fff' : t.txt3, maxWidth: L.cellW * 0.5 }}>{text}</Text>
    </View>
  );
  // Formula corner: each degree coloured by its role colour (one nested <Text> per token). Falls back
  // to the plain muted pill if the item has no token list.
  const formulaPill = (tokens: string[] | undefined, fallback: string | undefined, anchor: any) => {
    if (!tokens || !tokens.length) return pill(fallback, anchor);
    return (
      <View style={[styles.cornerPill, anchor, { backgroundColor: t.bg2 }]}>
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderLeftWidth: DIVIDER, borderColor: t.border }}>
      {shownItems.map(it => {
        // Guitar cells carry four corner pills in place of the old caption; piano keeps its caption.
        const c = instrument === 'guitar' ? dictCorners(it, category, rootSemi, allRoots) : null;
        return (
          <TouchableOpacity
            key={it.key}
            activeOpacity={0.7}
            onPress={() => (armedType ? onCommit(it, armedType, itemKey) : onPlay(it))}
            onLongPress={() => onHold(it, itemKey)}
            delayLongPress={300}
            style={[styles.cell, { width: `${100 / L.cols}%`, borderColor: t.border, height: instrument === 'guitar' ? guitarCellH : undefined, paddingVertical: instrument === 'guitar' ? 0 : 8 }, armedDiagramKey === it.key ? { backgroundColor: t.accent + '26' } : armedType ? { backgroundColor: t.accent + '14' } : null]}
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
      {spacerH > 0 && <View style={{ width: '100%', height: spacerH }} />}
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
  const setPendingVoicing = useChordStore((s: any) => s.setPendingVoicing);
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
  // Closing a section visually collapses it instantly (clip to height 0), but the heavy unmount of its
  // SVG diagrams is deferred to idle (pendingUnmount) so the teardown never blocks the tap. Re-opening
  // before the unmount fires is instant (the diagrams are still mounted).
  const [pendingUnmount, setPendingUnmount] = React.useState<Set<string>>(new Set());
  const expandedRef = React.useRef(expanded);
  expandedRef.current = expanded;
  // Two-step "Comp/Solo with" flow: tapping a chip ARMS a chord (no nav yet); the next diagram tap
  // opens THAT chord on the Chord screen at the tapped grip/box. `armed` holds the item + chord type
  // it belongs to, so only that item's diagrams commit (others still play a preview). Cleared on any
  // context change (root/category/family/instrument/collapse) so a stale arm can't misfire.
  const [armed, setArmed] = React.useState<{ itemKey: string; type: string; label: string } | null>(null);
  // Reverse flow: long-press a diagram in a chip item (combo/scale/shape) to ARM that diagram, then
  // tap a chip to open it. `armedDiagram` is the held diagram. (Chip-less items jump on long-press —
  // named chords to their own chord, intervals to a random chord that has them — so no state needed.)
  const [armedDiagram, setArmedDiagram] = React.useState<{ itemKey: string; key: string; it: DictMiniItem } | null>(null);
  // Sub-category (family) tab within the voicing tab — reset to the first when the tab changes.
  const [familyIdx, setFamilyIdx] = React.useState(0);
  // Floating section header — our own replacement for native stickyHeaderIndices (which renders
  // differently web vs phone). For each OPEN item we render a copy pinned at the top, revealed/moved
  // by a NATIVE opacity + transform driven by the scroll offset — always mounted (no flicker), no JS
  // per-frame work. It fades in as the real header reaches the top, then slides up over the last
  // header-height as the next header rises into its place; the wrapper's overflow:hidden clips the
  // slide so it tucks UNDER the category/family bars instead of covering them.
  //
  // We store each section's measured HEIGHT (not its absolute top/bottom) and derive top/bottom by a
  // cumulative sum at render. A section's height only changes when IT opens/closes — and onLayout
  // always fires for a self-size change — whereas onLayout does NOT reliably refire when a section is
  // merely pushed down by a sibling above it expanding. Deriving positions from heights keeps every
  // section's top/bottom mutually consistent, so opening a 2nd dropdown can't leave a stale `top` that
  // makes a floating header appear while its real header is still on screen.
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const setItemHeight = React.useCallback((key: string, h: number) => setHeights(prev => prev[key] === h ? prev : ({ ...prev, [key]: h })), []);
  const headerHRef = React.useRef(40); // measured section-header height — drives the slide distance
  const scrollY = React.useRef(new Animated.Value(0)).current; // native-driven scroll offset
  React.useEffect(() => { setExpanded(new Set()); setPendingUnmount(new Set()); setFamilyIdx(0); setHeights({}); setArmed(null); setArmedDiagram(null); }, [effectiveCategory, instrument]);
  // Changing the root (or family) re-renders different grips/chords → any armed selection no longer
  // maps cleanly, so disarm.
  React.useEffect(() => { setArmed(null); setArmedDiagram(null); }, [rootSemi, familyIdx]);

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
    if (expandedRef.current.has(key)) {
      // Collapse: hide now (clip to 0), keep the diagrams mounted, and tear them down after the tap
      // interaction settles so the unmount never blocks the close.
      setArmed(prev => (prev?.itemKey === key ? null : prev)); // collapsing the armed item disarms it
      setArmedDiagram(prev => (prev?.itemKey === key ? null : prev));
      setExpanded(prev => { const n = new Set(prev); n.delete(key); return n; });
      setPendingUnmount(prev => { const n = new Set(prev); n.add(key); return n; });
      InteractionManager.runAfterInteractions(() =>
        setPendingUnmount(prev => { if (!prev.has(key)) return prev; const n = new Set(prev); n.delete(key); return n; }));
    } else {
      // Open: mount it, and cancel any pending unmount (re-opening before it fired → instant, no remount).
      setExpanded(prev => { const n = new Set(prev); n.add(key); return n; });
      setPendingUnmount(prev => { if (!prev.has(key)) return prev; const n = new Set(prev); n.delete(key); return n; });
    }
  }, []);
  // FORWARD STEP 1 — tap a "Comp with"/"Solo with" chip: arm that chord for this item (no nav yet).
  // Tapping the same chip again disarms; tapping a different one re-arms. Next diagram tap commits.
  const armChip = React.useCallback((itemKey: string, type: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setArmedDiagram(null);
    setArmed(prev => (prev?.itemKey === itemKey && prev?.type === type ? null : { itemKey, type, label }));
  }, []);
  // COMMIT — open `type` at the current root on the Chord screen, landing on this tab AND the exact
  // grip/box/subset the diagram represents. Used by BOTH directions (tap-chip-then-diagram,
  // long-press-then-chip) and the direct holds (block/open/barre/arps) + the interval picker.
  const commitToChord = React.useCallback((it: DictMiniItem, type: string, itemKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopAudio?.();
    const kind = tabKind(effectiveCategory);
    const pending: any = {};
    if (kind === 'formulaCombo') {
      pending.fingerprint = it.voicing?.fingerprint;   // guitar: exact grip
      pending.pcKey = itemKey;                          // piano: the combo pitch-class set key
    } else if (kind === 'scale') {
      pending.scaleId = itemKey;                        // the scale to select
      pending.boxName = it.arpShape?.boxName;           // guitar: the box (piano has none)
    } else if (kind === 'shape') {
      pending.scaleName = it.arpShape?.scaleName;       // matched by name across the two shape models
      pending.boxName = it.arpShape?.boxName;
    } else if (kind === 'interval') {
      pending.intervalSemitone = parseInt(itemKey.replace('iv-', ''), 10); // pick the matching subset
      pending.boxName = it.arpShape?.boxName;           // guitar (best-effort; interval builders differ)
    } else if (effectiveCategory === 'arps') {
      const si = parseInt(String(it.key).split('-')[1] ?? '0', 10); // "arps-<si>-<bi>" / "arps-<i>"
      if (!Number.isNaN(si)) pending.arpSubsetIdx = si;
      pending.boxName = it.arpShape?.boxName;           // guitar box (piano arp = the subset itself)
    } else if (effectiveCategory === 'block') {
      pending.notes = it.notes;                         // piano: the exact inversion
    } else { // open / barre
      pending.fingerprint = it.voicing?.fingerprint;
    }
    setChord(rootSemi, type);
    setPendingVoicingTab(effectiveCategory);
    setPendingVoicing(pending);
    setArmed(null);
    setArmedDiagram(null);
    setMode('chord');
  }, [stopAudio, setChord, setPendingVoicingTab, setPendingVoicing, setMode, rootSemi, effectiveCategory]);
  // LONG-PRESS a diagram. Items WITH chips (combo/scale/shape) arm the diagram + prompt a chip. Items
  // WITHOUT chips jump straight to the Chord screen: named chords (block/open/barre/arps) to their own
  // chord; an interval (which has no chord) to a RANDOM chord that contains it.
  const onHold = React.useCallback((it: DictMiniItem, itemKey: string) => {
    const kind = tabKind(effectiveCategory);
    const hasChips = kind === 'formulaCombo' || kind === 'scale' || kind === 'shape';
    if (hasChips) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      stopAudio?.();
      setArmed(null);
      setArmedDiagram({ itemKey, key: it.key, it });
    } else if (kind === 'interval') {
      const type = randomChordWithInterval(parseInt(itemKey.replace('iv-', ''), 10));
      if (type) commitToChord(it, type, itemKey); // open a random chord that has this interval
    } else {
      commitToChord(it, itemKey, itemKey); // block / open / barre / arps — the item IS the chord
    }
  }, [effectiveCategory, stopAudio, commitToChord]);

  // One section header — rendered both in the scrolling list and as the floating copy pinned at the
  // top. The in-list copy measures only the header HEIGHT (drives the slide distance); the section's
  // top/bottom come from the cumulative height sum, not from this header's position. `floating` skips
  // onLayout (its position is fixed); the chevron points up for an open item either way.
  const renderHeader = (item: any, open: boolean, floating: boolean) => (
    <TouchableOpacity
      key={floating ? `fh-${item.key}` : `h-${item.key}`}
      activeOpacity={0.7}
      onPress={() => toggleSection(item.key)}
      onLayout={floating ? undefined : (e) => { headerHRef.current = e.nativeEvent.layout.height; }}
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
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          {visibleItems.length === 0 ? (
            <Text style={{ color: t.txt3, fontSize: 13, textAlign: 'center', marginTop: 32 }}>Nothing here for this root.</Text>
          ) : (
            visibleItems.map(item => {
              const open = expanded.has(item.key);
              // Keep a just-closed section's diagrams mounted (clipped to 0) until the deferred unmount.
              const keepMounted = open || pendingUnmount.has(item.key);
              const header = renderHeader(item, open, false);
              const armedHere = armed?.itemKey === item.key ? armed : null;
              const diagArmedHere = armedDiagram?.itemKey === item.key ? armedDiagram : null;
              const foundInLabel = (tabKind(effectiveCategory) === 'scale' || effectiveCategory === 'shapes') ? 'Solo with' : 'Comp with';
              // Wrap header + content in one View and measure ITS height. This fires onLayout whenever
              // the section opens/closes (its own size changes) — the only thing the cumulative-sum
              // position model needs. Closed sections measure to the header height alone. A closing
              // section is clipped to height 0 (collapsed look) while its diagrams await teardown.
              const content = !keepMounted ? null : (
                <View
                  key={`c-${item.key}`}
                  style={{ height: open ? undefined : 0, overflow: 'hidden' }}
                >
                  {/* "Comp with" (voicings) / "Solo with" (scales/shapes): the chords this item works for.
                      Tap a chip to ARM that chord; the label switches to a prompt and the next diagram
                      tap opens it on the Chord screen at that exact grip/box. */}
                  {!!item.foundIn?.length && (
                    <View style={[styles.foundInRow, { borderBottomWidth: DIVIDER, borderBottomColor: t.border }]}>
                      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: (armedHere || diagArmedHere) ? t.accent : t.txt3 }}>
                        {diagArmedHere ? 'Pick a chord for this voicing' : armedHere ? `Tap a diagram for ${armedHere.label}` : foundInLabel}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 12 }}>
                        {item.foundIn.map((c: any) => {
                          const isArmed = armedHere?.type === c.type;
                          // While a diagram is held, every chip is a commit button (faint-strong fill to invite it).
                          const bg = isArmed ? t.accent : diagArmedHere ? t.accent + '33' : t.accent + '22';
                          return (
                            <TouchableOpacity
                              key={c.type}
                              activeOpacity={0.7}
                              onPress={() => (diagArmedHere ? commitToChord(diagArmedHere.it, c.type, item.key) : armChip(item.key, c.type, c.label))}
                              style={{ backgroundColor: bg, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: isArmed ? '800' : '600', color: isArmed ? '#fff' : t.accent }}>{c.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
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
                    armedType={armedHere?.type ?? null}
                    onCommit={commitToChord}
                    onHold={onHold}
                    armedDiagramKey={diagArmedHere?.key ?? null}
                    L={L}
                  />
                </View>
              );
              return (
                <View key={`sec-${item.key}`} onLayout={(e) => setItemHeight(item.key, Math.round(e.nativeEvent.layout.height))}>
                  {header}
                  {content}
                </View>
              );
            })
          )}
        </Animated.ScrollView>
        {/* One floating header per OPEN item, ALWAYS mounted (no mount flicker). Native opacity fades it
            in as the item's real header reaches the top; native translateY slides it up over the last
            header-height so the next header pushes it off. Clipped by the wrapper's overflow:hidden so
            it tucks under the bars above and never covers them. Items above sit at translateY -H (off,
            clipped); the item below is opacity 0 — so exactly one shows. */}
        {(() => {
          // Derive every section's top/bottom from the running height sum, in render order. Because all
          // positions come from one consistent pass, opening/closing any section can never leave another
          // with a stale top — the duplicate-floating-header bug.
          const H = headerHRef.current;
          let acc = 0;
          return visibleItems.map(item => {
            const top = acc;
            const h = heights[item.key] ?? H; // un-measured (just toggled) → assume collapsed for now
            const bottom = top + h;
            acc = bottom;
            if (!expanded.has(item.key)) return null;
            if (bottom - top <= H) return null; // header only, nothing to stick under
            // 1-px range: transition is sub-frame at any real scroll speed, so the switch is invisible.
            // At scrollY===top both real and floating headers sit at y=0 — they overlap perfectly and
            // the takeover reads as seamless rather than a pop or a fade.
            const opacity = scrollY.interpolate({ inputRange: [top - 1, top], outputRange: [0, 1], extrapolate: 'clamp' });
            const translateY = scrollY.interpolate({ inputRange: [bottom - H, bottom], outputRange: [0, -H], extrapolate: 'clamp' });
            return (
              <Animated.View key={`float-${item.key}`} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, opacity, transform: [{ translateY }] }} pointerEvents="box-none">
                {renderHeader(item, true, true)}
              </Animated.View>
            );
          });
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
  // Bottom border uses a full 1 DP (not the thin DIVIDER) to match the Explore toggle's borderBottom
  // directly above the voicing tabs — so the bar reads as framed by two identical lines.
  chipBar: { paddingVertical: 6, borderBottomWidth: 1 },
  catTab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, paddingHorizontal: 14 },
  // Family sub-tabs: quiet underline text-tabs, deliberately shorter + flatter than the catTab
  // pills above so the two bars read as a hierarchy (primary pills → secondary underline) not twins.
  familyBar: { borderBottomWidth: DIVIDER },
  familyTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 2 },
  // width:100% so a DOCKED (sticky) header keeps spanning the full bar — otherwise the sticky wrapper
  // shrinks it to its content width and space-between pulls the chevron in next to the label.
  // Fixed height snapped to a whole physical pixel so every row is identical and its bottom divider
  // lands on a pixel boundary — a fractional row height makes consecutive dividers alternate
  // crisp/straddled (thick/thin) on Android. Content stays vertically centred via alignItems:'center'.
  sectionHeader: { width: '100%', height: PixelRatio.roundToNearestPixel(44), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: H_PAD, borderBottomWidth: DIVIDER },
  // "Comp with" / "Solo with" row at the top of an expanded item: muted label + a horizontal scroller of
  // borderless soft chips (faint accent fill, accent text), one per chord quality. Slides instead of a
  // "+N more" cap, so every chord is reachable. Label stays fixed; the scroller takes the rest.
  foundInRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: H_PAD, paddingVertical: 8 },
  // Flat grid cell (no card): sharp corners, shared right/bottom 1px borders, content centred.
  cell: { alignItems: 'center', justifyContent: 'center', borderRightWidth: DIVIDER, borderBottomWidth: DIVIDER, paddingVertical: 8, paddingHorizontal: 2, position: 'relative', overflow: 'hidden' },
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
