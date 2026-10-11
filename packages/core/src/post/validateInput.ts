/**
 * 投稿入力の形の検証（詳細仕様 03 章 §3.1・§3.2 の 2、04 章 §10.12 の VAL-04・10・11・15〜17）。
 * JSON（金額は bb の数値）を受け取り、金額を mbb にした型付きの入力を返す。違反は ValidationError。
 * クライアント（送信前）と Edge Function `create-post` の両方がこの関数を使う。
 */
import { ANSWER_KEYS, playerCountOf, POSITIONS, STREETS, type AnswerKey, type Pos, type Street } from '../constants.ts';
import { isCard, type Card } from '../cards.ts';
import { fail } from '../errors.ts';
import { bbToMbb, MAX_STACK_MBB, type Mbb } from '../money.ts';
import type { Derived } from '../poker/spot.ts';
import type { Action, ActionType, HandSetup } from '../poker/state.ts';
import { validateMtt, validateReads, type MttInfo, type VillainReads } from './reads.ts';

export type Fmt = 'cash' | 'mtt';

export type PostInput = {
  title: string;
  fmt: Fmt;
  setup: HandSetup;
  /** レーキ（%）。MTT は null。 */
  rake: number | null;
  hero: Pos;
  heroCards: [Card, Card];
  knownCards: Partial<Record<Pos, [Card, Card]>>;
  board: Card[];
  actions: Action[];
  spotIndex: number;
  derived: Derived;
  /** Villain の情報（18 章。情報なしは {}） */
  reads: VillainReads;
  /** MTT の情報（18 章。MTT 以外・情報なしは null） */
  mtt: MttInfo | null;
};

/** タイトルの最大文字数（コードポイント数。DB の char_length と同じ数え方）。 */
export const TITLE_MAX = 40;

const ACTION_TYPES: readonly ActionType[] = ['fold', 'check', 'call', 'bet', 'raise'];

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPos(v: unknown): v is Pos {
  return typeof v === 'string' && (POSITIONS as readonly string[]).includes(v);
}

function isStreet(v: unknown): v is Street {
  return typeof v === 'string' && (STREETS as readonly string[]).includes(v);
}

/** bb の金額を mbb に（小数第 4 位以下・上限超・数値でない → malformed）。 */
function amount(v: unknown, what: string): Mbb {
  const m = typeof v === 'number' ? bbToMbb(v) : null;
  if (m === null) fail('malformed', undefined, what);
  return m;
}

function nullableAmount(v: unknown, what: string): Mbb | null {
  return v === null ? null : amount(v, what);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function cardPair(v: unknown): [Card, Card] | null {
  return Array.isArray(v) && v.length === 2 && isCard(v[0]) && isCard(v[1]) ? [v[0], v[1]] : null;
}

/** 対のないサロゲート（上位だけ・下位だけ）。 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** DB（jsonb）が受け付けない文字（NUL・対のないサロゲート）を含むか。 */
export function hasUnstorableChar(s: string): boolean {
  return s.includes('\u0000') || LONE_SURROGATE.test(s);
}

/** タイトル（前後の空白を除いて 1〜40 文字）。 */
function parseTitle(raw: unknown): string {
  if (typeof raw !== 'string') fail('malformed', undefined, 'title');
  const title = raw.trim();
  const titleLength = [...title].length;
  if (titleLength < 1 || titleLength > TITLE_MAX) fail('invalid_title');
  // DB（jsonb）が受け付けない文字（NUL・対のないサロゲート）。通すと保存で落ちるので入力の誤りとして断る（リリース前テスト TB-2）
  if (hasUnstorableChar(title)) fail('invalid_title');
  return title;
}

/** 席とスタック。席は stacks のキーで決まる（2〜6 人。人数ごとの席のどれかと一致すること。04 章 §2.1）。空席は 0 */
function parseStacks(raw: unknown): { seats: Pos[]; stacks: Record<Pos, Mbb> } {
  if (!isObj(raw)) fail('malformed', undefined, 'stacks');
  if (Object.keys(raw).some((k) => !isPos(k))) fail('malformed', undefined, 'stacks の席');
  const seats = Object.keys(raw) as Pos[];
  if (playerCountOf(seats) === null) fail('invalid_settings');
  const stacks = {} as Record<Pos, Mbb>;
  for (const p of POSITIONS) stacks[p] = seats.includes(p) ? amount(raw[p], `stacks.${p}`) : 0;
  return { seats, stacks };
}

/** レーキは % で小数第 2 位まで（DB は numeric(5,2)）。省略・null は null。 */
function parseRake(r: unknown): number | null {
  if (r === null || r === undefined) return null;
  if (typeof r !== 'number' || !Number.isFinite(r) || Math.abs(r * 100 - Math.round(r * 100)) > 1e-6) {
    fail('malformed', undefined, 'rake');
  }
  return r;
}

function parseKnownCards(raw: unknown, hero: Pos, seats: readonly Pos[]): Partial<Record<Pos, [Card, Card]>> {
  const knownCards: Partial<Record<Pos, [Card, Card]>> = {};
  if (raw === undefined) return knownCards;
  if (!isObj(raw)) fail('malformed', undefined, 'known_cards');
  for (const [k, v] of Object.entries(raw)) {
    if (!isPos(k) || k === hero || !seats.includes(k)) fail('malformed', undefined, `known_cards.${k}`);
    const pair = cardPair(v);
    if (!pair) fail('malformed', undefined, `known_cards.${k}`);
    knownCards[k] = pair;
  }
  return knownCards;
}

function parseBoard(raw: unknown): Card[] {
  if (!Array.isArray(raw) || raw.length > 5 || !raw.every(isCard)) {
    fail('malformed', undefined, 'board');
  }
  return raw;
}

function parseAction(a: unknown, i: number): Action {
  if (!isObj(a) || !isStreet(a.street) || !isPos(a.pos)) fail('malformed', i);
  if (typeof a.type !== 'string' || !(ACTION_TYPES as readonly string[]).includes(a.type)) fail('malformed', i);
  const type = a.type as ActionType;
  const sized = type === 'bet' || type === 'raise';
  const hasTo = a.to !== undefined && a.to !== null;
  if (sized !== hasTo) fail('malformed', i, 'to の有無');
  const action: Action = { street: a.street, pos: a.pos, type };
  if (sized) action.to = amount(a.to, `actions[${i}].to`);
  return action;
}

/** クライアントが計算した派生メタ（照合は verifyPost で行う）。 */
function parseDerived(d: unknown): Derived {
  if (!isObj(d)) fail('malformed', undefined, 'derived');
  if (!isStreet(d.street)) fail('malformed', undefined, 'derived.street');
  if (!Array.isArray(d.keys) || !d.keys.every((k) => (ANSWER_KEYS as readonly unknown[]).includes(k))) {
    fail('malformed', undefined, 'derived.keys');
  }
  if (d.s1_label !== null && d.s1_label !== 'bet' && d.s1_label !== 'raise') fail('malformed', undefined, 'derived.s1_label');
  if (!isInt(d.stop_index)) fail('malformed', undefined, 'derived.stop_index');
  return {
    street: d.street,
    keys: d.keys as AnswerKey[],
    s1Label: d.s1_label,
    minTo: nullableAmount(d.min_to, 'derived.min_to'),
    maxTo: nullableAmount(d.max_to, 'derived.max_to'),
    potBase: amount(d.pot_base, 'derived.pot_base'),
    effectiveStack: amount(d.effective_stack, 'derived.effective_stack'),
    stopIndex: d.stop_index,
  };
}

export function validateInput(raw: unknown): PostInput {
  if (!isObj(raw)) fail('malformed', undefined, '本文がオブジェクトでない');

  const title = parseTitle(raw.title);

  // 基本設定
  if (raw.fmt !== 'cash' && raw.fmt !== 'mtt') fail('malformed', undefined, 'fmt');
  const fmt: Fmt = raw.fmt;
  const sb = amount(raw.sb, 'sb');
  const bb = amount(raw.bb, 'bb');
  const ante = amount(raw.ante, 'ante');
  const { seats, stacks } = parseStacks(raw.stacks);
  const rake = parseRake(raw.rake);

  // BB は 1bb 固定（Q-4）。SB は 0 より大きく BB 以下。アンティは 0 以上。スタックは 0 より大きく 1000bb 以下（F-037）
  if (bb !== 1000 || sb <= 0 || sb > bb || ante < 0 || seats.some((p) => stacks[p] <= 0 || stacks[p] > MAX_STACK_MBB)) fail('invalid_settings');
  if (fmt === 'mtt' && rake !== null) fail('invalid_settings');
  if (rake !== null && (rake < 0 || rake > 100)) fail('invalid_settings');

  // Hero とカード
  if (!isPos(raw.hero)) fail('malformed', undefined, 'hero');
  const hero = raw.hero;
  if (!seats.includes(hero)) fail('invalid_settings');
  const heroCards = cardPair(raw.hero_cards);
  if (!heroCards) fail('hero_cards_required');
  const knownCards = parseKnownCards(raw.known_cards, hero, seats);
  const board = parseBoard(raw.board);

  // Villain・MTT の情報（全項目任意。18 章 §3）
  const reads = validateReads(raw.villain_reads, seats, hero);
  const mtt = validateMtt(raw.mtt, fmt);

  // アクション
  if (!Array.isArray(raw.actions)) fail('malformed', undefined, 'actions');
  const actions: Action[] = raw.actions.map((a: unknown, i: number) => parseAction(a, i));

  // スポット
  if (!isInt(raw.spot_index) || raw.spot_index < 0) fail('malformed', undefined, 'spot_index');

  const derived = parseDerived(raw.derived);

  return {
    title,
    fmt,
    setup: { sb, bb, ante, stacks },
    rake,
    hero,
    heroCards,
    knownCards,
    board,
    actions,
    spotIndex: raw.spot_index,
    derived,
    reads,
    mtt,
  };
}
