import { ANSWER_KEYS, CELL_COUNT, labelOf, type CellView } from '@wwyd/core';
import { memo, useRef, type KeyboardEvent } from 'react';

const SIDE = 13;

/** マスの中身: 左から fold → check → call → s1 の順に割合の幅で色を並べ、濃さは不透明度（05 章 §4） */
function RatioFill(props: { view: CellView }): JSX.Element | null {
  const { ratio, opacity } = props.view;
  if (!ratio) return null;
  return (
    <span className="cfill" style={{ opacity }} aria-hidden="true">
      {ANSWER_KEYS.filter((k) => ratio[k] > 0).map((k) => (
        <i key={k} className={`cseg ${k}`} style={{ width: `${ratio[k] * 100}%` }} />
      ))}
    </span>
  );
}

/** 1 色だけで濃さ 1 のマスは、その色の上の文字色にする（それ以外は明るい文字＋影） */
function inkClass(view: CellView): string {
  if (!view.ratio) return '';
  const used = ANSWER_KEYS.filter((k) => (view.ratio as NonNullable<CellView['ratio']>)[k] > 0);
  return used.length === 1 && view.opacity === 1 ? ` ink-${used[0] as string}` : ' ink-mixed';
}

/**
 * 集計のレンジ表（13×13。06 章 §5.2）。マスを選ぶと親が内訳を出す。塗りの操作はない。
 * `actual` は Hero の実際のハンドのマス（白枠）。キーボード: 矢印・Home・End で選ぶマスを移す。
 */
export const ResultGrid = memo(function ResultGrid(props: {
  views: readonly CellView[];
  selected: number;
  actual: number | null;
  onSelect: (idx: number) => void;
  /** 「自分との差」のタブ: マスごとの差（0〜1）。あれば色の代わりに差の濃さで塗る（14 章） */
  heat?: readonly number[];
}): JSX.Element {
  const grid = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const i = Math.floor(props.selected / SIDE);
    const j = props.selected % SIDE;
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
    const idx = ni * SIDE + nj;
    props.onSelect(idx);
    grid.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.focus();
  };

  return (
    <div ref={grid} className="rgrid result" role="group" aria-label="Range 表" onKeyDown={onKeyDown}>
      {Array.from({ length: CELL_COUNT }, (_, idx) => {
        const view = props.views[idx] ?? { ratio: null, opacity: 0 };
        const selected = idx === props.selected;
        const heat = props.heat?.[idx];
        const ink = heat === undefined ? inkClass(view) : heat >= 0.5 ? ' ink-heat' : heat > 0 ? ' ink-mixed' : '';
        return (
          <button
            key={idx}
            type="button"
            data-idx={idx}
            className={`rcell${view.ratio || heat ? ' on' : ''}${ink}${idx === props.actual ? ' actual' : ''}`}
            tabIndex={selected ? 0 : -1}
            aria-pressed={selected}
            aria-label={labelOf(idx)}
            onClick={() => props.onSelect(idx)}
          >
            {heat === undefined ? (
              <RatioFill view={view} />
            ) : (
              heat > 0 && <span className="cheat" style={{ opacity: 0.15 + 0.85 * heat }} aria-hidden="true" />
            )}
            <span className="rcell-lbl">{labelOf(idx)}</span>
          </button>
        );
      })}
    </div>
  );
});
