import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLayer, useOutsidePress } from '../components/useLayer.ts';
import { flickDirection, keyFromKeyboard, RANK_FLICK, SUIT_FLICK, SUIT_SYMBOL, type CardKey, type FlickDir } from './cardInput.ts';

/**
 * カードキーボード（06 章 §3.5）。画面下部に固定して出す。
 *   7 8 9 [Q]      絵札は タップ / 上 / 左 / 下 = Q / K / T / J
 *   4 5 6 [Q]
 *   A 2 3 [♠]      ♠ は タップ / 上 / 左 / 下 = ♠ / ♥ / ♦ / ♣
 *   [C ][ ⌫ ] [♠]
 * フリックのキーは右端の列なので、右（外側）には割り当てない。キーの面に払う先の文字を小さく出す。
 * 閉じる: 「完了」、キーボード外のタップ（`data-keep-open` の要素は除く）、Esc。パソコンのキーでも打てる。
 */
export function CardKeyboard(props: { seat: string; onKey: (key: CardKey) => void; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = useRef(props.onKey);
  onKey.current = props.onKey;
  useLayer(ref, props.onClose);
  useOutsidePress([ref], props.onClose, true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = keyFromKeyboard(e.key);
      if (!k) return;
      e.preventDefault();
      onKey.current(k);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const press = (k: CardKey) => () => props.onKey(k);

  return (
    <div ref={ref} className="ckb" role="group" aria-label="カードキーボード">
      <div className="ckb-head">
        <span className="ckb-seat">{props.seat}</span>
        <button type="button" className="btn ghost auto ckb-done" onClick={props.onClose}>
          完了
        </button>
      </div>
      <div className="ckb-grid">
        {['7', '8', '9', '4', '5', '6', 'A', '2', '3'].map((k) => (
          <KeyButton key={k} label={k} onPress={press(k)} />
        ))}
        <div className="ckb-edit">
          <KeyButton label="C" aria="ハンドを消す" onPress={press('C')} />
          <KeyButton label="⌫" aria="1 文字消す" onPress={press('BS')} />
        </div>
        <FlickKey className="rank" map={RANK_FLICK} render={(v) => v} label="Q（フリックで K T J）" onKey={props.onKey} />
        <FlickKey
          className="suit"
          map={SUIT_FLICK}
          render={(v) => SUIT_SYMBOL[v] ?? ''}
          label="スート（フリックで ♥ ♦ ♣）"
          onKey={props.onKey}
        />
      </div>
    </div>
  );
}

function KeyButton(props: { label: string; aria?: string; onPress: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="ckb-key"
      aria-label={props.aria ?? props.label}
      // フォーカスを移さない（入力中の欄の表示を保つ）
      onPointerDown={(e) => e.preventDefault()}
      onClick={props.onPress}
    >
      {props.label}
    </button>
  );
}

const ORDER: FlickDir[] = ['tap', 'up', 'right', 'down', 'left'];

/**
 * フリックのキー。押して 150ms、または 5px を超えて動かすとポップアップを出す。
 * 方向は移動量 25px 超で判定。離したときの方向の値を入力する（割り当ての無い方向は何もしない）。
 */
function FlickKey(props: {
  className: string;
  map: Record<FlickDir, string | null>;
  render: (v: string) => string;
  label: string;
  onKey: (k: CardKey) => void;
}): JSX.Element {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [popup, setPopup] = useState(false);
  const [dir, setDir] = useState<FlickDir>('tap');
  const keyRef = useRef<HTMLButtonElement>(null);

  const reset = (): void => {
    window.clearTimeout(timer.current);
    start.current = null;
    setPopup(false);
    setDir('tap');
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    try {
      // キーの外へ指が出ても追い続ける（取れなくても入力はできる）
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 何もしない
    }
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDir('tap');
    timer.current = window.setTimeout(() => setPopup(true), 150);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) > 5) setPopup(true);
    setDir(flickDirection(dx, dy));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const v = props.map[flickDirection(e.clientX - s.x, e.clientY - s.y)];
    reset();
    if (v) props.onKey(v);
  };

  return (
    <div className={`ckb-flick ${props.className}`}>
      <button
        ref={keyRef}
        type="button"
        className="ckb-key"
        aria-label={props.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        // キーボード操作（Enter / Space）ではタップの値
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const v = props.map.tap;
            if (v) props.onKey(v);
          }
        }}
      >
        {/* 面: 中央にタップの値、払う方向に小さく（上・左・下） */}
        {ORDER.map((d) => {
          const v = props.map[d];
          if (!v) return null;
          return (
            <span key={d} className={`ckb-face ckb-face-${d} s-${v}`} aria-hidden="true">
              {props.render(v)}
            </span>
          );
        })}
      </button>
      {popup && (
        <div className="ckb-pop" aria-hidden="true">
          {ORDER.map((d) => {
            const v = props.map[d];
            if (!v) return null;
            return (
              <span key={d} className={`ckb-pop-${d} ${d === dir ? 'on' : ''} s-${v}`}>
                {props.render(v)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
