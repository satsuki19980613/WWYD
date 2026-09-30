/**
 * T4-02（Villain・MTT の情報（P11）の総合テスト。docs/villain-reads-test-plan.md §3 T4）:
 * create-post の handler に、Villain・MTT の情報つきの本文を通す。201 と保存される値、422 と違反のコード（保存しない）、
 * キーの無い本文（前の版の画面）、巨大な villain_reads・本文の上限の境目、DB の上限（8KB・1KB）に収まること。
 */
import { describe, expect, it, vi } from 'vitest';
import { hmw, hs1, hs1bb, hs3, type Raw } from '../../../core/src/post/postFixtures.ts';
import { createPostHandler, MAX_BODY_BYTES, type CreatePostDeps } from './handler.ts';
import type { InsertPayload } from './payload.ts';

const ORIGIN = 'http://localhost:5173';
const UID = '11111111-1111-4111-8111-111111111111';

function setup() {
  const insertPost = vi.fn<CreatePostDeps['insertPost']>(async () => 'post-id');
  const handler = createPostHandler({
    verifyToken: async () => UID,
    insertPost,
    allowedOrigins: [ORIGIN],
    logError: () => undefined,
  });
  return { handler, insertPost };
}

const req = (body: unknown): Request =>
  new Request('https://fn.example/', {
    method: 'POST',
    headers: { Authorization: 'Bearer good', Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

type Out = { status: number; json: Record<string, unknown>; insertCalls: number; payload?: InsertPayload };
async function send(body: unknown): Promise<Out> {
  const { handler, insertPost } = setup();
  const res = await handler(req(body));
  const json = JSON.parse(await res.text()) as Record<string, unknown>;
  return { status: res.status, json, insertCalls: insertPost.mock.calls.length, payload: insertPost.mock.calls[0]?.[1] as InsertPayload | undefined };
}

const general = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  scope: 'general', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: false, ...over,
});
const spot = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: false, ...over,
});

// hs1bb（Hero = BB。Spot 11 = Turn で BTN の Bet 6.5 に向き合う）:
//   登録できる席は BTN（Preflop の Raise）と SB（Fold to Steal）。UTG・HJ・CO は Preflop の Fold だけなので登録できない。
//   判断地点より前の Spot Read の候補: SB の Preflop Fold to Steal、BTN の Flop C-Bet（Small）と Turn Barrel（Big）。
//   判断地点より後: River の BTN の Bet 15（Barrel）。
const bb = (over: Raw = {}): Raw => ({ ...hs1bb(), ...over });

describe('T4-02 正しい本文は 201 で、サーバーで整えた値を渡す', () => {
  it('Spot Read（Flop C-Bet・Turn Barrel は 1 席 1 件）と全体の傾向・General Read を通す', async () => {
    const reads = { BTN: { vpip: 35, pfr: 28, agg: 4, image: 0, sample: 2, reads: [general({ street: 'flop', action: 'cbet', texture: { suit: 'mono' }, size: null, lean: 'over' }), spot()] }, SB: { reads: [spot({ street: 'pf', action: 'fold_steal', size: null, lean: 'under', strong: true })] } };
    const r = await send(bb({ villain_reads: reads }));
    expect(r.status).toBe(201);
    expect(r.insertCalls).toBe(1);
    // Spot Read が先に並ぶ
    expect(r.payload?.villain_reads.BTN?.reads?.map((e) => e.scope)).toEqual(['spot', 'general']);
    expect(r.payload?.villain_reads.SB?.reads?.[0]).toMatchObject({ action: 'fold_steal', strong: true, size: null });
    expect(r.payload?.mtt).toBeNull();
  });

  it('Spot Read の Size は実際の額で決まる（Turn の Bet 6.5 は Pot 9.1 の 71% = Big）。Flop の 1.8 は Small', async () => {
    expect((await send(bb({ villain_reads: { BTN: { reads: [spot()] } } }))).status).toBe(201);
    expect((await send(bb({ villain_reads: { BTN: { reads: [spot({ street: 'flop', action: 'cbet', size: 'small' })] } } }))).status).toBe(201);
    expect((await send(bb({ villain_reads: { BTN: { reads: [spot({ size: 'small' })] } } }))).json).toEqual({ error: 'invalid_reads' });
    expect((await send(bb({ villain_reads: { BTN: { reads: [spot({ size: 'overbet' })] } } }))).json).toEqual({ error: 'invalid_reads' });
    expect((await send(bb({ villain_reads: { BTN: { reads: [spot({ size: null })] } } }))).json).toEqual({ error: 'invalid_reads' });
  });

  it('villain_reads・mtt のキーが無い本文（前の版の画面）は前と同じく 201 で {} と null', async () => {
    const raw = hs1();
    expect('villain_reads' in raw || 'mtt' in raw).toBe(false);
    const r = await send(raw);
    expect(r.status).toBe(201);
    expect(r.payload).toMatchObject({ villain_reads: {}, mtt: null });
  });

  it.each<[string, Raw]>([
    ['villain_reads: null, mtt: null', { villain_reads: null, mtt: null }],
    ['villain_reads: {}, mtt: {}', { villain_reads: {}, mtt: {} }],
    ['中身の無い席だけ', { villain_reads: { SB: {}, BB: { reads: [] } } }],
  ])('情報なしの書き方「%s」は 201 で {} と null', async (_n, extra) => {
    const r = await send({ ...hs1(), ...extra });
    expect(r.status).toBe(201);
    expect(r.payload?.villain_reads).toEqual({});
    expect(r.payload?.mtt).toBeNull();
  });

  it('Cash でも mtt が {} なら通る（中身が無いので null）', async () => {
    const r = await send({ ...hs1(), mtt: {} });
    expect(r.status).toBe(201);
    expect(r.payload?.mtt).toBeNull();
  });

  it('MTT: 境界の値（最小・最大・小数第 1 位）をそのまま保存する', async () => {
    const lo = { speed: 0, rank: 1, left: 1, paid: 1, entries: 1, avg: 0.1, prize: 'flat' };
    const hi = { speed: 100, rank: 1_000_000, left: 1_000_000, paid: 1_000_000, entries: 1_000_000, avg: 99999, prize: 'top' };
    for (const mtt of [lo, hi, { avg: 99998.9 }, { prize: 'standard' }, { speed: 37 }, { rank: 5 }, { paid: 1_000_000 }]) {
      const r = await send({ ...hs3(), mtt });
      expect(r.status, JSON.stringify(mtt)).toBe(201);
      expect(r.payload?.mtt).toEqual(mtt);
    }
  });

  it('MTT: ITM は残りの人数を超えてよい（入賞後）。ITM は実際の人数以下であれば、エントリー数と同じでもよい', async () => {
    expect((await send({ ...hs3(), mtt: { left: 10, paid: 50, entries: 50 } })).status).toBe(201);
  });
});

describe('T4-02 違反は 422 で、保存しない（全部のコード）', () => {
  const H = (extra: Raw): Raw => bb(extra);

  const cases: [string, Raw, string][] = [
    // ---- malformed（形）----
    ['villain_reads が配列', H({ villain_reads: [] }), 'malformed'],
    ['villain_reads が文字列', H({ villain_reads: 'x' }), 'malformed'],
    ['villain_reads が数値', H({ villain_reads: 3 }), 'malformed'],
    ['席でないキー', H({ villain_reads: { XX: { vpip: 10 } } }), 'malformed'],
    ['Hero の席', H({ villain_reads: { BB: { vpip: 10 } } }), 'malformed'],
    ['席の値がオブジェクトでない', H({ villain_reads: { BTN: 5 } }), 'malformed'],
    ['席の値が null', H({ villain_reads: { BTN: null } }), 'malformed'],
    ['旧仕様 memo', H({ villain_reads: { BTN: { memo: 'x' } } }), 'malformed'],
    ['旧仕様 conf', H({ villain_reads: { BTN: { conf: 2 } } }), 'malformed'],
    ['vpip が小数', H({ villain_reads: { BTN: { vpip: 30.5 } } }), 'malformed'],
    ['vpip が文字列', H({ villain_reads: { BTN: { vpip: '30' } } }), 'malformed'],
    ['vpip が null', H({ villain_reads: { BTN: { vpip: null } } }), 'malformed'],
    ['agg が小数', H({ villain_reads: { BTN: { agg: 1.5 } } }), 'malformed'],
    ['reads が配列でない', H({ villain_reads: { BTN: { reads: {} } } }), 'malformed'],
    ['Read がオブジェクトでない', H({ villain_reads: { BTN: { reads: ['x'] } } }), 'malformed'],
    ['Read に知らないキー', H({ villain_reads: { BTN: { reads: [spot({ memo: 'x' })] } } }), 'malformed'],
    ['Read の scope が選択肢の外', H({ villain_reads: { BTN: { reads: [spot({ scope: 'other' })] } } }), 'malformed'],
    ['Read の action が選択肢の外', H({ villain_reads: { BTN: { reads: [spot({ action: 'open' })] } } }), 'malformed'],
    ['Read の lean が選択肢の外', H({ villain_reads: { BTN: { reads: [spot({ lean: 'mid' })] } } }), 'malformed'],
    ['Read の strong が真偽値でない', H({ villain_reads: { BTN: { reads: [spot({ strong: 1 })] } } }), 'malformed'],
    ['Read の size が選択肢の外', H({ villain_reads: { BTN: { reads: [spot({ size: 'huge' })] } } }), 'malformed'],
    ['runout が配列でない', H({ villain_reads: { BTN: { reads: [general({ runout: 'flush' })] } } }), 'malformed'],
    ['runout に重複', H({ villain_reads: { BTN: { reads: [general({ runout: ['flush', 'flush'] })] } } }), 'malformed'],
    ['texture の軸が知らない', H({ villain_reads: { BTN: { reads: [general({ street: 'flop', action: 'cbet', size: null, texture: { color: 'red' } })] } } }), 'malformed'],
    ['texture の値が選択肢の外', H({ villain_reads: { BTN: { reads: [general({ street: 'flop', action: 'cbet', size: null, texture: { suit: 'four' } })] } } }), 'malformed'],
    ['mtt が配列', { ...hs3(), mtt: [] }, 'malformed'],
    ['mtt が文字列', { ...hs3(), mtt: 'bubble' }, 'malformed'],
    ['mtt の旧仕様のキー stage', { ...hs3(), mtt: { stage: 'bubble' } }, 'malformed'],
    ['mtt の旧仕様のキー type', { ...hs3(), mtt: { type: 'pko' } }, 'malformed'],
    ['mtt.speed が小数', { ...hs3(), mtt: { speed: 50.5 } }, 'malformed'],
    ['mtt.speed が文字列', { ...hs3(), mtt: { speed: '50' } }, 'malformed'],
    ['mtt.rank が小数', { ...hs3(), mtt: { rank: 1.5 } }, 'malformed'],
    ['mtt.rank が文字列', { ...hs3(), mtt: { rank: '12' } }, 'malformed'],
    ['mtt.avg が文字列', { ...hs3(), mtt: { avg: '35' } }, 'malformed'],
    ['mtt.prize が選択肢の外', { ...hs3(), mtt: { prize: 'x' } }, 'malformed'],
    ['mtt.rank が null', { ...hs3(), mtt: { rank: null } }, 'malformed'],
    // ---- invalid_reads（範囲・組み合わせ・ハンドとの照合）----
    ['vpip が 101', H({ villain_reads: { BTN: { vpip: 101 } } }), 'invalid_reads'],
    ['vpip が -1', H({ villain_reads: { BTN: { vpip: -1 } } }), 'invalid_reads'],
    ['agg が 5（0〜4 の外）', H({ villain_reads: { BTN: { agg: 5 } } }), 'invalid_reads'],
    ['旧仕様の agg 75（0〜100 の値）', H({ villain_reads: { BTN: { agg: 75 } } }), 'invalid_reads'],
    ['image が -1', H({ villain_reads: { BTN: { image: -1 } } }), 'invalid_reads'],
    ['sample が 5', H({ villain_reads: { BTN: { sample: 5 } } }), 'invalid_reads'],
    ['PFR > VPIP', H({ villain_reads: { BTN: { vpip: 10, pfr: 11 } } }), 'invalid_reads'],
    ['Preflop の Read に Flop の Action', H({ villain_reads: { BTN: { reads: [general({ street: 'pf', action: 'cbet', size: null })] } } }), 'invalid_reads'],
    ['Flop の Read に Barrel', H({ villain_reads: { BTN: { reads: [general({ street: 'flop', action: 'barrel' })] } } }), 'invalid_reads'],
    ['River の Read に Delayed C-Bet', H({ villain_reads: { BTN: { reads: [general({ street: 'river', action: 'delayed_cbet' })] } } }), 'invalid_reads'],
    ['Fold 系に Value-heavy', H({ villain_reads: { BTN: { reads: [general({ street: 'flop', action: 'fold_cbet', size: null, lean: 'value' })] } } }), 'invalid_reads'],
    ['Fold 系に Bluff-heavy', H({ villain_reads: { BTN: { reads: [general({ street: 'flop', action: 'fold_bet', size: null, lean: 'bluff' })] } } }), 'invalid_reads'],
    ['Preflop に texture', H({ villain_reads: { BTN: { reads: [general({ street: 'pf', action: '3bet', size: null, texture: { suit: 'mono' } })] } } }), 'invalid_reads'],
    ['Flop に runout', H({ villain_reads: { BTN: { reads: [general({ street: 'flop', action: 'cbet', size: null, runout: ['brick'] })] } } }), 'invalid_reads'],
    ['Preflop に runout', H({ villain_reads: { BTN: { reads: [general({ street: 'pf', action: '3bet', size: null, runout: ['brick'] })] } } }), 'invalid_reads'],
    ['Fold 系に size', H({ villain_reads: { BTN: { reads: [general({ street: 'flop', action: 'fold_cbet', lean: 'over', size: 'big' })] } } }), 'invalid_reads'],
    ['Preflop の Overbet', H({ villain_reads: { BTN: { reads: [general({ street: 'pf', action: '3bet', size: 'overbet' })] } } }), 'invalid_reads'],
    ['Spot Read に texture', H({ villain_reads: { BTN: { reads: [spot({ texture: { suit: 'mono' } })] } } }), 'invalid_reads'],
    ['Spot Read に runout', H({ villain_reads: { BTN: { reads: [spot({ runout: ['brick'] })] } } }), 'invalid_reads'],
    ['Spot Read が 2 件', H({ villain_reads: { BTN: { reads: [spot(), spot({ street: 'flop', action: 'cbet', size: 'small' })] } } }), 'invalid_reads'],
    ['General Read が 3 件', H({ villain_reads: { BTN: { reads: [general(), general({ lean: 'over' }), general({ lean: 'under' })] } } }), 'invalid_reads'],
    ['登録できない席（Preflop で Fold しただけの UTG）', H({ villain_reads: { UTG: { vpip: 10 } } }), 'invalid_reads'],
    ['登録できない席（HJ）', H({ villain_reads: { HJ: { reads: [general()] } } }), 'invalid_reads'],
    ['登録できない席（CO）', H({ villain_reads: { CO: { agg: 1 } } }), 'invalid_reads'],
    ['実際に無い Spot Read（SB の Flop Donk）', H({ villain_reads: { SB: { reads: [spot({ street: 'flop', action: 'donk', size: 'small' })] } } }), 'invalid_reads'],
    ['Spot Read の Street が違う（Turn の Barrel を Flop にする）', H({ villain_reads: { BTN: { reads: [spot({ street: 'flop' })] } } }), 'invalid_reads'],
    ['Spot Read の Action が違う（Flop の C-Bet を Barrel にする）', H({ villain_reads: { BTN: { reads: [spot({ street: 'flop', action: 'barrel', size: 'small' })] } } }), 'invalid_reads'],
    ['Spot Read が判断地点より後（River の Barrel）', H({ villain_reads: { BTN: { reads: [spot({ street: 'river', action: 'barrel', size: 'big' })] } } }), 'invalid_reads'],
    ['Spot Read が判断地点より後（River の Bet 15 は Pot 約 36 に対し Small）', H({ villain_reads: { BTN: { reads: [spot({ street: 'river', action: 'barrel', size: 'small' })] } } }), 'invalid_reads'],
    // ---- invalid_mtt ----
    ['Cash に mtt', { ...hs1(), mtt: { rank: 1 } }, 'invalid_mtt'],
    ['Cash に speed だけ', { ...hs1(), mtt: { speed: 0 } }, 'invalid_mtt'],
    ['speed が 101', { ...hs3(), mtt: { speed: 101 } }, 'invalid_mtt'],
    ['speed が -1', { ...hs3(), mtt: { speed: -1 } }, 'invalid_mtt'],
    ['rank が 0', { ...hs3(), mtt: { rank: 0 } }, 'invalid_mtt'],
    ['rank が 1000001', { ...hs3(), mtt: { rank: 1_000_001 } }, 'invalid_mtt'],
    ['left が 0', { ...hs3(), mtt: { left: 0 } }, 'invalid_mtt'],
    ['entries が -5', { ...hs3(), mtt: { entries: -5 } }, 'invalid_mtt'],
    ['rank > left', { ...hs3(), mtt: { rank: 59, left: 58 } }, 'invalid_mtt'],
    ['left > entries', { ...hs3(), mtt: { left: 400, entries: 320 } }, 'invalid_mtt'],
    ['rank > entries（left が無い）', { ...hs3(), mtt: { rank: 400, entries: 320 } }, 'invalid_mtt'],
    ['paid > entries', { ...hs3(), mtt: { paid: 400, entries: 320 } }, 'invalid_mtt'],
    ['avg が 0', { ...hs3(), mtt: { avg: 0 } }, 'invalid_mtt'],
    ['avg が負', { ...hs3(), mtt: { avg: -1 } }, 'invalid_mtt'],
    ['avg が 100000', { ...hs3(), mtt: { avg: 100_000 } }, 'invalid_mtt'],
    ['avg が小数第 2 位', { ...hs3(), mtt: { avg: 35.25 } }, 'invalid_mtt'],
    ['avg が 0.05', { ...hs3(), mtt: { avg: 0.05 } }, 'invalid_mtt'],
  ];

  it.each(cases)('%s → %s', async (_name, body, code) => {
    const r = await send(body);
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: code });
    expect(r.insertCalls).toBe(0);
  });

  it('Spot Read が判断地点より後でも、その席が登録できる席なら、全体の傾向だけは通る（Spot Read を付けない場合）', async () => {
    expect((await send(bb({ villain_reads: { BTN: { vpip: 20, reads: [general({ street: 'river', action: 'barrel' })] } } }))).status).toBe(201);
  });
});

describe('T4-02 サイズの境目', () => {
  it('本文がちょうど上限のバイト数なら通り、1 バイト超えたら malformed（villain_reads の有無に関わらず）', async () => {
    const base = { ...hs1(), pad: '' };
    const n = new TextEncoder().encode(JSON.stringify(base)).length;
    const exact = { ...base, pad: 'x'.repeat(MAX_BODY_BYTES - n) };
    expect(new TextEncoder().encode(JSON.stringify(exact)).length).toBe(MAX_BODY_BYTES);
    expect((await send(exact)).status).toBe(201);
    const over = { ...base, pad: 'x'.repeat(MAX_BODY_BYTES - n + 1) };
    const r = await send(over);
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'malformed' });
    expect(r.insertCalls).toBe(0);
  });

  it('巨大な villain_reads（席が数万・Read が数千・深い入れ子）は 500 にならず 422 で、保存しない', async () => {
    const manySeats: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++) manySeats[`S${i}`] = { vpip: 1 };
    const manyReads = Array.from({ length: 300 }, () => general());
    for (const [name, body, code] of [
      ['席が 5000（本文 64KB 以内）', bb({ villain_reads: manySeats }), 'malformed'],
      ['Read が 300 件（本文 64KB 以内）', bb({ villain_reads: { BTN: { reads: manyReads } } }), 'invalid_reads'],
      ['入れ子が深い reads（生の文字列）', JSON.stringify(bb()).replace(/}$/, `,"villain_reads":{"BTN":{"reads":${'['.repeat(3000)}1${']'.repeat(3000)}}}}`), 'malformed'],
    ] as const) {
      const r = await send(body);
      expect(r.status, name).toBe(422);
      expect(r.json, name).toEqual({ error: code });
      expect(r.insertCalls, name).toBe(0);
    }
    // 入れ子が深すぎて JSON として読めない生の文字列
    const text = `{"villain_reads":${'['.repeat(30000)}1${']'.repeat(30000)}}`;
    const r = await send(text);
    expect([422]).toContain(r.status);
  });

  it('villain_reads が 64KB 近い本文でも、知らないキーで断る（巨大な値を保存に回さない）', async () => {
    const r = await send(bb({ villain_reads: { BTN: { pad: 'x'.repeat(60_000) } } }));
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'malformed' });
  });

  it('検証を通った villain_reads は、どんな組み合わせでも DB の上限（text で 8192 バイト）に収まる（5 席・全項目・Read 3 件）', async () => {
    // jsonb の text は「: 」「, 」に空白が入る。enum と整数だけなので、その形に直して数える
    const pgText = (v: unknown): string => {
      if (Array.isArray(v)) return `[${v.map(pgText).join(', ')}]`;
      if (v !== null && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${pgText(x)}`).join(', ')}}`;
      return JSON.stringify(v);
    };
    const fullGeneral = (n: number): Record<string, unknown> =>
      general({
        street: 'river', action: 'bet_vs_check', size: 'overbet', lean: 'bluff', strong: true,
        texture: { high: 'qj', suit: 'rainbow', paired: 'unpaired', connect: 'straight' },
        runout: ['brick', 'over', 'flush', 'straight', 'pair'].slice(0, 5 - (n % 1)),
      });
    // verifyReads は Spot Read を実際の Action と照合するので、登録できる席の全体の傾向と General Read 2 件で最大を作る（Spot Read の分は 1 件 200 バイト程度を足して見積もる）
    const seat = { vpip: 100, pfr: 100, agg: 4, image: 4, sample: 4, reads: [fullGeneral(0), fullGeneral(1)] };
    const reads = Object.fromEntries(['UTG', 'HJ', 'CO', 'BTN', 'SB'].map((s) => [s, seat]));
    const bytes = new TextEncoder().encode(pgText(reads)).length;
    const spotExtra = 5 * new TextEncoder().encode(pgText(spot({ street: 'turn', action: 'bet_vs_check', size: 'overbet', lean: 'bluff', strong: true }) as Record<string, unknown>) + ', ').length;
    console.log(`最大の villain_reads（5 席・General Read 2 件・全項目）: ${bytes} バイト、Spot Read 5 件の分を足して ${bytes + spotExtra} バイト（上限 8192）`);
    expect(bytes + spotExtra).toBeLessThanOrEqual(8192);
    // mtt の最大
    const mtt = { speed: 100, rank: 1_000_000, left: 1_000_000, paid: 1_000_000, entries: 1_000_000, avg: 99999.9, prize: 'standard' };
    expect(new TextEncoder().encode(pgText(mtt)).length).toBeLessThanOrEqual(1024);
  });
});

describe('T4-02 通った本文は通った値のまま保存に渡る', () => {
  it('hmw（マルチウェイ）でも、Preflop の Raise をした席は登録できる', async () => {
    // hmw: Hero = CO（Raise）、BTN Call・BB Call。BTN・BB は登録できる（Call）
    const r = await send({ ...hmw(), villain_reads: { BTN: { vpip: 40 }, BB: { pfr: 10 } } });
    expect(r.status).toBe(201);
    expect(r.payload?.villain_reads).toEqual({ BTN: { vpip: 40 }, BB: { pfr: 10 } });
  });

  it('同じ本文を 2 回送っても同じ payload（サーバーの整形は決定的）', async () => {
    const body = bb({ villain_reads: { BTN: { reads: [general({ street: 'flop', action: 'cbet', size: null, lean: 'over', texture: {}, runout: [] }), spot()] } } });
    const a = await send(body);
    const b = await send(body);
    expect(a.payload).toEqual(b.payload);
    // 空の texture・runout は null に直る
    expect(a.payload?.villain_reads.BTN?.reads?.[1]).toMatchObject({ texture: null, runout: null });
  });
});

describe('T4-02 プロトタイプ汚染・特殊なキー', () => {
  const base = (extra: string): string => JSON.stringify(bb()).replace(/}$/, `,${extra}}`);
  it.each<[string, string]>([
    ['villain_reads の __proto__', '"villain_reads":{"__proto__":{"vpip":10}}'],
    ['席の中の __proto__', '"villain_reads":{"BTN":{"__proto__":{"vpip":10}}}'],
    ['席の中の constructor', '"villain_reads":{"BTN":{"constructor":{"vpip":10}}}'],
    ['Read の __proto__', '"villain_reads":{"BTN":{"reads":[{"__proto__":{"x":1},"scope":"spot"}]}}'],
    ['texture の __proto__', '"villain_reads":{"BTN":{"reads":[{"scope":"general","street":"flop","action":"cbet","texture":{"__proto__":{"high":"a"}},"runout":null,"size":null,"lean":"over","strong":false}]}}'],
    ['mtt の __proto__', '"mtt":{"__proto__":{"rank":1}}'],
    ['mtt の toString', '"mtt":{"toString":1}'],
  ])('%s は malformed で、保存しない', async (_n, extra) => {
    const r = await send(base(extra));
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'malformed' });
    expect(r.insertCalls).toBe(0);
    expect(({} as Record<string, unknown>).vpip).toBeUndefined(); // Object.prototype が汚れていない
  });

  it('villain_reads が同じキーを 2 回（JSON の重複キー）は後の値が使われ、通常の検証を受ける', async () => {
    const r = await send(base('"villain_reads":{"BTN":{"vpip":10}},"villain_reads":{"BTN":{"vpip":101}}'));
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'invalid_reads' });
  });
});

describe('T4-02 人数が少ないハンド（3 人: BTN・SB・BB）', () => {
  // hs1 から UTG・HJ・CO を外した 3 人のハンド（Hero = BTN。Spot は Turn の BTN の Bet）
  const three = (): Raw => {
    const raw = hs1();
    const actions = (raw.actions as Raw[]).slice(3); // 先頭の 3 つ（UTG・HJ・CO の Fold）を外す
    return {
      ...raw,
      stacks: { BTN: 100, SB: 100, BB: 100 },
      actions,
      spot_index: 7,
      derived: { ...(raw.derived as Raw), stop_index: 7 },
    };
  };

  it('座っていない席（UTG・HJ・CO）の情報は malformed', async () => {
    expect((await send(three())).status).toBe(201);
    for (const seat of ['UTG', 'HJ', 'CO']) {
      const r = await send({ ...three(), villain_reads: { [seat]: { vpip: 10 } } });
      expect(r.status, seat).toBe(422);
      expect(r.json, seat).toEqual({ error: 'malformed' });
    }
  });

  it('SB（Fold to Steal）と BB の情報は通り、Spot Read は SB の Fold to Steal だけ', async () => {
    const steal = { scope: 'spot', street: 'pf', action: 'fold_steal', texture: null, runout: null, size: null, lean: 'over', strong: false };
    const r = await send({ ...three(), villain_reads: { SB: { reads: [steal] }, BB: { vpip: 20 } } });
    expect(r.status).toBe(201);
    expect(r.payload?.villain_reads.SB?.reads?.[0]?.action).toBe('fold_steal');
    // BB の Spot Read（Call・Check だけなので語彙に当たる Action が無い）は断る
    const bad = await send({ ...three(), villain_reads: { BB: { reads: [{ ...steal, action: 'limp' }] } } });
    expect(bad.json).toEqual({ error: 'invalid_reads' });
  });
});

