import {
  isCheckRaise,
  leansOf,
  RUNOUTS,
  sizesOf,
  STREET_ACTIONS,
  STREETS,
  TEXTURE_AXES,
  TEXTURE_KEYS,
  type Lean,
  type Pos,
  type ReadCandidate,
  type Street,
} from '@wwyd/core';
import { useId, useRef, useState, type ReactNode } from 'react';
import { POS_VAR } from '../components/posColor.ts';
import { PresetDialog } from './PresetDialog.tsx';
import { ReadSlider, SliderEnds } from './ReadSlider.tsx';
import {
  actionName,
  clearRead,
  cycleLean,
  emptyGeneral,
  generalEntry,
  isAggressive,
  isEmptySeat,
  LEAN_LABEL,
  leanSpeech,
  leanText,
  READ_DEFS,
  readLine,
  RUNOUT_LABEL,
  seatSummary,
  setGeneralAction,
  setGeneralStreet,
  setRead,
  SIZE_LABEL,
  spotCandidateOf,
  STEP_DEFS,
  STREET_NAME,
  TEXTURE_AXIS_NAME,
  TEXTURE_LABEL,
  toggleRunout,
  toggleSize,
  toggleStep,
  toggleTexture,
  type GeneralDraft,
  type ReadsDraft,
  type SeatDraft,
  type SpotDraft,
  type StepDef,
} from './readsModel.ts';

/**
 * 投稿の Villain の情報（詳細仕様 18 章 §2.1。全項目任意。2026-09-30 さつきの仕様変更で Memo を廃止）。
 * 情報を登録できる席（`seats`。core の villainSeats）ごとに折りたたむ。閉じた席は 1 行（席と要約）。開けるのは 1 席ずつ。
 * 中身: VPIP・PFR の Slider、5 分割のボタン 3 つ、Spot Read（判断地点より前の実際の Action に Lean を付ける）、General Read 2 件まで。
 */
export function VillainSection(props: {
  seats: readonly Pos[];
  hero: Pos;
  reads: ReadsDraft;
  /** Spot Read の候補（Spot を選ぶまでは空） */
  cands: readonly ReadCandidate[];
  onChange: (reads: ReadsDraft) => void;
}): JSX.Element | null {
  const [open, setOpen] = useState<Pos | null>(null);
  const [preset, setPreset] = useState<Pos | null>(null);
  const baseId = useId();
  if (props.seats.length === 0) return null;

  const update = (p: Pos, read: SeatDraft): void => {
    const next = { ...props.reads };
    if (isEmptySeat(read)) delete next[p];
    else next[p] = read;
    props.onChange(next);
  };

  return (
    <section className="pf-sec" aria-labelledby={`${baseId}-h`} data-own-keys="">
      <h2 id={`${baseId}-h`} className="sec-h">
        Villain
      </h2>
      <ul className="vr-list">
        {props.seats.map((p) => {
          const read = props.reads[p] ?? {};
          const isOpen = open === p;
          const bodyId = `${baseId}-${p}`;
          const cands = props.cands.filter((c) => c.pos === p);
          const summary = seatSummary(read, cands);
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
                  {STEP_DEFS.map((def) => (
                    <StepButtons key={def.key} def={def} value={read[def.key]} onPick={(v) => update(p, toggleStep(read, def.key, v))} />
                  ))}
                  {cands.length > 0 && (
                    <SpotRead
                      seat={p}
                      hero={props.hero}
                      cands={cands}
                      spot={read.spot}
                      onChange={(spot) => {
                        const next = { ...read };
                        if (spot) next.spot = spot;
                        else delete next.spot;
                        update(p, next);
                      }}
                    />
                  )}
                  <GeneralReads
                    seat={p}
                    hero={props.hero}
                    list={read.general ?? []}
                    onChange={(general) => {
                      const next = { ...read };
                      if (general.length > 0) next.general = general;
                      else delete next.general;
                      update(p, next);
                    }}
                  />
                  <div className="vr-foot">
                    <button type="button" className="btn ghost auto sm" onClick={() => setPreset(p)}>
                      Preset
                    </button>
                    <button type="button" className="btn ghost auto sm" disabled={isEmptySeat(read)} onClick={() => update(p, {})}>
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
          onApply={(r) => {
            // 全体の傾向と General Read を置き換える。Spot Read はこのハンドのものなので残す
            const spot = props.reads[preset]?.spot;
            update(preset, { ...r, ...(spot ? { spot } : {}) });
            setPreset(null);
          }}
          onClose={() => setPreset(null)}
        />
      )}
    </section>
  );
}

/** 5 分割のボタン（Postflop Aggression・Hero Image・Sample）。押すと選び、もう一度押すと未入力。左右の端に名前 */
function StepButtons(props: { def: StepDef; value: number | undefined; onPick: (v: number) => void }): JSX.Element {
  const { def, value } = props;
  const set = value !== undefined;
  return (
    <div className={`rs step${set ? ' set' : ''}`}>
      <div className="rs-head">
        <span className="mono-lbl rs-name">{def.name}</span>
        <span className="rs-label">{set ? def.labels[value] : '—'}</span>
      </div>
      <div className="seg5" role="group" aria-label={def.name}>
        {def.labels.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`seg5-b${set && i <= value ? ' lit' : ''}`}
            aria-pressed={value === i}
            aria-label={label}
            title={label}
            onClick={() => props.onPick(i)}
          />
        ))}
      </div>
      <SliderEnds ends={def.ends} />
    </div>
  );
}

/** 選択肢のボタンの行（見出しつき） */
function ChoiceRow(props: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="vr-choice" role="group" aria-label={props.label}>
      <span className="mono-lbl vr-choice-l" aria-hidden="true">
        {props.label}
      </span>
      <div className="vr-chips">{props.children}</div>
    </div>
  );
}

function Choice(props: { on: boolean; label: string; speech?: string; strong?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className={`chip vr-chip${props.strong ? ' strong' : ''}`}
      aria-pressed={props.on}
      aria-label={props.speech}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

/** Lean のボタン（未選択 → 通常 → 強い → 未選択。§10 C-6） */
function LeanRow(props: { leans: readonly Lean[]; lean: Lean | null; strong: boolean; onPick: (lean: Lean) => void }): JSX.Element {
  return (
    <ChoiceRow label="Lean">
      {props.leans.map((l) => {
        const on = props.lean === l;
        const strong = on && props.strong;
        return <Choice key={l} on={on} strong={strong} label={on ? leanText(l, strong) : LEAN_LABEL[l]} speech={leanSpeech(l, strong)} onClick={() => props.onPick(l)} />;
      })}
    </ChoiceRow>
  );
}

const candText = (c: ReadCandidate): string => `${STREET_NAME[c.street]} · ${actionName(c.action, c.checkRaise)}${c.size ? ` (${SIZE_LABEL[c.size]})` : ''}`;

/**
 * Spot Read（§2.1.4）: Hero の判断地点より前に、この席が実際に取った Action に Lean を付ける。When と Action は Action の列から。
 * 候補が複数なら投稿者が 1 つ選ぶ（最初は判断地点にいちばん近いもの。§10 C-4）。
 * 「この Hand の結果を知る前の読みで」の注記は不変条件 1 の例外（§10 C-10。2026-09-30 さつき）。
 */
function SpotRead(props: { seat: Pos; hero: Pos; cands: readonly ReadCandidate[]; spot: SpotDraft | undefined; onChange: (s: SpotDraft | undefined) => void }): JSX.Element {
  const { cands, spot } = props;
  // 投稿者が押して選んだ候補（Action の列の添字）。選んでいなければ判断地点にいちばん近い候補（§10 C-4。Spot を変えて候補が増えても追従する。V-011）
  const [pick, setPick] = useState<number | null>(null);
  const chosen = spot ? spotCandidateOf(spot, props.seat, cands) : undefined;
  const cur = chosen ?? cands.find((c) => c.index === pick) ?? (cands[cands.length - 1] as ReadCandidate);
  const choose = (c: ReadCandidate): void => {
    setPick(c.index);
    if (!spot) return;
    // 選んでいる Lean がこの Action に選べなければ Spot Read を外す
    if (!leansOf(c.action).includes(spot.lean)) props.onChange(undefined);
    else props.onChange({ ...spot, street: c.street, action: c.action, size: c.size });
  };
  return (
    <div className="vr-read">
      <div className="vr-read-h">
        <span className="mono-lbl">Spot Read</span>
        <span className="vr-note">この Hand の結果を知る前の読みで</span>
      </div>
      {cands.length > 1 ? (
        <ChoiceRow label="Action">
          {cands.map((c) => (
            <Choice key={c.index} on={c === cur} label={candText(c)} onClick={() => choose(c)} />
          ))}
        </ChoiceRow>
      ) : (
        <p className="vr-line">{candText(cur)}</p>
      )}
      <LeanRow
        leans={leansOf(cur.action)}
        lean={spot && chosen ? spot.lean : null}
        strong={!!spot?.strong}
        onPick={(l) => {
          const next = cycleLean({ lean: spot && chosen ? spot.lean : null, strong: !!spot?.strong }, l);
          props.onChange(next.lean ? { street: cur.street, action: cur.action, size: cur.size, lean: next.lean, strong: next.strong } : undefined);
        }}
      />
    </div>
  );
}

/** General Read（1 席 2 件まで。Street → Action → Lean の順、条件は任意で後から） */
function GeneralReads(props: { seat: Pos; hero: Pos; list: readonly GeneralDraft[]; onChange: (list: GeneralDraft[]) => void }): JSX.Element {
  const set = (i: number, g: GeneralDraft): void => props.onChange(props.list.map((x, j) => (j === i ? g : x)));
  // 部品の key は General Read ごとに固定する（添字にすると、1 件目を消したとき 2 件目が「Board · Size」の開閉を取り違える。V-013）
  const ids = useRef<number[]>([]);
  const nextId = useRef(0);
  while (ids.current.length < props.list.length) ids.current.push(nextId.current++);
  if (ids.current.length > props.list.length) ids.current = ids.current.slice(0, props.list.length);
  return (
    <>
      {props.list.map((g, i) => (
        <GeneralEditor
          key={ids.current[i]}
          n={i + 1}
          seat={props.seat}
          hero={props.hero}
          g={g}
          onChange={(x) => set(i, x)}
          onRemove={() => {
            ids.current = ids.current.filter((_, j) => j !== i);
            props.onChange(props.list.filter((_, j) => j !== i));
          }}
        />
      ))}
      {props.list.length < 2 && (
        <button type="button" className="btn ghost auto sm vr-add" onClick={() => props.onChange([...props.list, emptyGeneral()])}>
          ＋ General Read
        </button>
      )}
    </>
  );
}

function GeneralEditor(props: {
  n: number;
  seat: Pos;
  hero: Pos;
  g: GeneralDraft;
  onChange: (g: GeneralDraft) => void;
  onRemove: () => void;
}): JSX.Element {
  const { g } = props;
  const [cond, setCond] = useState(Object.keys(g.texture).length > 0 || g.runout.length > 0 || g.size !== null);
  const condId = useId();
  const street = g.street;
  const entry = generalEntry(g);
  const xr = (s: Street): boolean => isCheckRaise('general', s, props.seat, props.hero, []);
  const hasCond = street !== null && (street !== 'pf' || (g.action !== null && isAggressive(g.action)));
  return (
    <div className="vr-read">
      <div className="vr-read-h">
        <span className="mono-lbl">General Read {props.n}</span>
        <span className="vr-line sm">{entry ? readLine(entry, street !== null && xr(street)) : '—'}</span>
        <button type="button" className="rs-clear" aria-label={`General Read ${props.n} を削除`} onClick={props.onRemove}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <ChoiceRow label="Street">
        {STREETS.map((s) => (
          <Choice key={s} on={street === s} label={STREET_NAME[s]} onClick={() => props.onChange(setGeneralStreet(g, s))} />
        ))}
      </ChoiceRow>
      {street && (
        <ChoiceRow label="Action">
          {STREET_ACTIONS[street].map((a) => (
            <Choice key={a} on={g.action === a} label={actionName(a, xr(street))} onClick={() => props.onChange(setGeneralAction(g, a))} />
          ))}
        </ChoiceRow>
      )}
      {hasCond && street && (
        <>
          <button type="button" className="vr-cond-t" aria-expanded={cond} aria-controls={condId} onClick={() => setCond(!cond)}>
            <span className="mono-lbl">Board · Size</span>
            <span aria-hidden="true">{cond ? '−' : '+'}</span>
          </button>
          {cond && (
            <div id={condId} className="vr-cond">
              {street !== 'pf' &&
                TEXTURE_KEYS.map((axis) => (
                  <ChoiceRow key={axis} label={TEXTURE_AXIS_NAME[axis]}>
                    {TEXTURE_AXES[axis].map((v) => (
                      <Choice
                        key={v}
                        on={g.texture[axis] === v}
                        label={(TEXTURE_LABEL[axis] as Record<string, string>)[v] as string}
                        onClick={() => props.onChange(toggleTexture(g, axis, v))}
                      />
                    ))}
                  </ChoiceRow>
                ))}
              {(street === 'turn' || street === 'river') && (
                <ChoiceRow label="Runout">
                  {RUNOUTS.map((r) => (
                    <Choice key={r} on={g.runout.includes(r)} label={RUNOUT_LABEL[r]} onClick={() => props.onChange(toggleRunout(g, r))} />
                  ))}
                </ChoiceRow>
              )}
              {g.action && isAggressive(g.action) && (
                <ChoiceRow label="Size">
                  {sizesOf(street).map((s) => (
                    <Choice key={s} on={g.size === s} label={SIZE_LABEL[s]} onClick={() => props.onChange(toggleSize(g, s))} />
                  ))}
                </ChoiceRow>
              )}
            </div>
          )}
        </>
      )}
      {g.action && (
        <LeanRow
          leans={leansOf(g.action)}
          lean={g.lean}
          strong={g.strong}
          onPick={(l) => props.onChange({ ...g, ...cycleLean({ lean: g.lean, strong: g.strong }, l) })}
        />
      )}
    </div>
  );
}
