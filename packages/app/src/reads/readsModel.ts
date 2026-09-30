import {
  MEMO_MAX,
  MTT_AVG_MAX,
  MTT_COUNT_MAX,
  POSITIONS,
  PRIZE_STRUCTURES,
  PERCENT_MAX,
  PERCENT_READS,
  READ_KEYS,
  SPEED_MAX,
  STEP_MAX,
  type Action,
  type MttInfo,
  type Pos,
  type PrizeStructure,
  type ReadKey,
  type VillainRead,
  type VillainReads,
} from '@wwyd/core';

/**
 * Villain の情報（Reads）と MTT の情報の、画面での扱い（詳細仕様 18 章）。
 * 値の検証は packages/core（validateReads・validateMtt）。ここは段階のラベル・制約の追従・表示の文字列。
 */

/**
 * Slider の定義（Villain の情報と MTT の Tournament Type で共通）。`cuts` は段階の境目（% の値。値がこれ以上なら次の段階）。
 * 段階だけの項目は null（値がそのまま段階 0〜`max`）。% の項目は 0〜100 で、数を直接入れられる
 */
export type SliderDef = {
  name: string;
  /** 5 段階のラベル（段階を付けない Slider には無い） */
  labels?: readonly [string, string, string, string, string];
  cuts: readonly number[] | null;
  max: number;
  /** 段階を付けず、両端に名前を出す Slider（Tournament Type の Deep・Turbo） */
  ends?: readonly [string, string];
};
export type ReadDef = SliderDef & { key: ReadKey; labels: readonly [string, string, string, string, string] };

/** 5 段階の境目（2026-09-30 さつき: Claude の案。6-max の一般的な目安。18 章 §2.1） */
export const READ_DEFS: readonly ReadDef[] = [
  { key: 'vpip', name: 'VPIP', labels: ['Very Tight', 'Tight', 'Standard', 'Loose', 'Very Loose'], cuts: [15, 22, 30, 40], max: PERCENT_MAX },
  { key: 'pfr', name: 'PFR', labels: ['Very Low', 'Low', 'Standard', 'High', 'Very High'], cuts: [8, 14, 20, 26], max: PERCENT_MAX },
  {
    key: 'agg',
    name: 'Postflop Aggression',
    labels: ['Very Passive', 'Passive', 'Balanced', 'Aggressive', 'Very Aggressive'],
    cuts: [25, 40, 55, 70],
    max: PERCENT_MAX,
  },
  {
    key: 'conf',
    name: 'Read Confidence',
    labels: ['First Impression', 'Few Orbits', 'Some History', 'Long Session', 'HUD Stats'],
    cuts: null,
    max: STEP_MAX,
  },
  { key: 'image', name: 'Hero Image', labels: ['Very Tight', 'Tight', 'Standard', 'Loose', 'Very Loose'], cuts: null, max: STEP_MAX },
];

/** MTT の Tournament Type（ストラクチャーの速さ。段階を付けず、左端 Deep・右端 Turbo。表示も Slider。2026-09-30 さつき） */
export const SPEED_DEF: SliderDef = { name: 'Tournament Type', cuts: null, max: SPEED_MAX, ends: ['Deep', 'Turbo'] };

/** Slider の値の段階（0〜4）とラベル */
export function defLevel(def: SliderDef, value: number): number {
  if (!def.cuts) return Math.min(def.max, Math.max(0, Math.round(value)));
  return def.cuts.filter((c) => value >= c).length;
}
export const defLabel = (def: SliderDef, value: number): string => def.labels?.[defLevel(def, value)] ?? '';
export const defPercent = (def: SliderDef): boolean => def.cuts !== null;
/** 未入力の Slider をキーボードで最初に動かしたときの値（真ん中） */
export const defMiddle = (def: SliderDef): number => Math.round(def.max / 2);

export const READ_DEF: Record<ReadKey, ReadDef> = Object.fromEntries(READ_DEFS.map((d) => [d.key, d])) as Record<ReadKey, ReadDef>;

export const isPercent = (key: ReadKey): boolean => PERCENT_READS.includes(key);
export const maxOf = (key: ReadKey): number => (isPercent(key) ? PERCENT_MAX : STEP_MAX);

/** 値の段階（0〜4） */
export function levelOf(key: ReadKey, value: number): number {
  return defLevel(READ_DEF[key], value);
}

export function labelOf(key: ReadKey, value: number): string {
  return defLabel(READ_DEF[key], value);
}

/** 表示のバーの割合（0〜1）。段階だけの項目は段階の位置 */
export function ratioOf(key: ReadKey, value: number): number {
  return value / maxOf(key);
}

/** 未入力の Slider を触ったときの値（真ん中）。キーボードで最初に動かしたとき */
export function middleOf(key: ReadKey): number {
  return defMiddle(READ_DEF[key]);
}

/**
 * Slider の値を入れる。PFR は VPIP を超えない: PFR を VPIP より上げたら VPIP も上げ、VPIP を PFR より下げたら PFR も下げる
 * （両方が入力済みのときだけ。未入力の項目は触らない。18 章 §2.2）。
 */
export function setRead(read: VillainRead, key: ReadKey, value: number): VillainRead {
  const v = Math.min(maxOf(key), Math.max(0, Math.round(value)));
  const next: VillainRead = { ...read, [key]: v };
  if (key === 'pfr' && next.vpip !== undefined && v > next.vpip) next.vpip = v;
  if (key === 'vpip' && next.pfr !== undefined && next.pfr > v) next.pfr = v;
  return next;
}

/** 項目を未入力に戻す */
export function clearRead(read: VillainRead, key: ReadKey | 'memo'): VillainRead {
  const next = { ...read };
  delete next[key];
  return next;
}

export function isEmptyRead(read: VillainRead | undefined): boolean {
  return !read || (READ_KEYS.every((k) => read[k] === undefined) && (read.memo ?? '').trim() === '');
}

/** 送る形に（Memo の前後の空白を除き、空の項目と空の席を落とす）。`seats` は Villain の席（Hero 以外の座っている席） */
export function readsForSubmit(reads: VillainReads, seats: readonly Pos[]): VillainReads {
  const out: VillainReads = {};
  for (const p of seats) {
    const r = reads[p];
    if (!r || isEmptyRead(r)) continue;
    const x: VillainRead = {};
    for (const k of READ_KEYS) if (r[k] !== undefined) x[k] = r[k];
    const memo = (r.memo ?? '').trim();
    if (memo !== '') x.memo = memo;
    out[p] = x;
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 保存されていた 1 席分の情報を読み直す（範囲の外・型の違う項目は捨てる。PFR が VPIP を超えていれば PFR を捨てる） */
export function sanitizeRead(raw: unknown): VillainRead {
  const out: VillainRead = {};
  if (!isRecord(raw)) return out;
  for (const k of READ_KEYS) {
    const v = raw[k];
    const max = isPercent(k) ? PERCENT_MAX : STEP_MAX;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max) out[k] = v;
  }
  if (out.vpip !== undefined && out.pfr !== undefined && out.pfr > out.vpip) delete out.pfr;
  if (typeof raw.memo === 'string' && raw.memo.trim() !== '') out.memo = [...raw.memo].slice(0, MEMO_MAX).join('');
  return out;
}


/** 保存されていた席ごとの情報（下書き）を読み直す */
export function sanitizeReads(raw: unknown): VillainReads {
  const out: VillainReads = {};
  if (!isRecord(raw)) return out;
  for (const p of POSITIONS) {
    const r = sanitizeRead(raw[p]);
    if (!isEmptyRead(r)) out[p] = r;
  }
  return out;
}

/** 保存されていた MTT の欄（下書き）を読み直す */
export function sanitizeMtt(raw: unknown): MttDraft {
  const base = emptyMtt();
  if (!isRecord(raw)) return base;
  const pick = <T extends string>(v: unknown, all: readonly T[]): T | null => (all as readonly unknown[]).includes(v) ? (v as T) : null;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const speed = raw.speed;
  return {
    speed: typeof speed === 'number' && Number.isInteger(speed) && speed >= 0 && speed <= SPEED_MAX ? speed : null,
    prize: pick(raw.prize, PRIZE_STRUCTURES),
    rank: str(raw.rank),
    left: str(raw.left),
    paid: str(raw.paid),
    entries: str(raw.entries),
    avg: str(raw.avg),
  };
}

/** 折りたたんだ席の 1 行（入力した項目のラベルを並べる。VPIP / PFR は数でも） */
export function readSummary(read: VillainRead | undefined): string {
  if (!read) return '';
  const parts: string[] = [];
  if (read.vpip !== undefined && read.pfr !== undefined) parts.push(`${read.vpip}/${read.pfr}`);
  else if (read.vpip !== undefined) parts.push(labelOf('vpip', read.vpip));
  else if (read.pfr !== undefined) parts.push(`PFR ${labelOf('pfr', read.pfr)}`);
  if (read.agg !== undefined) parts.push(labelOf('agg', read.agg));
  const memo = (read.memo ?? '').trim();
  if (memo !== '') parts.push(`“${memo}”`);
  return parts.join(' · ');
}

/** Memo の文字数（コードポイント数） */
export const memoLength = (s: string): number => [...s].length;
export { MEMO_MAX };

// ---- MTT ----

export const PRIZE_LABEL: Record<PrizeStructure, string> = { top: 'Top-heavy', standard: 'Standard', flat: 'Flat' };
/** Prize Structure の目安（1st prize が賞金総額に占める割合。暫定値。18 章 §2.3。画面に出す例外。2026-09-30 さつき） */
export const PRIZE_HINT: Record<PrizeStructure, string> = { top: '1st ≥ 25%', standard: '1st 15–25%', flat: '1st < 15%' };

/** 投稿画面の MTT の欄（数の欄は入力のままの文字列） */
export type MttDraft = {
  /** Tournament Type（0 = Deep 〜 100 = Turbo。null は未入力） */
  speed: number | null;
  prize: PrizeStructure | null;
  rank: string;
  left: string;
  paid: string;
  entries: string;
  avg: string;
};

export type MttField = 'rank' | 'left' | 'paid' | 'entries' | 'avg';
/** 入力欄の並び（2026-09-30 さつき: スポットの順位・残りの人数・エントリー数・ITM・Avg Stack だけ。名前は日本語） */
export const MTT_FIELDS: readonly MttField[] = ['rank', 'left', 'entries', 'paid', 'avg'];
export const MTT_FIELD_LABEL: Record<MttField, string> = {
  rank: 'スポットの順位',
  left: '残りの人数',
  entries: 'エントリー数',
  paid: 'ITM',
  avg: 'Avg Stack（bb）',
};

export function emptyMtt(): MttDraft {
  return { speed: null, prize: null, rank: '', left: '', paid: '', entries: '', avg: '' };
}

/** 数の欄を読む（空は undefined、読めなければ null） */
function parseCount(text: string): number | undefined | null {
  const t = text.trim();
  if (t === '') return undefined;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MTT_COUNT_MAX ? n : null;
}

function parseAvg(text: string): number | undefined | null {
  const t = text.trim();
  if (t === '') return undefined;
  if (!/^\d+(\.\d)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= MTT_AVG_MAX ? n : null;
}

/** MTT の欄を送る形に。読めない欄は `invalid` に入れる（入力欄の順） */
export function parseMtt(m: MttDraft): { info: MttInfo | null; invalid: MttField[] } {
  const info: MttInfo = {};
  const invalid: MttField[] = [];
  if (m.speed !== null) info.speed = m.speed;
  if (m.prize) info.prize = m.prize;
  for (const f of MTT_FIELDS) {
    const v = f === 'avg' ? parseAvg(m.avg) : parseCount(m[f]);
    if (v === null) invalid.push(f);
    else if (v !== undefined) info[f] = v;
  }
  return { info: Object.keys(info).length > 0 ? info : null, invalid };
}

/** 「12/58 ・ ITM 50 ・ 320 entries」（無い項目は出さない。18 章 §2.4） */
export function mttCountsLine(m: MttInfo): string {
  const parts: string[] = [];
  if (m.rank !== undefined && m.left !== undefined) parts.push(`${m.rank}/${m.left}`);
  else if (m.rank !== undefined) parts.push(`#${m.rank}`);
  else if (m.left !== undefined) parts.push(`${m.left} left`);
  if (m.paid !== undefined) parts.push(`ITM ${m.paid}`);
  if (m.entries !== undefined) parts.push(`${m.entries} entries`);
  return parts.join(' ・ ');
}

export function hasMttInfo(m: MttInfo | null | undefined): m is MttInfo {
  return !!m && Object.keys(m).length > 0;
}

// ---- 回答画面の All Villains ----

/**
 * All Villains の並び: ポットに参加した席（Preflop で Fold していない席）を上に、Preflop で Fold した席を下に（折りたたむ）。
 * どちらも座席の順（`seats` の順）。`actions` は見せてよい範囲（停止位置まで）の Action。
 */
export function villainOrder(seats: readonly Pos[], hero: Pos, actions: readonly Action[]): { active: Pos[]; folded: Pos[] } {
  const pfFold = new Set(actions.filter((a) => a.street === 'pf' && a.type === 'fold').map((a) => a.pos));
  const villains = seats.filter((p) => p !== hero);
  return { active: villains.filter((p) => !pfFold.has(p)), folded: villains.filter((p) => pfFold.has(p)) };
}
