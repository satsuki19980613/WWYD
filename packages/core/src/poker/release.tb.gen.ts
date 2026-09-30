/**
 * リリース前の総合テスト（観点 B）の試験用の部品。本番のコードからは使わない。
 *
 * - `Rng`: 種を決めた擬似乱数（mulberry32。依存を足さない）。
 * - `Oracle`: core（`state.ts`）とは別の考え方で書いた、ベッティングの参照実装。
 *   core は「そのストリートでアクション済みの席の集合」と「有効なレイズ以降にアクションした席の集合」で手番を決めるが、
 *   こちらは「これから手番が回る席の待ち行列」と「有効なレイズの回数の数え上げ」で決める。
 *   ルールの出どころは 04 章（仕様書 §6）で同じだが、状態の持ち方が違うので、実装の取り違えを見つけられる。
 * - `playRandomHand`: 合法手からランダムに選んで最後まで進め、そのつど core と Oracle を突き合わせる。
 */
import { POSITIONS, PLAYER_COUNTS, SEATS_BY_COUNT, type Pos, type PlayerCount, type Street } from '../constants.ts';
import type { Card } from '../cards.ts';
import { ValidationError } from '../errors.ts';
import { MAX_STACK_MBB, type Mbb } from '../money.ts';
import { replay } from './replay.ts';
import { advance, apply, initialState, legal, status, type Action, type ActionType, type HandSetup, type State } from './state.ts';

// ---- 擬似乱数 ----

export class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  /** [0, 1) */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** lo 以上 hi 以下の整数 */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(0, xs.length - 1)] as T;
  }
  shuffle<T>(xs: readonly T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }
}

const ALL_CARDS: Card[] = [];
for (const r of 'AKQJT98765432') for (const s of 'shdc') ALL_CARDS.push(r + s);

export function randomCards(rng: Rng, n: number, exclude: readonly Card[] = []): Card[] {
  const ex = new Set(exclude);
  return rng.shuffle(ALL_CARDS.filter((c) => !ex.has(c))).slice(0, n);
}

// ---- 設定のランダム生成 ----

/** スタック（mbb）。短いもの・普通・深いもの・小数第 3 位まで・上限ちょうどを混ぜる */
export function randomStack(rng: Rng): Mbb {
  const r = rng.next();
  if (r < 0.1) return rng.int(1, 900); // 0.001〜0.9bb
  if (r < 0.3) return rng.int(1, 8) * 500; // 0.5 / 1 / … / 4bb（ブラインド・アンティと同額になりやすい）
  if (r < 0.5) return rng.int(1000, 15000); // 1〜15bb（ミリ単位）
  if (r < 0.8) return rng.int(1, 40) * 1000 + (rng.chance(0.3) ? rng.int(0, 999) : 0); // 〜40bb
  if (r < 0.97) return rng.int(1, 200) * 1000 + (rng.chance(0.3) ? rng.int(0, 999) : 0); // 〜200bb
  if (r < 0.985) return MAX_STACK_MBB;
  return rng.int(1000, MAX_STACK_MBB);
}

export function randomSetup(rng: Rng, players?: PlayerCount): HandSetup {
  const n = players ?? rng.pick(PLAYER_COUNTS);
  const seats = SEATS_BY_COUNT[n];
  const stacks = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 } as Record<Pos, Mbb>;
  const common = rng.chance(0.25) ? randomStack(rng) : null;
  for (const p of seats) stacks[p] = common !== null && rng.chance(0.7) ? common : randomStack(rng);
  const sb = rng.chance(0.6) ? 500 : rng.chance(0.5) ? rng.int(1, 1000) : rng.pick([1000, 250, 100, 1]);
  const ante = rng.chance(0.5) ? 0 : rng.chance(0.5) ? rng.pick([125, 100, 1000, 500, 1]) : rng.int(0, 1500);
  return { sb, bb: 1000, ante, stacks };
}

// ---- 参照実装（Oracle） ----

type OPlayer = { seated: boolean; stack: number; bet: number; folded: boolean; allin: boolean; acted: boolean; seen: number };

export type OLegal = {
  fold: boolean;
  check: boolean;
  call: number | null;
  bet: { min: number; max: number } | null;
  raise: { min: number; max: number } | null;
};

const ORDER_PF: readonly Pos[] = POSITIONS;
const ORDER_POST: readonly Pos[] = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
const NEXT: Record<Street, Street | null> = { pf: 'flop', flop: 'turn', turn: 'river', river: null };

export type OStatus = { kind: 'over' | 'runout' | 'streetEnd' | 'showdown' } | { kind: 'act'; pos: Pos };

export class Oracle {
  readonly p: Record<Pos, OPlayer>;
  street: Street = 'pf';
  pot = 0;
  cur: number;
  minRaise: number;
  /** このストリートの有効なレイズ（最初のベットを含む）の回数 */
  fullRaises = 0;
  /** これから手番が回る席（先頭が今の手番） */
  pending: Pos[] = [];
  readonly bb: number;

  constructor(setup: HandSetup) {
    this.bb = setup.bb;
    this.p = {} as Record<Pos, OPlayer>;
    for (const pos of POSITIONS) {
      this.p[pos] = { seated: setup.stacks[pos] > 0, stack: setup.stacks[pos], bet: 0, folded: false, allin: false, acted: false, seen: -1 };
    }
    const seated = POSITIONS.filter((pos) => this.p[pos].seated);
    for (const pos of seated) {
      const pl = this.p[pos];
      const a = Math.min(setup.ante, pl.stack);
      pl.stack -= a;
      this.pot += a;
      if (pl.stack === 0) pl.allin = true;
    }
    const sbSeat: Pos = this.p.SB.seated ? 'SB' : 'BTN';
    const post = (pos: Pos, blind: number): void => {
      const pl = this.p[pos];
      const b = Math.min(blind, pl.stack);
      pl.stack -= b;
      pl.bet = b;
      if (pl.stack === 0) pl.allin = true;
    };
    post(sbSeat, setup.sb);
    post('BB', setup.bb);
    this.cur = setup.bb;
    this.minRaise = setup.bb;
    this.startRound();
  }

  private order(): readonly Pos[] {
    return this.street === 'pf' ? ORDER_PF : ORDER_POST;
  }
  private alive(pos: Pos): boolean {
    const pl = this.p[pos];
    return pl.seated && !pl.folded;
  }
  private canAct(pos: Pos): boolean {
    return this.alive(pos) && !this.p[pos].allin;
  }
  canActList(): Pos[] {
    return this.order().filter((pos) => this.canAct(pos));
  }
  activeList(): Pos[] {
    return POSITIONS.filter((pos) => this.alive(pos));
  }

  private startRound(): void {
    this.fullRaises = 0;
    for (const pos of POSITIONS) {
      this.p[pos].acted = false;
      this.p[pos].seen = -1;
    }
    const can = this.canActList();
    const only = can.length === 1 ? (can[0] as Pos) : null;
    if (can.length === 0 || (only !== null && this.p[only].bet >= this.cur)) this.pending = [];
    else this.pending = can;
  }

  status(): OStatus {
    const active = this.activeList();
    if (active.length <= 1) return { kind: 'over' };
    const can = this.canActList();
    if (can.length === 0) return { kind: 'runout' };
    if (can.length === 1 && this.p[can[0] as Pos].bet >= this.cur) return { kind: 'runout' };
    if (this.pending.length > 0) return { kind: 'act', pos: this.pending[0] as Pos };
    return { kind: this.street === 'river' ? 'showdown' : 'streetEnd' };
  }

  winner(): Pos {
    return this.activeList()[0] as Pos;
  }

  advance(): void {
    const nx = NEXT[this.street];
    if (!nx) throw new Error('oracle: river の後には進めない');
    for (const pos of POSITIONS) {
      this.pot += this.p[pos].bet;
      this.p[pos].bet = 0;
    }
    this.street = nx;
    this.cur = 0;
    this.minRaise = this.bb;
    this.startRound();
  }

  totalBets(): number {
    return POSITIONS.reduce((s, pos) => s + this.p[pos].bet, 0);
  }

  legal(pos: Pos): OLegal {
    const pl = this.p[pos];
    const toCall = this.cur - pl.bet;
    const maxTo = pl.bet + pl.stack;
    const others = this.canActList().filter((q) => q !== pos).length > 0;
    const mayRaise = !pl.acted || this.fullRaises > pl.seen;
    if (toCall > 0) {
      return {
        fold: true,
        check: false,
        call: Math.min(toCall, pl.stack),
        bet: null,
        raise: pl.stack > toCall && others && mayRaise ? { min: Math.min(this.cur + this.minRaise, maxTo), max: maxTo } : null,
      };
    }
    if (this.cur === 0) {
      return { fold: false, check: true, call: null, bet: pl.stack > 0 && others ? { min: Math.min(this.bb, maxTo), max: maxTo } : null, raise: null };
    }
    return {
      fold: false,
      check: true,
      call: null,
      bet: null,
      raise: pl.stack > 0 && others && mayRaise ? { min: Math.min(this.cur + this.minRaise, maxTo), max: maxTo } : null,
    };
  }

  /** ポットの基準（04 章 §9）: 回収済み＋このストリートのベット＋手番の席のコール額 */
  potBase(pos: Pos): number {
    const pl = this.p[pos];
    const toCall = this.cur - pl.bet;
    return this.pot + this.totalBets() + (toCall > 0 ? Math.min(toCall, pl.stack) : 0);
  }

  apply(a: Action): void {
    const st = this.status();
    if (st.kind !== 'act' || st.pos !== a.pos) throw new Error('oracle: 手番でない');
    const pl = this.p[a.pos];
    if (a.type === 'fold') pl.folded = true;
    else if (a.type === 'call') {
      const amt = Math.min(this.cur - pl.bet, pl.stack);
      pl.stack -= amt;
      pl.bet += amt;
    } else if (a.type === 'bet' || a.type === 'raise') {
      const to = a.to as number;
      const size = to - this.cur;
      pl.stack -= to - pl.bet;
      pl.bet = to;
      if (size >= this.minRaise) {
        this.minRaise = size;
        this.fullRaises++;
      }
      this.cur = to;
    }
    if (a.type !== 'fold' && pl.stack === 0) pl.allin = true;
    pl.acted = true;
    pl.seen = this.fullRaises;
    if (a.type === 'bet' || a.type === 'raise') {
      const ord = this.order();
      const i = ord.indexOf(a.pos);
      const next: Pos[] = [];
      for (let k = 1; k < ord.length; k++) {
        const q = ord[(i + k) % ord.length] as Pos;
        if (this.canAct(q)) next.push(q);
      }
      this.pending = next;
    } else {
      this.pending = this.pending.filter((q) => q !== a.pos);
    }
  }
}

// ---- ランダムなハンドの進行 ----

/** 手番ごとの記録（Spot の派生メタの参照値） */
export type Snapshot = {
  index: number;
  pos: Pos;
  street: Street;
  legal: OLegal;
  potBase: number;
  /** その時点でフォールドしていない Hero 以外の席（人数の多い順ではなく席順） */
  othersAlive: Pos[];
};

export type Played = {
  setup: HandSetup;
  actions: Action[];
  snapshots: Snapshot[];
  end: 'over' | 'showdown' | 'runout';
  /** core の `replay` が返す、必要なボードの枚数 */
  boardCount: number;
  /** ハンド終了時のオールインなどの統計（試験の網羅の確認用） */
  stats: { incompleteRaise: number; allinActions: number; reopenBlocked: number; streets: number };
};

function fmtState(s: State): string {
  return JSON.stringify({ street: s.street, pot: s.pot, bets: s.bets, stacks: s.stacks, cur: s.currentBet, minRaise: s.minRaise, folded: [...s.folded], allin: [...s.allin] });
}

/** core の State と Oracle が一致しているか。違えば説明を返す */
export function diffState(s: State, o: Oracle): string | null {
  if (s.street !== o.street) return `street ${s.street} != ${o.street}`;
  if (s.pot !== o.pot) return `pot ${s.pot} != ${o.pot}`;
  if (s.currentBet !== o.cur) return `currentBet ${s.currentBet} != ${o.cur}`;
  if (s.minRaise !== o.minRaise) return `minRaise ${s.minRaise} != ${o.minRaise}`;
  for (const pos of POSITIONS) {
    const q = o.p[pos];
    if (!q.seated) {
      if (s.stacks[pos] !== 0 || s.bets[pos] !== 0) return `空席 ${pos} に額`;
      continue;
    }
    if (s.stacks[pos] !== q.stack) return `${pos} stack ${s.stacks[pos]} != ${q.stack}`;
    if (s.bets[pos] !== q.bet) return `${pos} bet ${s.bets[pos]} != ${q.bet}`;
    if (s.folded.has(pos) !== q.folded) return `${pos} folded ${s.folded.has(pos)} != ${q.folded}`;
    if (s.allin.has(pos) !== q.allin) return `${pos} allin ${s.allin.has(pos)} != ${q.allin}`;
    if (q.stack < 0 || q.bet < 0) return `${pos} 負の額`;
  }
  return null;
}

function diffLegal(a: ReturnType<typeof legal>, b: OLegal): string | null {
  const rng = (x: { min: number; max: number } | null): string => (x ? `${x.min}-${x.max}` : '-');
  if (a.fold !== b.fold) return `fold ${a.fold} != ${b.fold}`;
  if (a.check !== b.check) return `check ${a.check} != ${b.check}`;
  if (a.call !== b.call) return `call ${a.call} != ${b.call}`;
  if (rng(a.bet) !== rng(b.bet)) return `bet ${rng(a.bet)} != ${rng(b.bet)}`;
  if (rng(a.raise) !== rng(b.raise)) return `raise ${rng(a.raise)} != ${rng(b.raise)}`;
  return null;
}

function chooseAmount(rng: Rng, r: { min: number; max: number }, allinP: number): number {
  const x = rng.next();
  if (r.min === r.max || x < 0.12) return r.min;
  if (x < 0.12 + allinP) return r.max;
  if (x < 0.36) return Math.min(r.max, r.min + 1);
  if (x < 0.42) return Math.max(r.min, r.max - 1);
  if (x < 0.6) return Math.min(r.max, Math.max(r.min, Math.round((r.min + (r.max - r.min) * rng.next()) / 10) * 10));
  return rng.int(r.min, r.max);
}

export type PlayOpts = {
  /** Preflop の Fold の割合を増やして Flop 以降に進みやすくする（既定 0.12） */
  pfFold?: number;
  /** 手数の上限（無限ループの保険） */
  maxActions?: number;
  /** 額を選ぶときに All-in（max）を選ぶ確率（既定 0.18）。小さくするとショーダウンまで進みやすい */
  allinP?: number;
  /** 各手番で、範囲外・不合法な入力を apply が断るかも確かめる */
  probeRejects?: boolean;
};

export class MismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MismatchError';
  }
}

/**
 * ランダムなハンドを最後まで進める。各手番で core と Oracle の状態・合法手・判定が一致しているかを確かめ、
 * 違えば `MismatchError`（何手目・何が違うか）を投げる。
 */
export function playRandomHand(rng: Rng, setup: HandSetup, opts: PlayOpts = {}): Played {
  const pfFold = opts.pfFold ?? 0.12;
  const maxActions = opts.maxActions ?? 300;
  const allinP = opts.allinP ?? 0.18;
  let s = initialState(setup);
  const o = new Oracle(setup);
  const actions: Action[] = [];
  const snapshots: Snapshot[] = [];
  const stats = { incompleteRaise: 0, allinActions: 0, reopenBlocked: 0, streets: 0 };
  const fail = (msg: string): never => {
    throw new MismatchError(`${msg} @手数${actions.length} core=${fmtState(s)}`);
  };
  let d = diffState(s, o);
  if (d) fail(`初期状態 ${d}`);

  for (;;) {
    const st = status(s);
    const ost = o.status();
    if (st.kind !== ost.kind) fail(`status ${st.kind} != ${ost.kind}`);
    if (st.kind === 'over') {
      if (st.winner !== o.winner()) fail(`winner ${st.winner} != ${o.winner()}`);
      break;
    }
    if (st.kind === 'runout' || st.kind === 'showdown') break;
    if (st.kind === 'streetEnd') {
      s = advance(s);
      o.advance();
      stats.streets++;
      d = diffState(s, o);
      if (d) fail(`advance 後 ${d}`);
      continue;
    }
    // act
    if (ost.kind !== 'act' || ost.pos !== st.pos) fail(`手番 ${st.pos} != ${ost.kind === 'act' ? ost.pos : ost.kind}`);
    const pos = st.pos;
    const lg = legal(s, pos);
    const olg = o.legal(pos);
    d = diffLegal(lg, olg);
    if (d) fail(`legal(${pos}) ${d}`);
    if (actions.length >= maxActions) fail('手数の上限');

    snapshots.push({
      index: actions.length,
      pos,
      street: s.street,
      legal: olg,
      potBase: o.potBase(pos),
      othersAlive: POSITIONS.filter((q) => q !== pos && o.p[q].seated && !o.p[q].folded),
    });

    // 再オープンできない席の数（不完全レイズの試験がどれだけ当たったかの統計）
    if (olg.call !== null && olg.raise === null && o.p[pos].stack > o.cur - o.p[pos].bet && o.canActList().some((q) => q !== pos)) stats.reopenBlocked++;

    // 選ぶ
    const options: ActionType[] = [];
    const weights: number[] = [];
    const add = (t: ActionType, w: number): void => {
      options.push(t);
      weights.push(w);
    };
    if (olg.fold) add('fold', s.street === 'pf' ? pfFold * 3 : 0.22);
    if (olg.check) add('check', 0.5);
    if (olg.call !== null) add('call', 0.5);
    if (olg.bet) add('bet', 0.3);
    if (olg.raise) add('raise', 0.25);
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rng.next() * total;
    let type = options[options.length - 1] as ActionType;
    for (let i = 0; i < options.length; i++) {
      x -= weights[i] as number;
      if (x < 0) {
        type = options[i] as ActionType;
        break;
      }
    }
    const action: Action = { street: s.street, pos, type };
    if (type === 'bet' || type === 'raise') {
      const r = (type === 'bet' ? olg.bet : olg.raise) as { min: number; max: number };
      action.to = chooseAmount(rng, r, allinP);
      const size = action.to - o.cur;
      if (size < o.minRaise) stats.incompleteRaise++;
      if (action.to === r.max) stats.allinActions++;
    } else if (type === 'call' && olg.call !== null && olg.call === o.p[pos].stack) stats.allinActions++;

    if (opts.probeRejects) probeRejects(s, pos, olg, action);

    let next: State;
    try {
      next = apply(s, action, actions.length);
    } catch (e) {
      return fail(`合法手 ${JSON.stringify(action)} を core が断った: ${e instanceof Error ? e.message : String(e)}`);
    }
    o.apply(action);
    actions.push(action);
    s = next;
    d = diffState(s, o);
    if (d) fail(`apply(${JSON.stringify(action)}) 後 ${d}`);
    // 保存則: 残りスタック＋回収済み＋ベットの合計は開始時のスタックの合計から変わらない
    const chips = POSITIONS.reduce((sum, q) => sum + s.stacks[q] + s.bets[q], 0) + s.pot;
    const start = POSITIONS.reduce((sum, q) => sum + setup.stacks[q], 0);
    if (chips !== start) fail(`チップの保存則 ${chips} != ${start}`);
  }

  const end = status(s).kind as 'over' | 'showdown' | 'runout';
  // 最後まで通した再生（replay）も、同じ結論になること
  const fin = status(s);
  let boardCount: number;
  if (fin.kind === 'over') boardCount = { pf: 0, flop: 3, turn: 4, river: 5 }[s.street];
  else boardCount = 5;
  let r;
  try {
    r = replay(setup, actions, boardCount);
  } catch (e) {
    return fail(`replay が失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (r.boardCount !== boardCount) fail(`boardCount ${r.boardCount} != ${boardCount}`);
  if (r.result.kind === 'over' ? end !== 'over' : end === 'over') fail('replay の結果の種類が違う');
  return { setup, actions, snapshots, end, boardCount, stats };
}

/** 不合法な入力を apply が断ること（04 章 §6・§10.2/10.3 の期待） */
function probeRejects(s: State, pos: Pos, olg: OLegal, chosen: Action): void {
  const expectCode = (a: Action, code: string): void => {
    try {
      apply(s, a, 7);
    } catch (e) {
      if (e instanceof ValidationError && e.code === code) return;
      throw new MismatchError(`apply(${JSON.stringify(a)}) が ${code} でなく ${e instanceof Error ? e.message : String(e)}`);
    }
    throw new MismatchError(`apply(${JSON.stringify(a)}) が断られなかった（期待 ${code}）`);
  };
  const base = { street: s.street, pos };
  if (!olg.fold) expectCode({ ...base, type: 'fold' }, 'illegal_action');
  if (!olg.check) expectCode({ ...base, type: 'check' }, 'illegal_action');
  if (olg.call === null) expectCode({ ...base, type: 'call' }, 'illegal_action');
  if (!olg.bet) expectCode({ ...base, type: 'bet', to: (olg.raise?.min ?? s.currentBet + 1000) }, 'illegal_action');
  if (!olg.raise) expectCode({ ...base, type: 'raise', to: (olg.bet?.min ?? s.currentBet + 1000) }, 'illegal_action');
  for (const [t, r] of [['bet', olg.bet], ['raise', olg.raise]] as const) {
    if (!r) continue;
    expectCode({ ...base, type: t, to: r.max + 1 }, 'amount_out_of_range');
    expectCode({ ...base, type: t, to: r.min - 1 }, 'amount_out_of_range');
    expectCode({ ...base, type: t, to: r.min + 0.5 }, 'amount_out_of_range');
    expectCode({ ...base, type: t, to: Number.NaN }, 'amount_out_of_range');
  }
  // 手番でない席・ストリートの違い・to の有無
  const other = POSITIONS.find((q) => q !== pos && s.seated.includes(q));
  if (other) expectCode({ street: s.street, pos: other, type: 'fold' }, 'not_your_turn');
  expectCode({ street: s.street === 'pf' ? 'flop' : 'pf', pos, type: chosen.type, ...(chosen.to === undefined ? {} : { to: chosen.to }) }, 'street_mismatch');
  expectCode({ ...base, type: 'fold', to: 1000 }, 'malformed');
  expectCode({ ...base, type: 'raise' }, 'malformed');
}
