/**
 * `get_post_detail` の応答の見本（DB が返すのと同じ JSON の形）。テストと E2E の偽のバックエンド専用
 * （本番コードからは使わない）。投稿は core の投稿入力の見本（H-S1 など）から作る。
 */
import { hs1, type Raw } from '../../../core/src/post/postFixtures.ts';

export type DetailOpts = {
  viewer: 'author' | 'answered' | 'unanswered';
  id?: string;
  answerCount?: number;
  /** `\x…` の paint と bb のサイズ */
  myAnswer?: { paint: string; size: number | null } | null;
  hostAnswer?: { paint: string; size: number | null } | null;
};

const BOARD_BY_STREET: Record<string, number> = { pf: 0, flop: 3, turn: 4, river: 5 };

/** 集計の初期値（1690 バイトすべて 0）。 */
export const EMPTY_AGG_HEX = `\\x${'00'.repeat(1690)}`;

export function detailJson(raw: Raw = hs1(), o: DetailOpts): Record<string, unknown> {
  const d = raw.derived as Record<string, unknown>;
  const canView = o.viewer !== 'unanswered';
  const actions = raw.actions as unknown[];
  const board = raw.board as string[];
  const stop = d.stop_index as number;
  const id = o.id ?? '00000000-0000-4000-8000-000000000001';
  return {
    viewer: o.viewer,
    post: {
      id,
      created_at: '2026-09-28T00:00:00+00:00',
      title: raw.title,
      fmt: raw.fmt,
      hero: raw.hero,
      villain: raw.villain,
      street: d.street,
      effective_stack: d.effective_stack,
      keys: d.keys,
      s1_label: d.s1_label,
      min_to: d.min_to,
      max_to: d.max_to,
      pot_base: d.pot_base,
      answer_count: o.answerCount ?? 0,
      is_mine: o.viewer === 'author',
      can_delete: o.viewer === 'author',
    },
    hand: {
      sb: raw.sb,
      bb: raw.bb,
      ante: raw.ante,
      rake: raw.rake,
      stacks: raw.stacks,
      board: canView ? board : board.slice(0, BOARD_BY_STREET[d.street as string]),
      actions: canView ? actions : actions.slice(0, stop),
      spot_index: raw.spot_index,
      stop_index: stop,
      truncated: !canView,
    },
    secrets: canView ? { hero_cards: raw.hero_cards, known_cards: raw.known_cards } : null,
    my_answer: o.myAnswer ? { ...o.myAnswer, created_at: '2026-09-28T00:00:00+00:00' } : null,
    host_answer: canView && o.hostAnswer ? { ...o.hostAnswer, updated_at: '2026-09-28T00:00:00+00:00' } : null,
    aggregate: canView ? { n: o.answerCount ?? 0, cells: EMPTY_AGG_HEX } : null,
  };
}
