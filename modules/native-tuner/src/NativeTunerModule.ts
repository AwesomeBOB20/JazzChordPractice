import { NativeModule, requireNativeModule } from 'expo-modules-core';
import { NativeTunerModuleEvents } from './NativeTuner.types';

// ✅ Extends NativeModule so TypeScript knows it can emit events
declare class NativeTunerModule extends NativeModule<NativeTunerModuleEvents> {
  startListening(): void;
  stopListening(): void;
}

export default requireNativeModule<NativeTunerModule>('NativeTuner');