import { useEffect, useRef, type RefObject } from 'react';

/**
 * 重なって開く面（モーダル・メニュー・リスト）の登録簿。
 * Esc は最前面の 1 枚だけが受け取る（確認ダイアログの下のメニューまで一緒に閉じない）。
 */
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 面を開いている間、Esc で `onClose` を呼ぶ。`trapFocus` のときは Tab を面の中に閉じ込め、
 * 開いたときに最初の操作要素へ、閉じたときに元の要素へフォーカスを戻す（モーダル用）。
 */
export function useLayer(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: { trapFocus?: boolean; initialFocus?: RefObject<HTMLElement | null> } = {},
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { trapFocus = false, initialFocus } = opts;

  useEffect(() => {
    const id = Symbol('layer');
    stack.push(id);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (trapFocus) {
      const target = initialFocus?.current ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE) ?? ref.current;
      target?.focus();
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (trapFocus && e.key === 'Tab' && ref.current) {
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (trapFocus) previous?.focus();
    };
    // 開いている間は登録し続ける（依存を増やすと開閉のたびに登録し直してフォーカスが飛ぶ）
  }, []);
}

/** 面の外を押したら閉じる（メニュー・セレクト用）。`keep` に含まれる要素は外とみなさない。 */
export function useOutsidePress(
  refs: readonly RefObject<HTMLElement | null>[],
  onOutside: () => void,
  active: boolean,
): void {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent): void => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (refs.some((r) => r.current?.contains(t))) return;
      if (t instanceof Element && t.closest('[data-keep-open]')) return;
      cb.current();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [active, refs]);
}
