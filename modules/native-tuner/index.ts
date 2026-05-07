import { EventEmitter, EventSubscription } from 'expo-modules-core';
import NativeTunerModule from './src/NativeTunerModule';

// We cast to 'any' to bypass Expo's broken strict typing here
const emitter = new EventEmitter(NativeTunerModule as any) as any;

export function startListening(): void {
  NativeTunerModule.startListening();
}

export function stopListening(): void {
  NativeTunerModule.stopListening();
}

export function addPitchListener(listener: (event: { frequency: number, cents: number }) => void): EventSubscription {
  return emitter.addListener('onPitchDetected', listener);
}