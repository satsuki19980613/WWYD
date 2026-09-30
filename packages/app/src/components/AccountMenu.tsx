import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { navigate } from '../router.ts';
import { useLayer, useOutsidePress } from './useLayer.ts';

/**
 * アカウントメニュー（06 章 §0.2）。「利用規約」「プライバシーポリシー」「ログアウト」「アカウントを削除」。
 * ログアウトとアカウント削除は認証（P3）・削除（P8）で処理を渡す。渡されていない間は押せない。
 */
export function AccountMenu(props: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onLogout?: (() => void) | undefined;
  onDeleteAccount?: (() => void) | undefined;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const close = (): void => {
    props.onClose();
    props.anchorRef.current?.focus();
  };
  useLayer(ref, close);
  useOutsidePress([ref, props.anchorRef], props.onClose, true);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, []);

  const go = (path: string): void => {
    props.onClose();
    navigate(path);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  };

  return (
    <div ref={ref} className="menu" role="menu" aria-label="アカウント" onKeyDown={onKeyDown}>
      <button type="button" role="menuitem" className="menu-item" onClick={() => go('/terms')}>
        利用規約
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={() => go('/privacy')}>
        プライバシーポリシー
      </button>
      <div className="menu-sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="menu-item"
        disabled={!props.onLogout}
        onClick={() => {
          props.onClose();
          props.onLogout?.();
        }}
      >
        ログアウト
      </button>
      <button
        type="button"
        role="menuitem"
        className="menu-item danger"
        disabled={!props.onDeleteAccount}
        onClick={() => {
          // 先にフォーカスをアカウントのボタンへ戻してから確認を開く。確認（Modal）は開いたときのフォーカスを覚えて閉じたときに戻すので、
          // メニューの項目（閉じると消える）のままだと body に落ちる（リリース前テスト F-031）
          close();
          props.onDeleteAccount?.();
        }}
      >
        アカウントを削除
      </button>
    </div>
  );
}
