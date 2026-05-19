import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import Sound from 'react-native-sound';

// Enable playback in silence mode
Sound.setCategory('Playback');

export interface SimpleAudioPlayerRef {
  playNote: (midiNote: number, volume: number) => void;
  stopAll: () => void;
}

const SimpleAudioPlayer = forwardRef<SimpleAudioPlayerRef>((props, ref) => {
  const soundRefs = useRef<{ [key: number]: Sound }>({});

  useImperativeHandle(ref, () => ({
    playNote: (midiNote: number, volume: number) => {
      // For now, we'll use a simple mapping to available sound files
      // This is a basic implementation - you'd need actual sound files
      const noteName = getNoteName(midiNote);
      const soundFile = getSoundFile(noteName);
      
      if (soundFile && !soundRefs.current[midiNote]) {
        const sound = new Sound(soundFile, Sound.MAIN_BUNDLE, (error) => {
          if (error) {
            console.log('Failed to load sound', error);
            return;
          }
          
          sound.setVolume(volume / 100);
          sound.play(() => {
            sound.release();
            delete soundRefs.current[midiNote];
          });
        });
        
        soundRefs.current[midiNote] = sound;
      }
    },
    
    stopAll: () => {
      Object.values(soundRefs.current).forEach(sound => {
        sound.stop();
        sound.release();
      });
      soundRefs.current = {};
    }
  }));

  const getNoteName = (midi: number): string => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return notes[noteIndex] + octave;
  };

  const getSoundFile = (noteName: string): string | null => {
    // Map notes to available sound files
    // You would need to add actual sound files to your assets
    const soundMap: { [key: string]: string } = {
      'C4': 'piano_c4.wav',
      'D4': 'piano_d4.wav',
      'E4': 'piano_e4.wav',
      'F4': 'piano_f4.wav',
      'G4': 'piano_g4.wav',
      'A4': 'piano_a4.wav',
      'B4': 'piano_b4.wav',
    };
    
    return soundMap[noteName] || null;
  };

  return <View />;
});

SimpleAudioPlayer.displayName = 'SimpleAudioPlayer';

export default SimpleAudioPlayer;
