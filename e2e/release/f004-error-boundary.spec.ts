/**
 * F-004: 画面の描画中に予期しない例外が起きても真っ白にせず、「表示できませんでした」と再読み込みのボタンを出す。
 * 例外は ResizeObserver を壊して起こす（PC の回答画面の FitStage・スマホの高さの測りで使う）。
 */
import { expect, test } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';

for (const v of ['', ' @sp'] as const) {
  test(`F-004 回答画面の描画で例外が起きると「表示できませんでした」と再読み込み${v}`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        constructor() {
          throw new Error('試験: ResizeObserver を壊す');
        }
      };
    });
    await fakeBackend(page, detailJson(hs1bb(), { viewer: 'unanswered', id: ID, answerCount: 1 }));
    await page.goto(`/s/${ID}/answer`);
    await expect(page.getByRole('heading', { name: '表示できませんでした' })).toBeVisible();
    await expect(page.getByRole('button', { name: '再読み込み' })).toBeVisible();
  });
}
