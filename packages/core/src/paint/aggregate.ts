/**
 * 集計データ（1690 バイト）と表示の計算（詳細仕様 05 章 §3・§4）。
 * マス `idx` の 10 バイトは `idx × 10` から n_cell, sum_fold, sum_check, sum_call, sum_s1（各 uint16 ビッグエンディアン）。
 */
import { ANSWER_KEYS, MIX_TOTAL, type AnswerKey } from '../constants.ts';
import type { Mix, Paint } from './codec.ts';
import { CELL_COUNT, combos, TOTAL_COMBOS } from './labels.ts';

export type AggCell = { n: number; sum: Mix };

export const AGG_BYTES = CELL_COUNT * 10; // 1690

function zeroMix(): Mix {
  return { fold: 0, check: 0, call: 0, s1: 0 };
}

export function emptyAggregate(): AggCell[] {
  return Array.from({ length: CELL_COUNT }, () => ({ n: 0, sum: zeroMix() }));
}

export function decodeAggregate(bytes: Uint8Array): AggCell[] {
  if (bytes.length !== AGG_BYTES) throw new Error('集計データの長さが 1690 でない');
  const u16 = (o: number): number => (bytes[o] as number) * 256 + (bytes[o + 1] as number);
  return Array.from({ length: CELL_COUNT }, (_, idx) => {
    const o = idx * 10;
    const sum = zeroMix();
    ANSWER_KEYS.forEach((k, n) => {
      sum[k] = u16(o + 2 + n * 2);
    });
    return { n: u16(o), sum };
  });
}

/** テストと検証用（本番の集計は DB のトリガが行う）。 */
export function encodeAggregate(agg: readonly AggCell[]): Uint8Array {
  const bytes = new Uint8Array(AGG_BYTES);
  const put = (o: number, v: number): void => {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new Error(`uint16 に収まらない: ${v}`);
    bytes[o] = v >> 8;
    bytes[o + 1] = v & 0xff;
  };
  agg.forEach((cell, idx) => {
    const o = idx * 10;
    put(o, cell.n);
    ANSWER_KEYS.forEach((k, n) => put(o + 2 + n * 2, cell.sum[k]));
  });
  return bytes;
}

/** 回答 1 件を加える（DB のトリガと同じ差分更新。§3.1）。 */
export function addAnswer(agg: readonly AggCell[], paint: Paint): AggCell[] {
  return agg.map((cell, idx) => {
    const mix = paint[idx];
    if (!mix) return cell;
    const sum = { ...cell.sum };
    for (const k of ANSWER_KEYS) sum[k] += mix[k];
    return { n: cell.n + 1, sum };
  });
}

export type CellView = {
  /** キーごとの割合（0〜1）。レンジ内の回答者の平均。無色なら null。 */
  ratio: Mix | null;
  /** 濃さ（不透明度）。無色は 0。 */
  opacity: number;
};

/** 全体表示のマス（§4.1）。`total` は回答者数 N。 */
export function aggregateCellView(cell: AggCell, total: number): CellView {
  if (cell.n === 0 || total === 0) return { ratio: null, opacity: 0 };
  const ratio = zeroMix();
  for (const k of ANSWER_KEYS) ratio[k] = cell.sum[k] / (cell.n * MIX_TOTAL);
  return { ratio, opacity: 0.3 + (0.7 * cell.n) / total };
}

/** 自分・Hero の予想の表示のマス（§4.2）。 */
export function paintCellView(mix: Mix | null): CellView {
  if (!mix) return { ratio: null, opacity: 0 };
  const ratio = zeroMix();
  for (const k of ANSWER_KEYS) ratio[k] = mix[k] / MIX_TOTAL;
  return { ratio, opacity: 1 };
}

export type BarRatios = Record<AnswerKey | 'off', number>;

/** 全体表示の上部バー（§4.1）: 1326 combos に対する各キーとレンジ外の比率。 */
export function aggregateBar(agg: readonly AggCell[], total: number): BarRatios {
  const out: BarRatios = { fold: 0, check: 0, call: 0, s1: 0, off: 0 };
  if (total === 0) return { ...out, off: 1 };
  agg.forEach((cell, idx) => {
    const c = combos(idx);
    for (const k of ANSWER_KEYS) out[k] += (c * cell.sum[k]) / (MIX_TOTAL * total * TOTAL_COMBOS);
    out.off += (c * (1 - cell.n / total)) / TOTAL_COMBOS;
  });
  return out;
}

/** 自分・Hero の予想・回答中の集計バー（§4.2、§5.3.7）。 */
export function paintBar(paint: Paint): BarRatios {
  const out: BarRatios = { fold: 0, check: 0, call: 0, s1: 0, off: 0 };
  paint.forEach((mix, idx) => {
    const c = combos(idx);
    if (!mix) {
      out.off += c / TOTAL_COMBOS;
      return;
    }
    for (const k of ANSWER_KEYS) out[k] += (c * mix[k]) / MIX_TOTAL / TOTAL_COMBOS;
  });
  return out;
}

/** 内訳の人数（頻度で重み付けした人数 `sum_k / 20` を四捨五入）。 */
export function weightedCount(cell: AggCell, key: AnswerKey): number {
  return Math.round(cell.sum[key] / MIX_TOTAL);
}
