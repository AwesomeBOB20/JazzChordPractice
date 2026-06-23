import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Animated, Dimensions, Share, TextInput, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { familyForWeight } from '@shared/fonts/fonts';
import { useProgressionStore, DEFAULT_SONGS } from '@features/progression/store/progressionStore';
import { useQuizStore } from '@features/quiz/store/quizStore';
import { useChordStore } from '@features/play/store/chordStore';
import { useDictionaryStore } from '@features/play/store/dictionaryStore';
import { THEMES, ROLE_COLORS_GLOBAL } from '@shared/ui/themes';
import { TYPE, FONT_WEIGHT } from '@shared/ui/typography';
import { SharedSettingsPanel } from '@shared/ui';
import { PopUpModal } from '@shared/ui/SharedModals';
import { restorePro, devSetPro } from '@features/pro/purchases';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Themes free on every tier (one light, one dark). The rest are Pro.
const FREE_THEMES = new Set(['light', 'dark']);

// Inline help icons render on the text baseline, which sits them too high — and
// react-native-web silently drops `verticalAlign`, so that alone doesn't move them.
// Relative positioning DOES apply to inline elements (unlike transforms, which inline
// text drops), so nudge the glyph down a couple px to sit on the 14px / 19px text line.
// `verticalAlign: 'bottom'` is kept for native, where it is honored.
// Inline icons sit centered on the text line (was 'bottom', which rode high above the words).
const INLINE_ICON_STYLE = { verticalAlign: 'middle' } as const;

// ── Help & Tutorial content ───────────────────────────────────────────────────
// Static guide text shown in the collapsible Help card. Kept module-level (no theme
// refs) so it's a single source of truth; colors/rendering happen in the component.
type HelpIcon = { ic: string; lib?: 'mci' };       // inline icon token; default family is Ionicons
type HelpTimeSig = { ts: [number, number] };       // inline stacked time signature (e.g. 3 over 4)
type HelpBars = { bars: number };                  // inline column-count bars (the Dictionary density buttons)
type HelpSeg = string | HelpIcon | HelpTimeSig | HelpBars; // a run of body text and/or inline glyphs
type HelpBody = string | HelpSeg[];                // one paragraph's or bullet's content
// A block is either a lead paragraph (`t`, no heading) or a headed, collapsible bullet
// list (`h` + `b`). `legend` renders the note-role color key inside that topic.
// `sub` marks a non-collapsible sub-group header (e.g. "Chord" / "Dictionary") that splits a
// section's topics into labelled lists.
type HelpPara = { h?: string; t?: HelpBody; b?: HelpBody[]; legend?: boolean; sub?: string };
type HelpSection = { key: string; icon: string; lib?: 'mci'; title: string; paras: HelpPara[] };
const I = (ic: string, lib?: 'mci'): HelpIcon => ({ ic, lib }); // shorthand for an inline icon
const TS = (n: number, d: number): HelpTimeSig => ({ ts: [n, d] }); // shorthand for a time signature
const BARS = (n: number): HelpBars => ({ bars: n }); // shorthand for the Dictionary density button glyph

// Small stacked time signature, matching the one drawn on the Song-screen grid (serif, accent).
const TimeSig = ({ n, d, color }: { n: number; d: number; color: string }) => {
  const glyph = { fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 10, fontWeight: 'bold' as const, color, lineHeight: 10 };
  return (
    <View style={{ alignItems: 'center', marginHorizontal: 2 }}>
      <Text style={glyph}>{n}</Text>
      <Text style={glyph}>{d}</Text>
    </View>
  );
};

// N vertical bars depicting a column count — mirrors the Dictionary "diagrams per row" buttons.
const Bars = ({ n, color }: { n: number; color: string }) => {
  const barW = (15 - (n - 1) * 2) / n;
  return (
    <View style={{ flexDirection: 'row', gap: 2, marginHorizontal: 3, alignItems: 'center' }}>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={{ width: barW, height: 13, borderRadius: 1.5, backgroundColor: color }} />
      ))}
    </View>
  );
};

const HELP_SECTIONS: HelpSection[] = [
  {
    key: 'overview', icon: 'sparkles-outline', title: 'Overview',
    paras: [
      { t: 'Learn jazz chords and progressions on piano and guitar — look them up, hear them, play along.' },
      { h: 'The Main Idea', b: [
        'A "voicing" is one way to arrange a chord\'s notes.',
        'Most of the app is seeing, hearing, and choosing voicings.',
      ] },
      { h: 'Screens (bottom tabs)', b: [
        [I('compass-outline'), ' Explore — study one chord, or browse the Dictionary.'],
        [I('musical-notes-outline'), ' Song — build and play a progression.'],
        [I('puzzle-outline', 'mci'), ' Quiz — test yourself by sight and ear.'],
        [I('guitar-pick-outline', 'mci'), ' Tuner — tune your instrument.'],
      ] },
      { h: 'Top Bar (every screen)', b: [
        ['Switch ', I('piano', 'mci'), ' Piano / ', I('guitar-acoustic', 'mci'), ' Guitar.'],
        [I('music-note-quarter', 'mci'), ' Block vs ', I('musical-notes'), ' Arpeggio playback.'],
        [I('metronome', 'mci'), ' Tap the tempo to set BPM.'],
        ['Open ', I('settings-outline'), ' Settings — display and audio.'],
      ] },
    ],
  },
  {
    key: 'play', icon: 'compass-outline', title: 'Explore Screen',
    paras: [
      { t: 'Pick any chord and see every way to play it.' },
      { h: 'Two Ways to Browse', b: [
        ['Top toggle: ', I('albums-outline'), ' Chord or ', I('book-outline'), ' Dictionary.'],
        'Chord — one chord on a big diagram to study and drill.',
        'Dictionary — a reference grid of every voicing, scale, and shape.',
      ] },
      { sub: 'Chord' },
      { h: 'Chord Card', b: [
        'The card (left of the top band) is the current chord; the colored dots are its notes (or the scale / arp / interval currently on screen).',
        'The top ‹ › stepper changes the root (C, F…); the ‹ › stepper below it changes the quality (maj7, m7…). Swiping the card also changes the root.',
        ['Use the ', I('play'), ' Play button to hear it; tap an individual dot to hear just that note.'],
      ] },
      { h: 'Voicing Tabs', b: [
        'Tabs under the chord switch voicing families.',
        'Triads (3-note), Shells (essential notes), Drop 2/3/2&4 (wider), Open and Barre (guitar shapes), plus Scales, Arpeggios, Intervals.',
        'Each badge counts how many were found.',
        'Available tabs depend on Piano vs Guitar.',
      ] },
      { h: 'Choosing a Voicing', b: [
        'Beside the card, stacked navigators step through your options with ‹ ›.',
        'CHORD picks which chord to voice — the plain 7th or the full extension (e.g. C7 vs C13♯9), or a triad inside the chord. POSITION / STRING SET sets where it sits on the neck; VOICING picks the exact shape.',
        'Piano and guitar both work this way.',
      ] },
      { h: 'Hear Any Note', b: [
        'Tap any dot, piano key, or fret to play that note.',
        'Press several at once to pick a voicing apart.',
      ] },
      { h: 'Display Options (below the diagram)', b: [
        [I('repeat'), ' Hold keeps the chord ringing.'],
        [I('map'), ' Map (Pro) slides up a whole-neck / whole-keyboard view of where the current voicing sits.'],
        [I('filter'), ' Order re-sorts the voicings.'],
        [I('eye-outline'), ' Scale overlays a fitting scale to solo with; long-press (or double-tap) it to pick which scale.'],
      ] },
      { h: 'Random or Manual (bottom row)', b: [
        [I('dice'), ' Random jumps to a chord from a pool you set with the ', I('layers'), ' pool button.'],
        ['Switch to Manual to pick a chord by hand (dice becomes ', I('create'), ' Edit Chord).'],
        [I('play'), ' Plays the current chord.'],
      ] },
      { sub: 'Dictionary' },
      { h: 'Browse Everything', b: [
        'Top tabs pick what to show; a family row narrows tabs with sub-groups. Each badge counts matches for the root.',
        'Tap a row ("Maj 7", "Major") to open its diagrams; tap a diagram to hear it.',
        'Rootless voicings and scales list the chords they fit ("Comp with" / "Solo with"). Tap a chip, then a diagram, to open it on the Chord screen.',
        'Or long-press a diagram to open it on the Chord screen (you may be asked to pick a chord first).',
        ['The ', BARS(2), ' button cycles 1 / 2 / 3 diagrams per row.'],
      ] },
      { h: 'Picking the Root', b: [
        'Tap the root button for a strip of 12 roots — tap one to jump.',
        [I('grid-outline'), ' All (guitar) shows every shape across all 12 roots once, drawn at the lowest fret and labelled ANY — for learning movable shapes.'],
      ] },
      { h: 'The Four Corner Labels', b: [
        'Each guitar diagram tags its corners.',
        'Top-left — the root, or ANY for movable shapes.',
        'Top-right — the string set (4-3-2-1) for Triads/Shells/Drops, or the shape name ("Box 3 (C Shape)") for Arps/Scales/Shapes.',
        'Bottom-left — the formula (e.g. 1 3 5 7).',
        'Bottom-right — the bass note ("Root in bass", "3rd in bass"…).',
      ] },
      { h: 'Compare Mode', b: [
        'Guitar only. In Triads, Shells, Drop 2 / 3 / 2&4, tap STRINGS in the dock to pick a string set (Shells split by bass string — E, A or D bass). The grid then lays every chord quality on that set side by side, grouped by inversion and ordered so one note slides at a time: maj7 → 7 → m7 → m7♭5 → dim7.',
        'In Scales, Arps, Intervals and Shapes the button becomes BOX — pick Box 1–5 to compare every scale / arpeggio / interval / shape in that CAGED position up the neck.',
        'Tap a section row to open or close it. With All on, the shapes are drawn at the lowest fret and labelled ANY.',
      ] },
    ],
  },
  {
    key: 'song', icon: 'musical-notes-outline', title: 'Song Screen',
    paras: [
      { t: 'Build a chord progression and play it back with a band — comping, bass, and a metronome.' },
      { h: 'The Grid', b: [
        'Each cell is one measure — tap to select, hear it, and load that exact chord + voicing into the Explore screen.',
        'Long-press or double-tap a cell to edit it.',
      ] },
      { h: 'The Cell Editor', b: [
        'Opens when you select or long-press a cell.',
        'Set the chord for that bar.',
        'SPLIT divides the bar into two chords; MERGE undoes it.',
      ] },
      { h: 'The Toolbar', b: [
        [I('lead-pencil', 'mci'), ' / ', I('grid-outline'), ' / ', I('musical-notes'), ' View — cycle bars: NAME, CHORDS, ARPS.'],
        'ZONE — where voicings sit (a fret area or register); − / + or AUTO.',
        'Voice Lead — how voicings move chord-to-chord: Zone, Bounce, Up / Down, or off.',
        'VOICING — force one family (AUTO, Open, Barre, Triads, Drop 2 / 3, Shells).',
        'STRINGS — pin Triads/Shells/Drops to one string set.',
        ['Time signature — set the selected bar\'s beats, like ', TS(3, 4), '.'],
        'Transpose (♭ / ♯) and Key shift the whole song.',
        [I('add'), ' / ', I('remove'), ' add or remove measures; ', I('return-down-forward-outline'), ' indents a bar to the next row.'],
      ] },
      { h: 'Chart Marks', b: [
        'Repeat signs (𝄆 𝄇) loop a section.',
        '1st/2nd endings — bars played on specific passes.',
        'Letters (A, B…) label sections.',
      ] },
      { h: 'Bottom Dock', b: [
        'Set the tempo, the feel (Straight, Swing, Bossa, Two-Step, Reggae), and toggle bass and metronome.',
        [I('options-outline'), ' Mix sets volumes.'],
        [I('repeat'), ' Loop replays until you stop.'],
        ['Press ', I('play'), ' for a count-in, then the song plays.'],
        'Tap a bar ahead while playing to jump there.',
      ] },
      { h: 'Saving', b: [
        [I('save-outline'), ' Save stores the song with its tempo and feel.'],
        [I('library-outline'), ' Library opens your saved songs; sort into folders.'],
        'Back up or restore from Settings → Data Management.',
      ] },
    ],
  },
  {
    key: 'quiz', icon: 'puzzle-outline', lib: 'mci', title: 'Quiz Screen',
    paras: [
      { t: 'Test how well you know chords by sight and ear.' },
      { h: 'Visual or Audio', b: [
        ['Toggle ', I('eye'), ' / ', I('ear'), ' in the top bar.'],
        'Visual — name a chord from its diagram.',
        'Audio — name a chord you hear.',
      ] },
      { h: 'Choose What to Practice', b: [
        [I('layers'), ' Open the setup sheet to focus the quiz.'],
        'The Chords and Voicings tabs set which chord types, inversions, and voicing families appear.',
        'You might name a chord, scale, arpeggio, interval, or shape.',
        'Set the instrument in the top bar.',
      ] },
      { h: 'Answering', b: [
        ['Tap an answer, then ', I('arrow-forward'), ' Next.'],
        'Green = right, red = wrong, and the chord plays.',
        'Not sure? Reveal shows the answer (counts as a miss).',
        ['Score, streak, and accuracy track up top; ', I('refresh'), ' resets them.'],
      ] },
      { h: 'While You Listen (Audio)', b: [
        'The chord hides behind a big ? while it plays.',
        [I('headset-outline'), ' Bars pulse with the sound so you feel its shape.'],
      ] },
      { h: 'The Reveal (Audio)', b: [
        'Answering turns the bars into an anatomy strip: one dot per note, its degree below (R, 3, 5…), the interval above.',
        'Tap a dot to replay that note.',
      ] },
    ],
  },
  {
    key: 'tuner', icon: 'guitar-pick-outline', lib: 'mci', title: 'Tuner Screen',
    paras: [
      { t: 'Tune by microphone or by ear.' },
      { h: 'Listen', b: [
        [I('mic'), ' On Android, the mic shows the note you play and whether you\'re sharp or flat.'],
        'Measured in cents (hundredths of a step); 0 is in tune.',
        'On other devices, use Play to tune by ear.',
      ] },
      { h: 'Play', b: [
        [I('volume-high'), ' Tap a string to sound its pitch; tap again to stop.'],
        [I('options'), ' Open the tuning popup to pick the reference sound — E-Piano, Bell, Music Box, Marimba, or Glass.'],
      ] },
      { h: 'Setup', b: [
        [I('options'), ' Tunings: Standard, Drop D, ½ Step Down, Open G, DADGAD.'],
        'Reference pitch (A=432/440/512) is in Settings → Audio; 440 is standard.',
      ] },
    ],
  },
  {
    key: 'reading', icon: 'color-palette-outline', title: 'Reading the Diagrams',
    paras: [
      { t: 'How to read the diagrams throughout the app.' },
      { h: 'Note Shapes', b: [
        'Root = square, every other note = circle — spot the root at a glance.',
      ] },
      { h: 'Colors (Note Color in Settings → Display)', legend: true, b: [
        'Roles — one color per role (see legend below).',
        'Theme — all one color.',
        'Selective — only the chord tones you choose.',
      ] },
      { h: 'Labels', b: [
        'Show note names, degrees (1, ♭3, 5…), or nothing — Settings → Display.',
      ] },
      { h: 'Position & Box Shapes', b: [
        'A number left of a guitar diagram is its starting fret.',
        '"Box 1 (E Shape)" names a CAGED position — one of the five places a shape lives along the neck.',
      ] },
      { h: 'The Position Map', b: [
        [I('map'), ' Map (next to Hold in the bottom bar) slides up a strip showing the whole neck or keyboard, with the current voicing’s notes lit so you can see where it sits.'],
        ['A ', I('lock-closed'), ' Pro feature.'],
      ] },
      { h: 'Voicing Types', b: [
        'Triads — basic 3-note chords.',
        'Shells — just root, 3rd, 7th.',
        'Drop 2 / 3 / 2 & 4 — drop the top one or two notes an octave for wider, guitar-friendly shapes.',
        'String set — which adjacent guitar strings a shape uses.',
      ] },
      { h: 'Chord Symbols', b: [
        'maj7 = major 7th, m7 = minor 7th, 7 = dominant 7th.',
        'ø7 = half-diminished, °7 = diminished.',
        '9, 11, 13 = extensions — color notes stacked on top.',
      ] },
    ],
  },
  {
    key: 'settings', icon: 'options-outline', title: 'Settings',
    paras: [
      { t: ['Open Settings from the ', I('settings-outline'), ' gear. Changes apply everywhere, instantly.'] },
      { h: 'Look & Feel', b: [
        [I('color-palette-outline'), ' App Theme — light or dark.'],
        'Font — the typeface on labels and diagrams.',
      ] },
      { h: 'Display', b: [
        'Accidentals — flats (♭) or sharps (♯).',
        'Labels — note names, degrees (1, ♭3, 5…), or nothing.',
        'Octave numbers — C4 instead of C.',
        'Note Color — Roles (per degree), Theme (one color), or Selective (only the degrees you pick).',
      ] },
      { h: 'Audio', b: [
        'Instrument — Piano or Guitar.',
        'Octave — how high or low notes sound.',
        'Tuning (A=) — 432, 440 (standard), or 512 Hz.',
      ] },
      { h: 'Your Data', b: [
        [I('share-outline'), ' Export Progressions Backup bundles all your saved songs into a JSON backup file and opens the share sheet — save it to Files or send it to yourself.'],
        'That file is your only copy of your songs outside the app, so keep it somewhere safe on your device — if you delete the app or switch phones, it\'s how you get your songs back.',
        [I('download-outline'), ' Import Progressions Backup loads them back: open your saved backup file, copy its text, paste it in, and tap Import — all your songs reappear.'],
        'Clear Stored Progress — wipes quiz scores and the working progression (saved songs stay).',
        'Restore Default Settings — resets preferences (songs and scores stay).',
      ] },
    ],
  },
  {
    key: 'pro', icon: 'crown', lib: 'mci', title: 'Kordal Pro',
    paras: [
      { t: 'Kordal is free to learn on. One unlock (no subscription) adds the deeper tools — pay once, keep forever; Restore Purchase recovers it on a new device.' },
      { h: 'Free, always', b: [
        ['Explore on ', I('piano', 'mci'), ' piano and ', I('guitar-acoustic', 'mci'), ' guitar — Block, Open, Barre, Triads, Scales.'],
        'Essential chords — every triad, 6th, and the five core 7ths (maj7, min7, dom7, m7♭5, dim7).',
        'Build and play progressions — metronome, loop, and the free preset songs.',
        [I('puzzle-outline', 'mci'), ' Chord quiz (root position) in ', I('eye'), ' Visual and ', I('ear'), ' Listen modes, and the ', I('guitar-pick-outline', 'mci'), ' tuner in standard tuning.'],
        'Light and Dark themes, all fonts, the mixer.',
      ] },
      { h: 'What Pro unlocks', b: [
        [I('book-outline'), ' Dictionary mode — every chord, scale, arpeggio, and interval by root.'],
        'Extended & altered chords — 9ths, 11ths, 13ths, altered dominants, add9s, exotic 7ths.',
        'Scale overlay and List/Voicing order in Explore.',
        [I('map'), ' The position Map — pop up the whole neck or keyboard to see where the current voicing sits.'],
        ['Advanced voicings — Drop 2, Drop 3, Drop 2 & 4, Shells, Arpeggios, Intervals, Shapes (', I('lock-closed'), ' tabs).'],
        'Progression power tools — transpose, key change, neck/piano zones, swing & bossa feels, Pro preset songs.',
        [I('ear'), ' All quiz categories — the Voicings quiz (scales, arpeggios, intervals, shapes) and inversions. Chord & Listen are free.'],
        'Tuner — alternate tunings and a custom reference pitch (432/512 Hz).',
        'Save your own songs (unlimited) and every theme.',
      ] },
      { h: 'How to unlock', b: [
        ['Tap any ', I('lock-closed'), ', or ', I('settings-outline'), ' Settings → Kordal Pro → Unlock.'],
        'Already bought it? Use Restore Purchase in the Kordal Pro card.',
      ] },
    ],
  },
];

const ROLE_LEGEND: { label: string; color: string }[] = [
  { label: 'Root', color: ROLE_COLORS_GLOBAL['root'] },
  { label: '3rd', color: ROLE_COLORS_GLOBAL['3'] },
  { label: '5th', color: ROLE_COLORS_GLOBAL['5'] },
  { label: '7th', color: ROLE_COLORS_GLOBAL['7'] },
  { label: '2 / 9', color: ROLE_COLORS_GLOBAL['2'] },
  { label: '4 / 11', color: ROLE_COLORS_GLOBAL['4'] },
  { label: '6 / 13', color: ROLE_COLORS_GLOBAL['6'] },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, setTheme, factoryReset, isSettingsOpen, setIsSettingsOpen, setIsTutorialOpen, fontFamily, isPro, openPaywall } = useSettingsStore();
  const { clearProgression } = useProgressionStore();
  const { resetQuiz } = useQuizStore();

  const t = THEMES[theme];
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  // Render a help body (plain text and/or inline icons) as children of a <Text>. Time-signature
  // segments can't live inside a <Text> (see the bullet row path); fall back to "n/d" text if one
  // ever reaches here.
  const renderBody = (body: HelpBody) =>
    (typeof body === 'string' ? [body] : body).map((seg, si) =>
      typeof seg === 'string'
        ? seg
        : 'ts' in seg
          ? `${seg.ts[0]}/${seg.ts[1]}`
          : 'bars' in seg
            ? `${seg.bars}`
            : seg.lib === 'mci'
              ? <MaterialCommunityIcons key={si} name={seg.ic as any} size={15} color={t.txt1} style={INLINE_ICON_STYLE} />
              : <Ionicons key={si} name={seg.ic as any} size={15} color={t.txt1} style={INLINE_ICON_STYLE} />
    );

  // Calculate the exact height of your TabNavigator tab bar
  const TAB_BAR_HEIGHT = 60 + insets.bottom;

  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [openHelp, setOpenHelp] = useState<string | null>(null); // expanded Help section (outer accordion)
  const [openTopics, setOpenTopics] = useState<Set<string>>(new Set()); // expanded sub-topics (inner accordion)
  const toggleTopic = (key: string) => setOpenTopics(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const handleExport = async () => {
    try {
      const songs = useProgressionStore.getState().savedSongs;
      const json = JSON.stringify(songs);
      await Share.share({ message: json, title: 'Jazz Progression Backup' });
    } catch (error) {
      Alert.alert("Export Failed", "Could not export songs.");
    }
  };

  const handleImport = () => {
    try {
      if (!importText.trim()) return;
      const parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) {
        useProgressionStore.getState().importSongs(parsed);
        setIsImportModalVisible(false);
        setImportText('');
        Alert.alert("Success", `Imported ${parsed.length} songs successfully!`);
      } else {
        Alert.alert("Invalid Data", "The pasted text is not a valid backup.");
      }
    } catch (error) {
      Alert.alert("Error", "Could not parse the pasted text.");
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        stiffness: 250,
        mass: 0.8
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_WIDTH,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isSettingsOpen]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 10 }} pointerEvents="box-none">
      <Animated.View style={[
        styles.container, 
        { 
          backgroundColor: t.bg,
          transform: [{ translateX: slideAnim }],
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: TAB_BAR_HEIGHT, // Docks perfectly above the tab bar
        }
      ]}>
      
      {/* Local Header for Navigation - Pushed down by safe area insets */}
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
        <TouchableOpacity onPress={() => setIsSettingsOpen(false)} style={styles.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Ionicons name="chevron-back" size={28} color={t.txt1} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.txt1 }]}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Pro status / unlock */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <MaterialCommunityIcons name="crown" size={14} color={t.accent} />
            <Text style={[styles.sectionLabel, { color: t.accent, marginBottom: 0 }]}>KORDAL PRO</Text>
          </View>
          {isPro ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
              <MaterialCommunityIcons name="check-circle" size={22} color={t.accent} />
              <Text style={{ flex: 1, color: t.txt1, fontSize: 15, fontWeight: '700' }}>Pro unlocked — thank you!</Text>
            </View>
          ) : (
            <>
              <Text style={{ color: t.txt2, fontSize: 13, marginBottom: 12, lineHeight: 18 }}>
                The Dictionary, advanced voicings, progression tools and more — one purchase, yours forever.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                style={{ height: 46, borderRadius: 14, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => openPaywall('generic')}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 }}>Unlock Kordal Pro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ marginTop: 10, alignItems: 'center', paddingVertical: 4 }}
                onPress={async () => {
                  const res = await restorePro();
                  Alert.alert(res.success ? 'Restored' : 'Nothing to restore', res.success ? 'Your Kordal Pro unlock has been restored.' : (res.error ?? 'No previous purchase was found.'));
                }}>
                <Text style={{ color: t.txt2, fontSize: 13, fontWeight: '600' }}>Restore purchase</Text>
              </TouchableOpacity>
            </>
          )}
          {/* DEV-ONLY toggle: exercise Pro before RevenueCat is wired. Remove (or hide
              behind __DEV__) when the real purchase flow ships. */}
          {__DEV__ && (
            <TouchableOpacity
              style={{ marginTop: 12, alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.border }}
              onPress={() => devSetPro(!isPro)}>
              <Text style={{ color: t.txt3, fontSize: 12, fontWeight: '600' }}>{isPro ? '(dev) Lock Pro' : '(dev) Unlock Pro for testing'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* App Theme Picker */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.accent }]}>APP THEME</Text>
          <View style={styles.themeRow}>
            {Object.entries(THEMES).map(([key, th]) => {
              const locked = !FREE_THEMES.has(key) && !isPro;
              return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.7}
                style={[
                  styles.themeCircle,
                  { borderColor: theme === key ? t.txt1 : 'transparent' }
                ]}
                onPress={() => locked ? openPaywall('themes') : setTheme(key)}>
                <View style={[styles.themeCircleInner, { backgroundColor: th.bg, opacity: locked ? 0.5 : 1 }]}>
                  <View style={[styles.themeCircleHalf, { backgroundColor: th.accent }]} />
                  {locked && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="lock-closed" size={12} color={th.txt1} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* The Tabbed Preferences Panel */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.accent }]}>GLOBAL PREFERENCES</Text>
          <SharedSettingsPanel />
        </View>

        {/* Help & Tutorial */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.accent }]}>HELP & TUTORIAL</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { setIsSettingsOpen(false); setIsTutorialOpen(true); }}
            style={[styles.helpHeader, { marginBottom: 4 }]}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="play-circle-outline" size={18} color={t.accent} />
              <Text style={[styles.label, { color: t.txt1 }]}>Replay Tutorial</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.txt3} />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          {HELP_SECTIONS.map((sec, i) => {
            const open = openHelp === sec.key;
            return (
              <View key={sec.key}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: t.border }]} />}
                <TouchableOpacity style={styles.helpHeader} activeOpacity={0.7} onPress={() => setOpenHelp(open ? null : sec.key)}>
                  <View style={styles.settingLeft}>
                    {sec.lib === 'mci'
                      ? <MaterialCommunityIcons name={sec.icon as any} size={18} color={t.accent} />
                      : <Ionicons name={sec.icon as any} size={18} color={t.accent} />}
                    <Text style={[styles.label, { color: t.txt1 }]}>{sec.title}</Text>
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.txt3} />
                </TouchableOpacity>
                {open && (() => {
                  // Split lead paragraphs (no heading) from headed topics. Leads stay flush
                  // under the section header; the headed topics are grouped into one indented,
                  // recessed "well" so they read clearly as children rather than peers.
                  const leads = sec.paras.map((p, idx) => ({ p, idx })).filter(x => !x.p.h && !x.p.sub);
                  const topics = sec.paras.map((p, idx) => ({ p, idx })).filter(x => x.p.h || x.p.sub);
                  return (
                    <View style={{ paddingBottom: 12 }}>
                      {leads.map(({ p, idx }) => (
                        <Text key={`lead-${idx}`} style={{ fontSize: 14, lineHeight: 19, color: t.txt2, marginBottom: 8 }}>
                          {renderBody(p.t!)}
                        </Text>
                      ))}
                      {topics.length > 0 && (
                        <View style={[styles.helpWell, { backgroundColor: t.bg3 }]}>
                          {topics.map(({ p, idx }, ti) => {
                            const topicKey = `${sec.key}:${idx}`;
                            const prevSub = ti > 0 && !!topics[ti - 1].p.sub;
                            // A sub-group header ("Chord" / "Dictionary") splits the topic list into
                            // labelled lists within the same section.
                            if (p.sub) {
                              return (
                                <View key={topicKey} style={ti > 0 ? { borderTopWidth: 1, borderTopColor: t.border } : undefined}>
                                  <Text style={{ ...TYPE.caption, color: t.accent, letterSpacing: 1.5, textTransform: 'uppercase', paddingTop: ti > 0 ? 12 : 8, paddingBottom: 4 }}>{p.sub}</Text>
                                </View>
                              );
                            }
                            const tOpen = openTopics.has(topicKey);
                            return (
                              <View key={topicKey} style={(ti > 0 && !prevSub) ? { borderTopWidth: 1, borderTopColor: t.border } : undefined}>
                                <TouchableOpacity style={styles.helpTopicHeader} activeOpacity={0.7} onPress={() => toggleTopic(topicKey)}>
                                  <Text style={[styles.helpSubLabel, { color: t.txt2, flex: 1 }]}>{p.h}</Text>
                                  <Ionicons name={tOpen ? 'chevron-up' : 'chevron-down'} size={14} color={t.txt3} />
                                </TouchableOpacity>
                                {tOpen && (
                                  <View style={{ gap: 5, paddingBottom: 10 }}>
                                    {p.b ? p.b.map((bl, bi) => {
                                      const segs = typeof bl === 'string' ? [bl] : bl;
                                      // Bullets with inline tokens (time-sig / bar glyphs, OR icons) render as a
                                      // word-wrapped flex row with alignItems:'center', so each token sits vertically
                                      // CENTERED on the text line — reliable on every platform, unlike inline
                                      // verticalAlign (which rode the icons high on Android). (Time sigs / bars also
                                      // can't live inside a single <Text> at all.)
                                      const hasInlineToken = segs.some(s => typeof s === 'object' && s !== null && ('ts' in s || 'bars' in s || 'ic' in s));
                                      if (hasInlineToken) {
                                        const items: React.ReactNode[] = [];
                                        segs.forEach((s, si) => {
                                          if (typeof s === 'string') {
                                            s.split(/(\s+)/).forEach((w, wi) => {
                                              if (w === '') return;
                                              items.push(<Text key={`${si}-${wi}`} style={{ fontSize: 14, lineHeight: 19, color: t.txt2 }}>{w}</Text>);
                                            });
                                          } else if ('ts' in s) {
                                            items.push(<TimeSig key={si} n={s.ts[0]} d={s.ts[1]} color={t.txt2} />);
                                          } else if ('bars' in s) {
                                            items.push(<Bars key={si} n={s.bars} color={t.txt2} />);
                                          } else {
                                            items.push(s.lib === 'mci'
                                              ? <MaterialCommunityIcons key={si} name={s.ic as any} size={15} color={t.txt1} />
                                              : <Ionicons key={si} name={s.ic as any} size={15} color={t.txt1} />);
                                          }
                                        });
                                        return (
                                          <View key={bi} style={{ flexDirection: 'row', paddingLeft: 2 }}>
                                            <Text style={{ fontSize: 14, lineHeight: 19, color: t.txt3, marginRight: 7 }}>•</Text>
                                            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>{items}</View>
                                          </View>
                                        );
                                      }
                                      return (
                                        <View key={bi} style={{ flexDirection: 'row', paddingLeft: 2 }}>
                                          <Text style={{ fontSize: 14, lineHeight: 19, color: t.txt3, marginRight: 7 }}>•</Text>
                                          <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, color: t.txt2 }}>{renderBody(bl)}</Text>
                                        </View>
                                      );
                                    }) : null}
                                    {p.legend && (
                                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                                        {ROLE_LEGEND.map(r => (
                                          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: r.color }} />
                                            <Text style={{ fontSize: 12, color: t.txt2 }}>{r.label}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    )}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            );
          })}
        </View>

        {/* Data Management */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: '#63992240' }]}>
          <Text style={[styles.sectionLabel, { color: '#639922' }]}>DATA MANAGEMENT</Text>

          <TouchableOpacity style={styles.dangerRow} activeOpacity={0.7} onPress={() => isPro ? handleExport() : openPaywall('saved-songs')}>
            <View style={styles.settingLeft}>
              <Ionicons name={isPro ? 'share-outline' : 'lock-closed'} size={18} color="#639922" />
              <Text style={[styles.label, { color: t.txt1 }]}>Export Progressions Backup</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          <TouchableOpacity style={styles.dangerRow} activeOpacity={0.7} onPress={() => isPro ? setIsImportModalVisible(true) : openPaywall('saved-songs')}>
            <View style={styles.settingLeft}>
              <Ionicons name={isPro ? 'download-outline' : 'lock-closed'} size={18} color="#639922" />
              <Text style={[styles.label, { color: t.txt1 }]}>Import Progressions Backup</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: '#D4537E40' }]}>
          <Text style={[styles.sectionLabel, { color: '#D4537E' }]}>DANGER ZONE</Text>
          
          <TouchableOpacity
            style={styles.dangerRow}
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert(
                "Reset App Data",
                "Are you sure you want to clear your quiz scores and chord progressions? This cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Reset", style: "destructive", onPress: () => {
                    resetQuiz();
                    clearProgression();
                    useProgressionStore.setState({ savedSongs: DEFAULT_SONGS });
                  }}
                ]
              );
            }}>
            <View style={styles.settingLeft}>
              <Ionicons name="trash-outline" size={18} color="#D4537E" />
              <Text style={[styles.label, { color: t.txt1 }]}>Clear Stored Progress</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          <TouchableOpacity
            style={styles.dangerRow}
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert(
                "Factory Reset",
                "Restore every setting, preference, and the chord pool to defaults? Your saved songs and quiz scores are kept — use Clear Stored Progress to wipe those.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Restore Defaults", style: "destructive", onPress: () => {
                    factoryReset();
                    // Reset EVERY store's preferences too so "Restore Defaults" is complete:
                    useChordStore.getState().resetChordState();  // chord pool (active types) + current chord
                    useProgressionStore.setState({ songVoicingType: 'auto', songStringSet: null, guitarNeckZone: null, rhythm: 'straight' });
                    useDictionaryStore.getState().reset();       // dictionary browse state (mode/category/root/cols)
                    useQuizStore.getState().resetPreferences();  // quiz mode + quizzed voicings/inversions (scores kept)
                  }}
                ]
              );
            }}>
            <View style={styles.settingLeft}>
              <Ionicons name="warning-outline" size={18} color="#D4537E" />
              <Text style={[styles.label, { color: t.txt1 }]}>Restore Default Settings</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
      <LinearGradient colors={[t.bg, 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, zIndex: 10 }} pointerEvents="none" />
      </View>

      {/* Import Modal */}
      <PopUpModal visible={isImportModalVisible} onClose={() => setIsImportModalVisible(false)}>
        <View style={{ width: '100%', padding: 20, borderRadius: 16, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border }}>
          <Text style={[TYPE.subtitle, { color: t.txt1, marginBottom: 12 }]}>Import Backup</Text>
          <Text style={{ fontSize: 14, color: t.txt2, marginBottom: 16 }}>Paste your exported backup code below to merge it with your current library.</Text>
          <TextInput
            style={{ height: 120, borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg2, color: t.txt1, padding: 12, textAlignVertical: 'top', fontFamily: familyForWeight(fontFamily, 400) }}
            multiline
            placeholder="Paste backup JSON here..."
            placeholderTextColor={t.txt3}
            value={importText}
            onChangeText={setImportText}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={{ paddingVertical: 10, paddingHorizontal: 16 }} onPress={() => { setIsImportModalVisible(false); setImportText(''); }}>
              <Text style={{ color: t.txt3, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#639922', borderRadius: 8 }} onPress={handleImport}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Import</Text>
            </TouchableOpacity>
          </View>
        </View>
      </PopUpModal>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 20, padding: 16,
    marginBottom: 16, borderWidth: 1,
  },
  // Section overline: small uppercase tracked accent label — a wayfinding divider, not a
  // title. Intentionally smaller than the 15px row content (iOS/macOS settings convention);
  // 13 + tracking gives it presence without competing with the content for size.
  sectionLabel: {
    ...TYPE.label, fontSize: 13, fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 1.5, marginBottom: 14,
  },
  themeRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    justifyContent: 'center',
  },
  themeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    padding: 2,
  },
  themeCircleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  themeCircleHalf: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '50%',
    height: '100%',
  },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Primary settings-row label: one step above body (15) + semibold, used in every
  // section so the list reads with one consistent "voice". Mirrored by rowLabel in
  // SharedSettingsPanel for the Global Preferences rows.
  label: { ...TYPE.body, fontSize: 15, fontWeight: FONT_WEIGHT.semibold },
  divider: { height: 1, marginVertical: 4 },
  helpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  // Recessed, indented panel grouping a section's sub-topics so they read as children.
  helpWell: { marginLeft: 10, marginTop: 2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 2 },
  helpSubLabel: { ...TYPE.body, fontWeight: FONT_WEIGHT.semibold },
  helpTopicHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  
  /* Removed paddingTop: 16 from here since it's applied inline with safe area */
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  backBtn: { padding: 4, marginLeft: -4 },
  headerTitle: { ...TYPE.subtitle },
});