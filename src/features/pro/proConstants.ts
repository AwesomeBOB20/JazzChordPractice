// Central catalogue of Pro features. The `feature` keys are passed to openPaywall()
// so the paywall can highlight WHICH capability the user just bumped into; the list
// also drives the paywall's "what you get" body. Keep this in sync with the agreed
// freemium split (see Help → Pro, and the freemium-split-plan).

export type ProFeature =
  | 'dictionary'
  | 'voicings'
  | 'progression-tools'
  | 'quiz-categories'
  | 'tuner'
  | 'saved-songs'
  | 'themes'
  | 'chords'
  | 'generic';

// Short label shown in the paywall header ("Unlock <label>") when a specific
// feature triggered it. 'generic' is the catch-all when opened from Settings.
export const PRO_FEATURE_LABELS: Record<ProFeature, string> = {
  dictionary: 'Dictionary mode',
  voicings: 'advanced voicings',
  'progression-tools': 'progression power tools',
  'quiz-categories': 'all quiz categories',
  tuner: 'alternate tunings',
  'saved-songs': 'unlimited saved songs',
  themes: 'all themes',
  chords: 'extended & altered chords',
  generic: 'Kordal Pro',
};

// The full benefit list rendered in the paywall body. One unlock buys all of it.
// iconLib defaults to 'mci' (MaterialCommunityIcons); use 'ion' for Ionicons.
export const PRO_BENEFITS: { icon: string; iconLib?: 'mci' | 'ion'; title: string; detail: string }[] = [
  { icon: 'book-outline',     iconLib: 'ion', title: 'Dictionary mode', detail: 'Browse every chord, scale, arpeggio and interval shape by root.' },
  { icon: 'music-circle', title: 'Extended & altered chords', detail: '9ths, 11ths, 13ths, altered dominants and more — beyond the free essentials.' },
  { icon: 'guitar-electric',  title: 'Advanced voicings', detail: 'Drop 2, Drop 3, Drop 2&4, Shells, Arpeggios, Intervals & Shapes.' },
  { icon: 'music-clef-treble', title: 'Progression power tools', detail: 'Transpose, change key, neck/piano zones, swing & bossa feels.' },
  { icon: 'ear',              iconLib: 'ion', title: 'All quiz categories', detail: 'Quiz on scales, arpeggios, intervals & shapes — chord & listen modes are free.' },
  { icon: 'tune',             title: 'Tuner unlocked', detail: 'Alternate tunings and a custom reference frequency.' },
  { icon: 'content-save-all', title: 'Unlimited saved songs', detail: 'Save as many progressions as you like, plus all preset songs.' },
  { icon: 'palette',          title: 'Every theme', detail: 'The full set of light and dark themes.' },
];

// Free tier allows this many user-saved songs before the paywall.
export const FREE_SAVED_SONG_LIMIT = 3;

// Chord qualities free on every tier: all triads, the two common 6ths, and the five
// essential 7th chords. Everything else — 9ths/11ths/13ths, altered dominants, add9s,
// 6/9s and the exotic 7ths — is Pro. (Keys match CHORD_CATEGORIES in musicTheory.)
export const FREE_CHORD_TYPES: ReadonlySet<string> = new Set<string>([
  // Triads
  'maj', 'min', 'aug', 'dim', 'sus4', 'sus2',
  // 6ths
  'maj6', 'min6',
  // Essential 7ths (maj7, min7, dominant 7, m7♭5, dim7)
  'maj7', 'min7', 'dom7', 'hdim7', 'fdim7',
]);

export const isChordTypeFree = (type: string): boolean => FREE_CHORD_TYPES.has(type);
