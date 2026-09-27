/**
 * カードの表記（詳細仕様 00 章）。ランク `AKQJT98765432` ＋ スート `s h d c`（例 `Ad`）。
 */

export const RANKS = 'AKQJT98765432';
export const SUITS = 'shdc';

/** 2 文字のカード（例 `Ad`）。 */
export type Card = string;

const CARD_PATTERN = /^[AKQJT98765432][shdc]$/;

export function isCard(v: unknown): v is Card {
  return typeof v === 'string' && CARD_PATTERN.test(v);
}

/** ランクの強さの添字（A = 0 … 2 = 12）。 */
export function rankIndex(card: Card): number {
  return RANKS.indexOf(card.charAt(0));
}

/** 重複しているカードを 1 つ返す（無ければ null）。 */
export function findDuplicateCard(cards: readonly Card[]): Card | null {
  const seen = new Set<Card>();
  for (const c of cards) {
    if (seen.has(c)) return c;
    seen.add(c);
  }
  return null;
}
