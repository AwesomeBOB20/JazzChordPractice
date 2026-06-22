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
      { icon: 'guitar-acoustic', lib: 'mci', text: 'Learn any chord on guitar and piano' },
      { icon: 'school-outline', text: 'Understand the theory behind every chord' },
      { icon: 'musical-notes-outline', text: 'Practice over real chord progressions' },
      { icon: 'ear-outline', text: 'Train your ear with Quiz mode' },
    ],
  },
  {
    icon: 'piano',
    lib: 'mci',
    title: 'Piano & Guitar',
    bullets: [
      { icon: 'swap-horizontal-outline', text: 'Toggle instruments in the top-left' },
      { icon: 'albums-outline', text: 'Each has its own voicing families' },
      { icon: 'layers-outline', text: 'Triads, shells, drops, scales, arps & more' },
      { icon: 'eye-outline', text: 'Same chord — two different perspectives' },
    ],
  },
  {
    icon: 'compass-outline',
    title: 'Explore: Chord Mode',
    bullets: [
      { icon: 'chevron-back-outline', text: '‹ › steppers change root & chord quality' },
      { icon: 'albums-outline', text: 'Voicing tabs switch families below the diagram' },
      { icon: 'navigate-outline', text: 'Navigators pick the exact position & shape' },
      { icon: 'volume-medium-outline', text: 'Tap any dot or key to hear that note' },
    ],
  },
  {
    icon: 'book-outline',
    title: 'Explore: Dictionary',
    bullets: [
      { icon: 'grid-outline', text: 'Browse every voicing for any root at once' },
      { icon: 'search-outline', text: 'Filter by category — chords, scales, arps' },
      { icon: 'chevron-down-outline', text: 'Tap a row to expand its diagrams' },
      { icon: 'volume-medium-outline', text: 'Tap any diagram to hear it' },
    ],
  },
  {
    icon: 'musical-notes-outline',
    title: 'Song Screen',
    bullets: [
      { icon: 'add-circle-outline', text: 'Add chords to build a progression' },
      { icon: 'speedometer-outline', text: 'Set your own tempo with the BPM control' },
      { icon: 'repeat-outline', text: 'Loop playback to practice comping along' },
      { icon: 'shuffle-outline', text: 'From a ii–V–I to full rhythm changes' },
    ],
  },
  {
    icon: 'puzzle-outline',
    lib: 'mci',
    title: 'Quiz Screen',
    bullets: [
      { icon: 'eye-outline', text: 'Visual mode — see a diagram, name the chord' },
      { icon: 'ear-outline', text: 'Audio mode — hear it, identify by ear' },
      { icon: 'trophy-outline', text: 'Score and streak tracked as you go' },
      { icon: 'options-outline', text: 'Customize which chords get quizzed' },
    ],
  },
  {
    icon: 'guitar-pick-outline',
    lib: 'mci',
    title: 'Tuner',
    bullets: [
      { icon: 'mic-outline', text: 'Chromatic tuner listens via your mic' },
      { icon: 'analytics-outline', text: 'Shows the closest note & how far off you are' },
      { icon: 'volume-medium-outline', text: 'Play a reference tone to tune by ear' },
      { icon: 'guitar-acoustic', lib: 'mci', text: 'Works for any instrument' },
    ],
  },
  {
    icon: 'settings-outline',
    title: 'Settings',
    bullets: [
      { icon: 'color-palette-outline', text: 'Themes — light, dark & more' },
      { icon: 'text-outline', text: 'Sharp ♯ or flat ♭ note naming' },
      { icon: 'musical-note-outline', text: 'Diagram labels & font style' },
      { icon: 'volume-medium-outline', text: 'Audio playback & mixer controls' },
    ],
  },
  {
    icon: 'help-circle-outline',
    title: 'Want the Full Guide?',
    bullets: [
      { icon: 'document-text-outline', text: 'Every feature has a detailed explanation' },
      { icon: 'settings-outline', text: 'Go to Settings → Help & Tutorial' },
      { icon: 'play-circle-outline', text: 'Replay this tutorial any time from there' },
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
