/**
 * 回答の検証（詳細仕様 05 章 §2.3）。DB のトリガ（02 章）と同じ規則・同じ順序で判定する。
 * 両者の一致は共有テストベクタ `test-vectors/paint-validation.json` で確かめる。
 */
import { ANSWER_KEYS, MIX_TOTAL, type AnswerKey } from '../constants.ts';
import type { Mbb } from '../money.ts';
import { encodePaint, PAINT_BYTES, type Paint } from './codec.ts';
import { CELL_COUNT } from './labels.ts';

export type PaintError =
  | 'paint_length'
  | 'paint_value'
  | 'paint_illegal_key'
  | 'paint_sum'
  | 'paint_empty'
  | 'size_out_of_range'
  | 'size_not_allowed';

/**
 * バイト列の paint を検証する。`size` は回答のサイズ（to、mbb）。s1 を含まない回答では null。
 * 返り値はエラーコード（問題なければ null）。
 */
export function validatePaintBytes(
  bytes: Uint8Array,
  keys: readonly AnswerKey[],
  size: Mbb | null,
  minTo: Mbb | null,
  maxTo: Mbb | null,
): PaintError | null {
  if (bytes.length !== PAINT_BYTES) return 'paint_length';
  for (const b of bytes) if (b > MIX_TOTAL) return 'paint_value';
  const legal = ANSWER_KEYS.map((k) => keys.includes(k));
  for (let i = 0; i < PAINT_BYTES; i++) if (!legal[i % 4] && bytes[i] !== 0) return 'paint_illegal_key';

  let filled = 0;
  let usesS1 = false;
  for (let idx = 0; idx < CELL_COUNT; idx++) {
    const o = idx * 4;
    const sum = (bytes[o] as number) + (bytes[o + 1] as number) + (bytes[o + 2] as number) + (bytes[o + 3] as number);
    if (sum !== 0 && sum !== MIX_TOTAL) return 'paint_sum';
    if (sum === MIX_TOTAL) filled++;
    if ((bytes[o + 3] as number) > 0) usesS1 = true;
  }
  if (filled === 0) return 'paint_empty';

  if (usesS1) {
    if (size === null || minTo === null || maxTo === null) return 'size_out_of_range';
    if (!Number.isInteger(size) || size < minTo || size > maxTo) return 'size_out_of_range';
  } else if (size !== null) {
    return 'size_not_allowed';
  }
  return null;
}

/**
 * 画面で持っている形の paint を検証する。値が 0〜20 の整数でなければ `paint_value`。
 */
export function validatePaint(
  paint: Paint,
  keys: readonly AnswerKey[],
  size: Mbb | null,
  minTo: Mbb | null,
  maxTo: Mbb | null,
): PaintError | null {
  if (paint.length !== CELL_COUNT) return 'paint_length';
  let bytes: Uint8Array;
  try {
    bytes = encodePaint(paint);
  } catch {
    return 'paint_value';
  }
  return validatePaintBytes(bytes, keys, size, minTo, maxTo);
}
