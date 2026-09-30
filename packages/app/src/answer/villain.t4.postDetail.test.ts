/**
 * T4-04（Villain・MTT の情報（P11）の総合テスト。docs/villain-reads-test-plan.md §3 T4）: 前の版の投稿・形の違う情報が
 * `get_post_detail` の応答に来ても、回答画面・集計画面の読み込み（parsePostDetail）が落ちず「情報なし」になること。
 * T4-01（一周）の後半: create-post が保存に渡す値から作った応答を parsePostDetail で読み直すと、入れたものがそのまま出ること。
 */
import { describe, expect, it } from 'vitest';
import { hs1bb, hs3, type Raw } from '../../../core/src/post/postFixtures.ts';
import { createPostHandler } from '../../../functions/src/createPost/handler.ts';
import type { InsertPayload } from '../../../functions/src/createPost/payload.ts';
import { detailJson } from './detailFixtures.ts';
import { parsePostDetail } from './postDetail.ts';

const ID = '00000000-0000-4000-8000-000000000001';

function detailWith(hand: (h: Record<string, unknown>) => void, raw: Raw = hs1bb(), viewer: 'unanswered' | 'answered' | 'author' = 'unanswered'): unknown {
  const d = detailJson(raw, { viewer, id: ID, answerCount: viewer === 'answered' ? 1 : 0 });
  hand(d.hand as Record<string, unknown>);
  return JSON.parse(JSON.stringify(d));
}

describe('T4-04 前の版の投稿・形の違う情報でも、読み込みは落ちず「情報なし」になる', () => {
  it.each<[string, (h: Record<string, unknown>) => void]>([
    ['キーが無い（前の版の投稿）', (h) => { delete h.villain_reads; delete h.mtt; }],
    ['{} と null', (h) => { h.villain_reads = {}; h.mtt = null; }],
    ['villain_reads が JSON の null', (h) => { h.villain_reads = null; h.mtt = null; }],
    ['villain_reads が配列', (h) => { h.villain_reads = []; h.mtt = []; }],
    ['villain_reads が文字列・mtt が文字列', (h) => { h.villain_reads = 'x'; h.mtt = 'bubble'; }],
    ['villain_reads が数値・mtt が数値', (h) => { h.villain_reads = 5; h.mtt = 5; }],
    ['旧仕様の Memo の形', (h) => { h.villain_reads = { BTN: { memo: 'fish', vpip: 30 } }; }],
    ['旧仕様の conf・0〜100 の agg', (h) => { h.villain_reads = { BTN: { conf: 2, agg: 75 } }; }],
    ['旧仕様の MTT（stage・type）', (h) => { h.mtt = { stage: 'bubble', type: 'pko' }; }],
  ])('%s', (_n, f) => {
    const p = parsePostDetail(detailWith(f));
    expect(p.hand.reads).toEqual({});
    expect(p.hand.mtt).toBeNull();
    // 投稿そのものは読める
    expect(p.post.title).toBe('K83r のターンのバレルを受ける');
    expect(p.hand.actions.length).toBe(11);
  });

  it('席が範囲外（Hero の席）・席でないキーの villain_reads は情報なし', () => {
    expect(parsePostDetail(detailWith((h) => { h.villain_reads = { BB: { vpip: 10 } }; })).hand.reads).toEqual({}); // BB = Hero
    expect(parsePostDetail(detailWith((h) => { h.villain_reads = { XX: { vpip: 10 } }; })).hand.reads).toEqual({});
  });

  it('V-040: 1 席の形が違っても、ほかの正しい席の情報は残る（形の違う席だけ情報なし）', () => {
    const p = parsePostDetail(detailWith((h) => { h.villain_reads = { BTN: { vpip: 30 }, SB: { memo: 'x' } }; }));
    expect(p.hand.reads).toEqual({ BTN: { vpip: 30 } });
  });

  it('V-007: 廃止した Sample が残る前の版の投稿は、sample だけ捨ててほかの情報を出す', () => {
    expect(parsePostDetail(detailWith((h) => { h.villain_reads = { BTN: { vpip: 30, sample: 3 } }; })).hand.reads).toEqual({ BTN: { vpip: 30 } });
    // Sample だけの席は情報なし、ほかの席はそのまま
    const p = parsePostDetail(detailWith((h) => { h.villain_reads = { BTN: { vpip: 30, pfr: 20, agg: 1, sample: 4 }, SB: { sample: 0 } }; }));
    expect(p.hand.reads).toEqual({ BTN: { vpip: 30, pfr: 20, agg: 1 } });
  });

  it('記録（特性）: mtt は fmt が Cash の投稿でも、形が正しければそのまま読む', () => {
    const p = parsePostDetail(detailWith((h) => { h.mtt = { rank: 3 }; }));
    expect(p.post.fmt).toBe('cash');
    expect(p.hand.mtt).toEqual({ rank: 3 });
  });

  it('mtt が空のオブジェクトは null（情報なし）', () => {
    expect(parsePostDetail(detailWith((h) => { h.mtt = {}; }, hs3())).hand.mtt).toBeNull();
  });

  it('正しい情報は、未回答・回答済み・投稿者のどの viewer でもそのまま読める', () => {
    const reads = { BTN: { vpip: 30, pfr: 20, agg: 4, reads: [{ scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: true }] }, SB: { image: 0 } };
    const mtt = { speed: 70, rank: 5, left: 20, paid: 10, entries: 100, avg: 22.5, prize: 'standard' };
    for (const v of ['unanswered', 'answered', 'author'] as const) {
      const p = parsePostDetail(detailWith((h) => { h.villain_reads = reads; h.mtt = mtt; }, { ...hs3(), hero: 'BB' }, v));
      expect(p.hand.reads, v).toEqual(reads);
      expect(p.hand.mtt, v).toEqual(mtt);
    }
  });

  it('既存の検査は変わらない: 投稿の必須の形（actions・stacks）が崩れていれば今までどおり例外', () => {
    expect(() => parsePostDetail(detailWith((h) => { h.actions = 'x'; }))).toThrow();
    expect(() => parsePostDetail(detailWith((h) => { delete h.stacks; }))).toThrow();
  });
});

// ---- T4-01 の後半: create-post が保存に渡す値 → get_post_detail の形 → 画面が読む値 ----

const UID = '11111111-1111-4111-8111-111111111111';
async function inserted(body: Raw): Promise<InsertPayload> {
  let got: InsertPayload | undefined;
  const handler = createPostHandler({
    verifyToken: async () => UID,
    insertPost: async (_u, p) => { got = p; return ID; },
    allowedOrigins: ['http://localhost:5173'],
    logError: () => undefined,
  });
  const res = await handler(new Request('https://fn.example/', { method: 'POST', headers: { Authorization: 'Bearer x', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) }));
  expect(res.status).toBe(201);
  return got as InsertPayload;
}

/** insert_post が保存した値から、get_post_detail が返す形（DB の numeric は数値で来る）を作る */
function rawFromPayload(p: InsertPayload): Raw {
  return {
    title: p.title,
    fmt: p.fmt,
    sb: p.sb,
    bb: p.bb,
    ante: p.ante,
    rake: p.rake,
    stacks: p.stacks,
    hero: p.hero,
    hero_cards: p.hero_cards,
    known_cards: p.known_cards,
    board: p.board,
    actions: p.actions,
    spot_index: p.spot_index,
    derived: { street: p.street, keys: p.keys, s1_label: p.s1_label, min_to: p.min_to, max_to: p.max_to, pot_base: p.pot_base, effective_stack: p.effective_stack, stop_index: p.stop_index },
    villain_reads: p.villain_reads,
    mtt: p.mtt,
  };
}

describe('T4-01 一周（create-post の保存値 → 回答画面の読み込み）', () => {
  const general = { scope: 'general', street: 'flop', action: 'raise', texture: { high: 'a', connect: 'straight' }, runout: null, size: null, lean: 'bluff', strong: true };
  const spot = { scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: false };
  const mttIn = { speed: 50, rank: 12, left: 58, paid: 50, entries: 320, avg: 35.5, prize: 'flat' };

  it('Cash・6 人: 入れた Read と全体の傾向が、未回答の画面の読み込みにそのまま出る。未回答には後の Action が無い', async () => {
    const payload = await inserted({ ...hs1bb(), villain_reads: { BTN: { vpip: 40, pfr: 22, agg: 1, image: 3, reads: [general, spot] }, SB: { reads: [{ scope: 'spot', street: 'pf', action: 'fold_steal', texture: null, runout: null, size: null, lean: 'under', strong: false }] } } });
    const p = parsePostDetail(detailJson(rawFromPayload(payload), { viewer: 'unanswered', id: ID }));
    expect(p.hand.reads.BTN?.vpip).toBe(40);
    expect(p.hand.reads.BTN?.reads).toEqual([spot, general]); // Spot Read が先
    expect(p.hand.reads.SB?.reads?.[0]?.action).toBe('fold_steal');
    expect(p.hand.mtt).toBeNull();
    expect(p.hand.truncated).toBe(true);
    expect(p.hand.actions.length).toBe(p.hand.stopIndex); // 判断地点より前だけ
    expect(p.secrets).toBeNull();
    // 情報の中の Spot Read は、見える Action の範囲の Action だけ
    const seen = p.hand.actions.map((a) => `${a.street}:${a.pos}`);
    expect(seen).toContain('turn:BTN');
    expect(seen.some((s) => s.startsWith('river'))).toBe(false);
  });

  it('MTT: mtt の全項目（Tournament Type の 50・小数の Avg Stack）がそのまま出る', async () => {
    const payload = await inserted({ ...hs3(), villain_reads: { HJ: { vpip: 25 } }, mtt: mttIn });
    const p = parsePostDetail(detailJson(rawFromPayload(payload), { viewer: 'answered', id: ID, answerCount: 1 }));
    expect(p.hand.mtt).toEqual(mttIn);
    expect(p.hand.reads).toEqual({ HJ: { vpip: 25 } });
  });

  it('情報なしで投稿した本文は、保存も表示も「情報なし」', async () => {
    const payload = await inserted(hs1bb());
    expect(payload.villain_reads).toEqual({});
    expect(payload.mtt).toBeNull();
    const p = parsePostDetail(detailJson(rawFromPayload(payload), { viewer: 'unanswered', id: ID }));
    expect(p.hand.reads).toEqual({});
    expect(p.hand.mtt).toBeNull();
  });
});
