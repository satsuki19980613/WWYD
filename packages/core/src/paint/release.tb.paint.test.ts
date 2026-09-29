/**
 * リリース前の総合テスト B-05: paint のコーデック（05 章）のランダムな往復・壊れた入力の拒否・集計の性質。
 * 種を決めた擬似乱数（依存なし）。
 */
import { describe, expect, it } from 'vitest';
import { ANSWER_KEYS, MIX_TOTAL, type AnswerKey } from '../constants.ts';
import { Rng } from '../poker/release.tb.gen.ts';
import {
  AGG_BYTES,
  OPACITY_LEVELS,
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
  type AggCell,
} from './aggregate.ts';
import { PAINT_BYTES, decodePaint, emptyPaint, encodePaint, fromHex, toHex, type Mix, type Paint } from './codec.ts';
import { CELL_COUNT, TOTAL_COMBOS, combos, idxOf, labelOf } from './labels.ts';
import { validatePaint, validatePaintBytes } from './validate.ts';

/** 合計 20 のミックスをランダムに（合法なキーだけに） */
function randomMix(rng: Rng, keys: readonly AnswerKey[]): Mix {
  const m: Mix = { fold: 0, check: 0, call: 0, s1: 0 };
  const style = rng.next();
  if (style < 0.3) m[rng.pick(keys)] = MIX_TOTAL;
  else {
    let left = MIX_TOTAL;
    const order = rng.shuffle(keys);
    order.forEach((k, i) => {
      const v = i === order.length - 1 ? left : rng.int(0, left);
      m[k] = v;
      left -= v;
    });
  }
  return m;
}

function randomPaint(rng: Rng, keys: readonly AnswerKey[], density = rng.next()): Paint {
  const p = emptyPaint();
  for (let i = 0; i < CELL_COUNT; i++) if (rng.chance(density)) p[i] = randomMix(rng, keys);
  return p;
}

const KEYSETS: AnswerKey[][] = [['fold', 'call'], ['fold', 'call', 's1'], ['check'], ['check', 's1']];

describe('B-05 paint コーデック', () => {
  it('encode → toHex → fromHex → decode の往復（ランダム 4000 件・全キーの組）', () => {
    const rng = new Rng(2026);
    for (let n = 0; n < 4_000; n++) {
      const keys = rng.pick(KEYSETS);
      const p = randomPaint(rng, keys);
      const bytes = encodePaint(p);
      expect(bytes.length).toBe(PAINT_BYTES);
      const hex = toHex(bytes);
      expect(hex.length).toBe(2 + PAINT_BYTES * 2);
      expect(hex).toBe(hex.toLowerCase().replace('\\X', '\\x'));
      const back = decodePaint(fromHex(hex));
      expect(back, `n=${n}`).toEqual(p);
      // 大文字の 16 進でも同じ（PostgREST は小文字だが、受け取りは寛容）
      expect(decodePaint(fromHex(`\\x${hex.slice(2).toUpperCase()}`)), `n=${n} upper`).toEqual(p);
      // 全体が合法なら検証を通る（塗りが 0 マスなら paint_empty）
      const filled = p.some((m) => m !== null);
      const s1 = p.some((m) => m && m.s1 > 0);
      const err = validatePaint(p, keys, s1 ? 5000 : null, 1000, 9000);
      expect(err, `n=${n}`).toBe(filled ? null : 'paint_empty');
      expect(validatePaintBytes(bytes, keys, s1 ? 5000 : null, 1000, 9000)).toBe(err);
    }
  }, 120_000);

  it('壊れた 16 進を拒否する', () => {
    const good = toHex(encodePaint(randomPaint(new Rng(1), ['fold', 'call'], 1)));
    expect(() => fromHex(good.slice(2))).toThrow(); // \x が無い
    expect(() => fromHex('x' + good.slice(1))).toThrow();
    expect(() => fromHex(good + '0')).toThrow(); // 奇数
    expect(() => fromHex(good.slice(0, -1))).toThrow(); // 奇数
    expect(() => fromHex(good.slice(0, 5) + 'g' + good.slice(6))).toThrow(); // 16 進でない
    expect(() => fromHex(good.slice(0, 5) + ' ' + good.slice(6))).toThrow();
    expect(() => fromHex(good.slice(0, 5) + '\n' + good.slice(6))).toThrow();
    expect(() => fromHex('')).toThrow();
    expect(() => fromHex('\\')).toThrow();
    // 長さの違いは decodePaint が断る
    expect(() => decodePaint(fromHex('\\x'))).toThrow();
    expect(() => decodePaint(fromHex(good + '00'))).toThrow();
    expect(() => decodePaint(fromHex(good.slice(0, -2)))).toThrow();
    // 空文字の 16 進は空配列（decode は断る）
    expect(fromHex('\\x').length).toBe(0);
  });

  it('壊れたバイト列を decode が断る: 値 > 20・マスの合計が 0 でも 20 でもない（ランダムに 1 バイトだけ壊す）', () => {
    const rng = new Rng(77);
    for (let n = 0; n < 3000; n++) {
      const p = randomPaint(rng, ['fold', 'call', 's1'], 0.6);
      const bytes = encodePaint(p);
      const i = rng.int(0, PAINT_BYTES - 1);
      const orig = bytes[i]!;
      const cell = Math.floor(i / 4);
      const bad = rng.chance(0.3) ? rng.int(21, 255) : (orig + rng.int(1, 19)) % 21;
      if (bad === orig) continue;
      bytes[i] = bad;
      const sum = bytes[cell * 4]! + bytes[cell * 4 + 1]! + bytes[cell * 4 + 2]! + bytes[cell * 4 + 3]!;
      if (bad > MIX_TOTAL || (sum !== 0 && sum !== MIX_TOTAL)) {
        expect(() => decodePaint(bytes), `n=${n} i=${i}`).toThrow();
        const e = validatePaintBytes(bytes, ['fold', 'check', 'call', 's1'], 5000, 1000, 9000);
        expect(e === 'paint_value' || e === 'paint_sum', `n=${n} i=${i} e=${e}`).toBe(true);
        // 値の範囲が先に見られる
        if (bad > MIX_TOTAL) expect(e).toBe('paint_value');
      } else {
        // 合計が保たれる（0 → 0 か 20 → 20）変更は decode できる
        expect(() => decodePaint(bytes)).not.toThrow();
      }
    }
  });

  it('検証の順序（05 章 §2.3）: 長さ → 値 → 不合法キー → 合計 → 空 → size', () => {
    const keys: AnswerKey[] = ['fold', 'call', 's1'];
    const ok = encodePaint(Object.assign(emptyPaint(), { 0: { fold: 5, check: 0, call: 5, s1: 10 } }));
    expect(validatePaintBytes(ok, keys, 5000, 1000, 9000)).toBeNull();
    expect(validatePaintBytes(ok.slice(1), keys, 5000, 1000, 9000)).toBe('paint_length');
    const v = ok.slice();
    v[4] = 21;
    expect(validatePaintBytes(v, keys, 5000, 1000, 9000)).toBe('paint_value');
    // check は合法キーでない
    const ik = ok.slice();
    ik[1] = 1;
    ik[0] = 4;
    expect(validatePaintBytes(ik, keys, 5000, 1000, 9000)).toBe('paint_illegal_key');
    // 不合法キーと合計違反の両方 → 先に不合法キー
    const both = ok.slice();
    both[1] = 3;
    expect(validatePaintBytes(both, keys, 5000, 1000, 9000)).toBe('paint_illegal_key');
    const sum = ok.slice();
    sum[0] = 4;
    expect(validatePaintBytes(sum, keys, 5000, 1000, 9000)).toBe('paint_sum');
    expect(validatePaintBytes(new Uint8Array(PAINT_BYTES), keys, null, null, null)).toBe('paint_empty');
    // size
    expect(validatePaintBytes(ok, keys, null, 1000, 9000)).toBe('size_out_of_range');
    expect(validatePaintBytes(ok, keys, 999, 1000, 9000)).toBe('size_out_of_range');
    expect(validatePaintBytes(ok, keys, 9001, 1000, 9000)).toBe('size_out_of_range');
    expect(validatePaintBytes(ok, keys, 1000, 1000, 9000)).toBeNull();
    expect(validatePaintBytes(ok, keys, 9000, 1000, 9000)).toBeNull();
    expect(validatePaintBytes(ok, keys, 1000.5, 1000, 9000)).toBe('size_out_of_range');
    expect(validatePaintBytes(ok, keys, Number.NaN, 1000, 9000)).toBe('size_out_of_range');
    expect(validatePaintBytes(ok, keys, 5000, null, null)).toBe('size_out_of_range');
    // s1 を含まないのに size がある
    const noS1 = encodePaint(Object.assign(emptyPaint(), { 0: { fold: 20, check: 0, call: 0, s1: 0 } }));
    expect(validatePaintBytes(noS1, keys, 5000, 1000, 9000)).toBe('size_not_allowed');
    expect(validatePaintBytes(noS1, keys, null, 1000, 9000)).toBeNull();
    // 画面の形の paint: 頻度が整数でない・範囲外 → paint_value
    const bad = emptyPaint();
    bad[0] = { fold: 10.5, check: 0, call: 9.5, s1: 0 };
    expect(validatePaint(bad, keys, null, null, null)).toBe('paint_value');
    const neg = emptyPaint();
    neg[0] = { fold: -1, check: 0, call: 21, s1: 0 };
    expect(validatePaint(neg, keys, null, null, null)).toBe('paint_value');
    const nan = emptyPaint();
    nan[0] = { fold: Number.NaN, check: 0, call: 20, s1: 0 };
    expect(validatePaint(nan, keys, null, null, null)).toBe('paint_value');
    expect(validatePaint(emptyPaint().slice(1), keys, null, null, null)).toBe('paint_length');
    expect(() => encodePaint(emptyPaint().slice(1))).toThrow();
  });

  it('ラベル: 169 個が一意で往復し、コンボ数の合計は 1326、行列の対称（i<j はスーテッド）', () => {
    const seen = new Set<string>();
    let total = 0;
    for (let i = 0; i < CELL_COUNT; i++) {
      const l = labelOf(i);
      expect(idxOf(l)).toBe(i);
      seen.add(l);
      total += combos(i);
    }
    expect(seen.size).toBe(169);
    expect(total).toBe(TOTAL_COMBOS);
    expect(idxOf('')).toBe(-1);
    expect(idxOf('aa')).toBe(-1);
    expect(idxOf('AKx')).toBe(-1);
    expect(idxOf('__proto__')).toBe(-1);
    expect(idxOf('constructor')).toBe(-1);
  });
});

describe('B-05 集計の性質', () => {
  /** N 件のランダムな回答を集計する（DB のトリガと同じ差分更新） */
  function aggregateOf(rng: Rng, n: number, keys: readonly AnswerKey[]): { agg: AggCell[]; paints: Paint[] } {
    let agg = emptyAggregate();
    const paints: Paint[] = [];
    for (let i = 0; i < n; i++) {
      let p = randomPaint(rng, keys, 0.05 + rng.next() * 0.9);
      if (p.every((m) => m === null)) p = Object.assign(emptyPaint(), { [rng.int(0, 168)]: randomMix(rng, keys) });
      paints.push(p);
      agg = addAnswer(agg, p);
    }
    return { agg, paints };
  }

  it('集計のエンコード・デコードの往復と、1 件ずつの加算が一括の合計と一致する（uint16 の境目を含む）', () => {
    const rng = new Rng(4242);
    for (let t = 0; t < 300; t++) {
      const n = rng.pick([1, 2, 3, 7, 20, 100]);
      const { agg, paints } = aggregateOf(rng, n, ['fold', 'call', 's1']);
      const back = decodeAggregate(encodeAggregate(agg));
      expect(back).toEqual(agg);
      // 独立な合計
      for (let idx = 0; idx < CELL_COUNT; idx++) {
        const inRange = paints.filter((p) => p[idx]);
        expect(agg[idx]!.n, `t=${t} idx=${idx}`).toBe(inRange.length);
        for (const k of ANSWER_KEYS) expect(agg[idx]!.sum[k]).toBe(inRange.reduce((s, p) => s + (p[idx] as Mix)[k], 0));
      }
      // 順序に依存しない（対称）
      let rev = emptyAggregate();
      for (const p of [...paints].reverse()) rev = addAnswer(rev, p);
      expect(rev).toEqual(agg);
    }
    // uint16 の境目
    const cells = emptyAggregate();
    cells[0] = { n: 3276, sum: { fold: 0, check: 0, call: 65520, s1: 0 } };
    expect(decodeAggregate(encodeAggregate(cells))).toEqual(cells);
    cells[0] = { n: 65535, sum: { fold: 0, check: 0, call: 65535, s1: 0 } };
    expect(decodeAggregate(encodeAggregate(cells))).toEqual(cells);
    cells[0] = { n: 65536, sum: { fold: 0, check: 0, call: 0, s1: 0 } };
    expect(() => encodeAggregate(cells)).toThrow();
    cells[0] = { n: -1, sum: { fold: 0, check: 0, call: 0, s1: 0 } };
    expect(() => encodeAggregate(cells)).toThrow();
    expect(() => decodeAggregate(new Uint8Array(AGG_BYTES - 1))).toThrow();
    expect(() => decodeAggregate(new Uint8Array(AGG_BYTES + 1))).toThrow();
  });

  it('マスの色の割合は 0〜1 で合計 1、濃さは 5 段のどれか（N ごと）', () => {
    const rng = new Rng(99);
    const legalOp = new Set([0, 0.3, 0.475, 0.65, 0.825, 1]);
    for (let t = 0; t < 200; t++) {
      const n = rng.int(1, 60);
      const { agg } = aggregateOf(rng, n, rng.pick(KEYSETS));
      for (let idx = 0; idx < CELL_COUNT; idx++) {
        const v = aggregateCellView(agg[idx]!, n);
        expect(legalOp.has(v.opacity), `t=${t} idx=${idx} op=${v.opacity}`).toBe(true);
        if (agg[idx]!.n === 0) {
          expect(v).toEqual({ ratio: null, opacity: 0 });
          continue;
        }
        const r = v.ratio!;
        let sum = 0;
        for (const k of ANSWER_KEYS) {
          expect(r[k]).toBeGreaterThanOrEqual(0);
          expect(r[k]).toBeLessThanOrEqual(1);
          sum += r[k];
        }
        expect(Math.abs(sum - 1), `t=${t} idx=${idx}`).toBeLessThan(1e-9);
        expect(v.opacity).toBeGreaterThan(0);
        // 濃さの段は割合の切り上げ（厳密な有理数で独立に）
        const level = Math.min(5, Math.ceil((5 * agg[idx]!.n) / n));
        expect(v.opacity).toBe(levelOpacity(level));
      }
    }
  });

  it('opacityLevel: 厳密な有理数の切り上げと一致し、n について単調、n = N は 5 段', () => {
    const rng = new Rng(3);
    for (let t = 0; t < 400; t++) {
      const N = rng.pick([1, 2, 3, 4, 5, 7, 10, 13, 100, 101, 999, 2000, 3276]);
      let prev = 0;
      for (let n = 0; n <= N; n += N > 300 ? rng.int(1, 40) : 1) {
        const lv = opacityLevel(n, N);
        expect(lv, `n=${n} N=${N}`).toBe(n === 0 ? 0 : Math.ceil((5 * n) / N));
        expect(lv).toBeGreaterThanOrEqual(prev);
        prev = lv;
      }
      expect(opacityLevel(N, N)).toBe(OPACITY_LEVELS);
      expect(opacityLevel(1, N)).toBeGreaterThanOrEqual(1);
    }
    expect(opacityLevel(0, 5)).toBe(0);
    expect(opacityLevel(3, 0)).toBe(0);
    expect(opacityLevel(-1, 5)).toBe(0);
    // n > N（壊れた集計）でも 5 段を超えない
    expect(opacityLevel(50, 3)).toBe(5);
    // levelOpacity の端
    expect(levelOpacity(0)).toBe(0);
    expect(levelOpacity(1)).toBe(0.3);
    expect(levelOpacity(5)).toBe(1);
  });

  it('全体バーと自分のバー: 各比率は 0〜1、合計は 1', () => {
    const rng = new Rng(555);
    for (let t = 0; t < 300; t++) {
      const n = rng.int(1, 80);
      const { agg, paints } = aggregateOf(rng, n, rng.pick(KEYSETS));
      const bar = aggregateBar(agg, n);
      let sum = 0;
      for (const v of Object.values(bar)) {
        expect(v).toBeGreaterThanOrEqual(-1e-12);
        expect(v).toBeLessThanOrEqual(1 + 1e-12);
        sum += v;
      }
      expect(Math.abs(sum - 1), `t=${t}`).toBeLessThan(1e-9);
      const mine = paintBar(paints[0]!);
      const ms = Object.values(mine).reduce((a, b) => a + b, 0);
      expect(Math.abs(ms - 1)).toBeLessThan(1e-9);
      // 1 人の集計のバーは、その人の paintBar と一致する（対称・整合）
      const one = addAnswer(emptyAggregate(), paints[0]!);
      const b1 = aggregateBar(one, 1);
      for (const k of [...ANSWER_KEYS, 'off'] as const) expect(b1[k]).toBeCloseTo(mine[k], 9);
    }
    // 回答 0 件 → すべてレンジ外
    expect(aggregateBar(emptyAggregate(), 0)).toEqual({ fold: 0, check: 0, call: 0, s1: 0, off: 1 });
  });

  it('同じ回答を N 件集計しても割合は同じ（回答の数に依らない）で、濃さは 1', () => {
    const rng = new Rng(8);
    for (let t = 0; t < 50; t++) {
      const p = randomPaint(rng, ['fold', 'call', 's1'], 0.5);
      if (p.every((m) => m === null)) continue;
      let agg = emptyAggregate();
      const N = rng.int(1, 40);
      for (let i = 0; i < N; i++) agg = addAnswer(agg, p);
      for (let idx = 0; idx < CELL_COUNT; idx++) {
        const v = aggregateCellView(agg[idx]!, N);
        const w = paintCellView(p[idx] ?? null);
        expect(v.opacity).toBe(w.opacity);
        if (v.ratio && w.ratio) for (const k of ANSWER_KEYS) expect(v.ratio[k]).toBeCloseTo(w.ratio[k], 12);
        if (p[idx]) for (const k of ANSWER_KEYS) expect(weightedCount(agg[idx]!, k)).toBe(Math.round(((p[idx] as Mix)[k] * N) / MIX_TOTAL));
      }
    }
  });

  it('全体表示のマス: n_cell が total より多い壊れた集計でも NaN・Infinity を出さない', () => {
    const cell: AggCell = { n: 5, sum: { fold: 100, check: 0, call: 0, s1: 0 } };
    const v = aggregateCellView(cell, 3);
    for (const k of ANSWER_KEYS) expect(Number.isFinite(v.ratio![k])).toBe(true);
    expect(Number.isFinite(v.opacity)).toBe(true);
    expect(aggregateCellView(cell, 0)).toEqual({ ratio: null, opacity: 0 });
  });
});
