/**
 * スポットの候補・停止位置・派生メタ（詳細仕様 04 章 §8）と % pot（§9）。
 */
import type { AnswerKey, Pos, Street } from '../constants.ts';
import { fail } from '../errors.ts';
import type { Mbb } from '../money.ts';
import { runActions } from './replay.ts';
import { advance, legal, status, type Action, type HandSetup, type State } from './state.ts';

export type SpotCandidate = {
  /** 出題する Hero のアクションの添字。 */
  index: number;
  /** Villain に選べる席（区間に現れた順・重複なし。フォールドした席も含む）。 */
  villains: Pos[];
};

/** 区間 S(i) の終わり（含まない）: 次に Hero がアクションする添字、無ければ末尾。 */
function segmentEnd(actions: readonly Action[], hero: Pos, i: number): number {
  for (let j = i + 1; j < actions.length; j++) if ((actions[j] as Action).pos === hero) return j;
  return actions.length;
}

/** スポットの候補（§8.1）。Hero のフォールドと、後続のアクションが無いものは候補外。 */
export function spotCandidates(actions: readonly Action[], hero: Pos): SpotCandidate[] {
  const out: SpotCandidate[] = [];
  actions.forEach((a, i) => {
    if (a.pos !== hero || a.type === 'fold') return;
    const villains: Pos[] = [];
    for (let j = i + 1; j < segmentEnd(actions, hero, i); j++) {
      const p = (actions[j] as Action).pos;
      if (!villains.includes(p)) villains.push(p);
    }
    if (villains.length > 0) out.push({ index: i, villains });
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
  /** 停止位置の状態（Villain の手番。ストリートをまたぐ場合は advance 済み）。 */
  state: State;
  /** Villain の実際のアクションのキー。 */
  actual: AnswerKey;
};

/** アクション種別 → 回答のキー。 */
export function answerKeyOf(type: Action['type']): AnswerKey {
  return type === 'bet' || type === 'raise' ? 's1' : type;
}

/** ポットの基準（§9）: 回収済み＋このストリートのベット＋Villain のコール額。 */
export function potBaseOf(s: State, villain: Pos): Mbb {
  const toCall = s.currentBet - s.bets[villain];
  const call = toCall > 0 ? Math.min(toCall, s.stacks[villain]) : 0;
  return s.pot + Object.values(s.bets).reduce((a, b) => a + b, 0) + call;
}

/**
 * スポット（Hero のアクション `spotIndex` と Villain）の停止位置と派生メタ（§8.2）。
 * 候補でなければ `invalid_spot`、Villain が候補の席でなければ `invalid_villain`。
 */
export function spotView(
  setup: HandSetup,
  actions: readonly Action[],
  hero: Pos,
  spotIndex: number,
  villain: Pos,
): SpotView {
  const cand = spotCandidates(actions, hero).find((c) => c.index === spotIndex);
  if (!cand) fail('invalid_spot');
  if (!cand.villains.includes(villain)) fail('invalid_villain');

  let stop = spotIndex + 1;
  while ((actions[stop] as Action).pos !== villain) stop++;
  const stopAction = actions[stop] as Action;

  const s = stopState(setup, actions, stop, stopAction.street);

  const lg = legal(s, villain);
  const toCall = s.currentBet - s.bets[villain];
  const keys: AnswerKey[] = toCall > 0 ? ['fold', 'call'] : ['check'];
  const s1 = lg.bet ?? lg.raise;
  if (s1) keys.push('s1');

  return {
    derived: {
      street: stopAction.street,
      keys,
      s1Label: s1 ? (s.currentBet === 0 ? 'bet' : 'raise') : null,
      minTo: s1 ? s1.min : null,
      maxTo: s1 ? s1.max : null,
      potBase: potBaseOf(s, villain),
      effectiveStack: Math.min(setup.stacks[hero], setup.stacks[villain]),
      stopIndex: stop,
    },
    state: s,
    actual: answerKeyOf(stopAction.type),
  };
}

/**
 * 停止位置の状態（Villain の手番）。アクション `0..stopIndex-1` を適用し、ストリートをまたぐ場合は
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
