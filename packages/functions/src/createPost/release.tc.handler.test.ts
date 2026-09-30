/**
 * C-03（リリース前テスト。docs/release-test-plan.md §3 C）: create-post の handler への攻撃的な入力。
 * 既存の handler.test.ts に無い場合: 本文の型・巨大・深い入れ子・__proto__、でたらめな変異（500 が出ないこと）、
 * CORS のオリジンの照合（末尾のスラッシュ・大文字・null・部分一致）、クライアントが uid・answer_count などを混ぜても使われないこと。
 */
import { describe, expect, it, vi } from 'vitest';
import { hs1, type Raw } from '../../../core/src/post/postFixtures.ts';
import { createPostHandler, DbError, MAX_BODY_BYTES, type CreatePostDeps } from './handler.ts';
import type { InsertPayload } from './payload.ts';

// 乱数で多くのハンドを回す試験がある。CI の遅い環境でも既定の 5 秒で打ち切らない（2026-09-30 CI で 5.09 秒かかり落ちた）
vi.setConfig({ testTimeout: 60_000 });

const ORIGIN = 'http://localhost:5173';
const UID = '11111111-1111-4111-8111-111111111111';

function setup(over: Partial<CreatePostDeps> = {}) {
  const insertPost = vi.fn<CreatePostDeps['insertPost']>(async () => 'post-id');
  const logError = vi.fn();
  const verifyToken = vi.fn<CreatePostDeps['verifyToken']>(async (t) => (t === 'good' ? UID : null));
  const handler = createPostHandler({
    verifyToken,
    insertPost,
    allowedOrigins: [ORIGIN, 'https://wwyd.example'],
    logError,
    ...over,
  });
  return { handler, insertPost, logError, verifyToken };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://fn.example/', {
    method: 'POST',
    headers: { Authorization: 'Bearer good', Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('C-03 本文の形（不正な JSON）は 422 malformed で、保存も 500 もしない', () => {
  const cases: [string, string][] = [
    ['空', ''],
    ['空白だけ', '   \n\t '],
    ['null', 'null'],
    ['配列', '[]'],
    ['数値', '123'],
    ['文字列', '"x"'],
    ['真偽値', 'true'],
    ['途中で切れた JSON', '{"title":"a"'],
    ['末尾にゴミ', JSON.stringify(hs1()) + 'x'],
    ['シングルクォート', "{'title':'a'}"],
    ['NaN', '{"title":"a","sb":NaN}'],
    ['とても深い入れ子（配列）', '['.repeat(30000) + ']'.repeat(30000)],
  ];
  it.each(cases)('%s', async (_n, body) => {
    const { handler, insertPost, logError } = setup();
    const res = await handler(post(body));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'malformed' });
    expect(insertPost).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('本文の上限ちょうど（64KB）は受け付け、1 バイト超えると 422（文字数ではなくバイト数）', async () => {
    const base = JSON.stringify({ ...hs1(), pad: '' });
    const need = MAX_BODY_BYTES - bytes(base);
    const exact = JSON.stringify({ ...hs1(), pad: 'x'.repeat(need) });
    expect(bytes(exact)).toBe(MAX_BODY_BYTES);
    const over = JSON.stringify({ ...hs1(), pad: 'x'.repeat(need + 1) });
    const ok = setup();
    expect((await ok.handler(post(exact))).status).toBe(201);
    const ng = setup();
    expect((await ng.handler(post(over))).status).toBe(422);
    expect(ng.insertPost).not.toHaveBeenCalled();
    // 3 バイト文字で、文字数は上限より少なくてもバイト数で断る
    const multi = setup();
    expect((await multi.handler(post(JSON.stringify({ ...hs1(), pad: 'あ'.repeat(30000) })))).status).toBe(422);
  });

  it('巨大な本文（5MB）も 422 で終わり、DB に触れない', async () => {
    const { handler, insertPost, logError } = setup();
    const res = await handler(post('x'.repeat(5 * 1024 * 1024)));
    expect(res.status).toBe(422);
    expect(insertPost).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('__proto__・constructor のキーがあっても、保存する値を汚さない・落ちない', async () => {
    const { handler, insertPost, logError } = setup();
    const text = JSON.stringify(hs1()).replace('{', '{"__proto__":{"polluted":true,"title":"x"},"constructor":{"prototype":{"polluted":true}},');
    const res = await handler(post(text));
    expect([201, 422]).toContain(res.status);
    expect(logError).not.toHaveBeenCalled();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (res.status === 201) {
      const p = insertPost.mock.calls[0]?.[1] as InsertPayload;
      expect(p.title).not.toBe('x');
      expect((p as unknown as Record<string, unknown>).polluted).toBeUndefined();
    }
    const stacks = setup();
    const raw = hs1();
    (raw.stacks as Record<string, unknown>).__proto__ = 100;
    const t2 = JSON.stringify(raw).replace('"stacks":{', '"stacks":{"__proto__":100,');
    expect((await stacks.handler(post(t2))).status).toBe(422);
  });
});

describe('C-03 でたらめな変異でも 500（想定外のエラー）が出ない', () => {
  // 種を固定した擬似乱数（mulberry32）。落ちたら同じ種で再現できる
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const JUNK: unknown[] = [
    null, true, false, 0, -1, 1, 0.5, 1e308, -1e308, 1e-9, 0.0001, 99999999, 9007199254740993, -0, '', ' ', 'x', 'あ', '\u0000',
    'a'.repeat(200), [], {}, [null], [[]], { a: 1 }, ['Ad', 'Ad'], ['Ad'], 'Ad', '__proto__', 'muck', 'BTN', 'river', 'pf',
    { street: 'flop', pos: 'BTN', type: 'bet', to: 1 }, { street: 'x' },
  ];

  function pick<T>(r: () => number, xs: readonly T[]): T {
    return xs[Math.floor(r() * xs.length)] as T;
  }

  /** 木の中のランダムな場所を選び、消す・でたらめな値に置き換える・キーを足す */
  function mutate(root: Raw, r: () => number): Raw {
    const copy = structuredClone(root) as Raw;
    const steps = 1 + Math.floor(r() * 3);
    for (let s = 0; s < steps; s++) {
      let node: unknown = copy;
      let parent: Record<string, unknown> | unknown[] | null = null;
      let key: string | number | null = null;
      const depth = Math.floor(r() * 4);
      for (let d = 0; d < depth; d++) {
        if (typeof node !== 'object' || node === null) break;
        const keys = Object.keys(node);
        if (keys.length === 0) break;
        const k = pick(r, keys);
        parent = node as Record<string, unknown> | unknown[];
        key = Array.isArray(node) ? Number(k) : k;
        node = (node as Record<string, unknown>)[k];
      }
      if (parent === null || key === null) {
        const keys = Object.keys(copy);
        key = pick(r, keys);
        parent = copy;
      }
      const op = r();
      if (op < 0.3) {
        if (Array.isArray(parent)) parent.splice(key as number, 1);
        else delete (parent as Record<string, unknown>)[key as string];
      } else if (op < 0.85) {
        (parent as Record<string, unknown>)[key as string] = pick(r, JUNK);
      } else {
        (parent as Record<string, unknown>)[`extra${Math.floor(r() * 5)}`] = pick(r, JUNK);
      }
    }
    return copy;
  }

  it('1500 通りの変異（種 1〜3）: 201 か 422 だけ。500・例外の記録は 0 件', async () => {
    const unexpected: string[] = [];
    let ok = 0;
    let bad = 0;
    for (const seed of [1, 2, 3]) {
      const r = rng(seed);
      for (let i = 0; i < 500; i++) {
        const { handler, logError } = setup();
        const m = mutate(hs1(), r);
        const text = JSON.stringify(m);
        const res = await handler(post(text));
        if (res.status === 201) ok++;
        else if (res.status === 422) bad++;
        else unexpected.push(`seed=${seed} i=${i} status=${res.status}: ${text.slice(0, 300)}`);
        if (logError.mock.calls.length > 0) unexpected.push(`seed=${seed} i=${i} logError: ${String(logError.mock.calls[0]?.[1])}: ${text.slice(0, 300)}`);
      }
    }
    expect(unexpected).toEqual([]);
    // 変異がほぼ全部 422 か、ほぼ全部 201 に偏っていない（試験として意味がある）
    expect(ok).toBeGreaterThan(50);
    expect(bad).toBeGreaterThan(500);
  }, 120_000);
});

describe('C-03 クライアントが混ぜた値は使われない（不変条件 4）', () => {
  it('uid・author_uid・id・answer_count・created_at・is_admin を本文に入れても、insert_post の引数に入らない', async () => {
    const { handler, insertPost } = setup();
    const raw = {
      ...hs1(),
      uid: '22222222-2222-4222-8222-222222222222',
      author_uid: '22222222-2222-4222-8222-222222222222',
      author: '22222222-2222-4222-8222-222222222222',
      id: '33333333-3333-4333-8333-333333333333',
      answer_count: 999,
      created_at: '2000-01-01T00:00:00Z',
      is_admin: true,
      villain: 'BB',
      pot_base: 1,
      min_to: 0,
      hero_answer: 'x',
    };
    const res = await handler(post(raw));
    expect(res.status).toBe(201);
    const [uid, p] = insertPost.mock.calls[0] as [string, InsertPayload];
    expect(uid).toBe(UID); // トークンの sub だけ
    expect(Object.keys(p).sort()).toEqual(
      [
        'actions', 'ante', 'bb', 'board', 'effective_stack', 'fmt', 'hero', 'hero_cards', 'keys', 'known_cards', 'max_to', 'min_to',
        'pot_base', 'rake', 's1_label', 'sb', 'spot_index', 'stacks', 'stop_index', 'street', 'title', 'villain_reads', 'mtt',
      ].sort(),
    );
    expect(p.pot_base).toBe(9.1); // サーバーの計算値（本文の pot_base: 1 は無視）
    expect(p.min_to).toBe(1);
    expect(JSON.stringify(p)).not.toContain('2222');
    expect(JSON.stringify(p)).not.toContain('answer_count');
  });

  it('本文の中の Authorization 風の値・クエリの token は認証に使われない', async () => {
    const { handler, verifyToken, insertPost } = setup();
    const req = new Request('https://fn.example/?token=good&access_token=good', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...hs1(), token: 'good', Authorization: 'Bearer good' }),
    });
    expect((await handler(req)).status).toBe(401);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(insertPost).not.toHaveBeenCalled();
  });

  it('DB のエラーの文言・内部情報は、応答にもログの引数（本文）にも出ない', async () => {
    const secret = 'password authentication failed for user "neondb_owner" at 10.0.0.1';
    const { handler, logError } = setup({ insertPost: async () => Promise.reject(new DbError('something_else ' + secret)) });
    const res = await handler(post(hs1()));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('{"error":"internal"}');
    expect(text).not.toContain('neondb_owner');
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

describe('C-03 認証ヘッダーの書き方', () => {
  it.each<[string, string, number]>([
    ['bearer（小文字）', 'bearer good', 201],
    ['BEARER（大文字）', 'BEARER good', 201],
    ['空白 2 つ', 'Bearer  good', 201],
    ['トークンの後ろに余分な語', 'Bearer good extra', 401],
    ['トークンだけ（Bearer なし）', 'good', 401],
    ['Bearer だけ', 'Bearer', 401],
    ['Bearer と空白だけ', 'Bearer ', 401],
    ['Basic', 'Basic Z29vZDpnb29k', 401],
    ['Bearer の後ろがカンマ区切り', 'Bearer good,Bearer good', 401],
  ])('%s → %i', async (_n, header, status) => {
    const { handler, insertPost } = setup();
    const res = await handler(post(hs1(), { Authorization: header }));
    expect(res.status).toBe(status);
    if (status === 401) expect(insertPost).not.toHaveBeenCalled();
  });

  it('verifyToken が同期的に例外を投げても 401（500 にならない）', async () => {
    const { handler, insertPost } = setup({
      verifyToken: () => {
        throw new Error('boom');
      },
    });
    expect((await handler(post(hs1()))).status).toBe(401);
    expect(insertPost).not.toHaveBeenCalled();
  });

  it('verifyToken が uid を返さない（null・空文字）なら 401', async () => {
    for (const v of [null, '']) {
      const { handler, insertPost } = setup({ verifyToken: async () => v });
      expect((await handler(post(hs1()))).status).toBe(401);
      expect(insertPost).not.toHaveBeenCalled();
    }
  });
});

describe('C-03 CORS（許可しないオリジン）', () => {
  it.each<[string, string]>([
    ['別のサイト', 'https://evil.example'],
    ['末尾にスラッシュ', 'http://localhost:5173/'],
    ['大文字', 'HTTP://LOCALHOST:5173'],
    ['ポートが違う', 'http://localhost:5174'],
    ['スキームが違う', 'https://localhost:5173'],
    ['許可したホストを含む別のホスト', 'https://wwyd.example.evil.com'],
    ['許可したホストのサブドメイン', 'https://a.wwyd.example'],
    ['許可したホストの後ろに付けた', 'https://wwyd.example.evil.com:443'],
    ['null（サンドボックスの iframe・file:）', 'null'],
    ['ワイルドカード', '*'],
    ['空', ''],
  ])('%s（%s）には Access-Control-Allow-Origin を付けない（POST も OPTIONS も）', async (_n, origin) => {
    const { handler } = setup();
    const opt = await handler(new Request('https://fn.example/', { method: 'OPTIONS', headers: { Origin: origin } }));
    expect(opt.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(opt.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    for (const [headers, status] of [
      [{ Origin: origin }, 201],
      [{ Origin: origin, Authorization: 'Bearer bad' }, 401],
    ] as const) {
      const res = await handler(post(hs1(), headers));
      expect(res.status).toBe(status);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Vary')).toBe('Origin');
    }
  });

  it('許可したオリジンには、成功・エラーのどれにも 1 つだけ返す（* は返さない・Credentials は許可しない）', async () => {
    const { handler } = setup();
    for (const origin of [ORIGIN, 'https://wwyd.example']) {
      for (const [req, status] of [
        [post(hs1(), { Origin: origin }), 201],
        [post(hs1(), { Origin: origin, Authorization: '' }), 401],
        [post('{', { Origin: origin }), 422],
        [new Request('https://fn.example/', { method: 'GET', headers: { Origin: origin } }), 405],
      ] as const) {
        const res = await handler(req);
        expect(res.status).toBe(status);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
      }
    }
  });

  it('Origin が無い要求（サーバー間・curl）は CORS のヘッダーなしで処理される（認証は必要）', async () => {
    const { handler } = setup();
    const noOrigin = new Request('https://fn.example/', {
      method: 'POST',
      headers: { Authorization: 'Bearer good' },
      body: JSON.stringify(hs1()),
    });
    const res = await handler(noOrigin);
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('プリフライトの許可は POST・OPTIONS と Authorization・Content-Type だけ', async () => {
    const { handler, insertPost, verifyToken } = setup();
    const res = await handler(new Request('https://fn.example/', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'DELETE' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type');
    expect(insertPost).not.toHaveBeenCalled();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD'])('%s は 405 で、認証も DB も動かさない', async (method) => {
    const { handler, insertPost, verifyToken } = setup();
    const res = await handler(new Request('https://fn.example/', { method, headers: { Origin: ORIGIN, Authorization: 'Bearer good' } }));
    expect(res.status).toBe(405);
    expect(insertPost).not.toHaveBeenCalled();
    expect(verifyToken).not.toHaveBeenCalled();
  });
});

describe('C-03 応答の中身', () => {
  it('422 の応答は入力を写さない（error のコードと index だけ）', async () => {
    const { handler } = setup();
    const raw = { ...hs1(), title: '<script>alert(1)</script>'.repeat(3), hero: 'ZZZ' };
    const res = await handler(post(raw));
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain('script');
    expect(text).not.toContain('ZZZ');
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(['error']);
  });

  it('成功の応答は ID だけ（投稿の中身・uid を返さない）', async () => {
    const { handler } = setup();
    const res = await handler(post(hs1()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'post-id' });
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  });
});

describe('C-03 タイトルの境界（サーバーの検証と DB の制約の食い違い）', () => {
  it('40 文字（コードポイント）ちょうどは通り、41 文字は invalid_title', async () => {
    const ok = setup();
    expect((await ok.handler(post({ ...hs1(), title: 'あ'.repeat(40) }))).status).toBe(201);
    const emoji = setup();
    expect((await emoji.handler(post({ ...hs1(), title: '😀'.repeat(40) }))).status).toBe(201);
    const ng = setup();
    const res = await ng.handler(post({ ...hs1(), title: '😀'.repeat(41) }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'invalid_title' });
  });

  it('前後の空白（全角・NBSP・改行・タブ）を除いた値が保存され、DB の btrim（半角空白のみ）の検査に引っかからない', async () => {
    const { handler, insertPost } = setup();
    const res = await handler(post({ ...hs1(), title: '　 \t\n見本 \r\n　' }));
    expect(res.status).toBe(201);
    const title = insertPost.mock.calls[0]?.[1].title as string;
    expect(title).toBe('見本');
    expect(title).toBe(title.replace(/^ +| +$/g, ''));
  });

  it('前後だけが空白のタイトルは invalid_title', async () => {
    const { handler } = setup();
    expect(await (await handler(post({ ...hs1(), title: '　 \t\n' }))).json()).toEqual({ error: 'invalid_title' });
  });

  // 不具合の再現（F 候補）: DB の jsonb は NUL（\u0000）と、対になっていないサロゲートを受け付けない（Postgres が SQLSTATE 22 の
  // データ例外で断る。DB 側は db/tests/90_release_c03_json_text.test.sql で確認）。handler の検証はどちらも通すので、本物の DB では
  // insert_post が 500 internal になる。期待する挙動は 4xx（invalid_title か malformed）。直るまでは it.fails（赤を緑に反転）にしてある。
  // 直したら it.fails を it に戻す。
  it('タイトルに NUL・対になっていないサロゲートがあれば、DB に渡す前に 4xx で断る', async () => {
    for (const title of ['a\u0000b', 'a\ud800b', 'a\udc00b']) {
      const { handler, insertPost } = setup();
      const res = await handler(post({ ...hs1(), title }));
      expect(res.status).toBe(422);
      expect(insertPost).not.toHaveBeenCalled();
    }
  });
});
