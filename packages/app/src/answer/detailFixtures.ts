/**
 * `get_post_detail` の応答の見本（DB が返すのと同じ JSON の形）。テストと E2E の偽のバックエンド専用
 * （本番コードからは使わない）。投稿は core の投稿入力の見本（H-S1 など）から作る。
 */
import {
  addAnswer,
  emptyAggregate,
  emptyPaint,
  encodeAggregate,
  encodePaint,
  idxOf,
  toHex,
  type Mix,
  type Paint,
} from '../../../core/src/index.ts';
import { hs1, type Raw } from '../../../core/src/post/postFixtures.ts';

export type DetailOpts = {
  viewer: 'author' | 'answered' | 'unanswered';
  id?: string;
  answerCount?: number;
  /** `\x…` の paint と bb のサイズ */
  myAnswer?: { paint: string; size: number | null } | null;
  /** 集計（`\x…` の 1690 バイト）。省略時はすべて 0 */
  aggregate?: string;
  /** 管理者として見る（他人の投稿を削除できる） */
  admin?: boolean;
};

const BOARD_BY_STREET: Record<string, number> = { pf: 0, flop: 3, turn: 4, river: 5 };

/** 集計の初期値（1690 バイトすべて 0）。 */
export const EMPTY_AGG_HEX = `\\x${'00'.repeat(1690)}`;

export function detailJson(raw: Raw = hs1(), o: DetailOpts): Record<string, unknown> {
  const d = raw.derived as Record<string, unknown>;
  const canView = o.viewer !== 'unanswered';
  // 集計は回答済みだけ（投稿者も回答してから。2026-09-28）
  const answered = o.viewer === 'answered' || Boolean(o.myAnswer);
  const actions = raw.actions as unknown[];
  const board = raw.board as string[];
  const stop = d.stop_index as number;
  const id = o.id ?? '00000000-0000-4000-8000-000000000001';
  return {
    viewer: o.viewer,
    answered,
    post: {
      id,
      created_at: '2026-09-28T00:00:00+00:00',
      title: raw.title,
      fmt: raw.fmt,
      hero: raw.hero,
      street: d.street,
      effective_stack: d.effective_stack,
      keys: d.keys,
      s1_label: d.s1_label,
      min_to: d.min_to,
      max_to: d.max_to,
      pot_base: d.pot_base,
      answer_count: o.answerCount ?? 0,
      is_mine: o.viewer === 'author',
      can_delete: o.viewer === 'author' || o.admin === true,
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
      // Villain・MTT の情報（18 章）。見本に無ければ情報なし
      villain_reads: raw.villain_reads ?? {},
      mtt: raw.mtt ?? null,
    },
    secrets: canView ? { hero_cards: raw.hero_cards, known_cards: raw.known_cards } : null,
    my_answer: o.myAnswer ? { ...o.myAnswer, created_at: '2026-09-28T00:00:00+00:00' } : null,
    aggregate: answered ? { n: o.answerCount ?? 0, cells: o.aggregate ?? EMPTY_AGG_HEX } : null,
  };
}

/** 回答の paint から集計（`\x…`）を作る（DB のトリガと同じ差分更新）。 */
export function aggregateHex(paints: readonly Paint[]): string {
  return toHex(encodeAggregate(paints.reduce(addAnswer, emptyAggregate())));
}

/** マスのラベル → ミックス の paint（`\x…`）。 */
export function paintHexOf(cells: Record<string, Partial<Mix>>): string {
  return toHex(encodePaint(paintOf(cells)));
}

export function paintOf(cells: Record<string, Partial<Mix>>): Paint {
  const p = emptyPaint();
  for (const [label, mix] of Object.entries(cells)) p[idxOf(label)] = { fold: 0, check: 0, call: 0, s1: 0, ...mix };
  return p;
}
