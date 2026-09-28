import { formatBb } from '@wwyd/core';
import { useId } from 'react';
import { inRange, parseSizeText, PRESETS, presetActive, presetSize, sizeSummary, SIZE_STEP, stepSize, type SizeSpot } from './answerForm.ts';

/**
 * サイズ（06 章 §4.7）。畳んだ 1 行「レイズサイズ 17.55bb 50% pot」。開くとプリセット・入力欄（0.1 刻みの増減）・
 * ゲージ・「min / max」・範囲外の表示。値は入力欄の文字列で持つ（入力途中の「17.」なども受け付ける）。
 */
export function SizeControl(props: {
  label: string;
  spot: SizeSpot;
  text: string;
  onText: (t: string) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
}): JSX.Element {
  const { spot } = props;
  const id = useId();
  const to = parseSizeText(props.text);
  const ok = inRange(to, spot);
  const sum = sizeSummary(to, spot);
  const set = (mbb: number): void => props.onText(formatBb(mbb));

  return (
    <div className={`size${props.open ? ' open' : ''}`}>
      <button type="button" className="size-row" aria-expanded={props.open} aria-controls={id} onClick={() => props.onOpen(!props.open)}>
        <span className="size-dot" aria-hidden="true" />
        <span className="size-lbl">{props.label}</span>
        <b className={`num size-amt${ok ? '' : ' bad'}`}>{sum.amount}</b>
        <span className="num size-pct">{sum.pct}</span>
        <svg className="size-chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {props.open && (
        <div className="size-body" id={id}>
          <div className="chips size-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                aria-pressed={presetActive(p, to, spot)}
                onClick={() => set(presetSize(p, spot))}
              >
                {p === 'allin' ? 'オールイン' : `${p}%`}
              </button>
            ))}
          </div>
          <div className="size-input">
            <button type="button" className="tool-btn" aria-label="0.1bb 減らす" onClick={() => set(stepSize(props.text, -1, spot))}>
              −
            </button>
            <input
              className="inp num"
              inputMode="decimal"
              autoComplete="off"
              aria-label={`${props.label}（bb）`}
              aria-invalid={!ok}
              value={props.text}
              onChange={(e) => props.onText(e.target.value)}
            />
            <span className="mono-lbl">bb</span>
            <button type="button" className="tool-btn" aria-label="0.1bb 増やす" onClick={() => set(stepSize(props.text, 1, spot))}>
              ＋
            </button>
          </div>
          <input
            type="range"
            className="gauge"
            aria-label={props.label}
            min={spot.minTo}
            max={spot.maxTo}
            step={SIZE_STEP}
            value={to === null ? spot.minTo : Math.min(spot.maxTo, Math.max(spot.minTo, to))}
            onChange={(e) => set(Number(e.target.value))}
          />
          <p className="size-range num">
            min {formatBb(spot.minTo)} / max {formatBb(spot.maxTo)}bb
            {!ok && <span className="size-out">範囲外</span>}
          </p>
        </div>
      )}
    </div>
  );
}
