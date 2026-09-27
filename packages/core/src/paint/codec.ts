/**
 * 回答の paint（676 バイト）のエンコード・デコード（詳細仕様 05 章 §2）。
 * マス `idx` の 4 バイトは `idx × 4` から fold, check, call, s1 の順。各 0〜20（1 = 5%）。
 */
import { ANSWER_KEYS, MIX_TOTAL, type AnswerKey } from '../constants.ts';
import { CELL_COUNT } from './labels.ts';

export type Mix = Record<AnswerKey, number>;
/** 長さ 169。null はレンジ外。 */
export type Paint = (Mix | null)[];

export const PAINT_BYTES = CELL_COUNT * ANSWER_KEYS.length; // 676

export function emptyPaint(): Paint {
  return Array.from({ length: CELL_COUNT }, () => null);
}

export function encodePaint(paint: Paint): Uint8Array {
  if (paint.length !== CELL_COUNT) throw new Error('paint の長さが 169 でない');
  const bytes = new Uint8Array(PAINT_BYTES);
  paint.forEach((mix, idx) => {
    if (!mix) return;
    ANSWER_KEYS.forEach((k, n) => {
      const v = mix[k];
      if (!Number.isInteger(v) || v < 0 || v > MIX_TOTAL) throw new Error(`頻度が 0〜20 の整数でない: ${v}`);
      bytes[idx * 4 + n] = v;
    });
  });
  return bytes;
}

/** 長さ・値域・マスの合計（0 か 20）を検査してデコードする。違反は例外。 */
export function decodePaint(bytes: Uint8Array): Paint {
  if (bytes.length !== PAINT_BYTES) throw new Error('paint の長さが 676 でない');
  const paint = emptyPaint();
  for (let idx = 0; idx < CELL_COUNT; idx++) {
    const mix = {} as Mix;
    let sum = 0;
    ANSWER_KEYS.forEach((k, n) => {
      const v = bytes[idx * 4 + n] as number;
      if (v > MIX_TOTAL) throw new Error(`頻度が 20 を超える: ${v}`);
      mix[k] = v;
      sum += v;
    });
    if (sum === MIX_TOTAL) paint[idx] = mix;
    else if (sum !== 0) throw new Error(`マスの合計が 0 か 20 でない: ${sum}`);
  }
  return paint;
}

/** PostgREST の bytea 形式（`\x` ＋ 小文字 hex）。 */
export function toHex(bytes: Uint8Array): string {
  let s = '\\x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(s: string): Uint8Array {
  if (!s.startsWith('\\x') || (s.length - 2) % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s.slice(2))) {
    throw new Error('bytea の 16 進文字列でない');
  }
  const out = new Uint8Array((s.length - 2) / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 + i * 2, 4 + i * 2), 16);
  return out;
}
