import { emptyPaint, type Mix, type Paint } from '@wwyd/core';
import { sameMix } from './brush.ts';

/**
 * レンジ表の塗り（詳細仕様 06 章 §4.5・§4.6。仕様書 §5.3.4・§5.3.5）。状態は不変として扱う。
 * - なぞった一連の操作（ストローク）で 1 手。何も変わらなかったストロークは履歴に積まない。
 * - ブラシと同じミックスのマスから始めたストロークは消去（なぞった範囲も消去）。消しゴムなら常に消去。
 * - スポイトはストロークを取り消す（`cancelStroke`）。
 * - 元に戻す / やり直すは最大 100 手。クリアも 1 手。
 */

export const HISTORY_MAX = 100;

export type Tool = 'brush' | 'eraser';
export type StrokeMode = 'paint' | 'erase';

export type Editor = {
  paint: Paint;
  undo: Paint[];
  redo: Paint[];
  /** ストローク中なら、始める前の paint。 */
  strokeBase: Paint | null;
};

export function newEditor(paint: Paint = emptyPaint()): Editor {
  return { paint, undo: [], redo: [], strokeBase: null };
}

/** マス `idx` から始めるストロークが塗りか消去か。 */
export function strokeMode(e: Editor, idx: number, brush: Mix, tool: Tool): StrokeMode {
  return tool === 'eraser' || sameMix(e.paint[idx] ?? null, brush) ? 'erase' : 'paint';
}

export function beginStroke(e: Editor): Editor {
  return { ...e, strokeBase: e.paint };
}

/** マス `idx` を塗る（消す）。値が変わらなければ同じ Editor を返す。 */
export function applyCell(e: Editor, idx: number, mode: StrokeMode, brush: Mix): Editor {
  const cur = e.paint[idx] ?? null;
  if (mode === 'erase' ? cur === null : sameMix(cur, brush)) return e;
  const paint = e.paint.slice();
  paint[idx] = mode === 'erase' ? null : { ...brush };
  return { ...e, paint };
}

function pushUndo(undo: readonly Paint[], p: Paint): Paint[] {
  const next = [...undo, p];
  return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
}

export function endStroke(e: Editor): Editor {
  if (!e.strokeBase) return e;
  if (e.paint === e.strokeBase) return { ...e, strokeBase: null };
  return { paint: e.paint, undo: pushUndo(e.undo, e.strokeBase), redo: [], strokeBase: null };
}

/** ストロークの塗りを取り消す（スポイト）。 */
export function cancelStroke(e: Editor): Editor {
  if (!e.strokeBase) return e;
  return { ...e, paint: e.strokeBase, strokeBase: null };
}

export function undo(e: Editor): Editor {
  const prev = e.undo[e.undo.length - 1];
  if (!prev || e.strokeBase) return e;
  return { paint: prev, undo: e.undo.slice(0, -1), redo: [...e.redo, e.paint], strokeBase: null };
}

export function redo(e: Editor): Editor {
  const next = e.redo[e.redo.length - 1];
  if (!next || e.strokeBase) return e;
  return { paint: next, undo: pushUndo(e.undo, e.paint), redo: e.redo.slice(0, -1), strokeBase: null };
}

export function isEmpty(paint: Paint): boolean {
  return paint.every((m) => m === null);
}

/** 全マスをレンジ外にする（元に戻す対象）。既に空なら何もしない。 */
export function clear(e: Editor): Editor {
  if (isEmpty(e.paint) || e.strokeBase) return e;
  return { paint: emptyPaint(), undo: pushUndo(e.undo, e.paint), redo: [], strokeBase: null };
}
