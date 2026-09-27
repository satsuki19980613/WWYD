import { useRef } from 'react';
import { Modal } from './Modal.tsx';

/**
 * 確認ダイアログ（06 章 §0.4）。タイトル・本文・「やめる」「〈実行〉」。
 * Esc と背景クリックは「やめる」。破壊的な操作は実行ボタンを赤にする。
 * 初期フォーカスは「やめる」（Enter の押し間違いで破壊的な操作を実行しない）。
 */
export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancel = (): void => {
    if (!props.busy) props.onCancel();
  };
  return (
    <Modal
      title={props.title}
      tone={props.destructive ? 'danger' : 'confirm'}
      role="alertdialog"
      onClose={cancel}
      initialFocus={cancelRef}
      showClose={false}
      footer={
        <div className="btn-row">
          <button ref={cancelRef} type="button" className="btn ghost" onClick={cancel} disabled={props.busy}>
            やめる
          </button>
          <button
            type="button"
            className={props.destructive ? 'btn red' : 'btn'}
            onClick={props.onConfirm}
            disabled={props.busy}
          >
            {props.busy ? (props.busyLabel ?? `${props.confirmLabel}…`) : props.confirmLabel}
          </button>
        </div>
      }
    >
      <p className="confirm-body">{props.body}</p>
    </Modal>
  );
}
