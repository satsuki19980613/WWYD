import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppState, Reachability } from '../appState.ts';
import { navigate } from '../router.ts';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../supabase/client.ts';
import { checkHealth, cleanAuthParams, resolveAppState, type Whoami } from './resolveAppState.ts';

export type Auth = {
  state: AppState;
  admin: boolean;
  /** Google の同意を拒否した・失敗した（ログイン画面に「ログインできませんでした」を出す） */
  loginFailed: boolean;
  signingIn: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
};

async function callWhoami(client: SupabaseClient): Promise<Whoami | Reachability> {
  try {
    const { data, error, status } = await client.rpc('whoami');
    if (error) return { kind: 'http', status: status || 500 };
    return data as Whoami;
  } catch {
    return { kind: 'network' };
  }
}

/**
 * 認証とアプリ全体の状態（06 章 §0.3、§1）。
 * 起動時: OAuth から戻った URL の後始末 → ヘルスチェック → セッション → whoami。
 * ログイン・ログアウトのたびに判定し直す。
 */
export function useAuth(): Auth {
  const [state, setState] = useState<AppState>('booting');
  const [admin, setAdmin] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const run = useRef(0);

  const resolve = useCallback(async () => {
    const client = supabase;
    const id = ++run.current;
    if (!client) {
      // 環境変数が無い（設定前）。バックエンドに到達できないのと同じ扱い
      setState('maintenance');
      return;
    }
    const r = await resolveAppState({
      health: () => checkHealth(SUPABASE_URL, SUPABASE_ANON_KEY),
      online: () => navigator.onLine,
      hasSession: async () => (await client.auth.getSession()).data.session !== null,
      whoami: () => callWhoami(client),
    });
    if (id !== run.current) return; // 後から始めた判定を優先する
    setState(r.state);
    setAdmin(r.admin);
  }, []);

  useEffect(() => {
    const cleaned = cleanAuthParams(window.location.href);
    if (cleaned.failed) setLoginFailed(true);
    void (async () => {
      // PKCE の code は supabase-js が getSession の中で交換する。交換を待ってから URL を戻す
      if (supabase) await supabase.auth.getSession();
      if (cleaned.changed) navigate(cleaned.path, { replace: true });
      await resolve();
    })();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void resolve();
    });
    return () => data.subscription.unsubscribe();
  }, [resolve]);

  const signIn = useCallback(() => {
    if (!supabase) return;
    setSigningIn(true);
    setLoginFailed(false);
    // ログイン後は元のパスへ戻る（06 章 §1）
    const back = window.location.origin + window.location.pathname + window.location.search;
    supabase.auth
      .signInWithOAuth({ provider: 'google', options: { redirectTo: back } })
      .then(({ error }) => {
        if (error) {
          setSigningIn(false);
          setLoginFailed(true);
        }
      })
      .catch(() => {
        setSigningIn(false);
        setLoginFailed(true);
      });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    // サーバーに届かなくても、この端末のセッションは必ず消す
    if (error) await supabase.auth.signOut({ scope: 'local' });
    setState('signedOut');
    setAdmin(false);
  }, []);

  return { state, admin, loginFailed, signingIn, signIn, signOut };
}
