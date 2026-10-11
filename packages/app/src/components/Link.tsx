import type { KeyboardEvent, ReactNode } from 'react';
import { navigate } from '../router.ts';

/** アプリ内リンク。修飾キー付きのクリック（新しいタブ等）はブラウザに任せる。 */
export function Link(props: Readonly<{
  to: string;
  className?: string;
  'aria-label'?: string;
  /** いまいる画面の項目（ヘッダーのナビ。17 章 §3.1） */
  'aria-current'?: 'page';
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  children: ReactNode;
}>): JSX.Element {
  return (
    <a
      className={props.className}
      aria-label={props['aria-label']}
      aria-current={props['aria-current']}
      href={props.to}
      onKeyDown={props.onKeyDown}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(props.to);
      }}
    >
      {props.children}
    </a>
  );
}
