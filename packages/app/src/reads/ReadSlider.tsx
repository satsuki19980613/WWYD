import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { defLabel, defMiddle, defPercent, type SliderDef } from './readsModel.ts';

/**
 * Villain の情報と MTT の Tournament Type の Slider（詳細仕様 18 章 §2.2）。初めは未入力（つまみを出さない）。触ると入力になり、× で未入力に戻す。
 * 表示は 5 段階のラベル。VPIP・PFR・Postflop Aggression は数（%）を押して直接入れられる（HUD の値）。
 * `def.ends` のある Slider（Tournament Type）は段階も目盛りも付けず、溝の下の左右に両端の名前（Deep・Turbo）を出す。
 * 横になぞって動かす（縦のスクロールは妨げない）。キーボードは ←→ で 1、PageUp/Down で 10（段階だけの項目は 1）、Delete で未入力。
 */
export function ReadSlider(props: Readonly<{
  def: SliderDef;
  value: number | undefined;
  onChange: (v: number) => void;
  onClear: () => void;
}>): JSX.Element {
  const { def, value } = props;
  const percent = defPercent(def);
  const max = def.max;
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const set = value !== undefined;
  const ratio = set ? value / max : 0;
  const ends = def.ends;
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
    const v = keyValue(e.key, def, value);
    if (v === undefined) return;
    e.preventDefault();
    props.onChange(v);
  };

  const ticks = ticksOf(def);
  const valueText = valueTextOf(def, value, label);

  return (
    <div className={`rs${set ? ' set' : ''}${ends ? ' ends' : ''}`}>
      <div className="rs-head">
        <span className="mono-lbl rs-name">{def.name}</span>
        <span className="rs-label">{ends ? '' : label}</span>
        {percent && <PercentField name={def.name} value={value} max={max} onChange={props.onChange} />}
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
        aria-valuetext={valueText}
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
      {ends && <SliderEnds ends={ends} />}
    </div>
  );
}

/** キーで動かした先（動かさないキーは undefined）。未入力のときの最初の矢印は真ん中に置く。端で押しても 0〜max の外に出さない（V-027） */
function keyValue(key: string, def: SliderDef, value: number | undefined): number | undefined {
  const max = def.max;
  const base = value ?? defMiddle(def);
  const big = max >= 20 ? 10 : 1;
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
  const v = moves[key];
  if (v === undefined) return undefined;
  return value !== undefined || key === 'Home' || key === 'End' ? Math.min(max, Math.max(0, v)) : defMiddle(def);
}

/** 段階の境目の目盛り（% の項目は境目の値、段階だけの項目は 5 つの点。両端の名前を出す Slider は付けない） */
function ticksOf(def: SliderDef): number[] {
  if (def.ends) return [];
  if (def.cuts) return def.cuts.map((c) => c / def.max);
  return Array.from({ length: def.max - 1 }, (_, i) => (i + 1) / def.max);
}

/** 読み上げの値（未入力・両端の名前つきの数・段階と %・段階） */
function valueTextOf(def: SliderDef, value: number | undefined, label: string): string {
  if (value === undefined) return '未入力';
  if (def.ends) return `${value} / ${def.max}（${def.ends[0]} 0 〜 ${def.ends[1]} ${def.max}）`;
  return defPercent(def) ? `${label} ${value}%` : label;
}

/** 数（%）のボタン。押すと直接入力の欄に替わる */
function PercentField(props: Readonly<{ name: string; value: number | undefined; max: number; onChange: (v: number) => void }>): JSX.Element {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <NumberEdit
        value={props.value}
        max={props.max}
        name={props.name}
        onDone={(v) => {
          setEditing(false);
          if (v !== null) props.onChange(v);
        }}
      />
    );
  }
  return (
    <button type="button" className="rs-num num" aria-label={`${props.name} を数で入力`} onClick={() => setEditing(true)}>
      {props.value ?? '--'}
      <small>%</small>
    </button>
  );
}

/** 段階を付けない Slider の両端の名前（左・右）。表示の画面でも使う */
export function SliderEnds(props: Readonly<{ ends: readonly [string, string] }>): JSX.Element {
  return (
    <div className="rs-ends" aria-hidden="true">
      <span>{props.ends[0]}</span>
      <span>{props.ends[1]}</span>
    </div>
  );
}

/** 数（%）の直接入力。Enter・欄の外で確定、Esc で取り消す。0〜max の整数でなければ変えない */
function NumberEdit(props: Readonly<{ value: number | undefined; max: number; name: string; onDone: (v: number | null) => void }>): JSX.Element {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value));
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  // 「数で入力」を押して出した欄なので、出したらすぐ打てるようにする
  useEffect(() => input.current?.focus(), []);
  const finish = (commit: boolean): void => {
    if (done.current) return;
    done.current = true;
    const t = text.trim();
    const n = Number(t);
    props.onDone(commit && /^\d{1,3}$/.test(t) && n <= props.max ? n : null);
  };
  return (
    <input
      ref={input}
      className="inp num rs-input"
      inputMode="numeric"
      autoComplete="off"
      aria-label={`${props.name}（%）`}
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
