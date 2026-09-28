import {
  bbToMbb,
  formatBb,
  pctFromSize,
  PCT_DEFAULT,
  sizeFromPct,
  validatePaint,
  type AnswerKey,
  type Mbb,
  type Paint,
} from '@wwyd/core';

/**
 * サイズ（詳細仕様 06 章 §4.7）と送信前の検査（§4.9）。
 * サイズは to（そのストリートの合計額、mbb）。入力欄の文字列から毎回読み直す。
 */

export type SizeSpot = {
  /** 停止位置の currentBet（bet なら 0）。 */
  currentBet: Mbb;
  potBase: Mbb;
  minTo: Mbb;
  maxTo: Mbb;
};

/** 増減ボタンの刻み（0.1bb）。 */
export const SIZE_STEP: Mbb = 100;

/** 入力欄の文字列 → to（mbb）。空・数でない・小数第 4 位以下は null（範囲は見ない）。 */
export function parseSizeText(text: string): Mbb | null {
  const t = text.trim();
  if (t === '' || !/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return null;
  return bbToMbb(Number(t));
}

export function inRange(to: Mbb | null, spot: SizeSpot): to is Mbb {
  return to !== null && to >= spot.minTo && to <= spot.maxTo;
}

/** 初期値: 保存済みのサイズ（Hero の予想）があればそれ、なければ 50%（04 章 §9）。 */
export function initialSize(spot: SizeSpot, saved: Mbb | null): Mbb {
  if (saved !== null) return saved;
  return sizeFromPct(spot.currentBet, spot.potBase, PCT_DEFAULT, spot.minTo, spot.maxTo);
}

/** ±0.1bb。今の値が読めなければ min から、範囲外なら範囲に収めてから動かす。 */
export function stepSize(text: string, dir: 1 | -1, spot: SizeSpot): Mbb {
  const cur = parseSizeText(text);
  const base = cur === null ? spot.minTo : Math.min(spot.maxTo, Math.max(spot.minTo, cur));
  if (cur === null || cur !== base) return base;
  return Math.min(spot.maxTo, Math.max(spot.minTo, base + dir * SIZE_STEP));
}

export type Preset = number | 'allin';
export const PRESETS: readonly Preset[] = [33, 50, 75, 125, 'allin'];

export function presetSize(p: Preset, spot: SizeSpot): Mbb {
  return p === 'allin' ? spot.maxTo : sizeFromPct(spot.currentBet, spot.potBase, p, spot.minTo, spot.maxTo);
}

/** プリセットが今の値と一致するか（押された表示）。オールインは max のときだけ。 */
export function presetActive(p: Preset, to: Mbb | null, spot: SizeSpot): boolean {
  if (to === null) return false;
  if (p === 'allin') return to === spot.maxTo;
  return to !== spot.maxTo && presetSize(p, spot) === to;
}

/** 畳んだ行の値:「17.55bb」と「50% pot」（max なら「オールイン」）。読めなければ「—」。 */
export function sizeSummary(to: Mbb | null, spot: SizeSpot): { amount: string; pct: string } {
  if (to === null) return { amount: '—', pct: '' };
  const pct = pctFromSize(spot.currentBet, spot.potBase, to, spot.maxTo);
  return { amount: `${formatBb(to)}bb`, pct: pct === 'allin' ? 'オールイン' : `${pct}% pot` };
}

export function usesS1(paint: Paint): boolean {
  return paint.some((m) => m !== null && m.s1 > 0);
}

/**
 * 送信前の検査（06 章 §4.9）。問題が無ければ空。s1 を使わない回答ではサイズを見ない。
 */
export function submitErrors(paint: Paint, keys: readonly AnswerKey[], to: Mbb | null, spot: SizeSpot | null): string[] {
  const s1 = usesS1(paint);
  const size = s1 ? to : null;
  const min = spot?.minTo ?? null;
  const max = spot?.maxTo ?? null;
  const code = validatePaint(paint, keys, size, min, max);
  if (code === null) return [];
  if (code === 'paint_empty') return ['1マス以上塗ってください'];
  if (code === 'size_out_of_range' && min !== null && max !== null) {
    return [`サイズを ${formatBb(min)}〜${formatBb(max)}bb にしてください`];
  }
  return ['回答の内容が正しくありません'];
}

/** 送信するサイズ（bb の数値。s1 を使わない回答は null）。 */
export function sizeForSubmit(paint: Paint, to: Mbb | null): Mbb | null {
  return usesS1(paint) ? to : null;
}
