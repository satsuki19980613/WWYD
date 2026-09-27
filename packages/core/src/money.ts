/**
 * 金額（詳細仕様 04 章 §1）。内部表現は mbb（ミリ bb）の整数で、浮動小数を計算に使わない。
 * bb ↔ mbb の変換と表示は、この 1 箇所だけで行う（CLAUDE.md §6）。
 */
import { MBB_PER_BB } from './constants.ts';

/** mbb の整数。 */
export type Mbb = number;

/** 入力で受け付ける金額の上限（9999.999bb。DB の numeric(9,3)）。 */
export const MAX_AMOUNT_MBB: Mbb = 9_999_999;

/**
 * bb の数値を mbb に変換する。小数第 4 位以下がある、有限でない、絶対値が上限を超える場合は null。
 * 例: 2.5 → 2500、0.125 → 125、0.0001 → null。
 */
export function bbToMbb(bb: number): Mbb | null {
  if (typeof bb !== 'number' || !Number.isFinite(bb)) return null;
  const scaled = bb * MBB_PER_BB;
  const rounded = Math.round(scaled);
  // 2 進の誤差（0.1 × 1000 = 100.00000000000001 等）は許し、第 4 位の値は拒否する
  if (Math.abs(scaled - rounded) > 1e-6) return null;
  if (Math.abs(rounded) > MAX_AMOUNT_MBB) return null;
  return rounded === 0 ? 0 : rounded; // -0 を 0 にそろえる
}

/** mbb を bb の数値に戻す（DB・JSON への出力用）。 */
export function mbbToBb(mbb: Mbb): number {
  return mbb / MBB_PER_BB;
}

/** 表示用の bb 文字列。末尾の 0 を削る（2500 → "2.5"、100000 → "100"、125 → "0.125"）。 */
export function formatBb(mbb: Mbb): string {
  const sign = mbb < 0 ? '-' : '';
  const abs = Math.abs(mbb);
  const int = Math.floor(abs / MBB_PER_BB);
  const frac = abs % MBB_PER_BB;
  if (frac === 0) return `${sign}${int}`;
  return `${sign}${int}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
}
