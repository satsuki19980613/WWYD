/**
 * F-038: 横向きのスマホ（915×412）で、ログイン画面と、回答・集計の読み込み中の骨組みがページごとスクロールしない。
 */
import { expect, test, type Page } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { DATA, fakeBackend } from '../fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';

async function noPageScroll(page: Page, what: string): Promise<void> {
  const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  expect(m.sh, `${what}: scrollHeight ${m.sh} / innerHeight ${m.ih}`).toBeLessThanOrEqual(m.ih + 1);
}

for (const v of ['', ' @sp'] as const) {
  test(`F-038 横向き 915×412 でログイン画面がページごとスクロールしない${v}`, async ({ page }) => {
    await page.setViewportSize({ width: 915, height: 412 });
    await fakeBackend(page, null, { signedIn: false });
    await page.goto('/');
    await expect(page.locator('.login')).toBeVisible();
    await noPageScroll(page, 'login');
  });

  for (const path of ['answer', 'result'] as const) {
    test(`F-038 横向き 915×412 で${path === 'answer' ? '回答' : '集計'}の読み込み中がページごとスクロールしない${v}`, async ({ page }) => {
      await page.setViewportSize({ width: 915, height: 412 });
      await fakeBackend(page, detailJson(hs1bb(), { viewer: path === 'answer' ? 'unanswered' : 'answered', id: ID, answerCount: 1 }));
      // 詳細の応答を返さず、読み込み中のままにする
      await page.route(`${DATA}/rpc/get_post_detail`, () => undefined);
      await page.goto(`/s/${ID}/${path}`);
      await expect(page.locator('.hdr')).toBeVisible();
      await page.waitForTimeout(800);
      await noPageScroll(page, `${path} loading`);
    });
  }
}
