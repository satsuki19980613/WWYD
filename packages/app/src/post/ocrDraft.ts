import { bbToMbb, POSITIONS, spotCandidates, type Action, type Card, type Legal, type Mbb, type Pos, type State, type Street } from '@wwyd/core';
import type { OcrAction, OcrResult, OcrVerb } from '@wwyd/ocr';
import { handCards, isHandComplete } from './cardInput.ts';
import { candidates, emptyDraft, normalizeSpot, parseSettings, phaseOf, type Draft } from './draft.ts';
import { applyT4Game, type T4Game } from './t4Games.ts';

/**
 * OCR の結果の確認と、投稿の下書きへの反映（詳細仕様 06 章 §3.9・07 章 §3）。
 *
 * 読み取った結果はそのままフォームに入れず、確認画面（OcrReview）で画像と見比べて直してから反映する。
 * 確認画面で直せるのは Hero の席・各席のハンド・ボード・アクション（動詞と額）・T4 のゲーム。
 *
 * - アクションの席とストリートは **core で先頭から再生して決める**（行の順番だけが意味を持つ）。
 *   画像で読んだ席・ストリートと違う行は「合わない」として示す（行の読み落とし・読み違いの目印）。
 * - 再生できない行（その時点で合法でない）で止め、そこから先は反映しない（読めたところまで）。
 * - `All-in` と、額の付いた `Raise` / `Bet` は、その時点の状態でベット・レイズ・コールに直す（T4 の額は
 *   そのストリートで「いくらまで」出したか。core の `to` と同じ）。
 * - ゲーム形式・SB・アンティ・レーキは選んだ T4 のゲームで決まる。スタック・タイトルは利用者の入力のまま。
 */

export type ReviewRow = {
  verb: OcrVerb;
  /** 画像に書かれた額（bb）。無ければ null */
  amount: number | null;
  /** 画像で読んだ席・ストリート（確認画面で足した行は null） */
  readPos: Pos | null;
  readStreet: Street | null;
};

export type Review = {
  game: T4Game;
  hero: Pos;
  /** 席ごとのハンド（cardInput の形式。例 `AhKd`） */
  hands: Record<Pos, string>;
  board: Card[];
  rows: ReviewRow[];
};

/** 行ごとの再生の結果。`ok: false` の行から先は反映されない */
export type RowView = { pos: Pos | null; street: Street | null; ok: boolean; mismatch: boolean };

export type ReviewEval = { draft: Draft; rows: RowView[]; issues: string[] };

/** 投稿できないハンド（Hero のフロップ以降のアクションが無い）を読み込んだときの表示 */
export const NO_SPOT_MESSAGE = 'Flop 以降の Hero の Action がない Hand です';

/**
 * 読み込んだ時点で、投稿できるハンドかを判定する（06 章 §3.9）。スポットは Hero のフロップ以降のアクション
 * だけ（04 章 §8.1）なので、そうでないハンドは確認画面を開かずにはじく。
 * 画像で読んだ席とストリートのまま判定する（再生はしない。席のバッジ・ストリートの区切り・ボードはほぼ確実に読める）。
 * - `unreadable`: フロップ以降のアクションがあるのにフロップが読めない（スクリーンショットなど。あきらめてもらう）
 * - `no_spot`: プリフロップで終わった、または Hero に出題できるフロップ以降のアクションが無い
 * Hero の席や、どこかの行の席が読めなければ、はじかずに確認画面で直してもらう。
 */
export function ocrPostability(r: OcrResult): 'ok' | 'unreadable' | 'no_spot' {
  const postflop = r.actions.some((a) => a.street !== 'pf');
  if (r.board.length < 3) return postflop ? 'unreadable' : 'no_spot';
  if (r.hero === null) return 'ok';
  const actions: Action[] = [];
  for (const a of r.actions) {
    if (a.pos === null) return 'ok';
    // 候補の判定は、席・ストリートとフォールドかどうかしか見ない
    actions.push({ street: a.street, pos: a.pos, type: a.verb === 'allin' ? 'raise' : a.verb });
  }
  return spotCandidates(actions, r.hero).length > 0 ? 'ok' : 'no_spot';
}

/** 読み取り結果から確認画面の初期状態を作る。Hero が読めなければ下書きの Hero のまま。 */
export function reviewFromOcr(r: OcrResult, game: T4Game, fallbackHero: Pos): Review {
  const hands = { ...emptyDraft().hands };
  for (const p of POSITIONS) hands[p] = r.hands[p]?.join('') ?? '';
  return {
    game,
    hero: r.hero ?? fallbackHero,
    hands,
    board: [...r.board],
    rows: r.actions.map((a: OcrAction) => ({ verb: a.verb, amount: a.amount, readPos: a.pos, readStreet: a.street })),
  };
}

/** 確認画面の状態を検証し、反映する下書きと、行ごとの結果・問題の一覧を返す。 */
export function evaluateReview(base: Draft, rv: Review): ReviewEval {
  const issues: string[] = [];

  // ハンドとボード（途中のハンド・同じカードの 2 度目は使わない）
  const used = new Set<Card>();
  const take = (cards: readonly Card[]): boolean => {
    if (cards.some((c) => used.has(c)) || new Set(cards).size !== cards.length) return false;
    for (const c of cards) used.add(c);
    return true;
  };
  const hands = { ...emptyDraft().hands };
  for (const p of POSITIONS) {
    const h = rv.hands[p];
    if (h === '') issues.push(`${p} の Hand がありません`);
    else if (!isHandComplete(h) || !take(handCards(h))) issues.push(`${p} の Hand が正しくありません`);
    else hands[p] = h;
  }
  const board: Card[] = [];
  for (const c of rv.board) {
    if (!take([c])) break;
    board.push(c);
  }
  if (board.length < rv.board.length || (board.length > 0 && board.length < 3)) issues.push('Board が正しくありません');
  if (board.length > 0 && board.length < 3) board.length = 0;

  let draft: Draft = applyT4Game({ ...base, hero: rv.hero, hands, board, actions: [], spotIndex: null, villain: null }, rv.game);
  const { setup } = parseSettings(draft);
  const views: RowView[] = rv.rows.map(() => ({ pos: null, street: null, ok: false, mismatch: false }));
  if (!setup) {
    issues.push('基本設定を確認してください');
    return { draft, rows: views, issues };
  }

  // アクション（先頭から再生。席とストリートは再生で決まる）
  const actions: Action[] = [];
  let stopped = -1;
  rv.rows.forEach((row, i) => {
    if (stopped >= 0) return;
    const phase = phaseOf(setup, actions, board);
    const next = phase.kind === 'act' ? toAction(phase.state, phase.pos, phase.legal, row) : null;
    if (phase.kind !== 'act' || !next) {
      stopped = i;
      return;
    }
    actions.push(next);
    views[i] = {
      pos: phase.pos,
      street: phase.state.street,
      ok: true,
      mismatch: (row.readPos !== null && row.readPos !== phase.pos) || (row.readStreet !== null && row.readStreet !== phase.state.street),
    };
  });
  // 1 行の読み落としで以降がすべてずれるので、最初の 1 か所だけ知らせる（行は赤で示す）
  const firstMismatch = views.findIndex((v) => v.ok && v.mismatch);
  if (firstMismatch >= 0) issues.push(`${firstMismatch + 1}手目から席が画像の読み取りと合いません`);
  if (stopped >= 0) issues.push(`${stopped + 1}手目の Action が正しくありません`);
  else if (phaseOf(setup, actions, board).kind !== 'done') issues.push(`${actions.length + 1}手目以降の Action が足りません`);

  draft = normalizeSpot({ ...draft, actions });
  // 最後まで再生できたのに出題できるアクションが無い（Hero の席の直し間違いなど）
  if (issues.length === 0 && candidates(draft).length === 0) issues.push(NO_SPOT_MESSAGE);
  return { draft, rows: views, issues };
}

const inRange = (m: Mbb | null, range: { min: Mbb; max: Mbb } | null): m is Mbb =>
  m !== null && range !== null && m >= range.min && m <= range.max;

/** 1 行を、その時点で合法なアクションに直す。直せなければ null。 */
export function toAction(state: State, pos: Pos, legal: Legal, a: { verb: OcrVerb; amount: number | null }): Action | null {
  const base = { street: state.street, pos };
  const amount = a.amount === null ? null : bbToMbb(a.amount);
  const allInTo = state.bets[pos] + state.stacks[pos];
  switch (a.verb) {
    case 'fold':
      return legal.fold ? { ...base, type: 'fold' } : null;
    case 'check':
      return legal.check ? { ...base, type: 'check' } : null;
    case 'call':
      return legal.call !== null ? { ...base, type: 'call' } : null;
    case 'bet':
    case 'raise':
      if (inRange(amount, legal.bet)) return { ...base, type: 'bet', to: amount };
      if (inRange(amount, legal.raise)) return { ...base, type: 'raise', to: amount };
      // 額が今のベット以下の「レイズ」は、オールインのコールの書き方
      if (amount !== null && legal.call !== null && amount <= state.currentBet) return { ...base, type: 'call' };
      return null;
    case 'allin': {
      const to = amount ?? allInTo;
      // スタックより大きい額は、利用者のスタックの入力が画像と合っていない（コールに化けさせない）
      if (to > allInTo) return null;
      if (inRange(to, legal.bet)) return { ...base, type: 'bet', to };
      if (inRange(to, legal.raise)) return { ...base, type: 'raise', to };
      if (legal.call !== null) return { ...base, type: 'call' };
      return null;
    }
  }
}
