import { describe, expect, it } from 'vitest';
import { boundaries, handlesAt, initialBrush, moveBoundary, pickHandle, pureBrush, sameMix } from './brush.ts';

const mix = (fold: number, check: number, call: number, s1: number) => ({ fold, check, call, s1 });

describe('初期ブラシ（06 章 §4.4）', () => {
  it('call があれば call 100%', () => {
    expect(initialBrush(['fold', 'call', 's1'])).toEqual(mix(0, 0, 20, 0));
    expect(initialBrush(['fold', 'call'])).toEqual(mix(0, 0, 20, 0));
  });
  it('なければ先頭キー 100%', () => {
    expect(initialBrush(['check', 's1'])).toEqual(mix(0, 20, 0, 0));
    expect(initialBrush(['check'])).toEqual(mix(0, 20, 0, 0));
  });
  it('タイルはそのキー 100%', () => {
    expect(pureBrush('s1')).toEqual(mix(0, 0, 0, 20));
  });
});

describe('Mix バーの境界', () => {
  const keys = ['fold', 'call', 's1'] as const;

  it('境界は累積', () => {
    expect(boundaries(mix(10, 0, 4, 6), keys)).toEqual([10, 14]);
  });

  it('境界を動かすと隣り合うキーの頻度が変わり、合計は 20 のまま', () => {
    const b = moveBoundary(mix(10, 0, 4, 6), keys, 0, 6);
    expect(b).toEqual(mix(6, 0, 8, 6));
    expect(b.fold + b.call + b.s1).toBe(20);
  });

  it('隣の境界を越えない', () => {
    expect(moveBoundary(mix(10, 0, 4, 6), keys, 0, 18)).toEqual(mix(14, 0, 0, 6));
    expect(moveBoundary(mix(10, 0, 4, 6), keys, 1, 3)).toEqual(mix(10, 0, 0, 10));
    expect(moveBoundary(mix(10, 0, 4, 6), keys, 1, 25)).toEqual(mix(10, 0, 10, 0));
    expect(moveBoundary(mix(10, 0, 4, 6), keys, 0, -3)).toEqual(mix(0, 0, 14, 6));
  });

  it('キーが 1 つなら境界は無い', () => {
    expect(boundaries(mix(0, 20, 0, 0), ['check'])).toEqual([]);
    expect(moveBoundary(mix(0, 20, 0, 0), ['check'], 0, 5)).toEqual(mix(0, 20, 0, 0));
  });
});

describe('重なったハンドル（仕様書 §5.3.3「その方向へ動けるハンドル」）', () => {
  it('fold 50 / call 0 / s1 50: 右へは call の右端（添字 1）、左へは fold の右端（添字 0）', () => {
    const bounds = [10, 10];
    expect(pickHandle(bounds, [0, 1], 1)).toBe(1);
    expect(pickHandle(bounds, [0, 1], -1)).toBe(0);
    // 選んだハンドルで実際に動ける
    const keys = ['fold', 'call', 's1'] as const;
    expect(moveBoundary(mix(10, 0, 0, 10), keys, 1, 12)).toEqual(mix(10, 0, 2, 8));
    expect(moveBoundary(mix(10, 0, 0, 10), keys, 0, 8)).toEqual(mix(8, 0, 2, 10));
  });

  it('左端に重なった（fold 0 / call 0 / s1 100）: 右へは添字 1', () => {
    expect(pickHandle([0, 0], [0, 1], 1)).toBe(1);
  });

  it('右端に重なった（fold 100 / call 0 / s1 0）: 左へは添字 0', () => {
    expect(pickHandle([20, 20], [0, 1], -1)).toBe(0);
  });

  it('どれも動けないときは向きの側の端', () => {
    expect(pickHandle([20, 20], [0, 1], 1)).toBe(1);
    expect(pickHandle([0, 0], [0, 1], -1)).toBe(0);
  });

  it('押した位置の近くのハンドル（重なりはすべて）', () => {
    expect(handlesAt([10, 10], 0.52, 0.05)).toEqual([0, 1]);
    expect(handlesAt([6, 14], 0.31, 0.05)).toEqual([0]);
    expect(handlesAt([6, 14], 0.5, 0.05)).toEqual([]);
  });
});

describe('sameMix', () => {
  it('null は常に別', () => {
    expect(sameMix(null, mix(0, 0, 20, 0))).toBe(false);
    expect(sameMix(mix(0, 0, 20, 0), mix(0, 0, 20, 0))).toBe(true);
    expect(sameMix(mix(0, 0, 10, 10), mix(0, 0, 20, 0))).toBe(false);
  });
});
