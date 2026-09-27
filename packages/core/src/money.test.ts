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
