import {
  AGGRESSIVE_ACTIONS,
  isCheckRaise,
  leansOf,
  MTT_AVG_MAX,
  MTT_COUNT_MAX,
  PERCENT_MAX,
  POSITIONS,
  PRIZE_STRUCTURES,
  READ_ACTIONS,
  RUNOUTS,
  SPEED_MAX,
  STEP_MAX,
  STREET_ACTIONS,
  STREETS,
  sizesOf,
  TEXTURE_AXES,
  TEXTURE_KEYS,
  type Action,
  type Lean,
  type MttInfo,
  type Pos,
  type PrizeStructure,
  type ReadAction,
  type ReadCandidate,
  type ReadEntry,
  type ReadSize,
  type Runout,
  type Street,
  type Tendency,
  type Texture,
  type TextureAxis,
  type VillainRead,
  type VillainReads,
} from '@wwyd/core';

/**
 * Villain の情報（Reads）と MTT の情報の、画面での扱い（詳細仕様 18 章）。
 * 値の検証は packages/core（validateReads・verifyReads・validateMtt）。ここは表示の名前・入力の途中の形・制約の追従・表示の文字列。
 * 2026-09-30 さつきの仕様変更: Memo を廃止し、全体の傾向（VPIP・PFR の Slider と 5 分割のボタン 3 つ）と
 * 選択肢を組み合わせる Read（[When] · [Action] → [Lean]）にした（§2.1）。
 */

/**
 * Slider の定義（VPIP・PFR と MTT の Tournament Type で共通）。`cuts` は段階の境目（% の値。値がこれ以上なら次の段階）。
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

type Five = readonly [string, string, string, string, string];

export type PercentKey = 'vpip' | 'pfr';
export type StepKey = 'agg' | 'image' | 'sample';
export type ReadDef = SliderDef & { key: PercentKey; labels: Five };

/** VPIP・PFR の 5 段階の境目（2026-09-30 さつき: Claude の案。6-max の一般的な目安。18 章 §2.1） */
export const READ_DEFS: readonly ReadDef[] = [
  { key: 'vpip', name: 'VPIP', labels: ['Very Tight', 'Tight', 'Standard', 'Loose', 'Very Loose'], cuts: [15, 22, 30, 40], max: PERCENT_MAX },
  { key: 'pfr', name: 'PFR', labels: ['Very Low', 'Low', 'Standard', 'High', 'Very High'], cuts: [8, 14, 20, 26], max: PERCENT_MAX },
];
export const READ_DEF: Record<PercentKey, ReadDef> = { vpip: READ_DEFS[0] as ReadDef, pfr: READ_DEFS[1] as ReadDef };

/** 5 分割のボタンの項目（§2.1.1。ラベルは §10 C-1）。`hideMiddle` は表示で中央を出さない（§10 C-2） */
export type StepDef = { key: StepKey; name: string; labels: Five; ends: readonly [string, string]; hideMiddle: boolean };
export const STEP_DEFS: readonly StepDef[] = [
  {
    key: 'agg',
    name: 'Postflop Aggression',
    labels: ['Very Passive', 'Passive', 'Balanced', 'Aggressive', 'Very Aggressive'],
    ends: ['Passive', 'Aggressive'],
    hideMiddle: true,
  },
  { key: 'image', name: 'Hero Image', labels: ['Very Tight', 'Tight', 'Standard', 'Loose', 'Very Loose'], ends: ['Tight', 'Loose'], hideMiddle: true },
  {
    key: 'sample',
    name: 'Sample',
    labels: ['First Impression', 'Few Orbits', 'Some History', 'Long', 'HUD Stats'],
    ends: ['First Impression', 'HUD Stats'],
    hideMiddle: false,
  },
];
export const STEP_DEF: Record<StepKey, StepDef> = Object.fromEntries(STEP_DEFS.map((d) => [d.key, d])) as Record<StepKey, StepDef>;

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

export function labelOf(key: PercentKey, value: number): string {
  return defLabel(READ_DEF[key], value);
}

// ---- 表示の名前（英語。15 章 §1.1） ----

export const STREET_NAME: Record<Street, string> = { pf: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

export const ACTION_LABEL: Record<ReadAction, string> = {
  '3bet': '3-Bet',
  fold_3bet: 'Fold to 3-Bet',
  '4bet': '4-Bet',
  fold_4bet: 'Fold to 4-Bet',
  squeeze: 'Squeeze',
  limp: 'Limp',
  fold_steal: 'Fold to Steal',
  cbet: 'C-Bet',
  fold_cbet: 'Fold to C-Bet',
  barrel: 'Barrel',
  fold_barrel: 'Fold to Barrel',
  delayed_cbet: 'Delayed C-Bet',
  donk: 'Donk',
  probe: 'Probe',
  bet_vs_check: 'Bet vs Check',
  raise: 'Raise',
  fold_bet: 'Fold to Bet',
  fold_raise: 'Fold to Raise',
};

/** Raise は OOP のとき Check-Raise と出す（§10 C-7） */
export const actionName = (action: ReadAction, checkRaise: boolean): string => (action === 'raise' && checkRaise ? 'Check-Raise' : ACTION_LABEL[action]);

export const LEAN_LABEL: Record<Lean, string> = { over: 'Over', under: 'Under', value: 'Value-heavy', bluff: 'Bluff-heavy' };
/** 「強い」は文字の印 `++` を必ず付ける（色の濃さは補助。§10 B-3） */
export const leanText = (lean: Lean, strong: boolean): string => `${LEAN_LABEL[lean]}${strong ? '++' : ''}`;
/** 読み上げは言葉で */
export const leanSpeech = (lean: Lean, strong: boolean): string => `${LEAN_LABEL[lean]}${strong ? '（強い）' : ''}`;

export const SIZE_LABEL: Record<ReadSize, string> = { small: 'Small', big: 'Big', overbet: 'Overbet' };

export const TEXTURE_AXIS_NAME: Record<TextureAxis, string> = { high: 'High Card', suit: 'Suit', paired: 'Pairing', connect: 'Connectivity' };
export const TEXTURE_LABEL: { [K in TextureAxis]: Record<(typeof TEXTURE_AXES)[K][number], string> } = {
  high: { a: 'A-high', k: 'K-high', qj: 'Q/J-high', mid: 'Middle', low: 'Low' },
  suit: { rainbow: 'Rainbow', two: 'Two-tone', mono: 'Monotone' },
  paired: { unpaired: 'Unpaired', paired: 'Paired' },
  // §10 B-4: Straight possible / No straight
  connect: { straight: 'Straight possible', none: 'No straight' },
};
export const RUNOUT_LABEL: Record<Runout, string> = {
  brick: 'Brick',
  over: 'Overcard',
  flush: 'Flush Complete',
  straight: 'Straight Complete',
  pair: 'Board Pair',
};

export const isAggressive = (a: ReadAction): boolean => AGGRESSIVE_ACTIONS.includes(a);

/** Read 1 行: `River · Barrel (Big) → Value-heavy`（条件は Street と Action の間。§2.1.2） */
export function readLine(e: ReadEntry, checkRaise = false): string {
  const parts = [STREET_NAME[e.street]];
  if (e.texture) for (const k of TEXTURE_KEYS) {
    const v = e.texture[k];
    if (v) parts.push((TEXTURE_LABEL[k] as Record<string, string>)[v] as string);
  }
  for (const r of e.runout ?? []) parts.push(RUNOUT_LABEL[r]);
  parts.push(`${actionName(e.action, checkRaise)}${e.size ? ` (${SIZE_LABEL[e.size]})` : ''}`);
  return `${parts.join(' · ')} → ${leanText(e.lean, e.strong)}`;
}

/** Read の読み上げ（`++` を「強い」に） */
export function readSpeech(e: ReadEntry, checkRaise = false): string {
  return readLine({ ...e, strong: false }, checkRaise).replace(/→ .*$/, `→ ${leanSpeech(e.lean, e.strong)}`);
}

/** 表示で Raise を Check-Raise と出すか（Spot Read は実際の Action、General Read は Hero との位置） */
export function entryCheckRaise(e: ReadEntry, villain: Pos, hero: Pos, actions: readonly Action[]): boolean {
  return e.action === 'raise' && isCheckRaise(e.scope, e.street, villain, hero, actions);
}

/**
 * 全体の傾向のチップ（§2.1.6）: `VPIP 38` `PFR 12` `Passive` `Hero Image: Loose` `Sample: Long`。
 * Postflop Aggression・Hero Image の中央（Balanced・Standard）は出さない。Sample は中央も出す（§10 C-2）
 */
export function tendencyChips(t: Tendency): string[] {
  const out: string[] = [];
  if (t.vpip !== undefined) out.push(`VPIP ${t.vpip}`);
  if (t.pfr !== undefined) out.push(`PFR ${t.pfr}`);
  for (const d of STEP_DEFS) {
    const v = t[d.key];
    if (v === undefined || (d.hideMiddle && v === 2)) continue;
    const label = d.labels[v] as string;
    out.push(d.key === 'agg' ? label : `${d.name}: ${label}`);
  }
  return out;
}

/** 表示する中身があるか（中央だけの席は出さない） */
export function hasVisibleRead(r: VillainRead | undefined): boolean {
  return !!r && (tendencyChips(r).length > 0 || (r.reads?.length ?? 0) > 0);
}

// ---- 入力の途中の形（下書き） ----

/** Spot Read（When と Action は Action の列から。投稿者は候補と Lean を選ぶ。§2.1.4） */
export type SpotDraft = { street: Street; action: ReadAction; lean: Lean; strong: boolean };
/** General Read（Street → Action → Lean の順。途中は null） */
export type GeneralDraft = {
  street: Street | null;
  action: ReadAction | null;
  texture: Texture;
  runout: Runout[];
  size: ReadSize | null;
  lean: Lean | null;
  strong: boolean;
};
/** 1 席分の入力 */
export type SeatDraft = Tendency & { spot?: SpotDraft; general?: GeneralDraft[] };
export type ReadsDraft = Partial<Record<Pos, SeatDraft>>;

export const emptyGeneral = (): GeneralDraft => ({ street: null, action: null, texture: {}, runout: [], size: null, lean: null, strong: false });

/**
 * VPIP・PFR を入れる。PFR は VPIP を超えない: PFR を VPIP より上げたら VPIP も上げ、VPIP を PFR より下げたら PFR も下げる
 * （両方が入力済みのときだけ。未入力の項目は触らない。18 章 §2.2）。
 */
export function setRead<T extends Tendency>(read: T, key: PercentKey, value: number): T {
  const v = Math.min(PERCENT_MAX, Math.max(0, Math.round(value)));
  const next: T = { ...read, [key]: v };
  if (key === 'pfr' && next.vpip !== undefined && v > next.vpip) next.vpip = v;
  if (key === 'vpip' && next.pfr !== undefined && next.pfr > v) next.pfr = v;
  return next;
}

/** 5 分割のボタン: 押すと選び、選んでいるボタンをもう一度押すと未入力に戻す */
export function toggleStep<T extends Tendency>(read: T, key: StepKey, value: number): T {
  const next: T = { ...read };
  if (read[key] === value) delete next[key];
  else next[key] = Math.min(STEP_MAX, Math.max(0, value));
  return next;
}

/** 項目を未入力に戻す */
export function clearRead<T extends Tendency>(read: T, key: PercentKey | StepKey): T {
  const next = { ...read };
  delete next[key];
  return next;
}

/** Lean のボタン: 未選択 → 通常 → 強い → 未選択（§10 C-6）。別の Lean を押すとそれの通常 */
export function cycleLean(cur: { lean: Lean | null; strong: boolean }, lean: Lean): { lean: Lean | null; strong: boolean } {
  if (cur.lean !== lean) return { lean, strong: false };
  if (!cur.strong) return { lean, strong: true };
  return { lean: null, strong: false };
}

/** General Read の Street を選ぶ（もう一度押すと外す）。合わなくなった Action・条件・Size・Lean は外す */
export function setGeneralStreet(g: GeneralDraft, street: Street): GeneralDraft {
  if (g.street === street) return emptyGeneral();
  const action = g.action && STREET_ACTIONS[street].includes(g.action) ? g.action : null;
  return fitGeneral({ ...g, street, action });
}

/** General Read の Action を選ぶ（もう一度押すと外す） */
export function setGeneralAction(g: GeneralDraft, action: ReadAction): GeneralDraft {
  return fitGeneral({ ...g, action: g.action === action ? null : action });
}

/** Street・Action に合わない条件・Size・Lean を外す */
function fitGeneral(g: GeneralDraft): GeneralDraft {
  const next = { ...g };
  if (next.street === 'pf' || next.street === null) next.texture = {};
  if (next.street !== 'turn' && next.street !== 'river') next.runout = [];
  if (!next.action || !isAggressive(next.action) || (next.size && next.street && !sizesOf(next.street).includes(next.size))) next.size = null;
  if (!next.action || (next.lean && !leansOf(next.action).includes(next.lean))) {
    next.lean = null;
    next.strong = false;
  }
  return next;
}

/** Flop texture の軸のタグを選ぶ（軸ごとに 0〜1 つ。もう一度押すと外す） */
export function toggleTexture(g: GeneralDraft, axis: TextureAxis, value: string): GeneralDraft {
  const texture: Record<string, string> = { ...g.texture };
  if (texture[axis] === value) delete texture[axis];
  else texture[axis] = value;
  return { ...g, texture: texture as Texture };
}

/** Runout のタグ（複数選べる） */
export function toggleRunout(g: GeneralDraft, r: Runout): GeneralDraft {
  const has = g.runout.includes(r);
  return { ...g, runout: RUNOUTS.filter((x) => (x === r ? !has : g.runout.includes(x))) };
}

export function toggleSize(g: GeneralDraft, s: ReadSize): GeneralDraft {
  return { ...g, size: g.size === s ? null : s };
}

export const isCompleteGeneral = (g: GeneralDraft): boolean => g.street !== null && g.action !== null && g.lean !== null;

/** General Read を送る形に（途中なら null） */
export function generalEntry(g: GeneralDraft): ReadEntry | null {
  if (!g.street || !g.action || !g.lean) return null;
  const texture = Object.keys(g.texture).length > 0 ? { ...g.texture } : null;
  return {
    scope: 'general',
    street: g.street,
    action: g.action,
    texture,
    runout: g.runout.length > 0 ? [...g.runout] : null,
    size: g.size,
    lean: g.lean,
    strong: g.strong,
  };
}

/** Spot Read の候補から、この Spot Read の Action（同じ Street・Action の最後のもの） */
export function spotCandidateOf(spot: SpotDraft, seat: Pos, cands: readonly ReadCandidate[]): ReadCandidate | undefined {
  return [...cands].reverse().find((c) => c.pos === seat && c.street === spot.street && c.action === spot.action);
}

const TENDENCY_OF: readonly (PercentKey | StepKey)[] = ['vpip', 'pfr', 'agg', 'image', 'sample'];

export function isEmptySeat(s: SeatDraft | undefined): boolean {
  return !s || (TENDENCY_OF.every((k) => s[k] === undefined) && !s.spot && (s.general ?? []).length === 0);
}

/**
 * 送る形に（§2.1.7）。`seats` は情報を登録できる席（core の `villainSeats`）、`cands` は Spot Read の候補。
 * Spot Read は候補にある Action のときだけ（Size は実際の額から）、General Read は最後まで選んだものだけ送る。
 */
export function readsForSubmit(reads: ReadsDraft, seats: readonly Pos[], cands: readonly ReadCandidate[]): VillainReads {
  const out: VillainReads = {};
  for (const p of seats) {
    const s = reads[p];
    if (!s) continue;
    const x: VillainRead = {};
    for (const k of TENDENCY_OF) if (s[k] !== undefined) x[k] = s[k];
    const entries: ReadEntry[] = [];
    const c = s.spot ? spotCandidateOf(s.spot, p, cands) : undefined;
    if (s.spot && c) {
      entries.push({ scope: 'spot', street: c.street, action: c.action, texture: null, runout: null, size: c.size, lean: s.spot.lean, strong: s.spot.strong });
    }
    for (const g of s.general ?? []) {
      const e = generalEntry(g);
      if (e) entries.push(e);
    }
    if (entries.length > 0) x.reads = entries;
    if (Object.keys(x).length > 0) out[p] = x;
  }
  return out;
}

/** 最後まで選んでいない General Read のある席（投稿の前のエラー） */
export function incompleteSeats(reads: ReadsDraft, seats: readonly Pos[]): Pos[] {
  return seats.filter((p) => (reads[p]?.general ?? []).some((g) => !isCompleteGeneral(g) && !isBlankGeneral(g)));
}

/** 何も選んでいない General Read（送らない。エラーにもしない） */
export const isBlankGeneral = (g: GeneralDraft): boolean => g.street === null;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | null => ((all as readonly unknown[]).includes(v) ? (v as T) : null);

/** 保存されていた全体の傾向を読み直す（範囲の外・型の違う項目は捨てる。PFR が VPIP を超えていれば PFR を捨てる） */
export function sanitizeTendency(raw: unknown): Tendency {
  const out: Tendency = {};
  if (!isRecord(raw)) return out;
  for (const k of TENDENCY_OF) {
    const v = raw[k];
    const max = k === 'vpip' || k === 'pfr' ? PERCENT_MAX : STEP_MAX;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max) out[k] = v;
  }
  if (out.vpip !== undefined && out.pfr !== undefined && out.pfr > out.vpip) delete out.pfr;
  return out;
}

/** 保存されていた General Read を読み直す（合わない値は外す） */
export function sanitizeGeneral(raw: unknown): GeneralDraft | null {
  if (!isRecord(raw)) return null;
  let g = emptyGeneral();
  const street = oneOf(raw.street, STREETS);
  if (!street) return null;
  g = setGeneralStreet(g, street);
  const action = oneOf(raw.action, READ_ACTIONS);
  if (action && STREET_ACTIONS[street].includes(action)) g = setGeneralAction(g, action);
  if (isRecord(raw.texture) && street !== 'pf') {
    for (const k of TEXTURE_KEYS) {
      const v = oneOf(raw.texture[k], TEXTURE_AXES[k]);
      if (v) g = toggleTexture(g, k, v);
    }
  }
  if (Array.isArray(raw.runout) && (street === 'turn' || street === 'river')) g = { ...g, runout: RUNOUTS.filter((r) => (raw.runout as unknown[]).includes(r)) };
  const size = oneOf(raw.size, sizesOf(street));
  if (size && g.action && isAggressive(g.action)) g = { ...g, size };
  const lean = oneOf(raw.lean, ['over', 'under', 'value', 'bluff'] as const);
  if (lean && g.action && leansOf(g.action).includes(lean)) g = { ...g, lean, strong: raw.strong === true };
  return g;
}

/** 保存されていた 1 席分（下書き）を読み直す。前の版の Memo・Read Confidence は捨てる */
export function sanitizeSeat(raw: unknown): SeatDraft {
  const out: SeatDraft = sanitizeTendency(raw);
  if (!isRecord(raw)) return out;
  const sp = raw.spot;
  if (isRecord(sp)) {
    const street = oneOf(sp.street, STREETS);
    const action = oneOf(sp.action, READ_ACTIONS);
    const lean = oneOf(sp.lean, ['over', 'under', 'value', 'bluff'] as const);
    if (street && action && lean && STREET_ACTIONS[street].includes(action) && leansOf(action).includes(lean)) {
      out.spot = { street, action, lean, strong: sp.strong === true };
    }
  }
  if (Array.isArray(raw.general)) {
    const gs = raw.general.map(sanitizeGeneral).filter((g): g is GeneralDraft => g !== null).slice(0, 2);
    if (gs.length > 0) out.general = gs;
  }
  return out;
}

/** 保存されていた席ごとの情報（下書き）を読み直す */
export function sanitizeReads(raw: unknown): ReadsDraft {
  const out: ReadsDraft = {};
  if (!isRecord(raw)) return out;
  for (const p of POSITIONS) {
    const r = sanitizeSeat(raw[p]);
    if (!isEmptySeat(r)) out[p] = r;
  }
  return out;
}

/** 折りたたんだ席の 1 行（例「38/12 · Passive · 2 Reads」） */
export function seatSummary(s: SeatDraft | undefined): string {
  if (!s) return '';
  const parts: string[] = [];
  if (s.vpip !== undefined && s.pfr !== undefined) parts.push(`${s.vpip}/${s.pfr}`);
  else if (s.vpip !== undefined) parts.push(`VPIP ${s.vpip}`);
  else if (s.pfr !== undefined) parts.push(`PFR ${s.pfr}`);
  parts.push(...tendencyChips({ agg: s.agg, image: s.image, sample: s.sample }).map((c) => c));
  const n = (s.spot ? 1 : 0) + (s.general ?? []).filter(isCompleteGeneral).length;
  if (n > 0) parts.push(`${n} Read${n > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

// ---- MTT ----

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
