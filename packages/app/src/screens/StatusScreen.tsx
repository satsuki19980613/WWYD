/**
 * 全画面の状態表示（06 章 §0.3）: メンテナンス中・オフライン・利用不可。
 * 見出し＋ボタン 1 つだけ（06 章の文言以外は出さない）。`tone` はコーナーブラケットの意味の色。
 */
export function StatusScreen(props: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  tone: 'warn' | 'error';
}): JSX.Element {
  return (
    <section className="status-screen">
      <div className={`bracket-hero tone-${props.tone}`}>
        <span className="brk tl" aria-hidden="true" />
        <span className="brk br" aria-hidden="true" />
        <h1 className="status-title">{props.title}</h1>
      </div>
      <button type="button" className="btn ghost" onClick={props.onAction}>
        {props.actionLabel}
      </button>
    </section>
  );
}
