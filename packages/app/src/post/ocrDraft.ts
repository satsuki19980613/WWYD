import { bbToMbb, POSITIONS, type Action, type Card, type Legal, type Mbb, type Pos, type State } from '@wwyd/core';
import type { OcrAction, OcrResult } from '@wwyd/ocr';
import { emptyDraft, normalizeSpot, parseSettings, phaseOf, type Draft } from './draft.ts';

/**
 * OCR の結果を投稿の下書きに反映する（詳細仕様 06 章 §3.9・07 章 §3）。
 *
 * - 置き換えるのは画像から読める所（Hero の席・各席のハンド・ボード・アクション）だけ。ゲーム形式・SB・アンティ・
 *   レーキ・スタック・タイトルは画像に無いので、利用者の入力のまま残す。
 * - アクションは packages/core で**先頭から 1 つずつ再生して確かめ**、合わない所で止める（読めたところまで反映）。
 *   手番の席は再生で決まるので、行頭のバッジが読めなかった行も席が分かる。読めたバッジが手番と違えば止める。
 * - `All-in` と、額の付いた `Raise` / `Bet` は、その時点の状態でベット・レイズ・コールに直す（T4 の額は
 *   そのストリートで「いくらまで」出したか。core の `to` と同じ）。
 */

export type OcrApply =
  | { ok: true; draft: Draft; issues: string[] }
  /** 何も反映できない（6 人の卓として読めない） */
  | { ok: false };

export function applyOcr(base: Draft, r: OcrResult): OcrApply {
  if (r.problems.some((p) => p.code === 'not_six_players')) return { ok: false };
  const issues: string[] = [];
  const blank = emptyDraft();
  const hero = r.hero ?? base.hero;
  if (r.hero === null) issues.push('Hero の席を読み取れませんでした');

  // ハンドとボード（同じカードが 2 度出たら、後のほうを捨てる）
  const used = new Set<Card>();
  const take = (cards: readonly Card[]): boolean => {
    if (cards.some((c) => used.has(c)) || new Set(cards).size !== cards.length) return false;
    for (const c of cards) used.add(c);
    return true;
  };
  const hands = { ...blank.hands };
  for (const p of POSITIONS) {
    const cards = r.hands[p];
    if (cards && take(cards)) hands[p] = cards.join('');
    else issues.push(`${p} のハンドを読み取れませんでした`);
  }
  const board: Card[] = [];
  for (const c of r.board) {
    if (!take([c])) break;
    board.push(c);
  }
  // フロップは 3 枚そろって初めて使える
  if (board.length > 0 && board.length < 3) board.length = 0;
  if (board.length < r.board.length || r.problems.some((p) => p.code === 'board_unread' || p.code === 'board_mismatch')) {
    issues.push('ボードを読み取れませんでした');
  }

  let draft: Draft = { ...base, hero, hands, board, actions: [], spotIndex: null, villain: null };

  // アクション（先頭から再生して確かめる）
  const { setup } = parseSettings(draft);
  if (!setup) {
    issues.push('基本設定を確認してから読み込み直してください');
    return { ok: true, draft, issues };
  }
  const actions: Action[] = [];
  for (let i = 0; i < r.actions.length; i++) {
    const phase = phaseOf(setup, actions, board);
    const a = r.actions[i] as OcrAction;
    const next =
      phase.kind === 'act' && phase.state.street === a.street && (a.pos === null || a.pos === phase.pos)
        ? toAction(phase.state, phase.pos, phase.legal, a)
        : null;
    if (!next) {
      issues.push(`${i + 1}手目のアクションを読み取れませんでした`);
      break;
    }
    actions.push(next);
  }
  draft = normalizeSpot({ ...draft, actions });
  const end = phaseOf(setup, actions, board);
  if (end.kind !== 'done' && actions.length === r.actions.length) {
    issues.push(`${actions.length + 1}手目以降のアクションを読み取れませんでした`);
  }
  return { ok: true, draft, issues };
}

const inRange = (m: Mbb | null, range: { min: Mbb; max: Mbb } | null): m is Mbb =>
  m !== null && range !== null && m >= range.min && m <= range.max;

/** 画像の 1 アクションを、その時点で合法なアクションに直す。直せなければ null。 */
export function toAction(state: State, pos: Pos, legal: Legal, a: OcrAction): Action | null {
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
