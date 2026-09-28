import { ANSWER_KEYS, CELL_COUNT, labelOf, mixUnitsToPercent, type AnswerKey, type Mix, type Paint } from '@wwyd/core';
import { memo, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { KeyNames } from './BrushPanel.tsx';

/** スポイトの長押し（06 章 §4.5） */
export const PICK_MS = 480;
/** これ以上動いたら長押しではなくなぞる操作 */
export const PICK_MOVE_PX = 6;

const SIDE = 13;

/** マスの読み上げ（「AKs コール 50% / レイズ 50%」「AKs レンジ外」） */
export function cellText(idx: number, mix: Mix | null, names: KeyNames): string {
  if (!mix) return `${labelOf(idx)} レンジ外`;
  const parts = ANSWER_KEYS.filter((k) => mix[k] > 0).map((k) => `${names[k]} ${mixUnitsToPercent(mix[k])}%`);
  return `${labelOf(idx)} ${parts.join(' / ')}`;
}

/** マスの中身: 左から fold → check → call → s1 の順に頻度の幅で色を並べる */
export function CellFill(props: { mix: Mix | null }): JSX.Element | null {
  const { mix } = props;
  if (!mix) return null;
  return (
    <span className="cfill" aria-hidden="true">
      {ANSWER_KEYS.filter((k) => mix[k] > 0).map((k) => (
        <i key={k} className={`cseg ${k}`} style={{ width: `${mixUnitsToPercent(mix[k])}%` }} />
      ))}
    </span>
  );
}

/** 1 色だけのマスは、その色の上の文字色にする（混合は明るい文字＋影） */
function inkClass(mix: Mix | null): string {
  if (!mix) return '';
  const used = ANSWER_KEYS.filter((k) => mix[k] > 0);
  return used.length === 1 ? ` ink-${used[0] as AnswerKey}` : ' ink-mixed';
}

type Drag = { id: number; last: number; x: number; y: number; moved: boolean; picked: boolean; timer: number };

/**
 * レンジ表（13×13）。タップ・なぞる・長押し（スポイト）を親に伝えるだけで、塗りの状態は持たない。
 * - `onStart(idx)` ストロークの開始、`onEnter(idx)` なぞって入ったマス、`onEnd()` ストロークの終わり
 * - `onPick(idx)` 480ms 動かさずに押し続けた（親はストロークを取り消してブラシに読み込む。onEnd は呼ばない）
 * キーボード: 矢印キーでマスを移動、Enter / Space で塗る（1 マスのストローク）。
 */
export const RangeGrid = memo(function RangeGrid(props: {
  paint: Paint;
  names: KeyNames;
  onStart: (idx: number) => void;
  onEnter: (idx: number) => void;
  onEnd: () => void;
  onPick: (idx: number) => void;
}): JSX.Element {
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const focusIdx = useRef(0);
  const cb = useRef(props);
  cb.current = props;

  useEffect(
    () => () => {
      if (drag.current) window.clearTimeout(drag.current.timer);
    },
    [],
  );

  const idxOfTarget = (el: Element | null): number | null => {
    const cell = el?.closest<HTMLElement>('[data-idx]');
    if (!cell || !grid.current?.contains(cell)) return null;
    return Number(cell.dataset.idx);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || drag.current) return;
    const idx = idxOfTarget(e.target as Element);
    if (idx === null) return;
    e.preventDefault();
    grid.current?.setPointerCapture(e.pointerId);
    focusIdx.current = idx;
    const d: Drag = { id: e.pointerId, last: idx, x: e.clientX, y: e.clientY, moved: false, picked: false, timer: 0 };
    d.timer = window.setTimeout(() => {
      if (drag.current !== d || d.moved) return;
      d.picked = true;
      cb.current.onPick(idx);
    }, PICK_MS);
    drag.current = d;
    cb.current.onStart(idx);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.picked) return;
    if (Math.abs(e.clientX - d.x) > PICK_MOVE_PX || Math.abs(e.clientY - d.y) > PICK_MOVE_PX) d.moved = true;
    const idx = idxOfTarget(document.elementFromPoint(e.clientX, e.clientY));
    if (idx === null || idx === d.last) return;
    d.moved = true;
    d.last = idx;
    cb.current.onEnter(idx);
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    window.clearTimeout(d.timer);
    drag.current = null;
    if (!d.picked) cb.current.onEnd();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const idx = idxOfTarget(e.target as Element);
    if (idx === null) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      cb.current.onStart(idx);
      cb.current.onEnd();
      return;
    }
    const i = Math.floor(idx / SIDE);
    const j = idx % SIDE;
    const move: Record<string, [number, number]> = {
      ArrowUp: [i - 1, j],
      ArrowDown: [i + 1, j],
      ArrowLeft: [i, j - 1],
      ArrowRight: [i, j + 1],
      Home: [i, 0],
      End: [i, SIDE - 1],
    };
    const to = move[e.key];
    if (!to) return;
    e.preventDefault();
    const [ni, nj] = to;
    if (ni < 0 || ni >= SIDE || nj < 0 || nj >= SIDE) return;
    focusIdx.current = ni * SIDE + nj;
    grid.current?.querySelector<HTMLElement>(`[data-idx="${focusIdx.current}"]`)?.focus();
  };

  return (
    <div
      ref={grid}
      className="rgrid"
      role="group"
      aria-label="レンジ表"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {Array.from({ length: CELL_COUNT }, (_, idx) => {
        const mix = props.paint[idx] ?? null;
        return (
          <button
            key={idx}
            type="button"
            data-idx={idx}
            className={`rcell${mix ? ' on' : ''}${inkClass(mix)}`}
            tabIndex={idx === focusIdx.current ? 0 : -1}
            aria-label={cellText(idx, mix, props.names)}
          >
            <CellFill mix={mix} />
            <span className="rcell-lbl">{labelOf(idx)}</span>
          </button>
        );
      })}
    </div>
  );
});
