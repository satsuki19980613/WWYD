/**
 * C-04（リリース前テスト。docs/release-test-plan.md §3 C）: 認証の中継（authProxy.ts と functions/api/auth/[[path]].ts）への攻撃的な入力。
 * 既存の authProxy.test.ts に無い場合: 許可リスト以外・パスの偽装（../・エンコード・大文字・区切り文字）が Neon Auth に届かないこと、
 * Cookie の絞り込みの境界、Set-Cookie の書き換えの境界、HEAD・OPTIONS・PUT・DELETE、バイナリの本文、リダイレクト、
 * Pages Functions の入口（ctx.params.path の形）、上流が落ちたときの挙動。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest, UPSTREAM } from '../../../../functions/api/auth/[[path]].ts';
import { authCookies, firstPartyCookie, isProxiedPath, proxyAuth, PROXIED_PATHS } from './authProxy.ts';

const SITE = 'https://wwyd.pages.dev';
const UP = 'https://ep-x.neonauth.example/neondb/auth';

function recorder(res: () => Response = () => new Response('{}', { status: 200 })) {
  const sent: Request[] = [];
  const fetcher = (async (req: Request) => {
    sent.push(req);
    return res();
  }) as typeof fetch;
  return { sent, fetcher };
}

describe('C-04 許可リスト以外は Neon Auth に届かない（404・上流を呼ばない）', () => {
  const HOSTILE = [
    '..', '../ok', 'ok/..', 'ok/../admin', 'ok/../../x', 'sign-in/social/../../admin/list-users', '%2e%2e/admin', '%2e%2e%2fadmin', 'ok%2f..%2fadmin',
    'get-session/../admin', 'get-session/..%2fadmin', '.', './ok', 'ok/.', 'ok/./x',
    'OK', 'Get-Session', 'SIGN-IN/SOCIAL', 'Token', 'sign-out/x', 'ok/x', 'token/refresh', 'get-session/x', 'sign-in/social/extra', 'sign-in/social/',
    'ok?x=1', 'ok#x', 'ok;x', 'ok\\..\\x', 'ok\\x', ' ok', 'ok ', '\tok', 'ok\n', 'ok%00', 'ok\u0000', 'ok​', 'ｏｋ', 'ok%20', 'ok%0d%0a', 'ok%09',
    'sign-in/email', 'sign-up/email', 'callback/google', 'callback/github', 'admin/list-users', 'admin', 'list-sessions', 'revoke-session', 'revoke-sessions',
    'delete-user', 'update-user', 'change-password', 'reset-password', 'forget-password', 'link-social', 'unlink-account', 'list-accounts', 'refresh-token',
    'get-access-token', 'jwks', '.well-known/jwks.json', 'sign-in/anonymous', 'sign-in/magic-link', 'verify-email', 'error', 'reference', 'open-api/generate-schema',
    '', '/', '//', '///', 'a/b/c', '~', '*', 'ok/*', '**', '{ok}', '[ok]', 'ok,get-session', 'ok&get-session',
  ];

  it.each(HOSTILE.map((p) => [JSON.stringify(p), p] as const))('%s', async (_n, path) => {
    // 「/」の前後だけは無視して許可される仕様（isProxiedPath）。それ以外の文字列は許可リストに一致しないと 404
    const stripped = path.replace(/^\/+|\/+$/g, '');
    const allowed = PROXIED_PATHS.includes(stripped);
    const { sent, fetcher } = recorder();
    const res = await proxyAuth(new Request(`${SITE}/api/auth/x`), UP, path, fetcher);
    if (allowed) {
      expect(res.status).toBe(200);
      expect(sent).toHaveLength(1);
    } else {
      expect(res.status).toBe(404);
      expect(sent).toHaveLength(0);
    }
    expect(isProxiedPath(path)).toBe(allowed);
  });

  it('許可されたパスが上流に送る URL は、上流のオリジン・パスの下の決まった 1 つだけ（../ や別のホストに化けない）', async () => {
    for (const p of PROXIED_PATHS) {
      const { sent, fetcher } = recorder();
      await proxyAuth(new Request(`${SITE}/api/auth/${p}`), UP, p, fetcher);
      expect(sent[0]?.url).toBe(`${UP}/${p}`);
    }
  });

  it('前後のスラッシュがある形（/ok・ok/・//ok//）は許可のまま通るが、上流の URL のホスト・パスの先頭は変わらない', async () => {
    for (const p of ['/ok', 'ok/', '//ok//', '/get-session/']) {
      const { sent, fetcher } = recorder();
      const res = await proxyAuth(new Request(`${SITE}/api/auth/x`), UP, p, fetcher);
      expect(res.status).toBe(200);
      const u = new URL(sent[0]!.url);
      expect(u.origin).toBe('https://ep-x.neonauth.example');
      expect(u.pathname.startsWith('/neondb/auth/')).toBe(true);
      expect(u.pathname.includes('..')).toBe(false);
    }
  });

  it('クエリ文字列は上流にそのまま渡るが、ホストは変えられない（@・//・バックスラッシュを含めても）', async () => {
    for (const q of ['?a=1', '?redirect=https://evil.example', '?@evil.example/', '?//evil.example', '?\\\\evil.example', '?a=%0d%0aHost:%20evil']) {
      const { sent, fetcher } = recorder();
      await proxyAuth(new Request(`${SITE}/api/auth/token${q}`), UP, 'token', fetcher);
      const u = new URL(sent[0]!.url);
      expect(u.host).toBe('ep-x.neonauth.example');
      expect(u.pathname).toBe('/neondb/auth/token');
    }
  });
});

describe('C-04 Pages Functions の入口（functions/api/auth/[[path]].ts）', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function stub(res: () => Response = () => new Response('{"ok":true}', { status: 200 })) {
    const sent: Request[] = [];
    globalThis.fetch = (async (req: Request) => {
      sent.push(req);
      return res();
    }) as typeof fetch;
    return sent;
  }

  it.each<[string, string | string[] | undefined, number]>([
    ['params.path が無い（/api/auth そのもの）', undefined, 404],
    ['空の配列', [], 404],
    ['空文字', '', 404],
    ['文字列 ok', 'ok', 200],
    ['配列 [sign-in, social]', ['sign-in', 'social'], 200],
    ['配列 [get-session]', ['get-session'], 200],
    ['配列 [..]', ['..'], 404],
    ['配列 [ok, ..]', ['ok', '..'], 404],
    ['配列 [ok, .., admin]', ['ok', '..', 'admin'], 404],
    ['配列 [sign-in, social, ..]', ['sign-in', 'social', '..'], 404],
    ['配列 [sign-in, email]', ['sign-in', 'email'], 404],
    ['1 つの要素に / を含む（デコード後）', ['sign-in/social'], 200],
    ['1 つの要素に ../ を含む', ['ok/../admin'], 404],
    ['配列 [ok, ""]（末尾のスラッシュ）', ['ok', ''], 200],
    ['配列 [admin, list-users]', ['admin', 'list-users'], 404],
  ])('%s → %i', async (_n, path, status) => {
    const sent = stub();
    const res = await onRequest({ request: new Request(`${SITE}/api/auth/x`), params: { path } });
    expect(res.status).toBe(status);
    expect(sent.length).toBe(status === 200 ? 1 : 0);
    if (status === 200) expect(new URL(sent[0]!.url).origin).toBe(new URL(UPSTREAM).origin);
  });

  it('上流の Set-Cookie は自サイトのクッキーに書き換えられ、Cache-Control は no-store になる（入口の関数を通して）', async () => {
    stub(() => {
      const h = new Headers({ 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true' });
      h.append('set-cookie', '__Secure-neonauth.session_token=t; Max-Age=60; Domain=.neon.tech; Path=/; HttpOnly; Secure; SameSite=None; Partitioned');
      return new Response('{}', { status: 200, headers: h });
    });
    const res = await onRequest({ request: new Request(`${SITE}/api/auth/get-session`), params: { path: ['get-session'] } });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    expect(res.headers.getSetCookie()).toEqual(['__Secure-neonauth.session_token=t; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax']);
  });
});

describe('C-04 Neon Auth 以外のクッキーを送らない', () => {
  it.each<[string, string | null, string | null]>([
    ['自サイトのクッキーだけ', 'session=abc; theme=dark', null],
    ['名前が似ているだけ（前後に文字）', 'xneonauth.a=1; neonauthx=2; my-neon-auth.a=3; _neonauth.a=4', null],
    ['値に neonauth. を含む', 'a=neonauth.session=1; b=__Secure-neonauth.x', null],
    ['大文字の名前', 'NEONAUTH.session_token=1; Neon-Auth.a=2', null],
    ['__Host- 付き', '__Host-neonauth.session_token=1; x=1', '__Host-neonauth.session_token=1'],
    ['__Secure- 付きと付き無し・順序を保つ', 'x=1; neonauth.b=2; __Secure-neon-auth.a=3; y=2', 'neonauth.b=2; __Secure-neon-auth.a=3'],
    ['空白・改行の混じり', '  a=1 ;\t__Secure-neonauth.s=v  ;b=2', '__Secure-neonauth.s=v'],
    ['空文字', '', null],
    ['null', null, null],
    ['セミコロンだけ', ';;;', null],
    ['別のプレフィックス', '__Foo-neonauth.a=1; __Secure-__Host-neonauth.a=1', null],
    ['neonauth の後ろにドットが無い', 'neonauth=1; neonauth_session=2; neon-auth=3', null],
  ])('%s', (_n, input, want) => {
    expect(authCookies(input)).toBe(want);
  });

  it('要求を上流に作り直すとき、Cookie は Neon Auth のものだけ・要求ヘッダーの Cookie が無くても cookie を作らない', async () => {
    const withOthers = recorder();
    await proxyAuth(new Request(`${SITE}/api/auth/token`, { headers: { cookie: 'session=abc; __Secure-neonauth.session_token=t; _ga=1' } }), UP, 'token', withOthers.fetcher);
    expect(withOthers.sent[0]?.headers.get('cookie')).toBe('__Secure-neonauth.session_token=t');
    const noAuth = recorder();
    await proxyAuth(new Request(`${SITE}/api/auth/token`, { headers: { cookie: 'session=abc; _ga=1' } }), UP, 'token', noAuth.fetcher);
    expect(noAuth.sent[0]?.headers.get('cookie')).toBeNull();
    const none = recorder();
    await proxyAuth(new Request(`${SITE}/api/auth/token`), UP, 'token', none.fetcher);
    expect(none.sent[0]?.headers.get('cookie')).toBeNull();
  });
});

describe('C-04 Set-Cookie の書き換えの境界', () => {
  it.each<[string, string, string]>([
    ['Domain の大文字・小文字・空白', '__Secure-neonauth.s=v; DOMAIN=.x.example; domain = y.example; Path=/', '__Secure-neonauth.s=v; Path=/'],
    ['値の無い Domain', 'neonauth.s=v; Domain; Path=/', 'neonauth.s=v; Path=/'],
    ['Partitioned の大文字・小文字', 'neonauth.s=v; PARTITIONED; partitioned; Secure', 'neonauth.s=v; Secure'],
    ['SameSite=none の大文字・小文字・空白', 'neonauth.s=v; samesite = NONE; Secure', 'neonauth.s=v; SameSite=Lax; Secure'],
    ['SameSite=Strict はそのまま', 'neonauth.s=v; SameSite=Strict; Secure', 'neonauth.s=v; SameSite=Strict; Secure'],
    ['SameSite=Lax はそのまま', 'neonauth.s=v; SameSite=Lax', 'neonauth.s=v; SameSite=Lax'],
    ['Expires の日付（カンマ・コロンを含む）はそのまま', 'neonauth.s=v; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/', 'neonauth.s=v; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/'],
    ['Max-Age=0（削除の指示）', '__Secure-neonauth.s=; Max-Age=0; Domain=x.example; Path=/; Secure; HttpOnly; SameSite=None', '__Secure-neonauth.s=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax'],
    ['空の属性（;;）は落とす', 'neonauth.s=v;; ; Path=/', 'neonauth.s=v; Path=/'],
    ['値に = を含む', 'neonauth.s=a=b==; Path=/', 'neonauth.s=a=b==; Path=/'],
    ['HttpOnly・Secure・Path は保つ', 'n=v; HttpOnly; Secure; Path=/x', 'n=v; HttpOnly; Secure; Path=/x'],
    ['属性が無い', 'n=v', 'n=v'],
    ['空文字', '', ''],
  ])('%s', (_n, input, want) => {
    expect(firstPartyCookie(input)).toBe(want);
  });

  it('Domain を落としたクッキーに「Domain」の文字列が値として残っても、属性にはならない', () => {
    const out = firstPartyCookie('neonauth.s=Domain=evil.example; Path=/');
    expect(out).toBe('neonauth.s=Domain=evil.example; Path=/');
  });

  it('上流の応答の Set-Cookie は複数でも 1 つずつ書き換えられ、順序を保つ（HEAD・リダイレクトでも）', async () => {
    const mk = (status: number) => () => {
      const h = new Headers({ location: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
      h.append('set-cookie', '__Secure-neon-auth.session_challenge=c; Max-Age=600; Domain=.neonauth.example; Path=/; HttpOnly; Secure; SameSite=None; Partitioned');
      h.append('set-cookie', '__Secure-neonauth.session_token=t; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=None');
      return new Response(null, { status, headers: h });
    };
    for (const [method, status] of [['GET', 200], ['HEAD', 200], ['POST', 302], ['GET', 302], ['POST', 303]] as const) {
      const { fetcher } = recorder(mk(status));
      const res = await proxyAuth(new Request(`${SITE}/api/auth/sign-in/social`, { method, ...(method === 'POST' ? { body: '{}' } : {}) }), UP, 'sign-in/social', fetcher);
      expect(res.status).toBe(status);
      expect(res.headers.getSetCookie()).toEqual([
        '__Secure-neon-auth.session_challenge=c; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax',
        '__Secure-neonauth.session_token=t; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax',
      ]);
      // リダイレクトは manual のまま素通し（中継が勝手に追いかけない）。Location は上流の指示のまま
      expect(res.headers.get('location')).toBe('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    }
  });
});

describe('C-04 メソッド・本文', () => {
  it.each(['HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'])('%s は上流に同じメソッドで送られ、本文の扱いで例外にならない', async (method) => {
    const { sent, fetcher } = recorder(() => new Response(null, { status: 204 }));
    const res = await proxyAuth(new Request(`${SITE}/api/auth/sign-out`, { method, headers: { origin: SITE } }), UP, 'sign-out', fetcher);
    expect(res.status).toBe(204);
    expect(sent[0]?.method).toBe(method);
    expect(sent[0]?.redirect).toBe('manual');
  });

  it('GET・HEAD は本文なし、POST の本文はバイト列のまま（0〜255 のすべての値）届く。Content-Type は保つ', async () => {
    const all = new Uint8Array(256).map((_, i) => i);
    const { sent, fetcher } = recorder();
    await proxyAuth(new Request(`${SITE}/api/auth/sign-out`, { method: 'POST', body: all, headers: { 'content-type': 'application/octet-stream' } }), UP, 'sign-out', fetcher);
    expect(new Uint8Array(await sent[0]!.arrayBuffer())).toEqual(all);
    expect(sent[0]?.headers.get('content-type')).toBe('application/octet-stream');
    const g = recorder();
    await proxyAuth(new Request(`${SITE}/api/auth/get-session`), UP, 'get-session', g.fetcher);
    expect(g.sent[0]?.body).toBeNull();
  });

  it('Content-Length・Host・接続の情報は引き継がない（Cloudflare が付ける cf-* も）', async () => {
    const { sent, fetcher } = recorder();
    await proxyAuth(
      new Request(`${SITE}/api/auth/sign-out`, {
        method: 'POST',
        body: '{}',
        headers: { host: 'wwyd.pages.dev', 'content-length': '999', connection: 'keep-alive', 'cf-connecting-ip': '1.2.3.4', 'cf-ipcountry': 'JP', 'cf-ray': 'r', 'cf-visitor': '{}', 'cdn-loop': 'x' },
      }),
      UP,
      'sign-out',
      fetcher,
    );
    const h = sent[0]!.headers;
    for (const k of ['host', 'connection', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cdn-loop']) expect(h.get(k), k).toBeNull();
    expect(h.get('content-length')).not.toBe('999');
  });

  // ---- 観察（S4 の強化の提案）: 中継はヘッダーを「落とすものの一覧」で絞っていて、それ以外は素通しにしている ----
  it('（観察・S4）x-forwarded-* / x-real-ip / x-http-method-override など、クライアントが付けたヘッダーは上流に届く', async () => {
    const { sent, fetcher } = recorder();
    await proxyAuth(
      new Request(`${SITE}/api/auth/sign-out`, {
        method: 'POST',
        body: '{}',
        headers: {
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'http',
          'x-forwarded-for': '6.6.6.6',
          'x-real-ip': '6.6.6.6',
          'x-http-method-override': 'DELETE',
          authorization: 'Bearer abc',
        },
      }),
      UP,
      'sign-out',
      fetcher,
    );
    const h = sent[0]!.headers;
    // 今の挙動の記録。許可リスト方式（origin・content-type・accept・accept-language・user-agent・cookie・referer だけ通す）にすると、この 5 つは null になる
    expect(h.get('x-forwarded-host')).toBe('evil.example');
    expect(h.get('x-forwarded-proto')).toBe('http');
    expect(h.get('x-forwarded-for')).toBe('6.6.6.6');
    expect(h.get('x-real-ip')).toBe('6.6.6.6');
    expect(h.get('x-http-method-override')).toBe('DELETE');
    expect(h.get('authorization')).toBe('Bearer abc');
  });

  it('（観察・S4）本文の大きさに上限がない（大きな POST を丸ごと読んで上流へ送る）', async () => {
    const big = new Uint8Array(3 * 1024 * 1024);
    const { sent, fetcher } = recorder();
    const res = await proxyAuth(new Request(`${SITE}/api/auth/sign-out`, { method: 'POST', body: big }), UP, 'sign-out', fetcher);
    expect(res.status).toBe(200);
    expect((await sent[0]!.arrayBuffer()).byteLength).toBe(big.byteLength);
  });
});

describe('C-04 応答の中身', () => {
  it('上流の CORS ヘッダー・Content-Encoding・Content-Length は落とし、Cache-Control は no-store に固定する', async () => {
    const { fetcher } = recorder(
      () =>
        new Response('{"a":1}', {
          status: 200,
          headers: {
            'access-control-allow-origin': 'https://evil.example',
            'access-control-allow-credentials': 'true',
            'access-control-expose-headers': 'set-auth-token',
            'content-encoding': 'gzip',
            'content-length': '999',
            'cache-control': 'public, max-age=31536000',
            'content-type': 'application/json',
          },
        }),
    );
    const res = await proxyAuth(new Request(`${SITE}/api/auth/get-session`), UP, 'get-session', fetcher);
    for (const k of ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-expose-headers', 'content-encoding']) expect(res.headers.get(k), k).toBeNull();
    expect(res.headers.get('content-length')).not.toBe('999');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('上流のエラー（401・403・429・500・502）はそのまま返る（Set-Cookie は書き換え）', async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502, 503]) {
      const { fetcher } = recorder(() => new Response('{"error":"x"}', { status }));
      const res = await proxyAuth(new Request(`${SITE}/api/auth/token`), UP, 'token', fetcher);
      expect(res.status).toBe(status);
    }
  });

  it('本文の無い応答（204・304）でも Response を作れる', async () => {
    for (const status of [204, 304]) {
      const { fetcher } = recorder(() => new Response(null, { status }));
      const res = await proxyAuth(new Request(`${SITE}/api/auth/token`), UP, 'token', fetcher);
      expect(res.status).toBe(status);
    }
  });

  // ---- 観察（S3 の候補）: 上流に届かない・上流が落ちたとき、中継は例外を投げる（Pages Functions では 500 の既定のエラーページ）----
  it('（観察・S3）上流へのネットワークエラーは握りつぶさず、そのまま例外になる（503 などの JSON を返さない）', async () => {
    const fetcher = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(proxyAuth(new Request(`${SITE}/api/auth/get-session`), UP, 'get-session', fetcher)).rejects.toThrow('fetch failed');
  });
});
