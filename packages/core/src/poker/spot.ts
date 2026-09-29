/**
 * スポットの候補・停止位置・派生メタ（詳細仕様 04 章 §8）と % pot（§9）。
 */
import type { AnswerKey, Pos, Street } from '../constants.ts';
import { fail } from '../errors.ts';
import type { Mbb } from '../money.ts';
import { runActions } from './replay.ts';
import { advance, legal, status, type Action, type HandSetup, type State } from './state.ts';

export type SpotCandidate = {
  /** 出題する Hero の手番（Hero のアクションの添字。回答者はこのアクションの直前の局面で Hero の席から答える）。 */
  index: number;
};

/**
 * スポットの候補（§8.1。2026-09-29 さつき）: Hero の**フロップ以降**のアクションすべて（プリフロップは出題しない）。
 * スポットは Hero の手番そのもので、回答者は Hero の席に座って答える（Villain の概念は無い）。
 * Hero のフォールド・ハンドの最後のアクションも候補（後続のアクションは要らない）。
 */
export function spotCandidates(actions: readonly Action[], hero: Pos): SpotCandidate[] {
  const out: SpotCandidate[] = [];
  actions.forEach((a, i) => {
    if (a.pos === hero && a.street !== 'pf') out.push({ index: i });
  });
  return out;
}

export type Derived = {
  street: Street;
  keys: AnswerKey[];
  s1Label: 'bet' | 'raise' | null;
  minTo: Mbb | null;
  maxTo: Mbb | null;
  potBase: Mbb;
  effectiveStack: Mbb;
  stopIndex: number;
};

export type SpotView = {
  derived: Derived;
  /** 停止位置の状態（Hero の手番。ストリートをまたぐ場合は advance 済み）。 */
  state: State;
  /** Hero の実際のアクションのキー（答え合わせ）。 */
  actual: AnswerKey;
};

/** アクション種別 → 回答のキー。 */
export function answerKeyOf(type: Action['type']): AnswerKey {
  return type === 'bet' || type === 'raise' ? 's1' : type;
}

/** ポットの基準（§9）: 回収済み＋このストリートのベット＋手番の席のコール額。 */
export function potBaseOf(s: State, actor: Pos): Mbb {
  const toCall = s.currentBet - s.bets[actor];
  const call = toCall > 0 ? Math.min(toCall, s.stacks[actor]) : 0;
  return s.pot + Object.values(s.bets).reduce((a, b) => a + b, 0) + call;
}

/**
 * スポット（Hero の手番 `spotIndex`）の停止位置と派生メタ（§8.2）。停止位置はスポットそのもの（Hero が
 * アクションする直前）。合法キー・サイズ・ポットの基準は Hero の手番で求める。
 * 実効スタックは、Hero と、その時点でハンドに残っている相手のうち最も深い席の、開始時のスタックの小さい方。
 * 候補でなければ `invalid_spot`。
 */
export function spotView(setup: HandSetup, actions: readonly Action[], hero: Pos, spotIndex: number): SpotView {
  if (!spotCandidates(actions, hero).some((c) => c.index === spotIndex)) fail('invalid_spot');
  const spotAction = actions[spotIndex] as Action;
  const s = stopState(setup, actions, spotIndex, spotAction.street);

  const lg = legal(s, hero);
  const toCall = s.currentBet - s.bets[hero];
  const keys: AnswerKey[] = toCall > 0 ? ['fold', 'call'] : ['check'];
  const s1 = lg.bet ?? lg.raise;
  if (s1) keys.push('s1');

  const deepest = Math.max(...s.seated.filter((p) => p !== hero && !s.folded.has(p)).map((p) => setup.stacks[p]));

  return {
    derived: {
      street: spotAction.street,
      keys,
      s1Label: s1 ? (s.currentBet === 0 ? 'bet' : 'raise') : null,
      minTo: s1 ? s1.min : null,
      maxTo: s1 ? s1.max : null,
      potBase: potBaseOf(s, hero),
      effectiveStack: Math.min(setup.stacks[hero], deepest),
      stopIndex: spotIndex,
    },
    state: s,
    actual: answerKeyOf(spotAction.type),
  };
}

/**
 * 停止位置の状態（Hero の手番）。アクション `0..stopIndex-1` を適用し、ストリートをまたぐ場合は
 * スポットのストリート `street` まで advance する。
 * 回答画面では、未回答者に返るアクション列が停止位置までに切り詰められている（02 章 §4.3）ので、
 * 停止位置のアクションそのものは見ずに、投稿の `street` で到達先を決める。
 */
export function stopState(setup: HandSetup, actions: readonly Action[], stopIndex: number, street: Street): State {
  const states = runActions(setup, actions.slice(0, stopIndex));
  let s = states[states.length - 1] as State;
  while (s.street !== street && status(s).kind === 'streetEnd') s = advance(s);
  return s;
}

/** % pot のプリセット（§9）。初期値は 50%。 */
export const PCT_PRESETS = [33, 50, 75, 125] as const;
export const PCT_DEFAULT = 50;

/**
 * % pot から to を求める（§9）。厳密な有理数で計算して 0.01bb（10mbb）単位に四捨五入し、`[minTo, maxTo]` に収める。
 * bet（currentBet = 0）は `potBase × p`、raise は `currentBet + potBase × p`。
 */
export function sizeFromPct(currentBet: Mbb, potBase: Mbb, pct: number, minTo: Mbb, maxTo: Mbb): Mbb {
  const num = currentBet * 100 + potBase * pct; // mbb × %
  const to = Math.floor((num + 500) / 1000) * 10;
  return Math.min(Math.max(to, minTo), maxTo);
}

/** to から % pot を逆算して表示する（整数に四捨五入）。`to = maxTo` は `'allin'`。 */
export function pctFromSize(currentBet: Mbb, potBase: Mbb, to: Mbb, maxTo: Mbb): number | 'allin' {
  if (to === maxTo) return 'allin';
  return Math.round(((to - currentBet) / potBase) * 100);
}
