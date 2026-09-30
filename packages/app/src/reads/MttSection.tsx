import { MTT_STAGES, MTT_TYPES, PRIZE_STRUCTURES, type MttStage, type MttType, type PrizeStructure } from '@wwyd/core';
import { useId } from 'react';
import { ChipGroup } from '../components/ChipGroup.tsx';
import { NumField } from '../post/SetupSections.tsx';
import { MTT_FIELD_LABEL, parseMtt, PRIZE_HINT, PRIZE_LABEL, STAGE_LABEL, TYPE_LABEL, type MttDraft, type MttField } from './readsModel.ts';

const STAGE_ITEMS = MTT_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }));
const TYPE_ITEMS = MTT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }));

/**
 * 投稿の MTT の情報（詳細仕様 18 章 §2.3。Game 形式が MTT のときだけ。全項目任意）。
 * 最初に Stage を選ぶ。選んだチップをもう一度押すと未選択に戻る。Final Table では Avg Stack を出さない。
 */
export function MttSection(props: { mtt: MttDraft; onChange: (mtt: MttDraft) => void }): JSX.Element {
  const { mtt: m } = props;
  const headId = useId();
  const invalid = parseMtt(m).invalid;
  const toggle = <T extends string>(cur: T | null, v: T): T | null => (cur === v ? null : v);
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
        <div className="pf-field">
          <span className="mono-lbl" aria-hidden="true">
            Stage
          </span>
          <ChipGroup
            label="Stage"
            variant="segment"
            items={STAGE_ITEMS}
            value={(m.stage ?? '') as MttStage}
            onChange={(v) => props.onChange({ ...m, stage: toggle(m.stage, v) })}
          />
        </div>
        <div className="pf-field">
          <span className="mono-lbl" aria-hidden="true">
            Tournament Type
          </span>
          <ChipGroup
            label="Tournament Type"
            variant="segment"
            items={TYPE_ITEMS}
            value={(m.type ?? '') as MttType}
            onChange={(v) => props.onChange({ ...m, type: toggle(m.type, v) })}
          />
        </div>
        <div className="pf-fields mtt-fields">
          {field('rank')}
          {field('left')}
          {field('paid')}
          {field('entries')}
          {m.stage !== 'ft' && field('avg')}
        </div>
        <div className="pf-field">
          <span className="mono-lbl" aria-hidden="true">
            Prize Structure
          </span>
          {/* 目安（1st prize の割合）は選択肢の一部として出す（18 章 §2.3。不変条件 1 の例外。2026-09-30 さつき） */}
          <div className="chip-row segment" role="group" aria-label="Prize Structure">
            <div className="chips">
              {PRIZE_STRUCTURES.map((p: PrizeStructure) => (
                <button
                  key={p}
                  type="button"
                  className="chip chip-2l"
                  aria-pressed={m.prize === p}
                  onClick={() => props.onChange({ ...m, prize: toggle(m.prize, p) })}
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
