/**
 * T-A（探索）: 投稿の画面でブラウザの「戻る」を繰り返し「やめる」で取り消したとき、履歴（history）が積み上がらないか。
 * router.ts の popstate の止め方は、止めるたびに元の URL を pushState で積み直す。
 */
import { expect, test } from '@playwright/test';
import { fakeBackend } from './taKit.ts';
import { setPlayers } from './taPost.ts';

test('「戻る」を 3 回押して毎回「やめる」→ 履歴の長さは増えない（増えると「戻る」を何度も押さないと出られない）', async ({ page }) => {
  await fakeBackend(page, null);
  await page.goto('/');
  await page.getByRole('link', { name: /Post/ }).first().click();
  await expect(page).toHaveURL('/new');
  await setPlayers(page, 6);
  const before = await page.evaluate(() => history.length);
  for (let i = 0; i < 3; i++) {
    await page.goBack();
    await expect(page.getByRole('alertdialog', { name: '下書きに保存しますか' })).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'やめる' }).click();
    await expect(page).toHaveURL('/new');
  }
  const after = await page.evaluate(() => history.length);
  expect(after, `履歴の長さ ${before} → ${after}`).toBe(before);
});

// 既知の S4（docs/release-test/findings.md F-027）。直すまで fixme
test.fixme('ブラウザの「戻る」→「保存しない」で一覧へ出たあと、もう一度「戻る」を押しても、捨てた /new には戻らない（S4: 履歴に /new が残る）', async ({ page }) => {
  await fakeBackend(page, null);
  await page.goto('/');
  await page.getByRole('link', { name: /Post/ }).first().click();
  await setPlayers(page, 6);
  await page.goBack();
  await page.getByRole('alertdialog').getByRole('button', { name: '保存しない' }).click();
  await expect(page).toHaveURL('/');
  await page.goBack();
  await expect(page).not.toHaveURL('/new');
});
