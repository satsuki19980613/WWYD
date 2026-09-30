import { READ_KEYS, type Action, type MttInfo, type Pos, type VillainRead, type VillainReads } from '@wwyd/core';
import { useState } from 'react';
import { Modal } from '../components/Modal.tsx';
import { POS_VAR } from '../components/posColor.ts';
import {
  defLabel,
  hasMttInfo,
  mttCountsLine,
  PRIZE_HINT,
  PRIZE_LABEL,
  READ_DEF,
  SPEED_DEF,
  villainOrder,
  type SliderDef,
} from './readsModel.ts';

/**
 * 回答・集計の画面の Villain・MTT の情報（詳細仕様 18 章 §5）。
 * 席を押すとその席の情報、All Villains で全席、MTT で MTT の情報をモーダルで出す。未入力の項目は出さない。
 * Slider は段階のラベルとバーだけ（数は出さない）。
 */

/** Slider の値の表示（段階のラベルとバーだけ。数は出さない） */
function SliderRow(props: { def: SliderDef; value: number }): JSX.Element {
  const { def, value } = props;
  return (
    <div className="rv-row">
      <dt className="mono-lbl">{def.name}</dt>
      <dd>
        <span className="rv-label">{defLabel(def, value)}</span>
        <span className="rv-bar" aria-hidden="true">
          <i style={{ width: `${Math.max(value / def.max, 0.02) * 100}%` }} />
        </span>
      </dd>
    </div>
  );
}

/** 1 席分（入力のある項目だけ） */
export function ReadCard(props: { read: VillainRead }): JSX.Element {
  const { read } = props;
  return (
    <dl className="rv-list">
      {READ_KEYS.filter((k) => read[k] !== undefined).map((k) => (
        <SliderRow key={k} def={READ_DEF[k]} value={read[k] as number} />
      ))}
      {read.memo && (
        <div className="rv-row memo">
          <dt className="mono-lbl">Memo</dt>
          <dd className="rv-memo">{read.memo}</dd>
        </div>
      )}
    </dl>
  );
}

function SeatHead(props: { pos: Pos }): JSX.Element {
  return (
    <b className="rv-pos" style={{ color: POS_VAR[props.pos] }}>
      {props.pos}
    </b>
  );
}

/** All Villains: ポットに参加した席を上に、Preflop で Fold した席は折りたたむ。情報の無い席は 1 行 */
function AllVillains(props: { seats: readonly Pos[]; hero: Pos; actions: readonly Action[]; reads: VillainReads }): JSX.Element {
  const { active, folded } = villainOrder(props.seats, props.hero, props.actions);
  const item = (p: Pos): JSX.Element => {
    const read = props.reads[p];
    return (
      <li key={p} className={`rv-seat${read ? '' : ' none'}`}>
        <SeatHead pos={p} />
        {read ? <ReadCard read={read} /> : <span className="rv-none">—</span>}
      </li>
    );
  };
  return (
    <div className="rv-all">
      <ul className="rv-seats">{active.map(item)}</ul>
      {folded.length > 0 && (
        <details className="rv-folded">
          <summary>
            <span className="mono-lbl">Preflop Fold</span>
            <span className="num rv-fcount">{folded.length}</span>
          </summary>
          <ul className="rv-seats">{folded.map(item)}</ul>
        </details>
      )}
    </div>
  );
}

/** MTT の情報。Tournament Type は Slider の表示、人数は「12/58 ・ ITM 50 ・ 320 entries」に「順位 / 残りの人数」の見出し（18 章 §5.2） */
export function MttView(props: { mtt: MttInfo }): JSX.Element {
  const m = props.mtt;
  const counts = mttCountsLine(m);
  const rows: { k: string; v: JSX.Element | string }[] = [];
  if (counts)
    rows.push({
      k: '順位 / 残りの人数',
      v: (
        <span className="num" title="スポットの順位 / 残りの人数 ・ ITM ・ エントリー数">
          {counts}
        </span>
      ),
    });
  if (m.avg !== undefined) rows.push({ k: 'Avg Stack', v: <span className="num">{m.avg}bb</span> });
  if (m.prize)
    rows.push({
      k: 'Prize Structure',
      v: (
        <>
          {PRIZE_LABEL[m.prize]} <small className="num rv-hint">{PRIZE_HINT[m.prize]}</small>
        </>
      ),
    });
  return (
    <dl className="rv-list">
      {m.speed !== undefined && <SliderRow def={SPEED_DEF} value={m.speed} />}
      {rows.map((r) => (
        <div key={r.k} className="rv-row">
          <dt className="mono-lbl">{r.k}</dt>
          <dd>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

type Open = { kind: 'seat'; pos: Pos } | { kind: 'all' } | { kind: 'mtt' } | null;

/**
 * 情報のボタン（All Villains・MTT）と、席を押したときのモーダルをまとめて扱う。
 * `actions` は見せてよい範囲の Action（All Villains の並びに使う）。
 */
export function useReadsUi(props: {
  seats: readonly Pos[];
  hero: Pos;
  actions: readonly Action[];
  reads: VillainReads;
  mtt: MttInfo | null;
}): { buttons: JSX.Element; onSeat: (pos: Pos) => void; marked: ReadonlySet<Pos>; modal: JSX.Element | null } {
  const [open, setOpen] = useState<Open>(null);
  const marked = new Set(props.seats.filter((p) => p !== props.hero && props.reads[p]));
  const hasMtt = hasMttInfo(props.mtt);
  const close = (): void => setOpen(null);

  const buttons = (
    <>
      <button type="button" className="hist-btn rv-btn" disabled={marked.size === 0} onClick={() => setOpen({ kind: 'all' })}>
        All Villains
      </button>
      <button type="button" className="hist-btn rv-btn" disabled={!hasMtt} onClick={() => setOpen({ kind: 'mtt' })}>
        MTT
      </button>
    </>
  );

  let modal: JSX.Element | null = null;
  if (open?.kind === 'seat') {
    const read = props.reads[open.pos];
    modal = read ? (
      <Modal title={`Villain · ${open.pos}`} tone="info" onClose={close}>
        <ReadCard read={read} />
      </Modal>
    ) : null;
  } else if (open?.kind === 'all') {
    modal = (
      <Modal title="All Villains" tone="info" onClose={close}>
        <AllVillains seats={props.seats} hero={props.hero} actions={props.actions} reads={props.reads} />
      </Modal>
    );
  } else if (open?.kind === 'mtt' && hasMtt) {
    modal = (
      <Modal title="MTT" tone="info" onClose={close}>
        <MttView mtt={props.mtt as MttInfo} />
      </Modal>
    );
  }

  return { buttons, onSeat: (pos) => marked.has(pos) && setOpen({ kind: 'seat', pos }), marked, modal };
}
