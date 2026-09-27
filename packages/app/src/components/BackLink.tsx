import { Link } from './Link.tsx';

/** 各画面の左上の「← 一覧へ」（一覧以外。06 章 §0.2）。 */
export function BackLink(): JSX.Element {
  return (
    <Link to="/" className="back-link">
      <span aria-hidden="true">←</span> 一覧へ
    </Link>
  );
}
