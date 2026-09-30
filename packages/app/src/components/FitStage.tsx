import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { STAGE_H, STAGE_W } from '../layout.ts';

/**
 * PC の投稿・回答・集計の画面の器（17 章。2026-09-29 さつき: 必ず 1 画面に収め、各要素の比率を常に一定に）。
 * 中身は設計の大きさ（STAGE_W × STAGE_H）で組み、ヘッダーの下の領域に収まる倍率で全体を同じ比率で拡大縮小する
 * （CSS の zoom。レイアウトごと縮むので、マウスの座標や要素の位置もそのまま使える）。ページはスクロールしない。
 * 長いもの（Hand History・席の表など）は、その枠の中だけでスクロールする。
 * 倍率が下限（layout.ts の FIT_MIN_ZOOM）を下回る画面では、この器は使わずスマホの構成になる（F-033）。
 */
export function FitStage(props: { className: string; children: ReactNode }): JSX.Element {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = (): void => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setScale(Math.min(width / STAGE_W, height / STAGE_H));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="fit-outer">
      <div className={`fit-stage ${props.className}`} style={{ zoom: scale }}>
        {props.children}
      </div>
    </div>
  );
}
