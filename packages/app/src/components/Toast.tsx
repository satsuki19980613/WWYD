import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * トースト（06 章 §0.4）。エラーと、仕様書が明示したもの（スポイトの「レンジ外」）だけに使う。
 * 完了通知と操作説明には使わない（CLAUDE.md 不変条件 1）。2.2 秒で消える。
 */
export const TOAST_MS = 2200;

type ToastKind = 'error' | 'notice';
type ToastItem = { id: number; message: string; kind: ToastKind };
type ShowToast = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider(props: { children: ReactNode }): JSX.Element {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const seq = useRef(0);

  const show = useCallback<ShowToast>((message, kind = 'error') => {
    seq.current += 1;
    setToast({ id: seq.current, message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {props.children}
      {/* 読み上げの領域は常に置いておき、中身だけ差し替える（出現と同時に読み上げさせるため） */}
      <div className="toast-wrap" role={toast?.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast ${toast.kind === 'error' ? 'err' : ''}`} onClick={() => setToast(null)}>
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
