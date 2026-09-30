/**
 * Villain の情報（Reads）と MTT の情報の検証（詳細仕様 18 章 §3）。全項目が任意。
 * クライアント（送信前）と Neon Function `create-post` の両方がこの関数を使う（不変条件 4・7）。
 * 形が違う値は malformed、範囲・制約の違反は invalid_reads / invalid_mtt。
 */
import { POSITIONS, type Pos } from '../constants.ts';
import { fail } from '../errors.ts';
import type { Fmt } from './validateInput.ts';

/** Slider の項目。vpip・pfr・agg は 0〜100 の整数（%）、conf・image は 0〜4 の整数（5 段階） */
export const READ_KEYS = ['vpip', 'pfr', 'agg', 'conf', 'image'] as const;
export type ReadKey = (typeof READ_KEYS)[number];

/** 数値（%）で持つ Slider（HUD の値をそのまま入れられる） */
export const PERCENT_READS: readonly ReadKey[] = ['vpip', 'pfr', 'agg'];
export const PERCENT_MAX = 100;
/** 5 段階だけで持つ Slider の最大（0〜4） */
export const STEP_MAX = 4;

/** Memo の最大文字数（コードポイント数） */
export const MEMO_MAX = 30;

/** 1 席分の情報。無い項目は未入力 */
export type VillainRead = Partial<Record<ReadKey, number>> & { memo?: string };
/** 席ごとの情報（Hero と空席は持たない。情報の無い席はキーを持たない） */
export type VillainReads = Partial<Record<Pos, VillainRead>>;

/** Tournament Type（ストラクチャーの速さ。Deep〜Turbo の 5 段階 0〜4。2026-09-30 さつき: Stage と Regular/PKO/Satellite の選択をやめた） */
export const SPEED_MAX = 4;
export const PRIZE_STRUCTURES = ['top', 'standard', 'flat'] as const;
export type PrizeStructure = (typeof PRIZE_STRUCTURES)[number];

/** 人数の欄（スポットの順位・残りの人数・ITM・エントリー数）の上限 */
export const MTT_COUNT_MAX = 1_000_000;
/** Avg Stack（bb）の上限。小数第 1 位まで */
export const MTT_AVG_MAX = 99_999;

export type MttInfo = {
  /** Tournament Type（0 = Deep 〜 4 = Turbo） */
  speed?: number;
  /** スポットの順位 */
  rank?: number;
  /** 残りの人数 */
  left?: number;
  /** ITM（入賞する人数） */
  paid?: number;
  /** エントリー数 */
  entries?: number;
  /** 平均スタック（bb。小数第 1 位まで） */
  avg?: number;
  prize?: PrizeStructure;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPos = (v: string): v is Pos => (POSITIONS as readonly string[]).includes(v);

// DB（jsonb）が受け付けない文字（validateInput の題名と同じ）と、1 行にならない制御文字
const UNSTORABLE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const CONTROL = /[\u0000-\u001F\u007F]/;

/** Memo を保存する形に（前後の空白を除く。空なら undefined）。文字数・文字の違反は invalid_reads */
export function normalizeMemo(v: string): string | undefined {
  const memo = v.trim();
  if (memo === '') return undefined;
  if ([...memo].length > MEMO_MAX || UNSTORABLE.test(memo) || CONTROL.test(memo)) fail('invalid_reads', undefined, 'memo');
  return memo;
}

/**
 * Reads の検証。`seats` は座っている席、`hero` は Hero の席。
 * 省略（undefined・null）は情報なし（{}）。中身の無い席は落とす。
 */
export function validateReads(raw: unknown, seats: readonly Pos[], hero: Pos): VillainReads {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) fail('malformed', undefined, 'villain_reads');
  const out: VillainReads = {};
  for (const [seat, v] of Object.entries(raw)) {
    if (!isPos(seat) || !seats.includes(seat) || seat === hero) fail('malformed', undefined, `villain_reads.${seat}`);
    if (!isObj(v)) fail('malformed', undefined, `villain_reads.${seat}`);
    const read: VillainRead = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'memo') {
        if (typeof x !== 'string') fail('malformed', undefined, `villain_reads.${seat}.memo`);
        const memo = normalizeMemo(x);
        if (memo !== undefined) read.memo = memo;
        continue;
      }
      if (!(READ_KEYS as readonly string[]).includes(k)) fail('malformed', undefined, `villain_reads.${seat}.${k}`);
      const key = k as ReadKey;
      if (typeof x !== 'number' || !Number.isInteger(x)) fail('malformed', undefined, `villain_reads.${seat}.${k}`);
      const max = PERCENT_READS.includes(key) ? PERCENT_MAX : STEP_MAX;
      if (x < 0 || x > max) fail('invalid_reads', undefined, `villain_reads.${seat}.${k}`);
      read[key] = x;
    }
    // PFR は VPIP を超えない（両方あるときだけ）
    if (read.vpip !== undefined && read.pfr !== undefined && read.pfr > read.vpip) {
      fail('invalid_reads', undefined, `villain_reads.${seat} の PFR が VPIP を超える`);
    }
    if (Object.keys(read).length > 0) out[seat] = read;
  }
  return out;
}

const MTT_KEYS = ['speed', 'rank', 'left', 'paid', 'entries', 'avg', 'prize'] as const;

/**
 * MTT の情報の検証。Game Type が MTT のときだけ持てる（Cash で送られたら invalid_mtt）。
 * 省略（undefined・null）・中身の無いオブジェクトは null。
 */
export function validateMtt(raw: unknown, fmt: Fmt): MttInfo | null {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) fail('malformed', undefined, 'mtt');
  const out: MttInfo = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(MTT_KEYS as readonly string[]).includes(k)) fail('malformed', undefined, `mtt.${k}`);
    switch (k) {
      case 'speed':
        if (typeof v !== 'number' || !Number.isInteger(v)) fail('malformed', undefined, 'mtt.speed');
        if (v < 0 || v > SPEED_MAX) fail('invalid_mtt', undefined, 'mtt.speed');
        out.speed = v;
        break;
      case 'prize':
        if (!(PRIZE_STRUCTURES as readonly unknown[]).includes(v)) fail('malformed', undefined, 'mtt.prize');
        out.prize = v as PrizeStructure;
        break;
      case 'avg':
        if (typeof v !== 'number' || !Number.isFinite(v)) fail('malformed', undefined, 'mtt.avg');
        if (v <= 0 || v > MTT_AVG_MAX || Math.abs(v * 10 - Math.round(v * 10)) > 1e-9) fail('invalid_mtt', undefined, 'mtt.avg');
        out.avg = v;
        break;
      default: {
        const key = k as 'rank' | 'left' | 'paid' | 'entries';
        if (typeof v !== 'number' || !Number.isInteger(v)) fail('malformed', undefined, `mtt.${k}`);
        if (v < 1 || v > MTT_COUNT_MAX) fail('invalid_mtt', undefined, `mtt.${k}`);
        out[key] = v;
      }
    }
  }
  if (Object.keys(out).length === 0) return null;
  if (fmt !== 'mtt') fail('invalid_mtt', undefined, 'Cash に MTT の情報');
  // 順位 ≦ 残り人数 ≦ エントリー数、入賞枠 ≦ エントリー数
  const le = (a: number | undefined, b: number | undefined): boolean => a === undefined || b === undefined || a <= b;
  if (!le(out.rank, out.left) || !le(out.left, out.entries) || !le(out.rank, out.entries) || !le(out.paid, out.entries)) {
    fail('invalid_mtt', undefined, 'mtt の人数の大小');
  }
  return out;
}

/** 情報のある席があるか */
export function hasReads(reads: VillainReads): boolean {
  return Object.keys(reads).length > 0;
}
