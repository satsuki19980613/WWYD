import { useSyncExternalStore } from 'react';
import { MOBILE_QUERY } from './layout.ts';

/** スマホ用 UI に切り替える境界（06 章 §0.2・17 章 §3.0。FitStage の倍率が下限を下回る画面。layout.ts） */
export { MOBILE_QUERY };

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
