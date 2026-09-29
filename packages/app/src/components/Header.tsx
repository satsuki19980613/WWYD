import { useRef, useState } from 'react';
import { AccountIcon, DraftIcon } from './Icons.tsx';
import { Link } from './Link.tsx';
import { AccountMenu } from './AccountMenu.tsx';
import { BackLink } from './BackLink.tsx';
import { useIsMobile } from '../useMediaQuery.ts';

/** ヘッダーの左に出す画面名。`heading` は画面の h1 にするか（本文に h1 を持つ画面は false） */
export type HeaderTitle = { text: string; heading: boolean };

/** PC のナビの項目（いまいる画面。どれでもなければ null） */
export type NavItem = 'list' | 'new' | null;

/**
 * ヘッダー（06 章 §0.2）。左に「＜」（一覧へ。一覧以外）と画面名、右に下書き・ⓘ・アカウントアイコン。
 * ⓘ は `data-keep-open` を付けて、アカウントメニューを開いたまま押せるようにする（開いていればアカウントの節を出す）。
 */
export function Header(props: {
  title?: HeaderTitle;
  back: boolean;
  /** PC のナビ（List・＋ Post）を出すか（ログイン中）と、いまいる項目 */
  nav?: NavItem;
  showAccount: boolean;
  /** 保存した下書きの件数（ログイン中だけ下書きのボタンを出す。14 章 §3.5） */
  drafts?: number;
  onInfo: (accountMenuOpen: boolean) => void;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLButtonElement>(null);
  const { title } = props;
  const Title = title?.heading ? 'h1' : 'span';
  const mobile = useIsMobile();
  // PC はナビ（List・＋ Post）で居場所を示し、戻る「＜」は出さない。ナビの項目と同じ画面名は読み上げだけに残す（2026-09-29）
  const pcNav = !mobile && props.nav !== undefined;
  const crumbHidden = pcNav && props.nav !== null;

  return (
    <header className="hdr">
      <div className="hdr-inner">
        <div className="hdr-lead">
          {props.back && !pcNav && <BackLink />}
          {pcNav && (
            <nav className="hdr-nav" aria-label="メニュー">
              <Link to="/" className="hdr-nav-item" aria-current={props.nav === 'list' ? 'page' : undefined}>
                List
              </Link>
              <Link to="/new" className="hdr-nav-item post" aria-current={props.nav === 'new' ? 'page' : undefined}>
                ＋ Post
              </Link>
            </nav>
          )}
          {title && (
            <Title className={`hdr-title${crumbHidden ? ' sr-only' : ''}${pcNav && !crumbHidden ? ' crumb' : ''}`}>{title.text}</Title>
          )}
        </div>
        <div className="hdr-actions">
          {props.drafts !== undefined && (
            <Link to="/drafts" className="icon-btn hdr-drafts" aria-label={`下書き（${props.drafts}件）`}>
              <DraftIcon />
              {props.drafts > 0 && <span className="hdr-badge num">{props.drafts}</span>}
            </Link>
          )}
          <button
            type="button"
            className="infomark"
            aria-label="インフォメーション"
            data-keep-open
            onClick={() => {
              props.onInfo(menuOpen);
              setMenuOpen(false);
            }}
          >
            i
          </button>
          {props.showAccount && (
            <div className="acct">
              <button
                ref={accountRef}
                type="button"
                className="icon-btn acct-btn"
                aria-label="アカウント"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <AccountIcon />
              </button>
              {menuOpen && (
                <AccountMenu
                  anchorRef={accountRef}
                  onClose={() => setMenuOpen(false)}
                  onLogout={props.onLogout}
                  onDeleteAccount={props.onDeleteAccount}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
