/**
 * T5（モンキーテスト）の Node 側の生成器: ランダムな投稿の下書き（Draft）・Villain の Read・MTT の情報・回答画面用の本文。
 * すべて種（seed）を決めた擬似乱数（release.tb.gen.ts の Rng）から作る。本番のコードからは使わない。
 */
import {
  AGGRESSIVE_ACTIONS,
  leansOf,
  PRIZE_STRUCTURES,
  RUNOUTS,
  sizesOf,
  STREET_ACTIONS,
  STREETS,
  TEXTURE_AXES,
  TEXTURE_KEYS,
  validateInput,
  ValidationError,
  verifyPost,
  type Pos,
  type ReadCandidate,
} from '../../packages/core/src/index.ts';
import { Rng } from '../../packages/core/src/poker/release.tb.gen.ts';
import { buildDraft } from '../../packages/app/src/post/release.tb.draftgen.ts';
import { submissionBody, villainContext, type Draft } from '../../packages/app/src/post/draft.ts';
import {
  cycleLean,
  emptyGeneral,
  isAggressive,
  readsForSubmit,
  setGeneralAction,
  setGeneralStreet,
  toggleRunout,
  toggleSize,
  toggleTexture,
  type GeneralDraft,
  type MttDraft,
  type ReadsDraft,
  type SeatDraft,
} from '../../packages/app/src/reads/readsModel.ts';

export { Rng };

/** 本文をサーバーと同じ判定（validateInput + verifyPost）に通す */
export function serverJudge(body: unknown): { ok: true } | { ok: false; code: string; message: string } {
  try {
    verifyPost(validateInput(JSON.parse(JSON.stringify(body))));
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, code: e.code, message: `${e.code}${e.index !== undefined ? '@' + e.index : ''}: ${e.message}` };
    return { ok: false, code: 'exception', message: String((e as Error)?.stack ?? e).slice(0, 300) };
  }
}

/** 1 席分のランダムな入力（全項目を任意に。Spot Read は候補があるときだけ） */
export function randomSeat(rng: Rng, cands: readonly ReadCandidate[], density = 0.6): SeatDraft {
  const s: SeatDraft = {};
  if (rng.chance(density)) {
    s.vpip = rng.int(0, 100);
    if (rng.chance(0.7)) s.pfr = rng.int(0, s.vpip);
  } else if (rng.chance(0.2)) s.pfr = rng.int(0, 100);
  if (rng.chance(density * 0.6)) s.agg = rng.int(0, 4);
  if (rng.chance(density * 0.6)) s.image = rng.int(0, 4);
  if (cands.length > 0 && rng.chance(density)) {
    const c = rng.pick(cands);
    const leans = leansOf(c.action);
    s.spot = { street: c.street, action: c.action, lean: rng.pick(leans), strong: rng.chance(0.3) };
  }
  const n = rng.pick([0, 0, 1, 1, 2]);
  const general: GeneralDraft[] = [];
  for (let i = 0; i < n; i++) general.push(randomGeneral(rng));
  if (general.length > 0) s.general = general;
  return s;
}

/** ランダムな General Read（最後まで選んだもの） */
export function randomGeneral(rng: Rng): GeneralDraft {
  const street = rng.pick(STREETS);
  let g = setGeneralStreet(emptyGeneral(), street);
  const action = rng.pick(STREET_ACTIONS[street]);
  g = setGeneralAction(g, action);
  if (street !== 'pf') {
    for (const k of TEXTURE_KEYS) if (rng.chance(0.3)) g = toggleTexture(g, k, rng.pick(TEXTURE_AXES[k] as readonly string[]));
  }
  if (street === 'turn' || street === 'river') for (const r of RUNOUTS) if (rng.chance(0.25)) g = toggleRunout(g, r);
  if (AGGRESSIVE_ACTIONS.includes(action) && rng.chance(0.6)) g = toggleSize(g, rng.pick(sizesOf(street)));
  const lean = rng.pick(leansOf(action));
  let c = cycleLean({ lean: null, strong: false }, lean);
  if (rng.chance(0.3)) c = cycleLean(c, lean);
  void isAggressive;
  return { ...g, lean: c.lean, strong: c.strong };
}

export function randomReadsDraft(rng: Rng, seats: readonly Pos[], cands: readonly ReadCandidate[]): ReadsDraft {
  const out: ReadsDraft = {};
  for (const p of seats) {
    if (!rng.chance(0.65)) continue;
    const s = randomSeat(rng, cands.filter((c) => c.pos === p));
    if (Object.keys(s).length > 0) out[p] = s;
  }
  return out;
}

/** ランダムな MTT の入力（人数の大小は守る。守らない値は guard=false で混ぜる） */
export function randomMttDraft(rng: Rng, valid = true): MttDraft {
  const m: MttDraft = { speed: rng.chance(0.7) ? rng.int(0, 100) : null, prize: rng.chance(0.6) ? rng.pick(PRIZE_STRUCTURES) : null, rank: '', left: '', paid: '', entries: '', avg: '' };
  const entries = rng.int(2, 3000);
  const left = rng.int(2, entries);
  const rank = rng.int(1, left);
  if (rng.chance(0.7)) m.entries = String(entries);
  if (rng.chance(0.7)) m.left = String(left);
  if (rng.chance(0.7)) m.rank = String(rank);
  if (rng.chance(0.6)) m.paid = String(rng.int(1, entries));
  if (rng.chance(0.7)) m.avg = rng.chance(0.5) ? String(rng.int(1, 300)) : `${rng.int(1, 300)}.${rng.int(0, 9)}`;
  if (!valid && rng.chance(0.5)) m.rank = rng.pick(['0', '1.5', '１２', '-1', '1e3', ' ', 'x', '1000001']);
  return m;
}

export type Built = { draft: Draft; body: Record<string, unknown>; seats: Pos[]; cands: ReadCandidate[] };

/**
 * 投稿できる（サーバーの判定を通る）ランダムな下書きを作る。Villain の席と Spot Read の候補があるものを選ぶ。
 * `withReads` なら下書きにランダムな Read・MTT を入れる（Read は core の検証を通る形）。
 */
export function postableDraft(seed: number, n: number, opts: { withReads?: boolean; needCands?: boolean; mtt?: boolean } = {}): Built {
  for (let k = 0; k < 400; k++) {
    const rng = new Rng(seed * 100003 + n * 7919 + k * 31 + 1);
    const { draft } = buildDraft(rng);
    if (opts.mtt) draft.fmt = 'mtt';
    if (draft.spotIndex === null) continue;
    let vc;
    try {
      vc = villainContext(draft);
    } catch {
      continue;
    }
    if (vc.seats.length === 0) continue;
    if (opts.needCands && vc.cands.length === 0) continue;
    if (draft.title.trim() === '') continue;
    if (opts.withReads) {
      draft.reads = randomReadsDraft(rng, vc.seats, vc.cands);
      draft.mtt = draft.fmt === 'mtt' ? randomMttDraft(rng) : draft.mtt;
    }
    let body: Record<string, unknown>;
    try {
      body = submissionBody(draft);
    } catch {
      continue;
    }
    if (!serverJudge(body).ok) continue;
    return { draft, body, seats: vc.seats, cands: vc.cands };
  }
  throw new Error(`postableDraft: 作れない seed=${seed} n=${n}`);
}

/** 回答画面の本文（get_post_detail の元）。Villain・MTT の情報は bodyで入れ替えられる */
export function readsOfBody(b: Built): Record<string, unknown> {
  return readsForSubmit(b.draft.reads, b.seats, b.cands) as Record<string, unknown>;
}
