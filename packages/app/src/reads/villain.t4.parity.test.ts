/**
 * T4-07（Villain・MTT の情報（P11）の総合テスト。docs/villain-reads-test-plan.md §3 T4）: サーバーと画面の一致（不変条件 4・7）。
 * ランダムなハンド（release.tb.draftgen.ts）に、画面の操作で作れるランダムな Read・MTT の欄を付けた下書き（Draft）を作り、
 *  - buildSubmission が通る ⇔ サーバー（create-post の handler ＝ validateInput + verifyPost）が 201（画面だけの検査を除く）
 *  - 通った本文は、サーバーが保存に渡す値と同じ（villain_reads・mtt）
 *  - 通った本文を少し壊すと、サーバーが必ず 422
 * を確かめる。種を決めた擬似乱数。落ちたら種・下書き・本文を表示する。
 */
import {
  classifyActions,
  leansOf,
  READ_SIZES,
  RUNOUTS,
  STREET_ACTIONS,
  STREETS,
  TEXTURE_AXES,
  TEXTURE_KEYS,
  villainSeats,
  POSITIONS,
  type Pos,
  type ReadAction,
} from '@wwyd/core';
import { describe, expect, it, vi } from 'vitest';
import { createPostHandler, type CreatePostDeps } from '../../../functions/src/createPost/handler.ts';
import type { InsertPayload } from '../../../functions/src/createPost/payload.ts';
import { Rng } from '../../../core/src/poker/release.tb.gen.ts';
import { buildSubmission, parseSettings, submissionBody, villainContext, type Draft } from '../post/draft.ts';
import { buildDraft } from '../post/release.tb.draftgen.ts';
import {
  cycleLean,
  emptyGeneral,
  isAggressive,
  isCompleteGeneral,
  parseMtt,
  setGeneralAction,
  setGeneralStreet,
  setRead,
  toggleRunout,
  toggleSize,
  toggleStep,
  toggleTexture,
  type GeneralDraft,
  type SeatDraft,
} from './readsModel.ts';

vi.setConfig({ testTimeout: 240_000 });

const UID = '11111111-1111-4111-8111-111111111111';

async function server(body: unknown): Promise<{ status: number; error?: string; payload?: InsertPayload }> {
  const insertPost = vi.fn<CreatePostDeps['insertPost']>(async () => 'post-id');
  const handler = createPostHandler({ verifyToken: async () => UID, insertPost, allowedOrigins: ['http://localhost:5173'], logError: () => undefined });
  const res = await handler(
    new Request('https://fn.example/', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  const j = JSON.parse(await res.text()) as { error?: string };
  if (res.status === 201) return { status: 201, payload: insertPost.mock.calls[0]?.[1] as InsertPayload };
  return { status: res.status, error: j.error };
}

/** 画面の操作（readsModel の関数）だけでランダムな General Read を作る（途中の状態を含む） */
function randomGeneral(rng: Rng): GeneralDraft {
  let g = emptyGeneral();
  if (rng.chance(0.93)) g = setGeneralStreet(g, rng.pick(STREETS));
  if (g.street && rng.chance(0.93)) g = setGeneralAction(g, rng.pick(STREET_ACTIONS[g.street] as readonly ReadAction[]));
  if (g.street && g.street !== 'pf' && rng.chance(0.4)) {
    for (const k of TEXTURE_KEYS) if (rng.chance(0.4)) g = toggleTexture(g, k, rng.pick(TEXTURE_AXES[k] as readonly string[]));
  }
  if ((g.street === 'turn' || g.street === 'river') && rng.chance(0.4)) for (const r of RUNOUTS) if (rng.chance(0.4)) g = toggleRunout(g, r);
  // Size は Bet / Raise 系だけ、Lean は Action ごとの表（画面のボタンはそれだけを出す）。Preflop の Overbet は出さない
  if (g.street && g.action && isAggressive(g.action) && rng.chance(0.4)) g = toggleSize(g, rng.pick(READ_SIZES));
  if (g.street === 'pf' && g.size === 'overbet') g = toggleSize(g, 'overbet');
  if (g.action && rng.chance(0.9)) {
    const n = rng.int(1, 2);
    const lean = rng.pick(leansOf(g.action));
    for (let i = 0; i < n; i++) g = { ...g, ...cycleLean(g, lean) };
  }
  return g;
}

function randomSeat(rng: Rng, cands: ReturnType<typeof villainContext>['cands'], pos: Pos): SeatDraft {
  let s: SeatDraft = {};
  if (rng.chance(0.5)) s = setRead(s, 'vpip', rng.int(0, 100));
  if (rng.chance(0.4)) s = setRead(s, 'pfr', rng.int(0, 100));
  if (rng.chance(0.03) && s.vpip !== undefined && s.vpip < 100) {
    s = { ...s, pfr: Math.min(100, s.vpip + rng.int(1, 5)) }; // 画面では作れない（PFR > VPIP。サーバーだけが断る）
  }
  for (const k of ['agg', 'image'] as const) if (rng.chance(0.3)) s = toggleStep(s, k, rng.int(0, 4));
  const mine = cands.filter((c) => c.pos === pos);
  if (rng.chance(0.55)) {
    // 実際の候補（多い）か、でたらめな Street・Action（実際に無い Spot Read は画面が送らない）
    if (mine.length > 0 && rng.chance(0.8)) {
      const c = rng.pick(mine);
      const lean = rng.pick(leansOf(c.action));
      s = { ...s, spot: { street: c.street, action: c.action, lean, strong: rng.chance(0.4) } };
    } else {
      const street = rng.pick(STREETS);
      s = { ...s, spot: { street, action: rng.pick(STREET_ACTIONS[street] as readonly ReadAction[]), lean: 'over', strong: false } };
    }
  }
  const n = rng.chance(0.5) ? rng.int(1, 2) : 0; // General Read は 2 件まで
  if (n > 0) s = { ...s, general: Array.from({ length: n }, () => randomGeneral(rng)) };
  return s;
}

const MTT_POOL = {
  rank: ['', '', '12', '1', '0', '-3', '1.5', '１２', '1e3', '99999999', ' 7 '],
  left: ['', '', '58', '1', '500', '0', 'abc'],
  entries: ['', '', '320', '1', '1000000', '1000001'],
  paid: ['', '', '50', '1', '999', '0'],
  avg: ['', '', '35', '35.5', '0.1', '0', '35.25', '100000', '1e2'],
};

/** 画面だけの検査に当たる入力（途中の General Read・読めない MTT の欄）を取り除く（本文にはもともと入らない） */
function cleanClientOnly(d: Draft): Draft {
  const reads: Draft['reads'] = {};
  for (const [p, r] of Object.entries(d.reads) as [Pos, SeatDraft][]) {
    const general = (r.general ?? []).filter(isCompleteGeneral);
    const x: SeatDraft = { ...r };
    if (general.length > 0) x.general = general;
    else delete x.general;
    reads[p] = x;
  }
  const mtt = { ...d.mtt };
  for (const f of parseMtt(d.mtt).invalid) mtt[f] = '';
  return { ...d, reads, mtt };
}

function withRandomReads(base: Draft, rng: Rng): Draft {
  const d: Draft = { ...base, reads: {}, mtt: { ...base.mtt } };
  const ctx = villainContext(d);
  const seated = POSITIONS.filter((p) => base.players !== null && parseSettings(d).setup?.stacks[p]);
  for (const p of seated) {
    const eligible = ctx.seats.includes(p);
    if (rng.chance(eligible ? 0.75 : 0.25)) d.reads[p] = randomSeat(rng, ctx.cands, p); // 登録できない席・Hero にも入れておく（送られないこと）
  }
  if (d.fmt === 'cash' && rng.chance(0.35)) {
    d.fmt = 'mtt';
    d.rake = '';
  }
  if (d.fmt === 'mtt' && rng.chance(0.85)) {
    const entries = rng.int(1, 5000);
    const left = rng.int(1, entries);
    const rank = rng.int(1, left);
    const consistent = rng.chance(0.6);
    d.mtt = {
      speed: rng.chance(0.6) ? rng.int(0, 100) : null,
      prize: rng.chance(0.5) ? rng.pick(['top', 'standard', 'flat'] as const) : null,
      rank: consistent ? (rng.chance(0.7) ? String(rank) : '') : rng.pick(MTT_POOL.rank),
      left: consistent ? (rng.chance(0.7) ? String(left) : '') : rng.pick(MTT_POOL.left),
      entries: consistent ? (rng.chance(0.7) ? String(entries) : '') : rng.pick(MTT_POOL.entries),
      paid: consistent ? (rng.chance(0.5) ? String(rng.int(1, entries)) : '') : rng.pick(MTT_POOL.paid),
      avg: consistent ? (rng.chance(0.5) ? (rng.int(1, 999) / 10).toFixed(rng.chance(0.5) ? 1 : 0) : '') : rng.pick(MTT_POOL.avg),
    };
  }
  return d;
}

const clientOnly = (e: string): boolean => e.includes('General Read を最後まで') || e.startsWith('MTT の');

type Stat = {
  base: number; ok: number; clientOnlyRefused: number; bothRefused: number; withReads: number; withSpot: number; withGeneral: number; withMtt: number;
  srvCodes: Record<string, number>; tampers: number; afterSpot: number;
};

describe('T4-07 画面の判定とサーバーの判定の一致（Villain・MTT）', () => {
  it('ランダムなハンド 1,200 件 × ランダムな Read・MTT: 画面が通る ⇔ サーバーが 201。通った本文はそのまま保存に渡る', async () => {
    const stat: Stat = { base: 0, ok: 0, clientOnlyRefused: 0, bothRefused: 0, withReads: 0, withSpot: 0, withGeneral: 0, withMtt: 0, srvCodes: {}, tampers: 0, afterSpot: 0 };
    for (let i = 0; stat.base < 1200 && i < 40_000; i++) {
      const seed = 4_000_000 + i;
      const rng = new Rng(seed);
      const b = buildDraft(rng);
      if (!buildSubmission(b.draft).ok) continue; // Read なしで通るハンドだけを使う
      stat.base++;
      const d = withRandomReads(b.draft, rng);
      const label = `seed=${seed}`;
      let client;
      try {
        client = buildSubmission(d);
      } catch (e) {
        throw new Error(`${label}: buildSubmission が例外 ${e instanceof Error ? e.stack : String(e)}`);
      }
      const body = submissionBody(d);
      const srv = await server(body);
      if (srv.error) stat.srvCodes[srv.error] = (stat.srvCodes[srv.error] ?? 0) + 1;
      expect(srv.status === 201 || srv.status === 422, `${label}: サーバーが ${srv.status} ${srv.error ?? ''}`).toBe(true);
      const onlyClient = !client.ok && client.errors.every(clientOnly);
      if (client.ok) {
        expect(srv.status, `${label}: 画面は通したがサーバーは ${srv.error}\n${JSON.stringify(client.body)}`).toBe(201);
        stat.ok++;
        const p = srv.payload as InsertPayload;
        const cb = client.body as { villain_reads?: unknown; mtt?: unknown };
        // 画面の本文 = サーバーが保存に渡す値（情報なしはキーが無い ⇔ {} と null）
        expect(p.villain_reads, label).toEqual(cb.villain_reads ?? {});
        expect(p.mtt, label).toEqual(cb.mtt ?? null);
        if (cb.villain_reads) {
          stat.withReads++;
          const all = Object.values(p.villain_reads).flatMap((r) => r?.reads ?? []);
          if (all.some((e) => e.scope === 'spot')) stat.withSpot++;
          if (all.some((e) => e.scope === 'general')) stat.withGeneral++;
        }
        if (cb.mtt) stat.withMtt++;
      } else {
        // 画面だけの検査（途中の General Read・読めない MTT の欄）は本文から外れる。それを取り除いた下書きの判定が、サーバーの判定と一致する
        if (onlyClient) stat.clientOnlyRefused++;
        const cleaned = onlyClient ? buildSubmission(cleanClientOnly(d)) : client;
        if (cleaned.ok) {
          expect(srv.status, `${label}: 画面だけの検査を除けば通るが、サーバーは ${srv.error}
${JSON.stringify(body)}`).toBe(201);
        } else {
          stat.bothRefused++;
          expect(srv.status, `${label}: 画面が断った（${cleaned.errors.join(' / ')}）がサーバーは通した
${JSON.stringify(body)}`).toBe(422);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('T4-07 統計', JSON.stringify(stat));
    expect(stat.base).toBeGreaterThanOrEqual(1200);
    // 生成が偏っていない
    expect(stat.ok).toBeGreaterThan(300);
    expect(stat.withSpot).toBeGreaterThan(40);
    expect(stat.withGeneral).toBeGreaterThan(100);
    expect(stat.withMtt).toBeGreaterThan(40);
    expect(stat.clientOnlyRefused).toBeGreaterThan(50);
    expect(stat.bothRefused).toBeGreaterThan(20);
  });

  it('通った本文を少し壊すと、サーバーが必ず 422（形・範囲・組み合わせ・ハンドとの照合・判断地点より後の Spot Read）', async () => {
    const stat: Stat = { base: 0, ok: 0, clientOnlyRefused: 0, bothRefused: 0, withReads: 0, withSpot: 0, withGeneral: 0, withMtt: 0, srvCodes: {}, tampers: 0, afterSpot: 0 };
    const byName: Record<string, number> = {};
    for (let i = 0; stat.base < 1500 && i < 60_000; i++) {
      const seed = 5_000_000 + i;
      const rng = new Rng(seed);
      const b = buildDraft(rng);
      if (!buildSubmission(b.draft).ok) continue;
      stat.base++;
      const d = withRandomReads(b.draft, rng);
      const c = buildSubmission(d);
      if (!c.ok) continue;
      const raw = JSON.parse(JSON.stringify(c.body)) as Record<string, unknown>;
      const label = `seed=${seed}`;
      const setup = parseSettings(d).setup;
      if (!setup) continue;
      const hero = d.hero;
      const reads = (raw.villain_reads ?? {}) as Record<string, Record<string, unknown>>;
      const seats = Object.keys(reads);
      const eligible = villainSeats(setup, d.actions, hero);
      const tampers: [string, () => Record<string, unknown>, string[]][] = [];
      const mk = (name: string, f: (r: Record<string, unknown>) => void, codes: string[]): void => {
        tampers.push([name, () => { const r = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>; f(r); return r; }, codes]);
      };
      const vr = (r: Record<string, unknown>): Record<string, Record<string, unknown>> => (r.villain_reads ?? (r.villain_reads = {})) as Record<string, Record<string, unknown>>;

      // どのハンドにも当てられる壊し方
      mk('Hero の席に情報', (r) => void (vr(r)[hero] = { vpip: 10 }), ['malformed']);
      mk('知らない席', (r) => void (vr(r).XX = { vpip: 10 }), ['malformed']);
      mk('villain_reads が配列', (r) => void (r.villain_reads = []), ['malformed']);
      const ineligible = POSITIONS.filter((p) => p !== hero && !eligible.includes(p) && p in (raw.stacks as object));
      if (ineligible.length > 0) mk('登録できない席に情報', (r) => void (vr(r)[ineligible[0] as Pos] = { vpip: 10 }), ['invalid_reads']);
      if (seats.length > 0) {
        const s = seats[0] as string;
        mk('席に memo（旧仕様）', (r) => { (vr(r)[s] as Record<string, unknown>).memo = 'x'; }, ['malformed']);
        mk('vpip 101', (r) => { (vr(r)[s] as Record<string, unknown>).vpip = 101; }, ['invalid_reads']);
        mk('vpip 小数', (r) => { (vr(r)[s] as Record<string, unknown>).vpip = 10.5; }, ['malformed']);
        mk('agg 5', (r) => { (vr(r)[s] as Record<string, unknown>).agg = 5; }, ['invalid_reads']);
        mk('image -1', (r) => { (vr(r)[s] as Record<string, unknown>).image = -1; }, ['invalid_reads']);
        mk('PFR > VPIP', (r) => { const x = vr(r)[s] as Record<string, unknown>; x.vpip = 10; x.pfr = 11; }, ['invalid_reads']);
        const rs = (reads[s]?.reads as Record<string, unknown>[] | undefined) ?? [];
        if (rs.length > 0) {
          mk('Read の lean を不正な語に', (r) => { ((vr(r)[s]?.reads as Record<string, unknown>[])[0] as Record<string, unknown>).lean = 'mid'; }, ['malformed']);
          mk('Read に知らないキー', (r) => { ((vr(r)[s]?.reads as Record<string, unknown>[])[0] as Record<string, unknown>).memo = 'x'; }, ['malformed']);
          mk('Read の strong を数に', (r) => { ((vr(r)[s]?.reads as Record<string, unknown>[])[0] as Record<string, unknown>).strong = 1; }, ['malformed']);
          mk('Read の Street と Action を合わせない', (r) => {
            const e = (vr(r)[s]?.reads as Record<string, unknown>[])[0] as Record<string, unknown>;
            e.street = 'pf';
            e.action = 'cbet';
            e.size = null;
          }, ['invalid_reads']);
          mk('Preflop の Overbet', (r) => {
            const e = (vr(r)[s]?.reads as Record<string, unknown>[])[0] as Record<string, unknown>;
            e.street = 'pf';
            e.action = '3bet';
            e.size = 'overbet';
            e.scope = 'general';
            e.texture = null;
            e.runout = null;
            e.lean = 'over';
          }, ['invalid_reads']);
        }
        const gen = rs.filter((e) => e.scope === 'general');
        if (gen.length === 2) mk('General Read が 3 件', (r) => { const l = vr(r)[s]?.reads as Record<string, unknown>[]; l.push({ ...(l.find((e) => e.scope === 'general') as Record<string, unknown>) }); }, ['invalid_reads']);
        const sp = rs.find((e) => e.scope === 'spot');
        if (sp) {
          mk('Spot Read が 2 件', (r) => { const l = vr(r)[s]?.reads as Record<string, unknown>[]; l.push({ ...(l.find((e) => e.scope === 'spot') as Record<string, unknown>) }); }, ['invalid_reads']);
          if (String(sp.action).startsWith('fold_')) {
            mk('Fold 系の Spot Read に Value-heavy', (r) => {
              const e = (vr(r)[s]?.reads as Record<string, unknown>[]).find((x) => x.scope === 'spot') as Record<string, unknown>;
              e.lean = 'value';
            }, ['invalid_reads']);
          }
          // 変えた先の Street に同じ Action の実際の候補があると、壊したことにならない（例: Flop と River の Bet vs Check）ので、そのときは当てない
          const otherStreet = sp.street === 'river' ? 'pf' : 'river';
          if (!villainContext(d).cands.some((c) => c.pos === s && c.street === otherStreet && c.action === sp.action)) {
            mk('Spot Read の Street を変える', (r) => {
              const e = (vr(r)[s]?.reads as Record<string, unknown>[]).find((x) => x.scope === 'spot') as Record<string, unknown>;
              // 実際の Action と合わず、組み合わせとしても不正になりうる（どちらも invalid_reads）
              e.street = otherStreet;
            }, ['invalid_reads']);
          }
          if (sp.size !== null) {
            mk('Spot Read の Size を変える', (r) => {
              const e = (vr(r)[s]?.reads as Record<string, unknown>[]).find((x) => x.scope === 'spot') as Record<string, unknown>;
              e.size = e.size === 'small' ? 'big' : 'small';
            }, ['invalid_reads']);
            mk('Spot Read の Size を外す', (r) => {
              const e = (vr(r)[s]?.reads as Record<string, unknown>[]).find((x) => x.scope === 'spot') as Record<string, unknown>;
              e.size = null;
            }, ['invalid_reads']);
          }
          mk('Spot Read に texture', (r) => {
            const e = (vr(r)[s]?.reads as Record<string, unknown>[]).find((x) => x.scope === 'spot') as Record<string, unknown>;
            e.texture = { suit: 'mono' };
          }, ['invalid_reads']);
        }
      }
      // 判断地点より後の Action の Spot Read（答えの漏れ）: 後の Action のうち、判断地点より前に同じものが無いものを Spot Read にして足す
      const cls = classifyActions(setup, d.actions);
      const before = cls.slice(0, d.spotIndex as number).filter((x) => x !== null);
      for (const cand of cls.slice(d.spotIndex as number)) {
        if (!cand || cand.pos === hero || !eligible.includes(cand.pos)) continue;
        if (before.some((x) => x.pos === cand.pos && x.street === cand.street && x.action === cand.action && x.size === cand.size)) continue;
        const pos = cand.pos;
        mk(`判断地点より後の Action の Spot Read（${pos} ${cand.street} ${cand.action}）`, (r) => {
          const v = vr(r);
          const seat = (v[pos] ?? (v[pos] = {})) as Record<string, unknown>;
          const cur = ((seat.reads as Record<string, unknown>[] | undefined) ?? []).filter((e) => e.scope !== 'spot');
          seat.reads = [{ scope: 'spot', street: cand.street, action: cand.action, texture: null, runout: null, size: cand.size, lean: 'over', strong: false }, ...cur];
        }, ['invalid_reads']);
        stat.afterSpot++;
        break;
      }
      // MTT
      if (raw.mtt) {
        mk('Cash にして MTT の情報を残す', (r) => { r.fmt = 'cash'; r.rake = null; }, ['invalid_mtt']);
        mk('mtt に stage（旧仕様）', (r) => void ((r.mtt as Record<string, unknown>).stage = 'bubble'), ['malformed']);
        mk('mtt.speed 101', (r) => void ((r.mtt as Record<string, unknown>).speed = 101), ['invalid_mtt']);
        mk('mtt.rank 0', (r) => void ((r.mtt as Record<string, unknown>).rank = 0), ['invalid_mtt']);
        mk('mtt.avg 小数第 2 位', (r) => void ((r.mtt as Record<string, unknown>).avg = 35.25), ['invalid_mtt']);
        mk('mtt.prize を不正な語に', (r) => void ((r.mtt as Record<string, unknown>).prize = 'x'), ['malformed']);
        mk('mtt.entries を文字列に', (r) => void ((r.mtt as Record<string, unknown>).entries = '320'), ['malformed']);
      } else if (d.fmt === 'cash') {
        mk('Cash に mtt', (r) => void (r.mtt = { rank: 1 }), ['invalid_mtt']);
      }
      for (const [name, make, codes] of tampers) {
        const body = make();
        const srv = await server(body);
        stat.tampers++;
        byName[name.replace(/（.*）/, '')] = (byName[name.replace(/（.*）/, '')] ?? 0) + 1;
        expect(srv.status, `${label} 壊し方「${name}」をサーバーが通した\n${JSON.stringify(body.villain_reads)} ${JSON.stringify(body.mtt)}`).toBe(422);
        expect(codes, `${label} 壊し方「${name}」のコード ${srv.error}`).toContain(srv.error);
      }
    }
    // eslint-disable-next-line no-console
    console.log('T4-07 壊し方の統計', JSON.stringify({ base: stat.base, tampers: stat.tampers, afterSpot: stat.afterSpot, byName }));
    expect(stat.tampers).toBeGreaterThan(5000);
    expect(stat.afterSpot).toBeGreaterThan(100);
  });
});
