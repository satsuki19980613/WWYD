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

/** 全体 / 自分 / 自分との差（14 章。自分と全体のミックスの違いの大きさを濃さで出す） */
export type ResultView = 'all' | 'mine' | 'diff';

/** 集計のタブ（§5.2）。投稿者も回答者の 1 人なので、自分の投稿でも「全体」「自分」。 */
export function resultTabs(d: PostDetail): { value: ResultView; label: string }[] {
  const n = d.aggregate?.n ?? 0;
  const tabs: { value: ResultView; label: string }[] = [
    { value: 'all', label: `全体（${n}人）` },
    { value: 'mine', label: '自分' },
  ];
  if (n > 0 && d.myAnswer) tabs.push({ value: 'diff', label: '自分との差' });
  return tabs;
}

/** Hero のハンド（答え合わせ。回答後に見える。2026-09-29） */
export function heroHand(d: PostDetail): Card[] | null {
  return d.secrets?.heroCards ?? null;
}

/** 白枠を付けるマス（Hero の実際のハンド。05 章 §4.3）。 */
export function actualCell(d: PostDetail): number | null {
  const h = heroHand(d);
  return h && h.length === 2 ? idxOf(labelOfCards(h[0] as Card, h[1] as Card)) : null;
}

/** 最初に選ぶマス: Hero の実際のハンド、なければ AA（§5.2）。 */
export function initialCell(d: PostDetail): number {
  return actualCell(d) ?? idxOf('AA');
}

/** アクションのキーの名前（s1 はベットかレイズ）。 */
export function keyNames(d: PostDetail): KeyNames {
  return { fold: 'Fold', check: 'Check', call: 'Call', s1: d.post.s1Label === 'bet' ? 'Bet' : 'Raise' };
}

/** Hero の実際のアクション（出題の手番のアクション。答え合わせ）。 */
export function actualAction(d: PostDetail): Action | null {
  const a = d.hand.actions[d.hand.spotIndex];
  return a && a.pos === d.post.hero ? a : null;
}

/** 「コール」「レイズ 12bb」（§5.3）。 */
export function actionText(a: Action): string {
  return a.to === undefined ? ACTION_NAME[a.type] : `${ACTION_NAME[a.type]} ${formatBb(a.to)}bb`;
}

// ---- レンジ表 ----

/** 表示中のタブのマス（全体 = 05 章 §4.1、自分 = §4.2）。 */
export function cellViews(d: PostDetail, view: ResultView): CellView[] {
  if (view !== 'mine') {
    const agg = d.aggregate;
    return Array.from({ length: CELL_COUNT }, (_, i) =>
      agg ? aggregateCellView(agg.cells[i] as (typeof agg.cells)[number], agg.n) : { ratio: null, opacity: 0 },
    );
  }
  return Array.from({ length: CELL_COUNT }, (_, i) => paintCellView(d.myAnswer?.paint[i] ?? null));
}

/** 空状態（§5.2）: 回答 0 件 →「回答なし」。空でなければ null。 */
export function emptyLabel(d: PostDetail, view: ResultView): string | null {
  if (view !== 'mine') return (d.aggregate?.n ?? 0) === 0 ? '回答なし' : null;
  return d.myAnswer ? null : '回答なし';
}

/** ミックスの文字列「コール 50% / レイズ 50%」。レンジ外は「レンジ外」。 */
export function mixText(mix: Mix | null, names: KeyNames): string {
  if (!mix) return 'Range 外';
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
      /** 自分のミックス。 */
      mine: string;
      /** 自分との差（%。「自分との差」のタブだけ） */
      diff?: string;
    }
  | { kind: 'single'; label: string; text: string };

/** 選んだマスの内訳（§5.2、05 章 §4.1）。 */
export function breakdown(d: PostDetail, view: ResultView, idx: number): Breakdown {
  const names = keyNames(d);
  const label = labelOf(idx);
  if (view === 'mine') return { kind: 'single', label, text: mixText(d.myAnswer?.paint[idx] ?? null, names) };
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
  const mine = mixText(d.myAnswer?.paint[idx] ?? null, names);
  const out: Breakdown = { kind: 'all', label, n: cell.n, total, rows, mine };
  return view === 'diff' ? { ...out, diff: String(Math.round(cellDiff(d, idx) * 100)) } : out;
}

// ---- 自分と全体の比較（14 章） ----

export type Shares = Record<AnswerKey | 'off', number>;

/**
 * マスの割合（全体と自分）。全体は回答者全員に対するキーごとの割合（レンジに入れなかった人は off）、
 * 自分はミックスの割合（レンジ外なら off = 1）。
 */
export function cellShares(d: PostDetail, idx: number): { all: Shares | null; mine: Shares | null } {
  const total = d.aggregate?.n ?? 0;
  const cell = d.aggregate?.cells[idx];
  let all: Shares | null = null;
  if (total > 0 && cell) {
    all = { fold: 0, check: 0, call: 0, s1: 0, off: 1 - cell.n / total };
    for (const k of ANSWER_KEYS) all[k] = cell.sum[k] / (total * MIX_TOTAL);
  }
  let mine: Shares | null = null;
  if (d.myAnswer) {
    const mix = d.myAnswer.paint[idx] ?? null;
    mine = { fold: 0, check: 0, call: 0, s1: 0, off: mix ? 0 : 1 };
    if (mix) for (const k of ANSWER_KEYS) mine[k] = mix[k] / MIX_TOTAL;
  }
  return { all, mine };
}

/** 自分と全体の差（0〜1）: キーごとの割合とレンジ外の割合の差の絶対値の和の半分。比べられなければ 0 */
export function cellDiff(d: PostDetail, idx: number): number {
  const { all, mine } = cellShares(d, idx);
  if (!all || !mine) return 0;
  let sum = Math.abs(all.off - mine.off);
  for (const k of ANSWER_KEYS) sum += Math.abs(all[k] - mine[k]);
  return sum / 2;
}

/** 「自分との差」のタブのマスの濃さ（169 マス） */
export function diffHeat(d: PostDetail): number[] {
  return Array.from({ length: CELL_COUNT }, (_, i) => cellDiff(d, i));
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
    return r.kind === 'showdown' ? 'Showdown' : `${r.winner} Pot 獲得`;
  } catch {
    return null;
  }
}
