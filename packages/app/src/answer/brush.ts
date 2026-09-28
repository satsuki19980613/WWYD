import { ANSWER_KEYS, MIX_TOTAL, type AnswerKey, type Mix } from '@wwyd/core';

/**
 * ブラシとミックスバー（詳細仕様 06 章 §4.4。仕様書 §5.3.3）。
 * ブラシは Mix（各キー 0〜20、合計 20。1 = 5%）で持ち、合法でないキーは常に 0。
 * ミックスバーは合法キーの順に区間を並べ、境界（ハンドル）の位置は先頭からの累積（0〜20）。
 */

export function zeroMix(): Mix {
  return { fold: 0, check: 0, call: 0, s1: 0 };
}

/** そのキー 100% のブラシ（タイルを押したとき）。 */
export function pureBrush(key: AnswerKey): Mix {
  return { ...zeroMix(), [key]: MIX_TOTAL };
}

/** 初期ブラシ: call があれば call 100%、なければ先頭キー 100%。 */
export function initialBrush(keys: readonly AnswerKey[]): Mix {
  return pureBrush(keys.includes('call') ? 'call' : (keys[0] as AnswerKey));
}

export function sameMix(a: Mix | null, b: Mix | null): boolean {
  if (!a || !b) return false;
  return ANSWER_KEYS.every((k) => a[k] === b[k]);
}

/** 境界の位置（累積。長さは keys.length - 1）。 */
export function boundaries(brush: Mix, keys: readonly AnswerKey[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    acc += brush[keys[i] as AnswerKey];
    out.push(acc);
  }
  return out;
}

/** 境界 i が動ける範囲（隣の境界まで。端は 0 と 20）。 */
export function boundaryRange(bounds: readonly number[], i: number): { lo: number; hi: number } {
  return { lo: i > 0 ? (bounds[i - 1] as number) : 0, hi: i < bounds.length - 1 ? (bounds[i + 1] as number) : MIX_TOTAL };
}

/** 境界 i を `units`（累積の位置）へ動かす。隣の境界を越えないよう収める。合計は常に 20。 */
export function moveBoundary(brush: Mix, keys: readonly AnswerKey[], i: number, units: number): Mix {
  const bounds = boundaries(brush, keys);
  if (i < 0 || i >= bounds.length) return brush;
  const { lo, hi } = boundaryRange(bounds, i);
  bounds[i] = Math.min(hi, Math.max(lo, Math.round(units)));
  const next = zeroMix();
  let prev = 0;
  keys.forEach((k, j) => {
    const cum = j < bounds.length ? (bounds[j] as number) : MIX_TOTAL;
    next[k] = cum - prev;
    prev = cum;
  });
  return next;
}

/** ドラッグで掴むハンドルを決めるまでの移動量（px）。これ未満の間は決めない。 */
export const HANDLE_DECIDE_PX = 6;

/**
 * 同じ位置に重なったハンドル `candidates`（境界の添字）から、ドラッグの向きに「動ける」ものを選ぶ（仕様書 §5.3.3）。
 * 重なったハンドルのうち右へ動けるのは最も添字の大きいもの、左へ動けるのは最も添字の小さいものだけになる
 * （間の区間が 0% なので、ほかは隣の境界に止められる）。どれも動けないときは向きの側の端を返す。
 */
export function pickHandle(bounds: readonly number[], candidates: readonly number[], direction: 1 | -1): number {
  const sorted = [...candidates].sort((a, b) => (direction > 0 ? b - a : a - b));
  for (const i of sorted) {
    const { lo, hi } = boundaryRange(bounds, i);
    const at = bounds[i] as number;
    if (direction > 0 ? hi > at : lo < at) return i;
  }
  return sorted[0] as number;
}

/**
 * 押した位置（バーの左端からの割合 0〜1）の近くにあるハンドル。`hitRatio` 以内で最も近い位置にあるものを、
 * 同じ位置に重なったものも含めてすべて返す（添字の昇順）。無ければ空。
 */
export function handlesAt(bounds: readonly number[], ratio: number, hitRatio: number): number[] {
  let best = Infinity;
  bounds.forEach((b) => {
    const d = Math.abs(b / MIX_TOTAL - ratio);
    if (d <= hitRatio && d < best) best = d;
  });
  if (best === Infinity) return [];
  const pos = bounds.find((b) => Math.abs(Math.abs(b / MIX_TOTAL - ratio) - best) < 1e-9);
  return bounds.flatMap((b, i) => (b === pos ? [i] : []));
}
