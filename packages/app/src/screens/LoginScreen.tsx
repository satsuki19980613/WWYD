import { Link } from '../components/Link.tsx';

/**
 * ログイン画面（06 章 §1。最小構成）。アプリ名・「Google でログイン」・規約へのリンク。
 * ログイン処理（`signInWithOAuth`）は P3（T-304）で渡す。渡されていない間は押せない。
 */
export function LoginScreen(props: { onLogin?: () => void; busy?: boolean; failed?: boolean }): JSX.Element {
  return (
    <section className="login">
      <h1 className="login-name">WWYD</h1>
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
