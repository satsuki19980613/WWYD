/**
 * スクロールバーをスクロールしている間だけ見せる（2026-09-30 さつき。見た目は styles/scrollbar.css）。
 * どこかがスクロールしたら、その要素（ページは html）に `is-scrolling` を付け、止まって少ししたら外す。
 * scroll は泡立たないので、document で捕まえる（capture）。
 */
const HIDE_AFTER_MS = 900;
const CLASS = 'is-scrolling';

export function installScrollIndicator(doc: Document = document): () => void {
  const timers = new WeakMap<Element, number>();
  const onScroll = (e: Event): void => {
    const el = e.target === doc ? doc.documentElement : e.target;
    if (!(el instanceof Element)) return;
    el.classList.add(CLASS);
    const prev = timers.get(el);
    if (prev !== undefined) window.clearTimeout(prev);
    timers.set(
      el,
      window.setTimeout(() => {
        el.classList.remove(CLASS);
        timers.delete(el);
      }, HIDE_AFTER_MS),
    );
  };
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => doc.removeEventListener('scroll', onScroll, { capture: true });
}
