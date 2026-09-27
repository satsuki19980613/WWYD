/**
 * 13×13 のマスの順序とラベル（詳細仕様 05 章 §1）。添字は行優先 `idx = i × 13 + j`。
 */
import { RANKS, rankIndex, type Card } from '../cards.ts';

export const CELL_COUNT = 169;
export const TOTAL_COMBOS = 1326;

/** マスのラベル（`AA`、`AKs`、`AKo`）。 */
export function labelOf(idx: number): string {
  const i = Math.floor(idx / 13);
  const j = idx % 13;
  if (i === j) return `${RANKS[i]}${RANKS[j]}`;
  if (i < j) return `${RANKS[i]}${RANKS[j]}s`;
  return `${RANKS[j]}${RANKS[i]}o`;
}

const LABEL_TO_IDX = new Map<string, number>(Array.from({ length: CELL_COUNT }, (_, idx) => [labelOf(idx), idx]));

/** ラベル → 添字（知らないラベルは -1）。 */
export function idxOf(label: string): number {
  return LABEL_TO_IDX.get(label) ?? -1;
}

/** マスのコンボ数（ペア 6、スーテッド 4、オフスート 12）。 */
export function combos(idx: number): 6 | 4 | 12 {
  const i = Math.floor(idx / 13);
  const j = idx % 13;
  if (i === j) return 6;
  return i < j ? 4 : 12;
}

/** 実カード 2 枚 → ラベル（高いランクが先、同スートなら s、違えば o、同ランクならペア）。 */
export function labelOfCards(c1: Card, c2: Card): string {
  const [hi, lo] = rankIndex(c1) <= rankIndex(c2) ? [c1, c2] : [c2, c1];
  if (hi.charAt(0) === lo.charAt(0)) return `${hi.charAt(0)}${lo.charAt(0)}`;
  return `${hi.charAt(0)}${lo.charAt(0)}${hi.charAt(1) === lo.charAt(1) ? 's' : 'o'}`;
}
