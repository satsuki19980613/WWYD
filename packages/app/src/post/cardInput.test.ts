import { describe, expect, it } from 'vitest';
import {
  pickCard,
  applyCardKey,
  flickDirection,
  handCards,
  handSlots,
  isHandComplete,
  keyFromKeyboard,
  RANK_FLICK,
  SUIT_FLICK,
} from './cardInput.ts';

const NONE = new Set<string>();

/** キーを順に打った結果。 */
function type(keys: string[], used: ReadonlySet<string> = NONE, start = ''): string {
  return keys.reduce((h, k) => applyCardKey(h, k, used).hand, start);
}

describe('Card キーボード（06 章 §3.5）', () => {
  it('ランク → Suit で 1 枚、2 枚で完成', () => {
    expect(type(['A', 'd', 'K', 'd'])).toBe('AdKd');
    expect(handCards('AdKd')).toEqual(['Ad', 'Kd']);
    expect(isHandComplete('AdKd')).toBe(true);
  });
  it('1 → 0 で T', () => {
    expect(type(['1', '0', 's'])).toBe('Ts');
  });
  it('1 → 0 以外のランクは置き換え', () => {
    expect(type(['1', '9', 'h'])).toBe('9h');
  });
  it('1 → Suit は無視', () => {
    expect(type(['1', 's'])).toBe('1');
  });
  it('0 単独は無視', () => {
    expect(type(['0'])).toBe('');
    expect(type(['A', 's', '0'])).toBe('As');
  });
  it('Suit 待ちでランクは直前のランクを置き換える', () => {
    expect(type(['K', 'Q', 'c'])).toBe('Qc');
  });
  it('ランク待ちで Suit は無視', () => {
    expect(type(['s'])).toBe('');
    expect(type(['A', 's', 'h'])).toBe('As');
  });
  it('3 枚目は無視', () => {
    expect(type(['A', 's', 'K', 's', 'Q', 's'])).toBe('AsKs');
  });
  it('C で消す、⌫ で 1 文字消す', () => {
    expect(type(['A', 's', 'K', 'C'])).toBe('');
    expect(type(['A', 's', 'K', 'BS'])).toBe('As');
    expect(type(['BS'])).toBe('');
  });
  it('使用済みの Card は入力せず、その Card を返す', () => {
    const used = new Set(['Kd']);
    expect(applyCardKey('K', 'd', used)).toEqual({ hand: 'K', used: 'Kd' });
    expect(applyCardKey('AdA', 'd', NONE)).toEqual({ hand: 'AdA', used: 'Ad' }); // 同じ席の 1 枚目
  });
  it('知らないキーは無視', () => {
    expect(type(['A', 'x'])).toBe('A');
  });
});

describe('表示用の枠', () => {
  it('ランクだけの枠は rank', () => {
    expect(handSlots('AdK')).toEqual([{ kind: 'card', card: 'Ad' }, { kind: 'rank', rank: 'K' }]);
    expect(handSlots('')).toEqual([{ kind: 'empty' }, { kind: 'empty' }]);
  });
  it('1 枚・Suit 未確定は途中', () => {
    expect(isHandComplete('')).toBe(true);
    expect(isHandComplete('Ad')).toBe(false);
    expect(isHandComplete('AdK')).toBe(false);
    expect(isHandComplete('1')).toBe(false);
  });
});

describe('フリックの方向', () => {
  it.each<[number, number, string]>([
    [0, 0, 'tap'],
    [20, 10, 'tap'],
    [0, -40, 'up'],
    [40, 0, 'right'],
    [0, 40, 'down'],
    [-40, 0, 'left'],
    [30, -30, 'right'], // -45° ちょうどは右
    [-30, -31, 'up'],
    [-30, 31, 'down'], // 134°
    [-31, 30, 'left'], // 136°
  ])('(%i, %i) → %s', (dx, dy, dir) => {
    expect(flickDirection(dx, dy)).toBe(dir);
  });
});

describe('フリックの割り当て（2026-09-29）', () => {
  it('絵札のキーは タップ / 上 / 左 / 下 = Q / K / T / J。A は単独のキー', () => {
    expect(RANK_FLICK).toEqual({ tap: 'Q', up: 'K', right: null, down: 'J', left: 'T' });
  });
  it('Suit のキーは タップ / 上 / 左 / 下 = ♠ / ♥ / ♦ / ♣', () => {
    expect(SUIT_FLICK).toEqual({ tap: 's', up: 'h', right: null, down: 'c', left: 'd' });
  });
  it('どちらも右（画面の外側）には割り当てない', () => {
    expect(RANK_FLICK.right).toBeNull();
    expect(SUIT_FLICK.right).toBeNull();
  });
});

describe('パソコンのキーボード', () => {
  it.each<[string, string | null]>([
    ['a', 'A'],
    ['T', 'T'],
    ['7', '7'],
    ['1', '1'],
    ['0', '0'],
    ['s', 's'],
    ['C', 'c'],
    ['Backspace', 'BS'],
    ['Delete', 'C'],
    ['x', null],
    ['Enter', null],
  ])('%s → %s', (key, expected) => {
    expect(keyFromKeyboard(key)).toBe(expected);
  });
});

describe('PC のカード選択ボード（pickCard）', () => {
  it('2 枚に満たなければ足す', () => {
    expect(pickCard('', 'As')).toBe('As');
    expect(pickCard('As', 'Kd')).toBe('AsKd');
  });
  it('選んである札を押すと外す', () => {
    expect(pickCard('AsKd', 'As')).toBe('Kd');
    expect(pickCard('AsKd', 'Kd')).toBe('As');
    expect(pickCard('As', 'As')).toBe('');
  });
  it('2 枚そろっていれば 2 枚目を置き換える', () => {
    expect(pickCard('AsKd', 'Qh')).toBe('AsQh');
  });
  it('スート待ちのランクだけの入力は捨てる', () => {
    expect(pickCard('AsK', 'Qh')).toBe('AsQh');
    expect(pickCard('K', 'Qh')).toBe('Qh');
  });
});
