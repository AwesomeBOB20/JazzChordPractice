// Canonical type scale — the single source of truth for text sizes and weights.
//
// The app had drifted to 17 distinct font sizes (8→60) and 5 weight values, with
// '800' used as an accidental "bold" 79 times. This collapses them to 7 sizes and
// 3 weights so type reads as a deliberate hierarchy instead of one-off values.
//
// Weights stop at 700 on purpose: only the 400/500/600/700 faces are loaded
// (see fonts.ts), so '800'/'900'/'bold' all render as the 700 face anyway. Using
// 700 explicitly makes that intent visible rather than relying on the App.tsx
// Text patch to silently cap it.
//
// Tokens carry fontSize + fontWeight ONLY. lineHeight, letterSpacing, color, and
// textAlign stay at the call site so dropping a token into an existing style never
// disturbs vertical rhythm or layout. Spread a token first, then add the rest:
//   sectionLabel: { ...TYPE.caption, letterSpacing: 1.5, marginBottom: 14 }
//   <Text style={[TYPE.body, { color: t.txt2 }]}>…</Text>
//
// Not covered by this scale (intentionally left as-is): music notation glyphs
// (𝄆 𝄇 ♭ ♯), the serif time-signature numbers, and section "letter boxes" — those
// are iconographic, not body type.

import type { TextStyle } from 'react-native';

// Size buckets. Each old value snaps to the nearest token:
//   8,9,10 → caption(10) · 11,12 → label(12) · 13,14 → body(14) · 15,16 → heading(16)
//   18,20 → subtitle(20) · 22,24 → title(24) · 40,44,60 → display(44)
export const FONT_SIZE = {
  caption: 10,
  label: 12,
  body: 14,
  heading: 16,
  subtitle: 20,
  title: 24,
  display: 44,
} as const;

// Three weights. '800'/'900'/'bold' all collapse to bold(700); 'normal' → regular.
export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// Semantic tokens: a size paired with its default weight. Override the weight when a
// specific element needs more or less emphasis at the same size (e.g. a body-size
// value that should read strong → [TYPE.body, { fontWeight: FONT_WEIGHT.bold }]).
export const TYPE = {
  // Big numeric readouts (tuner note name). One-off display type.
  display:  { fontSize: FONT_SIZE.display,  fontWeight: FONT_WEIGHT.bold },
  // Screen and modal titles.
  title:    { fontSize: FONT_SIZE.title,    fontWeight: FONT_WEIGHT.bold },
  // Large section headers.
  subtitle: { fontSize: FONT_SIZE.subtitle, fontWeight: FONT_WEIGHT.bold },
  // Section headers, nav "top" labels, card titles.
  heading:  { fontSize: FONT_SIZE.heading,  fontWeight: FONT_WEIGHT.bold },
  // Default running text and value rows.
  body:     { fontSize: FONT_SIZE.body,     fontWeight: FONT_WEIGHT.medium },
  // Buttons, secondary labels, picker options.
  label:    { fontSize: FONT_SIZE.label,    fontWeight: FONT_WEIGHT.semibold },
  // Uppercase overlines, tags, tiny counts.
  caption:  { fontSize: FONT_SIZE.caption,  fontWeight: FONT_WEIGHT.bold },
} as const satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof TYPE;
