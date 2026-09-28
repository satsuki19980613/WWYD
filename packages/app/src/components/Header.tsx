import { useRef, useState } from 'react';
import { AccountIcon } from './Icons.tsx';
import { AccountMenu } from './AccountMenu.tsx';

/**
 * ヘッダー（06 章 §0.2）。左に画面名（ある画面だけ）、右に ⓘ とアカウントアイコン。
 * ⓘ は `data-keep-open` を付けて、アカウントメニューを開いたまま押せるようにする（開いていればアカウントの節を出す）。
 */
export function Header(props: {
  title?: string;
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
        {props.title ? <h1 className="hdr-title">{props.title}</h1> : <span />}
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
