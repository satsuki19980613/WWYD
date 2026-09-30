import { useEffect, useSyncExternalStore } from 'react';

/**
 * History API の自前ルーター（詳細仕様 06 章 §0.1）。ハッシュは OAuth の戻り URL と衝突するので使わない。
 * パスの解釈（`parseRoute`）は純関数にして単体テストする。
 */

export type Route =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'drafts' }
  | { name: 'spot'; id: string }
  | { name: 'answer'; id: string }
  | { name: 'result'; id: string }
  | { name: 'terms' }
  | { name: 'privacy' }
  | { name: 'devUi' }
  | { name: 'notFound' };

export type RouteName = Route['name'];

/** スポット ID に使える文字（UUID 等）。それ以外は 404 にする。 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * パスを画面に対応づける。末尾のスラッシュは 1 つだけ許す（`/new/` → 投稿）。
 * `devUi` は開発時だけ（本番ビルドでは `allowDev = false` で 404）。
 */
export function parseRoute(pathname: string, allowDev = false): Route {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (path === '' || path === '/') return { name: 'list' };
  if (path === '/new') return { name: 'new' };
  if (path === '/drafts') return { name: 'drafts' };
  if (path === '/terms') return { name: 'terms' };
  if (path === '/privacy') return { name: 'privacy' };
  if (allowDev && path === '/_dev/ui') return { name: 'devUi' };

  const m = /^\/s\/([^/]+)(?:\/(answer|result))?$/.exec(path);
  if (m) {
    const id = safeDecode(m[1] ?? '');
    if (id !== null && ID_PATTERN.test(id)) {
      if (m[2] === 'answer') return { name: 'answer', id };
      if (m[2] === 'result') return { name: 'result', id };
      return { name: 'spot', id };
    }
  }
  return { name: 'notFound' };
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** 画面からパスを組み立てる（リンク先の生成に使う。parseRoute の逆）。 */
export function routePath(route: Route): string {
  switch (route.name) {
    case 'list':
      return '/';
    case 'new':
      return '/new';
    case 'drafts':
      return '/drafts';
    case 'spot':
      return `/s/${encodeURIComponent(route.id)}`;
    case 'answer':
      return `/s/${encodeURIComponent(route.id)}/answer`;
    case 'result':
      return `/s/${encodeURIComponent(route.id)}/result`;
    case 'terms':
      return '/terms';
    case 'privacy':
      return '/privacy';
    case 'devUi':
      return '/_dev/ui';
    case 'notFound':
      return '/404';
  }
}

// ---- 位置の購読 ----------------------------------------------------------------

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

function notify(): void {
  for (const l of listeners) l();
}

/** 現在の URL（パス＋クエリ）。 */
function snapshot(): string {
  return window.location.pathname + window.location.search;
}

// ---- 画面を離れる前の確認（投稿の下書き。14 章 §3.5） ----

/** 遷移を止める関数。止めたら true を返し、確認のあとで `navigate(to, { force: true })` を呼ぶ */
type Blocker = (to: string) => boolean;
let blocker: Blocker | null = null;
let lastHref = typeof window === 'undefined' ? '' : snapshot();

export function setNavigationBlocker(b: Blocker | null): void {
  blocker = b;
}

// 履歴の位置（history.state の i）。戻る・進むのどちらかを見分ける
let index = 0;
/** ブラウザの「戻る」を止めたときの行き先。確認のあとは積み直さずに本当に戻る（F-027: 戻る →「保存しない」→ もう一度戻ると元の画面が出ていた） */
let poppedBackTo: string | null = null;
/** 自分で起こした history.back() の popstate は止めない */
let bypassPop = false;

function stateIndex(state: unknown): number | null {
  const i = (state as { i?: unknown } | null)?.i;
  return typeof i === 'number' ? i : null;
}

// ブラウザの「戻る」: URL は既に変わっているので、止めるなら元の URL を積み直して確認を出す。
// 画面の購読より先に登録して、離れた画面を一瞬でも出さないようにする
if (typeof window !== 'undefined') {
  const initial = stateIndex(window.history.state);
  if (initial === null) window.history.replaceState({ i: 0 }, '');
  else index = initial;
  window.addEventListener('popstate', (e) => {
    const to = snapshot();
    const i = stateIndex(e.state);
    if (bypassPop) {
      bypassPop = false;
      lastHref = to;
      if (i !== null) index = i;
      return;
    }
    if (blocker && to !== lastHref && blocker(to)) {
      const back = i !== null && i < index;
      index = (i ?? index - 1) + 1;
      window.history.pushState({ i: index }, '', lastHref);
      poppedBackTo = back ? to : null;
      return;
    }
    poppedBackTo = null;
    lastHref = to;
    if (i !== null) index = i;
  });
}

/** アプリ内の遷移。`replace` は振り分け（`/s/:id` → answer / result）に使う。`force` は確認を済ませた遷移 */
export function navigate(to: string, opts: { replace?: boolean; force?: boolean } = {}): void {
  if (to === snapshot()) return;
  if (!opts.force && blocker?.(to)) return;
  if (opts.force && !opts.replace && poppedBackTo === to) {
    // 止めた「戻る」の続き: 積み直した分から 1 つ戻る（新しく積むと、次の「戻る」で元の画面に戻ってしまう）
    poppedBackTo = null;
    bypassPop = true;
    window.history.back();
    return;
  }
  poppedBackTo = null;
  if (opts.replace) window.history.replaceState({ i: index }, '', to);
  else window.history.pushState({ i: ++index }, '', to);
  lastHref = snapshot();
  notify();
}

export function useLocation(): { pathname: string; search: string } {
  const href = useSyncExternalStore(subscribe, snapshot, snapshot);
  const q = href.indexOf('?');
  return q < 0 ? { pathname: href, search: '' } : { pathname: href.slice(0, q), search: href.slice(q) };
}

export function useRoute(): Route {
  const { pathname } = useLocation();
  return parseRoute(pathname, import.meta.env.DEV);
}

/** 画面が切り替わったら先頭へスクロールする（ブラウザの戻るでは復元に任せる）。 */
export function useScrollTopOnNavigate(pathname: string): void {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}
