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
