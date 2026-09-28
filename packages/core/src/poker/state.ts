/**
 * ハンドの状態遷移（詳細仕様 04 章 §2〜6。仕様書 §6）。
 * 状態は不変として扱い、`apply` / `advance` は新しい状態を返す。
 */
import { POSITIONS, type Pos, type Street } from '../constants.ts';
import { fail } from '../errors.ts';
import type { Mbb } from '../money.ts';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/** `to` は bet / raise のみ（そのストリートでの合計額）。 */
export type Action = { street: Street; pos: Pos; type: ActionType; to?: Mbb };

/**
 * `stacks` が 0 の席は空席（2〜6 人。04 章 §2.1）。空席は最初からフォールド扱いで、アンティもブラインドも払わない。
 * SB の席が空いていればボタン（BTN）が SB を払う（ヘッズアップ）。
 */
export type HandSetup = { sb: Mbb; bb: Mbb; ante: Mbb; stacks: Record<Pos, Mbb> };

/** 座っている席（スタックが 0 より大きい席。プリフロップのアクション順）。 */
export function seatedOf(setup: HandSetup): Pos[] {
  return POSITIONS.filter((p) => setup.stacks[p] > 0);
}

export type State = {
  /** 座っている席（空席を除く。表示用） */
  seated: readonly Pos[];
  street: Street;
  /** 回収済みポット（前のストリートまでのベットとアンティ）。 */
  pot: Mbb;
  /** このストリートのベット額（フォールドした席の分も回収まで残る）。 */
  bets: Record<Pos, Mbb>;
  /** 残りスタック。 */
  stacks: Record<Pos, Mbb>;
  folded: ReadonlySet<Pos>;
  allin: ReadonlySet<Pos>;
  currentBet: Mbb;
  /** 直前の有効なレイズ幅（最小レイズ幅）。 */
  minRaise: Mbb;
  actedThisStreet: ReadonlySet<Pos>;
  /** 最後の有効なレイズ以降にアクション済みの席（再オープンの判定）。 */
  actedSinceFullRaise: ReadonlySet<Pos>;
  lastActor: Pos | null;
  /** 表示用（このストリートの直前のアクション）。 */
  lastAction: Partial<Record<Pos, Action>>;
  /** BB の額（最小ベット・ストリート開始時の最小レイズ幅）。 */
  bb: Mbb;
};

export const ORDER_PF: readonly Pos[] = POSITIONS;
export const ORDER_POST: readonly Pos[] = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];

const NEXT_STREET: Record<Street, Street | null> = { pf: 'flop', flop: 'turn', turn: 'river', river: null };

/** ストリートに到達したときに必要なボードの枚数（§4.3）。 */
export const BOARD_COUNT: Record<Street, number> = { pf: 0, flop: 3, turn: 4, river: 5 };

function zeroes(): Record<Pos, Mbb> {
  return { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 };
}

/** 初期状態（§3）。アンティ → ブラインドの順に徴収する。ブラインドのポストはアクションではない。 */
export function initialState(setup: HandSetup): State {
  const stacks = { ...setup.stacks };
  const bets = zeroes();
  const allin = new Set<Pos>();
  const seated = seatedOf(setup);
  // 空席は最初からフォールド扱い（アクション順・残っている席の判定から外れる）
  const folded = new Set<Pos>(POSITIONS.filter((p) => !seated.includes(p)));
  let pot = 0;
  for (const p of seated) {
    const a = Math.min(setup.ante, stacks[p]);
    stacks[p] -= a;
    pot += a;
    if (stacks[p] === 0) allin.add(p);
  }
  // ヘッズアップ（SB の席が空き）はボタンが SB を払う
  const sbSeat: Pos = seated.includes('SB') ? 'SB' : 'BTN';
  for (const [p, blind] of [
    [sbSeat, setup.sb],
    ['BB', setup.bb],
  ] as const) {
    const b = Math.min(blind, stacks[p]);
    stacks[p] -= b;
    bets[p] = b;
    if (stacks[p] === 0) allin.add(p);
  }
  return {
    seated,
    street: 'pf',
    pot,
    bets,
    stacks,
    folded,
    allin,
    currentBet: setup.bb,
    minRaise: setup.bb,
    actedThisStreet: new Set(),
    actedSinceFullRaise: new Set(),
    lastActor: 'BB',
    lastAction: {},
    bb: setup.bb,
  };
}

/** フォールドしていない席。 */
export function activeSeats(s: State): Pos[] {
  return POSITIONS.filter((p) => !s.folded.has(p));
}

/** アクションできる席（フォールドしておらず、オールインでもない）。 */
export function canActSeats(s: State): Pos[] {
  return POSITIONS.filter((p) => !s.folded.has(p) && !s.allin.has(p));
}

/** 回収済みポットとこのストリートのベットの合計。 */
export function totalPot(s: State): Mbb {
  return s.pot + POSITIONS.reduce((sum, p) => sum + s.bets[p], 0);
}

/** 次にアクションする席（§4.1）。いなければ null。 */
export function nextActor(s: State): Pos | null {
  const order = s.street === 'pf' ? ORDER_PF : ORDER_POST;
  const start = s.lastActor === null ? 0 : order.indexOf(s.lastActor) + 1;
  for (let k = 0; k < order.length; k++) {
    const p = order[(start + k) % order.length] as Pos;
    if (s.folded.has(p) || s.allin.has(p)) continue;
    if (!s.actedThisStreet.has(p) || s.bets[p] < s.currentBet) return p;
  }
  return null;
}

export type Status =
  | { kind: 'over'; winner: Pos }
  | { kind: 'runout' }
  | { kind: 'act'; pos: Pos }
  | { kind: 'streetEnd' }
  | { kind: 'showdown' };

/** 局面の判定（§4）。この順序が重要（ランアウトの判定を次の席探索より先に行う）。 */
export function status(s: State): Status {
  const active = activeSeats(s);
  if (active.length <= 1) return { kind: 'over', winner: active[0] as Pos };
  const canAct = canActSeats(s);
  if (canAct.length === 0) return { kind: 'runout' };
  if (canAct.length === 1 && s.bets[canAct[0] as Pos] >= s.currentBet) return { kind: 'runout' };
  const p = nextActor(s);
  if (p) return { kind: 'act', pos: p };
  return s.street === 'river' ? { kind: 'showdown' } : { kind: 'streetEnd' };
}

/** 次のストリートへ進める（§4.2）。リバーの後には進めない。 */
export function advance(s: State): State {
  const next = NEXT_STREET[s.street];
  if (!next) throw new Error('リバーの後には進めない');
  return {
    ...s,
    street: next,
    pot: totalPot(s),
    bets: zeroes(),
    currentBet: 0,
    minRaise: s.bb,
    actedThisStreet: new Set(),
    actedSinceFullRaise: new Set(),
    lastActor: null,
    lastAction: {},
  };
}

export type Range = { min: Mbb; max: Mbb };

export type Legal = {
  fold: boolean;
  check: boolean;
  /** コール額（コールできなければ null）。 */
  call: Mbb | null;
  bet: Range | null;
  raise: Range | null;
};

/** 席 `p` の合法アクション（§5）。 */
export function legal(s: State, p: Pos): Legal {
  const toCall = s.currentBet - s.bets[p];
  const stack = s.stacks[p];
  const maxTo = s.bets[p] + stack;
  const othersCanAct = canActSeats(s).some((q) => q !== p);
  const reopened = !s.actedSinceFullRaise.has(p);
  const raiseRange = (): Range => ({ min: Math.min(s.currentBet + s.minRaise, maxTo), max: maxTo });

  if (toCall > 0) {
    return {
      fold: true,
      check: false,
      call: Math.min(toCall, stack),
      bet: null,
      raise: stack > toCall && othersCanAct && reopened ? raiseRange() : null,
    };
  }
  if (s.currentBet === 0) {
    return {
      fold: false,
      check: true,
      call: null,
      bet: stack > 0 && othersCanAct ? { min: Math.min(s.bb, maxTo), max: maxTo } : null,
      raise: null,
    };
  }
  return {
    fold: false,
    check: true,
    call: null,
    bet: null,
    raise: stack > 0 && othersCanAct && reopened ? raiseRange() : null,
  };
}

/**
 * アクションを適用する（§6）。`index` はエラーに添える添字。
 * 前提（手番・ストリート・合法・額）を満たさなければ ValidationError を投げる。
 */
export function apply(s: State, action: Action, index?: number): State {
  const st = status(s);
  if (st.kind !== 'act') fail('action_after_end', index);
  if (action.street !== s.street) fail('street_mismatch', index);
  const p = action.pos;
  if (p !== st.pos) fail('not_your_turn', index);

  const sized = action.type === 'bet' || action.type === 'raise';
  if (sized !== (action.to !== undefined)) fail('malformed', index, 'to の有無');

  const lg = legal(s, p);
  const stacks = { ...s.stacks };
  const bets = { ...s.bets };
  const folded = new Set(s.folded);
  const allin = new Set(s.allin);
  let actedSinceFullRaise = new Set(s.actedSinceFullRaise);
  let { currentBet, minRaise } = s;

  switch (action.type) {
    case 'fold':
      if (!lg.fold) fail('illegal_action', index);
      folded.add(p);
      break;
    case 'check':
      if (!lg.check) fail('illegal_action', index);
      break;
    case 'call': {
      if (lg.call === null) fail('illegal_action', index);
      stacks[p] -= lg.call;
      bets[p] += lg.call;
      break;
    }
    case 'bet':
    case 'raise': {
      const range = action.type === 'bet' ? lg.bet : lg.raise;
      if (!range) fail('illegal_action', index);
      const to = action.to as Mbb;
      if (!Number.isInteger(to) || to < range.min || to > range.max) fail('amount_out_of_range', index);
      stacks[p] -= to - bets[p];
      bets[p] = to;
      const size = to - currentBet;
      if (size >= minRaise) {
        // 有効なレイズ: 最小レイズ幅を更新し、アクションを再オープンする
        minRaise = size;
        actedSinceFullRaise = new Set();
      }
      // 不完全レイズ（オールイン時のみ）は minRaise も再オープンも変えない
      currentBet = to;
      break;
    }
  }

  if (action.type !== 'fold' && stacks[p] === 0) allin.add(p);
  const actedThisStreet = new Set(s.actedThisStreet);
  actedThisStreet.add(p);
  actedSinceFullRaise.add(p);

  return {
    ...s,
    stacks,
    bets,
    folded,
    allin,
    currentBet,
    minRaise,
    actedThisStreet,
    actedSinceFullRaise,
    lastActor: p,
    lastAction: { ...s.lastAction, [p]: action },
  };
}
