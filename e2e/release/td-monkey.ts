/**
 * リリース前の総合テスト T-D（モンキーテスト）の部品（docs/release-test-plan.md §3 D）。
 * 種（seed）を決めた擬似乱数（mulberry32）で操作を選び、毎手の点検で不変条件の違反を集める。
 * 本物のバックエンドにはつながない（e2e/fakeBackend.ts の偽の応答＋通信の失敗・遅延の混ぜ込み）。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { aggregateHex, detailJson, paintHexOf, paintOf } from '../../packages/app/src/answer/detailFixtures.ts';
import { hmw, hs1, hs1bb, hs3, type Raw } from '../../packages/core/src/post/postFixtures.ts';
import { DATA, DUPLICATE, fakeBackend, UID, type Backend } from '../fakeBackend.ts';

export const ID = '00000000-0000-4000-8000-000000000001';
export const FN = 'http://fn.e2e.test';

// ---------------------------------------------------------------------------------------------
// 擬似乱数（依存を足さない）
// ---------------------------------------------------------------------------------------------

export type Rng = {
  next(): number;
  int(n: number): number;
  range(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  /** 重み付きの選択 */
  weighted<T>(xs: readonly (readonly [T, number])[]): T;
};

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  return {
    next,
    int,
    range: (lo, hi) => lo + int(hi - lo + 1),
    chance: (p) => next() < p,
    pick: (xs) => xs[int(xs.length)] as never,
    weighted: (xs) => {
      const total = xs.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [x, w] of xs) {
        r -= w;
        if (r < 0) return x;
      }
      return (xs[xs.length - 1] as readonly [never, number])[0];
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 画面の種類と大きさ
// ---------------------------------------------------------------------------------------------

export type ScreenId = 'list' | 'post' | 'answer' | 'result' | 'drafts' | 'legal' | 'chrome' | 'ocr';
export const SCREENS: readonly ScreenId[] = ['list', 'post', 'answer', 'result', 'drafts', 'legal', 'chrome'];

export type SizeClass = 'pc1280' | 'pc1024' | 'sp';
export const SIZES: Record<SizeClass, { width: number; height: number }> = {
  pc1280: { width: 1280, height: 900 },
  pc1024: { width: 1024, height: 640 },
  sp: { width: 412, height: 915 },
};

const RESIZE: Record<'pc' | 'sp', readonly { width: number; height: number }[]> = {
  pc: [
    { width: 1280, height: 900 },
    { width: 1024, height: 640 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1100, height: 600 },
    { width: 760, height: 900 },
    { width: 690, height: 800 },
  ],
  sp: [
    { width: 412, height: 915 },
    { width: 375, height: 667 },
    { width: 360, height: 640 },
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 915, height: 412 },
    { width: 800, height: 600 },
  ],
};

// ---------------------------------------------------------------------------------------------
// 入力文字列（でたらめ）
// ---------------------------------------------------------------------------------------------

const WEIRD: readonly string[] = [
  '',
  ' ',
  '     ',
  '\t',
  '😀🎉🃏♠♥♦♣',
  '👨‍👩‍👧‍👦🏳️‍🌈',
  'é̂̃̄̅̆'.repeat(15),
  'Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A',
  '‮evil‬ rtl',
  'مرحبا بالعالم 123',
  'שלום עולם',
  '<script>window.__xss=1</script>',
  '"><img src=x onerror="window.__xss=1">',
  "'; drop table posts;--",
  '-5',
  '-0',
  '-1000',
  '1e999',
  'Infinity',
  '0x1F',
  '１２３',
  '９９９９.９９',
  '999999999999999999999',
  '0.00001',
  '0,5',
  '1.2.3',
  '--',
  '.',
  '+',
  '\n\r\n',
  '%s%d%n',
  '{{7*7}}',
  '${1+1}',
  '0'.repeat(60),
  'a'.repeat(10000),
  '長'.repeat(50),
  '\u0000\u0001\u0002',
  '\ud800', // 単独のサロゲート
];

export function weirdText(rng: Rng): string {
  const r = rng.next();
  if (r < 0.35) return rng.pick(WEIRD);
  if (r < 0.6) return String(rng.range(-5, 300) / rng.pick([1, 1, 2, 10, 100, 1000]));
  if (r < 0.75) return String(rng.range(0, 400));
  if (r < 0.85) return String(rng.range(0, 99999)) + '.' + String(rng.range(0, 9999));
  return Array.from({ length: rng.range(1, 30) }, () => String.fromCodePoint(rng.range(0x20, 0x2fff))).join('');
}

const KEYS: readonly string[] = [
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Escape', 'Tab', 'Shift+Tab', 'Backspace', 'Delete',
  'Space', 'Home', 'End', 'PageUp', 'PageDown', 'Control+z', 'Control+y', 'Control+Shift+z', 'Control+a', 'Meta+z',
  'a', 'b', 'c', 'd', 'e', 'f', 'h', 'j', 'k', 'q', 's', 't', 'x', 'z', 'A', 'K', 'T', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  '?', '/', '[', ']', '-', '+', '.', ',', 'F5', 'ContextMenu',
];

// ---------------------------------------------------------------------------------------------
// 偽のバックエンドの構成（種から決める）
// ---------------------------------------------------------------------------------------------

export type NetMode = 'ok' | 'flaky' | 'down' | 'slow' | 'abort' | 'authdown';

export type Ctx = {
  be: Backend;
  net: { mode: NetMode; rng: Rng; failedRequests: number };
  /** create-post に届いた本文 */
  posts: { body: unknown; status: number }[];
  /** create-post の応答の種類 */
  fn: { mode: 'ok' | 'reject' | 'server500' | 'abort' | 'slow' };
  /** 直近の本文を返すときの検証の結果 */
  fnValidate?: (body: unknown) => { status: number; body: unknown };
  /** 遅延・失敗を混ぜている最中の要求の数（点検の前に 0 になるまで待つ） */
  inflight: number;
};

const AGG_SETS = [
  [paintOf({ AA: { call: 20 } }), paintOf({ AA: { call: 10, s1: 10 }, KK: { fold: 20 } })],
  [paintOf({ QQ: { fold: 5, s1: 15 }, AKs: { call: 20 } })],
  [] as ReturnType<typeof paintOf>[],
];

function rawOf(rng: Rng): Raw {
  return rng.pick([hs1bb, hs1, hs3, hmw])();
}

export type Cfg = {
  screen: ScreenId;
  start: string;
  raw: Raw;
  viewer: 'author' | 'answered' | 'unanswered';
  reduced: boolean;
  drafts: unknown;
  listRows: Record<string, unknown>[];
};

function listRowsOf(rng: Rng): Record<string, unknown>[] {
  const n = rng.pick([0, 1, 3, 6, 12]);
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
    created_at: '2026-09-28T10:00:00.123456+00:00',
    title: rng.chance(0.2) ? weirdText(rng).slice(0, 40) || 'x' : `試験の投稿 ${i + 1}`,
    fmt: rng.pick(['cash', 'mtt']),
    hero: rng.pick(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']),
    street: rng.pick(['flop', 'turn', 'river']),
    effective_stack: rng.pick([100, 22.5, 9999.999, 0.5]),
    answer_count: rng.pick([0, 1, 7, 400, 2000]),
    is_mine: rng.chance(0.4),
    answered_by_me: rng.chance(0.5),
    can_delete: rng.chance(0.4),
    players: rng.range(2, 6),
    board: ['Kh', '8d', '3c', '2s', '7h'].slice(0, rng.pick([3, 4, 5])),
  }));
}

function draftsOf(rng: Rng): unknown {
  const kind = rng.int(5);
  if (kind === 0) return null;
  if (kind === 1) return 'これはJSONではない{';
  const mk = (i: number): unknown => ({
    id: `d${i}`,
    savedAt: `2026-09-29T0${i}:00:00.000Z`,
    draft: rng.chance(0.3) ? { title: weirdText(rng).slice(0, 40), players: rng.range(1, 9), hero: 'XX', actions: [{ pos: 'ZZ' }], board: ['Zz'] } : { title: `下書き${i}`, players: rng.range(2, 6) },
  });
  if (kind === 2) return [mk(0)];
  if (kind === 3) return [mk(0), mk(1), mk(2)];
  return [mk(0), { id: 7 }, null, 'x', { id: 'q', savedAt: 'no', draft: 5 }];
}

export function makeCfg(screen: ScreenId, seed: number): Cfg {
  const rng = mulberry32(seed * 7919 + 13);
  const start = {
    list: '/',
    post: '/new',
    answer: `/s/${ID}/answer`,
    result: `/s/${ID}/result`,
    drafts: '/drafts',
    legal: seed % 2 === 0 ? '/terms' : '/privacy',
    chrome: rng.pick(['/', '/new', `/s/${ID}/result`, '/drafts', '/terms']),
    ocr: '/new',
  }[screen];
  return {
    screen,
    start,
    raw: rawOf(rng),
    viewer: screen === 'answer' ? 'unanswered' : screen === 'result' ? rng.pick(['answered', 'author', 'answered']) : rng.pick(['unanswered', 'answered', 'author']),
    // 視差効果を減らす設定（Replay の自動再生のタイマーで再現しにくくなるのを避ける）。4 種に 1 種は動かす
    reduced: seed % 4 !== 0,
    drafts: draftsOf(rng),
    listRows: listRowsOf(rng),
  };
}

function cors(route: Route): Record<string, string> {
  const req = route.request();
  return {
    'access-control-allow-origin': req.headers()['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*',
    'access-control-expose-headers': 'content-range, content-profile',
  };
}

/** ページに偽のバックエンドと、通信の失敗の混ぜ込み・create-post の応答を設定する */
export async function setupBackend(page: Page, cfg: Cfg, seed: number, validate?: Ctx['fnValidate']): Promise<Ctx> {
  const rng = mulberry32(seed * 104729 + 7);
  const detail = (viewer: Cfg['viewer'], withMine: boolean): Record<string, unknown> => {
    const aggSet = AGG_SETS[rng.int(AGG_SETS.length)] as ReturnType<typeof paintOf>[];
    const cells = aggregateHex(aggSet);
    return detailJson(cfg.raw, {
      viewer,
      id: ID,
      answerCount: aggSet.length,
      aggregate: cells,
      myAnswer: withMine || viewer === 'answered' ? { paint: paintHexOf({ AA: { call: 20 }, KK: { fold: 10, s1: 10 } }), size: rng.pick([null, 20, 6.5]) } : null,
      admin: rng.chance(0.2),
    });
  };
  const notFound = cfg.screen === 'answer' && rng.chance(0.05);
  const be = await fakeBackend(page, notFound ? null : detail(cfg.viewer, cfg.viewer === 'author'));
  be.listRows = cfg.listRows;
  be.afterInsert = detail('answered', true);
  be.insertError = rng.pick([null, null, null, DUPLICATE, { status: 500, body: { code: 'XX000', message: 'boom' } }, { status: 403, body: { code: '42501', message: 'denied' } }]);
  if (rng.chance(0.15)) be.deleteAccountError = { status: 500, body: { code: 'XX000', message: 'boom' } };

  const ctx: Ctx = { be, net: { mode: 'ok', rng: mulberry32(seed * 31 + 5), failedRequests: 0 }, posts: [], fn: { mode: 'ok' }, inflight: 0 };
  if (validate) ctx.fnValidate = validate;

  // 通信の失敗・遅延の混ぜ込み（あとから登録した route が先に呼ばれる。通すときは fallback で偽のバックエンドへ）。
  // 失敗は経路ごとの通し番号で決める（並行する要求の到着順で結果が変わらないように）。処理中の要求は ctx.inflight で数える
  const counts = new Map<string, number>();
  const roll = (path: string): number => {
    const n = (counts.get(path) ?? 0) + 1;
    counts.set(path, n);
    let h = seed;
    for (const ch of path) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    return mulberry32(h + n * 977).next();
  };
  await page.route(`${DATA}/**`, async (route) => {
    ctx.inflight++;
    try {
      const { mode } = ctx.net;
      if (route.request().method() === 'OPTIONS' || mode === 'ok' || mode === 'authdown') return await route.fallback();
      if (mode === 'slow') {
        await new Promise((r) => setTimeout(r, 1500));
        return await route.fallback().catch(() => undefined);
      }
      const r = roll(new URL(route.request().url()).pathname);
      if (mode === 'flaky' && r < 0.6) return await route.fallback();
      ctx.net.failedRequests++;
      if (mode === 'abort' || (mode === 'flaky' && r < 0.72)) return await route.abort('failed').catch(() => undefined);
      return await route.fulfill({
        status: r < 0.5 ? 500 : r < 0.8 ? 502 : 503,
        headers: { ...cors(route), 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'XX000', message: 'boom' }),
      });
    } finally {
      ctx.inflight--;
    }
  });
  await page.route('**/api/auth/**', async (route) => {
    if (ctx.net.mode !== 'authdown' || route.request().method() === 'OPTIONS') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    if (!/get-session|token/.test(path)) return route.fallback();
    ctx.net.failedRequests++;
    return route.fulfill({ status: 500, headers: { ...cors(route), 'content-type': 'application/json' }, body: '{"message":"boom"}' });
  });

  // create-post（Neon Function）
  await page.route(`${FN}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    const h = { ...cors(route), 'content-type': 'application/json' };
    if (ctx.fn.mode === 'abort') return route.abort('failed').catch(() => undefined);
    if (ctx.fn.mode === 'slow') {
      ctx.inflight++;
      await new Promise((r) => setTimeout(r, 1500));
      ctx.inflight--;
    }
    if (ctx.fn.mode === 'server500') {
      ctx.posts.push({ body, status: 500 });
      return route.fulfill({ status: 500, headers: { ...h, 'content-type': 'text/html' }, body: '<html>Bad gateway</html>' });
    }
    if (ctx.fn.mode === 'reject') {
      ctx.posts.push({ body, status: 422 });
      return route.fulfill({ status: 422, headers: h, body: JSON.stringify({ error: 'illegal_action', detail: { index: 2 } }) });
    }
    const v = ctx.fnValidate ? ctx.fnValidate(body) : { status: 201, body: { id: ID } };
    ctx.posts.push({ body, status: v.status });
    return route.fulfill({ status: v.status, headers: h, body: JSON.stringify(v.body) });
  });

  // 下書きの端末の保存（画面ごとに作り直すので addInitScript で最初に入れる）
  const key = `wwyd.drafts.v1.${UID}`;
  if (cfg.drafts !== null) {
    const value = typeof cfg.drafts === 'string' ? cfg.drafts : JSON.stringify(cfg.drafts);
    await page.addInitScript(([k, v]) => {
      try {
        if (localStorage.getItem(k as string) === null) localStorage.setItem(k as string, v as string);
      } catch {
        // 保存できない環境
      }
    }, [key, value]);
  }
  return ctx;
}

// ---------------------------------------------------------------------------------------------
// 毎手の点検（ページの中で 1 回の evaluate で行う。次の手の候補の要素もここで集める）
// ---------------------------------------------------------------------------------------------

export type Elt = {
  x: number;
  y: number;
  tag: string;
  role: string;
  label: string;
  input: boolean;
  disabled: boolean;
  modal: boolean;
  header: boolean;
  /** 同じ形の要素のまとまり（レンジ表のマスなど。数が多いものを選びすぎないための重み付けに使う） */
  grp: string;
};

export type Snapshot = {
  path: string;
  search: string;
  w: number;
  h: number;
  mobile: boolean;
  dialogs: number;
  menus: number;
  dtitles?: string;
  dbusy?: boolean;
  els: Elt[];
  problems: { kind: string; detail: string }[];
  stat: { a: number; b: number; h: number; s: boolean; t: boolean; done: boolean } | null;
};

/** ブラウザの中で動く。引数は無し（文字列で渡して評価する） */
export const SNAPSHOT_JS = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // フォントの読み込みと、走っている CSS の動き（遷移・アニメーション）が終わるのを待つ（座標が揺れると同じ種で同じ操作にならない）
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* 無視 */ }
  for (let i = 0; i < 12; i++) {
    const running = document.getAnimations().filter((a) => a.playState === 'running' && (a.effect && a.effect.getTiming().iterations !== Infinity));
    if (running.length === 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  // 起動中（BootScreen）は待つ。6 秒たっても出なければ真っ白として扱う
  for (let i = 0; i < 60 && !document.querySelector('.hdr'); i++) await new Promise((r) => setTimeout(r, 100));
  const problems = [];
  if (location.href === 'about:blank') return { path: 'about:blank', search: '', w: 0, h: 0, mobile: false, dialogs: 0, menus: 0, els: [], problems: [{ kind: 'about-blank', detail: '' }] };
  const w = window.innerWidth, h = window.innerHeight;
  const mobile = window.matchMedia('(max-width: 699.98px)').matches;
  const path = location.pathname;
  const root = document.getElementById('root');
  const text = document.body.innerText || '';
  // 1 真っ白でない
  if (!root || root.children.length === 0 || text.trim().length === 0 || !document.querySelector('.hdr')) {
    problems.push({ kind: 'blank', detail: 'root children=' + (root ? root.children.length : -1) + ' textLen=' + text.trim().length + ' hdr=' + !!document.querySelector('.hdr') });
  }
  // 2 「undefined」「NaN」「[object Object]」が画面に出ない（表示文字・aria-label・title・alt・placeholder）
  const bad = /(^|[^A-Za-z0-9_])(undefined|NaN)($|[^A-Za-z0-9_])|\\[object Object\\]/;
  const m = text.match(bad);
  if (m) {
    const i = text.indexOf(m[0]);
    problems.push({ kind: 'bad-text', detail: text.slice(Math.max(0, i - 40), i + 40).replace(/\\s+/g, ' ') });
  }
  for (const el of document.querySelectorAll('[aria-label],[title],[alt],[placeholder],[aria-valuetext]')) {
    for (const a of ['aria-label', 'title', 'alt', 'placeholder', 'aria-valuetext']) {
      const v = el.getAttribute(a);
      if (v && bad.test(v)) problems.push({ kind: 'bad-attr', detail: a + '=' + v.slice(0, 80) });
    }
  }
  // 3 はみ出し
  const de = document.documentElement;
  const fit = !mobile && (path === '/new' || /^\\/s\\/[^/]+\\/(answer|result)$/.test(path));
  if (de.scrollWidth > w + 1 || (document.body && document.body.scrollWidth > w + 1)) {
    problems.push({ kind: mobile ? 'overflow-x-sp' : 'overflow-x-pc', detail: 'scrollWidth=' + de.scrollWidth + '/' + document.body.scrollWidth + ' innerWidth=' + w + ' path=' + path });
  }
  if (fit && (de.scrollHeight > h + 1 || window.scrollY > 0 || (document.scrollingElement && document.scrollingElement.scrollTop > 0))) {
    problems.push({ kind: 'page-scroll-pc', detail: 'scrollHeight=' + de.scrollHeight + ' innerHeight=' + h + ' scrollY=' + window.scrollY + ' path=' + path });
  }
  if (window.__xss) problems.push({ kind: 'xss', detail: 'window.__xss が立った' });
  // 4 投稿の下書きが常に再生できる
  let stat = null;
  if (path === '/new') {
    try {
      const store = await import('/src/post/draftStore.ts');
      const dr = await import('/src/post/draft.ts');
      const ci = await import('/src/post/cardInput.ts');
      const raw = store.getDraft();
      const d = dr.settleActions(raw);
      stat = { a: d.actions.length, b: d.board.length, h: Object.values(d.hands).filter((x) => ci.handCards(x).length === 2).length, s: d.spotIndex !== null, t: d.title.length > 0, done: dr.phaseOf(dr.parseSettings(d).setup, d.actions, d.board).kind === 'done' };
      const ps = dr.parseSettings(d);
      if (ps.setup) {
        try {
          dr.phaseOf(ps.setup, d.actions, d.board);
          dr.actionLog(ps.setup, d.actions);
        } catch (e) { problems.push({ kind: 'draft-replay', detail: 'settled draft not replayable: ' + (e && e.code || '') + ' ' + (e && e.message) + ' actions=' + JSON.stringify(d.actions).slice(0, 300) }); }
        if (d.spotIndex !== null && !dr.candidates(d).some((c) => c.index === d.spotIndex)) problems.push({ kind: 'draft-spot', detail: 'spotIndex ' + d.spotIndex + ' is not a candidate' });
        try { dr.buildSubmission(d); } catch (e) { problems.push({ kind: 'draft-build', detail: 'buildSubmission threw ' + (e && e.message) }); }
      }
      const seen = new Map();
      const cards = [];
      for (const c of d.board) cards.push(['board', c]);
      for (const p of Object.keys(d.hands)) { if (!d.players || dr.seatsOf(d).includes(p)) for (const c of ci.handCards(d.hands[p])) cards.push([p, c]); }
      for (const [where, c] of cards) { if (seen.has(c)) problems.push({ kind: 'dup-card', detail: c + ' in ' + seen.get(c) + ' and ' + where }); else seen.set(c, where); }
      if (d.board.length > 5) problems.push({ kind: 'board-len', detail: 'board length ' + d.board.length });
    } catch (e) { problems.push({ kind: 'draft-inspect', detail: String(e && e.message || e).slice(0, 200) }); }
  }
  // 次の手の候補（見えていて、その位置で一番上にある要素）
  const sel = 'button, a[href], input, textarea, select, [role=button], [role=gridcell], [role=radio], [role=menuitem], [role=tab], [role=slider], [role=switch], [role=checkbox], [tabindex]:not([tabindex="-1"]), summary, label';
  const els = [];
  const seenEl = new Set();
  for (const el of document.querySelectorAll(sel)) {
    if (seenEl.has(el)) continue;
    seenEl.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const top = document.elementFromPoint(x, y);
    if (!top || !(el === top || el.contains(top) || top.contains(el))) continue;
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (el.target === '_blank' || !/^\\//.test(href)) continue;
    }
    if (el.tagName === 'INPUT' && el.type === 'file') continue;
    els.push({
      x, y, tag: el.tagName, role: el.getAttribute('role') || '', label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
      input: el.tagName === 'INPUT' || el.tagName === 'TEXTAREA', disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      modal: !!el.closest('[role=dialog],[role=alertdialog],[role=menu]'), header: !!el.closest('.hdr'),
      grp: el.tagName + '.' + String(el.className).slice(0, 30) + '<' + (el.parentElement ? String(el.parentElement.className).slice(0, 30) : ''),
    });
  }
  return {
    path, search: location.search, w, h, mobile,
    dialogs: document.querySelectorAll('[role=dialog],[role=alertdialog]').length,
    menus: document.querySelectorAll('[role=menu]').length,
    dtitles: [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]')].map((d) => (d.querySelector('.modal-title') ? d.querySelector('.modal-title').textContent : d.getAttribute('aria-label') || d.className)).join(' / ').slice(0, 120),
    dbusy: [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].some((d) => /(中…|読み取り)/.test(d.textContent || '')),
    els: els.slice(0, 400), problems, stat,
  };
})()`;

// ---------------------------------------------------------------------------------------------
// モンキー本体
// ---------------------------------------------------------------------------------------------

export type Violation = { kind: string; detail: string; step: number; op: string; path: string; viewport: string };

export type RunResult = {
  screen: ScreenId;
  size: SizeClass;
  seed: number;
  steps: number;
  violations: Violation[];
  /** 開発時の console（React の警告など）。net = 失敗を混ぜた通信の失敗（想定内） */
  consoleErrors: { text: string; step: number; net: boolean }[];
  ops: Record<string, number>;
  hung: boolean;
  ms: number;
  /** 操作列のハッシュ（同じ種の再実行で一致すれば、同じ操作を行った） */
  trace?: string;
  /** 到達した状態（探索の広さの目安） */
  cover: { maxActions: number; maxBoard: number; maxHands: number; handDone: number; spotSelected: number; titled: number; paths: string[]; dialogsMax: number; posts: number; inserts: number; deletes: number };
};

export const RESULT_FILE = process.env.TD_RESULT_FILE ?? 'td-monkey-results/results.jsonl';

export function saveResult(r: RunResult): void {
  mkdirSync(dirname(RESULT_FILE), { recursive: true });
  appendFileSync(RESULT_FILE, JSON.stringify(r) + '\n');
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let t: NodeJS.Timeout | undefined;
  const timer = new Promise<'timeout'>((r) => (t = setTimeout(() => r('timeout'), ms)));
  try {
    return await Promise.race([p, timer]);
  } finally {
    if (t) clearTimeout(t);
  }
}

const OPS = [
  ['click', 46],
  ['dblclick', 4],
  ['burst', 3],
  ['key', 14],
  ['type', 9],
  ['drag', 7],
  ['longpress', 3],
  ['hover', 3],
  ['scroll', 2],
  ['resize', 1.5],
  ['nav', 3],
  ['net', 2],
  ['escCheck', 2],
  ['wait', 1.5],
  ['storage', 0.5],
  ['home', 1],
] as const;

export async function runMonkey(page: Page, cfg: Cfg, ctx: Ctx, size: SizeClass, seed: number, steps: number, opts: { skipInitialGoto?: boolean } = {}): Promise<RunResult> {
  const t0 = Date.now();
  const rng = mulberry32(seed);
  const touch = size === 'sp';
  const cls = touch ? 'sp' : 'pc';
  const res: RunResult = { screen: cfg.screen, size, seed, steps: 0, violations: [], consoleErrors: [], ops: {}, hung: false, ms: 0, cover: { maxActions: 0, maxBoard: 0, maxHands: 0, handDone: 0, spotSelected: 0, titled: 0, paths: [], dialogsMax: 0, posts: 0, inserts: 0, deletes: 0 } };
  let step = 0;
  let lastOp = 'start';
  let prevOp = 'start';
  let netUntil = 0;

  page.on('dialog', (d) => void d.accept().catch(() => undefined));
  page.on('crash', () => addViolation('page-crash', 'ページ（レンダラー）が落ちた'));
  page.on('popup', (p) => void p.close().catch(() => undefined));
  page.on('pageerror', (e) => addViolation('pageerror', `${e.name}: ${e.message}`.slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text().slice(0, 400);
    const net = /Failed to load resource|net::ERR|Failed to fetch|NetworkError/i.test(text);
    res.consoleErrors.push({ text: net ? `${text} [${m.location().url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80)}]` : text, step, net });
  });

  const seen = new Set<string>();
  function addViolation(kind: string, detail: string, path = ''): void {
    const sig = `${kind}|${detail.replace(/\d+/g, '#').slice(0, 80)}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    const vp = page.viewportSize();
    res.violations.push({ kind, detail, step, op: lastOp, path, viewport: vp ? `${vp.width}x${vp.height}` : '?' });
  }

  // 操作の痕跡の要約（同じ種で同じ操作列になったかを見る）
  let traceHash = 0;
  const traceLog: string[] = [];
  const trace = (op: string): void => {
    if (process.env.TD_TRACE) traceLog.push(`${step} ${op} | ${s ? s.path + ' d=' + s.dialogs + ' n=' + s.els.length : '-'}`);
    for (let i = 0; i < op.length; i++) traceHash = (Math.imul(traceHash, 31) + op.charCodeAt(i)) | 0;
  };
  const count = (op: string): void => {
    res.ops[op] = (res.ops[op] ?? 0) + 1;
  };

  async function snap(): Promise<Snapshot | null> {
    await quiet();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await withTimeout(page.evaluate(SNAPSHOT_JS) as Promise<Snapshot>, 20000);
        if (r === 'timeout') {
          res.hung = true;
          addViolation('hang', 'evaluate が 20 秒返らない（ページが固まった）');
          return null;
        }
        return r;
      } catch (e) {
        const msg = String((e as Error).message);
        if (/Execution context was destroyed|navigation|Target closed|Frame was detached/i.test(msg) && attempt < 2) {
          await page.waitForLoadState('domcontentloaded').catch(() => undefined);
          continue;
        }
        addViolation('snapshot-failed', msg.slice(0, 200));
        return null;
      }
    }
    return null;
  }

  // 通信が静まるのを待つ（読み込みの途中で要素の数が揺れると、同じ種で同じ操作にならない）
  let pending = 0;
  page.on('request', () => pending++);
  page.on('requestfinished', () => pending--);
  page.on('requestfailed', () => pending--);
  async function quiet(): Promise<void> {
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 100 && (pending > 0 || ctx.inflight > 0); i++) await page.waitForTimeout(40);
      await page.waitForTimeout(30);
    }
  }
  async function gotoStart(): Promise<void> {
    await page.goto(cfg.start, { waitUntil: 'domcontentloaded' }).catch((e) => addViolation('goto-failed', String(e.message).slice(0, 200)));
  }

  if (!opts.skipInitialGoto) {
    await page.setViewportSize(SIZES[size]);
    if (cfg.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStart();
  }

  let s: Snapshot | null = await snap();
  const check = (snapshot: Snapshot): void => {
    const cv = res.cover;
    if (snapshot.stat) {
      cv.maxActions = Math.max(cv.maxActions, snapshot.stat.a);
      cv.maxBoard = Math.max(cv.maxBoard, snapshot.stat.b);
      cv.maxHands = Math.max(cv.maxHands, snapshot.stat.h);
      if (snapshot.stat.done) cv.handDone++;
      if (snapshot.stat.s) cv.spotSelected++;
      if (snapshot.stat.t) cv.titled++;
    }
    if (!cv.paths.includes(snapshot.path)) cv.paths.push(snapshot.path);
    cv.dialogsMax = Math.max(cv.dialogsMax, snapshot.dialogs);
    for (const p of snapshot.problems) if (p.kind !== 'about-blank') addViolation(p.kind, p.detail, snapshot.path);
    if (snapshot.problems.some((p) => p.kind === 'blank' || p.kind === 'about-blank')) needRecover = true;
  };
  let needRecover = false;
  if (s) check(s);

  const tapOrClick = async (x: number, y: number, clicks = 1): Promise<void> => {
    if (touch && rng.chance(0.5) && clicks === 1) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y, { clickCount: clicks });
  };

  for (step = 1; step <= steps && !res.hung; step++) {
    if (!s) {
      s = await snap();
      if (!s) break;
    }
    if (needRecover) {
      needRecover = false;
      lastOp = 'recover(after blank)';
      await gotoStart();
      s = await snap();
      if (s) check(s);
      continue;
    }
    // 通信の失敗は一定の手数で元に戻す
    if (ctx.net.mode !== 'ok' && step >= netUntil) ctx.net.mode = 'ok';
    // 元の画面から離れたら、ときどき戻す（その画面に集中する）
    if (s.path !== new URL(cfg.start, 'http://x').pathname && rng.chance(0.12)) {
      lastOp = 'home(away)';
      count('home');
      await gotoStart();
      s = await snap();
      if (s) check(s);
      continue;
    }
    const els = s.els;
    const modalEls = els.filter((e) => e.modal);
    prevOp = lastOp;
    const opName = rng.weighted(OPS as unknown as readonly (readonly [string, number])[]);
    // 要素を選ぶ（モーダル・メニューが出ていれば、その中を多めに。chrome は上のバーを多めに）
    const chooseEl = (filter?: (e: Elt) => boolean): Elt | null => {
      let pool = filter ? els.filter(filter) : els;
      if (pool.length === 0) return null;
      if (modalEls.length > 0 && rng.chance(0.85)) pool = pool.filter((e) => e.modal).filter((e) => (filter ? filter(e) : true));
      if (cfg.screen === 'chrome' && rng.chance(0.5)) {
        const hd = pool.filter((e) => e.header);
        if (hd.length > 0) pool = hd;
      }
      if (pool.length === 0) return null;
      // 同じ形の要素が多いほど 1 つあたりの重みを下げる（マス 169 個が押される手の大半にならないように）
      const size = new Map<string, number>();
      for (const e of pool) size.set(e.grp, (size.get(e.grp) ?? 0) + 1);
      return rng.weighted(pool.map((e) => [e, 1 / Math.sqrt(size.get(e.grp) ?? 1)] as const));
    };
    lastOp = opName;
    try {
      switch (opName) {
        case 'click': {
          const e = chooseEl();
          if (!e) break;
          lastOp = `click ${e.tag}[${e.role}] "${e.label}" @${e.x},${e.y}`;
          await tapOrClick(e.x, e.y);
          break;
        }
        case 'dblclick': {
          const e = chooseEl();
          if (!e) break;
          lastOp = `dblclick ${e.tag} "${e.label}" @${e.x},${e.y}`;
          await page.mouse.dblclick(e.x, e.y);
          break;
        }
        case 'burst': {
          const e = chooseEl();
          if (!e) break;
          const n = rng.range(3, 9);
          lastOp = `burst x${n} ${e.tag} "${e.label}" @${e.x},${e.y}`;
          for (let i = 0; i < n; i++) await page.mouse.click(e.x, e.y);
          break;
        }
        case 'key': {
          const k = rng.pick(KEYS);
          lastOp = `key ${k}`;
          const n = rng.chance(0.2) ? rng.range(2, 8) : 1;
          for (let i = 0; i < n; i++) await page.keyboard.press(k);
          break;
        }
        case 'type': {
          const e = chooseEl((x) => x.input);
          if (!e) {
            const k = rng.pick(KEYS);
            lastOp = `key(noinput) ${k}`;
            await page.keyboard.press(k);
            break;
          }
          const t = weirdText(rng);
          lastOp = `type ${JSON.stringify(t.slice(0, 30))}(${t.length}) into "${e.label}" @${e.x},${e.y}`;
          await page.mouse.click(e.x, e.y);
          if (rng.chance(0.7)) await page.keyboard.press('Control+a');
          if (t === '') await page.keyboard.press('Backspace');
          else if (t.length > 300 || rng.chance(0.6)) await page.keyboard.insertText(t);
          else await page.keyboard.type(t, { delay: 0 });
          if (rng.chance(0.3)) await page.keyboard.press(rng.pick(['Enter', 'Tab', 'Escape']));
          break;
        }
        case 'drag': {
          const a = chooseEl();
          if (!a) break;
          const same = els.filter((e) => e.tag === a.tag && e.role === a.role && !e.modal === !a.modal);
          const b = rng.chance(0.75) && same.length > 1 ? rng.pick(same) : (chooseEl() ?? a);
          const mid = rng.chance(0.4) ? chooseEl() : null;
          lastOp = `drag "${a.label}"@${a.x},${a.y} -> ${mid ? `"${mid.label}" -> ` : ''}"${b.label}"@${b.x},${b.y}`;
          await page.mouse.move(a.x, a.y);
          await page.mouse.down();
          if (mid) await page.mouse.move(mid.x, mid.y, { steps: rng.range(2, 6) });
          await page.mouse.move(b.x, b.y, { steps: rng.range(2, 8) });
          if (rng.chance(0.1)) await page.keyboard.press('Escape');
          await page.mouse.up();
          break;
        }
        case 'longpress': {
          const e = chooseEl();
          if (!e) break;
          lastOp = `longpress "${e.label}" @${e.x},${e.y}`;
          await page.mouse.move(e.x, e.y);
          await page.mouse.down();
          await page.waitForTimeout(rng.range(450, 900));
          if (rng.chance(0.3)) await page.mouse.move(e.x + rng.range(-40, 40), e.y + rng.range(-40, 40), { steps: 3 });
          await page.mouse.up();
          break;
        }
        case 'hover': {
          const e = chooseEl();
          if (!e) break;
          lastOp = `hover "${e.label}" @${e.x},${e.y}`;
          await page.mouse.move(e.x, e.y, { steps: 2 });
          break;
        }
        case 'scroll': {
          const x = rng.range(0, s.w - 1);
          const y = rng.range(0, s.h - 1);
          const dy = rng.pick([-800, -300, 300, 800, 3000]);
          lastOp = `wheel ${dy} @${x},${y}`;
          await page.mouse.move(x, y);
          await page.mouse.wheel(rng.chance(0.2) ? rng.pick([-200, 200]) : 0, dy);
          break;
        }
        case 'resize': {
          const v = rng.pick(RESIZE[cls]);
          lastOp = `resize ${v.width}x${v.height}`;
          await page.setViewportSize(v);
          break;
        }
        case 'nav': {
          const which = rng.weighted([['back', 4], ['forward', 3], ['reload', 2], ['goto', 2]] as const);
          lastOp = `nav ${which}`;
          if (which === 'back') await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => undefined);
          else if (which === 'forward') await page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => undefined);
          else if (which === 'reload') await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => addViolation('reload-failed', String(e.message).slice(0, 200)));
          else {
            const to = rng.pick(['/', '/new', '/drafts', '/terms', '/privacy', `/s/${ID}`, `/s/${ID}/answer`, `/s/${ID}/result`, '/s/x%2Fy', '/s/..', '/nope', '/?tab=mine&sort=answers&street=river', '/?tab=zzz&sort=%00&street=', '/s/' + 'a'.repeat(80)]);
            lastOp = `nav goto ${to}`;
            await page.goto(to, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined);
          }
          break;
        }
        case 'net': {
          const mode = rng.weighted([['flaky', 3], ['down', 2], ['slow', 2], ['abort', 1.5], ['authdown', 1]] as const);
          ctx.net.mode = mode;
          netUntil = step + rng.range(2, 10);
          if (rng.chance(0.4)) ctx.fn.mode = rng.pick(['reject', 'server500', 'abort', 'slow', 'ok', 'ok']);
          lastOp = `net ${mode} until ${netUntil} fn=${ctx.fn.mode}`;
          if (rng.chance(0.15)) {
            await page.context().setOffline(true);
            await page.waitForTimeout(150);
            await page.context().setOffline(false);
            lastOp += ' +offline';
          }
          break;
        }
        case 'escCheck': {
          if (s.dialogs + s.menus === 0) {
            lastOp = 'escCheck(no modal)';
            break;
          }
          lastOp = `escCheck dialogs=${s.dialogs} menus=${s.menus}`;
          const before = s.dialogs + s.menus;
          await page.keyboard.press('Escape');
          await page.waitForTimeout(80);
          const after = await snap();
          // 数が同じでも別のダイアログに替わった（例: 「下書きがいっぱいです」→「下書きに保存しますか」）なら、Esc は効いている
          // 「削除中…」「投稿中…」などの処理中は、Esc で閉じないのが仕様（二重送信を防ぐ）。読み取り中はキャンセルになるので除かない
          const busyDialog = s.dbusy === true && !/読み取り/.test(s.dtitles ?? '');
          if (after && !busyDialog && after.dialogs + after.menus >= before && after.dtitles === s.dtitles) {
            addViolation('esc-no-close', `Esc でモーダルが閉じない（${before} → ${after.dialogs + after.menus}）: ${s.dtitles ?? ''} 直前の操作 ${prevOp}`, after.path);
          }
          s = after;
          if (s) check(s);
          continue;
        }
        case 'wait':
          lastOp = 'wait';
          await page.waitForTimeout(rng.range(50, 400));
          break;
        case 'storage': {
          lastOp = 'storage(corrupt drafts)+reload';
          await page.evaluate(([k, v]) => localStorage.setItem(k as string, v as string), [`wwyd.drafts.v1.${UID}`, weirdText(rng)]).catch(() => undefined);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined);
          break;
        }
        case 'home':
          lastOp = 'home';
          await gotoStart();
          break;
      }
    } catch (e) {
      const msg = String((e as Error).message);
      // 操作の途中でページが移った・閉じたのは正常（点検は次の手で行う）
      if (!/Execution context was destroyed|navigation|Target closed|has been closed|Frame was detached/i.test(msg)) {
        addViolation('op-failed', `${lastOp}: ${msg.slice(0, 200)}`);
      }
    }
    count(opName);
    res.steps = step;
    trace(lastOp);
    s = await snap();
    if (s) check(s);
  }
  res.ms = Date.now() - t0;
  res.trace = (traceHash >>> 0).toString(16);
  if (process.env.TD_TRACE) appendFileSync(process.env.TD_TRACE, `# ${cfg.screen} ${size} ${seed}\n${traceLog.join('\n')}\n`);
  res.cover.posts = ctx.posts.length;
  res.cover.inserts = ctx.be.inserts.length;
  res.cover.deletes = ctx.be.deletes.length;
  return res;
}

/** 失敗のまとめを 1 行にする（報告用） */
export function summarize(r: RunResult): string {
  const v = r.violations.map((x) => `${x.kind}@${x.step}`).join(',');
  return `${r.screen}/${r.size}/seed=${r.seed} steps=${r.steps} ${(r.ms / 1000).toFixed(0)}s violations=[${v}] console=${r.consoleErrors.length}`;
}
