import { MIX_TOTAL, mixUnitsToPercent, type AnswerKey, type Mix } from '@wwyd/core';
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { BrushIcon, EraserIcon, RedoIcon, UndoIcon } from '../components/Icons.tsx';
import {
  boundaries,
  boundaryRange,
  HANDLE_DECIDE_PX,
  handlesAt,
  moveBoundary,
  pickHandle,
  pureBrush,
} from './brush.ts';
import type { Tool } from './paintEditor.ts';

export type KeyNames = Record<AnswerKey, string>;

/**
 * ブラシパネル（06 章 §4.4・§4.6）: アクションのタイル、ミックスバー、道具（ブラシ / 消しゴム・元に戻す・
 * やり直す・取れないアクション（PC のみ）・`extra`（スマホの Size と Hand History のボタン）・クリア）。
 */
export function BrushPanel(props: {
  keys: readonly AnswerKey[];
  names: KeyNames;
  /** タイルの 3 行目（コール額・サイズ） */
  subs: Partial<Record<AnswerKey, string>>;
  /** 取れないアクション（PC で非活性ボタンとして並べる。スマホでは空） */
  disabledNames: readonly string[];
  brush: Mix;
  tool: Tool;
  onBrush: (b: Mix) => void;
  onTool: (t: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  /** クリアの前に並べるボタン（スマホの Size・Hand History） */
  extra?: ReactNode;
}): JSX.Element {
  const erasing = props.tool === 'eraser';
  return (
    <div className={`brush${erasing ? ' erasing' : ''}`}>
      <div className="brush-tiles" style={{ gridTemplateColumns: `repeat(${props.keys.length}, minmax(0, 1fr))` }}>
        {props.keys.map((k) => (
          <button
            key={k}
            type="button"
            className={`btile ${k}${props.brush[k] === 0 ? ' zero' : ''}`}
            aria-pressed={!erasing && props.brush[k] === MIX_TOTAL}
            onClick={() => {
              props.onBrush(pureBrush(k));
              props.onTool('brush');
            }}
          >
            <span className="btile-name">{props.names[k]}</span>
            <span className="btile-vals">
              <span className="btile-pct num">{mixUnitsToPercent(props.brush[k])}%</span>
              <span className="btile-sub num">{props.subs[k] ?? ''}</span>
            </span>
          </button>
        ))}
      </div>
      {props.keys.length > 1 && (
        <MixBar
          keys={props.keys}
          names={props.names}
          brush={props.brush}
          off={erasing}
          onChange={(b) => {
            props.onBrush(b);
            props.onTool('brush');
          }}
        />
      )}
      <div className="brush-tools">
        <div className="tool-seg" role="group" aria-label="道具">
          <button type="button" className="tool-btn" aria-label="ブラシ" aria-pressed={!erasing} onClick={() => props.onTool('brush')}>
            <BrushIcon />
          </button>
          <button type="button" className="tool-btn" aria-label="消しゴム" aria-pressed={erasing} onClick={() => props.onTool('eraser')}>
            <EraserIcon />
          </button>
        </div>
        <button type="button" className="tool-btn" aria-label="元に戻す" disabled={!props.canUndo} onClick={props.onUndo}>
          <UndoIcon />
        </button>
        <button type="button" className="tool-btn" aria-label="やり直す" disabled={!props.canRedo} onClick={props.onRedo}>
          <RedoIcon />
        </button>
        {props.disabledNames.length > 0 && (
          <span className="brush-disabled">
            {props.disabledNames.map((n) => (
              <button key={n} type="button" className="btile-off" disabled>
                {n}
              </button>
            ))}
          </span>
        )}
        {props.extra}
        <button type="button" className="btn red auto sm brush-clear" disabled={!props.canClear} onClick={props.onClear}>
          クリア
        </button>
      </div>
    </div>
  );
}

/** ハンドルを掴める距離（px）。タッチでも掴めるよう幅を持たせる */
const HIT_PX = 16;

type Drag = { id: number; x0: number; handle: number | null; candidates: number[] };

/**
 * ミックスバー。境界のハンドルをドラッグして隣り合うキーの頻度を 5% 刻みで変える。
 * 重なったハンドルは、6px 動くまで掴むものを決めず、動いた向きに動けるものを掴む（brush.ts の pickHandle）。
 */
function MixBar(props: {
  keys: readonly AnswerKey[];
  names: KeyNames;
  brush: Mix;
  off: boolean;
  onChange: (b: Mix) => void;
}): JSX.Element {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const bounds = boundaries(props.brush, props.keys);

  const ratioAt = (clientX: number): number => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const moveTo = (handle: number, clientX: number): void => {
    const next = moveBoundary(props.brush, props.keys, handle, Math.round(ratioAt(clientX) * MIX_TOTAL));
    if (props.keys.some((k) => next[k] !== props.brush[k])) props.onChange(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    const width = bar.current?.getBoundingClientRect().width ?? 0;
    if (width === 0) return;
    const candidates = handlesAt(bounds, ratioAt(e.clientX), HIT_PX / width);
    if (candidates.length === 0) return;
    e.preventDefault();
    bar.current?.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, handle: candidates.length === 1 ? (candidates[0] as number) : null, candidates };
    (e.target as HTMLElement).closest<HTMLElement>('[role="slider"]')?.focus();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.handle === null) {
      const dx = e.clientX - d.x0;
      if (Math.abs(dx) < HANDLE_DECIDE_PX) return;
      d.handle = pickHandle(bounds, d.candidates, dx > 0 ? 1 : -1);
    }
    moveTo(d.handle, e.clientX);
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLSpanElement>): void => {
    const delta = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = moveBoundary(props.brush, props.keys, i, (bounds[i] as number) + delta);
    if (props.keys.some((k) => next[k] !== props.brush[k])) props.onChange(next);
  };

  return (
    <div
      ref={bar}
      className={`mixbar${props.off ? ' off' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {props.keys.map((k) => (
        <span key={k} className={`mseg ${k}`} style={{ width: `${(props.brush[k] / MIX_TOTAL) * 100}%` }}>
          {props.brush[k] >= 3 ? `${mixUnitsToPercent(props.brush[k])}%` : ''}
        </span>
      ))}
      {bounds.map((b, i) => {
        const { lo, hi } = boundaryRange(bounds, i);
        const left = props.keys[i] as AnswerKey;
        const right = props.keys[i + 1] as AnswerKey;
        return (
          <span
            key={i}
            className="mhandle"
            role="slider"
            tabIndex={0}
            aria-label={`${props.names[left]} / ${props.names[right]} の境界`}
            aria-valuemin={mixUnitsToPercent(lo)}
            aria-valuemax={mixUnitsToPercent(hi)}
            aria-valuenow={mixUnitsToPercent(b)}
            aria-valuetext={`${props.names[left]} ${mixUnitsToPercent(props.brush[left])}% / ${props.names[right]} ${mixUnitsToPercent(props.brush[right])}%`}
            style={{ left: `${(b / MIX_TOTAL) * 100}%` }}
            onKeyDown={(e) => onKeyDown(i, e)}
          />
        );
      })}
    </div>
  );
}
