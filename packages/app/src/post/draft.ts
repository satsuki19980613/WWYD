import {
  advance,
  apply,
  BOARD_COUNT,
  bbToMbb,
  formatBb,
  hasPreflopAllin,
  legal,
  mbbToBb,
  POSITIONS,
  runActions,
  SEATS_BY_COUNT,
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
  type PlayerCount,
  type Pos,
  type State,
  type Street,
  hasReads,
  readCandidates,
  villainSeats,
  type ReadCandidate,
} from '@wwyd/core';
import { handCards, isHandComplete } from './cardInput.ts';
import { emptyMtt, incompleteSeats, MTT_FIELD_LABEL, parseMtt, readsForSubmit, type MttDraft, type ReadsDraft } from '../reads/readsModel.ts';
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
  /** 人数（2〜6）。選ぶまでは null（必須。06 章 §3.4） */
  players: PlayerCount | null;
  /** 席ごとのスタック（空席の値は使わない） */
  stacks: Record<Pos, string>;
  hero: Pos;
  /** 席ごとのハンド（cardInput の形式） */
  hands: Record<Pos, string>;
  actions: Action[];
  board: Card[];
  spotIndex: number | null;
  title: string;
  /** Villain の情報（席ごとの入力。登録できない席の分は送らない。18 章 §2.1） */
  reads: ReadsDraft;
  /** MTT の情報（Game 形式が MTT のときだけ送る。18 章） */
  mtt: MttDraft;
};

export function emptyDraft(): Draft {
  const each = <T,>(v: T): Record<Pos, T> => ({ UTG: v, HJ: v, CO: v, BTN: v, SB: v, BB: v });
  return {
    fmt: 'cash',
    sb: '0.5',
    ante: '0',
    rake: '',
    players: null,
    stacks: each('100'),
    hero: 'BTN',
    hands: each(''),
    actions: [],
    board: [],
    spotIndex: null,
    title: '',
    reads: {},
    mtt: emptyMtt(),
  };
}

/** 何か入力されているか（離脱確認の要否）。 */
export function isDirty(d: Draft): boolean {
  return JSON.stringify(d) !== JSON.stringify(emptyDraft());
}

/**
 * 基本設定・人数・Stack・Hero は Action を入れたあとも変えられる（2026-09-29 さつき。前はロックしていた）。
 * 変えた設定で合法に再生できる Action だけを残す（途中の手が合法でなくなったら、その手から後を外す）。
 * 設定が読めない間（入力の途中）は外さない。画面はこの結果を出し、Action を操作したときに確定する。
 */
export function settleActions(d: Draft): Draft {
  const setup = parseSettings(d).setup;
  if (!setup || d.actions.length === 0) return d;
  let n = d.actions.length;
  try {
    runActions(setup, d.actions);
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    n = e.index ?? 0;
  }
  return n === d.actions.length ? d : normalizeSpot({ ...d, actions: d.actions.slice(0, n) });
}

/** 座っている席（人数を選ぶまでは空）。プリフロップのアクション順 */
export function seatsOf(d: Draft): readonly Pos[] {
  return d.players === null ? [] : SEATS_BY_COUNT[d.players];
}

/** カードキーボードの ← → で移る席（座っている席を巡る。UTG の前は BB、BB の次は UTG） */
export function neighborSeat(seats: readonly Pos[], seat: Pos, dir: 1 | -1): Pos {
  const i = seats.indexOf(seat);
  if (i < 0 || seats.length === 0) return seat;
  return seats[(i + dir + seats.length) % seats.length] as Pos;
}

/**
 * `seat` の次から順に巡って、ハンドがまだ空の席（なければ null）。PC のカード選択ボードで 2 枚そろったら
 * 次の空の席へ進む（17 章。エクイティ計算機の「次の空きスロットへ」に倣う）。
 */
export function nextOpenSeat(seats: readonly Pos[], hands: Readonly<Record<Pos, string>>, seat: Pos): Pos | null {
  let p = seat;
  for (let k = 1; k < seats.length; k++) {
    p = neighborSeat(seats, p, 1);
    if (hands[p] === '') return p;
  }
  return null;
}

/**
 * 人数を選ぶ（06 章 §3.4）。席は早い席から削る（04 章 §2.1）。空席になった席のハンドは消し、
 * Hero が空席になったら BTN（どの人数にもある席）にする。
 */
export function setPlayers(d: Draft, n: PlayerCount): Draft {
  const seats = SEATS_BY_COUNT[n];
  const hands = { ...d.hands };
  for (const p of POSITIONS) if (!seats.includes(p)) hands[p] = '';
  return { ...d, players: n, hands, hero: seats.includes(d.hero) ? d.hero : 'BTN' };
}

// ---- 基本設定（06 章 §3.3・§3.4） ----

export const STREET_NAME: Record<Street, string> = { pf: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
export const ACTION_NAME: Record<ActionType, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
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
  ante: 'Ante',
  rake: 'Rake',
  UTG: 'UTG の Stack',
  HJ: 'HJ の Stack',
  CO: 'CO の Stack',
  BTN: 'BTN の Stack',
  SB: 'SB の Stack',
  BB: 'BB の Stack',
};

export const PLAYERS_REQUIRED = 'Player の人数を選択してください';

export type ParsedSettings ={ setup: HandSetup | null; rake: number | null; invalid: SettingField[] };

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
  // 空席はスタック 0（core の空席の表し方）。人数を選ぶまではハンドを進められない（setup は null）
  const seats = seatsOf(d);
  const stacks = {} as Record<Pos, Mbb>;
  for (const p of POSITIONS) {
    if (!seats.includes(p)) {
      stacks[p] = 0;
      continue;
    }
    const s = parseAmount(d.stacks[p], null);
    if (s === null || s <= 0) invalid.push(p);
    else stacks[p] = s;
  }
  if (invalid.some((f) => f !== 'rake') || seats.length === 0) return { setup: null, rake, invalid };
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
  parts.push(`Stack ${formatBb(state.stacks[pos])}bb`);
  return parts.join(' · ');
}

/** 額の初期値: to call = 0 はポット（pot + Σbets）の 50%（10mbb 単位）、to call > 0 は最小レイズ to。 */
export function defaultAmount(state: State, pos: Pos, range: { min: Mbb; max: Mbb }): Mbb {
  const toCall = state.currentBet - state.bets[pos];
  const target = toCall > 0 ? range.min : Math.round(totalPot(state) / 2 / 10) * 10;
  return Math.min(range.max, Math.max(range.min, target));
}

// ---- アクション入力の補助（13 章。2026-09-29） ----

/** 手番の見出し: ポット（このストリートのベットを含む）・to call・残りスタック */
export function turnInfo(state: State, pos: Pos): { pot: Mbb; toCall: Mbb; stack: Mbb } {
  const toCall = Math.min(state.currentBet - state.bets[pos], state.stacks[pos]);
  return { pot: totalPot(state), toCall, stack: state.stacks[pos] };
}

/** 額のボタン。`label` は考え方の単位（bb・×倍率・% pot）、`sub` は to の額（bb） */
export type SizePreset = { label: string; sub: string; to: Mbb; allin: boolean };

/**
 * よく使う額（13 章 §2）。プレイヤーが考える単位で出す。
 * - プリフロップのオープン: 2 / 2.2 / 2.5 / 3bb（リンプがあれば 3 / 4 / 5bb＋リンプ 1 人につき 1bb）
 * - プリフロップの 3bet 以降: 直前のレイズ（to）の ×2.2 / ×2.5 / ×3 / ×4
 * - フロップ以降のベット: ポットの 25 / 33 / 50 / 75 / 100 / 150%
 * - フロップ以降のレイズ: 直前のベット（to）の ×2.5 / ×3 / ×4
 * 最小に満たない額と、オールイン以上の額は出さない（オールインは最後に必ず出す）。
 */
export function sizePresets(state: State, legal: Legal): SizePreset[] {
  const range = legal.bet ?? legal.raise;
  if (!range) return [];
  const bb = state.bb;
  const pot = totalPot(state);
  // % pot は 0.1bb に丸める（ログ・集計の表示で 1.82 のような額にしない）。倍率は 0.01bb
  const raw: { label: string; to: number; unit: number }[] = [];
  if (state.street === 'pf' && state.currentBet <= bb) {
    const limpers = limperCount(state);
    const opens = limpers === 0 ? [2, 2.2, 2.5, 3] : [3, 4, 5].map((x) => x + limpers);
    for (const x of opens) raw.push({ label: formatBb(x * bb), to: x * bb, unit: 10 });
  } else if (state.street === 'pf') {
    for (const k of [2.2, 2.5, 3, 4]) raw.push({ label: `×${k}`, to: state.currentBet * k, unit: 10 });
  } else if (state.currentBet === 0) {
    for (const pct of [25, 33, 50, 75, 100, 150]) raw.push({ label: `${pct}%`, to: (pot * pct) / 100, unit: 100 });
  } else {
    for (const k of [2.5, 3, 4]) raw.push({ label: `×${k}`, to: state.currentBet * k, unit: 10 });
  }
  const out: SizePreset[] = [];
  for (const r of raw) {
    const to = Math.round(r.to / r.unit) * r.unit;
    if (to < range.min || to >= range.max || out.some((o) => o.to === to)) continue;
    out.push({ label: r.label, sub: formatBb(to), to, allin: false });
  }
  out.push({ label: 'All-in', sub: formatBb(range.max), to: range.max, allin: true });
  return out;
}

/** 最初に選んでおく額: オープン 2.5bb・3bet ×3・ベット 33%・レイズ ×3（無ければ最小） */
export function defaultPreset(state: State, legal: Legal): Mbb | null {
  const range = legal.bet ?? legal.raise;
  if (!range) return null;
  const ps = sizePresets(state, legal);
  const want = state.street === 'pf' ? (state.currentBet <= state.bb ? '2.5' : '×3') : state.currentBet === 0 ? '33%' : '×3';
  return ps.find((p) => p.label === want)?.to ?? ps.find((p) => !p.allin)?.to ?? range.min;
}

/** プリフロップのリンプの人数（BB と同額を出した BB 以外の席） */
function limperCount(state: State): number {
  return state.seated.filter((p) => p !== 'BB' && state.bets[p] === state.bb && !state.folded.has(p)).length;
}

/**
 * 台のベット・レイズのボタンの名前（13 章 §6。2026-09-29）。プレイヤーが呼ぶ名前で出す。
 * - プリフロップ: 最初のレイズは「オープン」（リンプがいれば「レイズ」）、2 回目から「3bet」「4bet」…
 * - フロップ以降: 「ベット」、2 回目は「レイズ」、3 回目から「3bet」「4bet」…
 * `actions` はこれまでのアクション（このストリートのベット・レイズの回数を数える）。
 */
export function aggressiveName(state: State, actions: readonly Action[]): string {
  const n = actions.filter((a) => a.street === state.street && (a.type === 'bet' || a.type === 'raise')).length;
  if (state.street === 'pf') {
    if (n === 0) return limperCount(state) === 0 ? 'Open' : 'Raise';
    return `${n + 2}bet`;
  }
  if (n === 0) return 'Bet';
  return n === 1 ? 'Raise' : `${n + 1}bet`;
}

/** 台のコールのボタンの名前: プリフロップでレイズが無いときの BB 以外のコールは「リンプ」 */
export function callName(state: State, pos: Pos): string {
  return state.street === 'pf' && state.currentBet === state.bb && pos !== 'BB' ? 'Limp' : 'Call';
}

/**
 * 「Fold to」「Check to」（13 章 §2。途中の席のフォールド・チェックを 1 回で入れる）。
 * 手番の席から、フォールド（ベットがあるとき）またはチェック（ないとき）を続けて、そのストリートのうちに
 * 手番が回る席と、そこまでに入れるアクションを返す。すぐ次の手番（1 手で回る席）も含む。
 */
export function skipTargets(state: State, pos: Pos, legalNow: Legal): { kind: 'fold' | 'check'; targets: { pos: Pos; actions: Action[] }[] } {
  const kind = legalNow.check ? 'check' : 'fold';
  const targets: { pos: Pos; actions: Action[] }[] = [];
  let s = state;
  let p = pos;
  const actions: Action[] = [];
  for (let guard = 0; guard < 6; guard++) {
    const lg = legal(s, p);
    if (kind === 'fold' ? !lg.fold : !lg.check) break;
    const a: Action = { street: s.street, pos: p, type: kind };
    actions.push(a);
    s = apply(s, a);
    const st = status(s);
    if (st.kind !== 'act') break;
    p = st.pos;
    targets.push({ pos: p, actions: [...actions] });
  }
  return { kind, targets };
}

// ---- 額のスライダー（スマホ。14 章 §3.1） ----

/** なぞったときの刻み（mbb）: 幅が 10bb まで 0.1bb、50bb まで 0.5bb、それより広ければ 1bb。▲▼ は常に 0.1bb */
export function sliderStep(range: { min: Mbb; max: Mbb }): Mbb {
  const span = range.max - range.min;
  return span <= 10_000 ? 100 : span <= 50_000 ? 500 : 1000;
}
export const SLIDER_NUDGE: Mbb = 100;

/** スライダーの位置（0 = 下端 = 最小、1 = 上端 = 最大）から額。刻みに丸め、端は最小・最大ちょうど */
export function sliderValue(ratio: number, range: { min: Mbb; max: Mbb }): Mbb {
  if (ratio <= 0.005) return range.min;
  if (ratio >= 0.995) return range.max;
  const step = sliderStep(range);
  const v = Math.round((range.min + ratio * (range.max - range.min)) / step) * step;
  return Math.min(range.max, Math.max(range.min, v));
}

/** 額の添え書き: ベットは「{n}% pot」、レイズは直前のベット（to）の「×{n}」。プリフロップのオープンは無し */
export function sizeNote(state: State, to: Mbb): string | null {
  if (state.currentBet === 0) {
    const pot = totalPot(state);
    return pot > 0 ? `${Math.round((to / pot) * 100)}% pot` : null;
  }
  if (state.street === 'pf' && state.currentBet <= state.bb) return null;
  return `×${(Math.round((to / state.currentBet) * 10) / 10).toString()}`;
}

// ---- 1つ進む（取り消したアクションを入れ直す。14 章 §3.1） ----

/** 取り消したアクション `a` を今の手番にそのまま入れられるか（同じストリート・同じ席・合法な額） */
export function canReplay(phase: Phase, a: Action | undefined): boolean {
  if (!a || phase.kind !== 'act' || a.street !== phase.state.street || a.pos !== phase.pos) return false;
  const lg = phase.legal;
  const within = (r: { min: Mbb; max: Mbb } | null): boolean => r !== null && a.to !== undefined && a.to >= r.min && a.to <= r.max;
  switch (a.type) {
    case 'fold':
      return lg.fold;
    case 'check':
      return lg.check;
    case 'call':
      return lg.call !== null;
    case 'bet':
      return within(lg.bet);
    case 'raise':
      return within(lg.raise);
  }
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
    if (a.type !== 'fold' && a.type !== 'check' && after.stacks[a.pos] === 0) text += ' All-in';
    return { index: i, street: a.street, pos: a.pos, text };
  });
}

// ---- 下書きの操作 ----

/**
 * スポットの候補（Flop 以降の Hero の手番。2026-09-29）。表示「Turn / BTN Bet 6.5」（その手番で Hero が実際にしたアクション）。
 * Preflop でだれかが All-in になったハンドは候補なし（投稿できない。2026-09-29 さつき）。
 */
export function candidates(d: Draft): { index: number; label: string }[] {
  if (preflopAllinOf(d)) return [];
  return spotCandidates(d.actions, d.hero).map((c) => {
    const a = d.actions[c.index] as Action;
    const size = a.to === undefined ? '' : ` ${formatBb(a.to)}`;
    return { ...c, label: `${STREET_NAME[a.street]} / ${a.pos} ${ACTION_NAME[a.type]}${size}` };
  });
}

/** 候補から消えたスポットの選択を解除する（06 章 §3.7）。 */
export function normalizeSpot(d: Draft): Draft {
  if (d.spotIndex === null || candidates(d).some((c) => c.index === d.spotIndex)) return d;
  return { ...d, spotIndex: null };
}

export function selectSpot(d: Draft, index: number): Draft {
  return normalizeSpot({ ...d, spotIndex: index });
}

export function addAction(d: Draft, action: Action): Draft {
  return normalizeSpot({ ...d, actions: [...d.actions, action] });
}

/** 続けて入れる（Fold to / Check to） */
export function addActions(d: Draft, actions: readonly Action[]): Draft {
  return normalizeSpot({ ...d, actions: [...d.actions, ...actions] });
}

/** 「1つ戻す」: 最後のアクションだけ取り消す（ボードは残す） */
export function undoAction(d: Draft): Draft {
  return normalizeSpot({ ...d, actions: d.actions.slice(0, -1) });
}

/** ログの 1 手を押して「ここから入れ直す」: その手以降のアクションを消す（ボードは残す。13 章 §6） */
export function truncateActions(d: Draft, index: number): Draft {
  return normalizeSpot({ ...d, actions: d.actions.slice(0, Math.max(0, index)) });
}

/** 「すべて消す」: アクションとボードを消す（ロック解除） */
export function clearActions(d: Draft): Draft {
  return { ...d, actions: [], board: [], spotIndex: null };
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

export const PREFLOP_ALLIN = messageForCode('preflop_allin');
export const NO_HERO_POSTFLOP = messageForCode('no_spot');

/** 下書きのハンドで Preflop にだれかが All-in になったか（core の hasPreflopAllin。再生できなければ false） */
function preflopAllinOf(d: Draft, add: readonly Action[] = []): boolean {
  const setup = parseSettings(d).setup;
  if (!setup) return false;
  try {
    return hasPreflopAllin(setup, [...d.actions, ...add]);
  } catch {
    return false;
  }
}

/**
 * `add` を入れると Preflop でだれかが All-in になる（Hero でもほかの席でも）か。そのハンドは投稿できないので、
 * Action の入力で受け付けない（2026-09-29 さつき）。すでに All-in があるハンド（前の版の下書きなど）は止めない。
 */
export function makesPreflopAllin(d: Draft, add: readonly Action[]): boolean {
  return add.some((a) => a.street === 'pf') && !preflopAllinOf(d) && preflopAllinOf(d, add);
}

/**
 * 最後まで入れたハンドに Spot の候補が無いときの投稿のエラー（2026-09-29 さつき）。
 * Preflop でだれかが All-in になったハンドはそう伝え、それ以外（Hero の Preflop の Fold など）は Flop 以降に Hero の Action が無いと伝える。
 */
function noSpotError(d: Draft): string {
  return preflopAllinOf(d) ? PREFLOP_ALLIN : NO_HERO_POSTFLOP;
}

/**
 * 「投稿する」を押したときの検査。問題があればエラー文の一覧、なければ create-post に送る本文を返す。
 * 最後に packages/core の validateInput と verifyPost を通す（サーバーと同じ判定。03 章 §4）。
 */
export function buildSubmission(d: Draft): Submission {
  const errors: string[] = [];
  const { setup, invalid } = parseSettings(d);
  const seats = seatsOf(d);
  if (d.players === null) errors.push(PLAYERS_REQUIRED);
  for (const f of invalid) errors.push(`${FIELD_LABEL[f]} の値が正しくありません`);

  const heroCards = handCards(d.hands[d.hero]);
  if (heroCards.length !== 2 || !isHandComplete(d.hands[d.hero])) errors.push(`Hero（${d.hero}）の Hand を入力してください`);
  for (const p of seats) {
    if (p !== d.hero && !isHandComplete(d.hands[p])) errors.push(`${p} の Hand が途中です`);
  }

  const phase = invalid.length === 0 ? phaseOf(setup, d.actions, d.board) : { kind: 'invalid' as const };
  if (phase.kind !== 'done' && invalid.length === 0 && d.players !== null) errors.push('Hand を最後まで入力してください');
  if (d.spotIndex === null) errors.push(phase.kind === 'done' && candidates(d).length === 0 ? noSpotError(d) : 'Spot を選択してください');
  if (d.title.trim() === '') errors.push('タイトルを入力してください');
  if (d.fmt === 'mtt') for (const f of parseMtt(d.mtt).invalid) errors.push(`MTT の ${MTT_FIELD_LABEL[f]} の値が正しくありません`);
  for (const p of incompleteSeats(d.reads, villainContext(d).seats)) errors.push(`${p} の General Read を最後まで選んでください`);
  if (errors.length > 0 || !setup || phase.kind !== 'done' || d.spotIndex === null) {
    return { ok: false, errors };
  }

  try {
    const body = submissionBody(d);
    verifyPost(validateInput(body));
    return { ok: true, body };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, errors: [messageForCode(e.code, e.index)] };
    throw e;
  }
}

/**
 * 下書きから create-post に送る本文を作る（画面の検査はしない。入力のまま送り、正しくなければサーバーが断る）。
 * 画面のエラーはすべてサーバーも返す（2026-09-29 さつき）ことを、この本文をサーバーと同じ検証にかけて試験する（draft.test）。
 */
export function submissionBody(d: Draft): Record<string, unknown> {
  const { setup } = parseSettings(d);
  const seats = seatsOf(d);
  // 数の欄は、読めれば core の丸めを通した値、読めなければ入力のまま数にする（サーバーが断る）
  const num = (text: string, parsed: Mbb | undefined): number => (parsed !== undefined ? mbbToBb(parsed) : Number(text.trim()));
  const stacks: Record<string, number> = {};
  for (const p of seats) stacks[p] = num(d.stacks[p], setup?.stacks[p]);
  const known: Record<string, Card[]> = {};
  for (const p of seats) {
    const cards = handCards(d.hands[p]);
    if (p !== d.hero && cards.length > 0) known[p] = cards;
  }
  let board = d.board;
  let derived: Record<string, unknown> | null = null;
  if (setup) {
    try {
      const phase = phaseOf(setup, d.actions, d.board);
      // 到達したストリートより後のボード（「1つ戻す」で残ったカード）は送らない
      if (phase.kind === 'done') board = d.board.slice(0, phase.boardCount);
      if (d.spotIndex !== null) {
        const v = spotView(setup, d.actions, d.hero, d.spotIndex).derived;
        const bb = (m: Mbb | null): number | null => (m === null ? null : mbbToBb(m));
        derived = {
          street: v.street,
          keys: v.keys,
          s1_label: v.s1Label,
          min_to: bb(v.minTo),
          max_to: bb(v.maxTo),
          pot_base: mbbToBb(v.potBase),
          effective_stack: mbbToBb(v.effectiveStack),
          stop_index: v.stopIndex,
        };
      }
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
    }
  }
  const rake = d.rake.trim();
  const vc = villainContext(d);
  const reads = readsForSubmit(d.reads, vc.seats, vc.cands);
  const mtt = d.fmt === 'mtt' ? parseMtt(d.mtt).info : null;
  return {
    title: d.title.trim(),
    fmt: d.fmt,
    sb: num(d.sb, setup?.sb),
    bb: 1,
    ante: d.ante.trim() === '' ? 0 : num(d.ante, setup?.ante),
    rake: d.fmt === 'cash' && rake !== '' ? Number(rake) : null,
    // 席は stacks のキーで表す（空席は送らない。04 章 §2.1）
    stacks,
    hero: d.hero,
    hero_cards: handCards(d.hands[d.hero]),
    known_cards: known,
    board,
    actions: d.actions.map((a) => (a.to === undefined ? { ...a } : { ...a, to: mbbToBb(a.to) })),
    spot_index: d.spotIndex,
    // スポットが決まらなければ派生メタは null（サーバーは malformed で断る）
    derived,
    // Villain の情報は登録できる席の分だけ（Spot Read は判断地点より前の実際の Action のときだけ）、MTT の情報は MTT のときだけ（18 章 §3）。情報が無ければキーごと送らない（前の版と同じ本文）
    ...(hasReads(reads) ? { villain_reads: reads } : {}),
    ...(mtt ? { mtt } : {}),
  };
}

/**
 * Villain の情報を登録できる席と Spot Read の候補（18 章 §2.1.4・§10 B-2。判定は core）。
 * 設定が読めない・Action が合法に再生できないときは空、Spot を選ぶまでは候補が空。
 */
export function villainContext(d: Draft): { seats: Pos[]; cands: ReadCandidate[] } {
  const { setup } = parseSettings(d);
  if (!setup || d.players === null) return { seats: [], cands: [] };
  try {
    const seated = seatsOf(d);
    const seats = villainSeats(setup, d.actions, d.hero).filter((p) => seated.includes(p));
    const cands = d.spotIndex !== null ? readCandidates(setup, d.actions, d.hero, d.spotIndex) : [];
    return { seats, cands };
  } catch (e) {
    if (e instanceof ValidationError) return { seats: [], cands: [] };
    throw e;
  }
}
