import type { AnswerKey, BarRatios } from '@wwyd/core';
import type { KeyNames } from './BrushPanel.tsx';

/** 比率の表示（小数第 1 位。05 章 §4.3。合計が 100.0 にならなくても補正しない） */
export function pct1(r: number): string {
  return (r * 100).toFixed(1);
}

/**
 * 1326 combos に対する各キーとレンジ外の比率（06 章 §4.8・§5.2）。積み上げバーと数値。
 * 計算は core の paintBar / aggregateBar（05 章 §4）。
 */
export function ComboBar(props: { keys: readonly AnswerKey[]; names: KeyNames; ratios: BarRatios }): JSX.Element {
  const { ratios } = props;
  return (
    <div className="cbar">
      <div className="cbar-track" aria-hidden="true">
        {props.keys.map((k) => (
          <i key={k} className={`cseg ${k}`} style={{ width: `${ratios[k] * 100}%` }} />
        ))}
      </div>
      <ul className="cbar-legend">
        <li className="mono-lbl">1326 combos</li>
        {props.keys.map((k) => (
          <li key={k}>
            <i className={`cdot ${k}`} aria-hidden="true" />
            {props.names[k]} <b className="num">{pct1(ratios[k])}%</b>
          </li>
        ))}
        <li>
          <i className="cdot off" aria-hidden="true" />
          レンジ外 <b className="num">{pct1(ratios.off)}%</b>
        </li>
      </ul>
    </div>
  );
}
