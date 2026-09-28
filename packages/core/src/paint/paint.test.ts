/**
 * 詳細仕様 05 章 §5 のテストケース（PAINT）と共有テストベクタ。
 */
import { describe, expect, it } from 'vitest';
import { ANSWER_KEYS, type AnswerKey } from '../constants.ts';
import { bbToMbb } from '../money.ts';
import vectorFile from '../../test-vectors/paint-validation.json';
import {
  addAnswer,
  aggregateBar,
  aggregateCellView,
  decodeAggregate,
  emptyAggregate,
  encodeAggregate,
  levelOpacity,
  opacityLevel,
  paintBar,
  paintCellView,
  weightedCount,
} from './aggregate.ts';
import { decodePaint, emptyPaint, encodePaint, fromHex, toHex, type Mix, type Paint } from './codec.ts';
import { CELL_COUNT, combos, idxOf, labelOf, labelOfCards, TOTAL_COMBOS } from './labels.ts';
import { validatePaint, validatePaintBytes } from './validate.ts';

const FCS: AnswerKey[] = ['fold', 'call', 's1'];

function mix(m: Partial<Mix>): Mix {
  return { fold: 0, check: 0, call: 0, s1: 0, ...m };
}

function paintOf(cells: Record<string, Partial<Mix>>): Paint {
  const p = emptyPaint();
  for (const [label, m] of Object.entries(cells)) p[idxOf(label)] = mix(m);
  return p;
}

describe('PAINT ラベルとコンボ', () => {
  it('PAINT-01 ラベル ↔ 添字', () => {
    expect([idxOf('AA'), idxOf('AKs'), idxOf('A2s'), idxOf('AKo'), idxOf('KK'), idxOf('32o'), idxOf('22')]).toEqual([
      0, 1, 12, 13, 14, 167, 168,
    ]);
    const labels = Array.from({ length: CELL_COUNT }, (_, i) => labelOf(i));
    expect(new Set(labels).size).toBe(CELL_COUNT);
    labels.forEach((l, i) => expect(idxOf(l)).toBe(i));
    expect(idxOf('XX')).toBe(-1);
  });

  it('PAINT-02 コンボ数の合計は 1326', () => {
    let sum = 0;
    for (let i = 0; i < CELL_COUNT; i++) sum += combos(i);
    expect(sum).toBe(TOTAL_COMBOS);
  });

  it('PAINT-03 実カード → ラベル', () => {
    expect(labelOfCards('Ks', 'Js')).toBe('KJs');
    expect(labelOfCards('Jh', 'Kd')).toBe('KJo');
    expect(labelOfCards('7c', '7d')).toBe('77');
  });
});

describe('PAINT エンコードと検証', () => {
  it('PAINT-04 全マス null', () => {
    const bytes = encodePaint(emptyPaint());
    expect(bytes.length).toBe(676);
    expect(bytes.every((b) => b === 0)).toBe(true);
    expect(validatePaint(emptyPaint(), FCS, null, 13000, 95700)).toBe('paint_empty');
  });

  it('PAINT-05 AA に call 20', () => {
    const bytes = encodePaint(paintOf({ AA: { call: 20 } }));
    expect(Array.from(bytes.slice(0, 4))).toEqual([0, 0, 20, 0]);
    expect(toHex(bytes).startsWith('\\x0000140000')).toBe(true);
    expect(toHex(bytes).length).toBe(2 + 1352);
  });

  it('PAINT-06 encode → toHex → fromHex → decode の往復（ランダム 1000 件）', () => {
    // 再現できるよう、固定の種の擬似乱数を使う
    let seed = 12345;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let t = 0; t < 1000; t++) {
      const p = emptyPaint();
      for (let idx = 0; idx < CELL_COUNT; idx++) {
        if (rand(3) === 0) continue;
        const a = rand(21);
        const b = rand(21 - a);
        const c = rand(21 - a - b);
        p[idx] = { fold: a, check: b, call: c, s1: 20 - a - b - c };
      }
      expect(decodePaint(fromHex(toHex(encodePaint(p))))).toEqual(p);
    }
  });

  it('PAINT-07 合法でないキー', () => {
    expect(validatePaint(paintOf({ AA: { fold: 20 } }), ['check', 's1'], null, 1000, 85500)).toBe('paint_illegal_key');
  });

  it('PAINT-08 マスの合計 15', () => {
    expect(validatePaint(paintOf({ AA: { call: 15 } }), FCS, null, 13000, 95700)).toBe('paint_sum');
  });

  it('PAINT-09 バイト値 21', () => {
    const bytes = encodePaint(paintOf({ AA: { call: 20 } }));
    bytes[2] = 21;
    expect(validatePaintBytes(bytes, FCS, null, 13000, 95700)).toBe('paint_value');
    expect(validatePaint(paintOf({ AA: { call: 21 } }), FCS, null, 13000, 95700)).toBe('paint_value');
  });

  it('PAINT-10 size が min 未満', () => {
    expect(validatePaint(paintOf({ AA: { s1: 20 } }), FCS, 12990, 13000, 95700)).toBe('size_out_of_range');
  });

  it('PAINT-11 s1 を含まないのに size', () => {
    expect(validatePaint(paintOf({ AA: { call: 20 } }), FCS, 13000, 13000, 95700)).toBe('size_not_allowed');
  });

  it('正常', () => {
    expect(validatePaint(paintOf({ AA: { call: 10, s1: 10 } }), FCS, 17550, 13000, 95700)).toBeNull();
    expect(validatePaint(emptyPaint().slice(1), FCS, null, null, null)).toBe('paint_length');
  });

  it('decodePaint は壊れた入力を拒否する', () => {
    expect(() => decodePaint(new Uint8Array(675))).toThrow();
    const bad = new Uint8Array(676);
    bad[0] = 21;
    expect(() => decodePaint(bad)).toThrow();
    const half = new Uint8Array(676);
    half[0] = 10;
    expect(() => decodePaint(half)).toThrow();
    expect(() => fromHex('0000')).toThrow();
    expect(() => fromHex('\\x0')).toThrow();
    expect(() => fromHex('\\xzz')).toThrow();
    expect(() => encodePaint([])).toThrow();
  });
});

describe('共有テストベクタ（paint-validation.json）', () => {
  type Vector = {
    name: string;
    hex: string;
    keys: AnswerKey[];
    size: number | null;
    min_to: number | null;
    max_to: number | null;
    expect: string | null;
  };
  const toMbb = (v: number | null): number | null => (v === null ? null : bbToMbb(v));

  it.each((vectorFile as { vectors: Vector[] }).vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    expect(validatePaintBytes(fromHex(v.hex), v.keys, toMbb(v.size), toMbb(v.min_to), toMbb(v.max_to))).toBe(v.expect);
  });
});

describe('PAINT 集計', () => {
  const A = paintOf({ AA: { call: 20 } });
  const B = paintOf({ AA: { call: 10, s1: 10 }, KK: { fold: 20 } });
  const agg = addAnswer(addAnswer(emptyAggregate(), A), B);
  const AA = agg[idxOf('AA')] as (typeof agg)[number];
  const KK = agg[idxOf('KK')] as (typeof agg)[number];

  it('PAINT-12 2 件の集計と表示', () => {
    expect(AA).toEqual({ n: 2, sum: mix({ call: 30, s1: 10 }) });
    const aaView = aggregateCellView(AA, 2);
    expect(aaView.ratio).toEqual(mix({ call: 0.75, s1: 0.25 }));
    expect(aaView.opacity).toBe(1);
    expect(aggregateCellView(KK, 2).opacity).toBeCloseTo(0.65, 10);
    expect(aggregateCellView(agg[idxOf('QQ')] as (typeof agg)[number], 2)).toEqual({ ratio: null, opacity: 0 });
    expect(weightedCount(AA, 'call')).toBe(2); // 30 / 20 = 1.5 → 2
    expect(weightedCount(AA, 's1')).toBe(1); // 10 / 20 = 0.5 → 1
  });

  it('PAINT-15 濃さはレンジに入れた人の割合の 5 段（20% 刻み。境目は下の段）', () => {
    expect([0, 1, 20, 21, 40, 41, 60, 61, 80, 81, 100].map((n) => opacityLevel(n, 100))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect([1, 2, 3].map((n) => opacityLevel(n, 3))).toEqual([2, 4, 5]); // 33% → 2、67% → 4
    expect(opacityLevel(1, 2000)).toBe(1); // 0.05% でも無色にしない
    expect([1, 2, 3, 4, 5].map(levelOpacity)).toEqual([0.3, 0.475, 0.65, 0.825, 1]);
    expect(levelOpacity(0)).toBe(0);
    const cell = { n: 399, sum: mix({ call: 399 * 20 }) };
    expect(aggregateCellView(cell, 2000).opacity).toBe(0.3); // 19.95% → 1 段目
    expect(aggregateCellView({ ...cell, n: 401 }, 2000).opacity).toBe(0.475); // 20.05% → 2 段目
  });

  it('PAINT-13 上部バー', () => {
    const bar = aggregateBar(agg, 2);
    expect(bar.call).toBeCloseTo((6 * 30) / (20 * 2 * 1326), 12);
    expect(bar.fold).toBeCloseTo((6 * 20) / (20 * 2 * 1326), 12);
    expect(bar.off).toBeCloseTo((1326 - 6 - 6 * 0.5) / 1326, 12);
    const total = ANSWER_KEYS.reduce((s, k) => s + bar[k], bar.off);
    expect(total).toBeCloseTo(1, 12);
    expect(aggregateBar(emptyAggregate(), 0)).toEqual({ fold: 0, check: 0, call: 0, s1: 0, off: 1 });
    expect(aggregateCellView(AA, 0).opacity).toBe(0);
  });

  it('PAINT-14 集計のエンコード（ビッグエンディアン）', () => {
    const a = emptyAggregate();
    a[0] = { n: 300, sum: mix({ call: 6000 }) };
    const bytes = encodeAggregate(a);
    expect(bytes.length).toBe(1690);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x01, 0x2c]);
    expect(decodeAggregate(bytes)).toEqual(a);
    expect(decodeAggregate(encodeAggregate(agg))).toEqual(agg);
    expect(() => decodeAggregate(new Uint8Array(10))).toThrow();
    a[0] = { n: 70000, sum: mix({}) };
    expect(() => encodeAggregate(a)).toThrow();
  });

  it('自分の表示とバー（§4.2）', () => {
    expect(paintCellView(null)).toEqual({ ratio: null, opacity: 0 });
    expect(paintCellView(mix({ fold: 5, s1: 15 }))).toEqual({ ratio: mix({ fold: 0.25, s1: 0.75 }), opacity: 1 });
    const bar = paintBar(B);
    expect(bar.fold).toBeCloseTo(6 / 1326, 12);
    expect(bar.call).toBeCloseTo(3 / 1326, 12);
    expect(bar.s1).toBeCloseTo(3 / 1326, 12);
    expect(bar.off).toBeCloseTo((1326 - 12) / 1326, 12);
  });
});
