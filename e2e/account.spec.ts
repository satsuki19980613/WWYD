/**
 * アカウントメニュー・ログアウト・アカウント削除・規約ページの E2E（詳細仕様 06 章 §0.2・§6。plan.md P8）。
 * バックエンドは偽物（fakeBackend.ts）。サーバー側の削除の中身（DB-16）は pgTAP で確かめている。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend, type Backend } from './fakeBackend.ts';

async function open(page: Page, path = '/'): Promise<Backend> {
  const be = await fakeBackend(page, null);
  await page.goto(path);
  await expect(page.getByRole('button', { name: 'アカウント' })).toBeVisible();
  return be;
}

const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name });

test.describe('アカウントメニュー（06 章 §0.2）', () => {
  test('規約・プライバシーポリシーへ移れる', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'アカウント' }).click();
    await menuItem(page, '利用規約').click();
    await expect(page).toHaveURL('/terms');
    await expect(page.getByRole('heading', { level: 1, name: /利用規約/ })).toBeVisible();

    await page.getByRole('button', { name: 'アカウント' }).click();
    await menuItem(page, 'プライバシーポリシー').click();
    await expect(page).toHaveURL('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: /プライバシーポリシー/ })).toBeVisible();
  });

  test('ログアウト → ログイン画面', async ({ page }) => {
    const be = await open(page);
    await page.getByRole('button', { name: 'アカウント' }).click();
    await menuItem(page, 'ログアウト').click();
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'アカウント' })).toHaveCount(0);
    // Google の同意画面の要件: ログイン画面でアプリの機能を説明し、規約へリンクする
    await expect(page.getByText(/^ポーカーのスポットを投稿し、Villain のレンジを/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'プライバシーポリシー' })).toBeVisible();
    expect(be.calls).toEqual(['sign-out']);
  });
});

test.describe('アカウント削除（06 章 §6.1）', () => {
  test('やめる: 何もしない', async ({ page }) => {
    const be = await open(page);
    await page.getByRole('button', { name: 'アカウント' }).click();
    await menuItem(page, 'アカウントを削除').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('アカウントを削除しますか');
    await expect(dialog).toContainText('投稿と回答がすべて削除されます。元には戻せません。');
    await dialog.getByRole('button', { name: 'やめる' }).click();
    await expect(dialog).toHaveCount(0);
    expect(be.calls).toEqual([]);
  });

  test('削除する → delete_my_account → ログアウト → ログイン画面（一覧の URL）', async ({ page }) => {
    const be = await open(page, '/new');
    await page.getByRole('button', { name: 'アカウント' }).click();
    await menuItem(page, 'アカウントを削除').click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(be.calls).toEqual(['delete_my_account', 'sign-out']);
  });

  test('失敗したら「削除できませんでした」、ログインしたまま', async ({ page }) => {
    const be = await open(page);
    be.deleteAccountError = { status: 500, body: { code: 'XX000', message: 'boom', details: null, hint: null } };
    await page.getByRole('button', { name: 'アカウント' }).click();
    await menuItem(page, 'アカウントを削除').click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page.getByText('削除できませんでした')).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'アカウント' })).toBeVisible();
    expect(be.calls).toEqual(['delete_my_account']);
  });
});

test.describe('規約ページ（06 章 §6.2）', () => {
  test('ログインしていなくても開ける', async ({ page }) => {
    await fakeBackend(page, null, { signedIn: false });
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: /プライバシーポリシー/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'アカウント' })).toHaveCount(0);
  });
});
