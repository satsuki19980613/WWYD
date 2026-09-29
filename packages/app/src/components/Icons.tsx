/** 汎用のアイコン（装飾なし・currentColor）。 */

/** アカウント（汎用の人型。Google のプロフィール画像・名前・頭文字は出さない。不変条件 6） */
export function AccountIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="7" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 17.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** 戻る（ヘッダーの左。一覧へ） */
export function BackIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M12.5 4 6.5 10l6 6" {...stroke} strokeWidth={2} />
    </svg>
  );
}

/** ブラシ（レンジ表を塗る道具） */
export function BrushIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8 11.5 15.8 3.7a1.6 1.6 0 0 1 2.3 2.3L10.3 13.8" {...stroke} />
      <path d="M6.3 12.6c-1.5 0-2.6 1.2-2.6 2.6 0 1.1-1.2 1.6-1.7 1.8.9.8 2.1 1.2 3.4 1.2 1.9 0 3.4-1.5 3.4-3.4a2.5 2.5 0 0 0-2.5-2.2Z" {...stroke} />
    </svg>
  );
}

/** 消しゴム（レンジ外に戻す道具） */
export function EraserIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m6.5 17.5-3.6-3.6a1.6 1.6 0 0 1 0-2.3l8.2-8.2a1.6 1.6 0 0 1 2.3 0l4.2 4.2a1.6 1.6 0 0 1 0 2.3l-7.6 7.6" {...stroke} />
      <path d="M18 17.5H6.5M5 9.5l6.5 6.5" {...stroke} />
    </svg>
  );
}

/** 元に戻す */
export function UndoIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 11.5 3.5 7.5l4-4" {...stroke} />
      <path d="M3.5 7.5h8.8a4.5 4.5 0 0 1 0 9H9.5" {...stroke} />
    </svg>
  );
}

/** やり直す */
export function RedoIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m12.5 11.5 4-4-4-4" {...stroke} />
      <path d="M16.5 7.5H7.7a4.5 4.5 0 0 0 0 9h2.8" {...stroke} />
    </svg>
  );
}

/** 進む（一覧のカードの右下） */
export function ChevronIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 4l6 6-6 6" {...stroke} strokeWidth={2} />
    </svg>
  );
}
