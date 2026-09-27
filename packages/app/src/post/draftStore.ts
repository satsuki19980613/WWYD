import { useEffect, useSyncExternalStore } from 'react';
import { emptyDraft, isDirty, type Draft } from './draft.ts';

/**
 * 投稿の下書き（06 章 §3.2）。メモリに持つので、一覧に戻っても消えず、再読み込みで消える。
 * 投稿の成功と「すべて消す」以外では消さない。
 */
let current: Draft = emptyDraft();
const listeners = new Set<() => void>();

export function getDraft(): Draft {
  return current;
}

export function setDraft(update: Draft | ((d: Draft) => Draft)): void {
  const next = typeof update === 'function' ? update(current) : update;
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

export function resetDraft(): void {
  setDraft(emptyDraft());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDraft(): Draft {
  return useSyncExternalStore(subscribe, getDraft, getDraft);
}

/** 下書きがあるうちは、タブを閉じる・再読み込みの前にブラウザの離脱確認を出す。 */
export function useLeaveGuard(): void {
  const dirty = isDirty(useDraft());
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
