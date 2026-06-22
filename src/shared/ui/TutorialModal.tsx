import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { THEMES } from '@shared/ui/themes';
import { PopUpModal } from './SharedModals';

const SCREEN_W = Dimensions.get('window').width;

const SLIDES: Array<{
  icon: string;
  lib?: 'mci';
  title: string;
  body: string;
}> = [
  {
    icon: 'sparkles-outline',
    title: 'Welcome!',
    body: 'Tune your instrument, learn any chord on guitar and piano, understand the theory behind them, practice with real progressions, and train your ear — everything a musician needs, in one app.',
  },
  {
    icon: 'piano',
    lib: 'mci',
    title: 'Piano & Guitar',
    body: 'Switch between Piano and Guitar with the top-left toggle. Each has its own voicing families — triads, shells, drop voicings, scales, arpeggios, and more. See how the same chord looks and sounds on both.',
  },
  {
    icon: 'compass-outline',
    title: 'Explore: Chord Mode',
    body: 'Use the ‹ › steppers to change root and chord quality. Voicing tabs below switch families. The navigators beside the card pick the exact position and shape. Tap any dot or key to hear that note.',
  },
  {
    icon: 'book-outline',
    title: 'Explore: Dictionary',
    body: 'Toggle to Dictionary to browse every voicing, scale, and arpeggio for any root at a glance. Tap a row to expand its diagrams — tap any diagram to hear it.',
  },
  {
    icon: 'musical-notes-outline',
    title: 'Song Screen',
    body: 'Build a chord progression and play it back at any tempo. Practice comping over real jazz changes — from a ii–V–I to a full set of rhythm changes.',
  },
  {
    icon: 'puzzle-outline',
    lib: 'mci',
    title: 'Quiz Screen',
    body: 'Visual mode shows a chord diagram — name it. Audio mode plays the chord — identify it by ear. Both sharpen the recognition skills you need to play in real musical situations.',
  },
  {
    icon: 'guitar-pick-outline',
    lib: 'mci',
    title: 'Tuner',
    body: 'Use the built-in chromatic tuner (listens via mic) to tune your instrument, or play a sustained reference tone and tune by ear.',
  },
  {
    icon: 'settings-outline',
    title: 'Settings',
    body: 'Tap ⚙ (top right) to change the theme, note naming (sharp ♯ or flat ♭), diagram labels, font, and audio playback style.',
  },
  {
    icon: 'help-circle-outline',
    title: 'Want the Full Guide?',
    body: 'Every feature has a detailed explanation. Tap ⚙ Settings → Help & Tutorial any time to open the complete in-app guide.',
  },
];

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function TutorialModal({ visible, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const theme = useSettingsStore((s: any) => s.theme);
  const t = THEMES[theme];
  const isFirst = step === 0;
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  // Reset to first slide whenever the modal is (re-)opened
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const handleNext = () => {
    if (isLast) {
      onDismiss();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleBack = () => setStep(s => s - 1);

  const handleSkip = () => onDismiss();

  return (
    <PopUpModal visible={visible} onClose={handleSkip}>
      <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: t.accent + '22' }]}>
          {slide.lib === 'mci'
            ? <MaterialCommunityIcons name={slide.icon as any} size={36} color={t.accent} />
            : <Ionicons name={slide.icon as any} size={36} color={t.accent} />}
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: t.txt1 }]}>{slide.title}</Text>

        {/* Body */}
        <Text style={[styles.body, { color: t.txt2 }]}>{slide.body}</Text>

        {/* Dot indicator — tap any dot to jump to that slide */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => setStep(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <View style={[
                styles.dot,
                { backgroundColor: i === step ? t.accent : t.border },
                i === step && styles.dotActive,
              ]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Back / Next row — back only appears from slide 2 onwards */}
        <View style={styles.btnRow}>
          {!isFirst && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleBack}
              style={[styles.btnSecondary, { borderColor: t.border }]}
            >
              <Ionicons name="chevron-back" size={20} color={t.txt1} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleNext}
            style={[styles.btnPrimary, { backgroundColor: t.accent }]}
          >
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
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 0,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 24,
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
