import { PRIZE_STRUCTURES, type PrizeStructure } from '@wwyd/core';
import { useId } from 'react';
import { NumField } from '../post/SetupSections.tsx';
import { ReadSlider } from './ReadSlider.tsx';
import { MTT_FIELD_LABEL, MTT_FIELDS, parseMtt, PRIZE_HINT, PRIZE_LABEL, SPEED_DEF, type MttDraft, type MttField } from './readsModel.ts';

/**
 * 投稿の MTT の情報（詳細仕様 18 章 §2.4。Game 形式が MTT のときだけ。全項目任意）。
 * Tournament Type は Deep〜Turbo の Slider（未入力あり）。数の欄はスポットの順位・残りの人数・エントリー数・ITM・Avg Stack（名前は日本語。2026-09-30 さつき）。
 * Prize Structure は押すと選び、もう一度押すと未選択に戻る。
 */
export function MttSection(props: { mtt: MttDraft; onChange: (mtt: MttDraft) => void }): JSX.Element {
  const { mtt: m } = props;
  const headId = useId();
  const invalid = parseMtt(m).invalid;
  const field = (f: MttField): JSX.Element => (
    <NumField
      key={f}
      label={MTT_FIELD_LABEL[f]}
      value={m[f]}
      inputMode={f === 'avg' ? 'decimal' : 'numeric'}
      invalid={invalid.includes(f)}
      onChange={(v) => props.onChange({ ...m, [f]: v })}
    />
  );
  return (
    <section className="pf-sec" aria-labelledby={headId}>
      <h2 id={headId} className="sec-h">
        MTT
      </h2>
      <fieldset className="pf-fieldset">
        <ReadSlider
          def={SPEED_DEF}
          value={m.speed ?? undefined}
          onChange={(speed) => props.onChange({ ...m, speed })}
          onClear={() => props.onChange({ ...m, speed: null })}
        />
        <div className="pf-fields mtt-fields">{MTT_FIELDS.map(field)}</div>
        <div className="pf-field">
          <span className="mono-lbl" aria-hidden="true">
            Prize Structure
          </span>
          {/* 目安（1st prize の割合）は選択肢の一部として出す（18 章 §2.4。不変条件 1 の例外。2026-09-30 さつき） */}
          <div className="chip-row segment" role="group" aria-label="Prize Structure">
            <div className="chips">
              {PRIZE_STRUCTURES.map((p: PrizeStructure) => (
                <button
                  key={p}
                  type="button"
                  className="chip chip-2l"
                  aria-pressed={m.prize === p}
                  onClick={() => props.onChange({ ...m, prize: m.prize === p ? null : p })}
                >
                  <span>{PRIZE_LABEL[p]}</span>
                  <small className="num">{PRIZE_HINT[p]}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </fieldset>
    </section>
  );
}
