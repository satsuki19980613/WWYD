import { emptyPaint, type Mix, type Paint } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import {
  initialSize,
  inRange,
  parseSizeText,
  presetActive,
  presetSize,
  sizeForSubmit,
  sizeSummary,
  stepSize,
  submitErrors,
  type SizeSpot,
} from './answerForm.ts';

// H-S1 の停止位置（ターン、BTN が 6.5 をベット。04 章 PCT-01）
const HS1: SizeSpot = { currentBet: 6500, potBase: 22100, minTo: 13000, maxTo: 95700 };

describe('サイズの入力（06 章 §4.7）', () => {
  it('初期値は 50%（PCT-01 17.55bb）。保存済みがあればそれ', () => {
    expect(initialSize(HS1, null)).toBe(17550);
    expect(initialSize(HS1, 30000)).toBe(30000);
  });

  it('プリセット', () => {
    expect(presetSize(33, HS1)).toBe(13790);
    expect(presetSize(125, HS1)).toBe(34130);
    expect(presetSize('allin', HS1)).toBe(95700);
    expect(presetActive(50, 17550, HS1)).toBe(true);
    expect(presetActive(75, 17550, HS1)).toBe(false);
    expect(presetActive('allin', 95700, HS1)).toBe(true);
  });

  it('直接入力は小数第 3 位まで', () => {
    expect(parseSizeText('17.55')).toBe(17550);
    expect(parseSizeText(' 20 ')).toBe(20000);
    expect(parseSizeText('.5')).toBe(500);
    expect(parseSizeText('1.2345')).toBeNull();
    expect(parseSizeText('')).toBeNull();
    expect(parseSizeText('abc')).toBeNull();
    expect(parseSizeText('-3')).toBeNull();
    expect(parseSizeText('1e3')).toBeNull();
  });

  it('範囲', () => {
    expect(inRange(13000, HS1)).toBe(true);
    expect(inRange(12990, HS1)).toBe(false);
    expect(inRange(95710, HS1)).toBe(false);
    expect(inRange(null, HS1)).toBe(false);
  });

  it('0.1 刻みの増減（範囲に収める）', () => {
    expect(stepSize('17.55', 1, HS1)).toBe(17650);
    expect(stepSize('17.55', -1, HS1)).toBe(17450);
    expect(stepSize('13', -1, HS1)).toBe(13000);
    expect(stepSize('95.7', 1, HS1)).toBe(95700);
    expect(stepSize('', 1, HS1)).toBe(13000);
    expect(stepSize('200', -1, HS1)).toBe(95700);
  });

  it('畳んだ行の表示', () => {
    expect(sizeSummary(17550, HS1)).toEqual({ amount: '17.55bb', pct: '50% pot' });
    expect(sizeSummary(95700, HS1)).toEqual({ amount: '95.7bb', pct: 'オールイン' });
    expect(sizeSummary(null, HS1)).toEqual({ amount: '—', pct: '' });
  });
});

const CALL: Mix = { fold: 0, check: 0, call: 20, s1: 0 };
const RAISE: Mix = { fold: 0, check: 0, call: 0, s1: 20 };

function paintWith(cells: Record<number, Mix>): Paint {
  const p = emptyPaint();
  for (const [i, m] of Object.entries(cells)) p[Number(i)] = m;
  return p;
}

describe('送信前の検査（06 章 §4.9）', () => {
  const keys = ['fold', 'call', 's1'] as const;

  it('1 マスも塗っていない', () => {
    expect(submitErrors(emptyPaint(), keys, 17550, HS1)).toEqual(['1マス以上塗ってください']);
  });

  it('s1 を含むマスがあり、サイズが範囲外', () => {
    expect(submitErrors(paintWith({ 0: RAISE }), keys, 12000, HS1)).toEqual(['サイズを 13〜95.7bb にしてください']);
    expect(submitErrors(paintWith({ 0: RAISE }), keys, null, HS1)).toEqual(['サイズを 13〜95.7bb にしてください']);
  });

  it('s1 を含まなければサイズは見ない・送らない', () => {
    const p = paintWith({ 0: CALL });
    expect(submitErrors(p, keys, null, HS1)).toEqual([]);
    expect(sizeForSubmit(p, 12000)).toBeNull();
  });

  it('正しい回答', () => {
    const p = paintWith({ 0: RAISE, 1: CALL });
    expect(submitErrors(p, keys, 17550, HS1)).toEqual([]);
    expect(sizeForSubmit(p, 17550)).toBe(17550);
  });

  it('合法でないキー（通常は起きない）', () => {
    expect(submitErrors(paintWith({ 0: { fold: 0, check: 20, call: 0, s1: 0 } }), keys, null, HS1)).toEqual([
      '回答の内容が正しくありません',
    ]);
  });

  it('s1 が合法でないスポット', () => {
    expect(submitErrors(paintWith({ 0: { fold: 0, check: 20, call: 0, s1: 0 } }), ['check'], null, null)).toEqual([]);
  });
});
