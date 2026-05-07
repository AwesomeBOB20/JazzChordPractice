export type NativeTunerModuleEvents = {
  onPitchDetected: (event: { frequency: number; cents: number }) => void;
};