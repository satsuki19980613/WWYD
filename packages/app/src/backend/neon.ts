import { PostgrestClient } from '@supabase/postgrest-js';
import { AUTH_PROXY_PREFIX } from './authProxy.ts';

/**
 * Neon のバックエンドへの接続（詳細仕様 12 章）。
 * - ログイン: Neon Auth（Managed Better Auth）の REST を呼ぶ。Google へのログインの開始だけ Neon Auth に直接、
 *   セッションの確認・JWT・ログアウトは自サイトの `/api/auth/*` の中継を通す（authProxy.ts）。セッションは自サイトの
 *   HttpOnly のクッキーになり、他サイトのクッキーを消すブラウザでもログインが続く（2026-09-29。12 章 §7.2）。アプリからは読めない。
 * - データ: Neon Data API（PostgREST 互換）。Neon Auth が発行する JWT（15 分）を Authorization に付ける。
 * 公式 SDK（@neondatabase/neon-js / auth）は Next.js を必須の依存に持ち Vite では入らないため、
 * SDK が内部で行っている手順（sign-in/social → session verifier → get-session → token）を同じ順で行う。
 */
export const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL ?? '';
export const DATA_API_URL = import.meta.env.VITE_NEON_DATA_API_URL ?? '';
export const CREATE_POST_URL = import.meta.env.VITE_NEON_CREATE_POST_URL ?? '';
export const configured = Boolean(AUTH_URL && DATA_API_URL);
/** セッションの確認・JWT・ログアウト・ヘルスチェックの入口（自サイトの中継。本番は Pages Functions、開発は Vite の proxy） */
export const SESSION_URL = AUTH_PROXY_PREFIX;

/** OAuth から戻った URL に Neon Auth が付けるパラメータ（セッションを受け取るための一回限りの値） */
export const SESSION_VERIFIER_PARAM = 'neon_auth_session_verifier';

export type AuthUser = { id: string };

/** Neon Auth に直接（Google へのログインの開始だけ） */
function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${AUTH_URL}${path}`, { ...init, credentials: 'include' });
}

/** 自サイトの中継を通す（セッションのクッキーは自サイトのもの） */
function sessionFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SESSION_URL}${path}`, { ...init, credentials: 'same-origin' });
}

/**
 * Google でログインする（Neon Auth のページへ移動する）。
 * 成功すると `callbackURL` に `neon_auth_session_verifier` 付きで戻る。失敗は `errorCallbackURL`（`?error=`）。
 */
export async function signInWithGoogle(callbackURL: string): Promise<void> {
  const failURL = new URL(callbackURL);
  failURL.searchParams.set('error', 'login_failed');
  const res = await authFetch('/sign-in/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'google', callbackURL, errorCallbackURL: failURL.toString(), disableRedirect: true }),
  });
  if (!res.ok) throw new Error(`sign-in/social ${res.status}`);
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error('sign-in/social: url がない');
  window.location.assign(url);
}

/**
 * 現在のセッション（無ければ null）。OAuth から戻った直後は URL の verifier を添えてセッションを確定させる。
 * 通信に失敗したら例外（呼び出し側でメンテナンス中・オフラインに振り分ける）。
 */
export async function getSessionUser(verifier: string | null): Promise<AuthUser | null> {
  if (verifier) {
    // verifier は一度しか使えない。同じ値で 2 回呼ばれても（React の開発モードは起動処理を 2 回実行する）
    // 最初の 1 回の結果を共有する。受け取れなかったときは、通常のセッション確認にまわす
    let first = verifierExchanges.get(verifier);
    if (!first) {
      first = fetchSession(`?${SESSION_VERIFIER_PARAM}=${encodeURIComponent(verifier)}`);
      verifierExchanges.set(verifier, first);
    }
    const user = await first;
    if (user) return user;
  }
  return fetchSession('');
}

const verifierExchanges = new Map<string, Promise<AuthUser | null>>();

async function fetchSession(query: string): Promise<AuthUser | null> {
  const res = await sessionFetch(`/get-session${query}`);
  if (!res.ok) throw Object.assign(new Error(`get-session ${res.status}`), { status: res.status });
  const body = (await res.json()) as { user?: { id?: string } } | null;
  return body?.user?.id ? { id: body.user.id } : null;
}

export async function signOut(): Promise<void> {
  cachedToken = null;
  await sessionFetch('/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

// ---- Data API 用の JWT（15 分。切れる 30 秒前に取り直す） ----

let cachedToken: { token: string; exp: number } | null = null;

function expOf(jwt: string): number {
  try {
    const payload = JSON.parse(atob((jwt.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

export async function getToken(): Promise<string | null> {
  if (cachedToken && cachedToken.exp - 30_000 > Date.now()) return cachedToken.token;
  const res = await sessionFetch('/token');
  if (res.status === 401) return null;
  if (!res.ok) throw Object.assign(new Error(`token ${res.status}`), { status: res.status });
  const { token } = (await res.json()) as { token?: string };
  if (!token) return null;
  cachedToken = { token, exp: expOf(token) };
  return token;
}

/** Data API のクライアント。リクエストごとにログイン中の JWT を付ける。 */
export const db = new PostgrestClient(DATA_API_URL, {
  fetch: async (input, init) => {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  },
});
