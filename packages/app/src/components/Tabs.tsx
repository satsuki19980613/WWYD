import { useRef, type KeyboardEvent } from 'react';

/**
 * タブ（一覧の「すべて」「自分の投稿」、集計の「全体」「自分」「Hero の予想」など）。
 * 選択中は黄の下線（アクティブ）。矢印キー・Home・End で移動する（WAI-ARIA の tablist）。
 */
export function Tabs<T extends string>(props: {
  label: string;
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = props.items.findIndex((i) => i.value === props.value);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const n = props.items.length;
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft') next = (index - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    const item = props.items[next];
    if (!item) return;
    e.preventDefault();
    props.onChange(item.value);
    refs.current[next]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={props.label} onKeyDown={onKeyDown}>
      {props.items.map((item, i) => {
        const selected = item.value === props.value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className="tab"
            onClick={() => props.onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
