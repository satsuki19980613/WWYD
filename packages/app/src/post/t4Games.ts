import type { Draft } from './draft.ts';

/**
 * T4 のゲームの種類（画像には無い基本設定。07 章 §3）。画像を読み込む前に選ぶ（06 章 §3.9）。
 * どちらもキャッシュゲーム・SB 0.5 / BB 1・アンティなし・レーキ 5%。違うのはレーキの上限（cap）だけ。
 * WWYD のレーキは % だけを保存し計算には使わない（仕様書 §5.2.3）ので、cap は表示のためだけに持つ。
 */
export type T4Game = 'normal' | 'expert';

export const T4_GAMES: Record<T4Game, { label: string; rakePct: number; capBb: number }> = {
  normal: { label: '通常', rakePct: 5, capBb: 4 },
  expert: { label: 'エキスパート', rakePct: 5, capBb: 0.6 },
};

export const T4_GAME_ORDER: readonly T4Game[] = ['normal', 'expert'];

/** 選んだゲームの基本設定を下書きに入れる（T4 は 6 人。スタック・タイトルは変えない）。 */
export function applyT4Game(d: Draft, game: T4Game): Draft {
  return { ...d, fmt: 'cash', sb: '0.5', ante: '0', rake: String(T4_GAMES[game].rakePct), players: 6 };
}
