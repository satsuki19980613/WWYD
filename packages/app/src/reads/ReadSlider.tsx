import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { defLabel, defMiddle, defPercent, type SliderDef } from './readsModel.ts';

/**
 * Villain の情報と MTT の Tournament Type の Slider（詳細仕様 18 章 §2.2）。初めは未入力（つまみを出さない）。触ると入力になり、× で未入力に戻す。
 * 表示は 5 段階のラベル。VPIP・PFR・Postflop Aggression は数（%）を押して直接入れられる（HUD の値）。
 * 横になぞって動かす（縦のスクロールは妨げない）。キーボードは ←→ で 1、PageUp/Down で 10、Delete で未入力。
 */
export function ReadSlider(props: {
  def: SliderDef;
  value: number | undefined;
  onChange: (v: number) => void;
  onClear: () => void;
}): JSX.Element {
  const { def, value } = props;
  const percent = defPercent(def);
  const max = def.max;
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const [editing, setEditing] = useState(false);
  const set = value !== undefined;
  const ratio = set ? value / max : 0;
  const label = set ? defLabel(def, value) : '—';

  const at = (clientX: number): void => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    props.onChange(Math.round(x * max));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    track.current?.setPointerCapture(e.pointerId);
    drag.current = e.pointerId;
    at(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag.current === e.pointerId) at(e.clientX);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag.current === e.pointerId) drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      props.onClear();
      return;
    }
    const base = value ?? defMiddle(def);
    const big = percent ? 10 : 1;
    const moves: Record<string, number> = {
      ArrowRight: base + 1,
      ArrowUp: base + 1,
      ArrowLeft: base - 1,
      ArrowDown: base - 1,
      PageUp: base + big,
      PageDown: base - big,
      Home: 0,
      End: max,
    };
    const v = moves[e.key];
    if (v === undefined) return;
    e.preventDefault();
    // 未入力のときの最初の矢印は真ん中に置く
    props.onChange(set || e.key === 'Home' || e.key === 'End' ? v : defMiddle(def));
  };

  // 段階の境目の目盛り（% の項目は境目の値、段階だけの項目は 5 つの点）
  const ticks = def.cuts ? def.cuts.map((c) => c / max) : Array.from({ length: max - 1 }, (_, i) => (i + 1) / max);

  return (
    <div className={`rs${set ? ' set' : ''}`}>
      <div className="rs-head">
        <span className="mono-lbl rs-name">{def.name}</span>
        <span className="rs-label">{label}</span>
        {percent &&
          (editing ? (
            <NumberEdit value={value} max={max} name={def.name} onDone={(v) => {
              setEditing(false);
              if (v !== null) props.onChange(v);
            }} />
          ) : (
            <button type="button" className="rs-num num" aria-label={`${def.name} を数で入力`} onClick={() => setEditing(true)}>
              {set ? value : '--'}
              <small>%</small>
            </button>
          ))}
        {set && (
          <button type="button" className="rs-clear" aria-label={`${def.name} をリセット`} onClick={props.onClear}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
      </div>
      <div
        ref={track}
        className="rs-track"
        role="slider"
        tabIndex={0}
        aria-label={def.name}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={set ? (percent ? `${label} ${value}%` : label) : '未入力'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <span className="rs-rail" aria-hidden="true">
          {ticks.map((t) => (
            <i key={t} className="rs-tick" style={{ left: `${t * 100}%` }} />
          ))}
          {set && <i className="rs-fill" style={{ width: `${ratio * 100}%` }} />}
          {set && <i className="rs-thumb" style={{ left: `${ratio * 100}%` }} />}
        </span>
      </div>
    </div>
  );
}

/** 数（%）の直接入力。Enter・欄の外で確定、Esc で取り消す。0〜max の整数でなければ変えない */
function NumberEdit(props: { value: number | undefined; max: number; name: string; onDone: (v: number | null) => void }): JSX.Element {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value));
  const done = useRef(false);
  const finish = (commit: boolean): void => {
    if (done.current) return;
    done.current = true;
    const t = text.trim();
    const n = Number(t);
    props.onDone(commit && /^\d{1,3}$/.test(t) && n <= props.max ? n : null);
  };
  return (
    <input
      className="inp num rs-input"
      inputMode="numeric"
      autoComplete="off"
      aria-label={`${props.name}（%）`}
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
    />
  );
}
