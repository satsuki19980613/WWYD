/**
 * C-06（リリース前テスト。docs/release-test-plan.md §3 C）: 本番のビルド（npm run build → npm run preview）を CSP 付きで開き、
 * 全画面で CSP の違反と、許可していない送り先への通信が 0 件であることを確かめる。
 *
 * 実行の手順（プレビューのサーバーを先に立て、Playwright に使い回させる。playwright.config.ts の reuseExistingServer）:
 *   npm run build
 *   npm run preview -w @wwyd/app -- --port 5203 --strictPort      （別の端末・バックグラウンド）
 *   E2E_PORT=5203 npx playwright test e2e/release/tc-c06-csp.spec.ts
 *
 * ビルドには本番の Neon の URL が入っている。本物には一切つながないよう、コンテキスト全体（Worker を含む）の通信を差し替える:
 * - 自サイト（プレビューのサーバー）以外は、本番の Neon の 3 つのホスト（public/_headers の connect-src）だけ偽の応答を返し、
 *   それ以外の送り先は「外部への通信」として記録して中断する。
 * - `/api/auth/*`（自サイトの中継）も偽の応答にする（プレビューのサーバーの中継が本物の Neon Auth へ行かないように）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';

const HEADERS_FILE = readFileSync(new URL('../../packages/app/public/_headers', import.meta.url), 'utf8');
const CSP = /Content-Security-Policy:\s*(.+)/.exec(HEADERS_FILE)?.[1]?.trim() ?? '';
const CONNECT = /connect-src ([^;]+)/.exec(CSP)?.[1]?.split(/\s+/) ?? [];
const NEON_HOSTS = CONNECT.filter((s) => s.startsWith('https://'));
const AUTH_HOST = NEON_HOSTS.find((h) => h.includes('.neonauth.')) ?? '';
const DATA_HOST = NEON_HOSTS.find((h) => h.includes('.apirest.')) ?? '';
const FN_HOST = NEON_HOSTS.find((h) => h.includes('-createpost.')) ?? '';

const ID = '00000000-0000-4000-8000-000000000001';
const UID = '11111111-1111-4111-8111-111111111111';
const NOT_T4 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

type Violation = { directive: string; blocked: string; source: string; line: number; page: string };

type Harness = {
  violations: Violation[];
  consoleCsp: string[];
  pageErrors: string[];
  consoleErrors: string[];
  requestUrls: string[];
  external: string[];
  direct: string[];
  state: { signedIn: boolean; healthy: boolean; detail: Record<string, unknown> | null };
};

const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (): string => `${b64({ alg: 'none' })}.${b64({ sub: UID, exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;

const LIST_ROWS = [
  {
    id: ID, created_at: '2026-09-28T10:00:00+00:00', title: 'BTN の 3bet', fmt: 'cash', hero: 'BTN', street: 'turn', effective_stack: 100, answer_count: 3,
    is_mine: false, answered_by_me: false, can_delete: false, players: 6, board: ['Kh', '8d', '3c', '2s'],
  },
  {
    id: '00000000-0000-4000-8000-000000000002', created_at: '2026-09-28T09:00:00+00:00', title: '自分の投稿', fmt: 'cash', hero: 'BTN', street: 'flop', effective_stack: 100,
    answer_count: 0, is_mine: true, answered_by_me: false, can_delete: true, players: 3, board: ['Ah', 'Kd', '2c'],
  },
];

async function install(context: BrowserContext, page: Page, baseOrigin: string): Promise<Harness> {
  const h: Harness = {
    violations: [], consoleCsp: [], pageErrors: [], consoleErrors: [], requestUrls: [], external: [], direct: [],
    state: { signedIn: true, healthy: true, detail: detailJson(hs1bb(), { viewer: 'unanswered', id: ID, answerCount: 3 }) },
  };
  context.on('request', (r) => h.requestUrls.push(r.url()));
  page.on('pageerror', (e) => h.pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') h.consoleErrors.push(m.text());
    if (/content security policy|refused to/i.test(m.text())) h.consoleCsp.push(m.text());
  });
  await page.exposeFunction('__reportCsp', (v: Violation) => h.violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __reportCsp: (v: unknown) => void }).__reportCsp({
        directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber, page: location.pathname,
      });
    });
  });

  const cors = (route: Route): Record<string, string> => ({
    'access-control-allow-origin': route.request().headers()['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': route.request().headers()['access-control-request-headers'] ?? '*',
  });
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...cors(route), 'content-type': 'application/json' }, body: JSON.stringify(body) });

  // 1. 何も一致しなかったら「外部への通信」として記録して中断する（先に登録＝後から登録するものが優先される）
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin === baseOrigin || u.protocol === 'data:' || u.protocol === 'blob:') return route.fallback();
    h.external.push(route.request().url());
    return route.abort();
  });
  // 2. 自サイトの中継（Neon Auth）
  await context.route(`${baseOrigin}/api/auth/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/auth/, '');
    if (path === '/ok') return h.state.healthy ? json(route, 200, { ok: true }) : json(route, 503, { error: 'down' });
    if (path === '/get-session') return json(route, 200, h.state.signedIn ? { user: { id: UID }, session: { userId: UID } } : null);
    if (path === '/token') return json(route, 200, { token: fakeJwt() });
    if (path === '/sign-out') return json(route, 200, { success: true });
    if (path === '/sign-in/social') return json(route, 200, { url: `${baseOrigin}/terms`, redirect: true });
    return json(route, 404, { message: 'not found' });
  });
  // 3. 本番の Neon の 3 つのホスト（偽の応答）。Auth を直接呼んだら記録する
  await context.route(`${AUTH_HOST}/**`, async (route) => {
    h.direct.push(route.request().url());
    return json(route, 404, { message: 'not found' });
  });
  await context.route(`${DATA_HOST}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/rpc/whoami')) return json(route, 200, { allowed: true, admin: false });
    if (path.endsWith('/rpc/list_posts')) return json(route, 200, LIST_ROWS);
    if (path.endsWith('/rpc/get_post_detail')) return h.state.detail === null ? json(route, 400, { code: 'P0001', message: 'post_not_found' }) : json(route, 200, h.state.detail);
    if (path.endsWith('/answers') && req.method() === 'POST') return route.fulfill({ status: 201, headers: cors(route), body: '' });
    if (path.endsWith('/posts') && req.method() === 'DELETE') return json(route, 200, [{ id: ID }]);
    if (path.endsWith('/rpc/delete_my_account')) return route.fulfill({ status: 204, headers: cors(route), body: '' });
    return json(route, 404, { code: 'PGRST202', message: `偽のバックエンドに無い: ${req.method()} ${path}` });
  });
  await context.route(`${FN_HOST}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    return json(route, 201, { id: ID });
  });
  return h;
}

/** ページの読み込みが落ち着くまで待つ（通信・Worker・描画） */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400);
}

async function visit(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await settle(page);
  expect((await page.locator('#root').innerText()).trim().length, `${path} が真っ白でない`).toBeGreaterThan(0);
}

function report(h: Harness, label: string): string {
  return JSON.stringify({ label, violations: h.violations, consoleCsp: h.consoleCsp, external: h.external, direct: h.direct }, null, 1);
}

test.beforeAll(() => {
  expect(CSP, 'public/_headers の Content-Security-Policy を読めた').not.toBe('');
  expect([AUTH_HOST, DATA_HOST, FN_HOST].every(Boolean), '_headers の connect-src に Neon の 3 つのホストがある').toBe(true);
});

test.describe('C-06 レスポンスヘッダー', () => {
  test('プレビューの応答（どのパスでも）に _headers の CSP・nosniff・Referrer-Policy が付く', async ({ request, baseURL }) => {
    for (const path of ['/', '/new', '/s/x/answer', '/nowhere', '/terms', '/ocr/worker.min.js', '/icon.svg']) {
      const res = await request.get(`${baseURL}${path}`);
      expect(res.status(), path).toBeLessThan(400);
      const h = res.headers();
      expect(h['content-security-policy'], `${path} の CSP`).toBe(CSP);
      expect(h['x-content-type-options'], `${path} の nosniff`).toBe('nosniff');
      expect(h['referrer-policy'], `${path} の Referrer-Policy`).toBe('strict-origin-when-cross-origin');
    }
  });

  test('CSP の内容: unsafe-inline / unsafe-eval / ワイルドカードを含まず、通信先は自サイトと本番の Neon の 3 ホストだけ', async () => {
    expect(CSP).not.toMatch(/unsafe-inline|(?<!wasm-)unsafe-eval/);
    expect(CSP).not.toMatch(/\s\*[\s;]|\shttps?:\s|\shttps?:;/); // `*`・スキームだけの許可（https:）は無い
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("base-uri 'self'");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("form-action 'self'");
    expect(CONNECT.filter((s) => s !== "'self'")).toHaveLength(3);
    for (const h of NEON_HOSTS) expect(new URL(h).protocol).toBe('https:');
    // ビルドしたアプリが埋め込んでいる Neon の URL と、CSP の許可が食い違っていない（食い違うと本番で通信が止まる）
    const assets = new URL('../../packages/app/dist/assets/', import.meta.url);
    const bundle = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, assets), 'utf8')).join('\n');
    const embedded = new Set([...bundle.matchAll(/https:\/\/[a-z0-9.-]+\.neon\.tech/g)].map((m) => m[0]));
    // ビルドに埋め込まれた Neon のホスト（Data API・create-post）は、すべて CSP の connect-src に許可されている（食い違うと本番で通信が止まる）
    expect([...embedded].sort(), 'ビルドに埋め込まれた Neon のホスト').toEqual([DATA_HOST, FN_HOST].sort());
    // 観察（S4）: Neon Auth のホストは、アプリが直接は呼ばない（すべて自サイトの /api/auth 経由）ので、ビルドには埋め込まれない。
    // それでも connect-src に許可が残っている。最小の許可にするなら外せる（OAuth への遷移は画面の移動で、connect-src の対象ではない）
    expect(embedded.has(AUTH_HOST), '（観察）Neon Auth のホストはビルドに埋め込まれていない').toBe(false);
  });

  test('dist/_headers はソースの public/_headers と同じ（Cloudflare Pages に渡るのはこれ）', async () => {
    const built = readFileSync(new URL('../../packages/app/dist/_headers', import.meta.url), 'utf8');
    expect(built).toBe(HEADERS_FILE);
  });
});

test.describe('C-06 対照試験（この検査が本当に違反を捕まえられる）', () => {
  test('許可していない送り先・スクリプト・画像・フレーム・フォーム・base は CSP で止まり、違反として記録される', async ({ page, context, baseURL }) => {
    const h = await install(context, page, new URL(baseURL ?? '').origin);
    await visit(page, '/terms');
    h.violations.length = 0;
    const results = await page.evaluate(async (dataHost) => {
      const out: Record<string, string> = {};
      const attempt = async (name: string, f: () => unknown) => {
        try {
          await f();
          out[name] = 'ok';
        } catch (e) {
          out[name] = `error:${(e as Error).name}`;
        }
      };
      await attempt('fetch 外部', () => fetch('https://example.com/x'));
      await attempt('fetch 許可済み（データ）', () => fetch(`${dataHost}/rpc/whoami`, { method: 'POST' }));
      await attempt('eval', () => eval('1+1')); // eslint-disable-line no-eval
      await attempt('new Function', () => new Function('return 1')());
      await attempt('beacon', () => navigator.sendBeacon('https://example.com/b', 'x'));
      await attempt('WebSocket', () => new WebSocket('wss://example.com/'));
      await attempt('blob Worker', () => new Worker(URL.createObjectURL(new Blob(['1'], { type: 'text/javascript' }))));
      const add = (html: string) => {
        const d = document.createElement('div');
        d.innerHTML = html;
        document.body.append(d);
        return d;
      };
      await attempt('img 外部', () => add('<img src="https://example.com/a.png">'));
      await attempt('script 外部', () => {
        const s = document.createElement('script');
        s.src = 'https://example.com/a.js';
        document.head.append(s);
      });
      await attempt('script インライン', () => {
        const s = document.createElement('script');
        s.textContent = 'window.__ran = 1';
        document.head.append(s);
      });
      await attempt('inline handler', () => add('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="window.__ran2=1">'));
      await attempt('iframe 外部', () => add('<iframe src="https://example.com/"></iframe>'));
      await attempt('link CSS 外部', () => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Rajdhani';
        document.head.append(l);
      });
      await attempt('style 要素', () => {
        const s = document.createElement('style');
        s.textContent = 'body{outline:1px solid red}';
        document.head.append(s);
      });
      await attempt('form action 外部', () => {
        const f = document.createElement('form');
        f.action = 'https://example.com/post';
        f.method = 'post';
        const b = document.createElement('button');
        f.append(b);
        document.body.append(f);
        b.click();
      });
      await attempt('base 要素', () => {
        const b = document.createElement('base');
        b.href = 'https://example.com/';
        document.head.append(b);
      });
      await attempt('object', () => add('<object data="https://example.com/x.swf"></object>'));
      return { out, ran: (window as unknown as { __ran?: number; __ran2?: number }).__ran ?? 0, ran2: (window as unknown as { __ran2?: number }).__ran2 ?? 0 };
    }, DATA_HOST);
    await page.waitForTimeout(500);
    const dirs = new Set(h.violations.map((v) => v.directive));
    // 期待: 通信・スクリプト・画像・フレーム・スタイル・フォーム・base・object・Worker のどれも違反として捕まる
    expect(results.ran, 'インラインの script は動かない').toBe(0);
    expect(results.ran2, 'インラインのイベントハンドラは動かない').toBe(0);
    expect(results.out['eval']).toBe('error:EvalError');
    expect(results.out['new Function']).toBe('error:EvalError');
    for (const d of ['connect-src', 'script-src-elem', 'script-src-attr', 'img-src', 'frame-src', 'style-src-elem', 'form-action', 'base-uri', 'object-src', 'worker-src']) {
      expect(dirs.has(d) || dirs.has(d.replace(/-(elem|attr)$/, '')), `${d} の違反が記録される（記録された: ${[...dirs].join(', ')}）`).toBe(true);
    }
    // 許可済みのホストへの通信は違反にならない
    expect(h.violations.filter((v) => v.blocked.startsWith(DATA_HOST)), '許可済みの Neon への通信は違反でない').toEqual([]);
    // 外部への通信は 1 件も実際には出ていない（CSP が先に止める。出ていたらここに残る）
    expect(h.external, 'CSP を抜けて外へ出ようとした通信').toEqual([]);
  });
});

test.describe('C-06 全画面で CSP の違反と外部への通信が 0 件', () => {
  for (const [signedIn, sp] of [[true, false], [false, false], [true, true], [false, true]] as const) {
    test(`${signedIn ? 'ログイン中' : '未ログイン'}: 画面を順に開く${sp ? ' @sp' : ''}`, async ({ page, context, baseURL }, testInfo) => {
      test.setTimeout(240_000);
      const base = new URL(baseURL ?? '').origin;
      const h = await install(context, page, base);
      h.state.signedIn = signedIn;
      const mobile = testInfo.project.name === 'sp';
      const visited: string[] = [];
      const go = async (path: string) => {
        await visit(page, path);
        visited.push(path);
      };

      if (!signedIn) {
        await go('/');
        await go('/?error=login_failed');
        await go('/terms');
        await go('/privacy');
        // ログインの開始（sign-in/social → 画面の遷移）
        await go('/');
        const login = page.getByRole('button', { name: /Google/ });
        if (await login.count()) {
          await login.first().click();
          await settle(page);
        }
        // メンテナンス（ヘルスチェックが失敗）
        h.state.healthy = false;
        await go('/');
        h.state.healthy = true;
      } else {
        await go('/');
        await go('/?street=flop');
        await go('/new');
        await go('/drafts');
        for (const detail of ['unanswered', 'answered', 'author'] as const) {
          h.state.detail = detailJson(hs1bb(), {
            viewer: detail, id: ID, answerCount: 3,
            myAnswer: detail === 'unanswered' ? null : { paint: `\\x${'00'.repeat(676)}`, size: null },
          });
          await go(`/s/${ID}`);
          await go(`/s/${ID}/answer`);
          await go(`/s/${ID}/result`);
        }
        h.state.detail = null; // post_not_found
        await go(`/s/${ID}/result`);
        await go('/terms');
        await go('/privacy');
        await go('/nowhere');
        // 開発用の入口は本番のビルドに無い（/_dev/ui は 404 の画面、?devstate= は無視して通常の画面）
        await go('/_dev/ui');
        const devText = await page.locator('#root').innerText();
        expect(devText, '/_dev/ui は部品一覧（開発用）を出さない').not.toContain('部品一覧');
        expect(devText, '/_dev/ui は 404 の画面').toContain('ページが見つかりません');
        await go('/?devstate=maintenance');
        expect(await page.locator('#root').innerText(), '?devstate= で状態を強制できない').not.toContain('メンテナンス中');
        // 不正なエンコードのパスは、プレビューのサーバーが 404 の空の応答を返す（Cloudflare とは違う）ので、アプリの中のルーターで開く
        await go('/');
        await page.evaluate(() => {
          history.pushState(null, '', '/s/%E0%A4%A/answer');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await settle(page);
        expect((await page.locator('#root').innerText()).trim().length, '不正なエンコードのパスで真っ白でない').toBeGreaterThan(0);
        await go('/s/../etc/passwd');

        // ヘッダーの ⓘ・アカウントメニュー・ログアウトの確認
        await go('/');
        const info = page.getByRole('button', { name: 'インフォメーション' });
        if (await info.count()) {
          await info.first().click();
          await settle(page);
          await page.keyboard.press('Escape');
        }
        const account = page.getByRole('button', { name: 'アカウント' });
        if (await account.count()) {
          await account.first().click();
          await settle(page);
          await page.keyboard.press('Escape');
        }

        // 画像の読み込み（OCR: Worker・wasm・学習データが自サイトだけから読まれる。T4 ではない画像なので読み取りは失敗する）
        await go('/new');
        if (mobile) {
          await page.getByTestId('ocr-file').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: NOT_T4 });
        } else {
          await page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' }).click();
          const chooser = page.waitForEvent('filechooser');
          await page.getByRole('dialog', { name: 'T4 の Game' }).getByRole('button', { name: /^エキスパート/ }).click();
          await (await chooser).setFiles({ name: 'x.png', mimeType: 'image/png', buffer: NOT_T4 });
        }
        await expect(page.getByRole('alert').filter({ hasText: '読み取れませんでした' })).toBeVisible({ timeout: 90_000 });
        await settle(page);
        // 投稿の送信先（create-post）への通信が CSP で止まらない
        const created = await page.evaluate(async (fn) => {
          try {
            const r = await fetch(fn, { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: '{}' });
            return r.status;
          } catch (e) {
            return `error:${(e as Error).name}`;
          }
        }, FN_HOST);
        expect(created).toBe(201);
      }

      await settle(page);
      // OCR の資産は自サイトから（記録した通信の中で、自サイト以外は Neon の 3 ホストだけ）
      const allowed = new Set([base, ...NEON_HOSTS]);
      const outside = h.requestUrls.filter((u) => {
        const p = new URL(u);
        return p.protocol !== 'data:' && p.protocol !== 'blob:' && !allowed.has(p.origin);
      });
      expect(outside, `許可していない送り先への通信\n${report(h, visited.join(' '))}`).toEqual([]);
      expect(h.external, '外部への通信の試み').toEqual([]);
      expect(h.direct, 'Neon Auth を自サイトの中継（/api/auth）を通さず直接呼んだ通信（中継の意味がなくなる）').toEqual([]);
      expect(h.violations, `CSP の違反\n${report(h, visited.join(' '))}`).toEqual([]);
      expect(h.consoleCsp, `コンソールの CSP エラー\n${report(h, visited.join(' '))}`).toEqual([]);
      expect(h.pageErrors, '捕まえていない例外').toEqual([]);
      if (signedIn) {
        const own = base;
        expect(h.requestUrls.some((u) => u === `${own}/ocr/worker.min.js`), 'OCR の Worker は自サイトから').toBe(true);
        expect(h.requestUrls.some((u) => u === `${own}/ocr/lang/eng.traineddata.gz`), 'OCR の学習データは自サイトから').toBe(true);
      }
      testInfo.annotations.push({ type: 'visited', description: visited.join(' | ') });
      testInfo.annotations.push({ type: 'console-errors', description: String(h.consoleErrors.length) });
    });
  }
});
