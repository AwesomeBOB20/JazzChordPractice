import { useCallback } from 'react';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import type { ProFeature } from './proConstants';

/**
 * Pro gating hook. `requirePro(feature, action)` runs `action` when the user is
 * Pro; otherwise it opens the paywall attributed to `feature` and skips the action.
 * Use it to wrap any Pro-only press handler:
 *
 *   const { isPro, requirePro } = useRequirePro();
 *   onPress={() => requirePro('voicings', () => selectTab(tab))}
 *
 * Read `isPro` directly when you need to dim/lock a control's appearance.
 */
export function useRequirePro() {
  const isPro = useSettingsStore((s) => s.isPro);
  const openPaywall = useSettingsStore((s) => s.openPaywall);

  const requirePro = useCallback(
    (feature: ProFeature, action: () => void) => {
      if (isPro) {
        action();
      } else {
        openPaywall(feature);
      }
    },
    [isPro, openPaywall],
  );

  return { isPro, requirePro, openPaywall };
}
