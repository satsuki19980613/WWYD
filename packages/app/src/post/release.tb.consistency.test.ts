/**
 * リリース前の総合テスト B-02: 画面の判定（buildSubmission）とサーバーの判定（create-post の handler ＝
 * validateInput + verifyPost）が一致すること、本文の改ざんをサーバーが必ず断ること。
 * 種を決めた擬似乱数（依存なし）。落ちたら seed と入力を表示する。
 */
import {
  POSITIONS,
  PLAYER_COUNTS,
  SEATS_BY_COUNT,
  hasPreflopAllin,
  spotCandidates,
  type Action,
  type Pos,
  type PlayerCount,
} from '@wwyd/core';
import { describe, expect, it, vi } from 'vitest';
import { createPostHandler, type CreatePostDeps } from '../../../functions/src/createPost/handler.ts';
import type { InsertPayload } from '../../../functions/src/createPost/payload.ts';
import { Rng } from '../../../core/src/poker/release.tb.gen.ts';
import { buildDraft, type Built } from './release.tb.draftgen.ts';
import { ALLIN_CASES, allinRaw, setupOf } from '../../../core/src/post/allinFixtures.ts';
import { acts } from '../../../core/src/poker/testHelpers.ts';
import { hmw, hs1, hs3, type Raw } from '../../../core/src/post/postFixtures.ts';
import { buildSubmission, settleActions, setPlayers, submissionBody, type Draft } from './draft.ts';

const UID = '11111111-1111-4111-8111-111111111111';

function makeHandler() {
  const insertPost = vi.fn<CreatePostDeps['insertPost']>(async () => 'post-id');
  const handler = createPostHandler({ verifyToken: async () => UID, insertPost, allowedOrigins: ['http://localhost:5173'], logError: () => undefined });
  return { handler, insertPost };
}

type Verdict = { status: number; error?: string; payload?: InsertPayload };

/** 本文をサーバー（handler）に送って判定を得る。JSON 文字列にして送る（ネットワークと同じ） */
async function serverVerdict(body: unknown): Promise<Verdict> {
  const { handler, insertPost } = makeHandler();
  const res = await handler(
    new Request('https://fn.example/', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  const j = JSON.parse(await res.text()) as { id?: string; error?: string };
  if (res.status === 201) return { status: 201, payload: insertPost.mock.calls[0]?.[1] as InsertPayload };
  return { status: res.status, error: j.error };
}

// ---- 下書きの改変（画面の入力ミスに当たる） ----

type Mut = { name: string; apply: (d: Draft, rng: Rng, b: Built) => Draft; settle?: boolean };

const anotherSeat = (d: Draft, except: Pos, rng: Rng): Pos => rng.pick(SEATS_BY_COUNT[d.players as PlayerCount].filter((p) => p !== except));

const MUTS: Mut[] = [
  { name: '変更なし', apply: (d) => d },
  { name: 'Hero のハンドを消す', apply: (d) => ({ ...d, hands: { ...d.hands, [d.hero]: '' } }) },
  { name: 'Hero のハンドが途中（1 枚）', apply: (d) => ({ ...d, hands: { ...d.hands, [d.hero]: d.hands[d.hero].slice(0, 2) } }) },
  { name: 'Hero のカードがボードと重複', apply: (d) => (d.board.length > 0 ? { ...d, hands: { ...d.hands, [d.hero]: `${d.board[0]}${d.hands[d.hero].slice(2)}` } } : d) },
  {
    name: '別の席のカードが Hero と重複',
    apply: (d, rng) => {
      const p = anotherSeat(d, d.hero, rng);
      return { ...d, hands: { ...d.hands, [p]: d.hands[d.hero] } };
    },
  },
  { name: 'タイトルが空', apply: (d) => ({ ...d, title: '' }) },
  { name: 'タイトルが空白だけ', apply: (d) => ({ ...d, title: ' 　 ' }) },
  { name: 'タイトル 40 字', apply: (d) => ({ ...d, title: 'あ'.repeat(40) }) },
  { name: 'タイトル 41 字', apply: (d) => ({ ...d, title: 'あ'.repeat(41) }) },
  { name: 'タイトル 40 コードポイント（絵文字）', apply: (d) => ({ ...d, title: '😀'.repeat(40) }) },
  { name: 'タイトル 41 コードポイント（絵文字）', apply: (d) => ({ ...d, title: '😀'.repeat(41) }) },
  { name: 'Spot 未選択', apply: (d) => ({ ...d, spotIndex: null }) },
  { name: 'Spot が範囲外', apply: (d) => ({ ...d, spotIndex: d.actions.length + 3 }) },
  { name: 'Spot が別の添字', apply: (d, rng) => ({ ...d, spotIndex: d.actions.length === 0 ? 0 : rng.int(0, d.actions.length - 1) }) },
  { name: '最後の Action を落とす', apply: (d) => ({ ...d, actions: d.actions.slice(0, -1) }) },
  { name: '先頭の Action を落とす', apply: (d) => ({ ...d, actions: d.actions.slice(1) }), settle: true },
  { name: '終了後に Action を足す', apply: (d) => (d.actions.length ? { ...d, actions: [...d.actions, { ...(d.actions.at(-1) as Action) }] } : d), settle: true },
  { name: 'ボードを 1 枚落とす', apply: (d) => ({ ...d, board: d.board.slice(0, -1) }) },
  { name: 'ボードに余分な札を足す', apply: (d) => (d.board.length < 5 ? { ...d, board: [...d.board, ...['2c', '3c', '4c', '5c', '6c'].filter((c) => !d.board.includes(c) && !Object.values(d.hands).join('').includes(c)).slice(0, 1)] } : d) },
  { name: 'ボードを消す', apply: (d) => ({ ...d, board: [] }) },
  { name: '人数を変える', apply: (d, rng) => setPlayers(d, rng.pick(PLAYER_COUNTS)), settle: true },
  { name: 'Hero の席を変える', apply: (d, rng) => ({ ...d, hero: anotherSeat(d, d.hero, rng) }) },
  { name: 'SB を変える', apply: (d, rng) => ({ ...d, sb: rng.pick(['0.1', '1', '0.001', '0.75']) }), settle: true },
  { name: 'SB が範囲外', apply: (d, rng) => ({ ...d, sb: rng.pick(['0', '1.001', '', 'abc', '-1', '0.0001']) }) },
  { name: 'Ante を変える', apply: (d, rng) => ({ ...d, ante: rng.pick(['0', '0.125', '5', '9999.999']) }), settle: true },
  { name: 'Ante が不正', apply: (d, rng) => ({ ...d, ante: rng.pick(['-1', 'abc', '0.0001', '10000']) }) },
  { name: 'Stack を変える', apply: (d, rng) => ({ ...d, stacks: { ...d.stacks, [rng.pick(SEATS_BY_COUNT[d.players as PlayerCount])]: rng.pick(['0.5', '1', '3', '20', '9999.999', '77.7']) } }), settle: true },
  { name: 'Stack が不正', apply: (d, rng) => ({ ...d, stacks: { ...d.stacks, [rng.pick(SEATS_BY_COUNT[d.players as PlayerCount])]: rng.pick(['0', '-5', 'abc', '', '10000', '1.0001']) } }) },
  { name: 'Rake が範囲外', apply: (d, rng) => ({ ...d, fmt: 'cash', rake: rng.pick(['101', '1.234', '-1', 'abc']) }) },
  { name: 'MTT で Rake 入力', apply: (d) => ({ ...d, fmt: 'mtt', rake: '5' }) },
  { name: '形式を MTT に', apply: (d) => ({ ...d, fmt: 'mtt' }) },
  { name: '人数未選択', apply: (d) => ({ ...d, players: null }) },
];

/** 下書きの文字の欄だけの違い（画面は厳密に読み、サーバーへは Number() で送る）で、画面のほうが厳しくなる分類 */
const LEXICAL = new Set(['SB が範囲外', 'Ante が不正', 'Stack が不正', 'Rake が範囲外']);

describe('B-02 画面の判定とサーバーの判定の一致', () => {
  it('ランダムなハンド 6000 件: buildSubmission が通る ⇔ サーバー（handler）が 201。通るときは派生メタも一致する', async () => {
    const lexDetail: Record<string, string> = {};
    const stat = { total: 0, ok: 0, both: 0, mutRejectBoth: 0, lexicalClientStricter: 0, partialHand: 0, postableBase: 0, codes: {} as Record<string, number> };
    for (let i = 0; i < 9000; i++) {
      const seed = 700_000 + i;
      const rng = new Rng(seed);
      const b = buildDraft(rng);
      const mut = MUTS[i % MUTS.length]!;
      let d = b.draft;
      // 変更なしの割合を残しつつ、全種類の改変を均等に当てる
      d = mut.apply(d, rng, b);
      if (mut.settle) d = settleActions(d);
      const label = `seed=${seed} mut=${mut.name}`;
      let client;
      try {
        client = buildSubmission(d);
      } catch (e) {
        throw new Error(`${label}: buildSubmission が例外 ${e instanceof Error ? e.stack : String(e)}`);
      }
      const body = submissionBody(d);
      const srv = await serverVerdict(body);
      stat.total++;
      if (mut.name === '変更なし' && client.ok) stat.postableBase++;
      expect(srv.status === 201 || srv.status === 422, `${label}: サーバーが ${srv.status} ${srv.error ?? ''}`).toBe(true);
      if (srv.error) stat.codes[srv.error] = (stat.codes[srv.error] ?? 0) + 1;
      if (client.ok) {
        // 画面が通したものは、サーバーも必ず通す（画面の本文そのもの）
        expect(srv.status, `${label}: 画面は通したがサーバーは ${srv.error}\n${JSON.stringify(client.body)}`).toBe(201);
        stat.ok++;
        // サーバーが再計算した派生メタは、画面が計算して送った値と一致する
        const dv = (client.body as { derived: Record<string, unknown> }).derived;
        const p = srv.payload as InsertPayload;
        expect(
          { street: p.street, keys: p.keys, s1_label: p.s1_label, min_to: p.min_to, max_to: p.max_to, pot_base: p.pot_base, effective_stack: p.effective_stack, stop_index: p.stop_index },
          label,
        ).toEqual(dv);
        expect(p.spot_index).toBe(d.spotIndex);
        // 保存する値の正規化: 座っている席のスタックだけ・to は bb・タイトルは前後の空白なし
        expect(Object.keys(p.stacks).sort(), label).toEqual([...SEATS_BY_COUNT[d.players as PlayerCount]].sort());
        expect(p.title).toBe(d.title.trim());
      } else if (srv.status === 201) {
        // 画面が断ったのにサーバーは通した: 許す分類（画面だけの概念）だけ
        const partial = POSITIONS.some((pos) => pos !== d.hero && d.hands[pos] !== '' && d.hands[pos].length !== 4 && d.players !== null && SEATS_BY_COUNT[d.players].includes(pos));
        if (LEXICAL.has(mut.name)) {
          stat.lexicalClientStricter++;
          lexDetail[`${mut.name} => ${JSON.stringify([d.sb, d.ante, d.rake, d.fmt])}`] = client.errors.join(' / ');
        }
        else if (partial) stat.partialHand++;
        else throw new Error(`${label}: サーバーは通したが画面は断った: ${client.errors.join(' / ')}\n${JSON.stringify(body)}`);
      } else {
        stat.both++;
      }
    }
    // eslint-disable-next-line no-console
    console.log('B-02 統計', JSON.stringify(stat), JSON.stringify(lexDetail));
    // 生成が偏っていない: 通るハンドも断られるハンドも十分ある
    expect(stat.ok).toBeGreaterThan(700);
    expect(stat.both).toBeGreaterThan(800);
    expect(stat.postableBase).toBeGreaterThan(50);
  }, 240_000);

  it('画面を通さない本文（ハンドをそのまま JSON にした submissionBody）でも、画面が断るハンドはサーバーも断る（不変条件 4）', async () => {
    let refused = 0;
    for (let i = 0; i < 3000; i++) {
      const seed = 800_000 + i;
      const rng = new Rng(seed);
      const b = buildDraft(rng);
      const d = b.draft;
      const client = buildSubmission(d);
      const srv = await serverVerdict(submissionBody(d));
      if (!client.ok && d.hands[d.hero].length === 4 && POSITIONS.every((p) => d.hands[p] === '' || d.hands[p].length === 4)) {
        expect(srv.status, `seed=${seed}: ${client.errors.join(' / ')}`).toBe(422);
        refused++;
      }
    }
    expect(refused).toBeGreaterThan(300);
  }, 240_000);

  it('見本（H-S1・H-MW・H-S3・オールイン 23 通り）は画面もサーバーも同じ判定', async () => {
    for (const raw of [hs1(), hmw(), hs3()]) {
      expect((await serverVerdict(raw)).status).toBe(201);
    }
    for (const c of ALLIN_CASES) {
      const actions = acts(c.actions);
      const pfAllin = hasPreflopAllin(setupOf(c), actions);
      const cands = spotCandidates(actions, c.hero);
      for (const { index } of cands) {
        const v = await serverVerdict(allinRaw(c, index));
        if (pfAllin) {
          expect(v, `${c.name} #${index}`).toMatchObject({ status: 422, error: 'preflop_allin' });
        } else {
          expect(v.status, `${c.name} #${index}: ${v.error}`).toBe(201);
        }
      }
      if (!pfAllin) expect(cands.map((_, i) => c.spots[i]?.[0] ?? '').length).toBe(c.spots.length);
    }
  });
});

// ---- B-02b: 本文の改ざん ----

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

type Tamper = { name: string; apply: (raw: Raw, rng: Rng) => void; code?: string[] };

const derivedOf = (raw: Raw): Record<string, unknown> => raw.derived as Record<string, unknown>;
const actionsOf = (raw: Raw): Record<string, unknown>[] => raw.actions as Record<string, unknown>[];

/**
 * 必ず断られる改ざん（合法な別のハンドにならないもの）。
 * 額の変更は別の合法なハンドになりうるので、範囲外・型違い・小数点以下 4 桁など「必ず不正」な値だけを使う。
 */
const TAMPERS: Tamper[] = [
  ...(['street', 'keys', 's1_label', 'min_to', 'max_to', 'pot_base', 'effective_stack', 'stop_index'] as const).map(
    (f): Tamper => ({
      name: `derived.${f} を変える`,
      apply: (raw, rng) => {
        const d = derivedOf(raw);
        const v = d[f];
        if (f === 'street') d[f] = rng.pick(['pf', 'flop', 'turn', 'river'].filter((s) => s !== v));
        else if (f === 'keys') d[f] = rng.pick([['fold'], ['check', 'call'], ['fold', 'call', 's1', 'check'], [], ['s1'], (v as string[]).slice().reverse().concat(['fold'])]);
        else if (f === 's1_label') d[f] = v === 'bet' ? 'raise' : v === 'raise' ? 'bet' : rng.pick(['bet', 'raise']);
        else if (f === 'stop_index') d[f] = (v as number) + rng.pick([-1, 1, 5]);
        else d[f] = v === null ? 5 : (v as number) + rng.pick([0.001, -0.001, 1, -1, 100]);
      },
      code: ['derived_mismatch', 'malformed'],
    }),
  ),
  { name: 'spot_index を別の値に', apply: (raw, rng) => void (raw.spot_index = (raw.spot_index as number) + rng.pick([-1, 1, 2, 1000])), code: ['derived_mismatch', 'invalid_spot', 'malformed'] },
  { name: 'spot_index を小数に', apply: (raw) => void (raw.spot_index = 0.5), code: ['malformed'] },
  { name: 'spot_index を文字列に', apply: (raw) => void (raw.spot_index = String(raw.spot_index)), code: ['malformed'] },
  { name: 'spot_index を null に', apply: (raw) => void (raw.spot_index = null), code: ['malformed'] },
  { name: 'derived を消す', apply: (raw) => void delete raw.derived, code: ['malformed'] },
  { name: 'derived を配列に', apply: (raw) => void (raw.derived = []), code: ['malformed'] },
  { name: 'Action の席を別の席に', apply: (raw, rng) => {
    const a = actionsOf(raw);
    const k = rng.int(0, a.length - 1);
    const seats = Object.keys(raw.stacks as object).filter((p) => p !== a[k]!.pos);
    a[k]!.pos = rng.pick(seats);
  }, code: ['not_your_turn', 'illegal_action', 'action_after_end', 'derived_mismatch', 'amount_out_of_range', 'hand_incomplete', 'board_mismatch', 'street_mismatch'] },
  { name: 'Action の席を存在しない席に', apply: (raw, rng) => void (actionsOf(raw)[rng.int(0, actionsOf(raw).length - 1)]!.pos = 'XX'), code: ['malformed'] },
  { name: 'Action のストリートを変える', apply: (raw, rng) => {
    const a = actionsOf(raw);
    const k = rng.int(0, a.length - 1);
    a[k]!.street = rng.pick(['pf', 'flop', 'turn', 'river'].filter((s) => s !== a[k]!.street));
  }, code: ['street_mismatch'] },
  { name: 'Action の種別を不正な名前に', apply: (raw, rng) => void (actionsOf(raw)[rng.int(0, actionsOf(raw).length - 1)]!.type = 'shove'), code: ['malformed'] },
  { name: 'fold の Action に to を付ける', apply: (raw) => {
    const a = actionsOf(raw).find((x) => x.type === 'fold' || x.type === 'check' || x.type === 'call');
    if (a) a.to = 5;
  }, code: ['malformed'] },
  { name: 'bet/raise の to を消す', apply: (raw) => {
    const a = actionsOf(raw).find((x) => x.type === 'bet' || x.type === 'raise');
    if (a) delete a.to;
  }, code: ['malformed'] },
  { name: 'bet/raise の to を小数第 4 位に', apply: (raw) => {
    const a = actionsOf(raw).find((x) => x.type === 'bet' || x.type === 'raise');
    if (a) a.to = (a.to as number) + 0.0001;
  }, code: ['malformed'] },
  { name: 'bet/raise の to を文字列に', apply: (raw) => {
    const a = actionsOf(raw).find((x) => x.type === 'bet' || x.type === 'raise');
    if (a) a.to = String(a.to);
  }, code: ['malformed'] },
  { name: 'bet/raise の to を負に', apply: (raw) => {
    const a = actionsOf(raw).find((x) => x.type === 'bet' || x.type === 'raise');
    if (a) a.to = -(a.to as number);
  }, code: ['malformed', 'amount_out_of_range'] },
  { name: 'bet/raise の to を上限超に', apply: (raw) => {
    const a = actionsOf(raw).find((x) => x.type === 'bet' || x.type === 'raise');
    if (a) a.to = 10000;
  }, code: ['malformed'] },
  { name: '最後の Action を落とす', apply: (raw) => void actionsOf(raw).pop(), code: ['hand_incomplete', 'derived_mismatch', 'invalid_spot', 'malformed'] },
  { name: '終了後の Action を足す', apply: (raw) => void actionsOf(raw).push({ ...actionsOf(raw).at(-1)! }), code: ['action_after_end', 'not_your_turn', 'street_mismatch', 'illegal_action'] },
  { name: 'Board を 1 枚足す', apply: (raw) => {
    const b = raw.board as string[];
    const all = ['2c', '3c', '4c', '5c', '6c', '7c'].filter((c) => !b.includes(c) && !JSON.stringify(raw.hero_cards).includes(c) && !JSON.stringify(raw.known_cards).includes(c));
    b.push(all[0]!);
  }, code: ['board_mismatch', 'malformed'] },
  { name: 'Board を 1 枚減らす', apply: (raw) => void (raw.board as string[]).pop(), code: ['board_mismatch'] },
  { name: 'Board に重複した札', apply: (raw) => {
    const b = raw.board as string[];
    if (b.length >= 2) b[1] = b[0]!;
  }, code: ['duplicate_card'] },
  { name: 'Board に不正な札', apply: (raw) => {
    const b = raw.board as string[];
    if (b.length > 0) b[0] = '1z';
  }, code: ['malformed'] },
  { name: 'Board が配列でない', apply: (raw) => void (raw.board = 'AsKsQs'), code: ['malformed'] },
  { name: 'Board が 6 枚', apply: (raw) => void (raw.board = ['2c', '3c', '4c', '5c', '6c', '7c']), code: ['malformed'] },
  { name: 'Hero を席にいない席に', apply: (raw) => void (raw.hero = 'XX'), code: ['malformed'] },
  { name: 'Hero を座っていない席に', apply: (raw) => {
    const missing = ['UTG', 'HJ', 'CO'].find((p) => !(p in (raw.stacks as object)));
    raw.hero = missing ?? 'XX';
  }, code: ['invalid_settings', 'malformed'] },
  { name: 'hero_cards を 1 枚に', apply: (raw) => void (raw.hero_cards = [(raw.hero_cards as string[])[0]]), code: ['hero_cards_required'] },
  { name: 'hero_cards を 3 枚に', apply: (raw) => void (raw.hero_cards = [...(raw.hero_cards as string[]), '2h']), code: ['hero_cards_required'] },
  { name: 'hero_cards を消す', apply: (raw) => void delete raw.hero_cards, code: ['hero_cards_required'] },
  { name: 'hero_cards に重複', apply: (raw) => void (raw.hero_cards = [(raw.hero_cards as string[])[0], (raw.hero_cards as string[])[0]]), code: ['duplicate_card'] },
  { name: 'hero_cards がボードと重複', apply: (raw) => {
    const b = raw.board as string[];
    if (b.length) raw.hero_cards = [b[0], (raw.hero_cards as string[])[1]];
  }, code: ['duplicate_card'] },
  { name: 'known_cards に Hero の席', apply: (raw) => void ((raw.known_cards as Record<string, unknown>)[raw.hero as string] = ['2c', '3c']), code: ['malformed'] },
  { name: 'known_cards に存在しない席', apply: (raw) => void ((raw.known_cards as Record<string, unknown>).XX = ['2c', '3c']), code: ['malformed'] },
  { name: 'known_cards に muck を送る', apply: (raw) => {
    const s = Object.keys(raw.stacks as object).find((p) => p !== raw.hero)!;
    (raw.known_cards as Record<string, unknown>)[s] = 'muck';
  }, code: ['malformed'] },
  { name: 'known_cards の札が 1 枚', apply: (raw) => {
    const s = Object.keys(raw.stacks as object).find((p) => p !== raw.hero)!;
    (raw.known_cards as Record<string, unknown>)[s] = ['2c'];
  }, code: ['malformed'] },
  { name: 'known_cards が配列', apply: (raw) => void (raw.known_cards = []), code: ['malformed'] },
  { name: 'stacks に存在しない席を足す', apply: (raw) => void ((raw.stacks as Record<string, unknown>).XX = 100), code: ['malformed'] },
  { name: 'stacks の席を欠く（人数が成り立たない）', apply: (raw) => {
    const st = raw.stacks as Record<string, unknown>;
    const seats = Object.keys(st);
    // BTN と BB は消さない。席の集合が人数の表にない形にする（UTG だけ足す/CO だけ消す等）
    if (seats.length === 6) delete st.HJ;
    else if (seats.length === 2) st.UTG = 100;
    else delete st[seats[0]!];
    if (seats.length === 5 || seats.length === 4 || seats.length === 3) st.UTG = 100;
  }, code: ['invalid_settings', 'malformed', 'not_your_turn', 'illegal_action', 'derived_mismatch', 'hand_incomplete', 'board_mismatch', 'street_mismatch', 'action_after_end', 'invalid_spot'] },
  { name: 'stacks を 0 に', apply: (raw) => void ((raw.stacks as Record<string, unknown>)[raw.hero as string] = 0), code: ['invalid_settings'] },
  { name: 'stacks を負に', apply: (raw) => void ((raw.stacks as Record<string, unknown>)[raw.hero as string] = -1), code: ['invalid_settings', 'malformed'] },
  { name: 'stacks を上限超に', apply: (raw) => void ((raw.stacks as Record<string, unknown>)[raw.hero as string] = 10000), code: ['malformed'] },
  { name: 'stacks を第 4 位に', apply: (raw) => void ((raw.stacks as Record<string, unknown>)[raw.hero as string] = 100.0001), code: ['malformed'] },
  { name: 'stacks を文字列に', apply: (raw) => void ((raw.stacks as Record<string, unknown>)[raw.hero as string] = '100'), code: ['malformed'] },
  { name: 'stacks を null に', apply: (raw) => void ((raw.stacks as Record<string, unknown>)[raw.hero as string] = null), code: ['malformed'] },
  { name: 'stacks が配列', apply: (raw) => void (raw.stacks = []), code: ['malformed', 'invalid_settings'] },
  { name: 'bb を 2 に', apply: (raw) => void (raw.bb = 2), code: ['invalid_settings'] },
  { name: 'bb を 0.999 に', apply: (raw) => void (raw.bb = 0.999), code: ['invalid_settings'] },
  { name: 'sb を 0 に', apply: (raw) => void (raw.sb = 0), code: ['invalid_settings'] },
  { name: 'sb を bb 超に', apply: (raw) => void (raw.sb = 1.001), code: ['invalid_settings'] },
  { name: 'sb を負に', apply: (raw) => void (raw.sb = -0.5), code: ['invalid_settings', 'malformed'] },
  { name: 'ante を負に', apply: (raw) => void (raw.ante = -0.125), code: ['invalid_settings', 'malformed'] },
  { name: 'ante を第 4 位に', apply: (raw) => void (raw.ante = 0.1251), code: ['malformed'] },
  { name: 'ante を null に', apply: (raw) => void (raw.ante = null), code: ['malformed'] },
  { name: 'sb を NaN 相当（null）に', apply: (raw) => void (raw.sb = null), code: ['malformed'] },
  { name: 'fmt を不正に', apply: (raw) => void (raw.fmt = 'sng'), code: ['malformed'] },
  { name: 'MTT に rake', apply: (raw) => { raw.fmt = 'mtt'; raw.rake = 5; }, code: ['invalid_settings'] },
  { name: 'rake を 101 に', apply: (raw) => { raw.fmt = 'cash'; raw.rake = 101; }, code: ['invalid_settings'] },
  { name: 'rake を負に', apply: (raw) => { raw.fmt = 'cash'; raw.rake = -1; }, code: ['invalid_settings'] },
  { name: 'rake を第 3 位に', apply: (raw) => { raw.fmt = 'cash'; raw.rake = 1.234; }, code: ['malformed'] },
  { name: 'rake を文字列に', apply: (raw) => { raw.fmt = 'cash'; raw.rake = '5'; }, code: ['malformed'] },
  { name: 'title を空に', apply: (raw) => void (raw.title = ''), code: ['invalid_title'] },
  { name: 'title を空白だけに', apply: (raw) => void (raw.title = ' \t\n '), code: ['invalid_title'] },
  { name: 'title を 41 字に', apply: (raw) => void (raw.title = 'x'.repeat(41)), code: ['invalid_title'] },
  { name: 'title を数に', apply: (raw) => void (raw.title = 5), code: ['malformed'] },
  { name: 'title を消す', apply: (raw) => void delete raw.title, code: ['malformed'] },
];

describe('B-02b 本文の改ざんはサーバーが必ず断る', () => {
  it('ランダムな正しい投稿（サーバーが通す本文）に 1 か所ずつ改ざんを入れると、期待したコードで 422 になり、保存しない', async () => {
    const base: Raw[] = [];
    for (let i = 0; base.length < 60 && i < 4000; i++) {
      const b = buildDraft(new Rng(900_000 + i));
      const s = buildSubmission(b.draft);
      if (s.ok) base.push(s.body);
    }
    expect(base.length).toBeGreaterThanOrEqual(40);
    // 改ざんの前の本文は通ることを確認
    for (const raw of base) expect((await serverVerdict(raw)).status).toBe(201);

    let cases = 0;
    let vacuous = 0;
    for (const t of TAMPERS) {
      if (!t.code) continue;
      for (let k = 0; k < base.length; k++) {
        const rng = new Rng(k * 31 + 7);
        const raw = clone(base[k]!);
        const before = JSON.stringify(raw);
        t.apply(raw, rng);
        if (JSON.stringify(raw) === before) {
          vacuous++; // その本文に当てはまらない改ざん（例: bet がない）
          continue;
        }
        const { handler, insertPost } = makeHandler();
        const res = await handler(
          new Request('https://fn.example/', {
            method: 'POST',
            headers: { Authorization: 'Bearer x', Origin: 'http://localhost:5173' },
            body: JSON.stringify(raw),
          }),
        );
        const text = await res.text();
        expect(res.status, `${t.name} #${k}: ${text}\n${JSON.stringify(raw)}`).toBe(422);
        expect(t.code, `${t.name} #${k}: ${text}`).toContain((JSON.parse(text) as { error: string }).error);
        expect(insertPost, `${t.name} #${k}`).not.toHaveBeenCalled();
        cases++;
      }
    }
    // eslint-disable-next-line no-console
    console.log('B-02b 統計', JSON.stringify({ base: base.length, tampers: TAMPERS.filter((t) => t.code).length, cases, vacuous }));
    expect(cases).toBeGreaterThan(2000);
  }, 240_000);

  it('額を 1mbb だけ変えた本文: 断られるか、別の合法なハンドとして通り、サーバーが再計算した派生メタが本文の derived と一致するときだけ通る', async () => {
    let rejected = 0;
    let accepted = 0;
    for (let i = 0; i < 3000; i++) {
      const b = buildDraft(new Rng(950_000 + i));
      const s = buildSubmission(b.draft);
      if (!s.ok) continue;
      const raw = clone(s.body) as Raw;
      const sized = actionsOf(raw).filter((a) => a.type === 'bet' || a.type === 'raise');
      if (sized.length === 0) continue;
      const rng = new Rng(i);
      const a = rng.pick(sized);
      a.to = Math.round(((a.to as number) + rng.pick([-0.001, 0.001, 0.01, -0.01, 1, -1])) * 1000) / 1000;
      const v = await serverVerdict(raw);
      if (v.status === 201) {
        accepted++;
        // 通ったなら、サーバーが保存する値（再計算）は、その本文の Action から成る。derived は本文の値と一致している
        const p = v.payload as InsertPayload;
        const dv = raw.derived as Record<string, unknown>;
        expect({ street: p.street, keys: p.keys, pot_base: p.pot_base, effective_stack: p.effective_stack, min_to: p.min_to, max_to: p.max_to }, `i=${i}`).toEqual({
          street: dv.street,
          keys: dv.keys,
          pot_base: dv.pot_base,
          effective_stack: dv.effective_stack,
          min_to: dv.min_to,
          max_to: dv.max_to,
        });
      } else {
        expect(v.status).toBe(422);
        rejected++;
      }
    }
    expect(rejected + accepted).toBeGreaterThan(500);
  }, 240_000);

  it('handler へ送る本文がオブジェクトでない・巨大・入れ子が深い・変わった JSON でも 5xx にならず 422', async () => {
    const weird: (string | unknown)[] = [
      '[]', 'null', '1', '"x"', 'true', '{}', '{"title":1}', '{"__proto__":{"x":1}}', '{"stacks":{"__proto__":100}}',
      JSON.stringify(hs1()).replace('"stacks":{', '"stacks":{"__proto__":100,'),
      '{"a":' + '['.repeat(20000) + ']'.repeat(20000) + '}',
      JSON.stringify({ ...hs1(), actions: Array.from({ length: 5000 }, () => ({ street: 'pf', pos: 'UTG', type: 'fold' })) }),
      JSON.stringify({ ...hs1(), actions: 'x'.repeat(1000) }),
      JSON.stringify({ ...hs1(), actions: [null] }),
      JSON.stringify({ ...hs1(), actions: [[]] }),
      JSON.stringify({ ...hs1(), board: [null] }),
      JSON.stringify({ ...hs1(), hero_cards: [['A', 's'], 'Kd'] }),
      JSON.stringify({ ...hs1(), known_cards: { BB: {} } }),
      JSON.stringify({ ...hs1(), derived: { ...(hs1().derived as object), keys: 'check' } }),
      JSON.stringify({ ...hs1(), derived: { ...(hs1().derived as object), stop_index: 1e21 } }),
      JSON.stringify({ ...hs1(), spot_index: 1e21 }),
      JSON.stringify({ ...hs1(), spot_index: -0 }),
      '\u0000', '﻿{}', ' ', '',
    ];
    for (const w of weird) {
      const v = await serverVerdict(w);
      expect(v.status, `body=${String(w).slice(0, 80)}`).toBe(422);
    }
  });

  it('知らないキー（__proto__・constructor を含む）は無視され、保存する値にも Object.prototype にも入らない', async () => {
    const body = JSON.stringify(hs1()).replace('"title":', '"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"extra":"x","title":');
    const v = await serverVerdict(body);
    expect(v.status).toBe(201);
    expect(JSON.stringify(v.payload)).not.toContain('polluted');
    expect(Object.keys(v.payload as object)).not.toContain('extra');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ---- 既知の不具合の再現（直ったら it.fails が失敗する → it に戻す） ----

describe('B-02c 見つけた問題の再現（it.fails: 期待どおりに動くようになると失敗して知らせる）', () => {
  it('タイトルに制御文字（NUL）があるとサーバー（validateInput）が断る（DB の jsonb は \\u0000 を保存できない）', async () => {
    const raw = { ...hs1(), title: 'ab\u0000cd' };
    const v = await serverVerdict(raw);
    expect(v.status).toBe(422);
  });

  it('タイトルに対のないサロゲートがあるとサーバーが断る（Postgres の text / jsonb は保存できない）', async () => {
    const raw = { ...hs1(), title: 'ab\ud800cd' };
    const v = await serverVerdict(raw);
    expect(v.status).toBe(422);
  });
});
