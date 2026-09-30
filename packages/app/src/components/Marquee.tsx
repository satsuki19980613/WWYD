import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useMediaQuery } from '../useMediaQuery.ts';

/** 流す速さ（px/秒）と、両端で止まる時間の割合（詳細仕様 18 章 §5.1） */
const SPEED = 36;
const HOLD = 0.18;

/**
 * 1 行に収まらない文字を横に流す（ヘッダーの投稿のタイトル。18 章 §5.1）。
 * 収まれば止めたまま。収まらなければ左端で止まる → 右端まで流れる → 止まる → 左端に戻る、を繰り返す。
 * 動きを減らす設定の端末では流さず、末尾を「…」で省略し、押すと全文を折り返して出す（もう一度押すと戻す）。
 */
export function Marquee(props: { text: string; className?: string }): JSX.Element {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const mode = over <= 1 && !expanded ? 'static' : reduced ? 'clip' : 'run';
  // 表示の形が変わると要素が作り直されるので、そのたびに測り直して監視し直す。全文を折り返している間は測らない
  useLayoutEffect(() => {
    const measure = (): void => {
      const b = box.current;
      const i = inner.current;
      if (!b || !i || expanded) return;
      setOver(Math.max(0, Math.ceil(i.scrollWidth - b.clientWidth)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [props.text, mode, expanded]);

  const cls = `mq${props.className ? ` ${props.className}` : ''}`;
  if (mode === 'static') {
    return (
      <span ref={box} className={cls}>
        <span ref={inner} className="mq-inner">
          {props.text}
        </span>
      </span>
    );
  }

  if (mode === 'clip') {
    return (
      <span ref={box} className={`${cls} mq-clip${expanded ? ' open' : ''}`}>
        <button type="button" className="mq-toggle" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          <span ref={inner} className="mq-inner">
            {props.text}
          </span>
        </button>
      </span>
    );
  }

  const moving = over / SPEED;
  const style = { '--mq-dist': `-${over}px`, '--mq-dur': `${(moving / (1 - 2 * HOLD)).toFixed(2)}s` } as CSSProperties;
  return (
    <span ref={box} className={`${cls} mq-run`} title={props.text}>
      <span ref={inner} className="mq-inner" style={style}>
        {props.text}
      </span>
    </span>
  );
}
