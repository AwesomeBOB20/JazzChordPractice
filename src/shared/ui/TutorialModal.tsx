import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { THEMES } from '@shared/ui/themes';
import { PopUpModal } from './SharedModals';

const SCREEN_W = Dimensions.get('window').width;

type Bullet = { icon: string; lib?: 'mci'; text: string };

const SLIDES: Array<{
  icon: string;
  lib?: 'mci';
  title: string;
  bullets: Bullet[];
}> = [
  {
    icon: 'sparkles-outline',
    title: 'Welcome!',
    bullets: [
      { icon: 'eye-outline', text: 'See exactly where to put your fingers for any chord' },
      { icon: 'volume-medium-outline', text: 'Hear how every chord and note sounds' },
      { icon: 'musical-notes-outline', text: 'Play along with songs you build yourself' },
      { icon: 'school-outline', text: 'No music background needed — we keep it simple' },
    ],
  },
  {
    icon: 'apps-outline',
    title: 'Getting Around',
    bullets: [
      { icon: 'compass-outline', text: 'Explore: look up and learn any chord' },
      { icon: 'musical-notes-outline', text: 'Song: line up chords and play them back' },
      { icon: 'puzzle-outline', lib: 'mci', text: 'Quiz: test yourself and train your ear' },
      { icon: 'guitar-pick-outline', lib: 'mci', text: 'Tuner: get your instrument in tune' },
    ],
  },
  {
    icon: 'piano',
    lib: 'mci',
    title: 'Piano or Guitar',
    bullets: [
      { icon: 'guitar-acoustic', lib: 'mci', text: 'Tap the top-left switch to pick your instrument' },
      { icon: 'hand-left-outline', text: 'Diagrams show right where to press' },
      { icon: 'color-palette-outline', text: 'Colored dots tell each note apart' },
      { icon: 'eye-outline', text: 'See the same chord on both instruments' },
    ],
  },
  {
    icon: 'compass-outline',
    title: 'The Explore Tab',
    bullets: [
      { icon: 'swap-horizontal-outline', text: 'Use the ‹ › arrows to pick any chord' },
      { icon: 'albums-outline', text: 'Tabs below show different ways to play it' },
      { icon: 'finger-print-outline', text: 'Side arrows step through each finger position' },
      { icon: 'volume-medium-outline', text: 'Tap a dot or key to hear that one note' },
    ],
  },
  {
    icon: 'book-outline',
    title: 'The Dictionary',
    bullets: [
      { icon: 'grid-outline', text: 'A reference book of every chord and shape' },
      { icon: 'toggle-outline', text: 'Switch it on with the toggle at the top of Explore' },
      { icon: 'chevron-down-outline', text: 'Tap a row to open up its diagrams' },
      { icon: 'volume-medium-outline', text: 'Tap any diagram to hear how it sounds' },
    ],
  },
  {
    icon: 'musical-notes-outline',
    title: 'The Song Tab',
    bullets: [
      { icon: 'add-circle-outline', text: 'Add chords one by one to build a sequence' },
      { icon: 'play-circle-outline', text: 'Press play to hear them in order' },
      { icon: 'metronome', lib: 'mci', text: 'Slow it down or speed it up to any pace' },
      { icon: 'repeat-outline', text: 'Loop it and play along to practice' },
    ],
  },
  {
    icon: 'puzzle-outline',
    lib: 'mci',
    title: 'The Quiz Tab',
    bullets: [
      { icon: 'eye-outline', text: 'See a chord shape and guess its name' },
      { icon: 'ear-outline', text: 'Or just listen and name it by ear' },
      { icon: 'trophy-outline', text: 'Build up a score and a winning streak' },
      { icon: 'options-outline', text: 'Choose which chords you want to practice' },
    ],
  },
  {
    icon: 'guitar-pick-outline',
    lib: 'mci',
    title: 'The Tuner Tab',
    bullets: [
      { icon: 'mic-outline', text: 'Play a note and your phone listens in' },
      { icon: 'analytics-outline', text: 'It tells you if you\'re too high or too low' },
      { icon: 'volume-medium-outline', text: 'Or play a clean note and tune by ear' },
      { icon: 'checkmark-circle-outline', text: 'Works for guitar, piano, and more' },
    ],
  },
  {
    icon: 'settings-outline',
    title: 'Settings',
    bullets: [
      { icon: 'settings-outline', text: 'Tap the gear in the top-right corner' },
      { icon: 'color-palette-outline', text: 'Pick a color theme — light, dark, and more' },
      { icon: 'text-outline', text: 'Show note names right on the diagrams' },
      { icon: 'volume-medium-outline', text: 'Adjust the sound and volume' },
    ],
  },
  {
    icon: 'help-circle-outline',
    title: 'Need More Help?',
    bullets: [
      { icon: 'document-text-outline', text: 'Every feature is explained in full inside' },
      { icon: 'settings-outline', text: 'Open Settings, then Help & Tutorial' },
      { icon: 'play-circle-outline', text: 'You can replay this intro any time' },
      { icon: 'happy-outline', text: 'That\'s it — have fun exploring!' },
    ],
  },
];

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

function BulletRow({ bullet, accent }: { bullet: Bullet; accent: string }) {
  const icon = bullet.lib === 'mci'
    ? <MaterialCommunityIcons name={bullet.icon as any} size={15} color={accent} />
    : <Ionicons name={bullet.icon as any} size={15} color={accent} />;
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletIcon, { backgroundColor: accent + '20' }]}>{icon}</View>
      <Text style={styles.bulletText}>{bullet.text}</Text>
    </View>
  );
}

export function TutorialModal({ visible, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const theme = useSettingsStore((s: any) => s.theme);
  const t = THEMES[theme];
  const isFirst = step === 0;
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const handleNext = () => {
    if (isLast) { onDismiss(); } else { setStep(s => s + 1); }
  };
  const handleBack = () => setStep(s => s - 1);
  const handleSkip = () => onDismiss();

  return (
    <PopUpModal visible={visible} onClose={handleSkip}>
      <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
        {/* Header icon */}
        <View style={[styles.iconWrap, { backgroundColor: t.accent + '22' }]}>
          {slide.lib === 'mci'
            ? <MaterialCommunityIcons name={slide.icon as any} size={34} color={t.accent} />
            : <Ionicons name={slide.icon as any} size={34} color={t.accent} />}
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: t.txt1 }]}>{slide.title}</Text>

        {/* Bullet list */}
        <View style={styles.bullets}>
          {slide.bullets.map((b, i) => (
            <BulletRow key={i} bullet={b} accent={t.accent} />
          ))}
        </View>

        {/* Dot indicator */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => setStep(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <View style={[styles.dot, { backgroundColor: i === step ? t.accent : t.border }, i === step && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Back / Next */}
        <View style={styles.btnRow}>
          {!isFirst && (
            <TouchableOpacity activeOpacity={0.8} onPress={handleBack} style={[styles.btnSecondary, { borderColor: t.border }]}>
              <Ionicons name="chevron-back" size={20} color={t.txt1} />
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={0.8} onPress={handleNext} style={[styles.btnPrimary, { backgroundColor: t.accent }]}>
            <Text style={styles.btnText}>{isLast ? 'Get Started' : 'Next'}</Text>
          </TouchableOpacity>
        </View>

        {!isLast && (
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
            <Text style={[styles.skip, { color: t.txt3 }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </PopUpModal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: Math.min(SCREEN_W - 48, 340),
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  bullets: {
    width: '100%',
    gap: 10,
    marginBottom: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bulletIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    color: '#888',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
    borderRadius: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 12,
  },
  btnSecondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  skip: {
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 4,
  },
});
