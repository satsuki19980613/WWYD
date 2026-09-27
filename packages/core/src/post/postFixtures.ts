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

/** H-S1 スポット 10 / BB の正しい投稿（03 章 §3.1 の例）。 */
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
    villain: 'BB',
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

/** H-MW スポット 7 / BB。 */
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
    villain: 'BB',
    derived: {
      street: 'flop',
      keys: ['fold', 'call', 's1'],
      s1_label: 'raise',
      min_to: 6,
      max_to: 97.5,
      pot_base: 17,
      effective_stack: 100,
      stop_index: 9,
    },
  };
}

/** H-S3（MTT）スポット 6 / HJ。 */
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
    villain: 'HJ',
    derived: {
      street: 'flop',
      keys: ['fold', 'call', 's1'],
      s1_label: 'raise',
      min_to: 6,
      max_to: 19.775,
      pot_base: 11.45,
      effective_stack: 22,
      stop_index: 7,
    },
  };
}
