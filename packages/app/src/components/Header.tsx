import { useRef, useState } from 'react';
import { AccountIcon } from './Icons.tsx';
import { AccountMenu } from './AccountMenu.tsx';
import { Link } from './Link.tsx';

/**
 * ヘッダー（06 章 §0.2）。左にアプリ名「WWYD」（一覧へのリンク）、右に ⓘ とアカウントアイコン。
 * ⓘ は `data-keep-open` を付けて、アカウントメニューを開いたまま押せるようにする（開いていればアカウントの節を出す）。
 */
export function Header(props: {
  showAccount: boolean;
  onInfo: (accountMenuOpen: boolean) => void;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="hdr">
      <div className="hdr-inner">
        <Link to="/" className="hdr-brand">
          WWYD
        </Link>
        <div className="hdr-actions">
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
