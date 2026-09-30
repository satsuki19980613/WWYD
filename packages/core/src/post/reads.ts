/**
 * Villain の情報（Reads）と MTT の情報の検証（詳細仕様 18 章 §2.1・§3）。全項目が任意。
 * クライアント（送信前）と Neon Function `create-post` の両方がこの関数を使う（不変条件 4・7）。
 * 形が違う値は malformed、範囲・組み合わせの違反は invalid_reads / invalid_mtt。
 * 2026-09-30 さつきの仕様変更: Memo を廃止し、選択肢を組み合わせる Read（[When] · [Action] → [Lean]）に置き換えた。
 */
import { POSITIONS, STREETS, type Pos, type Street } from '../constants.ts';
import { fail } from '../errors.ts';
import {
  AGGRESSIVE_ACTIONS,
  LEANS,
  leansOf,
  READ_ACTIONS,
  READ_SIZES,
  readCandidates,
  sizesOf,
  STREET_ACTIONS,
  villainSeats,
  type Lean,
  type ReadAction,
  type ReadSize,
} from '../poker/readActions.ts';
import type { Action, HandSetup } from '../poker/state.ts';
import type { Fmt } from './validateInput.ts';

/**
 * 全体の傾向の項目。vpip・pfr は 0〜100 の整数（%。Slider）、agg・image は 0〜4 の整数（5 分割のボタン）。
 * Sample（どれくらい見てきたか）は 2026-09-30 さつきの判断で項目ごと廃止（V-007。無くてよい情報）。新しい投稿に sample があれば断る
 */
export const TENDENCY_KEYS = ['vpip', 'pfr', 'agg', 'image'] as const;
export type TendencyKey = (typeof TENDENCY_KEYS)[number];

/** 数値（%）で持つ項目（HUD の値をそのまま入れられる） */
export const PERCENT_READS: readonly TendencyKey[] = ['vpip', 'pfr'];
export const PERCENT_MAX = 100;
/** 5 分割の項目の最大（0〜4） */
export const STEP_MAX = 4;

export type Tendency = Partial<Record<TendencyKey, number>>;

/** Flop texture（Flop の時点の Board。軸ごとに 0〜1 つ。§2.1.3） */
export const TEXTURE_AXES = {
  high: ['a', 'k', 'qj', 'mid', 'low'],
  suit: ['rainbow', 'two', 'mono'],
  paired: ['unpaired', 'paired'],
  connect: ['straight', 'none'],
} as const;
export type TextureAxis = keyof typeof TEXTURE_AXES;
export const TEXTURE_KEYS = Object.keys(TEXTURE_AXES) as TextureAxis[];
export type Texture = { [K in TextureAxis]?: (typeof TEXTURE_AXES)[K][number] };

/** Runout（Turn・River だけ。その Street で落ちたカードについて。複数選べる。Brick はほかと同時に選べない（V-039）） */
export const RUNOUTS = ['brick', 'over', 'flush', 'straight', 'pair'] as const;
export type Runout = (typeof RUNOUTS)[number];

/** Brick（何も変えないカード）とほかの Runout を同時に選んでいるか（意味が矛盾する。V-039） */
export function runoutConflicts(r: readonly Runout[]): boolean {
  return r.includes('brick') && r.length > 1;
}

export const READ_SCOPES = ['spot', 'general'] as const;
export type ReadScope = (typeof READ_SCOPES)[number];

/** Read 1 件 */
export type ReadEntry = {
  scope: ReadScope;
  street: Street;
  action: ReadAction;
  texture: Texture | null;
  runout: Runout[] | null;
  size: ReadSize | null;
  lean: Lean;
  strong: boolean;
};

/** Spot Read は 1 席 1 件、General Read は 1 席 2 件まで */
export const SPOT_READ_MAX = 1;
export const GENERAL_READ_MAX = 2;

/** 1 席分の情報。無い項目は未入力、Read が無ければ `reads` を持たない */
export type VillainRead = Tendency & { reads?: ReadEntry[] };
/** 席ごとの情報（Hero と空席は持たない。情報の無い席はキーを持たない） */
export type VillainReads = Partial<Record<Pos, VillainRead>>;

/**
 * Tournament Type（ストラクチャーの速さ。0 = Deep 〜 100 = Turbo の連続した値。段階は付けない。
 * 2026-09-30 さつき: Stage と Regular/PKO/Satellite の選択をやめ、左端 Deep・右端 Turbo の Slider にした）
 */
export const SPEED_MAX = 100;
export const PRIZE_STRUCTURES = ['top', 'standard', 'flat'] as const;
export type PrizeStructure = (typeof PRIZE_STRUCTURES)[number];

/** 人数の欄（スポットの順位・残りの人数・ITM・エントリー数）の上限 */
export const MTT_COUNT_MAX = 1_000_000;
/** Avg Stack（bb）の上限。小数第 1 位まで */
export const MTT_AVG_MAX = 99_999;

export type MttInfo = {
  /** Tournament Type（0 = Deep 〜 100 = Turbo） */
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
const oneOf = <T extends string>(v: unknown, all: readonly T[]): v is T => typeof v === 'string' && (all as readonly string[]).includes(v);

const ENTRY_KEYS = ['scope', 'street', 'action', 'texture', 'runout', 'size', 'lean', 'strong'] as const;

/** Read 1 件の検証（形は malformed、Street・Action・Lean・条件の組み合わせは invalid_reads） */
function validateEntry(v: unknown, at: string): ReadEntry {
  if (!isObj(v)) fail('malformed', undefined, at);
  for (const k of Object.keys(v)) if (!(ENTRY_KEYS as readonly string[]).includes(k)) fail('malformed', undefined, `${at}.${k}`);
  const { scope, street, action, lean, strong } = v;
  if (!oneOf(scope, READ_SCOPES)) fail('malformed', undefined, `${at}.scope`);
  if (!oneOf(street, STREETS)) fail('malformed', undefined, `${at}.street`);
  if (!oneOf(action, READ_ACTIONS)) fail('malformed', undefined, `${at}.action`);
  if (!oneOf(lean, LEANS)) fail('malformed', undefined, `${at}.lean`);
  if (typeof strong !== 'boolean') fail('malformed', undefined, `${at}.strong`);

  let texture: Texture | null = null;
  if (v.texture !== undefined && v.texture !== null) {
    const t = v.texture;
    if (!isObj(t)) fail('malformed', undefined, `${at}.texture`);
    const out: Record<string, string> = {};
    for (const k of TEXTURE_KEYS) {
      const x = t[k];
      if (x === undefined) continue;
      if (!oneOf(x, TEXTURE_AXES[k])) fail('malformed', undefined, `${at}.texture.${k}`);
      out[k] = x;
    }
    if (Object.keys(t).some((k) => !(TEXTURE_KEYS as string[]).includes(k))) fail('malformed', undefined, `${at}.texture`);
    if (Object.keys(out).length > 0) texture = out as Texture;
  }
  let runout: Runout[] | null = null;
  if (v.runout !== undefined && v.runout !== null) {
    const r = v.runout;
    if (!Array.isArray(r) || !r.every((x) => oneOf(x, RUNOUTS)) || new Set(r).size !== r.length) fail('malformed', undefined, `${at}.runout`);
    if (r.length > 0) runout = RUNOUTS.filter((x) => r.includes(x));
  }
  let size: ReadSize | null = null;
  if (v.size !== undefined && v.size !== null) {
    if (!oneOf(v.size, READ_SIZES)) fail('malformed', undefined, `${at}.size`);
    size = v.size;
  }

  // 組み合わせ（表 2 枚と条件の決まり）
  if (!STREET_ACTIONS[street].includes(action)) fail('invalid_reads', undefined, `${at}: ${street} に ${action} は無い`);
  if (!leansOf(action).includes(lean)) fail('invalid_reads', undefined, `${at}: ${action} に ${lean} は選べない`);
  if (texture && street === 'pf') fail('invalid_reads', undefined, `${at}: Preflop に texture`);
  if (runout && street !== 'turn' && street !== 'river') fail('invalid_reads', undefined, `${at}: runout は Turn・River だけ`);
  if (runout && runoutConflicts(runout)) fail('invalid_reads', undefined, `${at}: Brick とほかの Runout`);
  if (size && (!AGGRESSIVE_ACTIONS.includes(action) || !sizesOf(street).includes(size))) fail('invalid_reads', undefined, `${at}: size`);
  // Spot Read は Board を入れない（実際の Board が画面にある）
  if (scope === 'spot' && (texture || runout)) fail('invalid_reads', undefined, `${at}: Spot Read に条件`);
  return { scope, street, action, texture, runout, size, lean, strong };
}

/**
 * Reads の形の検証。`seats` は座っている席、`hero` は Hero の席。
 * 省略（undefined・null）は情報なし（{}）。中身の無い席は落とす。
 * 席が登録できる席か・Spot Read が実際の Action に合うかは、ハンドを再生したあとの `verifyReads` で確かめる。
 */
export function validateReads(raw: unknown, seats: readonly Pos[], hero: Pos): VillainReads {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) fail('malformed', undefined, 'villain_reads');
  const out: VillainReads = {};
  for (const [seat, v] of Object.entries(raw)) {
    const at = `villain_reads.${seat}`;
    if (!isPos(seat) || !seats.includes(seat) || seat === hero) fail('malformed', undefined, at);
    if (!isObj(v)) fail('malformed', undefined, at);
    const read: VillainRead = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'reads') {
        if (!Array.isArray(x)) fail('malformed', undefined, `${at}.reads`);
        const entries = x.map((e, i) => validateEntry(e, `${at}.reads[${i}]`));
        if (entries.filter((e) => e.scope === 'spot').length > SPOT_READ_MAX) fail('invalid_reads', undefined, `${at}: Spot Read が多い`);
        if (entries.filter((e) => e.scope === 'general').length > GENERAL_READ_MAX) fail('invalid_reads', undefined, `${at}: General Read が多い`);
        // Spot Read を先に
        if (entries.length > 0) read.reads = [...entries.filter((e) => e.scope === 'spot'), ...entries.filter((e) => e.scope === 'general')];
        continue;
      }
      if (!(TENDENCY_KEYS as readonly string[]).includes(k)) fail('malformed', undefined, `${at}.${k}`);
      const key = k as TendencyKey;
      if (typeof x !== 'number' || !Number.isInteger(x)) fail('malformed', undefined, `${at}.${k}`);
      const max = PERCENT_READS.includes(key) ? PERCENT_MAX : STEP_MAX;
      if (x < 0 || x > max) fail('invalid_reads', undefined, `${at}.${k}`);
      read[key] = x;
    }
    // PFR は VPIP を超えない（両方あるときだけ）
    if (read.vpip !== undefined && read.pfr !== undefined && read.pfr > read.vpip) {
      fail('invalid_reads', undefined, `${at} の PFR が VPIP を超える`);
    }
    if (Object.keys(read).length > 0) out[seat] = read;
  }
  return out;
}

/**
 * ハンドに照らした Reads の検証（create-post はハンドを再生したあとに呼ぶ。18 章 §3）:
 * 情報を登録できる席（`villainSeats`）だけか、Spot Read が Hero の判断地点より前の実際の Action（Street・Action・Size）に合うか。
 */
export function verifyReads(reads: VillainReads, setup: HandSetup, actions: readonly Action[], hero: Pos, spotIndex: number): void {
  const eligible = villainSeats(setup, actions, hero);
  const cands = readCandidates(setup, actions, hero, spotIndex);
  for (const [seat, read] of Object.entries(reads) as [Pos, VillainRead][]) {
    if (!eligible.includes(seat)) fail('invalid_reads', undefined, `villain_reads.${seat}: 登録できない席`);
    for (const e of read.reads ?? []) {
      if (e.scope !== 'spot') continue;
      const ok = cands.some((c) => c.pos === seat && c.street === e.street && c.action === e.action && c.size === e.size);
      if (!ok) fail('invalid_reads', undefined, `villain_reads.${seat}: Spot Read が実際の Action に合わない`);
    }
  }
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
        // 0.1 以上、小数第 1 位まで。浮動小数の誤差（0.1 + 0.2）は許すが、許容は値の大きさに比例させる
        // （絶対の許容 1e-9 だと 1e-10・12.3 + 1e-11 が通っていた。villain-reads-test V-021）
        if (v < 0.1 || v > MTT_AVG_MAX || Math.abs(v * 10 - Math.round(v * 10)) > 16 * Number.EPSILON * v * 10) fail('invalid_mtt', undefined, 'mtt.avg');
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
