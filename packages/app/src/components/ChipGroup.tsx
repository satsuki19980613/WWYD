/** 択一のチップ（一覧のストリート・並び替え、投稿のゲーム形式など）。選択中は黄。スマホでは横スクロール。 */
export function ChipGroup<T extends string>(props: {
  label: string;
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div className="chip-row" role="group" aria-label={props.label}>
      <span className="mono-lbl chip-lbl" aria-hidden="true">
        {props.label}
      </span>
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

