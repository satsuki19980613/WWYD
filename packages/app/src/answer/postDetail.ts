import {
  ANSWER_KEYS,
  bbToMbb,
  decodeAggregate,
  decodePaint,
  fromHex,
  isCard,
  POSITIONS,
  STREETS,
  type Action,
  type ActionType,
  type AggCell,
  type AnswerKey,
  type Card,
  type HandSetup,
  type Mbb,
  type Paint,
  type Pos,
  type Street,
} from '@wwyd/core';

/**
 * `get_post_detail` の結果（詳細仕様 02 章 §4.3）を画面で使う形にする。金額は mbb、paint と集計はデコード済み。
 * 形が想定と違えば例外（画面では「読み込みに失敗しました」）。
 */

export type Viewer = 'author' | 'answered' | 'unanswered';

export type SavedAnswer = { paint: Paint; size: Mbb | null };

export type PostDetail = {
  viewer: Viewer;
  post: {
    id: string;
    title: string;
    fmt: 'cash' | 'mtt';
    hero: Pos;
    villain: Pos;
    street: Street;
    effectiveStack: Mbb;
    keys: AnswerKey[];
    s1Label: 'bet' | 'raise' | null;
    minTo: Mbb | null;
    maxTo: Mbb | null;
    potBase: Mbb;
    answerCount: number;
    isMine: boolean;
    canDelete: boolean;
  };
  hand: {
    setup: HandSetup;
    board: Card[];
    /** 未回答者には停止位置より前（添字 0..stopIndex-1）だけが返る（`truncated`）。 */
    actions: Action[];
    spotIndex: number;
    stopIndex: number;
    truncated: boolean;
  };
  /** Hero のハンドと判明しているハンド。未回答者には返らない。 */
  secrets: { heroCards: Card[]; knownCards: Partial<Record<Pos, Card[] | 'muck'>> } | null;
  myAnswer: SavedAnswer | null;
  hostAnswer: SavedAnswer | null;
  aggregate: { n: number; cells: AggCell[] } | null;
};

type Obj = Record<string, unknown>;

class DetailShapeError extends Error {}

function bad(what: string): never {
  throw new DetailShapeError(`get_post_detail の形が不正: ${what}`);
}

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) bad(what);
  return v as Obj;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') bad(what);
  return v;
}

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) bad(what);
  return v;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], what: string): T {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) bad(what);
  return v as T;
}

/** DB の numeric（bb）→ mbb。JSON では数値で来る（文字列でも受ける）。 */
function amount(v: unknown, what: string): Mbb {
  const n = typeof v === 'string' ? Number(v) : v;
  const m = typeof n === 'number' ? bbToMbb(n) : null;
  if (m === null) bad(what);
  return m;
}

function nullableAmount(v: unknown, what: string): Mbb | null {
  return v === null || v === undefined ? null : amount(v, what);
}

function cards(v: unknown, what: string): Card[] {
  if (!Array.isArray(v) || !v.every(isCard)) bad(what);
  return v as Card[];
}

const ACTION_TYPES: readonly ActionType[] = ['fold', 'check', 'call', 'bet', 'raise'];

function parseAction(v: unknown, i: number): Action {
  const a = obj(v, `actions[${i}]`);
  const action: Action = {
    street: oneOf(a.street, STREETS, `actions[${i}].street`),
    pos: oneOf(a.pos, POSITIONS, `actions[${i}].pos`),
    type: oneOf(a.type, ACTION_TYPES, `actions[${i}].type`),
  };
  if (a.to !== undefined && a.to !== null) action.to = amount(a.to, `actions[${i}].to`);
  return action;
}

function parseSaved(v: unknown, what: string): SavedAnswer | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, what);
  try {
    return { paint: decodePaint(fromHex(str(o.paint, `${what}.paint`))), size: nullableAmount(o.size, `${what}.size`) };
  } catch (e) {
    if (e instanceof DetailShapeError) throw e;
    return bad(`${what}.paint`);
  }
}

export function parsePostDetail(raw: unknown): PostDetail {
  const r = obj(raw, '全体');
  const p = obj(r.post, 'post');
  const h = obj(r.hand, 'hand');

  const stacksRaw = obj(h.stacks, 'hand.stacks');
  const stacks = {} as Record<Pos, Mbb>;
  for (const pos of POSITIONS) stacks[pos] = amount(stacksRaw[pos], `hand.stacks.${pos}`);

  if (!Array.isArray(h.actions)) bad('hand.actions');
  if (!Array.isArray(p.keys)) bad('post.keys');

  let secrets: PostDetail['secrets'] = null;
  if (r.secrets !== null && r.secrets !== undefined) {
    const s = obj(r.secrets, 'secrets');
    const knownRaw = s.known_cards === null || s.known_cards === undefined ? {} : obj(s.known_cards, 'secrets.known_cards');
    const knownCards: Partial<Record<Pos, Card[] | 'muck'>> = {};
    for (const [pos, v] of Object.entries(knownRaw)) {
      const key = oneOf(pos, POSITIONS, 'secrets.known_cards の席');
      knownCards[key] = v === 'muck' ? 'muck' : cards(v, `secrets.known_cards.${pos}`);
    }
    secrets = { heroCards: cards(s.hero_cards, 'secrets.hero_cards'), knownCards };
  }

  let aggregate: PostDetail['aggregate'] = null;
  if (r.aggregate !== null && r.aggregate !== undefined) {
    const g = obj(r.aggregate, 'aggregate');
    try {
      aggregate = { n: int(g.n, 'aggregate.n'), cells: decodeAggregate(fromHex(str(g.cells, 'aggregate.cells'))) };
    } catch (e) {
      if (e instanceof DetailShapeError) throw e;
      bad('aggregate.cells');
    }
  }

  return {
    viewer: oneOf(r.viewer, ['author', 'answered', 'unanswered'] as const, 'viewer'),
    post: {
      id: str(p.id, 'post.id'),
      title: str(p.title, 'post.title'),
      fmt: oneOf(p.fmt, ['cash', 'mtt'] as const, 'post.fmt'),
      hero: oneOf(p.hero, POSITIONS, 'post.hero'),
      villain: oneOf(p.villain, POSITIONS, 'post.villain'),
      street: oneOf(p.street, STREETS, 'post.street'),
      effectiveStack: amount(p.effective_stack, 'post.effective_stack'),
      keys: p.keys.map((k: unknown) => oneOf(k, ANSWER_KEYS, 'post.keys')),
      s1Label: p.s1_label === null ? null : oneOf(p.s1_label, ['bet', 'raise'] as const, 'post.s1_label'),
      minTo: nullableAmount(p.min_to, 'post.min_to'),
      maxTo: nullableAmount(p.max_to, 'post.max_to'),
      potBase: amount(p.pot_base, 'post.pot_base'),
      answerCount: int(p.answer_count, 'post.answer_count'),
      isMine: p.is_mine === true,
      canDelete: p.can_delete === true,
    },
    hand: {
      setup: {
        sb: amount(h.sb, 'hand.sb'),
        bb: amount(h.bb, 'hand.bb'),
        ante: amount(h.ante, 'hand.ante'),
        stacks,
      },
      board: cards(h.board, 'hand.board'),
      actions: h.actions.map(parseAction),
      spotIndex: int(h.spot_index, 'hand.spot_index'),
      stopIndex: int(h.stop_index, 'hand.stop_index'),
      truncated: h.truncated === true,
    },
    secrets,
    myAnswer: parseSaved(r.my_answer, 'my_answer'),
    hostAnswer: parseSaved(r.host_answer, 'host_answer'),
    aggregate,
  };
}

// ---- エラー ----

/** Data API（PostgREST）のエラーの形（必要な分だけ）。 */
export type ApiError = { code?: string; message?: string } | null;

/**
 * Data API のエラーを画面で扱うコードにする。
 * - `public.fail()` は SQLSTATE P0001 で message にコードを入れる（02 章）。
 * - 回答の主キー重複（23505）は `already_answered`。
 * - URL の ID が UUID の形でない（22P02）は、存在しない投稿と同じ扱い。
 * - RLS の拒否（42501）は「この操作はできません」。
 * - 通信の失敗は `network`。
 */
export function errorCode(err: ApiError): string {
  if (!err) return 'internal';
  if (err.code === '23505') return 'already_answered';
  if (err.code === '22P02') return 'post_not_found';
  if (err.code === '42501') return 'own_post';
  if (err.code === 'P0001' && err.message) return err.message;
  // postgrest-js は fetch の失敗を例外にせず、コードの無いエラーとして返す
  if (!err.code && /fetch|network/i.test(err.message ?? '')) return 'network';
  return 'internal';
}

/** 回答・想定レンジの送信のエラー文（06 章 §7）。`already_answered` は表示せずに集計へ移る。 */
export function answerErrorMessage(code: string): string {
  if (code.startsWith('paint_') || code.startsWith('size_')) return '回答の内容が正しくありません';
  switch (code) {
    case 'post_not_found':
      return 'スポットが見つかりません';
    case 'own_post':
    case 'not_author':
      return 'この操作はできません';
    case 'not_authenticated':
      return 'ログインし直してください';
    case 'not_allowed':
      return 'このアカウントは利用できません';
    case 'network':
      return '通信に失敗しました';
    default:
      return 'エラーが発生しました';
  }
}
