import {
  advance,
  BOARD_COUNT,
  bbToMbb,
  formatBb,
  legal,
  mbbToBb,
  POSITIONS,
  runActions,
  spotCandidates,
  spotView,
  status,
  STREETS,
  totalPot,
  validateInput,
  ValidationError,
  verifyPost,
  activeSeats,
  type Action,
  type ActionType,
  type Card,
  type Fmt,
  type HandResult,
  type HandSetup,
  type Legal,
  type Mbb,
  type Pos,
  type State,
  type Street,
} from '@wwyd/core';
import { handCards, isHandComplete } from './cardInput.ts';
import { messageForCode } from './errorMessages.ts';

/**
 * スポット投稿の下書きと、その解釈（詳細仕様 06 章 §3.3〜3.8）。
 * 入力欄の文字列をそのまま持ち、金額への変換・ハンドの進行・投稿前の検証はここの純関数で行う。
 * ポーカーの判定はすべて packages/core を使う（不変条件 7）。
 */

export type Draft = {
  fmt: Fmt;
  sb: string;
  ante: string;
  rake: string;
  stacks: Record<Pos, string>;
  hero: Pos;
  /** 席ごとのハンド（cardInput の形式） */
  hands: Record<Pos, string>;
  actions: Action[];
  board: Card[];
  spotIndex: number | null;
  villain: Pos | null;
  title: string;
};

export function emptyDraft(): Draft {
  const each = <T,>(v: T): Record<Pos, T> => ({ UTG: v, HJ: v, CO: v, BTN: v, SB: v, BB: v });
  return {
    fmt: 'cash',
    sb: '0.5',
    ante: '0',
    rake: '',
    stacks: each('100'),
    hero: 'BTN',
    hands: each(''),
    actions: [],
    board: [],
    spotIndex: null,
    villain: null,
    title: '',
  };
}

/** 何か入力されているか（離脱確認の要否）。 */
export function isDirty(d: Draft): boolean {
  return JSON.stringify(d) !== JSON.stringify(emptyDraft());
}

/** アクションを 1 つでも入れたら、基本設定・スタック・Hero の席はロック（06 章 §3.3）。 */
export function isLocked(d: Draft): boolean {
  return d.actions.length > 0;
}

// ---- 基本設定（06 章 §3.3・§3.4） ----

export const STREET_NAME: Record<Street, string> = { pf: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー' };
export const ACTION_NAME: Record<ActionType, string> = {
  fold: 'フォールド',
  check: 'チェック',
  call: 'コール',
  bet: 'ベット',
  raise: 'レイズ',
};

/** 数値の文字列を mbb に（空は `empty`）。小数第 4 位以下・数でないものは null。 */
function parseAmount(text: string, empty: Mbb | null): Mbb | null {
  const t = text.trim();
  if (t === '') return empty;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return bbToMbb(Number(t));
}

export type SettingField = 'sb' | 'ante' | 'rake' | Pos;
export const FIELD_LABEL: Record<SettingField, string> = {
  sb: 'SB',
  ante: 'アンティ',
  rake: 'レーキ',
  UTG: 'UTG のスタック',
  HJ: 'HJ のスタック',
  CO: 'CO のスタック',
  BTN: 'BTN のスタック',
  SB: 'SB のスタック',
  BB: 'BB のスタック',
};

export type ParsedSettings = { setup: HandSetup | null; rake: number | null; invalid: SettingField[] };

export function parseSettings(d: Draft): ParsedSettings {
  const invalid: SettingField[] = [];
  const sb = parseAmount(d.sb, null);
  if (sb === null || sb <= 0 || sb > 1000) invalid.push('sb');
  const ante = parseAmount(d.ante, 0);
  if (ante === null || ante < 0) invalid.push('ante');
  let rake: number | null = null;
  if (d.fmt === 'cash' && d.rake.trim() !== '') {
    const t = d.rake.trim();
    const r = Number(t);
    if (!/^\d+(\.\d{1,2})?$/.test(t) || r > 100) invalid.push('rake');
    else rake = r;
  }
  const stacks = {} as Record<Pos, Mbb>;
  for (const p of POSITIONS) {
    const s = parseAmount(d.stacks[p], null);
    if (s === null || s <= 0) invalid.push(p);
    else stacks[p] = s;
  }
  if (invalid.some((f) => f !== 'rake')) return { setup: null, rake, invalid };
  return { setup: { sb: sb as Mbb, bb: 1000, ante: ante as Mbb, stacks }, rake, invalid };
}

// ---- ハンドの進行（06 章 §3.6） ----

export type Phase =
  | { kind: 'invalid' }
  /** 席 `pos` のアクション待ち。`state` は advance 済み（アクションの street は state.street） */
  | { kind: 'act'; state: State; pos: Pos; legal: Legal }
  /** ボードのカード待ち（`need` 枚まで） */
  | { kind: 'board'; state: State; need: number }
  | { kind: 'done'; state: State; result: HandResult; boardCount: number };

export function phaseOf(setup: HandSetup | null, actions: readonly Action[], board: readonly Card[]): Phase {
  if (!setup) return { kind: 'invalid' };
  const states = runActions(setup, actions);
  let s = states[states.length - 1] as State;
  for (;;) {
    const st = status(s);
    switch (st.kind) {
      case 'act':
        return { kind: 'act', state: s, pos: st.pos, legal: legal(s, st.pos) };
      case 'streetEnd': {
        const next = STREETS[STREETS.indexOf(s.street) + 1] as Street;
        const need = BOARD_COUNT[next];
        if (board.length < need) return { kind: 'board', state: s, need };
        s = advance(s);
        continue;
      }
      case 'runout':
        if (board.length < 5) return { kind: 'board', state: s, need: 5 };
        return { kind: 'done', state: s, result: { kind: 'showdown', seats: activeSeats(s) }, boardCount: 5 };
      case 'showdown':
        return { kind: 'done', state: s, result: { kind: 'showdown', seats: activeSeats(s) }, boardCount: 5 };
      case 'over':
        return { kind: 'done', state: s, result: { kind: 'over', winner: st.winner }, boardCount: BOARD_COUNT[s.street] };
    }
  }
}

/** 状況行「{席} to act · {ストリート} · to call {額} · スタック {額}bb」 */
export function statusLine(state: State, pos: Pos): string {
  const toCall = state.currentBet - state.bets[pos];
  const parts = [`${pos} to act`, STREET_NAME[state.street]];
  if (toCall > 0) parts.push(`to call ${formatBb(Math.min(toCall, state.stacks[pos]))}`);
  parts.push(`スタック ${formatBb(state.stacks[pos])}bb`);
  return parts.join(' · ');
}

/** 額の初期値: to call = 0 はポット（pot + Σbets）の 50%（10mbb 単位）、to call > 0 は最小レイズ to。 */
export function defaultAmount(state: State, pos: Pos, range: { min: Mbb; max: Mbb }): Mbb {
  const toCall = state.currentBet - state.bets[pos];
  const target = toCall > 0 ? range.min : Math.round(totalPot(state) / 2 / 10) * 10;
  return Math.min(range.max, Math.max(range.min, target));
}

/** 額の入力を検査する。範囲外・小数第 4 位以下・数でなければ null。 */
export function parseSize(text: string, range: { min: Mbb; max: Mbb }): Mbb | null {
  const m = parseAmount(text, null);
  return m === null || m < range.min || m > range.max ? null : m;
}

/** ログの 1 行（ストリートごとの列に並べる）。例「BTN レイズ 2.5」「BB コール 1.5」「SB レイズ 100 オールイン」 */
export type LogItem = { index: number; street: Street; pos: Pos; text: string };

export function actionLog(setup: HandSetup, actions: readonly Action[]): LogItem[] {
  const states = runActions(setup, actions);
  return actions.map((a, i) => {
    let prev = states[i] as State;
    while (prev.street !== a.street) prev = advance(prev);
    const after = states[i + 1] as State;
    let text = `${a.pos} ${ACTION_NAME[a.type]}`;
    if (a.type === 'call') text += ` ${formatBb(after.bets[a.pos] - prev.bets[a.pos])}`;
    if (a.to !== undefined) text += ` ${formatBb(a.to)}`;
    if (a.type !== 'fold' && a.type !== 'check' && after.stacks[a.pos] === 0) text += ' オールイン';
    return { index: i, street: a.street, pos: a.pos, text };
  });
}

// ---- 下書きの操作 ----

/** スポットの候補（Hero のアクション）。表示「ターン / BTN ベット 6.5」 */
export function candidates(d: Draft): { index: number; villains: Pos[]; label: string }[] {
  return spotCandidates(d.actions, d.hero).map((c) => {
    const a = d.actions[c.index] as Action;
    const size = a.to === undefined ? '' : ` ${formatBb(a.to)}`;
    return { ...c, label: `${STREET_NAME[a.street]} / ${a.pos} ${ACTION_NAME[a.type]}${size}` };
  });
}

/** 候補から消えたスポット・Villain の選択を解除し、Villain が 1 席なら自動で選ぶ（06 章 §3.7）。 */
export function normalizeSpot(d: Draft): Draft {
  const c = candidates(d).find((x) => x.index === d.spotIndex);
  if (!c) return d.spotIndex === null && d.villain === null ? d : { ...d, spotIndex: null, villain: null };
  if (c.villains.length === 1) return c.villains[0] === d.villain ? d : { ...d, villain: c.villains[0] as Pos };
  return d.villain !== null && !c.villains.includes(d.villain) ? { ...d, villain: null } : d;
}

export function selectSpot(d: Draft, index: number): Draft {
  return normalizeSpot({ ...d, spotIndex: index, villain: d.spotIndex === index ? d.villain : null });
}

export function addAction(d: Draft, action: Action): Draft {
  return normalizeSpot({ ...d, actions: [...d.actions, action] });
}

/** 「1つ戻す」: 最後のアクションだけ取り消す（ボードは残す） */
export function undoAction(d: Draft): Draft {
  return normalizeSpot({ ...d, actions: d.actions.slice(0, -1) });
}

/** 「すべて消す」: アクションとボードを消す（ロック解除） */
export function clearActions(d: Draft): Draft {
  return { ...d, actions: [], board: [], spotIndex: null, villain: null };
}

export function addBoardCard(d: Draft, card: Card): Draft {
  return d.board.length >= 5 ? d : { ...d, board: [...d.board, card] };
}

/** ボードの i 枚目を押す: そのカード以降のボードと、そのストリート以降のアクションを消す（確認なし） */
export function removeBoardFrom(d: Draft, i: number): Draft {
  const street: Street = i < 3 ? 'flop' : i === 3 ? 'turn' : 'river';
  const cut = d.actions.findIndex((a) => STREETS.indexOf(a.street) >= STREETS.indexOf(street));
  return normalizeSpot({ ...d, board: d.board.slice(0, i), actions: cut < 0 ? d.actions : d.actions.slice(0, cut) });
}

/** 使用済みのカード（全席のハンドとボード）。`except` の席のハンドは除く（入力中の席）。 */
export function usedCards(d: Draft, except?: Pos): Set<Card> {
  const used = new Set<Card>(d.board);
  for (const p of POSITIONS) if (p !== except) for (const c of handCards(d.hands[p])) used.add(c);
  return used;
}

// ---- 投稿（06 章 §3.8、03 章 §3.1） ----

export type Submission = { ok: true; body: Record<string, unknown> } | { ok: false; errors: string[] };

/** タイトルの文字数（コードポイント数。DB の char_length と同じ）。 */
export function titleLength(title: string): number {
  return [...title].length;
}

/**
 * 「投稿する」を押したときの検査。問題があればエラー文の一覧、なければ create-post に送る本文を返す。
 * 最後に packages/core の validateInput と verifyPost を通す（サーバーと同じ判定。03 章 §4）。
 */
export function buildSubmission(d: Draft): Submission {
  const errors: string[] = [];
  const { setup, rake, invalid } = parseSettings(d);
  for (const f of invalid) errors.push(`${FIELD_LABEL[f]} の値が正しくありません`);

  const heroCards = handCards(d.hands[d.hero]);
  if (heroCards.length !== 2 || !isHandComplete(d.hands[d.hero])) errors.push(`Hero（${d.hero}）のハンドを入力してください`);
  for (const p of POSITIONS) {
    if (p !== d.hero && !isHandComplete(d.hands[p])) errors.push(`${p} のハンドが途中です`);
  }

  const phase = invalid.length === 0 ? phaseOf(setup, d.actions, d.board) : { kind: 'invalid' as const };
  if (phase.kind !== 'done' && invalid.length === 0) errors.push('ハンドを最後まで入力してください');
  if (d.spotIndex === null) errors.push('スポットを選択してください');
  else if (d.villain === null) errors.push('Villain を選択してください');
  if (d.title.trim() === '') errors.push('タイトルを入力してください');
  if (errors.length > 0 || !setup || phase.kind !== 'done' || d.spotIndex === null || d.villain === null) {
    return { ok: false, errors };
  }

  const known: Record<string, Card[]> = {};
  for (const p of POSITIONS) {
    const cards = handCards(d.hands[p]);
    if (p !== d.hero && cards.length === 2) known[p] = cards;
  }
  const bb = (m: Mbb | null): number | null => (m === null ? null : mbbToBb(m));

  try {
    const view = spotView(setup, d.actions, d.hero, d.spotIndex, d.villain);
    const stacks: Record<string, number> = {};
    for (const p of POSITIONS) stacks[p] = mbbToBb(setup.stacks[p]);
    const body: Record<string, unknown> = {
      title: d.title.trim(),
      fmt: d.fmt,
      sb: mbbToBb(setup.sb),
      bb: mbbToBb(setup.bb),
      ante: mbbToBb(setup.ante),
      rake: d.fmt === 'cash' ? rake : null,
      stacks,
      hero: d.hero,
      hero_cards: heroCards,
      known_cards: known,
      // 到達したストリートより後のボード（「1つ戻す」で残ったカード）は送らない
      board: d.board.slice(0, phase.boardCount),
      actions: d.actions.map((a) => (a.to === undefined ? { ...a } : { ...a, to: mbbToBb(a.to) })),
      spot_index: d.spotIndex,
      villain: d.villain,
      derived: {
        street: view.derived.street,
        keys: view.derived.keys,
        s1_label: view.derived.s1Label,
        min_to: bb(view.derived.minTo),
        max_to: bb(view.derived.maxTo),
        pot_base: mbbToBb(view.derived.potBase),
        effective_stack: mbbToBb(view.derived.effectiveStack),
        stop_index: view.derived.stopIndex,
      },
    };
    verifyPost(validateInput(body));
    return { ok: true, body };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, errors: [messageForCode(e.code, e.index)] };
    throw e;
  }
}
