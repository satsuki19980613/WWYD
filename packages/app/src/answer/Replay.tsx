import { formatBb, STREETS, type Action, type Card, type HandSetup, type Mbb, type Pos, type Street } from '@wwyd/core';
import { useEffect, useState, type ReactNode } from 'react';
import { HistoryIcon } from '../components/Icons.tsx';
import { Modal } from '../components/Modal.tsx';
import { PlayingCard } from '../components/PlayingCard.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { actionLog, STREET_NAME } from '../post/draft.ts';
import { useMediaQuery } from '../useMediaQuery.ts';
import type { SeatView } from './replayModel.ts';
import type { Hole } from './resultModel.ts';

/** リプレイの 1 手の間隔（06 章 §4.3） */
export const REPLAY_STEP_MS = 650;

export type ReplayControl = {
  step: number;
  max: number;
  playing: boolean;
  first: () => void;
  back: () => void;
  toggle: () => void;
  forward: () => void;
};

/**
 * リプレイの再生状態。開くと 0 手目から `max` 手目まで自動再生する。
 * 視差効果を減らす設定では自動再生せず、最初から `max` 手目を出す。
 * `atEnd`（集計画面）は自動再生せずに `max` 手目から始める（06 章 §5.4）。
 */
export function useReplay(max: number, opts: { atEnd?: boolean } = {}): ReplayControl {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const still = reduce || opts.atEnd === true;
  const [step, setStep] = useState(() => (still ? max : 0));
  const [playing, setPlaying] = useState(() => !still && max > 0);

  useEffect(() => {
    if (!playing) return;
    if (step >= max) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStep((s) => Math.min(max, s + 1)), REPLAY_STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, step, max]);

  return {
    step,
    max,
    playing,
    first: () => {
      setPlaying(false);
      setStep(0);
    },
    back: () => {
      setPlaying(false);
      setStep((s) => Math.max(0, s - 1));
    },
    toggle: () => {
      if (playing) {
        setPlaying(false);
        return;
      }
      if (step >= max) setStep(0);
      setPlaying(true);
    },
    forward: () => {
      setPlaying(false);
      setStep((s) => Math.min(max, s + 1));
    },
  };
}

export function ReplayControls(props: { c: ReplayControl }): JSX.Element {
  const { c } = props;
  return (
    <div className="rp-ctrl">
      <div className="rp-btns">
        <button type="button" className="btn ghost" onClick={c.first}>
          最初から
        </button>
        <button type="button" className="btn ghost" disabled={c.step <= 0} onClick={c.back}>
          1手戻る
        </button>
        <button type="button" className="btn ghost" onClick={c.toggle}>
          {c.playing ? '一時停止' : '再生'}
        </button>
        <button type="button" className="btn ghost" disabled={c.step >= c.max} onClick={c.forward}>
          1手進む
        </button>
      </div>
      <div className="rp-prog">
        <span className="rp-bar" aria-hidden="true">
          <i style={{ width: `${c.max > 0 ? (c.step / c.max) * 100 : 100}%` }} />
        </span>
        <span className="num rp-count" aria-live="polite">
          {c.step} / {c.max} 手目
        </span>
      </div>
    </div>
  );
}

/**
 * スマホのハンドヒストリーのボタン（卓の左上。押すとモーダル。14 章）。ログを常に出すと画面を圧迫するため。
 * `children` はモーダルの中身（HandLog）。
 */
export function HistoryButton(props: { disabled?: boolean; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="hist-btn" disabled={props.disabled} onClick={() => setOpen(true)}>
        <HistoryIcon />
        History
      </button>
      {open && (
        <Modal title="Hand History" tone="info" onClose={() => setOpen(false)}>
          {props.children}
        </Modal>
      )}
    </>
  );
}

type Pt = readonly [number, number];
type Slot = { seat: Pt; chip: Pt };
/**
 * 席とチップの配置（手前の中央から時計回り。卓の中の % 座標）。2〜6 人（04 章 §2.1）。
 * ボードは卓の中央に大きく出す（2026-09-29 さつき）ので、横の席は卓の縁に重ねて上下に寄せ、ボードの高さを空ける。
 * チップは横の席なら同じ高さで内側、上下の席なら中央寄り（ボードに重ならない所）。
 */
const L_UP: Slot = { seat: [0, 27], chip: [30, 27] };
const L_DOWN: Slot = { seat: [0, 73], chip: [30, 73] };
const R_UP: Slot = { seat: [100, 27], chip: [70, 27] };
const R_DOWN: Slot = { seat: [100, 73], chip: [70, 73] };
const BOTTOM: Slot = { seat: [50, 91], chip: [50, 75] };
const TOP: Slot = { seat: [50, 9], chip: [50, 25] };
const SLOTS_BY_COUNT: Record<number, readonly Slot[]> = {
  2: [BOTTOM, TOP],
  3: [BOTTOM, L_UP, R_UP],
  4: [BOTTOM, L_UP, TOP, R_UP],
  5: [BOTTOM, L_DOWN, L_UP, R_UP, R_DOWN],
  6: [BOTTOM, L_DOWN, L_UP, TOP, R_UP, R_DOWN],
};

/**
 * テーブル（ICMCLEC の卓の見た目を参照。06 章 §8）。Villain の席を手前に置く（席の並びは replayModel の seatOrder）。
 * `holes` は席ごとに見せるホールカード（表向き・裏向き・マック）。`note` は終了時の「ショーダウン」など。
 */
export function PokerTable(props: {
  seats: readonly SeatView[];
  pot: Mbb;
  board: readonly Card[];
  holes: Partial<Record<Pos, Hole>>;
  villainLabel: string;
  note?: string | null;
  /** ボードの中身を差し替える（投稿の入力でカードを押して選び直す） */
  boardContent?: ReactNode;
}): JSX.Element {
  const interactive = props.boardContent !== undefined;
  return (
    <div className={`ptable${interactive ? ' live' : ''}`} role={interactive ? 'group' : 'img'} aria-label="Table">
      <div className="ptable-felt" />
      <div className="ptable-mid">
        <div className="ptable-pot">
          <span className="mono-lbl">POT</span>
          <b className="num">{formatBb(props.pot)}bb</b>
        </div>
        <div className="ptable-board">
          {props.boardContent ??
            [0, 1, 2, 3, 4].map((i) => {
              const c = props.board[i];
              return c ? <PlayingCard key={c} card={c} /> : <span key={i} className="ptable-slot" />;
            })}
        </div>
        {props.note && <span className="ptable-note">{props.note}</span>}
      </div>
      {props.seats.map((seat, i) => {
        const slot = SLOTS_BY_COUNT[props.seats.length]?.[i] ?? { seat: [50, 50] as const, chip: [50, 50] as const };
        const [x, y] = slot.seat;
        const [cx, cy] = slot.chip;
        const anchor = x < 20 ? 'l' : x > 80 ? 'r' : 'c';
        return (
          <div key={seat.pos}>
            <div
              className={`pseat a-${anchor}${y < 20 ? ' top' : ''}${seat.folded ? ' folded' : ''}${seat.hero ? ' hero' : ''}${seat.villain ? ' villain' : ''}${seat.acting ? ' acting' : ''}`}
              style={{ top: `${y}%`, ...(anchor === 'c' ? { left: `${x}%` } : {}) }}
            >
              <HoleCards hole={props.holes[seat.pos]} />
              <div className="pseat-plate">
                <span className="pseat-top">
                  <b className="pseat-pos" style={{ color: POS_VAR[seat.pos] }}>
                    {seat.pos}
                  </b>
                  {seat.hero && <span className="pseat-tag hero">Hero</span>}
                  {seat.villain && <span className="pseat-tag villain">{props.villainLabel}</span>}
                </span>
                <span className="pseat-stack num">{formatBb(seat.stack)}bb</span>
              </div>
              {seat.last && <span className="pseat-last">{seat.last}</span>}
            </div>
            {seat.bet > 0 && (
              <span className="pchip num" style={{ left: `${cx}%`, top: `${cy}%` }}>
                {formatBb(seat.bet)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HoleCards(props: { hole: Hole | undefined }): JSX.Element | null {
  const { hole } = props;
  if (!hole) return null;
  if (hole === 'muck') return <span className="pseat-hole pseat-muck">Muck</span>;
  return (
    <div className="pseat-hole pseat-cards">
      {hole === 'back' ? (
        <>
          <span className="pback" />
          <span className="pback" />
        </>
      ) : (
        hole.map((c) => <PlayingCard key={c} card={c} size="sm" />)
      )}
    </div>
  );
}

/**
 * ハンドヒストリー（ストリートごとの列）。出題の Hero のアクションに「出題」、最新の 1 手を強調、
 * `actual`（集計画面の Villain の実際のアクション）を黄で強調。`prompt` は停止時の「▶ BB to act」。
 */
export function HandLog(props: {
  setup: HandSetup;
  actions: readonly Action[];
  board: readonly Card[];
  spotIndex: number;
  highlightLast: boolean;
  actual?: number;
  prompt?: string | null;
  /** 1 手を押したとき（投稿の入力の「ここから入れ直す」）。無ければ押せない */
  onPick?: (index: number) => void;
}): JSX.Element {
  const items = actionLog(props.setup, props.actions);
  const last = items.length - 1;
  const streets = STREETS.filter((s) => items.some((it) => it.street === s));
  const boardOf: Record<Street, readonly Card[]> = {
    pf: [],
    flop: props.board.slice(0, 3),
    turn: props.board.slice(3, 4),
    river: props.board.slice(4, 5),
  };
  return (
    <div className="hlog">
      {streets.map((s) => (
        <div key={s} className="hlog-col">
          <div className="hlog-head">
            <span className="mono-lbl">{STREET_NAME[s]}</span>
            <span className="hlog-board">
              {boardOf[s].map((c) => (
                <PlayingCard key={c} card={c} size="sm" />
              ))}
            </span>
          </div>
          <ol className="hlog-list">
            {items
              .filter((it) => it.street === s)
              .map((it) => (
                <li
                  key={it.index}
                  className={`${props.highlightLast && it.index === last ? 'latest' : ''}${it.index === props.actual ? ' actual' : ''}`}
                >
                  {props.onPick ? (
                    <button type="button" className="hlog-pick" onClick={() => props.onPick?.(it.index)}>
                      <b style={{ color: POS_VAR[it.pos] }}>{it.pos}</b>
                      {it.text.slice(it.pos.length)}
                    </button>
                  ) : (
                    <>
                      <b style={{ color: POS_VAR[it.pos] }}>{it.pos}</b>
                      {it.text.slice(it.pos.length)}
                    </>
                  )}
                  {it.index === props.spotIndex && <span className="hlog-tag">出題</span>}
                </li>
              ))}
          </ol>
        </div>
      ))}
      {props.prompt && <p className="hlog-next num">{props.prompt}</p>}
    </div>
  );
}
