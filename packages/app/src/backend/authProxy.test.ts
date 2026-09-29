import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UPSTREAM } from '../../../../functions/api/auth/[[path]].ts';
import { authCookies, firstPartyCookie, isProxiedPath, proxyAuth } from './authProxy.ts';

describe('Neon Auth の中継（12 章 §7.2。2026-09-29）', () => {
  it('Set-Cookie は自サイトのクッキーに（Domain・Partitioned を外し SameSite=Lax。期限はそのまま）', () => {
    const c = firstPartyCookie(
      '__Secure-neonauth.session_token=abc.def; Max-Age=604800; Domain=ep-x.neonauth.c-4.ap-southeast-1.aws.neon.tech; Path=/; HttpOnly; Secure; SameSite=None; Partitioned',
    );
    expect(c).toBe('__Secure-neonauth.session_token=abc.def; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax');
  });
  it('消すクッキー（Max-Age=0）もそのまま消す指示として通す', () => {
    expect(firstPartyCookie('__Secure-neonauth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None')).toBe(
      '__Secure-neonauth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });
  it('送るのは Neon Auth のクッキーだけ', () => {
    expect(authCookies('a=1; __Secure-neonauth.session_token=x; neonauth.state=y; b=2')).toBe('__Secure-neonauth.session_token=x; neonauth.state=y');
    // ログインの開始で付く照合用のクッキー（名前は neon-auth.）も送る
    expect(authCookies('__Secure-neon-auth.session_challenge=c; x=1')).toBe('__Secure-neon-auth.session_challenge=c');
    expect(authCookies('a=1')).toBeNull();
    expect(authCookies(null)).toBeNull();
  });
  it('中継するのはログインの開始・セッション・JWT・ログアウト・ヘルスチェックだけ', () => {
    for (const p of ['sign-in/social', 'get-session', '/token', 'sign-out/', 'ok']) expect(isProxiedPath(p)).toBe(true);
    for (const p of ['sign-in/email', 'callback/google', 'admin/list-users', '', '../x']) expect(isProxiedPath(p)).toBe(false);
  });

  it('要求を Neon Auth へ作り直し、応答の Set-Cookie を自サイトのものにする', async () => {
    let sent: Request | null = null;
    const fetcher = (async (req: Request) => {
      sent = req;
      const h = new Headers({ 'content-type': 'application/json', 'access-control-allow-origin': 'https://wwyd.pages.dev' });
      h.append('set-cookie', '__Secure-neonauth.session_token=t; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None; Partitioned');
      h.append('set-cookie', '__Secure-neonauth.session_data=d; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=None; Partitioned');
      return new Response('{"user":{"id":"u"}}', { status: 200, headers: h });
    }) as typeof fetch;
    const req = new Request('https://wwyd.pages.dev/api/auth/get-session?neon_auth_session_verifier=v1', {
      headers: { cookie: 'other=1; __Secure-neonauth.session_token=old', origin: 'https://wwyd.pages.dev', 'cf-ray': 'r' },
    });
    const res = await proxyAuth(req, 'https://ep-x.neonauth.example/neondb/auth/', 'get-session', fetcher);
    expect(sent!.url).toBe('https://ep-x.neonauth.example/neondb/auth/get-session?neon_auth_session_verifier=v1');
    expect(sent!.headers.get('cookie')).toBe('__Secure-neonauth.session_token=old');
    expect(sent!.headers.get('origin')).toBe('https://wwyd.pages.dev');
    expect(sent!.headers.get('cf-ray')).toBeNull();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: 'u' } });
    expect(res.headers.getSetCookie()).toEqual([
      '__Secure-neonauth.session_token=t; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax',
      '__Secure-neonauth.session_data=d; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax',
    ]);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('POST の本文も送る。中継しない API は Neon Auth に送らず 404', async () => {
    let body = '';
    const fetcher = (async (req: Request) => {
      body = await req.text();
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const post = new Request('https://wwyd.pages.dev/api/auth/sign-out', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
    expect((await proxyAuth(post, 'https://ep-x.neonauth.example/neondb/auth', 'sign-out', fetcher)).status).toBe(200);
    expect(body).toBe('{}');
    let called = false;
    const never = (async () => {
      called = true;
      return new Response('');
    }) as typeof fetch;
    const res = await proxyAuth(new Request('https://wwyd.pages.dev/api/auth/admin/list-users'), 'https://x', 'admin/list-users', never);
    expect(res.status).toBe(404);
    expect(called).toBe(false);
  });

  it('本番の中継先は CSP（public/_headers）の Neon Auth と同じホスト', () => {
    const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    const host = new URL(UPSTREAM).host;
    expect(host).toMatch(/\.neonauth\./);
    expect(headers).toContain(`https://${host}`);
    expect(new URL(UPSTREAM).pathname).toBe('/neondb/auth');
  });
});
