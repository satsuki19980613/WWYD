/**
 * C-03（リリース前テスト）: create-post の入口（index.ts）の JWT の検証を、本物の jose と手元の JWKS サーバーで確かめる。
 * handler.test.ts は verifyToken を差し替えているので、index.ts の verifyToken（issuer・role・sub の検査）は今まで試験されていなかった。
 * 期限切れ・別の発行者・署名違い・鍵の取り違え・alg none・アルゴリズムの取り違え（HS256）・role・sub の形。
 * pg と @neon/functions は差し替える（DB には触れない）。
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hs1 } from '../../../core/src/post/postFixtures.ts';

// 乱数で多くのハンドを回す試験がある。CI の遅い環境でも既定の 5 秒で打ち切らない（2026-09-30 CI で 5.09 秒かかり落ちた）
vi.setConfig({ testTimeout: 60_000 });

const mocks = vi.hoisted(() => {
  class DatabaseError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.name = 'DatabaseError';
      this.code = code;
    }
  }
  const query = vi.fn();
  class Pool {
    query = query;
    constructor(_options: unknown) {}
  }
  return { DatabaseError, query, Pool };
});
vi.mock('pg', () => ({ default: { Pool: mocks.Pool, DatabaseError: mocks.DatabaseError } }));
vi.mock('@neon/functions', () => ({ attachDatabasePool: vi.fn() }));

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

const SUB = '11111111-1111-4111-8111-111111111111';
const ORIGIN = 'http://localhost:5173';
const now = () => Math.floor(Date.now() / 1000);

let server: Server;
let issuer = '';
let keys: KeyPair;
let otherKeys: KeyPair;
let publicJwk: Record<string, unknown>;
let fetchHandler: (req: Request) => Promise<Response>;

beforeAll(async () => {
  keys = await generateKeyPair('EdDSA', { extractable: true });
  otherKeys = await generateKeyPair('EdDSA', { extractable: true });
  publicJwk = { ...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'EdDSA', use: 'sig' };
  server = createServer((req, res) => {
    if (req.url === '/jwks.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [publicJwk] }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.DATABASE_URL = 'postgres://unused.invalid/db';
  process.env.NEON_AUTH_JWKS_URL = `${issuer}/jwks.json`;
  process.env.NEON_AUTH_BASE_URL = `${issuer}/neondb/auth`; // iss は URL のオリジン（index.ts のコメントどおり）
  process.env.ALLOWED_ORIGINS = ORIGIN;
  const mod = await import('./index.ts');
  fetchHandler = (mod.default as { fetch: (req: Request) => Promise<Response> }).fetch;
});

afterAll(async () => {
  await new Promise<void>((ok) => (server.listening ? server.close(() => ok()) : ok()));
});

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockResolvedValue({ rows: [{ id: 'new-post-id' }] });
});

type SignOpts = {
  key?: KeyPair['privateKey'];
  kid?: string | null;
  alg?: string;
  iss?: string;
  sub?: string | null;
  role?: string | null;
  exp?: number | null;
  nbf?: number;
  aud?: string;
};

async function sign(o: SignOpts = {}): Promise<string> {
  const claims: Record<string, unknown> = {};
  if (o.role !== null) claims.role = o.role ?? 'authenticated';
  let jwt = new SignJWT(claims).setProtectedHeader({ alg: o.alg ?? 'EdDSA', ...(o.kid === null ? {} : { kid: o.kid ?? 'k1' }) });
  if (o.sub !== null) jwt = jwt.setSubject(o.sub ?? SUB);
  jwt = jwt.setIssuer(o.iss ?? issuer).setIssuedAt();
  if (o.exp !== null) jwt = jwt.setExpirationTime(o.exp ?? now() + 900);
  if (o.nbf !== undefined) jwt = jwt.setNotBefore(o.nbf);
  if (o.aud !== undefined) jwt = jwt.setAudience(o.aud);
  return jwt.sign(o.key ?? keys.privateKey);
}

const b64url = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function call(token: string | null, extra: Record<string, string> = {}): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN, 'Content-Type': 'application/json', ...extra };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return fetchHandler(new Request('https://fn.example/', { method: 'POST', headers, body: JSON.stringify(hs1()) }));
}

async function expect401(token: string | null) {
  const res = await call(token);
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'not_authenticated' });
  expect(mocks.query).not.toHaveBeenCalled();
}

describe('C-03 JWT の検証（index.ts の verifyToken）', () => {
  it('正しいトークンは 201。DB にはトークンの sub と本文の JSON を、パラメータ（$1・$2）で渡す', async () => {
    const res = await call(await sign());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'new-post-id' });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.query.mock.calls[0] as [string, string[]];
    expect(sql).toBe('select public.insert_post($1::uuid, $2::jsonb) as id');
    expect(params[0]).toBe(SUB);
    expect(JSON.parse(params[1] as string).title).toBe('K83r のターン 2 バレル');
  });

  it('別のアルゴリズム（ES256）の鍵で署名し kid だけ合わせても 401（JWKS の鍵は EdDSA の公開鍵）', async () => {
    const es = await generateKeyPair('ES256', { extractable: true });
    await expect401(await sign({ key: es.privateKey, alg: 'ES256', kid: 'k1' }));
  });

  it('署名が違う（別の鍵で署名・kid は同じ）は 401', async () => {
    await expect401(await sign({ key: otherKeys.privateKey }));
  });

  it('kid が JWKS にない（未知の鍵）は 401', async () => {
    await expect401(await sign({ key: otherKeys.privateKey, kid: 'unknown' }));
  });

  it('ペイロードを書き換える（署名は元のまま）と 401', async () => {
    const token = await sign();
    const [h, , s] = token.split('.') as [string, string, string];
    const forged = `${h}.${b64url({ role: 'authenticated', sub: '22222222-2222-4222-8222-222222222222', iss: issuer, exp: now() + 900 })}.${s}`;
    await expect401(forged);
  });

  it('期限切れは 401', async () => {
    await expect401(await sign({ exp: now() - 10 }));
  });

  it('nbf が未来のトークンは 401', async () => {
    await expect401(await sign({ nbf: now() + 3600 }));
  });

  it.each<[string, () => string]>([
    ['別のホスト', () => 'http://127.0.0.1:1'],
    ['別のスキーム', () => issuer.replace('http:', 'https:')],
    ['オリジンに末尾のスラッシュ', () => `${issuer}/`],
    ['Auth の URL 全体（パス付き）', () => `${issuer}/neondb/auth`],
    ['空文字', () => ''],
  ])('発行者が違う（%s）は 401', async (_n, iss) => {
    await expect401(await sign({ iss: iss() }));
  });

  it('発行者（iss）が無いトークンは 401', async () => {
    const jwt = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setSubject(SUB)
      .setExpirationTime(now() + 900)
      .sign(keys.privateKey);
    await expect401(jwt);
  });

  it('alg: none（署名なし）は 401', async () => {
    const t = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'authenticated', sub: SUB, iss: issuer, exp: now() + 900 })}.`;
    await expect401(t);
    await expect401(t.slice(0, -1)); // 末尾のドットも無い
    const t2 = `${b64url({ alg: 'None', typ: 'JWT' })}.${b64url({ role: 'authenticated', sub: SUB, iss: issuer, exp: now() + 900 })}.`;
    await expect401(t2);
  });

  it('アルゴリズムの取り違え（公開鍵を HS256 の秘密にして署名）は 401', async () => {
    const secrets = [new TextEncoder().encode(JSON.stringify(publicJwk)), new TextEncoder().encode(String(publicJwk.x)), Buffer.from(String(publicJwk.x), 'base64url')];
    for (const secret of secrets) {
      const token = await new SignJWT({ role: 'authenticated' })
        .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
        .setSubject(SUB)
        .setIssuer(issuer)
        .setExpirationTime(now() + 900)
        .sign(secret);
      await expect401(token);
    }
  });

  it.each<[string, string | null]>([
    ['anonymous', 'anonymous'],
    ['service_role', 'service_role'],
    ['authenticator', 'authenticator'],
    ['空文字', ''],
    ['role が無い', null],
  ])('role が authenticated でない（%s）は 401', async (_n, role) => {
    await expect401(await sign({ role }));
  });

  it.each<[string, string | null]>([
    ['sub が無い', null],
    ['UUID でない', 'not-a-uuid'],
    ['UUID の後ろに余分な文字', `${SUB}x`],
    ['UUID の前に空白', ` ${SUB}`],
    ['UUID の後ろに改行', `${SUB}\n`],
    ['波括弧付き', `{${SUB}}`],
    ['ハイフン無し', SUB.replaceAll('-', '')],
    ['SQL 風', `${SUB}'; drop table posts; --`],
    ['空文字', ''],
  ])('sub の形が違う（%s）は 401', async (_n, sub) => {
    await expect401(await sign({ sub }));
  });

  it('大文字の UUID は通り、そのまま DB に渡す（DB の ::uuid が正規化する）', async () => {
    const res = await call(await sign({ sub: SUB.toUpperCase() }));
    expect(res.status).toBe(201);
    expect((mocks.query.mock.calls[0] as [string, string[]])[1][0]).toBe(SUB.toUpperCase());
  });

  it.each<[string]>([[''], ['x'], ['a.b.c'], ['....'], ['eyJhbGciOiJub25lIn0..'], ['Bearer'], ['undefined'], ['null']])(
    'JWT でない文字列（%j）は 401（500 にならない）',
    async (t) => {
      const res = await fetchHandler(
        new Request('https://fn.example/', {
          method: 'POST',
          headers: { Origin: ORIGIN, Authorization: `Bearer ${t}` },
          body: JSON.stringify(hs1()),
        }),
      );
      expect(res.status).toBe(401);
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it('巨大なトークン（1MB）も 401 で終わる', async () => {
    await expect401('a'.repeat(1024 * 1024));
  });

  it('Authorization ヘッダーが無い・別のヘッダー（X-Authorization・Cookie）に入れても 401', async () => {
    const token = await sign();
    const res = await fetchHandler(
      new Request('https://fn.example/', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'X-Authorization': `Bearer ${token}`, Cookie: `token=${token}` },
        body: JSON.stringify(hs1()),
      }),
    );
    expect(res.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  // ---- 観察（S4 の強化の提案。今の挙動を記録する。直したらこの 2 つが赤くなるので、期待を 401 に書き換える）----
  it('（観察・S4）exp の無いトークンも通る（requiredClaims に exp が無い）。Neon Auth は常に exp を付ける前提', async () => {
    expect((await call(await sign({ exp: null }))).status).toBe(201);
  });

  it('（観察・S4）aud（audience）は検査しない。別の用途向けの aud のトークンでも、同じ発行者・鍵・role なら通る', async () => {
    expect((await call(await sign({ aud: 'some-other-service' }))).status).toBe(201);
  });
});

describe('C-03 DB のエラーの写し方（index.ts の insertPost）', () => {
  it.each<[string, string, number, string]>([
    ['daily_limit', 'daily_limit', 429, 'daily_limit'],
    ['not_allowed', 'not_allowed', 403, 'not_allowed'],
    ['それ以外の P0001', 'paint_sum', 500, 'internal'],
  ])('P0001 の %s → %i', async (_n, message, status, error) => {
    mocks.query.mockRejectedValue(new mocks.DatabaseError(message, 'P0001'));
    const res = await call(await sign());
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it.each<[string, () => Error]>([
    ['SQLSTATE が P0001 以外の DatabaseError（一意違反 23505）', () => new mocks.DatabaseError('duplicate key value violates unique constraint "posts_pkey"', '23505')],
    ['CHECK 違反 23514', () => new mocks.DatabaseError('new row for relation "posts" violates check constraint "posts_s1_meta"', '23514')],
    ['jsonb の変換エラー 22P05（タイトルの NUL）', () => new mocks.DatabaseError('unsupported Unicode escape sequence', '22P05')],
    ['接続エラー', () => new Error('connect ECONNREFUSED 10.0.0.5:5432')],
    ['メッセージに接続文字列が入ったエラー', () => new Error('password authentication failed for postgres://neondb_owner:secret@host/db')],
  ])('%s は 500 internal で、内部情報を返さない', async (_n, mk) => {
    mocks.query.mockRejectedValue(mk());
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(await sign());
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"error":"internal"}');
    // ログには種類とメッセージだけ（本文・カードを出さない）
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('Ad');
    expect(logged).not.toContain('Kd');
    spy.mockRestore();
  });

  it('insert_post が ID を返さなかったら 500', async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(await sign());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe('C-03 JWKS に届かないとき', () => {
  it('JWKS のサーバーが落ちていて未知の kid のトークンが来ても 401（500 にならない）', async () => {
    await new Promise<void>((ok) => server.close(() => ok()));
    await expect401(await sign({ key: otherKeys.privateKey, kid: 'never-seen' }));
  });
});
