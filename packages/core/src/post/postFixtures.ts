/**
 * 投稿入力の見本（04 章の H-S1 / H-MW / H-S3。03 章 §3.1 の JSON の形）。テスト専用。
 * core・Neon Function・投稿画面のテストで共有する（本番コードからは使わない）。
 */
import { mbbToBb } from '../money.ts';
import type { Action } from '../poker/state.ts';
import { acts } from '../poker/testHelpers.ts';

export type Raw = Record<string, unknown>;

function rawActions(actions: Action[]): Raw[] {
  return actions.map((a) => (a.to === undefined ? { ...a } : { ...a, to: mbbToBb(a.to) }));
}

export const STACKS100 = { UTG: 100, HJ: 100, CO: 100, BTN: 100, SB: 100, BB: 100 };

/** H-S1 スポット 10（ターンの BTN の手番）の正しい投稿（03 章 §3.1 の例）。 */
export function hs1(): Raw {
  return {
    title: 'K83r のターン 2 バレル',
    fmt: 'cash',
    sb: 0.5,
    bb: 1,
    ante: 0,
    rake: 5,
    stacks: { ...STACKS100 },
    hero: 'BTN',
    hero_cards: ['Ad', 'Kd'],
    known_cards: { BB: ['Ks', 'Js'] },
    board: ['Kh', '8d', '3c', '2s', '7h'],
    actions: rawActions(
      acts({
        pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
        flop: 'BB x, BTN b1.8, BB c',
        turn: 'BB x, BTN b6.5, BB c',
        river: 'BB x, BTN b15, BB c',
      }),
    ),
    spot_index: 10,
    derived: {
      street: 'turn',
      keys: ['check', 's1'],
      s1_label: 'bet',
      min_to: 1,
      max_to: 95.7,
      pot_base: 9.1,
      effective_stack: 100,
      stop_index: 10,
    },
  };
}

/**
 * H-S1 を BB の手番で出題した形（ターンで BTN b6.5 に向き合う。スポット 11）。Hero = BB（Ks Js）、BTN は Ad Kd を見せた。
 * Fold / Call / Raise の局面の試験に使う。
 */
export function hs1bb(): Raw {
  return {
    ...hs1(),
    title: 'K83r のターンのバレルを受ける',
    hero: 'BB',
    hero_cards: ['Ks', 'Js'],
    known_cards: { BTN: ['Ad', 'Kd'] },
    spot_index: 11,
    derived: {
      street: 'turn',
      keys: ['fold', 'call', 's1'],
      s1_label: 'raise',
      min_to: 13,
      max_to: 95.7,
      pot_base: 22.1,
      effective_stack: 100,
      stop_index: 11,
    },
  };
}

/** H-MW スポット 7（フロップの CO の手番）。 */
export function hmw(): Raw {
  return {
    ...hs1(),
    title: 'マルチウェイ',
    hero: 'CO',
    hero_cards: ['Qh', 'Qd'],
    known_cards: {},
    actions: rawActions(
      acts({
        pf: 'UTG f, HJ f, CO r2.5, BTN c, SB f, BB c',
        flop: 'BB x, CO b3, BTN c, BB r12, CO c, BTN f',
        turn: 'BB x, CO x',
        river: 'BB x, CO x',
      }),
    ),
    spot_index: 7,
    derived: {
      street: 'flop',
      keys: ['check', 's1'],
      s1_label: 'bet',
      min_to: 1,
      max_to: 97.5,
      pot_base: 8,
      effective_stack: 100,
      stop_index: 7,
    },
  };
}

/** H-S3（MTT）スポット 6（フロップの BB の手番）。 */
export function hs3(): Raw {
  return {
    title: 'MTT の見本',
    fmt: 'mtt',
    sb: 0.5,
    bb: 1,
    ante: 0.125,
    rake: null,
    stacks: { UTG: 30, HJ: 22, CO: 45, BTN: 18, SB: 26, BB: 24 },
    hero: 'BB',
    hero_cards: ['9s', '9c'],
    known_cards: {},
    board: ['Th', '6d', '2c', '3s', 'Jh'],
    actions: rawActions(
      acts({
        pf: 'UTG f, HJ r2.1, CO f, BTN f, SB f, BB c',
        flop: 'BB b3, HJ c',
        turn: 'BB x, HJ x',
        river: 'BB x, HJ x',
      }),
    ),
    spot_index: 6,
    derived: {
      street: 'flop',
      keys: ['check', 's1'],
      s1_label: 'bet',
      min_to: 1,
      max_to: 21.775,
      pot_base: 5.45,
      effective_stack: 22,
      stop_index: 6,
    },
  };
}
