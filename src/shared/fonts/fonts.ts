// App-wide custom-font system. Each selectable font is loaded in four weights;
// the Text patch in App.tsx maps a style's fontWeight to the matching weighted
// family so the app's existing 400–800 weights render correctly. 'system' keeps
// the OS default (no custom font).
// Import each weight from its own subfolder rather than the package index: the index
// re-exports every variant (incl. italics whose files break Metro resolution), so the
// per-weight entry points keep the bundle to only the four weights we actually use.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_500Medium } from '@expo-google-fonts/nunito-sans/500Medium';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans/700Bold';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';

export type FontKey = 'system' | 'Inter' | 'Manrope' | 'Nunito Sans' | 'Sora';

// Asset map handed to useFonts() — every weighted family the app can use.
export const FONT_ASSETS = {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold,
  NunitoSans_400Regular, NunitoSans_500Medium, NunitoSans_600SemiBold, NunitoSans_700Bold,
  Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold,
};

type LoadedFont = Exclude<FontKey, 'system'>;
type Bucket = 400 | 500 | 600 | 700;

// Per-font weighted family names, bucketed by weight.
const FAMILIES: Record<LoadedFont, Record<Bucket, string>> = {
  'Inter':       { 400: 'Inter_400Regular',      500: 'Inter_500Medium',      600: 'Inter_600SemiBold',      700: 'Inter_700Bold' },
  'Manrope':     { 400: 'Manrope_400Regular',    500: 'Manrope_500Medium',    600: 'Manrope_600SemiBold',    700: 'Manrope_700Bold' },
  'Nunito Sans': { 400: 'NunitoSans_400Regular', 500: 'NunitoSans_500Medium', 600: 'NunitoSans_600SemiBold', 700: 'NunitoSans_700Bold' },
  'Sora':        { 400: 'Sora_400Regular',       500: 'Sora_500Medium',       600: 'Sora_600SemiBold',       700: 'Sora_700Bold' },
};

// Options for the Settings picker, in display order.
export const FONT_OPTIONS: { key: FontKey; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'Inter', label: 'Inter' },
  { key: 'Manrope', label: 'Manrope' },
  { key: 'Nunito Sans', label: 'Nunito Sans' },
  { key: 'Sora', label: 'Sora' },
];

// Map a font + a style's fontWeight to the matching weighted family. Returns
// undefined for the system font (or unknown), leaving the OS default in place.
export function familyForWeight(font: FontKey, weight: number | string | undefined): string | undefined {
  const fam = FAMILIES[font as LoadedFont];
  if (!fam) return undefined;
  let w = 400;
  if (typeof weight === 'number') w = weight;
  else if (typeof weight === 'string') {
    if (weight === 'bold') w = 700;
    else if (weight === 'normal') w = 400;
    else { const n = parseInt(weight, 10); if (!Number.isNaN(n)) w = n; }
  }
  const bucket: Bucket = w >= 700 ? 700 : w >= 600 ? 600 : w >= 500 ? 500 : 400;
  return fam[bucket];
}
