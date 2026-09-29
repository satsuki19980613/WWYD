import { describe, expect, it } from 'vitest';
import type { Reachability } from '../appState.ts';
import { checkHealth, cleanAuthParams, resolveAppState, type AppStateDeps, type Whoami } from './resolveAppState.ts';

function deps(p: {
  health?: Reachability;
  online?: boolean;
  session?: boolean | Reachability;
  whoami?: Whoami | Reachability;
}): AppStateDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    health: async () => {
      calls.push('health');
      return p.health ?? { kind: 'ok' };
    },
    online: () => p.online ?? true,
    hasSession: async () => {
      calls.push('session');
      return p.session ?? true;
    },
    whoami: async () => {
      calls.push('whoami');
      return p.whoami ?? { allowed: true, admin: false };
    },
  };
}

describe('resolveAppState（06 章 §0.3）', () => {
  it('通常', async () => {
    expect(await resolveAppState(deps({}))).toEqual({ state: 'ready', admin: false });
    expect(await resolveAppState(deps({ whoami: { allowed: true, admin: true } }))).toEqual({ state: 'ready', admin: true });
  });

  it('セッションなし → 未ログイン（whoami は呼ばない）', async () => {
    const d = deps({ session: false });
    expect((await resolveAppState(d)).state).toBe('signedOut');
    expect(d.calls).toEqual(['health', 'session']);
  });

  it('whoami.allowed = false → 利用不可', async () => {
    expect((await resolveAppState(deps({ whoami: { allowed: false, admin: false } }))).state).toBe('unavailable');
  });

  it('ヘルスチェックの失敗 → メンテナンス中 / オフライン（セッションは見ない）', async () => {
    const d = deps({ health: { kind: 'timeout' } });
    expect((await resolveAppState(d)).state).toBe('maintenance');
    expect(d.calls).toEqual(['health']);
    expect((await resolveAppState(deps({ health: { kind: 'http', status: 503 } }))).state).toBe('maintenance');
    expect((await resolveAppState(deps({ health: { kind: 'network' }, online: false }))).state).toBe('offline');
  });

  it('get-session の失敗: 5xx・通信エラーはメンテナンス中 / オフライン、4xx は未ログイン（リリース前テスト T-A F5）', async () => {
    const d = deps({ session: { kind: 'http', status: 502 } });
    expect((await resolveAppState(d)).state).toBe('maintenance');
    expect(d.calls).toEqual(['health', 'session']);
    expect((await resolveAppState(deps({ session: { kind: 'network' } }))).state).toBe('maintenance');
    expect((await resolveAppState(deps({ session: { kind: 'network' }, online: false }))).state).toBe('offline');
    expect((await resolveAppState(deps({ session: { kind: 'http', status: 401 } }))).state).toBe('signedOut');
  });

  it('whoami の通信失敗', async () => {
    expect((await resolveAppState(deps({ whoami: { kind: 'http', status: 500 } }))).state).toBe('maintenance');
    expect((await resolveAppState(deps({ whoami: { kind: 'network' }, online: false }))).state).toBe('offline');
    expect((await resolveAppState(deps({ whoami: { kind: 'http', status: 401 } }))).state).toBe('signedOut');
  });
});

describe('checkHealth', () => {
  const stub = (impl: () => Promise<Response>): typeof fetch => (async () => impl()) as unknown as typeof fetch;

  it('200 → ok、503 → http', async () => {
    expect(await checkHealth('http://x/ok', stub(async () => new Response('{}', { status: 200 })))).toEqual({ kind: 'ok' });
    expect(await checkHealth('http://x/ok', stub(async () => new Response('', { status: 503 })))).toEqual({
      kind: 'http',
      status: 503,
    });
  });

  it('通信失敗 → network', async () => {
    expect(await checkHealth('http://x/ok', stub(async () => Promise.reject(new TypeError('failed'))))).toEqual({
      kind: 'network',
    });
  });

  it('打ち切り → timeout', async () => {
    const hang: typeof fetch = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    expect(await checkHealth('http://x/ok', hang, 10)).toEqual({ kind: 'timeout' });
  });

  it('渡した URL を呼ぶ', async () => {
    let seen = '';
    const spy = (async (url: string) => {
      seen = url;
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    await checkHealth('https://ep-x.neonauth.example/neondb/auth/ok', spy);
    expect(seen).toBe('https://ep-x.neonauth.example/neondb/auth/ok');
  });
});

describe('cleanAuthParams', () => {
  it('session verifier を取り出して除く', () => {
    expect(cleanAuthParams('http://localhost:5173/s/abc/answer?neon_auth_session_verifier=xyz')).toEqual({
      path: '/s/abc/answer',
      failed: false,
      changed: true,
      verifier: 'xyz',
    });
  });

  it('他のクエリは残す', () => {
    expect(cleanAuthParams('http://localhost:5173/?tab=mine&neon_auth_session_verifier=1').path).toBe('/?tab=mine');
  });

  it('同意の拒否などのエラー', () => {
    const r = cleanAuthParams('http://localhost:5173/?error=access_denied&error_description=denied');
    expect(r).toEqual({ path: '/', failed: true, changed: true, verifier: null });
    expect(cleanAuthParams('http://localhost:5173/#error=server_error').failed).toBe(true);
  });

  it('何もなければ変えない', () => {
    expect(cleanAuthParams('http://localhost:5173/new')).toEqual({ path: '/new', failed: false, changed: false, verifier: null });
  });
});
