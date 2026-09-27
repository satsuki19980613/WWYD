import { mbbToBb, POSITIONS, type VerifiedPost } from '@wwyd/core';

/**
 * `insert_post(p_author, p)` の `p`（詳細仕様 02 章 §4.1）。金額は bb の数値（DB の numeric）。
 * 派生メタは verifyPost がサーバーで計算した値を使う（クライアントが送った derived ではない。03 章 §3.2 の 8）。
 */
export type InsertPayload = {
  title: string;
  fmt: 'cash' | 'mtt';
  hero: string;
  villain: string;
  street: string;
  effective_stack: number;
  keys: string[];
  s1_label: 'bet' | 'raise' | null;
  min_to: number | null;
  max_to: number | null;
  pot_base: number;
  sb: number;
  bb: number;
  ante: number;
  rake: number | null;
  stacks: Record<string, number>;
  board: string[];
  actions: { street: string; pos: string; type: string; to?: number }[];
  spot_index: number;
  stop_index: number;
  hero_cards: string[];
  known_cards: Record<string, string[] | 'muck'>;
};

const bbOrNull = (mbb: number | null): number | null => (mbb === null ? null : mbbToBb(mbb));

export function toInsertPayload(v: VerifiedPost): InsertPayload {
  const d = v.derived;
  const stacks: Record<string, number> = {};
  for (const p of POSITIONS) stacks[p] = mbbToBb(v.setup.stacks[p]);
  const known: Record<string, string[] | 'muck'> = {};
  for (const [pos, cards] of Object.entries(v.knownCards)) {
    if (cards) known[pos] = cards === 'muck' ? 'muck' : [...cards];
  }
  return {
    title: v.title,
    fmt: v.fmt,
    hero: v.hero,
    villain: v.villain,
    street: d.street,
    effective_stack: mbbToBb(d.effectiveStack),
    keys: [...d.keys],
    s1_label: d.s1Label,
    min_to: bbOrNull(d.minTo),
    max_to: bbOrNull(d.maxTo),
    pot_base: mbbToBb(d.potBase),
    sb: mbbToBb(v.setup.sb),
    bb: mbbToBb(v.setup.bb),
    ante: mbbToBb(v.setup.ante),
    rake: v.rake,
    stacks,
    board: [...v.board],
    actions: v.actions.map((a) =>
      a.to === undefined ? { street: a.street, pos: a.pos, type: a.type } : { street: a.street, pos: a.pos, type: a.type, to: mbbToBb(a.to) },
    ),
    spot_index: v.spotIndex,
    stop_index: d.stopIndex,
    hero_cards: [...v.heroCards],
    known_cards: known,
  };
}
