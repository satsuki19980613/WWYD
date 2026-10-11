import { describe, expect, it } from 'vitest';
import { findDuplicateCard, isCard, rankIndex } from './cards.ts';
import { bbToMbb, formatBb, mbbToBb } from './money.ts';

describe('bbToMbb（04 章 §1）', () => {
  it.each<[number, number]>([
    [2.5, 2500],
    [0.125, 125],
    [0.1, 100],
    [17.555, 17555],
    [100, 100000],
    [9999.999, 9999999],
    [0, 0],
    [-0, 0],
    [-1.5, -1500],
  ])('%s bb → %s mbb', (bb, expected) => {
    expect(bbToMbb(bb)).toBe(expected);
  });

  it.each([0.0001, 1.2345, 10000, NaN, Infinity])('%s は受け付けない', (bb) => {
    expect(bbToMbb(bb)).toBeNull();
  });

  it('数値でない入力は受け付けない', () => {
    expect(bbToMbb('1' as unknown as number)).toBeNull();
  });

  it('mbbToBb は逆変換', () => {
    expect(mbbToBb(17550)).toBe(17.55);
  });
});

describe('formatBb', () => {
  it.each<[number, string]>([
    [2500, '2.5'],
    [100000, '100'],
    [125, '0.125'],
    [17550, '17.55'],
    [0, '0'],
    [-1500, '-1.5'],
  ])('%s mbb → %s', (mbb, text) => {
    expect(formatBb(mbb)).toBe(text);
  });

  // 末尾の 0 の削り方を、bb の数値の最短の 10 進表記と照合する（-20bb〜20bb の全 mbb と上限付近）
  it('末尾の 0 を削った表記は bb の数値の 10 進表記と一致する', () => {
    const values = [9_999_999, -9_999_999, 9_999_990, 9_999_900, 1_000_001];
    for (let m = -20_000; m <= 20_000; m++) values.push(m);
    for (const m of values) expect(formatBb(m), `m=${m}`).toBe(String(m / 1000));
  });
});

describe('cards', () => {
  it('形式', () => {
    expect(isCard('Ad')).toBe(true);
    expect(isCard('Tc')).toBe(true);
    expect(isCard('10c')).toBe(false);
    expect(isCard('ad')).toBe(false);
    expect(isCard('Ax')).toBe(false);
    expect(isCard(1)).toBe(false);
  });

  it('ランクの添字と重複', () => {
    expect(rankIndex('As')).toBe(0);
    expect(rankIndex('2c')).toBe(12);
    expect(findDuplicateCard(['As', 'Kd', 'As'])).toBe('As');
    expect(findDuplicateCard(['As', 'Kd'])).toBeNull();
  });
});
