import { POSITIONS, PLAYER_COUNTS, type Pos } from '@wwyd/core';
import { useSyncExternalStore } from 'react';
import { cardText } from '../components/PlayingCard.tsx';
import { handCards } from './cardInput.ts';
import { emptyDraft, parseSettings, phaseOf, settleActions, STREET_NAME, type Draft } from './draft.ts';

/**
 * 投稿の下書きの保存（1 人 3 件まで。06 章 §3.2、14 章 §3.5。2026-09-29）。
 * 端末のブラウザ（localStorage）に、ログインしている利用者ごとに持つ（サーバーには送らない。さつきの決定）。
 * 読み書きの失敗（プライベートブラウズ・容量）は例外にせず、保存できなかったことを返す。
 */

export const MAX_DRAFTS = 3;

export type SavedDraft = { id: string; savedAt: string; draft: Draft };

/** localStorage と同じ形（単体テストでは Map で代わりを渡す） */
export type KeyValue = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };

const keyOf = (uid: string): string => `wwyd.drafts.v1.${uid}`;

function browserStorage(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 保存されていた下書きを読み直す。欠けた項目は空の下書きの値で埋め、型が違う項目は捨てる。
 * アクションとボードが今のルールで再生できなければ（壊れた・古い形式）、アクションとボードとスポットを捨てる。
 */
export function sanitizeDraft(raw: unknown): Draft {
  const base = emptyDraft();
  if (!isRecord(raw)) return base;
  const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
  const perSeat = (v: unknown, d: Record<Pos, string>): Record<Pos, string> =>
    Object.fromEntries(POSITIONS.map((p) => [p, isRecord(v) ? str(v[p], d[p]) : d[p]])) as Record<Pos, string>;
  const d: Draft = {
    fmt: raw.fmt === 'mtt' ? 'mtt' : 'cash',
    sb: str(raw.sb, base.sb),
    ante: str(raw.ante, base.ante),
    rake: str(raw.rake, base.rake),
    players: PLAYER_COUNTS.find((n) => n === raw.players) ?? null,
    stacks: perSeat(raw.stacks, base.stacks),
    hero: POSITIONS.find((p) => p === raw.hero) ?? base.hero,
    hands: perSeat(raw.hands, base.hands),
    actions: Array.isArray(raw.actions) && raw.actions.every(isActionShape) ? (raw.actions as Draft['actions']) : [],
    board: Array.isArray(raw.board) ? (raw.board as Draft['board']).filter((c) => typeof c === 'string') : [],
    spotIndex: typeof raw.spotIndex === 'number' ? raw.spotIndex : null,
    title: str(raw.title, ''),
  };
  try {
    // 保存されるのは、設定を変えて合わなくなった手を外す前の下書き（画面は settleActions の結果を出す）。
    // 開き直したときも画面と同じく、合わなくなった手から後だけを外す（リリース前レビュー R3-1）
    const settled = settleActions(d);
    phaseOf(parseSettings(settled).setup, settled.actions, settled.board);
    return settled;
  } catch {
    return { ...d, actions: [], board: [], spotIndex: null };
  }
}

/** Action の形（中身の合法さは再生で確かめる。形が違う値で画面が落ちないように。リリース前レビュー R3-3） */
function isActionShape(v: unknown): boolean {
  return (
    isRecord(v) &&
    typeof v.street === 'string' &&
    typeof v.pos === 'string' &&
    typeof v.type === 'string' &&
    (v.to === undefined || typeof v.to === 'number')
  );
}

/** 保存されている下書き（新しい順）。読めなければ空 */
export function readDrafts(uid: string, store: KeyValue | null = browserStorage()): SavedDraft[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store?.getItem(keyOf(uid)) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: SavedDraft[] = [];
  for (const e of raw) {
    if (!isRecord(e) || typeof e.id !== 'string' || typeof e.savedAt !== 'string') continue;
    out.push({ id: e.id, savedAt: e.savedAt, draft: sanitizeDraft(e.draft) });
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, MAX_DRAFTS);
}

function write(uid: string, list: readonly SavedDraft[], store: KeyValue | null): boolean {
  try {
    if (!store) return false;
    if (list.length === 0) store.removeItem(keyOf(uid));
    else store.setItem(keyOf(uid), JSON.stringify(list));
  } catch {
    return false;
  }
  notify();
  return true;
}

export type SaveResult = { ok: true; id: string } | { ok: false; reason: 'full' | 'unavailable' };

/**
 * 下書きを保存する。`id` があればその下書きを上書き（開いて続きを入れた下書き）、無ければ新しく足す。
 * 新しく足すときに 3 件あれば `full`（どれかを消してもらう）。
 */
export function saveDraft(
  uid: string,
  draft: Draft,
  id: string | null,
  now: Date = new Date(),
  store: KeyValue | null = browserStorage(),
): SaveResult {
  const list = readDrafts(uid, store);
  const exists = id !== null && list.some((e) => e.id === id);
  if (!exists && list.length >= MAX_DRAFTS) return { ok: false, reason: 'full' };
  const newId = exists ? (id as string) : newDraftId(now);
  const entry: SavedDraft = { id: newId, savedAt: now.toISOString(), draft };
  const next = exists ? list.map((e) => (e.id === newId ? entry : e)) : [entry, ...list];
  return write(uid, next, store) ? { ok: true, id: newId } : { ok: false, reason: 'unavailable' };
}

export function deleteDraft(uid: string, id: string, store: KeyValue | null = browserStorage()): void {
  write(
    uid,
    readDrafts(uid, store).filter((e) => e.id !== id),
    store,
  );
}

/** アカウントを削除したら、その利用者の下書きも消す */
export function clearDrafts(uid: string, store: KeyValue | null = browserStorage()): void {
  write(uid, [], store);
}

function newDraftId(now: Date): string {
  return `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---- 表示 ----

/** 下書きの一覧の 1 行の文言: タイトル（無ければ「タイトルなし」）と「6 人 · Hero BTN A♦K♦ · Turn · 8 Action」 */
export function draftSummary(d: Draft): { title: string; meta: string } {
  const parts: string[] = [];
  if (d.players !== null) parts.push(`${d.players} 人`);
  const cards = handCards(d.hands[d.hero]);
  parts.push(`Hero ${d.hero}${cards.length === 2 ? ` ${cards.map(cardText).join('')}` : ''}`);
  const street = reachedStreet(d);
  if (street) parts.push(street);
  if (d.actions.length > 0) parts.push(`${d.actions.length} Action`);
  return { title: d.title.trim() || 'タイトルなし', meta: parts.join(' · ') };
}

function reachedStreet(d: Draft): string | null {
  if (d.actions.length === 0) return null;
  try {
    const ph = phaseOf(parseSettings(d).setup, d.actions, d.board);
    return ph.kind === 'invalid' ? null : STREET_NAME[ph.state.street];
  } catch {
    return null;
  }
}

// ---- 購読（下書きの画面・ヘッダーの件数） ----

const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version++;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  // ほかのタブでの保存・削除も反映する
  const onStorage = (e: StorageEvent): void => {
    if (e.key?.startsWith('wwyd.drafts.')) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

const cache = new Map<string, { version: number; list: SavedDraft[] }>();

/** ログインしている利用者（App が入れる。下書きはこの利用者のものを読み書きする） */
let activeUid: string | null = null;
export function setActiveUser(uid: string | null): void {
  if (uid === activeUid) return;
  activeUid = uid;
  notify();
}
export function activeUser(): string | null {
  return activeUid;
}

/** 保存されている下書き（ログインしていなければ空） */
export function useSavedDrafts(): SavedDraft[] {
  const get = (): SavedDraft[] => {
    const uid = activeUid;
    if (!uid) return EMPTY;
    const c = cache.get(uid);
    if (c && c.version === version) return c.list;
    const list = readDrafts(uid);
    cache.set(uid, { version, list });
    return list;
  };
  return useSyncExternalStore(subscribe, get, get);
}
const EMPTY: SavedDraft[] = [];
