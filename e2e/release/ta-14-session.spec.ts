/**
 * T-A（探索）: 使っている途中でログインが切れたとき（JWT の期限切れ・別の端末でのログアウト・サーバーのセッション切れ）の振る舞い。
 * 06 章 §7: `not_authenticated` →「ログインし直してください」＋ログイン画面へ。
 * 回答前の集計を返さない・未ログインでは何も読めない（不変条件 8）は、サーバー側（pgTAP・T-C）で確かめる。ここは画面の振る舞い。
 */
import { expect, test, type Page } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';
import { DATA, fulfillJson, row } from './taKit.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const NOT_AUTH = { code: 'P0001', message: 'not_authenticated', details: null, hint: null };
const JWT_EXPIRED = { code: 'PGRST301', message: 'JWT expired', details: null, hint: null };

async function expectLoginOrMessage(page: Page): Promise<void> {
  // 期待（06 章 §7）: ログイン画面へ移る、または少なくとも「ログインし直してください」と伝える
  const login = page.getByRole('button', { name: 'Google でログイン' });
  const msg = page.getByText('ログインし直してください');
  await expect(login.or(msg)).toBeVisible({ timeout: 5000 });
}

for (const v of ['', ' @sp'] as const) {
  test(`一覧の読み込みが not_authenticated / JWT 期限切れ → ログインし直しを促す（ログイン画面 or 文言）${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await page.route(`${DATA}/rpc/list_posts`, (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : fulfillJson(r, 401, JWT_EXPIRED)));
    await page.goto('/');
    await expectLoginOrMessage(page);
  });

  test(`回答画面の読み込みが not_authenticated → ログインし直しを促す${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await page.route(`${DATA}/rpc/get_post_detail`, (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : fulfillJson(r, 400, NOT_AUTH)));
    await page.goto(`/s/${ID}/answer`);
    await expectLoginOrMessage(page);
  });

  test(`回答の送信が not_authenticated → 文言「ログインし直してください」（塗りは残る）${v}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, detailJson(hs1bb(), { viewer: 'unanswered', id: ID }));
    await page.route(`${DATA}/answers`, (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : fulfillJson(r, 400, NOT_AUTH)));
    await page.goto(`/s/${ID}/answer`);
    if ((page.viewportSize()?.width ?? 1280) < 700) await page.getByRole('tab', { name: 'Range' }).click();
    await page.getByRole('button', { name: /^AA / }).click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page.getByText('ログインし直してください')).toBeVisible();
    await expect(page.getByRole('button', { name: /^AA / })).toHaveAccessibleName('AA Call 100%');
  });

  test(`使っている途中で /api/auth/token が 401（セッション切れ）でも、画面の中で操作を続けると、ログインし直しを促す（ログイン画面 or 文言）${v}`, async ({ page }) => {
    const be = await fakeBackend(page, null);
    void be;
    await page.route(`${DATA}/rpc/list_posts`, (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : fulfillJson(r, 200, [row(1)])));
    await page.goto('/');
    await expect(page.locator('.spot-link')).toHaveCount(1);
    // セッションが切れる: token は 401、get-session は null
    await page.route('**/api/auth/token', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/auth/get-session', (r) => fulfillJson(r, 200, null));
    await page.route(`${DATA}/rpc/list_posts`, (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : fulfillJson(r, 401, JWT_EXPIRED)));
    // 画面の中で「自分の投稿」へ切り替える（再読み込みはしない。再読み込みならログイン画面になる）
    if ((page.viewportSize()?.width ?? 1280) < 700) await page.getByRole('tab', { name: '自分の投稿' }).click();
    else await page.getByRole('group', { name: '範囲' }).getByRole('button', { name: '自分の投稿' }).click();
    await expectLoginOrMessage(page);
  });
}
