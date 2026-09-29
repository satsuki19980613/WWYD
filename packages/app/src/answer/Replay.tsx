import { formatBb, STREETS, type Action, type Card, type HandSetup, type Mbb, type Pos, type Street } from '@wwyd/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HistoryIcon, PauseIcon, PlayIcon, StepBackIcon, StepForwardIcon } from '../components/Icons.tsx';
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
  /** 最後（回答画面はスポット、集計画面はハンドの終わり）へ */
  last: () => void;
  /** `n` 手目へ（ハンドヒストリーの 1 手を押したとき。17 章） */
  goto: (n: number) => void;
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
    last: () => {
      setPlaying(false);
      setStep(max);
    },
    goto: (n: number) => {
      setPlaying(false);
      setStep(Math.min(max, Math.max(0, n)));
    },
  };
}

/** 入力欄やモーダルを操作中か（ショートカットを効かせない） */
export function typingOrModal(e: KeyboardEvent): boolean {
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)) return true;
  return document.querySelector('.modal-backdrop') !== null;
}

/**
 * PC のリプレイのキー（17 章。PT4・HM3・Lichess と同じ）: ← → で 1 手、Home で最初、End で最後。
 * 入力欄を操作中・モーダルを開いている間は効かせない。
 */
export function useReplayKeys(c: ReplayControl, enabled: boolean): void {
  const live = useRef(c);
  live.current = c;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      // 表のマスなど、矢印キーを自分で使う部品が先に処理したら何もしない
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typingOrModal(e)) return;
      const r = live.current;
      const f = { ArrowLeft: r.back, ArrowRight: r.forward, Home: r.first, End: r.last }[e.key];
      if (!f) return;
      e.preventDefault();
      f();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/** 再生の操作。「最初から」は文字、1手戻る・再生 / 一時停止・1手進むはマーク（名前は読み上げに。2026-09-29 さつき） */
export function ReplayControls(props: { c: ReplayControl; /** 出題の局面の手数（進み具合のバーに黄の目盛り。17 章） */ spot?: number }): JSX.Element {
  const { c } = props;
  return (
    <div className="rp-ctrl">
      <div className="rp-btns">
        <button type="button" className="btn ghost" onClick={c.first}>
          最初から
        </button>
        <button type="button" className="btn ghost rp-icon" aria-label="1手戻る" disabled={c.step <= 0} onClick={c.back}>
          <StepBackIcon />
        </button>
        <button type="button" className="btn ghost rp-icon" aria-label={c.playing ? '一時停止' : '再生'} onClick={c.toggle}>
          {c.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="btn ghost rp-icon" aria-label="1手進む" disabled={c.step >= c.max} onClick={c.forward}>
          <StepForwardIcon />
        </button>
      </div>
      <div className="rp-prog">
        <span className="rp-bar" aria-hidden="true">
          <i style={{ width: `${c.max > 0 ? (c.step / c.max) * 100 : 100}%` }} />
          {props.spot !== undefined && c.max > 0 && <b className="rp-spot" style={{ left: `${(props.spot / c.max) * 100}%` }} />}
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
 * `children` はモーダルの中身（HandLog）。`compact` はアイコンだけの道具のボタン（Range のタブのブラシの道具の行）。
 */
export function HistoryButton(props: { disabled?: boolean; compact?: boolean; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      {props.compact ? (
        <button type="button" className="tool-btn" aria-label="Hand History" disabled={props.disabled} onClick={() => setOpen(true)}>
          <HistoryIcon />
        </button>
      ) : (
        <button type="button" className="hist-btn" disabled={props.disabled} onClick={() => setOpen(true)}>
          <HistoryIcon />
          History
        </button>
      )}
      {open && (
        <Modal title="Hand History" tone="info" onClose={() => setOpen(false)}>
          {props.children}
        </Modal>
      )}
    </>
  );
}

type Pt = readonly [number, number];
/** `chipTop` は上下の席のチップの高さ（CSS の top）。横の席のチップは席のプレートのすぐ内側に置く（CSS の .pchip.side） */
type Slot = { seat: Pt; chipTop?: string };
/**
 * 席とチップの配置（手前の中央から時計回り。卓の中の % 座標）。2〜6 人（04 章 §2.1）。
 * ボードは卓の中央に大きく出す（2026-09-29 さつき）ので、横の席は卓の縁に重ねて上下に寄せ、ボードの高さを空ける。
 * チップは横の席ならプレートの内側の隣、上の席はポットの上、手前の席はボードのすぐ下（ホールカードの上）。
 */
const L_UP: Slot = { seat: [0, 27] };
const L_DOWN: Slot = { seat: [0, 73] };
const R_UP: Slot = { seat: [100, 27] };
const R_DOWN: Slot = { seat: [100, 73] };
const BOTTOM: Slot = { seat: [50, 91], chipTop: 'calc(50% + var(--bw) * 0.69 + 20px)' };
const TOP: Slot = { seat: [50, 9], chipTop: '25%' };
const SLOTS_BY_COUNT: Record<number, readonly Slot[]> = {
  2: [BOTTOM, TOP],
  3: [BOTTOM, L_UP, R_UP],
  4: [BOTTOM, L_UP, TOP, R_UP],
  5: [BOTTOM, L_DOWN, L_UP, R_UP, R_DOWN],
  6: [BOTTOM, L_DOWN, L_UP, TOP, R_UP, R_DOWN],
};

/**
 * テーブル（ICMCLEC の卓の見た目を参照。06 章 §8）。Hero の席を手前に置く（席の並びは replayModel の seatOrder）。
 * `holes` は席ごとに見せるホールカード（表向き・裏向き・マック）。`note` は終了時の「ショーダウン」など。
 */
export function PokerTable(props: {
  seats: readonly SeatView[];
  pot: Mbb;
  board: readonly Card[];
  holes: Partial<Record<Pos, Hole>>;
  /** Hero の席のタグ（回答画面は「Hero（あなた）」） */
  heroLabel?: string;
  note?: string | null;
  /** ボードの中身を差し替える（投稿の入力でカードを押して選び直す） */
  boardContent?: ReactNode;
  /** 出題の局面（Hero の手番）を表示中。卓の縁を 1 回光らせ、Hero の席を脈打たせて「SPOT」の札を出す（17 章） */
  spot?: boolean;
}): JSX.Element {
  const interactive = props.boardContent !== undefined;
  return (
    <div
      className={`ptable${interactive ? ' live' : ''}${props.spot ? ' at-spot' : ''}`}
      role={interactive ? 'group' : 'img'}
      aria-label={props.spot ? 'Table（Spot）' : 'Table'}
    >
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
        const slot = SLOTS_BY_COUNT[props.seats.length]?.[i] ?? { seat: [50, 50] as const };
        const [x, y] = slot.seat;
        const anchor = x < 20 ? 'l' : x > 80 ? 'r' : 'c';
        const chip = seat.bet > 0 && (
          <span
            className={`pchip num${anchor === 'c' ? '' : ' side'}`}
            style={anchor === 'c' ? { left: `${x}%`, top: slot.chipTop ?? '50%' } : undefined}
          >
            {formatBb(seat.bet)}
          </span>
        );
        return (
          <div key={seat.pos}>
            <div
              className={`pseat a-${anchor}${y < 20 ? ' top' : ''}${seat.folded ? ' folded' : ''}${seat.hero ? ' hero' : ''}${seat.you ? ' you' : ''}${seat.acting ? ' acting' : ''}`}
              style={{ top: `${y}%`, ...(anchor === 'c' ? { left: `${x}%` } : {}) }}
            >
              <HoleCards hole={props.holes[seat.pos]} />
              <div className="pseat-plate">
                <span className="pseat-top">
                  <b className="pseat-pos" style={{ color: POS_VAR[seat.pos] }}>
                    {seat.pos}
                  </b>
                  {seat.hero && <span className="pseat-tag hero">{props.heroLabel ?? 'Hero'}</span>}
                </span>
                <span className="pseat-stack num">{formatBb(seat.stack)}bb</span>
              </div>
              {props.spot && seat.hero && (
                <span className="pseat-spot" aria-hidden="true">
                  Spot
                </span>
              )}
              {seat.last && <span className="pseat-last">{seat.last}</span>}
              {anchor !== 'c' && chip}
            </div>
            {anchor === 'c' && chip}
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
 * `actual`（集計画面の Hero の実際のアクション）を黄で強調。`prompt` は停止時の「▶ BB to act」。
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
