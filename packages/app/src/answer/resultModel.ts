import {
  aggregateCellView,
  ANSWER_KEYS,
  BOARD_COUNT,
  CELL_COUNT,
  idxOf,
  labelOf,
  labelOfCards,
  MIX_TOTAL,
  mixUnitsToPercent,
  POSITIONS,
  replay,
  runActions,
  totalPot,
  weightedCount,
  formatBb,
  paintCellView,
  type Action,
  type AnswerKey,
  type Card,
  type CellView,
  type Mix,
  type Pos,
  type State,
} from '@wwyd/core';
import { ACTION_NAME } from '../post/draft.ts';
import type { KeyNames } from './BrushPanel.tsx';
import { pct1 } from './ComboBar.tsx';
import type { PostDetail } from './postDetail.ts';

/**
 * 集計画面（詳細仕様 06 章 §5。仕様書 §5.4）の表示の計算。計算の本体は core の aggregate（05 章 §4）。
 */

export type ResultView = 'all' | 'mine' | 'host';

/** 集計のタブ（§5.2）。自分の投稿には「自分」が無い。 */
export function resultTabs(d: PostDetail): { value: ResultView; label: string }[] {
  const n = d.aggregate?.n ?? 0;
  const all = { value: 'all' as const, label: `全体（${n}人）` };
  const host = { value: 'host' as const, label: 'Hero の予想' };
  return d.post.isMine ? [all, host] : [all, { value: 'mine', label: '自分' }, host];
}

/** 最初のタブ。Hero の予想の保存後は `?view=host` で来る（06 章 §4.9）。 */
export function initialView(search: string): ResultView {
  return new URLSearchParams(search).get('view') === 'host' ? 'host' : 'all';
}

/** Villain のハンド（判明していればカード、マック、不明は null）。 */
export function villainHand(d: PostDetail): Card[] | 'muck' | null {
  return d.secrets?.knownCards[d.post.villain] ?? null;
}

/** 白枠を付けるマス（Villain の実際のハンドがカードのときだけ。05 章 §4.3）。 */
export function actualCell(d: PostDetail): number | null {
  const h = villainHand(d);
  return Array.isArray(h) && h.length === 2 ? idxOf(labelOfCards(h[0] as Card, h[1] as Card)) : null;
}

/** 最初に選ぶマス: Villain の実際のハンド、なければ AA（§5.2）。 */
export function initialCell(d: PostDetail): number {
  return actualCell(d) ?? idxOf('AA');
}

/** アクションのキーの名前（s1 はベットかレイズ）。 */
export function keyNames(d: PostDetail): KeyNames {
  return { fold: 'フォールド', check: 'チェック', call: 'コール', s1: d.post.s1Label === 'bet' ? 'ベット' : 'レイズ' };
}

/** Villain の実際のアクション（停止位置のアクション）。 */
export function actualAction(d: PostDetail): Action | null {
  const a = d.hand.actions[d.hand.stopIndex];
  return a && a.pos === d.post.villain ? a : null;
}

/** 「コール」「レイズ 12bb」（§5.3）。 */
export function actionText(a: Action): string {
  return a.to === undefined ? ACTION_NAME[a.type] : `${ACTION_NAME[a.type]} ${formatBb(a.to)}bb`;
}

// ---- レンジ表 ----

/** 表示中のタブのマス（全体 = 05 章 §4.1、自分 / Hero の予想 = §4.2）。 */
export function cellViews(d: PostDetail, view: ResultView): CellView[] {
  if (view === 'all') {
    const agg = d.aggregate;
    return Array.from({ length: CELL_COUNT }, (_, i) =>
      agg ? aggregateCellView(agg.cells[i] as (typeof agg.cells)[number], agg.n) : { ratio: null, opacity: 0 },
    );
  }
  const saved = view === 'mine' ? d.myAnswer : d.hostAnswer;
  return Array.from({ length: CELL_COUNT }, (_, i) => paintCellView(saved?.paint[i] ?? null));
}

/** 空状態（§5.2）: 全体で回答 0 件 →「回答なし」、予想なし →「予想なし」。空でなければ null。 */
export function emptyLabel(d: PostDetail, view: ResultView): string | null {
  if (view === 'all') return (d.aggregate?.n ?? 0) === 0 ? '回答なし' : null;
  if (view === 'mine') return d.myAnswer ? null : '回答なし';
  return d.hostAnswer ? null : '予想なし';
}

/** ミックスの文字列「コール 50% / レイズ 50%」。レンジ外は「レンジ外」。 */
export function mixText(mix: Mix | null, names: KeyNames): string {
  if (!mix) return 'レンジ外';
  return ANSWER_KEYS.filter((k) => mix[k] > 0)
    .map((k) => `${names[k]} ${mixUnitsToPercent(mix[k])}%`)
    .join(' / ');
}

export type Breakdown =
  | {
      kind: 'all';
      label: string;
      n: number;
      total: number;
      /** キーごとの平均（小数第 1 位の %）と、頻度で重み付けした人数。レンジ内 0 人なら空。 */
      rows: { key: AnswerKey; name: string; pct: string; count: number }[];
      /** 他人の投稿では自分のミックス（自分の投稿では null）。 */
      mine: string | null;
    }
  | { kind: 'single'; label: string; text: string };

/** 選んだマスの内訳（§5.2、05 章 §4.1）。 */
export function breakdown(d: PostDetail, view: ResultView, idx: number): Breakdown {
  const names = keyNames(d);
  const label = labelOf(idx);
  if (view !== 'all') {
    const saved = view === 'mine' ? d.myAnswer : d.hostAnswer;
    return { kind: 'single', label, text: mixText(saved?.paint[idx] ?? null, names) };
  }
  const total = d.aggregate?.n ?? 0;
  const cell = d.aggregate?.cells[idx] ?? { n: 0, sum: { fold: 0, check: 0, call: 0, s1: 0 } };
  const rows =
    cell.n === 0
      ? []
      : d.post.keys.map((k) => ({
          key: k,
          name: names[k],
          pct: pct1(cell.sum[k] / (cell.n * MIX_TOTAL)),
          count: weightedCount(cell, k),
        }));
  const mine = d.post.isMine ? null : mixText(d.myAnswer?.paint[idx] ?? null, names);
  return { kind: 'all', label, n: cell.n, total, rows, mine };
}

// ---- ハンドヒストリー（最後まで再生） ----

/** 見せるホールカード: カード（表向き）、裏向き、マック。 */
export type Hole = readonly Card[] | 'back' | 'muck';

export type ResultFrame = {
  state: State;
  /** 見えているボード。 */
  board: Card[];
  actor: Pos | null;
  holes: Partial<Record<Pos, Hole>>;
  /** 終了時だけ「ショーダウン」または「{席} ポット獲得」。 */
  note: string | null;
};

/**
 * 集計画面のリプレイの各手目（§5.4）。`frames[i]` は i 手目まで適用した状態、最後（`actions.length`）は終了時。
 * - Hero のハンドは表向き（フォールドまで）。終了時は Hero のハンドと判明しているハンドを公開（マックは「マック」）。
 * - 終了時はベットをポットに回収し、ボードはすべて出す。
 */
export function resultFrames(d: PostDetail): ResultFrame[] {
  const { setup, actions, board } = d.hand;
  const states = runActions(setup, actions);
  const last = actions.length;
  const heroCards = d.secrets?.heroCards ?? null;
  return states.map((s, i) => {
    if (i < last) {
      const holes: Partial<Record<Pos, Hole>> = {};
      if (!s.folded.has(d.post.hero)) holes[d.post.hero] = heroCards ?? 'back';
      return { state: s, board: board.slice(0, BOARD_COUNT[s.street]), actor: (actions[i] as Action).pos, holes, note: null };
    }
    const holes: Partial<Record<Pos, Hole>> = {};
    if (heroCards) holes[d.post.hero] = heroCards;
    for (const p of POSITIONS) {
      const k = d.secrets?.knownCards[p];
      if (k && p !== d.post.hero) holes[p] = k;
    }
    return {
      state: { ...s, pot: totalPot(s), bets: { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 } },
      board: [...board],
      actor: null,
      holes,
      note: endNote(d),
    };
  });
}

/** 終了の表示（再生できなければ null。サーバーが検証済みなので通常は起きない）。 */
function endNote(d: PostDetail): string | null {
  try {
    const r = replay(d.hand.setup, d.hand.actions, d.hand.board.length).result;
    return r.kind === 'showdown' ? 'ショーダウン' : `${r.winner} ポット獲得`;
  } catch {
    return null;
  }
}
