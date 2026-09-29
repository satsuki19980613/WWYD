import { TITLE_MAX, type Pos } from '@wwyd/core';
import { Select } from '../components/Select.tsx';
import { candidates, titleLength, type Draft } from './draft.ts';

/** 40 文字（コードポイント数）を超える分を切る。 */
function clampTitle(v: string): string {
  const chars = [...v];
  return chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX).join('') : v;
}

/** スポット（06 章 §3.7）: Hero のアクションの候補・Villain・タイトル。 */
export function SpotSection(props: {
  draft: Draft;
  onSelectSpot: (index: number) => void;
  onVillain: (v: Pos) => void;
  onTitle: (title: string) => void;
}): JSX.Element {
  const { draft: d } = props;
  const list = candidates(d);
  const current = list.find((c) => c.index === d.spotIndex);
  const villains = current?.villains ?? [];

  return (
    <section className="pf-sec" aria-labelledby="pf-spot">
      <h2 id="pf-spot" className="sec-h">
        Spot
      </h2>
      <div className="pf-field">
        <span className="mono-lbl" aria-hidden="true">
          Hero の Action
        </span>
        {list.length === 0 ? (
          <p className="pf-none">候補なし</p>
        ) : (
          <div className="pf-cands" role="radiogroup" aria-label="Hero の Action">
            {list.map((c) => (
              <button
                key={c.index}
                type="button"
                role="radio"
                aria-checked={c.index === d.spotIndex}
                className="pf-cand"
                onClick={() => props.onSelectSpot(c.index)}
              >
                <span className="pf-radio-dot" />
                <span className="num">{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pf-field">
        <span className="mono-lbl">Villain</span>
        <Select
          label="Villain"
          placeholder="—"
          options={villains.map((v) => ({ value: v, label: v }))}
          value={d.villain ?? ''}
          disabled={villains.length <= 1}
          onChange={(v) => props.onVillain(v as Pos)}
        />
      </div>
      <div className="pf-field">
        <div className="pf-title-row">
          <label className="mono-lbl" htmlFor="pf-title">
            タイトル
          </label>
          <span className="mono-lbl num">
            {titleLength(d.title)} / {TITLE_MAX}
          </span>
        </div>
        <input
          id="pf-title"
          className="inp"
          autoComplete="off"
          placeholder={`タイトル（${TITLE_MAX}文字まで）`}
          value={d.title}
          onChange={(e) => props.onTitle(clampTitle(e.target.value))}
        />
      </div>
    </section>
  );
}

/** 投稿時のエラーの一覧（PC は右列、スマホは下部バー）。 */
export function ErrorList(props: { errors: readonly string[] }): JSX.Element | null {
  if (props.errors.length === 0) return null;
  return (
    <ul className="pf-errors" role="alert">
      {props.errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}
