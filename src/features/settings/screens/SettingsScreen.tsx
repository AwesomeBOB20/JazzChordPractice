import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Animated, Dimensions, Share, TextInput } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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

const SCREEN_WIDTH = Dimensions.get('window').width;

// Inline help icons render on the text baseline, which sits them too high — and
// react-native-web silently drops `verticalAlign`, so that alone doesn't move them.
// Relative positioning DOES apply to inline elements (unlike transforms, which inline
// text drops), so nudge the glyph down a couple px to sit on the 14px / 19px text line.
// `verticalAlign: 'bottom'` is kept for native, where it is honored.
const INLINE_ICON_STYLE = { verticalAlign: 'bottom', position: 'relative', top: 2 } as const;

// ── Help & Tutorial content ───────────────────────────────────────────────────
// Static guide text shown in the collapsible Help card. Kept module-level (no theme
// refs) so it's a single source of truth; colors/rendering happen in the component.
type HelpIcon = { ic: string; lib?: 'mci' };       // inline icon token; default family is Ionicons
type HelpSeg = string | HelpIcon;                  // a run of body text and/or inline icons
type HelpBody = string | HelpSeg[];                // one paragraph's or bullet's content
// A block is either a lead paragraph (`t`, no heading) or a headed, collapsible bullet
// list (`h` + `b`). `legend` renders the note-role color key inside that topic.
type HelpPara = { h?: string; t?: HelpBody; b?: HelpBody[]; legend?: boolean };
type HelpSection = { key: string; icon: string; lib?: 'mci'; title: string; paras: HelpPara[] };
const I = (ic: string, lib?: 'mci'): HelpIcon => ({ ic, lib }); // shorthand for an inline icon

const HELP_SECTIONS: HelpSection[] = [
  {
    key: 'overview', icon: 'sparkles-outline', title: 'Overview',
    paras: [
      { t: 'A tool for learning jazz chords and progressions on piano and guitar — look chords up, hear them, and play along.' },
      { h: 'The Main Idea', b: [
        'A "voicing" is one specific way to arrange a chord\'s notes.',
        'Most of the app is about seeing, hearing, and choosing voicings — tight ones, wide ones, guitar shapes, and more.',
      ] },
      { h: 'Screens (bottom tabs)', b: [
        [I('compass-outline'), ' Explore — study one chord in depth, or browse the whole Dictionary.'],
        [I('musical-notes-outline'), ' Song — build and play a progression.'],
        [I('puzzle-outline', 'mci'), ' Quiz — test yourself by sight and ear.'],
        [I('guitar-pick-outline', 'mci'), ' Tuner — tune your instrument.'],
      ] },
      { h: 'Top Bar (on every screen)', b: [
        ['Switch between ', I('piano', 'mci'), ' Piano and ', I('guitar-acoustic', 'mci'), ' Guitar.'],
        ['Toggle ', I('music-note-quarter', 'mci'), ' Block (all notes at once) vs ', I('musical-notes'), ' Arpeggio (one at a time) playback.'],
        [I('metronome', 'mci'), ' Tap the tempo to set the speed (BPM).'],
        ['Open ', I('settings-outline'), ' Settings for display and audio options.'],
      ] },
    ],
  },
  {
    key: 'play', icon: 'compass-outline', title: 'Explore Screen',
    paras: [
      { t: 'Pick any chord and explore every way to play it — for learning fingerings, comparing voicings, and drilling one chord at a time.' },
      { h: 'Two Ways to Browse', b: [
        ['A toggle at the top switches between ', I('albums-outline'), ' Chord and ', I('book-outline'), ' Dictionary.'],
        'Chord puts one chord on a big diagram to study and drill (the controls just below).',
        'Dictionary is a scrollable reference grid of every voicing, scale, and shape (covered further down).',
      ] },
      { h: 'Chord Card', b: [
        'The card at the top is the current chord; the colored dots are its notes.',
        'Side chevrons change the root (the letter, like C or F).',
        'Up/down chevrons change the quality (the type, like maj7 or m7).',
        'Tap the card to hear the whole chord.',
      ] },
      { h: 'Voicing Tabs', b: [
        'The tabs under the chord switch between families of voicings.',
        'Triads (basic 3-note chords), Shells (just the essential notes), Drop 2/3 (wider, spread-out voicings), Open and Barre (guitar shapes), plus Scales, Arpeggios, and Intervals.',
        'Each tab\'s badge shows how many were found; the chevrons step through them.',
        'Which tabs appear depends on Piano vs Guitar.',
      ] },
      { h: 'Hear Any Note', b: [
        'Tap a colored dot — or any piano key or guitar fret — to play just that note.',
        'Press several at once to pick a voicing apart note by note.',
      ] },
      { h: 'Display Options (below the diagram)', b: [
        [I('repeat'), ' Hold keeps the chord ringing while you study it.'],
        [I('filter'), ' The order toggle re-sorts the voicings.'],
        [I('layers'), ' Scale faintly overlays a fitting scale behind the chord — useful for finding notes to solo with.'],
      ] },
      { h: 'Random or Manual (bottom row)', b: [
        ['In Random mode, ', I('dice'), ' jumps to a random chord from a pool you set with the ', I('library-outline'), ' library button — good for drilling.'],
        ['Switch the sheet to Manual to pick a specific chord by hand (the dice becomes the ', I('create'), ' Edit Chord button).'],
        [I('play'), ' plays the current chord.'],
      ] },
      { h: 'Dictionary — Browse Everything', b: [
        'The top tabs choose what to show: Block, Open, Barre, Triads, Shells, Drop 2 / 3 / 2&4, Intervals, Arps, Shapes, and Scales. Each badge counts how many fit the current root.',
        'When a tab has sub-groups, a second row of family tabs narrows it (e.g. 7th Chords vs 9th Chords).',
        'Tap a row — like "Maj 7" or "Major" — to open it and reveal its diagrams; tap again to close.',
        'When you open a rootless shell/drop/triad or a scale, a row lists the chords it works for: "Comp with" on a voicing (the chords you\'d play it for, e.g. a 3·7·13 grip belongs to Dom13) and "Solo with" on a scale (the chords you\'d improvise over, e.g. Dorian fits Min 7, Min 9, and Min 6).',
        'Tap any diagram to hear it. To open it on the full Chord screen: first tap one of those "Comp with" / "Solo with" chips (it highlights), then tap the diagram you want — that exact voicing or box loads on the Chord screen for the chosen chord.',
        'Or go the other way: press and hold a diagram. For a named chord (Block / Open / Barre / Arps) it opens straight on the Chord screen at that exact grip / inversion / arp box. For a shell/drop/triad/scale/shape it asks you to pick a chord first ("Pick a chord for this voicing"), then opens. Holding an Interval (which has no chord of its own) jumps to a random chord that contains it, landing on its Intervals tab.',
        'The 1 / 2 / 3 buttons at the bottom-right set how many diagrams fit per row.',
      ] },
      { h: 'Picking the Root (Dictionary)', b: [
        'The ‹ › stepper at the bottom moves the root up or down a half step.',
        'Tap the letter in the middle to pop up a strip of 12 circles — tap one to jump straight to that root.',
        [I('grid-outline'), ' All (guitar) shows every shape across all 12 roots, each only once — great for learning a movable shape that slides up the neck.'],
      ] },
      { h: 'The Four Corner Labels (Dictionary)', b: [
        'Each guitar diagram tags its corners so you can read it at a glance.',
        'Top-left — the root (the letter), or ANY for movable shapes.',
        'Top-right — the string set (like 4-3-2-1) for Triads, Shells, and Drops, or the shape name (like "Box 3 (C Shape)") for Arps, Scales, and Shapes.',
        'Bottom-left — the formula: which scale degrees are in it (e.g. 1 3 5 7).',
        'Bottom-right — which note is in the bass ("Root in bass", "3rd in bass"…).',
      ] },
    ],
  },
  {
    key: 'song', icon: 'musical-notes-outline', title: 'Song Screen',
    paras: [
      { t: 'Write out a progression — a sequence of chords — and play it back with a backing band that comps the chords (plays them in rhythm), adds a bass line, and keeps time with a metronome.' },
      { h: 'The Grid', b: [
        'Each cell is one measure (bar).',
        'Tap a cell to select and hear it.',
        'Long-press or double-tap to open its editor.',
      ] },
      { h: 'Three Views: Name · Chords · Arps', b: [
        'The view button at the start of the toolbar cycles how each bar is shown.',
        [I('lead-pencil', 'mci'), ' NAME shows just the chord letters — the quickest read.'],
        [I('grid-outline'), ' CHORDS shows a playable diagram (piano or guitar) for every bar.'],
        [I('musical-notes'), ' ARPS shows those same notes as an arpeggio — a shape you play one note at a time.'],
      ] },
      { h: 'Editing a Measure', b: [
        'Set the chord for the bar.',
        'Change how many beats the bar lasts (e.g. 3/4).',
        'Split one bar into two chords.',
        'The toolbar above adds or removes measures and transposes the whole song (♭ / ♯).',
      ] },
      { h: 'Smart Voicings (Zone & Voice Leading)', b: [
        'The app picks voicings that flow smoothly from one chord to the next instead of jumping around.',
        'ZONE sets where they sit — a fret area on guitar, or a register like C4 on piano. Use − / + to move it, or AUTO to let the app choose.',
        'The Voice Lead pill changes how they move: Zone (stay put, smooth), Bounce (drift up and down), or Up / Down (walk the neck). Turn it off for plain root-position chords.',
      ] },
      { h: 'Lock the Voicing (guitar)', b: [
        'VOICING forces a family — AUTO, Triads, Drop 2, Drop 3, or Shells — so every chord uses that style.',
        'With a family set, STRINGS pins the shapes to one string set (or leave it ANY).',
      ] },
      { h: 'Chart Marks (like real sheet music)', b: [
        'Repeat signs (𝄆 𝄇) to loop a section.',
        '1st/2nd endings — a bar played only the last time through a repeat, versus the times before.',
        'Letters (A, B…) to label sections.',
      ] },
      { h: 'Playback (bottom dock)', b: [
        'Set the tempo, the rhythm feel (Straight, Swing, Bossa, Two-Step, Reggae), and toggle bass and metronome.',
        [I('options-outline'), ' Mix sets their volumes.'],
        [I('repeat'), ' Loop replays the whole progression until you stop.'],
        ['Press ', I('play'), ' for a count-in, then the song plays in that feel.'],
        'While it plays, tap a measure ahead to jump straight there at the next bar.',
      ] },
      { h: 'Saving', b: [
        [I('save-outline'), ' Save stores the song (with its tempo and feel) under a name.'],
        [I('library-outline'), ' Library opens your saved songs; sort them into folders.'],
        'Back up or restore your whole library from Data Management in Settings.',
      ] },
    ],
  },
  {
    key: 'quiz', icon: 'puzzle-outline', lib: 'mci', title: 'Quiz Screen',
    paras: [
      { t: 'Test how well you recognize chords by sight and by ear.' },
      { h: 'Visual or Audio', b: [
        ['Use the ', I('eye'), ' / ', I('ear'), ' toggle in the top bar.'],
        'Visual shows a chord diagram for you to name.',
        'Audio plays a chord for you to name.',
      ] },
      { h: 'Choose What to Practice', b: [
        [I('layers'), ' Open the setup sheet to narrow the quiz to what you\'re working on.'],
        'Its Chords and Voicings tabs pick which chord types, inversions (which note sits in the bass), and voicing families can come up.',
        'Depending on the family, you might identify a chord, scale, arpeggio, interval, or shape.',
        'Set the instrument in the top bar.',
      ] },
      { h: 'Answering', b: [
        ['Tap your answer, then ', I('arrow-forward'), ' Next for the next one.'],
        'Correct turns green, wrong turns red — and the chord plays so you hear it.',
        'Not sure? Reveal shows the answer (it counts as a miss).',
        ['Your score, streak, and accuracy track at the top; ', I('refresh'), ' resets them.'],
      ] },
      { h: 'While You Listen (Audio)', b: [
        'In Audio mode the chord hides behind a big ? while it plays.',
        [I('headset-outline'), ' Animated bars pulse with the sound, so you can feel its shape while you listen.'],
      ] },
      { h: 'The Reveal (Audio)', b: [
        'When you answer, the bars become a chord-anatomy strip: one colored dot per note, its degree below (R, 3, 5…), and the interval between notes above.',
        'Tap any dot to replay just that note.',
      ] },
    ],
  },
  {
    key: 'tuner', icon: 'guitar-pick-outline', lib: 'mci', title: 'Tuner Screen',
    paras: [
      { t: 'Tune your instrument by microphone or by ear.' },
      { h: 'Listen', b: [
        [I('mic'), ' On Android, the tuner can use your mic to show the note you\'re playing and whether you\'re sharp or flat.'],
        'Sharp/flat is measured in cents (hundredths of a step), so 0 is perfectly in tune.',
        'On other devices, use Play below to tune by ear instead.',
      ] },
      { h: 'Play', b: [
        [I('volume-high'), ' Tap a string to sound its reference pitch and tune your instrument to match.'],
        'Tap again to silence it.',
      ] },
      { h: 'Setup', b: [
        [I('options'), ' Choose a tuning: Standard, Drop D, ½ Step Down, Open G, or DADGAD.'],
        'The reference pitch (A=432/440/512) lives in Settings → Audio; 440 is the modern standard.',
      ] },
    ],
  },
  {
    key: 'reading', icon: 'color-palette-outline', title: 'Reading the Diagrams',
    paras: [
      { t: 'How to read the chord, scale, and voicing diagrams used throughout the app.' },
      { h: 'Note Shapes', b: [
        'The root note is a square; every other note is a circle — so you can spot the root at a glance.',
      ] },
      { h: 'Colors (Note Color in Settings → Display)', legend: true, b: [
        'Roles colors each note by its role in the chord — see the legend below.',
        'Theme paints them all one color.',
        'Selective spotlights only the chord tones you choose.',
      ] },
      { h: 'Labels', b: [
        'Set the dots to show note names, scale degrees (1, ♭3, 5…), or nothing in Settings → Display.',
      ] },
      { h: 'Position & Box Shapes', b: [
        'A number to the left of a guitar diagram is the fret it starts on — so the shape sits up the neck, not at the nut.',
        'Names like "Box 1 (E Shape)" are CAGED positions: the five places a scale or arpeggio shape lives along the neck.',
      ] },
      { h: 'The Mini-Map', b: [
        'Beside the big Explore diagram, a slim strip shows the whole neck (or keyboard) in miniature — a box marks the part you\'re viewing and dots mark every chord note.',
      ] },
      { h: 'Voicing Types', b: [
        'Triads are basic 3-note chords.',
        'Shells keep only the defining notes (root, 3rd, 7th).',
        'Drop 2 / Drop 3 / Drop 2 & 4 take a tight chord and drop one or two of the top notes down an octave, spreading it into wider, guitar-friendly shapes.',
        'A string set is which group of adjacent guitar strings a shape uses.',
      ] },
      { h: 'Chord Symbols', b: [
        'maj7 = major 7th, m7 = minor 7th, 7 = dominant 7th.',
        'ø7 = half-diminished, °7 = diminished.',
        'Added numbers like 9, 11, and 13 are extensions — extra color notes stacked on top.',
      ] },
    ],
  },
  {
    key: 'settings', icon: 'options-outline', title: 'Settings',
    paras: [
      { t: ['Open Settings from the ', I('settings-outline'), ' gear in the top bar. Changes apply everywhere, instantly.'] },
      { h: 'Look & Feel', b: [
        [I('color-palette-outline'), ' App Theme switches between light and dark.'],
        'Font changes the typeface used on labels and diagrams.',
      ] },
      { h: 'Display', b: [
        'Accidentals — spell notes with flats (♭) or sharps (♯).',
        'Labels — show note names, scale degrees (1, ♭3, 5…), or nothing on the dots.',
        'Octave numbers — show C4 instead of just C.',
        'Note Color — Roles (a color per degree), Theme (one color), or Selective (spotlight only the degrees you choose).',
      ] },
      { h: 'Audio', b: [
        'Instrument — Piano or Guitar; sets which diagrams and tabs you see.',
        'Octave — how high or low notes sound and display.',
        'Tuning (A=) — reference pitch 432, 440 (standard), or 512 Hz.',
      ] },
      { h: 'Your Data', b: [
        [I('save-outline'), ' Data Management backs up or restores all your saved songs.'],
        'Clear Stored Progress wipes quiz scores and the working progression (your saved songs stay).',
        'Restore Default Settings resets preferences (your songs and scores stay).',
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
  const { theme, setTheme, factoryReset, isSettingsOpen, setIsSettingsOpen, fontFamily } = useSettingsStore();
  const { clearProgression } = useProgressionStore();
  const { resetQuiz } = useQuizStore();

  const t = THEMES[theme];
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  // Render a help body (plain text and/or inline icons) as children of a <Text>.
  const renderBody = (body: HelpBody) =>
    (typeof body === 'string' ? [body] : body).map((seg, si) =>
      typeof seg === 'string'
        ? seg
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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* App Theme Picker */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.accent }]}>APP THEME</Text>
          <View style={styles.themeRow}>
            {Object.entries(THEMES).map(([key, th]) => (
              <TouchableOpacity
                key={key}
                activeOpacity={0.7}
                style={[
                  styles.themeCircle,
                  { borderColor: theme === key ? t.txt1 : 'transparent' }
                ]}
                onPress={() => setTheme(key)}>
                <View style={[styles.themeCircleInner, { backgroundColor: th.bg }]}>
                  <View style={[styles.themeCircleHalf, { backgroundColor: th.accent }]} />
                </View>
              </TouchableOpacity>
            ))}
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
                  const leads = sec.paras.map((p, idx) => ({ p, idx })).filter(x => !x.p.h);
                  const topics = sec.paras.map((p, idx) => ({ p, idx })).filter(x => x.p.h);
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
                            const tOpen = openTopics.has(topicKey);
                            return (
                              <View key={topicKey} style={ti > 0 ? { borderTopWidth: 1, borderTopColor: t.border } : undefined}>
                                <TouchableOpacity style={styles.helpTopicHeader} activeOpacity={0.7} onPress={() => toggleTopic(topicKey)}>
                                  <Text style={[styles.helpSubLabel, { color: t.txt2, flex: 1 }]}>{p.h}</Text>
                                  <Ionicons name={tOpen ? 'chevron-up' : 'chevron-down'} size={14} color={t.txt3} />
                                </TouchableOpacity>
                                {tOpen && (
                                  <View style={{ gap: 5, paddingBottom: 10 }}>
                                    {p.b ? p.b.map((bl, bi) => (
                                      <View key={bi} style={{ flexDirection: 'row', paddingLeft: 2 }}>
                                        <Text style={{ fontSize: 14, lineHeight: 19, color: t.txt3, marginRight: 7 }}>•</Text>
                                        <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, color: t.txt2 }}>{renderBody(bl)}</Text>
                                      </View>
                                    )) : null}
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

          <TouchableOpacity style={styles.dangerRow} activeOpacity={0.7} onPress={handleExport}>
            <View style={styles.settingLeft}>
              <Ionicons name="share-outline" size={18} color="#639922" />
              <Text style={[styles.label, { color: t.txt1 }]}>Export Progressions Backup</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          <TouchableOpacity style={styles.dangerRow} activeOpacity={0.7} onPress={() => setIsImportModalVisible(true)}>
            <View style={styles.settingLeft}>
              <Ionicons name="download-outline" size={18} color="#639922" />
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