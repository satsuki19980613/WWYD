/**
 * 起動時にアプリ全体の状態を決める（詳細仕様 06 章 §0.3）。通信は引数で受け取り、判定だけをここに置く（単体テストするため）。
 * 順序: ヘルスチェック → セッション → whoami。
 */
import { classifyReachability, HEALTH_TIMEOUT_MS, type AppState, type Reachability } from '../appState.ts';

export type Whoami = { allowed: boolean; admin: boolean };

export type AppStateDeps = {
  health: () => Promise<Reachability>;
  online: () => boolean;
  /** セッションがあるか。get-session が失敗したら Reachability を返す（5xx・通信エラーは未ログインと区別する） */
  hasSession: () => Promise<boolean | Reachability>;
  /** whoami の結果。通信に失敗したら Reachability を返す。 */
  whoami: () => Promise<Whoami | Reachability>;
};

export type Resolved = { state: AppState; admin: boolean };

function isWhoami(v: Whoami | Reachability): v is Whoami {
  return 'allowed' in v;
}

export async function resolveAppState(deps: AppStateDeps): Promise<Resolved> {
  const blocked = classifyReachability(await deps.health(), deps.online());
  if (blocked) return { state: blocked, admin: false };
  const session = await deps.hasSession();
  if (typeof session !== 'boolean') {
    // get-session の 5xx・通信エラーはメンテナンス中（オフライン）。4xx は未ログインとして扱う（06 章 §0.3。リリース前テスト T-A F5）
    return { state: classifyReachability(session, deps.online()) ?? 'signedOut', admin: false };
  }
  if (!session) return { state: 'signedOut', admin: false };
  const me = await deps.whoami();
  if (!isWhoami(me)) {
    // whoami の 4xx（トークン切れ等）はログインし直してもらう
    return { state: classifyReachability(me, deps.online()) ?? 'signedOut', admin: false };
  }
  return me.allowed ? { state: 'ready', admin: me.admin } : { state: 'unavailable', admin: false };
}

/**
 * バックエンドのヘルスチェック（Neon Auth の `/ok`）。`HEALTH_TIMEOUT_MS` で打ち切る。
 * 到達不能・5xx・タイムアウトは classifyReachability でメンテナンス中になる。
 */
export async function checkHealth(
  healthUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<Reachability> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(healthUrl, { signal: ctrl.signal });
    return res.ok ? { kind: 'ok' } : { kind: 'http', status: res.status };
  } catch (e) {
    return ctrl.signal.aborted || (e instanceof Error && e.name === 'AbortError') ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OAuth から戻ったときの URL の後始末。Neon Auth の session verifier（セッションの受け取りに一度だけ使う）と
 * `error` などのパラメータを除いたパス、verifier の値、失敗したかを返す。
 */
export function cleanAuthParams(href: string): { path: string; failed: boolean; changed: boolean; verifier: string | null } {
  const url = new URL(href);
  const failed = url.searchParams.has('error') || url.hash.includes('error=');
  const verifier = url.searchParams.get('neon_auth_session_verifier');
  let changed = false;
  for (const k of ['neon_auth_session_verifier', 'code', 'state', 'error', 'error_code', 'error_description']) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      changed = true;
    }
  }
  if (url.hash.includes('error=') || url.hash.includes('access_token=')) {
    url.hash = '';
    changed = true;
  }
  return { path: url.pathname + url.search + url.hash, failed, changed, verifier };
}
