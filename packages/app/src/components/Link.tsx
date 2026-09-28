import type { ReactNode } from 'react';
import { navigate } from '../router.ts';

/** アプリ内リンク。修飾キー付きのクリック（新しいタブ等）はブラウザに任せる。 */
export function Link(props: { to: string; className?: string; 'aria-label'?: string; children: ReactNode }): JSX.Element {
  return (
    <a
      className={props.className}
      aria-label={props['aria-label']}
      href={props.to}
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
