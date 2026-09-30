import type { VillainRead } from '@wwyd/core';
import { useSyncExternalStore } from 'react';
import { activeUser, type KeyValue } from '../post/savedDrafts.ts';
import { isEmptyRead, sanitizeRead } from './readsModel.ts';

/**
 * Villain の情報の Preset（名前を付けて保存・呼び出し・削除。詳細仕様 18 章 §2.5）。
 * 端末のブラウザ（localStorage）に、ログインしている利用者ごとに持つ。サーバーには送らない（プライバシーポリシー §1）。
 * 読み書きの失敗（プライベートブラウズ・容量）は例外にせず、保存できなかったことを返す。
 */

export const MAX_PRESETS = 20;
export const PRESET_NAME_MAX = 20;

export type ReadPreset = { id: string; name: string; read: VillainRead };

const keyOf = (uid: string): string => `wwyd.readPresets.v1.${uid}`;

function browserStorage(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function readPresets(uid: string, store: KeyValue | null = browserStorage()): ReadPreset[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store?.getItem(keyOf(uid)) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: ReadPreset[] = [];
  for (const e of raw) {
    if (!isRecord(e) || typeof e.id !== 'string' || typeof e.name !== 'string' || e.name.trim() === '') continue;
    out.push({ id: e.id, name: e.name.trim(), read: sanitizeRead(e.read) });
  }
  return out.slice(0, MAX_PRESETS);
}

function write(uid: string, list: readonly ReadPreset[], store: KeyValue | null): boolean {
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

export type PresetResult = { ok: true } | { ok: false; reason: 'name' | 'empty' | 'full' | 'unavailable' };

/** 名前を付けて保存する。同じ名前があれば上書きする */
export function savePreset(uid: string, name: string, read: VillainRead, store: KeyValue | null = browserStorage()): PresetResult {
  const n = name.trim();
  if (n === '' || [...n].length > PRESET_NAME_MAX) return { ok: false, reason: 'name' };
  if (isEmptyRead(read)) return { ok: false, reason: 'empty' };
  const list = readPresets(uid, store);
  const same = list.find((p) => p.name === n);
  if (!same && list.length >= MAX_PRESETS) return { ok: false, reason: 'full' };
  const entry: ReadPreset = { id: same?.id ?? newId(), name: n, read: sanitizeRead(read) };
  const next = same ? list.map((p) => (p.id === same.id ? entry : p)) : [...list, entry];
  return write(uid, next, store) ? { ok: true } : { ok: false, reason: 'unavailable' };
}

export function deletePreset(uid: string, id: string, store: KeyValue | null = browserStorage()): void {
  write(
    uid,
    readPresets(uid, store).filter((p) => p.id !== id),
    store,
  );
}

/** アカウントを削除したら、その利用者の Preset も消す */
export function clearPresets(uid: string, store: KeyValue | null = browserStorage()): void {
  write(uid, [], store);
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---- 購読 ----

const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version++;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent): void => {
    if (e.key?.startsWith('wwyd.readPresets.')) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

const cache = new Map<string, { version: number; list: ReadPreset[] }>();
const EMPTY: ReadPreset[] = [];

/** ログインしている利用者の Preset（ログインしていなければ空） */
export function usePresets(): ReadPreset[] {
  const get = (): ReadPreset[] => {
    const uid = activeUser();
    if (!uid) return EMPTY;
    const c = cache.get(uid);
    if (c && c.version === version) return c.list;
    const list = readPresets(uid);
    cache.set(uid, { version, list });
    return list;
  };
  return useSyncExternalStore(subscribe, get, get);
}
