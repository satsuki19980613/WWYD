/**
 * Villain の Read の Action の語彙と、Action の列から Spot Read の Action を決める規則（詳細仕様 18 章 §2.1.5・§10.3。2026-09-30 さつき）。
 * 画面（Spot Read の自動入力・表示）と create-post（Spot Read が実際の Action に合うかの確認）の両方がこれを使う（不変条件 7）。
 */
import { POSITIONS, type Pos, type Street } from '../constants.ts';
import type { Mbb } from '../money.ts';
import { runActions } from './replay.ts';
import { advance, ORDER_POST, status, totalPot, type Action, type HandSetup, type State } from './state.ts';

/** Action の語彙（安定した ID。表示名は画面側） */
export const READ_ACTIONS = [
  '3bet',
  'fold_3bet',
  '4bet',
  'fold_4bet',
  'squeeze',
  'limp',
  'fold_steal',
  'cbet',
  'fold_cbet',
  'barrel',
  'fold_barrel',
  'delayed_cbet',
  'donk',
  'probe',
  'bet_vs_check',
  'raise',
  'fold_bet',
  'fold_raise',
] as const;
export type ReadAction = (typeof READ_ACTIONS)[number];

/** Street → 選べる Action（表 1） */
export const STREET_ACTIONS: Record<Street, readonly ReadAction[]> = {
  pf: ['3bet', 'fold_3bet', '4bet', 'fold_4bet', 'squeeze', 'limp', 'fold_steal'],
  flop: ['cbet', 'fold_cbet', 'donk', 'bet_vs_check', 'raise', 'fold_bet', 'fold_raise'],
  turn: ['barrel', 'fold_barrel', 'delayed_cbet', 'donk', 'probe', 'bet_vs_check', 'raise', 'fold_bet', 'fold_raise'],
  river: ['barrel', 'fold_barrel', 'donk', 'probe', 'bet_vs_check', 'raise', 'fold_bet', 'fold_raise'],
};

/** Bet / Raise 系（Value-heavy・Bluff-heavy と Size を選べる） */
export const AGGRESSIVE_ACTIONS: readonly ReadAction[] = ['3bet', '4bet', 'squeeze', 'cbet', 'barrel', 'delayed_cbet', 'donk', 'probe', 'bet_vs_check', 'raise'];

export const LEANS = ['over', 'under', 'value', 'bluff'] as const;
export type Lean = (typeof LEANS)[number];

/** Action → 選べる Lean（表 2） */
export function leansOf(action: ReadAction): readonly Lean[] {
  return AGGRESSIVE_ACTIONS.includes(action) ? LEANS : ['over', 'under'];
}

export const READ_SIZES = ['small', 'big', 'overbet'] as const;
export type ReadSize = (typeof READ_SIZES)[number];

/** Street → 選べる Size（Preflop は Overbet なし。§10 C-8） */
export function sizesOf(street: Street): readonly ReadSize[] {
  return street === 'pf' ? ['small', 'big'] : READ_SIZES;
}

/** Spot Read の候補（Villain が実際に取った Action のうち、語彙に当たるもの） */
export type ReadCandidate = {
  /** Action の列の添字 */
  index: number;
  pos: Pos;
  street: Street;
  action: ReadAction;
  /** 実際の額から決めた Size（Postflop の Bet / Raise 系だけ。§10 C-5） */
  size: ReadSize | null;
  /** その Street で先に Check してからの Raise（表示名を Check-Raise にする。§10 C-7） */
  checkRaise: boolean;
};

/**
 * Pot に対する大きさ（§10 C-5）: 上乗せした額（Bet の額、Raise はコールを超えた分）を、コールした後の Pot と比べる。
 * 50% 未満 Small、100% まで Big、それより上 Overbet。
 */
export function sizeOf(s: State, pos: Pos, to: Mbb): ReadSize {
  const extra = to - s.currentBet;
  const base = totalPot(s) + (s.currentBet - s.bets[pos]);
  if (extra * 2 < base) return 'small';
  return extra <= base ? 'big' : 'overbet';
}

const postIndex = (p: Pos): number => ORDER_POST.indexOf(p);

/** Postflop で `a` が `b` より先に動く（OOP） */
export function actsBefore(a: Pos, b: Pos): boolean {
  return postIndex(a) < postIndex(b);
}

/**
 * Action の列の各 Action を語彙に当てはめる（当たらなければ null。§10.3 の規則）。
 * 添字 i の結果は i までの Action だけで決まる（後の Action を見ない）。
 */
export function classifyActions(setup: HandSetup, actions: readonly Action[]): (ReadCandidate | null)[] {
  const states = runActions(setup, actions);
  const out: (ReadCandidate | null)[] = [];

  // Preflop
  let raises = 0;
  let opener: Pos | null = null;
  let steal = false;
  let callersAfterOpen = 0;
  let threeBettor: Pos | null = null;
  let anyBefore = false; // 最初の Raise より前に Fold 以外の Action があったか（Limp）
  let pfAggressor: Pos | null = null;

  // Postflop
  let street: Street = 'pf';
  let aggressor: Pos | null = null;
  let prevHadBet = false;
  let streetHadBet = false;
  let checked = new Set<Pos>();
  let acted = new Set<Pos>();
  let lastKind: 'cbet' | 'barrel' | 'bet' | 'raise' | null = null;

  actions.forEach((a, i) => {
    let s = states[i] as State;
    while (s.street !== a.street && status(s).kind === 'streetEnd') s = advance(s);
    const cand = (action: ReadAction, size: ReadSize | null = null, checkRaise = false): ReadCandidate => ({
      index: i,
      pos: a.pos,
      street: a.street,
      action,
      size,
      checkRaise,
    });

    if (a.street === 'pf') {
      let c: ReadCandidate | null = null;
      if (a.type === 'call') {
        if (raises === 0 && a.pos !== 'BB') c = cand('limp');
        else if (raises === 1) callersAfterOpen++;
        if (raises === 0) anyBefore = true;
      } else if (a.type === 'raise' || a.type === 'bet') {
        raises++;
        pfAggressor = a.pos;
        if (raises === 1) {
          opener = a.pos;
          steal = !anyBefore && (a.pos === 'CO' || a.pos === 'BTN' || a.pos === 'SB');
        } else if (raises === 2) {
          threeBettor = a.pos;
          c = cand(callersAfterOpen > 0 ? 'squeeze' : '3bet');
        } else if (raises === 3) c = cand('4bet');
      } else if (a.type === 'fold') {
        if (raises === 2 && a.pos === opener) c = cand('fold_3bet');
        else if (raises === 3 && a.pos === threeBettor) c = cand('fold_4bet');
        else if (raises === 1 && steal && (a.pos === 'SB' || a.pos === 'BB') && a.pos !== opener) c = cand('fold_steal');
      } else if (a.type === 'check' && raises === 0) anyBefore = true;
      out.push(c);
      return;
    }

    // Street が変わった
    if (a.street !== street) {
      prevHadBet = street === 'pf' ? raises > 0 : streetHadBet;
      if (street === 'pf') aggressor = pfAggressor;
      street = a.street;
      streetHadBet = false;
      checked = new Set();
      acted = new Set();
      lastKind = null;
    }

    let c: ReadCandidate | null = null;
    if (a.type === 'check') {
      checked.add(a.pos);
    } else if (a.type === 'bet' && a.to !== undefined) {
      const size = sizeOf(s, a.pos, a.to);
      let action: ReadAction | null = null;
      const aggInHand = aggressor !== null && !s.folded.has(aggressor);
      if (a.pos === aggressor) {
        if (street === 'flop') action = 'cbet';
        else if (street === 'turn' && !prevHadBet) action = 'delayed_cbet';
        else action = 'barrel';
      } else if (aggInHand && aggressor !== null && !acted.has(aggressor) && actsBefore(a.pos, aggressor)) {
        action = prevHadBet ? 'donk' : 'probe';
      } else if (checked.size > 0) action = 'bet_vs_check';
      if (action) c = cand(action, size);
      lastKind = action === 'cbet' ? 'cbet' : action === 'barrel' || action === 'delayed_cbet' ? 'barrel' : 'bet';
      aggressor = a.pos;
      streetHadBet = true;
    } else if (a.type === 'raise' && a.to !== undefined) {
      c = cand('raise', sizeOf(s, a.pos, a.to), checked.has(a.pos));
      lastKind = 'raise';
      aggressor = a.pos;
      streetHadBet = true;
    } else if (a.type === 'fold' && lastKind !== null) {
      const map = { cbet: 'fold_cbet', barrel: 'fold_barrel', bet: 'fold_bet', raise: 'fold_raise' } as const;
      c = cand(map[lastKind]);
    }
    acted.add(a.pos);
    out.push(c);
  });
  return out;
}

/** Spot Read の候補: Hero の判断地点（`spotIndex`）より前の、Hero 以外の席の Action（§2.1.4） */
export function readCandidates(setup: HandSetup, actions: readonly Action[], hero: Pos, spotIndex: number): ReadCandidate[] {
  return classifyActions(setup, actions.slice(0, spotIndex)).filter((c): c is ReadCandidate => c !== null && c.pos !== hero);
}

/**
 * Villain の情報を登録できる席（§10 B-2）: Hero 以外で、Preflop で Fold 以外の Action を 1 回でもした席と、
 * Fold to Steal に当たる Fold をした Blind。Spot は Flop 以降なので、Preflop の Action だけで決まる（答えは漏れない）。
 */
export function villainSeats(setup: HandSetup, actions: readonly Action[], hero: Pos): Pos[] {
  const pf = actions.filter((a) => a.street === 'pf');
  const cls = classifyActions(setup, pf);
  const ok = new Set<Pos>();
  pf.forEach((a, i) => {
    if (a.type !== 'fold' || cls[i]?.action === 'fold_steal') ok.add(a.pos);
  });
  return POSITIONS.filter((p) => p !== hero && ok.has(p));
}

/**
 * Raise の表示名を Check-Raise にするか（§10 C-7）。Spot Read は、その Street で Villain が Check してから Raise したか。
 * General Read は、Villain の席が Postflop で Hero より先に動くか（OOP）。
 */
export function isCheckRaise(scope: 'spot' | 'general', street: Street, villain: Pos, hero: Pos, actions: readonly Action[]): boolean {
  if (street === 'pf') return false;
  if (scope === 'general') return actsBefore(villain, hero);
  let checked = false;
  for (const a of actions) {
    if (a.street !== street || a.pos !== villain) continue;
    if (a.type === 'check') checked = true;
    else if (a.type === 'raise') return checked;
  }
  return false;
}
