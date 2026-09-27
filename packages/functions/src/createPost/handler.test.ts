/**
 * Neon Function `create-post` の HTTP の振る舞い（詳細仕様 03 章 §3・§5）。
 * 検証そのもの（VAL・派生メタの照合・マック補完）は packages/core の post.test.ts で確かめている。
 * ここでは、その結果が HTTP の応答と insert_post の引数にどう写るかを確かめる。
 */
import { describe, expect, it, vi } from 'vitest';
import { hmw, hs1, hs3, type Raw } from '../../../core/src/post/postFixtures.ts';
import { createPostHandler, DbError, MAX_BODY_BYTES, type CreatePostDeps } from './handler.ts';
import type { InsertPayload } from './payload.ts';

const ORIGIN = 'http://localhost:5173';
const UID = '11111111-1111-4111-8111-111111111111';

function setup(over: Partial<CreatePostDeps> = {}) {
  const insertPost = vi.fn<CreatePostDeps['insertPost']>(async () => 'post-id');
  const logError = vi.fn();
  const handler = createPostHandler({
    verifyToken: async (t) => (t === 'good' ? UID : null),
    insertPost,
    allowedOrigins: [ORIGIN, 'https://wwyd.example'],
    logError,
    ...over,
  });
  return { handler, insertPost, logError };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://fn.example/', {
    method: 'POST',
    headers: { Authorization: 'Bearer good', Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}

describe('CORS とメソッド', () => {
  it('OPTIONS は 204 で、許可したオリジンだけを返す', async () => {
    const { handler } = setup();
    const ok = await handler(new Request('https://fn.example/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(ok.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    const ng = await handler(new Request('https://fn.example/', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
    expect(ng.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('POST 以外は 405', async () => {
    const { handler } = setup();
    const res = await handler(new Request('https://fn.example/', { method: 'GET', headers: { Origin: ORIGIN } }));
    expect(res.status).toBe(405);
    expect(await json(res)).toEqual({ error: 'method_not_allowed' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
});

describe('認証（03 章 §3.2 の 1）', () => {
  it.each<[string, Record<string, string>]>([
    ['トークンなし', { Authorization: '' }],
    ['Bearer でない', { Authorization: 'Basic good' }],
    ['無効なトークン', { Authorization: 'Bearer bad' }],
  ])('%s は 401', async (_n, headers) => {
    const { handler, insertPost } = setup();
    const res = await handler(post(hs1(), headers));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: 'not_authenticated' });
    expect(insertPost).not.toHaveBeenCalled();
  });

  it('検証で例外が出ても 401', async () => {
    const { handler } = setup({ verifyToken: async () => Promise.reject(new Error('JWKS に届かない')) });
    expect((await handler(post(hs1()))).status).toBe(401);
  });

  it('認証は本文の検証より先', async () => {
    const { handler } = setup();
    expect((await handler(post('{', { Authorization: '' }))).status).toBe(401);
  });
});

describe('検証エラーは 422（EF-01）', () => {
  it('JSON でない本文は malformed', async () => {
    const { handler } = setup();
    const res = await handler(post('{'));
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({ error: 'malformed' });
  });

  it('大きすぎる本文は malformed', async () => {
    const { handler, insertPost } = setup();
    const res = await handler(post({ ...hs1(), pad: 'x'.repeat(MAX_BODY_BYTES) }));
    expect(res.status).toBe(422);
    expect(insertPost).not.toHaveBeenCalled();
  });

  it('タイトルは invalid_title', async () => {
    const { handler } = setup();
    expect(await json(await handler(post({ ...hs1(), title: '  ' })))).toEqual({ error: 'invalid_title' });
  });

  it('アクションの誤りは添字を detail.index に入れる', async () => {
    const raw = hs1();
    const actions = (raw.actions as Raw[]).map((a) => ({ ...a }));
    actions[4] = { street: 'pf', pos: 'SB', type: 'check' };
    const res = await setup().handler(post({ ...raw, actions }));
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({ error: 'illegal_action', detail: { index: 4 } });
  });

  it('EF-03 derived の改ざんは derived_mismatch で、保存しない', async () => {
    const { handler, insertPost } = setup();
    const raw = hs1();
    raw.derived = { ...(raw.derived as Raw), pot_base: 22 };
    expect(await json(await handler(post(raw)))).toEqual({ error: 'derived_mismatch' });
    expect(insertPost).not.toHaveBeenCalled();
  });
});

describe('保存（EF-02・EF-04）', () => {
  it('H-S1: 201 と ID を返し、insert_post に 04 章の値を渡す', async () => {
    const { handler, insertPost } = setup();
    const res = await handler(post(hs1()));
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ id: 'post-id' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(insertPost).toHaveBeenCalledTimes(1);
    const [uid, p] = insertPost.mock.calls[0] as [string, InsertPayload];
    expect(uid).toBe(UID);
    expect(p).toMatchObject({
      title: 'K83r のターン 2 バレル',
      fmt: 'cash',
      hero: 'BTN',
      villain: 'BB',
      street: 'turn',
      effective_stack: 100,
      keys: ['fold', 'call', 's1'],
      s1_label: 'raise',
      min_to: 13,
      max_to: 95.7,
      pot_base: 22.1,
      sb: 0.5,
      bb: 1,
      ante: 0,
      rake: 5,
      stacks: { UTG: 100, HJ: 100, CO: 100, BTN: 100, SB: 100, BB: 100 },
      board: ['Kh', '8d', '3c', '2s', '7h'],
      spot_index: 10,
      stop_index: 11,
      hero_cards: ['Ad', 'Kd'],
      known_cards: { BB: ['Ks', 'Js'] },
    });
    expect(p.actions[3]).toEqual({ street: 'pf', pos: 'BTN', type: 'raise', to: 2.5 });
    expect(p.actions[0]).toEqual({ street: 'pf', pos: 'UTG', type: 'fold' });
    expect(p.actions).toHaveLength(15);
  });

  it('H-MW: 停止位置と、未入力のショーダウンのマック補完', async () => {
    const { handler, insertPost } = setup();
    expect((await handler(post({ ...hmw(), known_cards: { BTN: ['7s', '7d'] } }))).status).toBe(201);
    const p = insertPost.mock.calls[0]?.[1] as InsertPayload;
    expect(p.stop_index).toBe(9);
    expect(p.pot_base).toBe(17);
    expect(p.known_cards).toEqual({ BTN: ['7s', '7d'], BB: 'muck' });
  });

  it('H-S3（MTT）: レーキは null、端数の金額は bb に戻す', async () => {
    const { handler, insertPost } = setup();
    expect((await handler(post(hs3()))).status).toBe(201);
    const p = insertPost.mock.calls[0]?.[1] as InsertPayload;
    expect(p).toMatchObject({ fmt: 'mtt', rake: null, ante: 0.125, max_to: 19.775, pot_base: 11.45, effective_stack: 22 });
  });

  it('EF-04 タイトルはサーバーで整えた値（前後の空白を除く）', async () => {
    const { handler, insertPost } = setup();
    await handler(post({ ...hs1(), title: '  見本  ' }));
    expect(insertPost.mock.calls[0]?.[1].title).toBe('見本');
  });
});

describe('DB のエラー', () => {
  it.each<[string, number]>([
    ['daily_limit', 429],
    ['not_allowed', 403],
  ])('%s は %i', async (code, status) => {
    const { handler } = setup({ insertPost: async () => Promise.reject(new DbError(code)) });
    const res = await handler(post(hs1()));
    expect(res.status).toBe(status);
    expect(await json(res)).toEqual({ error: code });
  });

  it('それ以外は 500 internal で、本文に内部情報を出さない', async () => {
    const { handler, logError } = setup({ insertPost: async () => Promise.reject(new Error('connection refused 10.0.0.1')) });
    const res = await handler(post(hs1()));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"error":"internal"}');
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
