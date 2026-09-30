/**
 * F-035: ブラウザのタブの名前（document.title）を画面ごとにする。回答・結果は投稿のタイトル。
 */
import { expect, test } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';

test('F-035 タブの名前: 一覧は List、Post は Post、回答は投稿のタイトル、未ログインは WWYD', async ({ page }) => {
  await fakeBackend(page, detailJson(hs1bb(), { viewer: 'unanswered', id: ID, answerCount: 1 }));
  await page.goto('/');
  await expect(page).toHaveTitle('List · WWYD');
  await page.goto('/new');
  await expect(page).toHaveTitle('Post · WWYD');
  await page.goto(`/s/${ID}/answer`);
  await expect(page).toHaveTitle(`${hs1bb().title as string} · WWYD`);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await fakeBackend(page, null, { signedIn: false });
  await page.goto('/');
  await expect(page).toHaveTitle('WWYD');
});
