import {
  BOARD_COUNT,
  formatBb,
  POSITIONS,
  runActions,
  stopState,
  type Action,
  type HandSetup,
  type Mbb,
  type Pos,
  type State,
  type Street,
} from '@wwyd/core';
import { ACTION_NAME } from '../post/draft.ts';

/**
 * リプレイの表示（詳細仕様 06 章 §4.3）。卓は Hero の席を手前（下中央）に、以降は時計回り
 * （アクションの順。UTG → HJ → … → BB）に並べる。
 */

/** 回答画面の各手目の状態。`frames[i]` は i 手目まで適用した状態、最後（停止位置）は Hero の手番まで進めた状態。 */
export function answerFrames(setup: HandSetup, actions: readonly Action[], stopIndex: number, street: Street): State[] {
  const frames = runActions(setup, actions.slice(0, stopIndex));
  frames[stopIndex] = stopState(setup, actions, stopIndex, street);
  return frames;
}

/** i 手目の状態で次にアクションする席（停止位置は Hero の手番）。 */
export function actorAt(actions: readonly Action[], step: number, stopIndex: number, hero: Pos): Pos {
  return step < stopIndex ? (actions[step] as Action).pos : hero;
}

/** その状態で見えているボードの枚数。 */
export function boardCountOf(s: State): number {
  return BOARD_COUNT[s.street];
}

/** 手前（下中央）の席から時計回りの席の並び。`seated` は座っている席（空席は卓に出さない。既定は 6 席） */
export function seatOrder(bottom: Pos, seated: readonly Pos[] = POSITIONS): Pos[] {
  const i = seated.indexOf(bottom);
  return seated.map((_, k) => seated[(i + k) % seated.length] as Pos);
}

export type SeatView = {
  pos: Pos;
  stack: Mbb;
  /** このストリートに出した額（0 ならチップを出さない）。 */
  bet: Mbb;
  folded: boolean;
  /** 直前のアクション（このストリート）。フォールド済みの席は「フォールド」。 */
  last: string | null;
  hero: boolean;
  /** 回答者（あなた）の席。回答画面では Hero の席（2026-09-29。Villain の概念は無い） */
  you: boolean;
  acting: boolean;
};

/** 直前のアクションの表示（「レイズ 2.5」「コール」「オールイン」）。 */
export function lastActionText(s: State, p: Pos): string | null {
  const a = s.lastAction[p];
  if (!a) return s.folded.has(p) ? ACTION_NAME.fold : null;
  if (a.type !== 'fold' && s.stacks[p] === 0) return 'All-in';
  return a.to === undefined ? ACTION_NAME[a.type] : `${ACTION_NAME[a.type]} ${formatBb(a.to)}`;
}

/** 手前に置く席は Hero。`you` なら Hero の席を回答者の席として強調する（回答画面） */
export function seatViews(s: State, o: { hero: Pos; actor: Pos | null; you?: boolean }): SeatView[] {
  return seatOrder(o.hero, s.seated).map((pos) => ({
    pos,
    stack: s.stacks[pos],
    // フォールドした席のベットも回収まではその席の前に残す（ポットは回収済みの額を出すため、消すと額が合わない）
    bet: s.bets[pos],
    folded: s.folded.has(pos),
    last: lastActionText(s, pos),
    hero: pos === o.hero,
    you: o.you === true && pos === o.hero,
    acting: pos === o.actor,
  }));
}
