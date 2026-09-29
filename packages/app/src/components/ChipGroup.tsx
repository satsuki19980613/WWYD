/**
 * 択一のチップ（一覧のストリート・並び替え、投稿のゲーム形式など）。選択中は黄。
 * `variant` を付けると見出しの文字を出さない（読み上げの名前にだけ使う）。
 * `segment` は横幅いっぱいの等分の列、`toggle` は枠のない小さな文字の切り替え、
 * `rail` は PC の一覧の左の列（見出しの下に縦に並べる。17 章）。
 */
export function ChipGroup<T extends string>(props: {
  label: string;
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  variant?: 'segment' | 'toggle' | 'rail';
}): JSX.Element {
  return (
    <div className={`chip-row ${props.variant ?? ''}`} role="group" aria-label={props.label}>
      {(!props.variant || props.variant === 'rail') && (
        <span className="mono-lbl chip-lbl" aria-hidden="true">
          {props.label}
        </span>
      )}
      <div className="chips">
        {props.items.map((item) => (
          <button
            key={item.value}
            type="button"
            className="chip"
            aria-pressed={item.value === props.value}
            onClick={() => props.onChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
