/**
 * 投稿の下書き（詳細仕様 14 章 §3.5。2026-09-29）の E2E。下書きは端末のブラウザ（localStorage）に利用者ごとに 3 件まで。
 * 投稿の画面を離れるときに「下書きに保存しますか」、いっぱいならどれかを消すダイアログ、ヘッダーの下書きのボタンと下書きの画面。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend, UID } from './fakeBackend.ts';

const KEY = `wwyd.drafts.v1.${UID}`;

/** 投稿の画面で人数とタイトルだけ入れる（何か入っている＝離れるときに聞く） */
async function startPost(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: /Post/ }).first().click();
  await expect(page).toHaveURL('/new');
  await step(page, /^2\s*Player$/);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6' }).click();
  await step(page, /^4\s*Spot$/);
  await page.getByPlaceholder(/タイトル/).fill(title);
}

/** スマホはステップを移る（PC は全部の節が並んでいるので何もしない） */
async function step(page: Page, name: RegExp): Promise<void> {
  const b = page.getByRole('button', { name });
  if ((await b.count()) > 0) await b.click();
}

const leaveDialog = (page: Page) => page.getByRole('alertdialog', { name: '下書きに保存しますか' });
const draftsButton = (page: Page) => page.getByRole('link', { name: /^下書き/ });

test.beforeEach(async ({ page }) => {
  await fakeBackend(page, null);
});

test('離れるときに保存 → ヘッダーの下書き → 開くと続きから @sp', async ({ page }) => {
  await startPost(page, '下書きの試験');
  await page.getByRole('link', { name: '一覧へ' }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
  await expect(page).toHaveURL('/');
  await expect(draftsButton(page)).toHaveAccessibleName('下書き（1件）');

  await draftsButton(page).click();
  await expect(page).toHaveURL('/drafts');
  await expect(page.getByText('1 / 3')).toBeVisible();
  await page.getByRole('link', { name: '下書きの試験' }).click();
  await expect(page).toHaveURL('/new');
  // 人数とタイトルが戻っている。変えずに離れれば聞かない
  await step(page, /^2\s*Player$/);
  await expect(page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '一覧へ' }).click();
  await expect(page).toHaveURL('/');
  await expect(leaveDialog(page)).toHaveCount(0);
});

test('保存しない → 入力は空に。やめる → 留まる', async ({ page }) => {
  await startPost(page, 'すてる');
  await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
  await leaveDialog(page).getByRole('button', { name: 'やめる' }).click();
  await expect(page).toHaveURL('/new');
  await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
  await leaveDialog(page).getByRole('button', { name: '保存しない' }).click();
  await expect(page).toHaveURL('/');
  await expect(draftsButton(page)).toHaveAccessibleName('下書き（0件）');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  // 戻ると空から
  await page.getByRole('link', { name: /Post/ }).first().click();
  await step(page, /^4\s*Spot$/);
  await expect(page.getByPlaceholder(/タイトル/)).toHaveValue('');
});

test('ブラウザの戻るでも聞く', async ({ page }) => {
  await startPost(page, '戻る');
  await page.goBack();
  await expect(leaveDialog(page)).toBeVisible();
  await expect(page).toHaveURL('/new');
  await leaveDialog(page).getByRole('button', { name: '保存しない' }).click();
  await expect(page).toHaveURL('/');
});

test('3 件あれば、どれかを消してから保存する', async ({ page }) => {
  const saved = ['一', '二', '三'].map((t, i) => ({
    id: `d${i}`,
    savedAt: `2026-09-29T0${i}:00:00.000Z`,
    draft: { title: `古い下書き${t}`, players: 6 },
  }));
  await page.addInitScript(([k, v]) => localStorage.setItem(k as string, v as string), [KEY, JSON.stringify(saved)]);
  await startPost(page, '新しい下書き');
  await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
  await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
  const full = page.getByRole('alertdialog', { name: '下書きがいっぱいです' });
  await expect(full.getByRole('listitem')).toHaveCount(3);
  await full.getByRole('listitem').filter({ hasText: '古い下書き一' }).getByRole('button', { name: '削除' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '削除して保存' }).click();
  await expect(page).toHaveURL('/');
  await draftsButton(page).click();
  await expect(page.getByRole('link', { name: '新しい下書き' })).toBeVisible();
  await expect(page.getByRole('link', { name: '古い下書き一' })).toHaveCount(0);
  await expect(page.getByText('3 / 3')).toBeVisible();
});

test('下書きの画面: 無ければ「下書きなし」。削除は確かめてから', async ({ page }) => {
  await page.goto('/drafts');
  await expect(page.getByText('下書きなし')).toBeVisible();
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify([{ id: 'a', savedAt: '2026-09-29T00:00:00.000Z', draft: { title: '消す' } }])), KEY);
  await page.reload();
  await page.getByRole('button', { name: '削除' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
  await expect(page.getByText('下書きなし')).toBeVisible();
});
