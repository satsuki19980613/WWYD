import { useCallback, useRef } from 'react';

/**
 * 画面の下に固定したバーの高さを、祖先の要素（`root` のセレクタ）の CSS 変数 `name` に入れる ref コールバック。
 * 画面の下の余白をバーの高さに合わせ、卓などで画面の残りを埋めるために使う。
 * `keepMax` は、いちばん高かった値を保つ（バーの高さが局面で変わるたびに、上の卓が伸び縮みしないように）。
 */
export function useHeightVar(root: string, name: string, opts: { keepMax?: boolean } = {}): (el: HTMLElement | null) => void {
  const observer = useRef<ResizeObserver | null>(null);
  const max = useRef(0);
  const keepMax = opts.keepMax === true;
  return useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el) return;
      const target = el.closest<HTMLElement>(root);
      const set = (): void => {
        const h = keepMax ? Math.max(max.current, el.offsetHeight) : el.offsetHeight;
        max.current = h;
        target?.style.setProperty(name, `${h}px`);
      };
      set();
      observer.current = new ResizeObserver(set);
      observer.current.observe(el);
    },
    [root, name, keepMax],
  );
}
