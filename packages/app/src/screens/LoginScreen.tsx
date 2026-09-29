import { Link } from '../components/Link.tsx';

/**
 * ログイン画面（06 章 §1。最小構成）。アプリ名・サービスの説明 1 行・「Google でログイン」・規約へのリンク。
 * 説明 1 行は Google の OAuth 同意画面の「ホームページ」の要件（アプリの機能を説明する）のため。
 * 画面に説明文を出さない規則（CLAUDE.md 不変条件 1）の例外として決めたもの。
 * ログイン処理（`signInWithOAuth`）は P3（T-304）で渡す。渡されていない間は押せない。
 */
export function LoginScreen(props: { onLogin?: () => void; busy?: boolean; failed?: boolean }): JSX.Element {
  return (
    <section className="login">
      <h1 className="login-name">WWYD</h1>
      <p className="login-tagline">Poker の Spot を投稿し、Villain の Range を他の Player の回答から集合知として見るツール</p>
      {props.failed && (
        <p className="form-err" role="alert">
          ログインできませんでした
        </p>
      )}
      <button type="button" className="btn" onClick={props.onLogin} disabled={!props.onLogin || props.busy}>
        {props.busy ? 'Google でログイン…' : 'Google でログイン'}
      </button>
      <nav className="login-links" aria-label="規約">
        <Link to="/terms">利用規約</Link>
        <Link to="/privacy">プライバシーポリシー</Link>
      </nav>
    </section>
  );
}
