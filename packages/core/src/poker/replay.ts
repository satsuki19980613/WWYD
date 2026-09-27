/**
 * ハンドの再生（詳細仕様 04 章 §7）。
 */
import type { Pos } from '../constants.ts';
import { fail } from '../errors.ts';
import { activeSeats, advance, apply, BOARD_COUNT, initialState, status, type Action, type HandSetup, type State } from './state.ts';

/**
 * アクション列を順に適用する（完了の検査はしない）。スポット投稿画面の入力途中の状態にも使う。
 * `streetEnd` の間は次のアクションの前に `advance` する。
 * 戻り値の `states[0]` は初期状態、`states[i + 1]` はアクション `i` を適用した直後の状態。
 */
export function runActions(setup: HandSetup, actions: readonly Action[]): State[] {
  const states: State[] = [initialState(setup)];
  let s = states[0] as State;
  actions.forEach((action, i) => {
    while (status(s).kind === 'streetEnd') s = advance(s);
    s = apply(s, action, i);
    states.push(s);
  });
  return states;
}

export type HandResult = { kind: 'over'; winner: Pos } | { kind: 'showdown'; seats: Pos[] };

export type Replay = {
  states: State[];
  final: State;
  result: HandResult;
  /** 必要なボードの枚数。 */
  boardCount: number;
};

/**
 * 最後まで入力されたハンドを再生し、完了とボードの枚数を検査する。
 * - 最終状態が `over` / `showdown` / `runout` でなければ `hand_incomplete`
 * - ボードの枚数が最後に到達したストリート（ランアウトなら 5 枚）と違えば `board_mismatch`
 */
export function replay(setup: HandSetup, actions: readonly Action[], boardLength: number): Replay {
  const states = runActions(setup, actions);
  const final = states[states.length - 1] as State;
  const st = status(final);
  let result: HandResult;
  let boardCount: number;
  switch (st.kind) {
    case 'over':
      result = { kind: 'over', winner: st.winner };
      boardCount = BOARD_COUNT[final.street];
      break;
    case 'showdown':
    case 'runout':
      result = { kind: 'showdown', seats: activeSeats(final) };
      boardCount = 5;
      break;
    default:
      return fail('hand_incomplete');
  }
  if (boardLength !== boardCount) fail('board_mismatch');
  return { states, final, result, boardCount };
}
