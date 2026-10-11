import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { navigate } from '../router.ts';
import { useLayer, useOutsidePress } from './useLayer.ts';

/**
 * アカウントメニュー（06 章 §0.2）。「利用規約」「プライバシーポリシー」「ログアウト」「アカウントを削除」。
 * ログアウトとアカウント削除は認証（P3）・削除（P8）で処理を渡す。渡されていない間は押せない。
 */
export function AccountMenu(props: Readonly<{
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}>): JSX.Element {
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

  // 矢印キーは各項目で受ける（メニューを開いている間、フォーカスは常に項目にある）
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  };

  return (
    <div ref={ref} className="menu" role="menu" aria-label="アカウント">
      <button type="button" role="menuitem" className="menu-item" onKeyDown={onKeyDown} onClick={() => go('/terms')}>
        利用規約
      </button>
      <button type="button" role="menuitem" className="menu-item" onKeyDown={onKeyDown} onClick={() => go('/privacy')}>
        プライバシーポリシー
      </button>
      <hr className="menu-sep" />
      <button
        type="button"
        role="menuitem"
        className="menu-item"
        disabled={!props.onLogout}
        onKeyDown={onKeyDown}
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
        onKeyDown={onKeyDown}
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
