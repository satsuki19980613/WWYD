import { BackIcon } from './Icons.tsx';
import { Link } from './Link.tsx';

/** ヘッダーの左の「＜」（一覧へ。一覧以外。06 章 §0.2）。 */
export function BackLink(): JSX.Element {
  return (
    <Link to="/" className="icon-btn hdr-back" aria-label="一覧へ">
      <BackIcon />
    </Link>
  );
}
