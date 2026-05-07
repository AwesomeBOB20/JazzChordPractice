import { useRef, useCallback } from 'react';
import { useSettingsStore } from '@features/settings/store/settingsStore';

export function useTapTempo() {
  const setBpm = useSettingsStore(s => s.setBpm);
  const tapTimestamps = useRef<number[]>([]);
  const tapResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    if (tapTimestamps.current.length > 0 && now - tapTimestamps.current[tapTimestamps.current.length - 1] > 2000) {
      tapTimestamps.current = [];
    }
    tapTimestamps.current.push(now);

    if (tapTimestamps.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimestamps.current.length; i++) {
        intervals.push(tapTimestamps.current[i] - tapTimestamps.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = Math.round(60000 / avgInterval);
      setBpm(Math.max(40, Math.min(240, newBpm)));
    }
    
    if (tapTimestamps.current.length > 8) tapTimestamps.current.shift();
    if (tapResetTimer.current) clearTimeout(tapResetTimer.current);
    tapResetTimer.current = setTimeout(() => { tapTimestamps.current = []; }, 2000);
  }, [setBpm]);

  return handleTapTempo;
}