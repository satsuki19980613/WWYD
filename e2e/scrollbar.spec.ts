/**
 * スクロールバー（2026-09-30 さつき）: 細く（4px）、スクロールしている間だけ出す。styles/scrollbar.css・scrollIndicator.ts。
 */
import { expect, test } from '@playwright/test';
import { fakeBackend } from './fakeBackend.ts';
import { fakeList, row } from './release/taKit.ts';

for (const v of ['', ' @sp'] as const) {
  test(`ページのスクロールバーは 4px で、スクロールしている間だけ is-scrolling が付く${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await fakeList(page, Array.from({ length: 20 }, (_, i) => row(i + 1)));
    await page.goto('/');
    await expect(page.locator('.spot-link').first()).toBeVisible();
    const html = page.locator('html');
    // 幅（スマホの試験の端末はスクロールバーを重ねて描くので 0）
    const width = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
    expect(width).toBeLessThanOrEqual(4);
    await expect(html).not.toHaveClass(/is-scrolling/);
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 400);
    await expect(html).toHaveClass(/is-scrolling/);
    // 止まって少しすると消える
    await expect(html).not.toHaveClass(/is-scrolling/, { timeout: 3000 });
  });
}

test('画面の中でスクロールする枠（PC の投稿の左の列）も、スクロールしている間だけ', async ({ page }) => {
  await fakeBackend(page, null);
  await page.goto('/new');
  await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
  const col = page.locator('.pf-col').first();
  expect(await col.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await col.evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth)).toBeLessThanOrEqual(4);
  await col.evaluate((el) => el.scrollBy(0, 200));
  await expect(col).toHaveClass(/is-scrolling/);
  await expect(col).not.toHaveClass(/is-scrolling/, { timeout: 3000 });
});
