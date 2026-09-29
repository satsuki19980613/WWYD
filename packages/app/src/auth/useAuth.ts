import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, Reachability } from '../appState.ts';
import { configured, SESSION_URL, db, getSessionUser, signInWithGoogle, signOut as neonSignOut } from '../backend/neon.ts';
import { navigate } from '../router.ts';
import { checkHealth, cleanAuthParams, resolveAppState, type Whoami } from './resolveAppState.ts';

export type Auth = {
  state: AppState;
  /** ログインしている利用者の ID（下書きの保存先を分ける。14 章 §3.5） */
  userId: string | null;
  admin: boolean;
  /** Google の同意を拒否した・失敗した（ログイン画面に「ログインできませんでした」を出す） */
  loginFailed: boolean;
  signingIn: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
  /** アカウントを削除してログアウトする（06 章 §6.1）。失敗したら false（ログインしたまま） */
  deleteAccount: () => Promise<boolean>;
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
  const [userId, setUserId] = useState<string | null>(null);
  const sessionUser = useRef<string | null>(null);
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
      health: () => checkHealth(`${SESSION_URL}/ok`),
      online: () => navigator.onLine,
      hasSession: async () => {
        try {
          const u = await getSessionUser(verifier);
          sessionUser.current = u?.id ?? null;
          return u !== null;
        } catch {
          sessionUser.current = null;
          return false;
        }
      },
      whoami: callWhoami,
    });
    if (id !== run.current) return; // 後から始めた判定を優先する
    setState(r.state);
    setAdmin(r.admin);
    setUserId(r.state === 'ready' ? sessionUser.current : null);
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
    setUserId(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    try {
      // 回答（集計の減算）→ 投稿 → 認証の利用者（セッションごと）の順にサーバーで消す（02 章 §4.6）
      const { error } = await db.rpc('delete_my_account');
      if (error) return false;
    } catch {
      return false;
    }
    // セッションはサーバーで消えているので、sign-out が失敗しても signOut の中で握りつぶす
    await signOut();
    navigate('/', { replace: true });
    return true;
  }, [signOut]);

  return { state, userId, admin, loginFailed, signingIn, signIn, signOut, deleteAccount };
}
