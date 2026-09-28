import type { Card } from '@wwyd/core';

/**
 * カードキーボードの入力規則（詳細仕様 06 章 §3.5。仕様書 §5.2.5）。
 * 1 席のハンドは文字列で持つ: ランクとスートを交互に最大 4 文字（例 `AdK` = A♦ と、スート待ちの K）。
 * ランクの位置には、T を打つ途中の `1` が入ることがある（`1` → `0` で T）。
 */

export const RANK_CHARS = 'AKQJT98765432';
export const SUIT_CHARS = 'shdc';

/** キー: ランク（`2`〜`9`・`A` `K` `Q` `J` `T`）、`1`、`0`、スート（`s` `h` `d` `c`）、消す（`C`）、1 文字消す（`BS`）。 */
export type CardKey = string;

export type KeyResult = { hand: string; used?: Card };

const isRank = (c: string | undefined): boolean => c !== undefined && RANK_CHARS.includes(c);

/**
 * 1 キー分の入力を適用する。`used` は他の席のハンドとボードのカード（使用済み）。
 * 使用済みのカードになるスートは入力せず、`used` にそのカードを入れて返す（画面はトーストを出す）。
 */
export function applyCardKey(hand: string, key: CardKey, used: ReadonlySet<Card>): KeyResult {
  if (key === 'C') return { hand: '' };
  if (key === 'BS') return { hand: hand.slice(0, -1) };
  if (hand.length >= 4) return { hand }; // 3 枚目は無視

  const awaitingSuit = hand.length % 2 === 1;
  const last = hand.charAt(hand.length - 1);

  if (isRank(key) || key === '1') {
    // スート待ちでランク（`1` → 他のランクを含む）は直前のランクを置き換える
    return { hand: awaitingSuit ? hand.slice(0, -1) + key : hand + key };
  }
  if (key === '0') {
    return { hand: awaitingSuit && last === '1' ? `${hand.slice(0, -1)}T` : hand };
  }
  if (SUIT_CHARS.includes(key) && key.length === 1) {
    // ランク待ち・`1` の後のスートは無視
    if (!awaitingSuit || !isRank(last)) return { hand };
    const card = last + key;
    if (used.has(card) || hand.slice(0, 2) === card) return { hand, used: card };
    return { hand: hand + key };
  }
  return { hand };
}

/** 入力済みのカード（完成した分だけ）。 */
export function handCards(hand: string): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i + 1 < hand.length; i += 2) {
    const c = hand.slice(i, i + 2);
    if (isRank(c.charAt(0)) && SUIT_CHARS.includes(c.charAt(1))) cards.push(c);
  }
  return cards;
}

/** 0 枚か 2 枚ちょうど（1 枚・スート未確定は途中）。 */
export function isHandComplete(hand: string): boolean {
  return hand.length === 0 || (hand.length === 4 && handCards(hand).length === 2);
}

/** 表示用の 2 枠。完成したカードか、ランクだけの「K?」、または空。 */
export type Slot = { kind: 'card'; card: Card } | { kind: 'rank'; rank: string } | { kind: 'empty' };

export function handSlots(hand: string): [Slot, Slot] {
  const slot = (i: number): Slot => {
    const r = hand.charAt(i * 2);
    const s = hand.charAt(i * 2 + 1);
    if (!r) return { kind: 'empty' };
    if (!s) return { kind: 'rank', rank: r };
    return { kind: 'card', card: r + s };
  };
  return [slot(0), slot(1)];
}

// ---- フリック（06 章 §3.5） ----

export type FlickDir = 'tap' | 'up' | 'right' | 'down' | 'left';

/** 移動量から方向を決める。25px 以下はタップ。上 -135°〜-45°、右 -45°〜45°、下 45°〜135°、左はそれ以外。 */
export function flickDirection(dx: number, dy: number): FlickDir {
  if (Math.hypot(dx, dy) <= 25) return 'tap';
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg >= -135 && deg < -45) return 'up';
  if (deg >= -45 && deg <= 45) return 'right';
  if (deg > 45 && deg <= 135) return 'down';
  return 'left';
}

/*
 * フリックのキーはキーボードの右端の列にあるので、右（画面の外側）には割り当てない。指を内側へ払う（2026-09-29）。
 */
/** 絵札のキー（タップ / 上 / 左 / 下 = Q / K / T / J）。A は単独のキー。 */
export const RANK_FLICK: Record<FlickDir, string | null> = { tap: 'Q', up: 'K', right: null, down: 'J', left: 'T' };
/** スートのキー（タップ / 上 / 左 / 下 = ♠ / ♥ / ♦ / ♣）。 */
export const SUIT_FLICK: Record<FlickDir, string | null> = { tap: 's', up: 'h', right: null, down: 'c', left: 'd' };

/** パソコンのキーボードから打つとき（`c` はクラブ。ハンドを消すのは Delete）。 */
export function keyFromKeyboard(key: string): CardKey | null {
  if (key === 'Backspace') return 'BS';
  if (key === 'Delete') return 'C';
  const k = key.length === 1 ? key : '';
  if (/^[0-9]$/.test(k)) return k;
  const up = k.toUpperCase();
  if ('AKQJT'.includes(up) && up !== '') return up;
  if (SUIT_CHARS.includes(k.toLowerCase()) && k !== '') return k.toLowerCase();
  return null;
}

export const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
