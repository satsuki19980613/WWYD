import { useEffect, useSyncExternalStore } from 'react';
import { emptyDraft, isDirty, type Draft } from './draft.ts';

/**
 * 入力中の投稿（06 章 §3.2、14 章 §3.5）。メモリに持つ。
 * 投稿の画面を離れるときは「下書きに保存しますか」（App の LeaveDraftDialog）で保存するか捨ててから空に戻す。
 * `slot` は開いた・保存した下書きの ID（続きを保存するとその下書きを上書きする）。
 * `saved` は最後に保存した・開いた時点の内容（変わっていなければ離れるときに聞かない）。
 */
let current: Draft = emptyDraft();
let slot: string | null = null;
let saved = JSON.stringify(current);
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

/** 空に戻す（投稿した・保存しないで離れた・すべて捨てる） */
export function resetDraft(): void {
  slot = null;
  saved = JSON.stringify(emptyDraft());
  setDraft(emptyDraft());
}

/** 保存した下書きを開く */
export function openDraft(d: Draft, id: string): void {
  slot = id;
  saved = JSON.stringify(d);
  setDraft(d);
}

/** 今の内容を下書き `id` に保存した */
export function markSaved(id: string): void {
  slot = id;
  saved = JSON.stringify(current);
}

export function draftSlot(): string | null {
  return slot;
}

/** 離れるときに保存を聞くか（何か入っていて、保存・開いた時から変わっている） */
export function needsSave(): boolean {
  return isDirty(current) && JSON.stringify(current) !== saved;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDraft(): Draft {
  return useSyncExternalStore(subscribe, getDraft, getDraft);
}

/** 保存していない入力があるうちは、タブを閉じる・再読み込みの前にブラウザの離脱確認を出す。 */
export function useLeaveGuard(): void {
  useDraft();
  const unsaved = needsSave();
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);
}
