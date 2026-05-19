import React, { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Audio } from 'expo-av'; // BRING THIS BACK just for OS configuration
import { AUDIO_ASSETS } from '@shared/audio/audioAssets';
import { getAudioEngineHtml } from './audioEngine'; // Update this import

// (Keep your interfaces here: PlayNotesConfig, PlayMeasureConfig, ProgressionMeasure, SoundfontPlayerRef)
export interface PlayNotesConfig { arp: boolean; bpm: number; volume: number; guitar?: boolean; scale?: boolean; hold?: boolean; arpSwing?: boolean; refFreq?: number; }
export interface PlayMeasureConfig { bpm: number; volume: number; guitar?: boolean; arp?: boolean; resetClock?: boolean; bassEnabled?: boolean; metronomeEnabled?: boolean; arpSwing?: boolean; beats?: number; rhythm?: string; voiceLeading?: boolean; intervals?: number[]; nextRoot?: number; rootSemi?: number; refFreq?: number; bassLine?: number[]; countOff?: boolean; bassVolume?: number; clickVolume?: number; hiCutFreq?: number; hiCutGain?: number; skipTransitionFade?: boolean; }
export interface ProgressionMeasure { chordIdx: number; midiNotes: number[]; beats: number; bpm: number; volume: number; guitar: boolean; arp: boolean; arpSwing: boolean; rhythm: string; intervals: number[]; nextRoot: number; rootSemi: number; bassLine: number[]; bassEnabled: boolean; metronomeEnabled: boolean; voiceLeading: boolean; resetBassState: boolean; bassVolume: number; clickVolume: number; hiCutFreq: number; hiCutGain: number; }

export interface SoundfontPlayerRef {
  playNotes: (midiNotes: number[], config: PlayNotesConfig) => void;
  playSingleNote: (midi: number, volume: number, guitar?: boolean) => void;
  playArpLoop: (midiNotes: number[], bpm: number, volume: number, guitar?: boolean, arpSwing?: boolean) => void;
  stop: () => void;
  playMeasure: (midiNotes: number[], config: PlayMeasureConfig) => void;
  playTone: (midi: number, volume: number) => void;
  stopTone: () => void;
  playProgression: (sequence: ProgressionMeasure[], onChordChange: (seqIdx: number, chordIdx: number) => void, onEnd: () => void, loop?: boolean) => void;
  stopProgression: () => void;
  setProgressionLooping: (loop: boolean) => void;
}

const SoundfontPlayer = forwardRef<SoundfontPlayerRef>((_, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  
  const progSchedulerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progSeqRef = useRef<ProgressionMeasure[]>([]);
  const progSeqIdxRef = useRef(0);
  const progIsLoopingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Configure OS Audio Session on mount
  useEffect(() => {
    const initOSAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true, // This allows WebView to play when switch is set to silent
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {
        console.warn('Failed to set OS audio mode:', e);
      }
    };
    initOSAudio();

    return () => stopAll();
  }, []);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ENGINE_READY') {
        console.log("Audio Engine Ready! Initial Context State:", data.state); 
        setIsEngineReady(true);
      } else if (data.type === 'LOG') {
        console.log("[WebView Engine]:", data.message);
      }
    } catch (e) {
      console.warn("WebView Message Error:", e);
    }
  };

  const sendSchedule = (events: any[]) => {
    if (!isEngineReady || !webViewRef.current) {
        console.warn("Dropped audio: Engine not ready yet");
        return;
    }
    
    // Log telemetry before bridging
    if (events.length > 0) {
      console.log(`Sending ${events.length} notes. First note volume: ${events[0].volume}`);
    }

    webViewRef.current.postMessage(JSON.stringify({
      type: 'PLAY_SCHEDULE',
      events: events
    }));
  };

  const stopAll = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (progSchedulerRef.current) clearTimeout(progSchedulerRef.current);
    
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'STOP_ALL' }));
    }
  };

  useImperativeHandle(ref, () => ({
    stop: stopAll,
    
    playNotes: (midiNotes, config) => {
      stopAll();
      const instrument = config.guitar ? 'guitar' : 'piano';
      const vol = config.volume / 100;
      const cleanNotes = midiNotes.filter(n => n !== null && !isNaN(n));
      const events: any[] = [];

      cleanNotes.forEach((midi, index) => {
        let delaySecs = 0;
        if (config.arp) {
          const beatSecs = 60 / config.bpm;
          const beatIndex = Math.floor(index / 2);
          const isOffbeat = index % 2 === 1;
          delaySecs = beatIndex * beatSecs + (isOffbeat ? beatSecs * (config.arpSwing ? 0.66 : 0.5) : 0);
        } else if (config.guitar) {
          delaySecs = index * 0.012;
        }

        events.push({
          instrument,
          midi,
          volume: vol,
          timeOffset: delaySecs,
          durationMs: config.hold ? null : 2000
        });
      });

      sendSchedule(events);
    },

    playSingleNote: (midi, volume, guitar = false) => {
      sendSchedule([{ instrument: guitar ? 'guitar' : 'piano', midi, volume: volume / 100, timeOffset: 0, durationMs: 2000 }]);
    },

    playTone: (midi, volume) => {
      sendSchedule([{ instrument: 'piano', midi, volume: volume / 100, timeOffset: 0, durationMs: null }]);
    },
    
    stopTone: stopAll,

    playArpLoop: (midiNotes, bpm, volume, guitar = false, arpSwing = false) => {
      stopAll();
      const instrument = guitar ? 'guitar' : 'piano';
      const vol = volume / 100;
      const cleanNotes = midiNotes.filter(n => n !== null && !isNaN(n));
      if (!cleanNotes.length) return;
      
      let noteIdx = 0;
      const beatMs = 60000 / bpm;
      
      const playNextArp = () => {
          const midi = cleanNotes[noteIdx % cleanNotes.length];
          sendSchedule([{ instrument, midi, volume: vol, timeOffset: 0, durationMs: beatMs * 1.5 }]);
          
          const isOffbeat = noteIdx % 2 === 1;
          const delayToNext = isOffbeat ? beatMs * (arpSwing ? 0.66 : 0.5) : beatMs * (arpSwing ? 1.34 : 0.5);
          
          noteIdx++;
          timersRef.current.push(setTimeout(playNextArp, delayToNext));
      };
      playNextArp();
    },

    playMeasure: (midiNotes, config) => {
      if (config.countOff) {
        const beatSecs = 60 / config.bpm;
        const beats = config.beats || 4;
        const clickVol = (config.clickVolume ?? 80) / 100;
        const events = [];
        for (let i = 0; i < beats; i++) {
          events.push({ instrument: 'piano', midi: i === 0 ? 84 : 76, volume: clickVol, timeOffset: i * beatSecs, durationMs: 500 });
        }
        sendSchedule(events);
        return;
      }

      const instrument = config.guitar ? 'guitar' : 'piano';
      const vol = config.volume / 100;
      const cleanNotes = midiNotes.filter(n => n !== null && !isNaN(n));
      const events: any[] = [];

      cleanNotes.forEach((midi, index) => {
         const delaySecs = config.guitar ? index * 0.012 : 0;
         events.push({ instrument, midi, volume: vol, timeOffset: delaySecs, durationMs: 2000 });
      });
      
      if (config.bassEnabled && cleanNotes.length > 0) {
         events.push({ instrument: 'bass', midi: cleanNotes[0], volume: (config.bassVolume ?? 70) / 100, timeOffset: 0, durationMs: 2500 });
      }

      sendSchedule(events);
    },

    playProgression: (sequence, onChordChange, onEnd, loop = false) => {
      if (!sequence.length) return;
      stopAll();
      
      progSeqRef.current = sequence;
      progSeqIdxRef.current = 0;
      progIsLoopingRef.current = loop;

      const runNextMeasure = () => {
        if (progSeqIdxRef.current >= progSeqRef.current.length) {
            if (progIsLoopingRef.current) { progSeqIdxRef.current = 0; } 
            else { onEnd(); return; }
        }

        const measure = progSeqRef.current[progSeqIdxRef.current];
        onChordChange(progSeqIdxRef.current, measure.chordIdx);
        
        const instrument = measure.guitar ? 'guitar' : 'piano';
        const vol = measure.volume / 100;
        const beatSecs = 60 / measure.bpm; 
        
        let chordStrikesSecs: number[] = [0];
        switch (measure.rhythm) {
            case 'swing': chordStrikesSecs = [0, beatSecs * 1.66]; break;
            case 'bossanova': chordStrikesSecs = [beatSecs * 0.5, beatSecs * 1.5, beatSecs * 2.5, beatSecs * 3.5]; break;
            case 'waltz': chordStrikesSecs = [beatSecs, beatSecs * 2]; break;
            case 'reggae':
            case 'twostep': chordStrikesSecs = [beatSecs * 0.5, beatSecs * 1.5, beatSecs * 2.5, beatSecs * 3.5]; break;
            default: chordStrikesSecs = [0]; break;
        }

        const events: any[] = [];

        chordStrikesSecs.forEach(strikeTime => {
            measure.midiNotes.forEach((midi, i) => {
                const guitarStaggerSecs = measure.guitar ? i * 0.012 : 0;
                events.push({ instrument, midi, volume: vol, timeOffset: strikeTime + guitarStaggerSecs, durationMs: beatSecs * 1500 });
            });
        });

        if (measure.bassEnabled && measure.bassLine && measure.bassLine.length > 0) {
            measure.bassLine.forEach((bassMidi, i) => {
                events.push({ instrument: 'bass', midi: bassMidi, volume: measure.bassVolume / 100, timeOffset: i * beatSecs, durationMs: beatSecs * 1500 });
            });
        } else if (measure.bassEnabled && measure.midiNotes.length > 0) {
             events.push({ instrument: 'bass', midi: measure.midiNotes[0], volume: measure.bassVolume / 100, timeOffset: 0, durationMs: 2500 });
        }

        if (measure.metronomeEnabled) {
            for (let i = 0; i < measure.beats; i++) {
                events.push({ instrument: 'piano', midi: i === 0 ? 84 : 76, volume: measure.clickVolume / 100, timeOffset: i * beatSecs, durationMs: 500 });
            }
        }

        sendSchedule(events);

        const currentMeasureMs = (beatSecs * 1000) * measure.beats;
        progSeqIdxRef.current++;
        progSchedulerRef.current = setTimeout(runNextMeasure, currentMeasureMs);
      };

      runNextMeasure();
    },

    stopProgression: stopAll,
    setProgressionLooping: (loop) => { progIsLoopingRef.current = loop; }
  }));

return (
    <View style={{ width: 0, height: 0, opacity: 0 }}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        // Inject the HTML and the Assets simultaneously!
        source={{ html: getAudioEngineHtml(AUDIO_ASSETS) }} 
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
});

export default SoundfontPlayer;