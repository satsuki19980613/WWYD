/**
 * 共通の定数と基本の型（詳細仕様 00 章「共通の表記」、04 章 §1–2）。
 * ポーカーロジック本体（`poker/`）と paint コーデック（`paint/`）は P2 で追加する。
 *
 * このパッケージは Deno（Edge Function）からも import するため、
 * 相対 import は拡張子付き（`./x.ts`）で書き、Node API と外部依存を使わない。
 */

/** 6max のポジション（プリフロップのアクション順）。 */
export const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;
export type Pos = (typeof POSITIONS)[number];

/** 1 ハンドの人数（2〜6。2026-09-29 さつきの決定。04 章 §2.1）。 */
export const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const;
export type PlayerCount = (typeof PLAYER_COUNTS)[number];

/**
 * 人数ごとの席（早い席から削る）。2 人は BTN と BB で、BTN が SB を払う（ヘッズアップ）。
 * 空いた席はスタック 0 として扱い、最初からハンドに参加しない。
 */
export const SEATS_BY_COUNT: Record<PlayerCount, readonly Pos[]> = {
  6: POSITIONS,
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  2: ['BTN', 'BB'],
};

/** 席の並びが人数ごとの席のどれかと一致すれば、その人数。一致しなければ null。 */
export function playerCountOf(seats: readonly Pos[]): PlayerCount | null {
  const set = new Set(seats);
  for (const n of PLAYER_COUNTS) {
    const s = SEATS_BY_COUNT[n];
    if (s.length === set.size && s.every((p) => set.has(p))) return n;
  }
  return null;
}

export const STREETS = ['pf', 'flop', 'turn', 'river'] as const;
export type Street = (typeof STREETS)[number];

/** 回答のキー。`s1` はベットまたはレイズ。 */
export const ANSWER_KEYS = ['fold', 'check', 'call', 's1'] as const;
export type AnswerKey = (typeof ANSWER_KEYS)[number];

/** 1bb をミリ bb で表した値。金額の内部表現は mbb の整数。 */
export const MBB_PER_BB = 1000;

/** ミックスの合計（1 = 5%）。 */
export const MIX_TOTAL = 20;

/** ミックスの単位量（0〜20）を % に変換する。表示時にだけ使う。 */
export function mixUnitsToPercent(units: number): number {
  return units * (100 / MIX_TOTAL);
}
