/**
 * Villain・MTT の情報（P11）のモンキーテスト T5 の部品（docs/villain-reads-test-plan.md §3 T5）。
 * 前回（リリース前）の T-D（td-monkey.ts）の作りを写し、Villain・MTT の欄と回答・集計画面の Villain の表示向けに変えた。
 * 種（seed）を決めた擬似乱数（mulberry32）で操作を選び、毎手の点検で不変条件の違反を集める。
 * 本物のバックエンドにはつながない（e2e/fakeBackend.ts の偽の応答＋通信の失敗・遅延の混ぜ込み）。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { aggregateHex, detailJson, paintHexOf, paintOf } from '../../packages/app/src/answer/detailFixtures.ts';
import { type Raw } from '../../packages/core/src/post/postFixtures.ts';
import { DATA, DUPLICATE, fakeBackend, UID, type Backend } from '../fakeBackend.ts';
import { entryCheckRaise, hasVisibleRead, readLine, tendencyChips } from '../../packages/app/src/reads/readsModel.ts';
import type { Action, Pos, VillainReads } from '../../packages/core/src/index.ts';
import { postableDraft, serverJudge, type Built } from './t5Gen.ts';

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

export type ScreenId = 'post' | 'mtt' | 'answer' | 'result' | 'storage';
export const SCREENS: readonly ScreenId[] = ['post', 'mtt', 'answer', 'result', 'storage'];

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

export type Zone = 'villain' | 'mtt' | 'reads' | 'struct' | 'nav' | '';

export type Cfg = {
  screen: ScreenId;
  start: string;
  /** 投稿できるランダムな下書き（Villain・MTT の Read 入り）と、その本文 */
  built: Built;
  raw: Raw;
  /** 回答・集計の画面に返す villain_reads と mtt（形の違うものも混ぜる） */
  vr: unknown;
  mtt: unknown;
  /** vr・mtt が core の検証を通る形か（通る形のときだけ、表示の中身を突き合わせる） */
  wellFormed: boolean;
  viewer: 'author' | 'answered' | 'unanswered';
  reduced: boolean;
  /** localStorage に最初から入れる値（鍵 → 文字列） */
  storage: Record<string, string>;
  /** 手を打つときに多めに狙う場所 */
  zone: Zone;
  /** 投稿画面で、下書きを入れた状態（Hand・Spot 選択済み・Read 入り）から始めるか */
  inject: boolean;
};

const LONG_TITLES = [
  'とても長いタイトルがヘッダーに収まらないときは横に流れて全文を見せる。とても長いタイトルがヘッダーに収まらないときは横に流れて全文を見せる',
  'A'.repeat(200),
  '😀🎉🃏♠♥♦♣'.repeat(12),
  'BTN vs BB の SRP、ターンでチェックレイズを受けた場面 '.repeat(3),
  '　',
  'x',
  '<b>tag</b>&amp; "quote"',
];

const BAD_VR: unknown[] = [
  null,
  'x',
  5,
  [],
  { BTN: 'x' },
  { BTN: { memo: 'old memo', conf: 50, agg: 77 } },
  { ZZ: { vpip: 1 } },
  { SB: { reads: [{}] } },
  { SB: { reads: 'x' } },
  { UTG: { vpip: '1' } },
  { BB: { vpip: 10, pfr: 99 } },
  { BTN: { reads: [{ scope: 'spot', street: 'river', action: 'cbet', texture: null, runout: null, size: null, lean: 'over', strong: false }] } },
  { CO: { reads: [{ scope: 'general', street: 'flop', action: 'cbet', texture: { high: 'zz' }, runout: null, size: 'huge', lean: 'value', strong: 'yes' }] } },
  { BTN: { vpip: 1e9, pfr: -3, agg: 99, image: 2.5, sample: 4 } },
  Object.fromEntries(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'].map((p) => [p, { memo: 'x'.repeat(2000) }])),
];
const BAD_MTT: unknown[] = [
  'x',
  5,
  [],
  { speed: 'x' },
  { speed: 500 },
  { avg: -1 },
  { rank: 99, left: 3 },
  { stage: 'bubble', kind: 'pko' },
  { rank: 1.5, prize: 'zzz' },
];

export function makeCfg(screen: ScreenId, seed: number): Cfg {
  const rng = mulberry32(seed * 7919 + 13);
  const screenNo = SCREENS.indexOf(screen);
  const built = postableDraft(seed, screenNo + 1, { withReads: true, needCands: rng.chance(0.85), mtt: screen === 'mtt' ? true : rng.chance(0.5) });
  const raw: Raw = { ...built.body, title: rng.chance(0.25) ? rng.pick(LONG_TITLES) : (built.body.title as string) };
  let vr: unknown = raw.villain_reads ?? {};
  let mtt: unknown = raw.mtt ?? null;
  let wellFormed = true;
  if (screen === 'answer' || screen === 'result') {
    const k = rng.next();
    if (k < 0.12) {
      vr = rng.pick(BAD_VR);
      wellFormed = false;
    } else if (k < 0.2) {
      vr = {};
    }
    const m = rng.next();
    if (m < 0.1) {
      mtt = rng.pick(BAD_MTT);
      wellFormed = false;
    } else if (m < 0.2) mtt = null;
  }
  const start = {
    post: '/new',
    mtt: '/new',
    answer: `/s/${ID}/answer`,
    result: `/s/${ID}/result`,
    storage: rng.pick(['/new', '/drafts', '/new']),
  }[screen];
  const zone = { post: 'villain', mtt: 'mtt', answer: 'reads', result: 'reads', storage: rng.pick(['villain', 'villain', '']) }[screen] as Zone;
  return {
    screen,
    start,
    built,
    raw,
    vr,
    mtt,
    wellFormed,
    viewer: screen === 'answer' ? 'unanswered' : screen === 'result' ? rng.pick(['answered', 'author', 'answered']) : 'unanswered',
    // 視差効果を減らす設定（Replay の自動再生のタイマーで再現しにくくなるのを避ける）。4 種に 1 種は動かす
    reduced: seed % 4 !== 0,
    storage: screen === 'storage' ? storageOf(seed, built) : {},
    zone,
    inject: screen === 'post' || screen === 'mtt' ? seed % 4 !== 3 : screen === 'storage' && start === '/new',
  };
}

// ---------------------------------------------------------------------------------------------
// localStorage の壊れた値（T5-05）
// ---------------------------------------------------------------------------------------------

const PRESET_KEY = `wwyd.readPresets.${UID}`;
const PRESET_KEY_OLD = `wwyd.readPresets.v1.${UID}`;
const DRAFT_KEY = `wwyd.drafts.v1.${UID}`;

/** 前の版（Memo・conf・0〜100 の agg）や壊れた形を混ぜた下書き 1 件 */
function hostileDraft(rng: Rng, built: Built, i: number): unknown {
  const d = JSON.parse(JSON.stringify(built.draft)) as Record<string, unknown>;
  const k = rng.int(9);
  const seat = (built.seats[0] ?? 'BB') as string;
  if (k === 0) d.reads = { [seat]: { memo: '古い Memo', conf: 2, agg: 77, vpip: 30 } };
  else if (k === 1) d.reads = 'これは object ではない';
  else if (k === 2)
    d.reads = {
      [seat]: {
        vpip: 30,
        pfr: 90,
        agg: 9,
        image: -1,
        sample: 1.5,
        general: [{ street: 'flop', action: 'turn_only', lean: 'x' }, null, 5, { street: 'pf', action: '3bet', texture: { high: 'a' }, runout: ['brick'], size: 'overbet', lean: 'value', strong: 'true' }],
      },
    };
  else if (k === 3) d.reads = { [seat]: { general: Array.from({ length: 10 }, () => ({ street: 'river', action: 'barrel', lean: 'under', strong: true })) } };
  else if (k === 4) d.mtt = { speed: 'x', rank: 12, left: '58', paid: [1], entries: null, avg: {}, prize: 'zzz' };
  else if (k === 5) d.mtt = 'str';
  else if (k === 6) d.mtt = { speed: 1e9, rank: '１２', left: '1e3', paid: ' ', entries: 'x'.repeat(10000), avg: '1.25', prize: 'top' };
  else if (k === 7) d.reads = { ZZ: { vpip: 1 }, [seat]: { spot: { street: 'river', action: 'cbet', lean: 'over', strong: false } } };
  else delete d.reads;
  return { id: `h${i}`, savedAt: `2026-09-30T0${i}:00:00.000Z`, draft: d };
}

function storageOf(seed: number, built: Built): Record<string, string> {
  const rng = mulberry32(seed * 6151 + 29);
  const out: Record<string, string> = {};
  const n = rng.pick([1, 2, 3, 3]);
  const list: unknown[] = Array.from({ length: n }, (_, i) => hostileDraft(rng, built, i));
  if (rng.chance(0.3)) list.push({ id: 7 }, null, 'x');
  const kind = rng.int(8);
  out[DRAFT_KEY] = kind === 0 ? 'これは JSON ではない{' : kind === 1 ? JSON.stringify({ not: 'array' }) : kind === 2 ? 'x'.repeat(200_000) : JSON.stringify(list);
  const pk = rng.int(9);
  const good = { id: 'p1', name: 'Fish', read: { vpip: 45, general: [{ street: 'flop', action: 'fold_cbet', texture: {}, runout: [], size: null, lean: 'over', strong: false }] } };
  const presetValue: string | null =
    pk === 0
      ? '{broken'
      : pk === 1
        ? JSON.stringify({ schema: 1, presets: [{ id: 'a', name: 'Old', read: { memo: 'x', vpip: 10 } }] })
        : pk === 2
          ? JSON.stringify({ schema: 2, presets: 'x' })
          : pk === 3
            ? JSON.stringify({ schema: 2, presets: [{ id: 1, name: 5 }, null, { id: 'z', name: '  ', read: {} }, { id: 'q', name: 'Q', read: 'x' }, good] })
            : pk === 4
              ? JSON.stringify({ schema: 2, presets: Array.from({ length: 60 }, (_, i) => ({ id: `id${i}`, name: `名前${i}`.repeat(9), read: { vpip: i, pfr: 101 } })) })
              : pk === 5
                ? 'y'.repeat(300_000)
                : pk === 6
                  ? JSON.stringify({ schema: 2, presets: [good, { ...good, id: 'p2', read: { vpip: 10, pfr: 80, general: [{ street: 'pf', action: 'cbet' }] } }] })
                  : null;
  if (presetValue !== null) out[PRESET_KEY] = presetValue;
  if (rng.chance(0.5)) out[PRESET_KEY_OLD] = JSON.stringify({ presets: [{ name: 'v1', read: { memo: 'x' } }] });
  return out;
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
    const d = detailJson(cfg.raw, {
      viewer,
      id: ID,
      answerCount: aggSet.length,
      aggregate: cells,
      myAnswer: withMine || viewer === 'answered' ? { paint: paintHexOf({ AA: { call: 20 }, KK: { fold: 10, s1: 10 } }), size: rng.pick([null, 20, 6.5]) } : null,
      admin: rng.chance(0.2),
    });
    // Villain・MTT の情報は、形の違うものも含めて、そのまま返す（detailJson は情報なしを {} / null に直すので上書きする）
    const hand = d.hand as Record<string, unknown>;
    hand.villain_reads = cfg.vr;
    hand.mtt = cfg.mtt;
    return d;
  };
  const notFound = cfg.screen === 'answer' && rng.chance(0.05);
  const be = await fakeBackend(page, notFound ? null : detail(cfg.viewer, cfg.viewer === 'author'));
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
  // （T5-05: 鍵が無いときだけ入れる。再読み込みのあとに、操作の結果を上書きしない）
  const entries = Object.entries(cfg.storage);
  if (entries.length > 0) {
    await page.addInitScript((kv) => {
      try {
        for (const [k, v] of kv as [string, string][]) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
      } catch {
        // 保存できない環境
      }
    }, entries);
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
  w: number;
  /** どの場所の要素か（villain: Villain の欄、mtt: MTT の欄と Game 形式、reads: 回答画面の Villain・MTT・History、struct: Hero・人数・Spot・Action の入れ直し、nav: ステップ） */
  zone: Zone;
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
  /** 投稿画面: 画面が送る本文（Spot を選んでいるときだけ） */
  subBody?: unknown;
  subOk?: boolean;
  /** 回答・集計画面: 開いているモーダルの Villain・MTT の表示 */
  rv?: { title: string; seats: { pos: string; chips: string[]; reads: string[]; none: boolean }[]; text: string }[];
  /** 回答・集計画面: 卓の席の印の数 */
  marks?: number;
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
  const mobile = window.matchMedia('(max-width: 926.98px), (max-height: 604.98px)').matches; // layout.ts の MOBILE_QUERY（F-033）
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
    problems.push({ kind: 'page-scroll-pc', detail: 'scrollHeight=' + de.scrollHeight + ' innerHeight=' + h + ' scrollY=' + window.scrollY + ' path=' + path + ' stage=' + !!document.querySelector('.fit-stage') + ' login=' + !!document.querySelector('.login, [class*=login]') + ' ' + (document.querySelector('.screen') ? document.querySelector('.screen').className.slice(0, 40) : 'no-screen') });
  }
  if (window.__xss) problems.push({ kind: 'xss', detail: 'window.__xss が立った' });
  // 4 投稿の下書きが常に再生できる
  let stat = null;
  let subBody;
  let subOk;
  if (path === '/new') {
    try {
      const store = await import('/src/post/draftStore.ts');
      const dr = await import('/src/post/draft.ts');
      const ci = await import('/src/post/cardInput.ts');
      const rm = await import('/src/reads/readsModel.ts');
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
        try { const bs = dr.buildSubmission(d); subOk = !!bs.ok; } catch (e) { problems.push({ kind: 'draft-build', detail: 'buildSubmission threw ' + (e && e.message) }); }
        try { if (d.spotIndex !== null) subBody = dr.submissionBody(d); } catch (e) { problems.push({ kind: 'draft-body', detail: 'submissionBody threw ' + (e && e.message) }); }
      }
      const seen = new Map();
      const cards = [];
      for (const c of d.board) cards.push(['board', c]);
      for (const p of Object.keys(d.hands)) { if (!d.players || dr.seatsOf(d).includes(p)) for (const c of ci.handCards(d.hands[p])) cards.push([p, c]); }
      for (const [where, c] of cards) { if (seen.has(c)) problems.push({ kind: 'dup-card', detail: c + ' in ' + seen.get(c) + ' and ' + where }); else seen.set(c, where); }
      if (d.board.length > 5) problems.push({ kind: 'board-len', detail: 'board length ' + d.board.length });
      // Villain の欄: 見えている席のボタンと 1 行の要約が下書きと合う（席は core の villainContext の席だけ）
      const vc = dr.villainContext(d);
      const heads = [...document.querySelectorAll('button.vr-head')];
      if (heads.length > 0) {
        const shown = heads.map((h) => (h.getAttribute('aria-label') || '').replace(' の Villain の情報', ''));
        if (JSON.stringify(shown) !== JSON.stringify(vc.seats)) problems.push({ kind: 'villain-seats', detail: 'shown=' + shown.join(',') + ' expected=' + vc.seats.join(',') });
        for (const h of heads) {
          const pos = (h.getAttribute('aria-label') || '').replace(' の Villain の情報', '');
          const sum = (h.querySelector('.vr-sum') || {}).textContent || '';
          // 要約は候補に当たる Spot Read だけを数える（V-012）
          const want = rm.seatSummary(d.reads[pos], vc.cands.filter((c) => c.pos === pos)) || '—';
          if (sum !== want) problems.push({ kind: 'summary-mismatch', detail: pos + ' shown=' + JSON.stringify(sum) + ' expected=' + JSON.stringify(want) });
        }
        // 開いている席の Spot Read: 候補と選んでいる Lean が下書きと合う
        const openHead = heads.find((h) => h.getAttribute('aria-expanded') === 'true');
        if (openHead) {
          const pos = (openHead.getAttribute('aria-label') || '').replace(' の Villain の情報', '');
          const cands = vc.cands.filter((c) => c.pos === pos);
          const body = openHead.closest('li') && openHead.closest('li').querySelector('.vr-body');
          const hasSpotBox = !!(body && [...body.querySelectorAll('.mono-lbl')].some((e) => e.textContent === 'Spot Read'));
          if (hasSpotBox !== (cands.length > 0)) problems.push({ kind: 'spot-box', detail: pos + ' box=' + hasSpotBox + ' cands=' + cands.length });
          const seatRead = d.reads[pos] || {};
          // Spot Read の Lean が押されているのに、その Action が候補に無い（送られない）状態
          if (seatRead.spot && cands.length > 0 && !cands.some((c) => c.street === seatRead.spot.street && c.action === seatRead.spot.action)) {
            const pressed = body ? body.querySelectorAll('.vr-read')[0] : null;
            const on = pressed ? pressed.querySelectorAll('[aria-pressed=true]').length : 0;
            if (on > 0) problems.push({ kind: 'spot-stale', detail: pos + ' spot=' + JSON.stringify(seatRead.spot) + ' cands=' + cands.map((c) => c.street + ':' + c.action).join(',') });
          }
        }
      }
      // 送る本文: villain_reads・mtt は、あれば中身がある。Cash に mtt は無い
      if (subBody) {
        if ('villain_reads' in subBody && (typeof subBody.villain_reads !== 'object' || subBody.villain_reads === null || Object.keys(subBody.villain_reads).length === 0)) problems.push({ kind: 'body-empty-reads', detail: JSON.stringify(subBody.villain_reads) });
        if ('mtt' in subBody && (typeof subBody.mtt !== 'object' || subBody.mtt === null || Object.keys(subBody.mtt).length === 0)) problems.push({ kind: 'body-empty-mtt', detail: JSON.stringify(subBody.mtt) });
        if ('mtt' in subBody && d.fmt !== 'mtt') problems.push({ kind: 'body-cash-mtt', detail: 'fmt=' + d.fmt });
        for (const k of Object.keys(subBody.villain_reads || {})) {
          if (!vc.seats.includes(k)) problems.push({ kind: 'body-seat', detail: k + ' is not a Villain seat' });
        }
      }
      // MTT の数の欄: 赤い枠（aria-invalid）は parseMtt の読めない欄と同じ
      const mttSec = document.querySelector('.mtt-fields');
      if (mttSec) {
        const bad = rm.parseMtt(d.mtt).invalid;
        for (const el of mttSec.querySelectorAll('input')) {
          const lbl = (el.labels && el.labels[0] ? el.labels[0].textContent : '') || '';
          const key = Object.keys(rm.MTT_FIELD_LABEL).find((k) => rm.MTT_FIELD_LABEL[k] === lbl);
          const inv = el.getAttribute('aria-invalid') === 'true';
          if (key && inv !== bad.includes(key)) problems.push({ kind: 'mtt-invalid-mismatch', detail: key + ' aria-invalid=' + inv + ' value=' + JSON.stringify(el.value).slice(0, 40) });
        }
        const sp = document.querySelector('[role=slider][aria-label="Tournament Type"]');
        if (sp) {
          const now = sp.getAttribute('aria-valuenow');
          const want = d.mtt.speed === null ? null : String(d.mtt.speed);
          if (now !== want) problems.push({ kind: 'mtt-speed-mismatch', detail: 'aria-valuenow=' + now + ' draft=' + d.mtt.speed });
        }
      }
    } catch (e) { problems.push({ kind: 'draft-inspect', detail: String(e && e.message || e).slice(0, 200) }); }
  }
  // Slider（VPIP・PFR）の値と aria-valuenow・範囲
  for (const sl of document.querySelectorAll('[role=slider]')) {
    const now = sl.getAttribute('aria-valuenow');
    const max = Number(sl.getAttribute('aria-valuemax'));
    const nm = sl.getAttribute('aria-label') || '';
    if (['VPIP', 'PFR', 'Tournament Type'].includes(nm) && now !== null && (!/^[0-9]+$/.test(now) || Number(now) > max || Number(now) < 0)) problems.push({ kind: 'slider-range', detail: (sl.getAttribute('aria-label') || '') + ' aria-valuenow=' + now + ' max=' + max });
    const txt = sl.getAttribute('aria-valuetext') || '';
    if (now === null && txt !== '未入力') problems.push({ kind: 'slider-text', detail: (sl.getAttribute('aria-label') || '') + ' valuetext=' + txt });
  }
  // 回答・集計画面: 開いているモーダルの Villain・MTT の表示と、卓の席の印
  let rv, marks;
  if (/^\\/s\\/[^/]+\\/(answer|result)$/.test(path)) {
    marks = document.querySelector('.ptable') ? document.querySelectorAll('.pseat-read').length : undefined;
    rv = [];
    for (const dlg of document.querySelectorAll('[role=dialog]')) {
      if (!dlg.querySelector('.rv-card, .rv-seats, .rv-list, .rv-all')) continue;
      const title = (dlg.querySelector('.modal-title') || {}).textContent || dlg.getAttribute('aria-label') || '';
      const seats = [];
      const cardOf = (root) => ({
        chips: [...root.querySelectorAll('.rv-chip')].map((e) => e.textContent || ''),
        reads: [...root.querySelectorAll('.rv-read')].map((e) => e.textContent || ''),
      });
      const items = dlg.querySelectorAll('.rv-seat');
      if (items.length > 0) {
        for (const li of items) seats.push({ pos: ((li.querySelector('.rv-pos') || {}).textContent || '').trim(), none: li.classList.contains('none'), ...cardOf(li) });
      } else if (dlg.querySelector('.rv-card')) {
        seats.push({ pos: title.replace('Villain · ', '').trim(), none: false, ...cardOf(dlg) });
      }
      rv.push({ title, seats, text: dlg.innerText.slice(0, 600) });
    }
  }
  const zoneOf = (el) => {
    const sec = el.closest('section.pf-sec');
    const h = sec ? ((sec.querySelector('h2.sec-h') || {}).textContent || '').trim() : '';
    if (h === 'Villain') return 'villain';
    if (h === 'MTT') return 'mtt';
    const g = el.closest('[role=group]');
    if (g && g.getAttribute('aria-label') === 'Game 形式') return 'mtt';
    if (el.closest('nav[aria-label=ステップ]')) return 'nav';
    const lbl = (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (/Villain|^MTT$|^History$|^All Villains$/.test(lbl)) return 'reads';
    if (el.getAttribute('role') === 'radio' || (g && ['人数', 'Hero の Action'].includes(g.getAttribute('aria-label') || '')) || /戻す|入れ直|Undo|やり直/.test(lbl)) return 'struct';
    return '';
  };
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
      w: Math.round(r.width),
      zone: zoneOf(el),
      grp: el.tagName + '.' + String(el.className).slice(0, 30) + '<' + (el.parentElement ? String(el.parentElement.className).slice(0, 30) : ''),
    });
  }
  return {
    path, search: location.search, w, h, mobile,
    dialogs: document.querySelectorAll('[role=dialog],[role=alertdialog]').length,
    menus: document.querySelectorAll('[role=menu]').length,
    dtitles: [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]')].map((d) => (d.querySelector('.modal-title') ? d.querySelector('.modal-title').textContent : d.getAttribute('aria-label') || d.className)).join(' / ').slice(0, 120),
    dbusy: [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].some((d) => /(中…|読み取り)/.test(d.textContent || '')),
    els: els.slice(0, 400), problems, stat, subBody, subOk, rv, marks,
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
  /** 10 秒以上終わらなかった要求 */
  stuck: string[];
  /** 到達した状態（探索の広さの目安） */
  cover: { maxActions: number; maxBoard: number; maxHands: number; handDone: number; spotSelected: number; titled: number; paths: string[]; dialogsMax: number; posts: number; inserts: number; deletes: number; villainVisible: number; mttVisible: number; rvChecked: number; marksChecked: number; subJudged: number };
};

export const RESULT_FILE = process.env.T5_RESULT_FILE ?? 't5-monkey-results/results.jsonl';

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
  ['click', 38],
  ['dblclick', 4],
  ['burst', 3],
  ['key', 9],
  ['type', 9],
  ['drag', 4],
  ['slider', 8],
  ['sdrag', 6],
  ['longpress', 2],
  ['hover', 2],
  ['scroll', 2],
  ['resize', 1.5],
  ['nav', 2],
  ['net', 1.5],
  ['escCheck', 2],
  ['wait', 1],
  ['storage', 0.6],
  ['home', 0.5],
  ['struct', 5],
  ['primary', 3],
  ['reinject', 1.2],
  ['gotoZone', 5],
  ['readsTour', 7],
] as const;

const SLIDER_KEYS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Delete', 'Backspace', 'Enter', 'Escape', 'Tab', 'Shift+Tab', 'Space'];

const PRESET_KEYS = [`wwyd.readPresets.${UID}`, `wwyd.readPresets.v1.${UID}`, `wwyd.drafts.v1.${UID}`];

/** 投稿の画面に下書き（Hand・Spot 選択済み・Read 入り）を入れる（ページの中の下書きの保存に直接入れる） */
export async function injectDraft(page: Page, b: Built): Promise<void> {
  await page
    .evaluate(`(async () => {
      for (let i = 0; i < 50 && !document.querySelector('.hdr'); i++) await new Promise((r) => setTimeout(r, 100));
      const store = await import('/src/post/draftStore.ts');
      store.setDraft(${JSON.stringify(b.draft)});
    })()`)
    .catch(() => undefined);
}

/** 回答・集計画面の Villain の表示（席の印・モーダル）が、返した本文の情報と合うか（形が正しい情報のときだけ） */
export function checkView(snapshot: Snapshot, raw: Raw, vr: VillainReads): { kind: string; detail: string }[] {
  const out: { kind: string; detail: string }[] = [];
  if (!/^\/s\/[^/]+\/(answer|result)$/.test(snapshot.path)) return out;
  const hero = raw.hero as Pos;
  const seated = Object.keys(raw.stacks as Record<string, number>);
  if (snapshot.marks !== undefined) {
    const want = seated.filter((p) => p !== hero && hasVisibleRead(vr[p as Pos])).length;
    if (snapshot.marks !== want) out.push({ kind: 'marks-mismatch', detail: `◆ ${snapshot.marks} 個 / 期待 ${want} 個` });
  }
  const actions = raw.actions as Action[];
  for (const m of snapshot.rv ?? []) {
    for (const seat of m.seats) {
      const read = vr[seat.pos as Pos];
      const visible = hasVisibleRead(read);
      if (m.title === 'All Villains' && seat.none !== !visible) out.push({ kind: 'rv-none-mismatch', detail: `${seat.pos} none=${seat.none} visible=${visible}` });
      if (!read || !visible) continue;
      const wantChips = tendencyChips(read);
      if (JSON.stringify(seat.chips) !== JSON.stringify(wantChips)) out.push({ kind: 'rv-chips-mismatch', detail: `${seat.pos} shown=${seat.chips.join('|')} expected=${wantChips.join('|')}` });
      const entries = read.reads ?? [];
      if (seat.reads.length !== entries.length) out.push({ kind: 'rv-reads-count', detail: `${seat.pos} shown=${seat.reads.length} expected=${entries.length}` });
      entries.forEach((e, i) => {
        const a = readLine(e, false);
        const b = readLine(e, true);
        const xr = entryCheckRaise(e, seat.pos as Pos, hero, actions);
        const shown = seat.reads[i];
        if (shown !== a && shown !== b) out.push({ kind: 'rv-read-line', detail: `${seat.pos}#${i} shown=${shown} expected=${xr ? b : a}` });
      });
    }
  }
  return out;
}

export async function runMonkey(page: Page, cfg: Cfg, ctx: Ctx, size: SizeClass, seed: number, steps: number, opts: { skipInitialGoto?: boolean } = {}): Promise<RunResult> {
  let injected = 0;
  const t0 = Date.now();
  const rng = mulberry32(seed);
  const rng2 = mulberry32(seed * 3 + 11);
  const touch = size === 'sp';
  const cls = touch ? 'sp' : 'pc';
  const res: RunResult = { screen: cfg.screen, size, seed, steps: 0, violations: [], consoleErrors: [], ops: {}, hung: false, ms: 0, stuck: [], cover: { maxActions: 0, maxBoard: 0, maxHands: 0, handDone: 0, spotSelected: 0, titled: 0, paths: [], dialogsMax: 0, posts: 0, inserts: 0, deletes: 0, villainVisible: 0, mttVisible: 0, rvChecked: 0, marksChecked: 0, subJudged: 0 } };
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
  // 終わらない要求（ナビゲーションで捨てられた要求など）で待ちが伸びないように、3 秒より古い要求は数えない
  const open = new Map<object, { at: number; url: string }>();
  page.on('request', (r) => open.set(r, { at: Date.now(), url: r.url() }));
  page.on('requestfinished', (r) => open.delete(r));
  page.on('requestfailed', (r) => open.delete(r));
  const pendingNow = (): number => {
    const now = Date.now();
    let n = 0;
    for (const v of open.values()) if (now - v.at < 3000) n++;
    return n;
  };
  async function quiet(): Promise<void> {
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 75 && (pendingNow() > 0 || ctx.inflight > 0); i++) await page.waitForTimeout(40);
      await page.waitForTimeout(30);
    }
    const stuck = [...open.values()].filter((v) => Date.now() - v.at > 10_000);
    if (stuck.length > 0 && res.stuck.length < 5) res.stuck.push(...stuck.slice(0, 3).map((v) => `${v.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80)} (${Math.round((Date.now() - v.at) / 1000)}s)`));
  }
  let pendingInject = false;
  async function gotoStart(): Promise<void> {
    await page.goto(cfg.start, { waitUntil: 'domcontentloaded' }).catch((e) => addViolation('goto-failed', String(e.message).slice(0, 200)));
    if (cfg.inject && cfg.start === '/new') pendingInject = rng2.chance(0.75);
  }

  if (!opts.skipInitialGoto) {
    await page.setViewportSize(SIZES[size]);
    if (cfg.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStart();
    // 投稿の画面は、下書きを入れた状態から始める（種の 4 分の 3。残りは空の状態から）
    if (cfg.inject && cfg.start === '/new') await inject();
  }
  async function inject(): Promise<void> {
    injected++;
    const b = injected === 1 ? cfg.built : postableDraft(seed, 100 + injected, { withReads: rng.chance(0.6), needCands: rng.chance(0.8), mtt: cfg.screen === 'mtt' ? true : rng.chance(0.5) });
    await injectDraft(page, b);
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
    if (snapshot.els.some((e) => e.zone === 'villain')) cv.villainVisible++;
    if (snapshot.els.some((e) => e.zone === 'mtt' && e.input)) cv.mttVisible++;
    nodeChecks(snapshot);
    for (const p of snapshot.problems) if (p.kind !== 'about-blank') addViolation(p.kind, p.detail, snapshot.path);
    if (snapshot.problems.some((p) => p.kind === 'blank' || p.kind === 'about-blank')) needRecover = true;
  };
  let needRecover = false;
  if (s) check(s);

  /** ページの中の点検で返らない、Node 側の突き合わせ */
  function nodeChecks(snapshot: Snapshot): void {
    const cv = res.cover;
    // 投稿: 画面が送る本文を、サーバーと同じ判定に通す。画面が送れる（buildSubmission が通る）のに断られたら食い違い
    if (snapshot.subBody !== undefined) {
      cv.subJudged++;
      const j = serverJudge(snapshot.subBody);
      if (!j.ok && snapshot.subOk) snapshot.problems.push({ kind: 'screen-ok-server-rejects', detail: j.message.slice(0, 200) });
    }
    // 回答・集計: 席の印の数とモーダルの中身（形の違う情報のときは落ちないことだけ見る）
    if (!cfg.wellFormed) return;
    const vr = (cfg.vr ?? {}) as VillainReads;
    if (snapshot.marks !== undefined) cv.marksChecked++;
    cv.rvChecked += snapshot.rv?.length ?? 0;
    snapshot.problems.push(...checkView(snapshot, cfg.raw, vr));
  }

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
    // 再読み込み・移動のあとの投稿画面は、下書きを入れ直す（下書きはメモリ上だけ）
    if (pendingInject && s.path === '/new') {
      pendingInject = false;
      lastOp = 'inject(after reload)';
      count('reinject');
      await inject();
      s = await snap();
      if (s) check(s);
      continue;
    }
    // 通信の失敗は一定の手数で元に戻す
    if (ctx.net.mode !== 'ok' && step >= netUntil) ctx.net.mode = 'ok';
    // 元の画面から離れたら、ときどき戻す（その画面に集中する）
    if (s.path !== new URL(cfg.start, 'http://x').pathname && rng.chance(cfg.screen === 'storage' ? 0.15 : 0.4)) {
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
      if (cfg.zone && modalEls.length === 0 && rng.chance(0.6)) {
        const zp = pool.filter((e) => e.zone === cfg.zone);
        if (zp.length > 0) pool = zp;
        else if (cfg.screen !== 'answer' && cfg.screen !== 'result' && rng.chance(0.5)) {
          // スマホは Villain・MTT の欄が別のステップにある。ステップを移って探す
          const nav = pool.filter((e) => e.zone === 'nav');
          if (nav.length > 0) pool = nav;
        }
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
          else if (which === 'reload') {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => addViolation('reload-failed', String(e.message).slice(0, 200)));
            if (cfg.inject) pendingInject = rng2.chance(0.75);
          }
          else {
            const to = rng.pick(['/', '/new', '/new', '/drafts', `/s/${ID}`, `/s/${ID}/answer`, `/s/${ID}/result`, '/nope']);
            lastOp = `nav goto ${to}`;
            await page.goto(to, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined);
            if (cfg.inject && to === '/new') pendingInject = rng2.chance(0.75);
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
          const key = rng.pick(PRESET_KEYS);
          const kind = rng.int(4);
          const value = kind === 0 ? weirdText(rng) : kind === 1 ? JSON.stringify({ schema: 2, presets: [{ id: 'a', name: weirdText(rng).slice(0, 30) || 'n', read: { vpip: rng.range(-5, 120), general: [{ street: 'flop', action: 'cbet', lean: 'value' }] } }] }) : kind === 2 ? JSON.stringify([{ id: 'z', savedAt: 'x', draft: { reads: weirdText(rng), mtt: weirdText(rng) } }]) : 'z'.repeat(rng.pick([10_000, 200_000]));
          lastOp = `storage(${key.replace(UID, 'uid')} kind=${kind})+reload`;
          await page.evaluate(([k, v]) => localStorage.setItem(k as string, v as string), [key, value]).catch(() => undefined);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined);
          if (cfg.inject) pendingInject = rng2.chance(0.75);
          break;
        }
        case 'home':
          lastOp = 'home';
          await gotoStart();
          break;
        case 'primary': {
          // 主な操作のボタン（Preset・保存・呼び出す・削除・クリア・General Read を足す・All Villains・MTT・History・回答する・閉じる など）を押す
          const primary = els.filter((e) => /^(Preset|保存|クリア|＋ General Read|All Villains|MTT$|History|投稿する|回答する|閉じる|完了|次へ|削除|.* を呼び出す|.* を削除)/.test(e.label));
          const e = primary.length > 0 ? rng.pick(primary) : null;
          if (!e) break;
          lastOp = `primary "${e.label}" @${e.x},${e.y}`;
          await tapOrClick(e.x, e.y);
          break;
        }
        case 'struct': {
          // Hero・人数・Spot の候補・ステップ・Action の入れ直しなど、ハンドの構造を変える
          const pool = els.filter((e) => (e.zone === 'struct' || e.zone === 'nav') && !e.disabled);
          if (pool.length === 0) break;
          const e = rng.pick(pool);
          lastOp = `struct "${e.label}" @${e.x},${e.y}`;
          await tapOrClick(e.x, e.y);
          break;
        }
        case 'slider': {
          const e = chooseEl((x) => x.role === 'slider');
          if (!e) break;
          const n = rng.range(1, 12);
          const keys = Array.from({ length: n }, () => rng.pick(SLIDER_KEYS));
          lastOp = `slider "${e.label}" @${e.x},${e.y} keys=${keys.join(',')}`;
          await page.mouse.click(e.x, e.y);
          for (const k of keys) await page.keyboard.press(k);
          break;
        }
        case 'sdrag': {
          const e = chooseEl((x) => x.role === 'slider');
          if (!e) break;
          const half = Math.max(10, e.w / 2);
          const pts = Array.from({ length: rng.range(2, 6) }, () => ({ x: Math.round(e.x + rng.range(-half - 40, half + 40)), y: Math.round(e.y + rng.range(-40, 40)) }));
          lastOp = `sdrag "${e.label}" @${e.x},${e.y} -> ${pts.map((q) => `${q.x},${q.y}`).join(' ')}`;
          await page.mouse.move(Math.round(e.x + rng.range(-half, half)), e.y);
          await page.mouse.down();
          for (const q of pts) await page.mouse.move(Math.max(0, q.x), Math.max(0, q.y), { steps: rng.range(1, 5) });
          if (rng.chance(0.1)) await page.keyboard.press('Escape');
          await page.mouse.up();
          break;
        }
        case 'gotoZone': {
          // スマホは Villain・MTT の欄が別のステップにある。見えていなければ、そのステップへ移る
          if (!cfg.zone || s.els.some((e) => e.zone === cfg.zone) || s.path !== '/new') break;
          const want = cfg.zone === 'mtt' ? /基本設定$/ : /Spot$/;
          const e = s.els.find((x) => x.zone === 'nav' && want.test(x.label));
          if (!e) break;
          lastOp = `gotoZone "${e.label}" @${e.x},${e.y}`;
          await tapOrClick(e.x, e.y);
          break;
        }
        case 'readsTour': {
          // 回答・集計画面: 席の ◆・All Villains・MTT・History を押す（モーダルの中の表示を点検する）
          if (cfg.screen !== 'answer' && cfg.screen !== 'result') break;
          const inModal = s.dialogs > 0 && rng.chance(0.3);
          const pool = s.els.filter((e) => e.zone === 'reads' && !e.disabled && e.modal === inModal);
          const e = pool.length > 0 ? rng.pick(pool) : null;
          if (!e) break;
          lastOp = `readsTour "${e.label}" @${e.x},${e.y}`;
          await tapOrClick(e.x, e.y);
          break;
        }
        case 'reinject': {
          if (!(cfg.inject || cfg.screen === 'storage') || s.path !== '/new') break;
          lastOp = 'reinject(draft)';
          await inject();
          break;
        }
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
