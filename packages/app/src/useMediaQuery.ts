import { useSyncExternalStore } from 'react';

/** スマホ用 UI に切り替える境界（06 章 §0.2。700px 未満はスマホ用の構成）。 */
export const MOBILE_QUERY = '(max-width: 699.98px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
