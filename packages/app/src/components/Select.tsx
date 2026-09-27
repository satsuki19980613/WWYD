import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useLayer, useOutsidePress } from './useLayer.ts';

/**
 * カスタムセレクト（ネイティブの `<select>` は使わない。CLAUDE.md §6）。
 * WAI-ARIA の「select-only combobox」の形。↑↓ Home End で候補を動かし、Enter / Space で決定、Esc で閉じる。
 */
export function Select<T extends string>(props: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.value),
  );
  const current = props.options[selectedIndex];

  const openList = (): void => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const choose = (i: number): void => {
    const o = props.options[i];
    if (o) props.onChange(o.value);
    close();
  };

  useOutsidePress([triggerRef, listRef], () => setOpen(false), open);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const n = props.options.length;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'ArrowDown') setActive((a) => Math.min(n - 1, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(n - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Tab') setOpen(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  };

  return (
    <div className={`select ${open ? 'open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={props.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={props.disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span>{current?.label}</span>
        <svg className="select-chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && <SelectList listRef={listRef} id={listId} {...props} active={active} onPick={choose} onClose={close} />}
    </div>
  );
}

function SelectList<T extends string>(props: {
  listRef: RefObject<HTMLUListElement>;
  id: string;
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  active: number;
  onPick: (i: number) => void;
  onClose: () => void;
}): JSX.Element {
  // Esc は最前面だけが受け取る（キー操作はトリガー側で処理しているので、ここは Esc の登録だけ）
  useLayer(props.listRef, props.onClose);
  return (
    <ul ref={props.listRef} id={props.id} className="select-list" role="listbox" aria-label={props.label}>
      {props.options.map((o, i) => (
        <li
          key={o.value}
          id={`${props.id}-${i}`}
          role="option"
          aria-selected={o.value === props.value}
          className={i === props.active ? 'active' : ''}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => props.onPick(i)}
        >
          {o.label}
        </li>
      ))}
    </ul>
  );
}
