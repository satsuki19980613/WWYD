import { formatBb, type Mbb } from '@wwyd/core';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SLIDER_NUDGE, sliderStep, sliderValue } from './draft.ts';

type Range = { min: Mbb; max: Mbb };

/**
 * 額のボタンとスライダー（スマホ。14 章 §3.1）。ボタンを押すと縦のスライダーが上に伸び、つまみをなぞって額を選ぶ
 * （ソフトウェアキーボードを出さない）。▲▼ で 0.1bb ずつ。外を押すと閉じる。額は選ぶだけで、打つのは台のボタン。
 */
export function SizeSlider(props: {
  /** 「to」または「bet」 */
  unit: string;
  label: string;
  range: Range;
  value: Mbb | null;
  /** 額の添え書き（「50% pot」「×3」） */
  note: (to: Mbb) => string | null;
  onChange: (to: Mbb) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const value = props.value ?? props.range.min;
  return (
    <div className="ad-size sl">
      <button type="button" className="ad-size-btn" aria-label={props.label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="mono-lbl">{props.unit}</span>
        <b className="num">{props.value === null ? '—' : formatBb(props.value)}</b>
      </button>
      {open && <SliderPop range={props.range} value={value} note={props.note(value)} label={props.label} onChange={props.onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SliderPop(props: {
  range: Range;
  value: Mbb;
  note: string | null;
  label: string;
  onChange: (to: Mbb) => void;
  onClose: () => void;
}): JSX.Element {
  const { range, value } = props;
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const ratio = range.max === range.min ? 1 : (value - range.min) / (range.max - range.min);

  useEffect(() => thumb.current?.focus(), []);

  const set = (v: Mbb): void => props.onChange(Math.min(range.max, Math.max(range.min, v)));
  const at = (clientY: number): void => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.height === 0) return;
    set(sliderValue(Math.min(1, Math.max(0, (r.bottom - clientY) / r.height)), range));
  };
  // 0.1bb の格子の次の点へ（最小・最大が格子に乗っていなくても 0.1bb 刻みの額に揃う）
  const nudge = (dir: 1 | -1): void =>
    set(dir > 0 ? Math.floor(value / SLIDER_NUDGE) * SLIDER_NUDGE + SLIDER_NUDGE : Math.ceil(value / SLIDER_NUDGE) * SLIDER_NUDGE - SLIDER_NUDGE);

  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    track.current?.setPointerCapture(e.pointerId);
    drag.current = e.pointerId;
    at(e.clientY);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag.current === e.pointerId) at(e.clientY);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag.current === e.pointerId) drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = sliderStep(range);
    const moves: Record<string, Mbb> = {
      ArrowUp: value + SLIDER_NUDGE,
      ArrowRight: value + SLIDER_NUDGE,
      ArrowDown: value - SLIDER_NUDGE,
      ArrowLeft: value - SLIDER_NUDGE,
      PageUp: value + step * 10,
      PageDown: value - step * 10,
      Home: range.min,
      End: range.max,
    };
    const v = moves[e.key];
    if (v !== undefined) {
      e.preventDefault();
      set(v);
    }
  };

  return (
    <>
      <div className="sl-backdrop" onClick={props.onClose} aria-hidden="true" />
      <div
        className="sl-pop"
        role="group"
        aria-label={props.label}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && e.target === thumb.current)) {
            e.preventDefault();
            props.onClose();
          }
        }}
      >
        <div className="sl-val">
          <b className="num">{formatBb(value)}</b>
          {props.note && <span className="num">{props.note}</span>}
        </div>
        <button type="button" className="sl-nudge" aria-label="0.1bb 上げる" disabled={value >= range.max} onClick={() => nudge(1)}>
          ▲
        </button>
        <span className="sl-end num">{formatBb(range.max)}</span>
        <div ref={track} className="sl-track" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <i className="sl-fill" style={{ height: `${ratio * 100}%` }} />
          <div
            ref={thumb}
            className="sl-thumb"
            role="slider"
            tabIndex={0}
            aria-label={props.label}
            aria-orientation="vertical"
            aria-valuemin={range.min / 1000}
            aria-valuemax={range.max / 1000}
            aria-valuenow={value / 1000}
            aria-valuetext={`${formatBb(value)}bb`}
            // つまみ（高さ 18px）が溝からはみ出さないよう、溝の高さから つまみの分を引いた範囲で動かす
            style={{ bottom: `calc(${ratio} * (100% - 18px))` }}
            onKeyDown={onKey}
          />
        </div>
        <span className="sl-end num">{formatBb(range.min)}</span>
        <button type="button" className="sl-nudge" aria-label="0.1bb 下げる" disabled={value <= range.min} onClick={() => nudge(-1)}>
          ▼
        </button>
      </div>
    </>
  );
}
