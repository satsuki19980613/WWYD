import type { Tendency } from '@wwyd/core';
import { useSyncExternalStore } from 'react';
import { activeUser, type KeyValue } from '../post/savedDrafts.ts';
import { isCompleteGeneral, sanitizeGeneral, sanitizeTendency, type GeneralDraft, type SeatDraft } from './readsModel.ts';

/**
 * Villain の情報の Preset（名前を付けて保存・呼び出し・削除。詳細仕様 18 章 §2.1.7・§2.3）。
 * 中身は全体の傾向と General Read（Spot Read はそのハンドだけのものなので入れない）。schema version を持つ（前の形は読み捨てる）。
 * 端末のブラウザ（localStorage）に、ログインしている利用者ごとに持つ。サーバーには送らない（プライバシーポリシー §1）。
 * 読み書きの失敗（プライベートブラウズ・容量）は例外にせず、保存できなかったことを返す。
 */

export const MAX_PRESETS = 20;
export const PRESET_NAME_MAX = 20;

/** Preset の中身（全体の傾向と、最後まで選んだ General Read） */
export type PresetRead = Tendency & { general?: GeneralDraft[] };
export type ReadPreset = { id: string; name: string; read: PresetRead };

/** 保存の形の版（2026-09-30 の仕様変更で 2。1 は Memo・Slider の形で、読み捨てる） */
export const PRESET_SCHEMA = 2;
const keyOf = (uid: string): string => `wwyd.readPresets.${uid}`;
/** 前の版の鍵（Memo の入った形。書くとき・消すときに一緒に消す） */
const oldKeyOf = (uid: string): string => `wwyd.readPresets.v1.${uid}`;

/** 席の入力から Preset の中身を作る */
export function presetOf(seat: SeatDraft): PresetRead {
  const out: PresetRead = sanitizeTendency(seat);
  const general = (seat.general ?? []).filter(isCompleteGeneral);
  if (general.length > 0) out.general = general;
  return out;
}

export const isEmptyPreset = (r: PresetRead): boolean => Object.keys(r).length === 0;

function sanitizePreset(raw: unknown): PresetRead {
  const out: PresetRead = sanitizeTendency(raw);
  if (isRecord(raw) && Array.isArray(raw.general)) {
    const g = raw.general.map(sanitizeGeneral).filter((x): x is GeneralDraft => x !== null && isCompleteGeneral(x)).slice(0, 2);
    if (g.length > 0) out.general = g;
  }
  return out;
}

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
    raw = JSON.parse(store?.getItem(keyOf(uid)) ?? 'null');
  } catch {
    return [];
  }
  if (!isRecord(raw) || raw.schema !== PRESET_SCHEMA || !Array.isArray(raw.presets)) return [];
  const out: ReadPreset[] = [];
  for (const e of raw.presets) {
    if (!isRecord(e) || typeof e.id !== 'string' || typeof e.name !== 'string' || e.name.trim() === '') continue;
    out.push({ id: e.id, name: e.name.trim(), read: sanitizePreset(e.read) });
  }
  return out.slice(0, MAX_PRESETS);
}

function write(uid: string, list: readonly ReadPreset[], store: KeyValue | null): boolean {
  try {
    if (!store) return false;
    store.removeItem(oldKeyOf(uid));
    if (list.length === 0) store.removeItem(keyOf(uid));
    else store.setItem(keyOf(uid), JSON.stringify({ schema: PRESET_SCHEMA, presets: list }));
  } catch {
    return false;
  }
  notify();
  return true;
}

export type PresetResult = { ok: true } | { ok: false; reason: 'name' | 'empty' | 'full' | 'unavailable' };

/** 名前を付けて保存する。同じ名前があれば上書きする */
export function savePreset(uid: string, name: string, read: PresetRead, store: KeyValue | null = browserStorage()): PresetResult {
  const n = name.trim();
  if (n === '' || [...n].length > PRESET_NAME_MAX) return { ok: false, reason: 'name' };
  if (isEmptyPreset(read)) return { ok: false, reason: 'empty' };
  const list = readPresets(uid, store);
  const same = list.find((p) => p.name === n);
  if (!same && list.length >= MAX_PRESETS) return { ok: false, reason: 'full' };
  const entry: ReadPreset = { id: same?.id ?? newId(), name: n, read: sanitizePreset(read) };
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
