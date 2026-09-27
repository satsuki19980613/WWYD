import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { useLayer } from './useLayer.ts';

/**
 * モーダルの共通の器（面取りプレート）。スマホは下からのシート、PC は中央。
 * Esc と背景クリックで閉じる。`tone` は上端の線の意味の色（情報 = シアン、確認 = 黄、破壊的 = 赤）。
 */
export function Modal(props: {
  title: string;
  tone: 'info' | 'confirm' | 'danger';
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  role?: 'dialog' | 'alertdialog';
  showClose?: boolean;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useLayer(ref, props.onClose, { trapFocus: true, initialFocus: props.initialFocus });

  return (
    <div className="modal-backdrop" role="presentation" onClick={props.onClose}>
      <div
        ref={ref}
        className={`modal tone-${props.tone}`}
        role={props.role ?? 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            {props.title}
          </h2>
          {props.showClose !== false && (
            <button type="button" className="icon-btn modal-x" aria-label="閉じる" onClick={props.onClose}>
              <CloseGlyph />
            </button>
          )}
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

function CloseGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
