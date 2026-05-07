import React, { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AudioContext, OscillatorNode, GainNode, BiquadFilterNode, AudioBufferSourceNode, AudioBuffer } from 'react-native-audio-api';
import { Buffer } from 'buffer';

import { AUDIO_ASSETS } from '@shared/audio/audioAssets';

// ── Constants ──────────────────────────────────────────────────────────────────
const ARP_SLOTS = 8;
const VOLUME_SCALE = 8.0;
const FADE_OUT_TIME = 0.05;
const PIANO_DECAY = 2.8;
const GUITAR_DECAY = 2.2;
const REFERENCE_FREQ = 440;

export interface PlayNotesConfig { arp: boolean; bpm: number; volume: number; guitar?: boolean; scale?: boolean; hold?: boolean; arpSwing?: boolean; refFreq?: number; }
export interface PlayMeasureConfig { bpm: number; volume: number; guitar?: boolean; arp?: boolean; resetClock?: boolean; bassEnabled?: boolean; metronomeEnabled?: boolean; arpSwing?: boolean; beats?: number; rhythm?: string; voiceLeading?: boolean; intervals?: number[]; nextRoot?: number; rootSemi?: number; refFreq?: number; bassLine?: number[]; countOff?: boolean; bassVolume?: number; clickVolume?: number; hiCutFreq?: number; hiCutGain?: number; skipTransitionFade?: boolean; }

export interface ProgressionMeasure {
  chordIdx:         number;
  midiNotes:        number[];
  beats:            number;
  bpm:              number;
  volume:           number;  // chord volume 0-100
  guitar:           boolean;
  arp:              boolean;
  arpSwing:         boolean;
  rhythm:           string;
  intervals:        number[];
  nextRoot:         number;
  rootSemi:         number;
  bassLine:         number[];
  bassEnabled:      boolean;
  metronomeEnabled: boolean;
  voiceLeading:     boolean;
  resetBassState:   boolean;  // true for first measure of each loop pass
  bassVolume:       number;   // bass level 0-100
  clickVolume:      number;   // click level 0-100
  hiCutFreq:        number;   // highshelf start Hz (e.g. 3500)
  hiCutGain:        number;   // highshelf gain dB, negative = cut (e.g. -8)
}

export interface SoundfontPlayerRef {
  playNotes: (midiNotes: number[], config: PlayNotesConfig) => void;
  playSingleNote: (midi: number, volume: number, guitar?: boolean) => void;
  playArpLoop: (midiNotes: number[], bpm: number, volume: number, guitar?: boolean, arpSwing?: boolean) => void;
  stop: () => void;
  playMeasure: (midiNotes: number[], config: PlayMeasureConfig) => void;
  playTone: (midi: number, volume: number) => void;
  stopTone: () => void;
  // ── Look-ahead progression scheduler ──────────────────────────────────────
  playProgression: (sequence: ProgressionMeasure[], onChordChange: (seqIdx: number, chordIdx: number) => void, onEnd: () => void, loop?: boolean) => void;
  stopProgression: () => void;
  setProgressionLooping: (loop: boolean) => void;
}

const SoundfontPlayer = forwardRef<SoundfontPlayerRef>((_, ref) => {
  const [isReady, setIsReady] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  const pianoBuffersRef = useRef<Record<number, AudioBuffer>>({});
  const guitarBuffersRef = useRef<Record<number, AudioBuffer>>({});
  const bassBuffersRef = useRef<Record<number, AudioBuffer>>({});
  
  const activeGainsRef = useRef<GainNode[]>([]);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const masterGainRef = useRef<GainNode | null>(null); // NEW: The Master Output Bus
  
  const arpLoopHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingArpRef = useRef(false);
  
  const nextMeasureStartRef = useRef<number>(0);
  const lastVoicingRef = useRef<number[] | undefined>();
  const nextBassTargetRef = useRef<number | null>(null);
  const bossaBeatRef = useRef(0);
  const reggaeToggleRef = useRef(false);
  
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Progression look-ahead scheduler ──────────────────────────────────────
  const selfHandleRef       = useRef<SoundfontPlayerRef | null>(null);
  const progSeqRef          = useRef<ProgressionMeasure[]>([]);
  const progSeqIdxRef       = useRef(0);
  const progSchedulerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const progIsLoopingRef    = useRef(false);
  const progOnChordChange   = useRef<((seqIdx: number, chordIdx: number) => void) | null>(null);
  const progOnEnd           = useRef<(() => void) | null>(null);

  // Init AudioContext
  useEffect(() => {
    let ctx = new AudioContext();
    audioCtxRef.current = ctx;

    // Create the Master Bus and connect it to the device speakers
    let master = ctx.createGain();
    master.connect(ctx.destination);
    masterGainRef.current = master;

    const midiToNoteName = (midi: number) => {
      const notes = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
      const octave = Math.floor(midi / 12) - 1;
      return notes[midi % 12] + octave;
    };

    const loadSample = async (midi: number, buffers: Record<number, AudioBuffer>, instrumentKey: 'piano' | 'guitar' | 'bass') => {
      if (buffers[midi]) return;
      
      const noteName = midiToNoteName(midi);
      const base64Data = (AUDIO_ASSETS as any)[instrumentKey][noteName];
      
      if (!base64Data) return;
      
      try {
        const base64 = base64Data.split(',')[1];
        const arrayBuffer = Buffer.from(base64, 'base64').buffer;
        
        // Give mobile devices enough time to decode — 150ms was far too short
        // and caused all samples to silently resolve as null, killing all audio.
        const decodePromise = ctx.decodeAudioData(arrayBuffer);
        const timeoutPromise = new Promise<AudioBuffer | null>((resolve) => setTimeout(() => resolve(null), 3000));
        
        const buffer = await Promise.race([decodePromise, timeoutPromise]);
        
        if (buffer) {
          buffers[midi] = buffer;
        }
      } catch (e) {
        console.log('Error decoding sample', instrumentKey, midi, e);
      }
    };

    // Load an array of (midi, buffers, key) tuples in serial batches to avoid
    // overwhelming the mobile decoder with 45 simultaneous decodes.
    const loadBatched = async (
      tasks: Array<{ midi: number; buffers: Record<number, AudioBuffer>; key: 'piano' | 'guitar' | 'bass' }>,
      batchSize = 5
    ) => {
      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        await Promise.all(batch.map(t => loadSample(t.midi, t.buffers, t.key)));
      }
    };

    const preloadCoreNotes = async () => {
      const coreNotes = [36,40,43,45,48,52,55,57,60,64,67,69,72,76,79,81,84,88,91,93,96];
      const guitarNotes = [40,43,45,47,48,50,52,55,57,59,60,62,64,67,69,71,72,76,79];
      const bassNotes = [36, 40, 45, 48, 52]; 

      const tasks = [
        ...coreNotes.map(m => ({ midi: m, buffers: pianoBuffersRef.current, key: 'piano' as const })),
        ...guitarNotes.map(m => ({ midi: m, buffers: guitarBuffersRef.current, key: 'guitar' as const })),
        ...bassNotes.map(m => ({ midi: m, buffers: bassBuffersRef.current, key: 'bass' as const })),
      ];

      await loadBatched(tasks, 5);
      
      setIsReady(true);
    };

    preloadCoreNotes();

    return () => {
      if (progSchedulerRef.current !== null) clearInterval(progSchedulerRef.current);
      stopAllActive();
      ctx.close();
    };
  }, []);

  const getClosest = (midi: number, buffers: Record<number, AudioBuffer>) => {
    if (buffers[midi]) return midi;
    for (let d = 1; d <= 127; d++) {
      if (buffers[midi - d]) return midi - d;
      if (buffers[midi + d]) return midi + d;
    }
    return null;
  };

  const loadSampleLazy = (midi: number, buffers: Record<number, AudioBuffer>, instrumentKey: 'piano' | 'guitar' | 'bass') => {
    if (buffers[midi]) return;
    const noteName = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][midi % 12] + (Math.floor(midi / 12) - 1);
    const base64Data = (AUDIO_ASSETS as any)[instrumentKey][noteName];
    if (!base64Data) return;
    
    const base64 = base64Data.split(',')[1];
    const arrayBuffer = Buffer.from(base64, 'base64').buffer;
    audioCtxRef.current?.decodeAudioData(arrayBuffer).then(buffer => {
        if(buffer) buffers[midi] = buffer;
    }).catch(()=>{});
  };

  const stopAllActive = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // 1. Fade out the old Master Bus perfectly (it's always exactly 1.0, so no bugs!)
    const oldMaster = masterGainRef.current;
    if (oldMaster) {
      try {
        oldMaster.gain.setValueAtTime(1.0, now);
        oldMaster.gain.linearRampToValueAtTime(0.0001, now + 0.04);
      } catch(e) {}
      // Detach it from the speakers after it goes silent
      setTimeout(() => { try { oldMaster.disconnect(); } catch(e) {} }, 100);
    }

    // 2. Instantly create a fresh, clean Master Bus for the next notes
    let newMaster = ctx.createGain();
    newMaster.connect(ctx.destination);
    masterGainRef.current = newMaster;

    // 3. Stop the old sources quietly behind the scenes to free memory
    const sourcesToStop = activeSourcesRef.current.slice();
    const oscsToStop = activeOscillatorsRef.current.slice();

    activeGainsRef.current = [];
    activeSourcesRef.current = [];
    activeOscillatorsRef.current = [];

    sourcesToStop.forEach(s => { try { s.stop(now + 0.05); } catch(e) {} });
    oscsToStop.forEach(o => { try { o.stop(now + 0.05); } catch(e) {} });

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const resumeCtx = () => {
    const ctx = audioCtxRef.current;
    // On mobile the AudioContext can start in a 'suspended' state and must be
    // resumed after the first user gesture before any audio will play.
    if (ctx && (ctx as any).state === 'suspended') {
      (ctx as any).resume().catch(() => {});
    }
  };

  const playClick = (time: number, isDownbeat: boolean, volScale: number = 1.0) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    resumeCtx();

    const freq = isDownbeat ? 1400 : 900;
    const peak = (isDownbeat ? 0.5 : 0.35) * volScale;

    let osc = ctx.createOscillator();
    // Bandpass filter sharpens the "tick" character and reduces bleed into chord frequencies
    let filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.5;
    let gain = ctx.createGain();

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainRef.current!);

    osc.frequency.value = freq;

    // Start from near-silence → sharp attack → exponential decay to near-silence → stop
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.003);   // 3 ms attack
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);  // 52 ms decay to silence

    osc.start(time);
    osc.stop(time + 0.060); // stop exactly when gain is near-silent — no pop
  };

  const playBuffer = (midi: number, buffers: Record<number, AudioBuffer>, _: any, volume: number, delay: number, decay: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    resumeCtx();

    const playNow = () => {
      const closest = getClosest(midi, buffers);
      if (closest === null) return;
      const now = ctx.currentTime + (delay || 0) + 0.015;
      let source = ctx.createBufferSource();
      let gain = ctx.createGain();
      
      source.buffer = buffers[closest];
      source.playbackRate.value = Math.pow(2, (midi - closest) / 12) * (REFERENCE_FREQ / 440.0);
      
      gain.gain.setValueAtTime(0, now);
      
      // Slightly different envelopes for different decay constants
      if (decay === PIANO_DECAY) {
          gain.gain.linearRampToValueAtTime(volume * 0.6, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(volume * 0.3, now + 1.2);
      } else if (decay === GUITAR_DECAY) {
          gain.gain.linearRampToValueAtTime(volume * 0.5, now + 0.015);
          gain.gain.exponentialRampToValueAtTime(volume * 0.35, now + 0.6);
      } else {
          gain.gain.linearRampToValueAtTime(volume, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(volume * 0.4, now + 0.5);
      }
      
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      
      source.connect(gain);
      gain.connect(masterGainRef.current!);
      source.start(now);
      source.stop(now + decay + 0.1);
      
      activeGainsRef.current.push(gain);
      activeSourcesRef.current.push(source);
      
      setTimeout(() => {
        try {
          source.disconnect();
          gain.disconnect();
          const gIdx = activeGainsRef.current.indexOf(gain);
          if (gIdx > -1) activeGainsRef.current.splice(gIdx, 1);
          const sIdx = activeSourcesRef.current.indexOf(source);
          if (sIdx > -1) activeSourcesRef.current.splice(sIdx, 1);
        } catch(e) {}
      }, ((delay || 0) * 1000) + (decay * 1000) + 200);
    };

    if (buffers[midi]) { playNow(); }
    else { playNow(); loadSampleLazy(midi, buffers, decay === PIANO_DECAY ? 'piano' : 'guitar'); }
  };

  // Like playBuffer but takes a pre-computed ABSOLUTE Web Audio clock time instead of a
  // relative delay.  All notes in a chord call this with the same absTime so ctx.currentTime
  // is never re-sampled per-note — eliminating the JS-loop micro-drift that made chords dirty.
  const scheduleBuffer = (absTime: number, midi: number, buffers: Record<number, AudioBuffer>, volume: number, decay: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    resumeCtx();
    const playNow = () => {
      const closest = getClosest(midi, buffers);
      if (closest === null) return;
      const t = Math.max(absTime, ctx.currentTime + 0.015);
      let source = ctx.createBufferSource();
      let gain   = ctx.createGain();
      source.buffer = buffers[closest];
      source.playbackRate.value = Math.pow(2, (midi - closest) / 12) * (REFERENCE_FREQ / 440.0);
      gain.gain.setValueAtTime(0, t);
      if (decay === PIANO_DECAY) {
        gain.gain.linearRampToValueAtTime(volume * 0.6, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(volume * 0.3, t + 1.2);
      } else if (decay === GUITAR_DECAY) {
        gain.gain.linearRampToValueAtTime(volume * 0.5, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(volume * 0.35, t + 0.6);
      } else {
        gain.gain.linearRampToValueAtTime(volume, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(volume * 0.4, t + 0.5);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      source.connect(gain);
      gain.connect(masterGainRef.current!);
      source.start(t);
      source.stop(t + decay + 0.1);
      activeGainsRef.current.push(gain);
      activeSourcesRef.current.push(source);
      const cleanupMs = Math.max(0, (t - ctx.currentTime) * 1000) + decay * 1000 + 200;
      setTimeout(() => {
        try {
          source.disconnect(); gain.disconnect();
          const gIdx = activeGainsRef.current.indexOf(gain);
          if (gIdx > -1) activeGainsRef.current.splice(gIdx, 1);
          const sIdx = activeSourcesRef.current.indexOf(source);
          if (sIdx > -1) activeSourcesRef.current.splice(sIdx, 1);
        } catch(e) {}
      }, cleanupMs);
    };
    if (buffers[midi]) { playNow(); }
    else { playNow(); loadSampleLazy(midi, buffers, decay === PIANO_DECAY ? 'piano' : 'guitar'); }
  };

  const playBassBuffer = (midi: number, volume: number, delay: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    resumeCtx();

    const playNow = () => {
      const closest = getClosest(midi, bassBuffersRef.current);
      if (closest === null) return;
      const now = ctx.currentTime + (delay || 0);
      let source = ctx.createBufferSource();
      source.buffer = bassBuffersRef.current[closest];
      source.playbackRate.value = Math.pow(2, (midi - closest) / 12) * (REFERENCE_FREQ / 440.0);
      
      let filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 65; 

      let gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume * 1.0, now + 0.02); 
      gain.gain.exponentialRampToValueAtTime(volume * 0.4, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
      
      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGainRef.current!);
      source.start(now);
      source.stop(now + 2.1);
      
      activeGainsRef.current.push(gain);
      activeSourcesRef.current.push(source);
      
      setTimeout(() => {
        try {
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
          const gIdx = activeGainsRef.current.indexOf(gain);
          if (gIdx > -1) activeGainsRef.current.splice(gIdx, 1);
          const sIdx = activeSourcesRef.current.indexOf(source);
          if (sIdx > -1) activeSourcesRef.current.splice(sIdx, 1);
        } catch(e) {}
      }, ((delay || 0) * 1000) + 2200);
    };

    if (bassBuffersRef.current[midi]) { playNow(); }
    else { playNow(); loadSampleLazy(midi, bassBuffersRef.current, 'bass'); }
  };

  const playSynthNote = (midi: number, volume: number, delay: number, isGuitar: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    resumeCtx();
    let freq = REFERENCE_FREQ * Math.pow(2, (midi - 69) / 12);
    let now = ctx.currentTime + (delay || 0) + 0.015;
    let osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    let filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = isGuitar ? 5000 : 4000;
    filter.Q.value = isGuitar ? 0.6 : 0.5;
    
    let gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    
    if (isGuitar) {
        gain.gain.linearRampToValueAtTime(volume * 0.55, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(volume * 0.3, now + 0.4);
        gain.gain.setValueAtTime(volume * 0.3, now + 0.4);
    } else {
        gain.gain.linearRampToValueAtTime(volume * 0.75, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(volume * 0.45, now + 0.25);
        gain.gain.setValueAtTime(volume * 0.45, now + 0.25);
    }
    
    osc.connect(gain);
    gain.connect(filter);
    filter.connect(masterGainRef.current!);
    osc.start(now);
    
    activeGainsRef.current.push(gain);
    activeOscillatorsRef.current.push(osc);
  };

  const stopArpLoop = () => {
    if (arpLoopHandleRef.current) {
      clearTimeout(arpLoopHandleRef.current);
      arpLoopHandleRef.current = null;
    }
    isPlayingArpRef.current = false;
  };

  const playArpLoopInternal = (notes: number[], vol: number, isGuitar: boolean, bpm: number, swing: boolean) => {
    stopArpLoop();
    let beatMs = 60000 / bpm;
    let pattern: number[] = [];
    if (notes.length > 0) {
        for (let i = 0; i < ARP_SLOTS; i++) {
            pattern.push(notes[i % notes.length]);
        }
    }
    
    isPlayingArpRef.current = true;
    const buffers = isGuitar ? guitarBuffersRef.current : pianoBuffersRef.current;
    const instrumentKey = isGuitar ? 'guitar' : 'piano';
    const decay = isGuitar ? GUITAR_DECAY : PIANO_DECAY;

    // Load any missing samples immediately
    const uniqueMidis = pattern.filter((m, i, a) => a.indexOf(m) === i);
    uniqueMidis.forEach(m => loadSampleLazy(m, buffers, instrumentKey));

    const playMeasure = () => {
      if (!isPlayingArpRef.current || !audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      let now = ctx.currentTime + 0.02;
      
      pattern.forEach((midi, i) => {
        let beatIndex = Math.floor(i / 2);
        let isOffbeat = i % 2 === 1;
        let offsetMs = beatIndex * beatMs + (isOffbeat ? beatMs * (swing ? 0.66 : 0.5) : 0);
        let delay = now + (offsetMs / 1000) - ctx.currentTime;
        if (delay < 0) delay = 0;
        
        playBuffer(midi, buffers, null, vol, delay, decay);
      });
      
      arpLoopHandleRef.current = setTimeout(() => {
        playMeasure();
      }, beatMs * (ARP_SLOTS / 2));
    };
    
    playMeasure();
  };

  // Like scheduleBuffer but inserts a highshelf EQ cut after the gain node so that
  // guitar/piano chord highs don't mask the bass in progression playback.
  // cutFreq: shelf start in Hz (e.g. 3500), cutGainDb: negative = reduce (e.g. -8).
  const scheduleBufferWithHighCut = (absTime: number, midi: number, buffers: Record<number, AudioBuffer>, volume: number, decay: number, cutFreq: number, cutGainDb: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    resumeCtx();
    const playNow = () => {
      const closest = getClosest(midi, buffers);
      if (closest === null) return;
      const t = Math.max(absTime, ctx.currentTime + 0.015);
      let source   = ctx.createBufferSource();
      let gain     = ctx.createGain();
      let eqFilter = ctx.createBiquadFilter();
      eqFilter.type = 'highshelf';
      eqFilter.frequency.value = cutFreq;
      eqFilter.gain.value      = cutGainDb; // negative → attenuate highs
      source.buffer = buffers[closest];
      source.playbackRate.value = Math.pow(2, (midi - closest) / 12) * (REFERENCE_FREQ / 440.0);
      gain.gain.setValueAtTime(0, t);
      if (decay === PIANO_DECAY) {
        gain.gain.linearRampToValueAtTime(volume * 0.6, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(volume * 0.3, t + 1.2);
      } else if (decay === GUITAR_DECAY) {
        gain.gain.linearRampToValueAtTime(volume * 0.5, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(volume * 0.35, t + 0.6);
      } else {
        gain.gain.linearRampToValueAtTime(volume, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(volume * 0.4, t + 0.5);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      source.connect(gain);
      gain.connect(eqFilter);
      eqFilter.connect(masterGainRef.current!);
      source.start(t);
      source.stop(t + decay + 0.1);
      activeGainsRef.current.push(gain);
      activeSourcesRef.current.push(source);
      const cleanupMs = Math.max(0, (t - ctx.currentTime) * 1000) + decay * 1000 + 200;
      setTimeout(() => {
        try {
          source.disconnect(); gain.disconnect(); eqFilter.disconnect();
          const gIdx = activeGainsRef.current.indexOf(gain);
          if (gIdx > -1) activeGainsRef.current.splice(gIdx, 1);
          const sIdx = activeSourcesRef.current.indexOf(source);
          if (sIdx > -1) activeSourcesRef.current.splice(sIdx, 1);
        } catch(e) {}
      }, cleanupMs);
    };
    if (buffers[midi]) { playNow(); }
    else { playNow(); loadSampleLazy(midi, buffers, decay === PIANO_DECAY ? 'piano' : 'guitar'); }
  };

  // ── Progression look-ahead scheduler ─────────────────────────────────────
  const PROG_LOOK_AHEAD = 0.25; // seconds to schedule ahead of the audio clock

  const stopProgressionScheduler = () => {
    if (progSchedulerRef.current !== null) {
      clearInterval(progSchedulerRef.current);
      progSchedulerRef.current = null;
    }
  };

  // Runs every 25 ms. Schedules any measures whose audio-start time falls within
  // the look-ahead window. Decoupled from the JS bridge — the Web Audio clock
  // drives all timing decisions, so JS-thread jitter cannot cause stutters.
  const progSchedulerTick = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const seq = progSeqRef.current;
    if (!seq.length) { stopProgressionScheduler(); return; }

    const lookAheadUntil = ctx.currentTime + PROG_LOOK_AHEAD;

    while (progSeqIdxRef.current < seq.length) {
      // Stop scheduling if the next measure's start is beyond the look-ahead window
      if (nextMeasureStartRef.current >= lookAheadUntil) break;

      const measure = seq[progSeqIdxRef.current];

      // Reset bass/rhythm state machines at the start of each loop pass
      if (measure.resetBassState) {
        nextBassTargetRef.current = null;
        bossaBeatRef.current      = 0;
        reggaeToggleRef.current   = false;
      }

      // Capture the audio start time BEFORE playMeasure advances nextMeasureStartRef
      const measureAudioStart = nextMeasureStartRef.current;
      const cbSeqIdx          = progSeqIdxRef.current;
      const cbChordIdx        = measure.chordIdx;

      // Schedule audio directly into the Web Audio clock via the existing playMeasure path
      selfHandleRef.current?.playMeasure(measure.midiNotes, {
        bpm:              measure.bpm,
        volume:           measure.volume,
        guitar:           measure.guitar,
        arp:              measure.arp,
        arpSwing:         measure.arpSwing,
        beats:            measure.beats,
        rhythm:           measure.rhythm,
        intervals:        measure.intervals,
        nextRoot:         measure.nextRoot,
        rootSemi:         measure.rootSemi,
        bassLine:         measure.bassLine,
        bassEnabled:      measure.bassEnabled,
        metronomeEnabled: measure.metronomeEnabled,
        // Notes are pre-resolved from the displayed diagram voicings in buildSequence.
        // Forcing false prevents playMeasure's internal voice-leading from overwriting them.
        voiceLeading:     false,
        bassVolume:       measure.bassVolume,
        clickVolume:      measure.clickVolume,
        hiCutFreq:        measure.hiCutFreq,
        hiCutGain:        measure.hiCutGain,
        resetClock:          false,
        countOff:            false,
        skipTransitionFade:  true,
      });

      // Fire the UI callback at the exact audio-clock moment this measure starts.
      // Using audio-clock delta for the delay is far more stable than wall-clock math.
      const msDelay = Math.max(0, (measureAudioStart - ctx.currentTime) * 1000);
      setTimeout(() => progOnChordChange.current?.(cbSeqIdx, cbChordIdx), msDelay);

      progSeqIdxRef.current++;
    }

    // All measures scheduled — decide whether to loop or end
    if (progSeqIdxRef.current >= seq.length) {
      if (progIsLoopingRef.current) {
        // Seamless loop: reset index so the scheduler immediately starts the next pass.
        // nextMeasureStartRef continues uninterrupted — zero gap between passes.
        progSeqIdxRef.current = 0;
        // bass state reset will happen naturally via seq[0].resetBassState on next tick
      } else {
        stopProgressionScheduler();
        // Wait until the last scheduled measure finishes before firing onEnd
        const msUntilEnd = Math.max(10, (nextMeasureStartRef.current - ctx.currentTime) * 1000 + 10);
        setTimeout(() => progOnEnd.current?.(), msUntilEnd);
      }
    }
  };

  useImperativeHandle(ref, () => {
    const handle: SoundfontPlayerRef = {
    playNotes: (midiNotes, config) => {
      if (!isReady || !audioCtxRef.current) return;
      stopArpLoop();
      stopAllActive(); // Stop any currently playing notes before playing new ones
      
      let cleanNotes = midiNotes.filter(n => n !== null && !isNaN(n));
      const notes = cleanNotes.length > 0 ? cleanNotes : [36, 40, 43];
      
      const vol = (config.volume / 100) * VOLUME_SCALE;
      const isGuitar = config.guitar || false;
      const isArp = config.arp || false;
      const isHold = config.hold || false;
      const bpm = config.bpm;
      const swing = config.arpSwing || false;
      
      const buffers = isGuitar ? guitarBuffersRef.current : pianoBuffersRef.current;
      const decay = isGuitar ? GUITAR_DECAY : PIANO_DECAY;
      const instrumentKey = isGuitar ? 'guitar' : 'piano';

      if (isHold) {
        let synthVol = (config.volume / 100) * 0.35;
        notes.forEach((midi, i) => {
          let delay = isGuitar ? i * 0.03 : 0;
          playSynthNote(midi, synthVol, delay, isGuitar);
        });
      } else {
        notes.forEach(midi => loadSampleLazy(midi, buffers, instrumentKey));

        let beatMs = 60000 / bpm;
        notes.forEach((midi, i) => {
          let delay = 0;
          if (isArp) {
             let beatIndex = Math.floor(i / 2);
             let isOffbeat = i % 2 === 1;
             delay = (beatIndex * beatMs + (isOffbeat ? beatMs * (swing ? 0.66 : 0.5) : 0)) / 1000;
          } else if (isGuitar) {
             delay = i * 0.012; 
          }
          if (delay < 0.01) delay = 0.01;
          
          playBuffer(midi, buffers, null, vol, delay, decay);
        });
      }
    },
    playSingleNote: (midi, volume, guitar = false) => {
      if (!isReady || !audioCtxRef.current) return;
      if (!guitar) stopAllActive();
      
      const vol = (volume / 100) * VOLUME_SCALE;
      const buffers = guitar ? guitarBuffersRef.current : pianoBuffersRef.current;
      const decay = guitar ? GUITAR_DECAY : PIANO_DECAY;
      
      playBuffer(midi, buffers, null, vol, 0, decay);
    },
    playArpLoop: (midiNotes, bpm, volume, guitar = false, arpSwing = false) => {
      if (!isReady || !audioCtxRef.current) return;
      stopAllActive();
      playArpLoopInternal(midiNotes, (volume / 100) * VOLUME_SCALE, guitar, bpm, arpSwing);
    },
    stop: () => {
      stopArpLoop();
      stopAllActive();
    },
    playMeasure: (midiNotes, config) => {
      if (!isReady || !audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      
      const mCountOff = config.countOff;
      const mBpm = config.bpm;
      const mBeats = config.beats || 4;
      const mReset = config.resetClock;
      const now = ctx.currentTime;

      if (mCountOff) {
        if (mReset || now > nextMeasureStartRef.current + 0.5) {
             nextMeasureStartRef.current = now + 0.01;
        }
        let startTime = nextMeasureStartRef.current;
        let beatMs = 60000 / mBpm;
        nextMeasureStartRef.current += (beatMs * mBeats) / 1000; 
        for (let b = 0; b < mBeats; b++) {
           let beatTime = startTime + (beatMs / 1000) * b;
           if (beatTime >= ctx.currentTime) {
               playClick(beatTime, b === 0);
           }
        }
        return;
      }

      let cleanNotes = midiNotes.filter(n => n !== null && !isNaN(n));
      let mNotes = cleanNotes.length > 0 ? cleanNotes : [36, 40, 43];
      
      let mVol = (config.volume / 100) * VOLUME_SCALE;
      let mBassVol = ((config.bassVolume ?? 70) / 100) * VOLUME_SCALE;
      let mClickScale = (config.clickVolume ?? 80) / 100;
      let mHiCutFreq = config.hiCutFreq ?? 3500;
      let mHiCutGain = config.hiCutGain ?? -8;
      let mGuitar = config.guitar || false;
      let mArp = config.arp || false;
      let mBass = config.bassEnabled || false;
      let mMetronome = config.metronomeEnabled || false;
      let mSwing = config.arpSwing || false;
      let mRhythm = config.rhythm || 'straight';
      let mVoiceLeading = config.voiceLeading;
      
      let mBuffers = mGuitar ? guitarBuffersRef.current : pianoBuffersRef.current;
      let mInstrumentKey: 'guitar' | 'piano' = mGuitar ? 'guitar' : 'piano';
      let mDecay = mGuitar ? GUITAR_DECAY : PIANO_DECAY;

      if (mReset) {
          nextBassTargetRef.current = null;
          bossaBeatRef.current = 0;
          reggaeToggleRef.current = false;
      }

      let originalRoot = mNotes[0]; 
      let r = (originalRoot % 12) + 36; 
      if (r > 43) r -= 12; 
      
      let targetRoot = typeof config.nextRoot === 'number' ? (config.nextRoot % 12) + 36 : r;
      if (targetRoot - r > 6) targetRoot -= 12;
      if (targetRoot - r < -6) targetRoot += 12;

      let ivs = config.intervals || [0, 4, 7]; 
      let third = r + (ivs[1] !== undefined ? ivs[1] : 4);
      let fifth = r + (ivs[2] !== undefined ? ivs[2] : 7);
      let seventh = r + (ivs[3] !== undefined ? ivs[3] : 10);

      let beat1Midi = nextBassTargetRef.current || r;
      nextBassTargetRef.current = null;

      const getApproach = () => {
          if (r === targetRoot) {
              let choices = [third, fifth];
              let nextTarget = choices[Math.floor(Math.random() * choices.length)];
              nextBassTargetRef.current = nextTarget;
              return (Math.random() > 0.5) ? nextTarget + 1 : nextTarget - 1;
          }
          nextBassTargetRef.current = targetRoot;
          return (Math.random() > 0.5) ? targetRoot - 1 : targetRoot + 1;
      };

      const resolveBass = (noteName: string, pos: number) => {
          if (config.bassLine && config.bassLine.length > 0) {
              let idx = Math.floor(pos || 0);
              if (idx >= config.bassLine.length) idx = config.bassLine.length - 1;
              return config.bassLine[idx];
          }
          if (noteName === 'B1') return beat1Midi;
          if (noteName === 'R') return r;
          if (noteName === '3') return third;
          if (noteName === '5') return fifth;
          if (noteName === '7') return seventh;
          if (noteName === '8') return r + 12;
          if (noteName === 'A') return getApproach();
          if (noteName === 'L5') return fifth - 12; 
          if (noteName === '2') return r + 2; 
          if (noteName === '6') return fifth + 2;
          if (noteName === 'D') return r - 5; 
          return r;
      };

      if (mVoiceLeading) {
          let rawVoicing = [...mNotes];
          if (rawVoicing.length >= 4) { rawVoicing.shift(); }

          let nextVoicing = [];
          let baseOctave = mGuitar ? 4 : 5; 
          let baseMidi = mGuitar ? 48 : 60; 

          if (lastVoicingRef.current === undefined || mReset) {
              nextVoicing = rawVoicing.map(n => (n % 12) + baseMidi); 
          } else {
              let prevCenter = lastVoicingRef.current.reduce((a,b)=>a+b, 0) / lastVoicingRef.current.length;
              nextVoicing = rawVoicing.map(note => {
                  let pc = note % 12;
                  let closest = pc + baseMidi;
                  let minDiff = 999;
                  for (let oct = baseOctave; oct <= baseOctave + 2; oct++) {
                      let test = pc + oct * 12;
                      let diff = Math.abs(test - prevCenter);
                      if (diff < minDiff) { minDiff = diff; closest = test; }
                  }
                  return closest;
              });
          }

          nextVoicing.sort((a,b) => a-b);
          if (nextVoicing.length >= 3) {
              if (nextVoicing[nextVoicing.length - 2] - 12 >= baseMidi) {
                  nextVoicing[nextVoicing.length - 2] -= 12; 
                  nextVoicing.sort((a,b) => a-b);
              }
          }

          mNotes = nextVoicing;
          lastVoicingRef.current = mNotes;
      } else {
          lastVoicingRef.current = [...mNotes]; 
      }

      type RhythmHit = { pos: number, vol: number, note?: string };
      const RHYTHMS: Record<string, { chord: (n: number) => RhythmHit[], bass: (n: number) => RhythmHit[] }> = {
        straight: { 
          chord: (n) => { let h = []; for (let i = 0; i < n; i++) h.push({ pos: i, vol: 1.0 }); return h; }, 
          bass: (n) => { if (n !== 4) return [{pos:0, note:'B1', vol:1}, {pos:1, note:'5', vol:0.8}, {pos:2, note:'R', vol:0.8}]; if (beat1Midi === third) return [{pos:0, note:'B1', vol:1}, {pos:1, note:'5', vol:0.8}, {pos:2, note:'6', vol:0.8}, {pos:3, note:'A', vol:0.8}]; if (beat1Midi === fifth) return [{pos:0, note:'B1', vol:1}, {pos:1, note:'R', vol:0.8}, {pos:2, note:'3', vol:0.8}, {pos:3, note:'A', vol:0.8}]; return [{pos:0, note:'B1', vol:1}, {pos:1, note:'2', vol:0.8}, {pos:2, note:'3', vol:0.8}, {pos:3, note:'A', vol:0.8}]; } 
        },
        swing: { 
          chord: (n) => { if (n === 2) return [{ pos: 0, vol: 0.9 }]; if (n === 3) return [{ pos: 0, vol: 0.9 }, { pos: 1.66, vol: 0.8 }]; return [{ pos: 0, vol: 0.9 }, { pos: 1.66, vol: 0.8 }]; }, 
          bass: (n) => { if (n === 2) return [{ pos: 0, note: 'B1', vol: 1.0 }, { pos: 1, note: 'A', vol: 0.8 }]; if (n === 3) return [{ pos: 0, note: 'B1', vol: 1.0 }, { pos: 1, note: '3', vol: 0.8 }, { pos: 2, note: 'A', vol: 0.8 }]; return [{ pos: 0, note: 'B1', vol: 1.0 }, { pos: 1, note: '3', vol: 0.8 }, { pos: 2, note: '5', vol: 0.8 }, { pos: 3, note: 'A', vol: 0.8 }]; } 
        },
        bossanova: { 
          chord: (n) => { let currentBeat = bossaBeatRef.current; bossaBeatRef.current = (bossaBeatRef.current + n) % 8; if (n === 4) { if (currentBeat === 0) return [{ pos: 0, vol: 0.9 }, { pos: 1.5, vol: 0.8 }, { pos: 3, vol: 0.9 }]; return [{ pos: 1, vol: 0.9 }, { pos: 2.5, vol: 0.8 }]; } if (n === 2) { if (currentBeat === 0) return [{ pos: 0, vol: 0.9 }, { pos: 1.5, vol: 0.8 }]; if (currentBeat === 2 || currentBeat === 4) return [{ pos: 1, vol: 0.9 }]; if (currentBeat === 6) return [{ pos: 0.5, vol: 0.8 }]; } if (n === 3) return [{ pos: 0, vol: 0.9 }, { pos: 1.5, vol: 0.8 }]; return [{ pos: 0, vol: 0.9 }]; }, 
          bass: (n) => { if (n === 4 || n === 3) return [{ pos: 0, note: 'B1', vol: 1.0 }, { pos: 2, note: '5', vol: 0.8 }]; return [{ pos: 0, note: 'B1', vol: 1.0 }]; } 
        },
        waltz: { 
          chord: (n) => { if (n === 2) return [{ pos: 1, vol: 0.8 }]; if (n === 3) return [{ pos: 1, vol: 0.8 }, { pos: 2, vol: 0.8 }]; return [{ pos: 1, vol: 0.8 }, { pos: 2, vol: 0.8 }, { pos: 3, vol: 0.7 }]; }, 
          bass: (n) => { if (n === 3) return [{ pos: 0, note: 'B1', vol: 1.0 }]; return [{ pos: 0, note: 'B1', vol: 1.0 }, { pos: 2, note: '5', vol: 0.7 }]; } 
        },
        twostep: { 
          chord: (n) => { if (n === 2) return [{ pos: 1, vol: 0.9 }]; if (n === 3) return [{ pos: 1, vol: 0.9 }, { pos: 2, vol: 0.9 }]; return [{ pos: 1, vol: 0.9 }, { pos: 3, vol: 0.9 }]; }, 
          bass: (n) => { if (n === 2 || n === 3) return [{ pos: 0, note: 'B1', vol: 1.0 }]; return [{ pos: 0, note: 'B1', vol: 1.0 }, { pos: 2, note: '5', vol: 0.9 }]; } 
        },
        reggae: { 
          chord: (n) => { if (n === 2) { reggaeToggleRef.current = !reggaeToggleRef.current; if (reggaeToggleRef.current) return [{ pos: 1, vol: 0.9 }, { pos: 1.66, vol: 0.9 }]; return [{ pos: 1, vol: 0.9 }]; } if (n === 3) return [{ pos: 0.66, vol: 0.9 }, { pos: 1.66, vol: 0.9 }]; return [{ pos: 1, vol: 0.9 }, { pos: 1.66, vol: 0.9 }, { pos: 3, vol: 0.9 }]; }, 
          bass: (n) => { if (n === 2 || n === 3) return [{ pos: 0, note: 'B1', vol: 1.0 }]; return [{ pos: 0, note: 'B1', vol: 1.0 }, { pos: 2, note: '5', vol: 0.8 }]; } 
        }
      };

      let groove = RHYTHMS[mRhythm] || RHYTHMS['straight'];
      let chordHits = groove.chord(mBeats);
      let bassHits = groove.bass(mBeats);

      let allBassMidi: number[] = [];
      if (mBass) {
        bassHits.forEach(h => { allBassMidi.push(resolveBass(h.note!, h.pos)); });
      }

      mNotes.forEach(midi => loadSampleLazy(midi, mBuffers, mInstrumentKey));
      allBassMidi.forEach(midi => loadSampleLazy(midi, bassBuffersRef.current, 'bass'));

      if (mReset || now > nextMeasureStartRef.current + 0.5) {
           nextMeasureStartRef.current = now + 0.01;
      } else if (!mReset && !config.skipTransitionFade) {
        // Chord transition: seamlessly crossfade the Master Buses
        const transitionFade = 0.04;
        const now = ctx.currentTime;
        
        const oldMaster = masterGainRef.current;
        if (oldMaster) {
          try {
            oldMaster.gain.setValueAtTime(1.0, now);
            oldMaster.gain.linearRampToValueAtTime(0.0001, now + transitionFade);
          } catch(e) {}
          setTimeout(() => { try { oldMaster.disconnect(); } catch(e) {} }, transitionFade * 1000 + 100);
        }

        let newMaster = ctx.createGain();
        newMaster.connect(ctx.destination);
        masterGainRef.current = newMaster;
      }

      let startTime = nextMeasureStartRef.current;
      let beatMs = 60000 / mBpm;
      nextMeasureStartRef.current += (beatMs * mBeats) / 1000; 

      if (mMetronome) {
        for (let b = 0; b < mBeats; b++) {
           let beatTime = startTime + (beatMs / 1000) * b;
           if (beatTime >= ctx.currentTime) {
               playClick(beatTime, b === 0, mClickScale);
           }
        }
      }

      if (mBass) {
        bassHits.forEach(hit => {
          let hitTime = startTime + (beatMs / 1000) * hit.pos;
          let hitDelay = hitTime - ctx.currentTime;
          if (hitDelay < 0) hitDelay = 0;
          playBassBuffer(resolveBass(hit.note!, hit.pos), mBassVol * hit.vol, hitDelay);
        });
      }

      if (mArp) {
        let arpSlots = mBeats * 2;
        let pattern: number[] = [];
        for (let ai = 0; ai < arpSlots; ai++) pattern.push(mNotes[ai % mNotes.length]);
        pattern.forEach((midi, i) => {
          let beatIndex = Math.floor(i / 2);
          let isOffbeat = i % 2 === 1;
          let offsetSec = (beatIndex * beatMs + (isOffbeat ? beatMs * (mSwing ? 0.66 : 0.5) : 0)) / 1000;
          scheduleBuffer(startTime + offsetSec, midi, mBuffers, mVol, mDecay);
        });
      } else {
        chordHits.forEach(hit => {
           let hitAbsTime = startTime + (beatMs / 1000) * hit.pos;
           let hitVol = mVol * hit.vol;
           mNotes.forEach((midi, i) => {
              // Guitar: natural strum stagger (8 ms per string, lowest string first).
              // Piano: all notes share the exact same absTime — no per-note ctx.currentTime drift.
              // High-shelf EQ cuts highs so guitar/piano don't mask the bass (freq & gain from mixer).
              let strDly = mGuitar ? i * 0.008 : 0;
              scheduleBufferWithHighCut(hitAbsTime + strDly, midi, mBuffers, hitVol, mDecay, mHiCutFreq, mHiCutGain);
           });
        });
      }
    },
    playTone: (midi, volume) => {
      if (!isReady) return;
      stopAllActive();
      playSynthNote(midi, (volume / 100) * 1.2, 0, true);
    },
    stopTone: () => {
      stopAllActive();
    },
    playProgression: (sequence, onChordChange, onEnd, loop = false) => {
      if (!isReady || !audioCtxRef.current) return;
      stopProgressionScheduler();
      progSeqRef.current        = sequence;
      progSeqIdxRef.current     = 0;
      progIsLoopingRef.current  = loop;
      progOnChordChange.current = onChordChange;
      progOnEnd.current         = onEnd;
      // Kick off the 25 ms look-ahead scheduler loop
      progSchedulerRef.current  = setInterval(progSchedulerTick, 25);
    },
    stopProgression: () => {
      stopProgressionScheduler();
      progSeqRef.current    = [];
      progSeqIdxRef.current = 0;
    },
    setProgressionLooping: (loop: boolean) => {
      // Live toggle — the scheduler reads this ref on its next tick
      progIsLoopingRef.current = loop;
    },
  };
  selfHandleRef.current = handle;
  return handle;
  });

  return null;
});

export default SoundfontPlayer;