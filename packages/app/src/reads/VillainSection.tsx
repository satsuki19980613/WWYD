import type { Pos, VillainRead, VillainReads } from '@wwyd/core';
import { useId, useState } from 'react';
import { POS_VAR } from '../components/posColor.ts';
import { PresetDialog } from './PresetDialog.tsx';
import { ReadSlider } from './ReadSlider.tsx';
import { clearRead, isEmptyRead, MEMO_MAX, memoLength, READ_DEFS, readSummary, setRead } from './readsModel.ts';

/**
 * 投稿の Villain の情報（詳細仕様 18 章 §2。全項目任意）。Hero 以外の座っている席ごとに折りたたむ。
 * 閉じた席は 1 行（席と、入力した項目の要約）。開けるのは 1 席ずつ。
 */
export function VillainSection(props: { seats: readonly Pos[]; reads: VillainReads; onChange: (reads: VillainReads) => void }): JSX.Element | null {
  const [open, setOpen] = useState<Pos | null>(null);
  const [preset, setPreset] = useState<Pos | null>(null);
  const baseId = useId();
  if (props.seats.length === 0) return null;

  const update = (p: Pos, read: VillainRead): void => {
    const next = { ...props.reads };
    if (isEmptyRead(read)) delete next[p];
    else next[p] = read;
    props.onChange(next);
  };

  return (
    <section className="pf-sec" aria-labelledby={`${baseId}-h`}>
      <h2 id={`${baseId}-h`} className="sec-h">
        Villain
      </h2>
      <ul className="vr-list">
        {props.seats.map((p) => {
          const read = props.reads[p] ?? {};
          const isOpen = open === p;
          const bodyId = `${baseId}-${p}`;
          const summary = readSummary(read);
          return (
            <li key={p} className={`vr-row${isOpen ? ' open' : ''}${summary ? ' filled' : ''}`}>
              <button
                type="button"
                className="vr-head"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                aria-label={`${p} の Villain の情報`}
                onClick={() => setOpen(isOpen ? null : p)}
              >
                <b className="vr-pos" style={{ color: POS_VAR[p] }}>
                  {p}
                </b>
                <span className="vr-sum">{summary || '—'}</span>
                <svg className="vr-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
              {isOpen && (
                <div id={bodyId} className="vr-body">
                  {READ_DEFS.map((def) => (
                    <ReadSlider
                      key={def.key}
                      def={def}
                      value={read[def.key]}
                      onChange={(v) => update(p, setRead(read, def.key, v))}
                      onClear={() => update(p, clearRead(read, def.key))}
                    />
                  ))}
                  <MemoField seat={p} value={read.memo ?? ''} onChange={(memo) => update(p, memo === '' ? clearRead(read, 'memo') : { ...read, memo })} />
                  <div className="vr-foot">
                    <button type="button" className="btn ghost auto sm" onClick={() => setPreset(p)}>
                      Preset
                    </button>
                    <button type="button" className="btn ghost auto sm" disabled={isEmptyRead(read)} onClick={() => update(p, {})}>
                      クリア
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {preset && (
        <PresetDialog
          seat={preset}
          read={props.reads[preset] ?? {}}
          onApply={(read) => {
            update(preset, read);
            setPreset(null);
          }}
          onClose={() => setPreset(null)}
        />
      )}
    </section>
  );
}

/** Memo（30 文字まで。コードポイントで数えて切る）。個人を特定できる情報は書かない（規約。プレースホルダーで示す） */
function MemoField(props: { seat: Pos; value: string; onChange: (v: string) => void }): JSX.Element {
  const id = useId();
  const n = memoLength(props.value);
  return (
    <div className="pf-field vr-memo">
      <span className="vr-memo-head">
        <label className="mono-lbl" htmlFor={id}>
          Memo
        </label>
        <span className={`num vr-count${n >= MEMO_MAX ? ' full' : ''}`} aria-hidden="true">
          {n}/{MEMO_MAX}
        </span>
      </span>
      <input
        id={id}
        className="inp"
        autoComplete="off"
        placeholder="個人を特定できる情報は書かない"
        value={props.value}
        aria-label={`${props.seat} の Memo`}
        onChange={(e) => props.onChange([...e.target.value.replace(/[\r\n]/g, ' ')].slice(0, MEMO_MAX).join(''))}
      />
    </div>
  );
}
