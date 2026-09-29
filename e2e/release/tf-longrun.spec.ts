/**
 * リリース前テスト F-05: 長く開いたまま（JWT の 15 分の更新・セッションの延長）・オフライン → 復帰・
 * Neon の休止からの再開（メンテナンス画面）。本番のビルド（preview。5216 番）を、偽の応答と Playwright の時計・`setOffline` で確かめる。
 *
 * `test.fail` の付いた試験は、現在の実装が期待（詳細仕様 06 章 §0.3・12 章 §7.2 と、利用者にとって自然な挙動）を満たさない所。
 * 直ったら「予期しない成功」で知らせる。指摘の ID は報告書にある（F-05-x）。
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { guard, installFake, LAUNCH_ARGS, ORIGIN, POST_ID, watchErrors, type Fake } from './tf-helpers.ts';

test.use({ launchOptions: { args: LAUNCH_ARGS } });

type Shown = 'boot' | 'login' | 'maintenance' | 'offline' | 'unavailable' | 'ready';

async function shown(page: Page): Promise<Shown> {
  if ((await page.locator('.boot').count()) > 0) return 'boot';
  const t = (await page.locator('main').innerText().catch(() => '')) || '';
  if (/メンテナンス中/.test(t)) return 'maintenance';
  if (/オフラインです/.test(t)) return 'offline';
  if (/利用できません/.test(t)) return 'unavailable';
  if ((await page.getByRole('button', { name: /Google でログイン/ }).count()) > 0) return 'login';
  return 'ready';
}

const T0 = new Date('2026-10-01T09:00:00');

/** ページの時計を固定の時刻から流し、偽のサーバーの時刻を同じ時計に合わせる（`skewMs` はサーバーが進んでいる分） */
async function withClock(page: Page, fake: Fake, skewMs = 0): Promise<{ ff: (ms: number) => Promise<void> }> {
  await page.clock.install({ time: T0 });
  let jumped = 0;
  const base = Date.now();
  // ページの時刻 = T0 + (実際の経過) + 早送りした分。サーバーの時刻 = ページの時刻 + skew
  fake.serverNow = () => T0.getTime() + (Date.now() - base) + jumped + skewMs;
  return {
    ff: async (ms) => {
      jumped += ms;
      await page.clock.fastForward(ms);
    },
  };
}

test.describe('起動時の状態（休止からの再開・障害）', () => {
  test('/ok が 503 → メンテナンス中', async ({ page, context }) => {
    await guard(context);
    await installFake(page, { ok: 503 });
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).toBe('maintenance');
  });

  test('/ok が応答しない → 10 秒でメンテナンス中（時計を進める）', async ({ page, context }) => {
    await guard(context);
    const fake = await installFake(page, { ok: 'hang' });
    const clk = await withClock(page, fake);
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).toBe('boot');
    await clk.ff(9_000);
    expect(await shown(page)).toBe('boot');
    await clk.ff(2_000);
    await expect.poll(() => shown(page)).toBe('maintenance');
  });

  test('通信できない（端末はオンライン）→ メンテナンス中', async ({ page, context }) => {
    await guard(context);
    await installFake(page, { ok: 'fail' });
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).toBe('maintenance');
  });

  test('端末がオフライン（navigator.onLine=false）で通信できない → 「オフラインです」。復帰して「再読み込み」→ 通常', async ({ page, context }) => {
    await guard(context);
    const fake = await installFake(page, { ok: 'fail' });
    await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }));
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).toBe('offline');
    fake.opts.ok = 200;
    await page.getByRole('button', { name: '再読み込み' }).click();
    await expect(page.locator('.spot-row').first()).toBeVisible();
  });

  test('/ok は 200 だが get-session が 502 → ログイン中の利用者にログイン画面を見せる（期待: メンテナンス中）', async ({ page, context }) => {
    test.fail(true, 'F-05-1: get-session の失敗（5xx・通信エラー）を「未ログイン」として扱う（useAuth.ts の hasSession の catch）');
    await guard(context);
    await installFake(page, { session: 502 });
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).not.toBe('boot');
    expect(await shown(page)).toBe('maintenance');
  });

  test('/api/auth が 429（Pages Functions の 1 日 10 万回の上限・レート制限）→ ログイン画面になる（期待: メンテナンス中）', async ({ page, context }) => {
    test.fail(true, 'F-05-1b: /ok の 4xx は「到達できた」と扱い、get-session の 4xx は「未ログイン」と扱うので、上限に達すると全員にログイン画面が出て、Google ログインの開始（sign-in/social）も失敗する');
    await guard(context);
    await installFake(page, { ok: 429, session: 429 });
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).not.toBe('boot');
    expect(await shown(page)).toBe('maintenance');
  });

  test('get-session が応答しない → 起動の画面のまま（10 秒の打ち切りがない）（期待: メンテナンス中）', async ({ page, context }) => {
    test.fail(true, 'F-05-2: get-session・whoami に打ち切り時間がない（health だけ 10 秒）');
    await guard(context);
    const fake = await installFake(page, { session: 'hang' });
    const clk = await withClock(page, fake);
    await page.goto(`${ORIGIN}/`);
    await clk.ff(60_000);
    expect(await shown(page)).toBe('maintenance');
  });

  test('whoami が 503 → メンテナンス中、401 → ログイン画面', async ({ page, context }) => {
    await guard(context);
    await installFake(page, { whoami: 503 });
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).toBe('maintenance');
  });

  test('whoami が 401 → ログイン画面（トークン切れ）', async ({ page, context }) => {
    await guard(context);
    await installFake(page, { whoami: 401 });
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).toBe('login');
  });

  test('休止からの再開: /ok と get-session が数秒遅れて成功 → 起動の画面のあと通常（メンテナンス中にならない）', async ({ page, context }) => {
    await guard(context);
    await installFake(page, { latencyMs: 3000 });
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row').first()).toBeVisible({ timeout: 30_000 });
  });

  test('メンテナンス中 → 復旧後に「再読み込み」で通常に戻る', async ({ page, context }) => {
    await guard(context);
    const fake = await installFake(page, { ok: 503 });
    await page.goto(`${ORIGIN}/`);
    await expect.poll(() => shown(page)).toBe('maintenance');
    fake.opts.ok = 200;
    await page.getByRole('button', { name: '再読み込み' }).click();
    await expect(page.locator('.spot-row').first()).toBeVisible();
  });

  test('メンテナンス中でも利用規約は読める', async ({ page, context }) => {
    await guard(context);
    await installFake(page, { ok: 503 });
    await page.goto(`${ORIGIN}/terms`);
    await expect(page.getByRole('heading', { name: '利用規約' }).first()).toBeVisible();
  });
});

test.describe('長く開いたまま（JWT 15 分・セッション）', () => {
  test('JWT は 15 分より前は取り直さず、切れる 30 秒前を過ぎた最初の Data API 呼び出しで 1 回だけ取り直す', async ({ page, context }) => {
    await guard(context);
    const errs = watchErrors(page);
    const fake = await installFake(page, { checkJwt: true });
    const clk = await withClock(page, fake);
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row').first()).toBeVisible();
    expect(fake.count('auth:token')).toBe(1);
    // 14 分後（まだ有効）に別の画面へ → 取り直さない
    await clk.ff(14 * 60_000);
    await page.locator('.spot-row').first().click();
    await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
    expect(fake.count('auth:token')).toBe(1);
    // 15 分 + 少し後（期限の 30 秒前を過ぎている）に一覧へ戻る → 1 回取り直し、Data API は 401 にならない
    await clk.ff(60_000);
    await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
    await expect(page.locator('.spot-row').first()).toBeVisible();
    expect(fake.count('auth:token')).toBe(2);
    expect(fake.log.filter((l) => l.key.startsWith('data:') && l.status === 401)).toEqual([]);
    // 開いている間は /get-session を呼び直さない（セッションの延長は /token と /get-session の利用で行われる）
    expect(fake.count('auth:get-session')).toBe(1);
    expect(errs).toEqual([]);
  });

  test('1 時間に 4 回の画面遷移を 15 分おきにしたとき、Functions（/api/auth）は 3 + 4 回だけ', async ({ page, context }) => {
    await guard(context);
    const fake = await installFake(page, { checkJwt: true });
    const clk = await withClock(page, fake);
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row').first()).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await clk.ff(15 * 60_000);
      await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
      await page.getByRole('button', { name: /Answers|回答/ }).first().click().catch(() => undefined);
      await page.waitForLoadState('networkidle');
    }
    const fnCalls = fake.log.filter((l) => l.key.startsWith('auth:')).length;
    // eslint-disable-next-line no-console
    console.log(`F-05 1 時間（15 分おきの操作 4 回）の /api/auth: ${JSON.stringify(fake.counts())} 合計 ${fnCalls}`);
    expect(fnCalls).toBeLessThanOrEqual(3 + 4 + 1);
  });

  test('回答画面を 20 分開いたまま塗って送信 → JWT を取り直して 1 回で保存できる', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await guard(context);
    const fake = await installFake(page, { checkJwt: true });
    const clk = await withClock(page, fake);
    await page.goto(`${ORIGIN}/s/${POST_ID}/answer`);
    await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
    await page.getByRole('button', { name: /^AA / }).click();
    await clk.ff(20 * 60_000);
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(/\/result$/);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.count('auth:token')).toBe(2);
    expect(fake.log.filter((l) => l.status === 401)).toEqual([]);
  });

  test('開いている間にセッションが切れた（7 日・別の端末でログアウト）→ 画面はログインへ戻る（期待）', async ({ page, context }) => {
    test.fail(true, 'F-05-3: 開いたままでセッションが失効すると、/token の 401 で JWT なしの要求になり、各画面が「読み込みに失敗しました」のまま（ログイン画面へ戻らない）');
    await guard(context);
    const fake = await installFake(page, { checkJwt: true });
    const clk = await withClock(page, fake);
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row').first()).toBeVisible();
    fake.opts.signedIn = false;
    await clk.ff(16 * 60_000);
    await page.locator('.spot-row').first().click();
    await expect.poll(() => shown(page), { timeout: 5000 }).toBe('login');
  });

  test('端末の時計が 5 分遅いとき、期限切れの JWT で Data API を呼び 401 になる（期待: 取り直して成功）', async ({ page, context }) => {
    test.fail(true, 'F-05-4: Data API の 401（JWT expired）で JWT を捨てて 1 回やり直す処理がない。端末の時計がサーバーより遅い（cachedToken の期限をローカル時計で判定）と、期限切れの JWT を最大（遅れ − 30 秒）使い続ける');
    await guard(context);
    const fake = await installFake(page, { checkJwt: true });
    // サーバーが端末より 5 分進んでいる
    const clk = await withClock(page, fake, 5 * 60_000);
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row').first()).toBeVisible();
    await clk.ff(16 * 60_000);
    await page.locator('.spot-row').first().click();
    await expect(page.getByRole('button', { name: '回答する' })).toBeVisible({ timeout: 5000 });
  });

  test('端末の時計が 20 分速いとき、JWT を毎回取り直す（Data API 1 回につき /api/auth/token 1 回）', async ({ page, context }) => {
    await guard(context);
    const fake = await installFake(page, { checkJwt: true });
    const clk = await withClock(page, fake, -20 * 60_000);
    void clk;
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row').first()).toBeVisible();
    fake.clear();
    for (let i = 0; i < 3; i++) {
      await page.locator('.spot-row').first().click();
      await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
      await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
      await expect(page.locator('.spot-row').first()).toBeVisible();
    }
    const c = fake.counts();
    // eslint-disable-next-line no-console
    console.log(`F-05 端末の時計が 20 分速い: ${JSON.stringify(c)}`);
    // Data API は 6 回（detail 3 + list 3）。JWT の期限がいつも「30 秒以内」に見えるので毎回取り直す
    expect(c['auth:token']).toBe(6);
  });
});

test.describe('オフライン → 復帰', () => {
  test('一覧: 開いたままオフラインにして絞り込み → 「読み込みに失敗しました」、復帰して「再試行」→ 表示', async ({ page, context }) => {
    await guard(context);
    const fake = await installFake(page);
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row').first()).toBeVisible();
    fake.opts.list = 'fail';
    await page.getByRole('button', { name: /Answers|回答/ }).first().click();
    await expect(page.getByText('読み込みに失敗しました')).toBeVisible();
    fake.opts.list = 200;
    await page.getByRole('button', { name: '再試行' }).click();
    await expect(page.locator('.spot-row').first()).toBeVisible();
  });

  test('回答画面: オフラインで送信 → エラー、入力（塗り）は残る。復帰して再送信 → 1 回だけ保存', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await guard(context);
    const fake = await installFake(page);
    await page.goto(`${ORIGIN}/s/${POST_ID}/answer`);
    await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
    await page.getByRole('button', { name: /^AA / }).click();
    // 送信だけ通信エラーにする（Data API のホストへの通信を止める）
    const cut = (r: Route): Promise<void> => (r.request().method() === 'OPTIONS' ? r.fallback() : r.abort('internetdisconnected'));
    await page.route('**/answers', cut);
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/answer$`));
    expect(fake.inserts).toHaveLength(0);
    // 復帰（後から登録した経路を外して、偽の応答に戻す）
    await page.unroute('**/answers', cut);
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(new RegExp(`/result$`), { timeout: 10_000 });
    expect(fake.inserts).toHaveLength(1);
  });

  test('Context の setOffline: 開いたまま切ると、自サイトの資産は読み込み済みで画面は動き、Data API だけ失敗する', async ({ page, context }) => {
    await guard(context);
    await installFake(page);
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row').first()).toBeVisible();
    await context.setOffline(true);
    await page.locator('.spot-row').first().click();
    // オフラインでも route の偽の応答は返る（Playwright の仕様）ので、ここでは画面が壊れないことだけを見る
    await expect(page.locator('main')).toBeVisible();
    await context.setOffline(false);
  });
});
