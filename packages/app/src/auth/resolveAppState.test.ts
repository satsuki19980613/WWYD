import { describe, expect, it } from 'vitest';
import type { Reachability } from '../appState.ts';
import { checkHealth, cleanAuthParams, resolveAppState, type AppStateDeps, type Whoami } from './resolveAppState.ts';

function deps(p: {
  health?: Reachability;
  online?: boolean;
  session?: boolean;
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

  it('whoami の通信失敗', async () => {
    expect((await resolveAppState(deps({ whoami: { kind: 'http', status: 500 } }))).state).toBe('maintenance');
    expect((await resolveAppState(deps({ whoami: { kind: 'network' }, online: false }))).state).toBe('offline');
    expect((await resolveAppState(deps({ whoami: { kind: 'http', status: 401 } }))).state).toBe('signedOut');
  });
});

describe('checkHealth', () => {
  const stub = (impl: () => Promise<Response>): typeof fetch => (async () => impl()) as unknown as typeof fetch;

  it('200 → ok、503 → http', async () => {
    expect(await checkHealth('http://x', 'k', stub(async () => new Response('{}', { status: 200 })))).toEqual({ kind: 'ok' });
    expect(await checkHealth('http://x', 'k', stub(async () => new Response('', { status: 503 })))).toEqual({
      kind: 'http',
      status: 503,
    });
  });

  it('通信失敗 → network', async () => {
    expect(await checkHealth('http://x', 'k', stub(async () => Promise.reject(new TypeError('failed'))))).toEqual({
      kind: 'network',
    });
  });

  it('打ち切り → timeout', async () => {
    const hang: typeof fetch = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    expect(await checkHealth('http://x', 'k', hang, 10)).toEqual({ kind: 'timeout' });
  });

  it('apikey を付けて /auth/v1/health を呼ぶ', async () => {
    let seen: { url: string; key: string | null } | null = null;
    const spy = (async (url: string, init?: RequestInit) => {
      seen = { url, key: new Headers(init?.headers).get('apikey') };
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await checkHealth('https://p.supabase.co', 'anon', spy);
    expect(seen).toEqual({ url: 'https://p.supabase.co/auth/v1/health', key: 'anon' });
  });
});

describe('cleanAuthParams', () => {
  it('code を除く', () => {
    expect(cleanAuthParams('http://localhost:5173/s/abc/answer?code=xyz')).toEqual({
      path: '/s/abc/answer',
      failed: false,
      changed: true,
    });
  });

  it('他のクエリは残す', () => {
    expect(cleanAuthParams('http://localhost:5173/?tab=mine&code=1').path).toBe('/?tab=mine');
  });

  it('同意の拒否などのエラー', () => {
    const r = cleanAuthParams('http://localhost:5173/?error=access_denied&error_description=denied');
    expect(r).toEqual({ path: '/', failed: true, changed: true });
    expect(cleanAuthParams('http://localhost:5173/#error=server_error').failed).toBe(true);
  });

  it('何もなければ変えない', () => {
    expect(cleanAuthParams('http://localhost:5173/new')).toEqual({ path: '/new', failed: false, changed: false });
  });
});
