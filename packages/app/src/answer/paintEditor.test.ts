import { emptyPaint, type Mix } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import {
  applyCell,
  beginStroke,
  cancelStroke,
  clear,
  endStroke,
  HISTORY_MAX,
  newEditor,
  redo,
  strokeMode,
  undo,
  type Editor,
} from './paintEditor.ts';

const CALL: Mix = { fold: 0, check: 0, call: 20, s1: 0 };
const MIXED: Mix = { fold: 0, check: 0, call: 10, s1: 10 };

/** マスを順になぞる 1 回のストローク（最初のマスで塗りか消去かを決める）。 */
function stroke(e: Editor, cells: number[], brush: Mix, tool: 'brush' | 'eraser' = 'brush'): Editor {
  const mode = strokeMode(e, cells[0] as number, brush, tool);
  let x = beginStroke(e);
  for (const c of cells) x = applyCell(x, c, mode, brush);
  return endStroke(x);
}

describe('塗り（06 章 §4.5）', () => {
  it('タップで塗る', () => {
    const e = stroke(newEditor(), [0], CALL);
    expect(e.paint[0]).toEqual(CALL);
    expect(e.undo).toHaveLength(1);
  });

  it('なぞった一連の操作は 1 手', () => {
    const e = stroke(newEditor(), [0, 1, 2, 14], CALL);
    expect([0, 1, 2, 14].map((i) => e.paint[i])).toEqual([CALL, CALL, CALL, CALL]);
    expect(e.undo).toHaveLength(1);
    expect(undo(e).paint).toEqual(emptyPaint());
  });

  it('ブラシと同じミックスのマスから始めると消去（なぞった範囲も）', () => {
    let e = stroke(newEditor(), [0, 1, 2], CALL);
    e = stroke(e, [1, 2, 3], CALL);
    expect(e.paint.slice(0, 4)).toEqual([CALL, null, null, null]);
  });

  it('違うミックスのマスから始めると上書き', () => {
    let e = stroke(newEditor(), [0], CALL);
    e = stroke(e, [0, 1], MIXED);
    expect(e.paint.slice(0, 2)).toEqual([MIXED, MIXED]);
  });

  it('消しゴムは常に消去', () => {
    let e = stroke(newEditor(), [0, 1], CALL);
    e = stroke(e, [5, 0], CALL, 'eraser');
    expect(e.paint.slice(0, 2)).toEqual([null, CALL]);
  });

  it('何も変わらないストロークは履歴に積まない', () => {
    const e = stroke(newEditor(), [3], CALL, 'eraser');
    expect(e.undo).toHaveLength(0);
  });

  it('塗ったマスは別のオブジェクト（ブラシを後で変えても変わらない）', () => {
    const brush = { ...CALL };
    const e = stroke(newEditor(), [0], brush);
    brush.call = 0;
    expect(e.paint[0]).toEqual(CALL);
  });
});

describe('スポイト（ストロークの取り消し）', () => {
  it('その操作による塗りを取り消す。履歴は増えない', () => {
    let e = stroke(newEditor(), [0], MIXED);
    const before = e;
    e = beginStroke(e);
    e = applyCell(e, 0, strokeMode(e, 0, CALL, 'brush'), CALL);
    expect(e.paint[0]).toEqual(CALL);
    e = cancelStroke(e);
    expect(e.paint).toBe(before.paint);
    expect(e.undo).toHaveLength(1);
    expect(e.strokeBase).toBeNull();
  });
});

describe('元に戻す / やり直す / クリア（06 章 §4.6）', () => {
  it('戻す → やり直す', () => {
    let e = stroke(newEditor(), [0], CALL);
    e = stroke(e, [1], CALL);
    e = undo(e);
    expect(e.paint[1]).toBeNull();
    expect(e.paint[0]).toEqual(CALL);
    e = redo(e);
    expect(e.paint[1]).toEqual(CALL);
    expect(redo(e)).toBe(e);
  });

  it('新しく塗るとやり直しは消える', () => {
    let e = stroke(newEditor(), [0], CALL);
    e = undo(e);
    e = stroke(e, [2], CALL);
    expect(e.redo).toHaveLength(0);
  });

  it('最大 100 手', () => {
    let e = newEditor();
    for (let i = 0; i < 120; i++) e = stroke(e, [i], CALL);
    expect(e.undo).toHaveLength(HISTORY_MAX);
    for (let i = 0; i < 120; i++) e = undo(e);
    // 最初の 20 手は戻せない
    expect(e.paint.slice(0, 20).every((m) => m !== null)).toBe(true);
    expect(e.paint.slice(20, 120).every((m) => m === null)).toBe(true);
  });

  it('クリアは全マスをレンジ外にし、元に戻せる。空なら何もしない', () => {
    let e = stroke(newEditor(), [0, 1], CALL);
    e = clear(e);
    expect(e.paint).toEqual(emptyPaint());
    expect(clear(e)).toBe(e);
    e = undo(e);
    expect(e.paint.slice(0, 2)).toEqual([CALL, CALL]);
  });
});
