import React, { useState } from 'react';
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
    body: 'Jazz Chord Practice helps you learn chords, voicings, and progressions on piano and guitar. Here\'s a quick tour.',
  },
  {
    icon: 'compass-outline',
    title: 'Explore Chords',
    body: 'Use the ‹ › steppers to change the root and chord quality. Voicing tabs switch between triads, shells, drop voicings, scales, arpeggios, and more.',
  },
  {
    icon: 'play-circle-outline',
    title: 'Hear Every Voicing',
    body: 'Tap Play or any dot/key to hear notes. Switch Piano and Guitar at the top. The Dictionary mode shows every shape at once for quick browsing.',
  },
  {
    icon: 'musical-notes-outline',
    title: 'Song & Quiz',
    body: 'Build progressions in the Song tab and play them back. Quiz yourself by sight and ear — great for training your ear to recognize chords.',
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
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  const handleNext = () => {
    if (isLast) {
      onDismiss();
      // Reset for if user re-opens (shouldn't happen, but defensive)
      setStep(0);
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    onDismiss();
    setStep(0);
  };

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

        {/* Dot indicator */}
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

        {/* Buttons */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleNext}
          style={[styles.btn, { backgroundColor: t.accent }]}
        >
          <Text style={styles.btnText}>{isLast ? 'Get Started' : 'Next'}</Text>
        </TouchableOpacity>

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
  btn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
