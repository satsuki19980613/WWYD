/**
 * Neon Auth への中継（2026-09-29 さつき「数日使わないとログインし直しになる」。詳細仕様 12 章 §7.2）。
 *
 * Neon Auth のセッションのクッキーは Neon Auth のドメイン（*.neonauth.*.neon.tech）に付くため、アプリ（wwyd.pages.dev）から見ると
 * 他サイトのクッキーになり、Safari などは数日で消す・閉じ込める。ログインの開始・セッションの確認・JWT・ログアウトを自サイトの `/api/auth/*` 経由にして、
 * クッキーを自サイトのもの（ファーストパーティ）にする。Neon 公式の Next.js 版（auth.handler()）と同じ考え方。
 * - 本番: Cloudflare Pages Functions（`functions/api/auth/[[path]].ts`）
 * - 開発・プレビュー: Vite の proxy（`vite.config.ts`）
 * ログインの開始（sign-in/social）も中継する: Neon Auth はそこで `__Secure-neon-auth.session_challenge` のクッキーを付け、Google から戻ったあとの
 * `get-session?neon_auth_session_verifier=…` でそのクッキーと照合してセッションを渡す（2026-09-29 に dev で確かめた）。Google から戻る先（callback）は
 * Neon Auth のドメインのまま（OAuth の state はサーバー側で持つ）。
 */

/** 中継する Neon Auth の API（これ以外は 404）。`ok` はヘルスチェック */
export const PROXIED_PATHS: readonly string[] = ['sign-in/social', 'get-session', 'token', 'sign-out', 'ok'];

/** Neon Auth のクッキーの名前（`neon-auth.` と `neonauth.` の両方が使われている） */
export const NEON_AUTH_COOKIE = /^(__Secure-|__Host-)?neon-?auth\./;

/** 自サイトの中継の入口 */
export const AUTH_PROXY_PREFIX = '/api/auth';

/** 中継してよい API か（`get-session` など。前後の `/` は無視） */
export function isProxiedPath(path: string): boolean {
  return PROXIED_PATHS.includes(path.replace(/^\/+|\/+$/g, ''));
}

/**
 * Neon Auth の Set-Cookie を自サイトのクッキーにする: Domain（Neon Auth のドメイン）と Partitioned を外し、
 * SameSite=None を Lax にする（自サイトの中だけで使うので他サイトへ送る必要がない）。Max-Age・Expires・HttpOnly・Secure・Path はそのまま。
 */
export function firstPartyCookie(setCookie: string): string {
  const [pair = '', ...attrs] = setCookie.split(';').map((s) => s.trim());
  const kept: string[] = [];
  for (const a of attrs) {
    const name = (a.split('=')[0] ?? '').trim().toLowerCase();
    if (name === 'domain' || name === 'partitioned' || a === '') continue;
    kept.push(name === 'samesite' && /=\s*none$/i.test(a) ? 'SameSite=Lax' : a);
  }
  return [pair, ...kept].join('; ');
}

/** Neon Auth のクッキー（`__Secure-neon-auth.*`・`__Secure-neonauth.*`）だけを中継する。自サイトのほかのクッキーは送らない */
export function authCookies(cookie: string | null): string | null {
  if (!cookie) return null;
  const kept = cookie
    .split(';')
    .map((s) => s.trim())
    .filter((c) => NEON_AUTH_COOKIE.test(c));
  return kept.length > 0 ? kept.join('; ') : null;
}

/** 中継しない要求ヘッダー（接続先で決まるもの・Cloudflare が付けるもの） */
const DROP_REQUEST = new Set(['host', 'cookie', 'content-length', 'connection', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cdn-loop']);

/** 自サイトへの要求を、Neon Auth（`upstream` は VITE_NEON_AUTH_URL と同じ形）への要求に作り直す */
export async function toUpstream(req: Request, upstream: string, path: string): Promise<Request> {
  const url = new URL(req.url);
  const target = `${upstream.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}${url.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!DROP_REQUEST.has(k.toLowerCase())) headers.set(k, v);
  });
  const cookie = authCookies(req.headers.get('cookie'));
  if (cookie) headers.set('cookie', cookie);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(target, { method: req.method, headers, body: hasBody ? await req.arrayBuffer() : undefined, redirect: 'manual' });
}

/** Neon Auth の応答を自サイトの応答にする（Set-Cookie を自サイトのものに。CORS のヘッダーは同じオリジンなので要らない） */
export function fromUpstream(res: Response): Response {
  const headers = new Headers();
  res.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (key === 'set-cookie' || key.startsWith('access-control-') || key === 'content-encoding' || key === 'content-length') return;
    headers.set(k, v);
  });
  for (const c of res.headers.getSetCookie()) headers.append('set-cookie', firstPartyCookie(c));
  headers.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** 中継の本体（Pages Functions から呼ぶ）。`path` は `/api/auth/` より後 */
export async function proxyAuth(req: Request, upstream: string, path: string, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!isProxiedPath(path)) return new Response('not found', { status: 404 });
  return fromUpstream(await fetcher(await toUpstream(req, upstream, path)));
}
