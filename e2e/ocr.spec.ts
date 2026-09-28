/**
 * 画像読み込み（OCR）の E2E（詳細仕様 06 章 §3.9・07 章 §5。plan.md T-904）。
 * 実際の T4 の画像は個人の対戦画像なのでリポジトリに置けない。ここでは T4 ではない画像で、
 * 置き換えの確認・読み取り中の表示・「読み取れませんでした」と、**通信が自サイトだけ**であることを確かめる
 * （認識エンジン・学習データを含む。Worker の中の通信も数える）。読み取りの正しさは scripts/ocr/accuracy.mts と単体テスト。
 */
import { expect, test } from '@playwright/test';
import { AUTH, DATA, fakeBackend } from './fakeBackend.ts';

// 1×1 の灰色の PNG（T4 の画像ではない）
const NOT_T4 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('T4 ではない画像は「読み取れませんでした」。入力は残り、通信は自サイトだけ', async ({ page, baseURL }) => {
  const urls: string[] = [];
  page.context().on('request', (req) => urls.push(req.url()));
  await fakeBackend(page, null);
  await page.goto('/new');

  const title = page.getByPlaceholder('タイトル（40文字まで）');
  await title.fill('残る');

  // 先にゲームの種類を選ぶ。入力中の内容があれば置き換わることを示す
  const open = page.getByRole('button', { name: 'T4ハンドヒストリー画像を読み込む' });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'T4 のゲーム' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('入力中の内容は画像の内容に置き換わります。')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^通常\s*レーキ 5%（4bb cap）$/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^エキスパート\s*レーキ 5%（0\.6bb cap）$/ })).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).toHaveCount(0);

  await open.click();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: /^エキスパート/ }).click();
  await (await chooser).setFiles({ name: 'x.png', mimeType: 'image/png', buffer: NOT_T4 });
  await expect(page.getByRole('alert').filter({ hasText: '読み取れませんでした' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('dialog', { name: '読み取り中…' })).toHaveCount(0);
  await expect(title).toHaveValue('残る');

  // 認識エンジン・学習データ・Worker は自サイトの /ocr/ から読む（CDN を使わない）
  const own = new URL(baseURL ?? '').origin;
  expect(urls.some((u) => u === `${own}/ocr/worker.min.js`)).toBe(true);
  expect(urls.some((u) => /\/ocr\/core\/tesseract-core-(relaxedsimd-|simd-)?lstm\.wasm\.js$/.test(u))).toBe(true);
  expect(urls.some((u) => u === `${own}/ocr/lang/eng.traineddata.gz`)).toBe(true);
  const allowed = new Set([own, new URL(AUTH).origin, new URL(DATA).origin]);
  const outside = urls.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && !allowed.has(new URL(u).origin));
  expect(outside).toEqual([]);
});

test('読み取り中はキャンセルできる（入力はそのまま） @sp', async ({ page }) => {
  // 学習データの応答を遅らせて、読み取り中の状態を保つ
  await page.context().route('**/ocr/lang/**', async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue().catch(() => undefined);
  });
  await fakeBackend(page, null);
  await page.goto('/new');
  // スマホは 1 ステップ目（基本設定）の上にボタンがある
  await expect(page.getByRole('button', { name: 'T4ハンドヒストリー画像を読み込む' })).toBeVisible();
  await page.getByTestId('ocr-file').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: NOT_T4 });
  const busy = page.getByRole('dialog', { name: '読み取り中…' });
  await expect(busy).toBeVisible();
  await busy.getByRole('button', { name: 'キャンセル' }).click();
  await expect(busy).toHaveCount(0);
  // 取り消した読み取りの結果は反映しない（エラーも出さない）
  await page.waitForTimeout(1500);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
