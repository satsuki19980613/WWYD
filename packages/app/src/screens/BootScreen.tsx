/** 起動中（セッション確認中）。ロゴのみ・文字なし（06 章 §0.3）。 */
export function BootScreen(): JSX.Element {
  return (
    <div className="boot" role="status" aria-label="読み込み中">
      <div className="boot-mark" aria-hidden="true" />
    </div>
  );
}
