import { TOTAL_COMBOS, type AnswerKey, type BarRatios } from '@wwyd/core';
import type { KeyNames } from './BrushPanel.tsx';

/** 比率の表示（小数第 1 位。05 章 §4.3。合計が 100.0 にならなくても補正しない） */
export function pct1(r: number): string {
  return (r * 100).toFixed(1);
}

/** 1326 combos に対する比率から、レンジの大きさ（combos・%）とレンジの中のアクションの割合を出す（14 章） */
export function rangeSummary(keys: readonly AnswerKey[], ratios: BarRatios): { combos: string; pct: string; share: Record<AnswerKey, number> } {
  const inRange = Math.max(0, 1 - ratios.off);
  const share = { fold: 0, check: 0, call: 0, s1: 0 };
  // 丸めの誤差でレンジ外が 1 をわずかに下回るときは空とみなす
  if (inRange > 1e-9) for (const k of keys) share[k] = ratios[k] / inRange;
  const combos = Math.round(inRange * TOTAL_COMBOS * 10) / 10;
  return { combos: String(combos), pct: pct1(inRange), share };
}

/**
 * レンジのまとめ（06 章 §4.8・§5.2、14 章）。レンジの大きさ（「19 combos · 1.4%」）と、
 * レンジの中のアクションの割合（積み上げバーと数値）。計算の元は core の paintBar / aggregateBar（05 章 §4）。
 * `label` は集計画面で「全体」「自分」を並べるときの見出し。
 */
export function ComboBar(props: { keys: readonly AnswerKey[]; names: KeyNames; ratios: BarRatios; label?: string }): JSX.Element {
  const s = rangeSummary(props.keys, props.ratios);
  return (
    <div className="cbar">
      <div className="cbar-top">
        {props.label && <span className="cbar-lbl">{props.label}</span>}
        <span className="cbar-size num">
          <b>{s.combos}</b> combos<i aria-hidden="true"> · </i>
          <b>{s.pct}%</b>
        </span>
      </div>
      <div className="cbar-track" aria-hidden="true">
        {props.keys.map((k) => (
          <i key={k} className={`cseg ${k}`} style={{ width: `${s.share[k] * 100}%` }} />
        ))}
      </div>
      <ul className="cbar-legend">
        {props.keys.map((k) => (
          <li key={k}>
            <i className={`cdot ${k}`} aria-hidden="true" />
            {props.names[k]} <b className="num">{pct1(s.share[k])}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
