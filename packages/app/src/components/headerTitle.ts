import { useEffect, useSyncExternalStore } from 'react';

/**
 * ヘッダーに出す投稿のタイトル（回答・集計の画面。詳細仕様 18 章 §5.1）。
 * 画面がタイトルを入れ、離れたら消す。ヘッダー（App）はこれがあれば画面名の代わりに出す。
 */
let current: string | null = null;
const listeners = new Set<() => void>();

function set(v: string | null): void {
  if (v === current) return;
  current = v;
  for (const l of listeners) l();
}

/** この画面を開いている間、ヘッダーに `text` を出す */
export function useSetHeaderTitle(text: string | null): void {
  useEffect(() => {
    set(text);
    return () => set(null);
  }, [text]);
}

export function useHeaderTitle(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
