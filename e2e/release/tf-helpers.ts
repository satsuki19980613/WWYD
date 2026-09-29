/**
 * リリース前テスト T-F（性能・無料枠・運用）の共通の部品。
 *
 * 本番のビルド（`npm run build` を本番の Neon の「公開の住所」で行い、`npm run preview -w @wwyd/app -- --port 5216 --strictPort`）を
 * 開き、Neon への通信をすべて偽の応答に差し替える。ビルドに埋め込む URL は CSP の connect-src と同じ本番の住所（12 章 §7.1・_headers）で、
 * 偽の応答で受けるので実際には接続しない。念のため Chromium の名前解決で *.neon.tech を引けなくし、
 * 偽の応答の対象外のホストへの通信は中断する（`guard`）。
 */
import type { BrowserContext, Page, Route } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';

export const ORIGIN = process.env.TF_ORIGIN ?? 'http://localhost:5216';
export const AUTH_HOST = 'https://ep-aged-wave-b3j6dpzy.neonauth.c-4.ap-southeast-1.aws.neon.tech';
export const DATA_HOST = 'https://ep-aged-wave-b3j6dpzy.apirest.c-4.ap-southeast-1.aws.neon.tech';
export const FN_HOST = 'https://br-old-meadow-b3h9xgbz-createpost.compute.c-4.ap-southeast-1.aws.neon.tech';
export const UID = '11111111-1111-4111-8111-111111111111';
export const POST_ID = '00000000-0000-4000-8000-000000000001';

/** 名前解決の段階で Neon へ出られなくする（`test.use({ launchOptions })` に渡す） */
export const LAUNCH_ARGS = ['--host-resolver-rules=MAP *.neon.tech ~NOTFOUND'];

type Json = Record<string, unknown> | unknown[] | null;

export type Logged = { t: number; key: string; status: number; bytes: number };

export type Fake = {
  /** 受けた要求（時刻順） */
  log: Logged[];
  /** キーごとの回数（例 `auth:token`・`data:rpc/list_posts`） */
  counts: () => Record<string, number>;
  count: (key: string) => number;
  clear: () => void;
  /** 偽のサーバーの現在時刻（ms）。JWT の exp と、Data API の JWT の期限の判定に使う。既定は実際の時刻 */
  serverNow: () => number;
  opts: {
    signedIn: boolean;
    /** `/ok` の状態。数字ならその HTTP 状態、'hang' なら応答しない、'fail' なら通信エラー */
    ok: number | 'hang' | 'fail';
    /** `/get-session` の状態（200 以外ならその状態で応答。'hang'・'fail' も可） */
    session: number | 'hang' | 'fail';
    /** `/token` の状態 */
    token: number | 'hang' | 'fail';
    whoami: number | 'fail';
    /** JWT の寿命（秒）。Neon Auth は 15 分 */
    ttlSec: number;
    /** true なら Data API は期限切れの JWT を 401 で断る（PostgREST と同じ） */
    checkJwt: boolean;
    listRows: Record<string, unknown>[];
    /** list_posts の状態（200 以外は失敗） */
    list: number | 'fail';
    detail: Json;
    detailStatus: number | 'fail';
    afterInsert: Json;
    /** create-post の応答（既定は 201） */
    createPost: { status: number; body: Record<string, unknown> };
    /** 応答の前の待ち（ms。実時間） */
    latencyMs: number;
  };
  inserts: Record<string, unknown>[];
  posts: Record<string, unknown>[];
};

const cors = (route: Route): Record<string, string> => ({
  'access-control-allow-origin': route.request().headers()['origin'] ?? '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': route.request().headers()['access-control-request-headers'] ?? '*',
  'access-control-expose-headers': 'content-range, content-profile',
});

const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');

export function jwtExp(jwt: string): number {
  try {
    const p = JSON.parse(Buffer.from((jwt.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as { exp?: number };
    return (p.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

export const listRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: '00000000-0000-4000-8000-000000000002',
  created_at: '2026-09-28T10:00:00.123456+00:00',
  title: 'BTN の 3bet',
  fmt: 'cash',
  hero: 'BTN',
  street: 'turn',
  effective_stack: 100,
  answer_count: 3,
  is_mine: false,
  answered_by_me: false,
  can_delete: false,
  players: 6,
  board: ['Kh', '8d', '3c', '2s'],
  ...over,
});

/** 一覧の見本（ページの大きさ分ではなく数件） */
export const ROWS = [
  listRow({ id: '00000000-0000-4000-8000-000000000001', title: 'K83r のターンのバレルを受ける' }),
  listRow({ id: '00000000-0000-4000-8000-000000000003', title: '自分の投稿', is_mine: true, can_delete: true, players: 3, street: 'flop', board: ['Ah', 'Kd', '2c'] }),
  listRow({ id: '00000000-0000-4000-8000-000000000004', title: '回答済み', answered_by_me: true }),
];

export const unanswered = (): Record<string, unknown> => detailJson(hs1bb(), { viewer: 'unanswered', id: POST_ID });
export const answered = (): Record<string, unknown> => detailJson(hs1bb(), { viewer: 'answered', id: POST_ID, answerCount: 1 });

/** 別ホストへの通信をすべて偽の応答にする。対象外のホスト（localhost 以外）への通信は中断する */
export async function installFake(page: Page, over: Partial<Fake['opts']> = {}): Promise<Fake> {
  const log: Logged[] = [];
  const fake: Fake = {
    log,
    counts: () => {
      const c: Record<string, number> = {};
      for (const l of log) c[l.key] = (c[l.key] ?? 0) + 1;
      return c;
    },
    count: (k) => log.filter((l) => l.key === k).length,
    clear: () => {
      log.length = 0;
    },
    serverNow: () => Date.now(),
    opts: {
      signedIn: true,
      ok: 200,
      session: 200,
      token: 200,
      whoami: 200,
      ttlSec: 900,
      checkJwt: false,
      listRows: ROWS,
      list: 200,
      detail: unanswered(),
      detailStatus: 200,
      afterInsert: answered(),
      createPost: { status: 201, body: { id: POST_ID } },
      latencyMs: 0,
      ...over,
    },
    inserts: [],
    posts: [],
  };
  const o = fake.opts;
  const t0 = Date.now();

  async function reply(route: Route, key: string, status: number, body: Json | string, extra: Record<string, string> = {}): Promise<void> {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    log.push({ t: Date.now() - t0, key, status, bytes: Buffer.byteLength(text) });
    if (o.latencyMs) await new Promise((r) => setTimeout(r, o.latencyMs));
    await route.fulfill({ status, headers: { ...cors(route), 'content-type': 'application/json', ...extra }, body: text }).catch(() => undefined);
  }
  async function abnormal(route: Route, key: string, mode: 'hang' | 'fail'): Promise<void> {
    log.push({ t: Date.now() - t0, key, status: mode === 'hang' ? -1 : 0, bytes: 0 });
    if (mode === 'fail') await route.abort('connectionfailed').catch(() => undefined);
    // 'hang': 何も返さない（ページが閉じるまで）
  }

  const jwt = (): string => b64({ alg: 'none' }) + '.' + b64({ sub: UID, exp: Math.floor((fake.serverNow() + o.ttlSec * 1000) / 1000) }) + '.x';

  const auth = async (route: Route): Promise<void> => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    const path = new URL(req.url()).pathname.replace(/^\/api\/auth/, '').replace(/^.*\/auth/, '');
    const key = `auth:${path.replace(/^\//, '')}`;
    const pick = (v: number | 'hang' | 'fail'): number | null => (typeof v === 'number' ? v : null);
    if (path === '/ok') {
      if (typeof o.ok !== 'number') return abnormal(route, key, o.ok);
      return reply(route, key, o.ok, { ok: o.ok === 200 });
    }
    if (path === '/get-session') {
      if (typeof o.session !== 'number') return abnormal(route, key, o.session);
      const st = pick(o.session) as number;
      if (st !== 200) return reply(route, key, st, { message: 'err' });
      return reply(route, key, 200, o.signedIn ? { user: { id: UID }, session: { userId: UID } } : null);
    }
    if (path === '/token') {
      if (typeof o.token !== 'number') return abnormal(route, key, o.token);
      if (o.token !== 200) return reply(route, key, o.token, { message: 'err' });
      if (!o.signedIn) return reply(route, key, 401, { message: 'unauthorized' });
      return reply(route, key, 200, { token: jwt() });
    }
    if (path === '/sign-out') {
      o.signedIn = false;
      return reply(route, key, 200, { success: true });
    }
    return reply(route, key, 404, { message: 'not found' });
  };
  await page.route(`${AUTH_HOST}/**`, auth);
  await page.route('**/api/auth/**', auth);

  await page.route(`${DATA_HOST}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    const path = new URL(req.url()).pathname.replace(/^\/neondb\/rest\/v1/, '');
    const key = `data:${req.method() === 'POST' && path.startsWith('/rpc/') ? '' : `${req.method()} `}${path.replace(/^\//, '')}`;
    if (o.checkJwt) {
      const h = req.headers()['authorization'] ?? '';
      const exp = jwtExp(h.replace(/^Bearer /, ''));
      if (!h || exp < fake.serverNow()) return reply(route, key, 401, { code: 'PGRST301', message: 'JWT expired', details: null, hint: null });
    }
    const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
    if (path === '/rpc/whoami') {
      if (o.whoami === 'fail') return abnormal(route, key, 'fail');
      if (o.whoami !== 200) return reply(route, key, o.whoami, { message: 'err' });
      return reply(route, key, 200, { allowed: true, admin: false });
    }
    if (path === '/rpc/list_posts') {
      if (o.list === 'fail') return abnormal(route, key, 'fail');
      if (o.list !== 200) return reply(route, key, o.list, { code: 'XX000', message: 'err', details: null, hint: null });
      return reply(route, key, 200, o.listRows);
    }
    if (path === '/rpc/get_post_detail') {
      if (o.detailStatus === 'fail') return abnormal(route, key, 'fail');
      if (o.detailStatus !== 200) return reply(route, key, o.detailStatus, { code: 'XX000', message: 'err', details: null, hint: null });
      return reply(route, key, 200, o.detail);
    }
    if (path === '/answers' && req.method() === 'POST') {
      fake.inserts.push(body);
      o.detail = o.afterInsert;
      log.push({ t: Date.now() - t0, key, status: 201, bytes: 0 });
      return route.fulfill({ status: 201, headers: cors(route), body: '' });
    }
    if (path === '/rpc/delete_my_account') return reply(route, key, 204, '');
    return reply(route, key, 404, { code: 'PGRST202', message: `偽のバックエンドに無い: ${req.method()} ${path}`, details: null, hint: null });
  });

  await page.route(`${FN_HOST}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    fake.posts.push((req.postDataJSON() ?? {}) as Record<string, unknown>);
    return reply(route, 'fn:create-post', o.createPost.status, o.createPost.body);
  });
  return fake;
}

/**
 * localhost 以外への通信を、偽の応答が拾わなかったものとして記録して中断する。`installFake` より先に呼ぶ
 * （後から登録したものが先に評価されるので、偽の応答の対象は偽が拾い、それ以外だけがここに来る）。
 */
export async function guard(context: BrowserContext): Promise<string[]> {
  const escaped: string[] = [];
  await context.route(/^https?:\/\/(?!localhost(:|\/|$)|127\.0\.0\.1).*/, async (route) => {
    escaped.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  return escaped;
}

/** ページの例外・console.error を集める（CSP の違反も console.error に出る） */
export function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}
${e.stack ?? ""}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console.error: ${m.text()}`);
  });
  // 失敗した要求（原因の調査用。console.error の「Failed to load resource」は URL を含まないので別に残す）
  page.on('requestfailed', (r) => errs.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
  return errs;
}
