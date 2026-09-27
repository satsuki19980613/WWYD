import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, Reachability } from '../appState.ts';
import { AUTH_URL, configured, db, getSessionUser, signInWithGoogle, signOut as neonSignOut } from '../backend/neon.ts';
import { navigate } from '../router.ts';
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

async function callWhoami(): Promise<Whoami | Reachability> {
  try {
    const { data, error, status } = await db.rpc('whoami');
    if (error) return { kind: 'http', status: status || 500 };
    return data as Whoami;
  } catch {
    return { kind: 'network' };
  }
}

/**
 * 認証とアプリ全体の状態（06 章 §0.3、§1。バックエンドは Neon。12 章）。
 * 起動時: OAuth から戻った URL の verifier を使ってセッションを確定 → URL の後始末 →
 * ヘルスチェック → セッション → whoami。ログイン・ログアウトのたびに判定し直す。
 */
export function useAuth(): Auth {
  const [state, setState] = useState<AppState>('booting');
  const [admin, setAdmin] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const run = useRef(0);

  const resolve = useCallback(async (verifier: string | null) => {
    const id = ++run.current;
    if (!configured) {
      // 環境変数が無い（設定前）。バックエンドに到達できないのと同じ扱い
      setState('maintenance');
      return;
    }
    const r = await resolveAppState({
      health: () => checkHealth(`${AUTH_URL}/ok`),
      online: () => navigator.onLine,
      hasSession: async () => {
        try {
          return (await getSessionUser(verifier)) !== null;
        } catch {
          return false;
        }
      },
      whoami: callWhoami,
    });
    if (id !== run.current) return; // 後から始めた判定を優先する
    setState(r.state);
    setAdmin(r.admin);
  }, []);

  useEffect(() => {
    const cleaned = cleanAuthParams(window.location.href);
    if (cleaned.failed) setLoginFailed(true);
    void (async () => {
      // verifier は一度しか使えない。セッションを確定させてから URL を戻す
      await resolve(cleaned.verifier);
      if (cleaned.changed) navigate(cleaned.path, { replace: true });
    })();
  }, [resolve]);

  const signIn = useCallback(() => {
    setSigningIn(true);
    setLoginFailed(false);
    // ログイン後は元のパスへ戻る（06 章 §1）
    const back = window.location.origin + window.location.pathname + window.location.search;
    signInWithGoogle(back).catch(() => {
      setSigningIn(false);
      setLoginFailed(true);
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await neonSignOut();
    } catch {
      // サーバーに届かなくても、画面はログアウトした状態にする（次回の起動で判定し直す）
    }
    setState('signedOut');
    setAdmin(false);
  }, []);

  return { state, admin, loginFailed, signingIn, signIn, signOut };
}
