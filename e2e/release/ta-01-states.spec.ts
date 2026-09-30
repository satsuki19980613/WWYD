/**
 * T-A A-01: ログイン画面と全画面の状態（未ログイン・ログイン失敗 ?error=・メンテナンス・オフライン・利用不可・404・?devstate=）と、
 * 状態ごとの ⓘ（09 章の対応表）。PC（テスト名そのまま）とスマホ（@sp）の両方で回す。
 */
import { expect, test } from '@playwright/test';
import { fakeBackend, healthAs, watchErrors, whoamiAs, AUTH } from './taKit.ts';

const VARIANTS = ['', ' @sp'] as const;

for (const v of VARIANTS) {
  test.describe(`A-01 状態${v}`, () => {
    test(`未ログイン: 名前・説明 1 行・ボタン・規約リンク。アカウントとヘッダーの下書きは出ない${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      await fakeBackend(page, null, { signedIn: false });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'WWYD' })).toBeVisible();
      await expect(page.getByText(/^Poker の Hand を投稿し、Hero の手番で/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeEnabled();
      await expect(page.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms');
      await expect(page.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy');
      await expect(page.getByRole('button', { name: 'アカウント' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /^下書き/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /Post/ })).toHaveCount(0);
      // 画面に出ている文字は、名前・説明 1 行・ボタン・規約リンクだけ（不変条件 1 の例外は説明 1 行のみ）
      const text = (await page.locator('main').innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
      expect(text).toHaveLength(5);
      expect(errors).toEqual([]);
    });

    test(`未ログイン: ⓘ はログインの節（WWYD・ログイン）。Esc と「閉じる」で閉じる${v}`, async ({ page }) => {
      await fakeBackend(page, null, { signedIn: false });
      await page.goto('/');
      await page.getByRole('button', { name: 'インフォメーション' }).click();
      const dlg = page.getByRole('dialog', { name: 'ログイン' });
      await expect(dlg).toBeVisible();
      await expect(dlg.locator('dt')).toHaveText(['WWYD', 'ログイン']);
      await expect(dlg.locator('dd').first()).toContainText('Hero の手番');
      await expect(dlg.locator('dd').nth(1)).toContainText('表示名とメールアドレスは投稿や回答と一緒には保存しない');
      await page.keyboard.press('Escape');
      await expect(dlg).toHaveCount(0);
      await page.getByRole('button', { name: 'インフォメーション' }).click();
      await dlg.getByRole('button', { name: '閉じる' }).click();
      await expect(dlg).toHaveCount(0);
      // 閉じたらフォーカスは ⓘ に戻る
      await expect(page.getByRole('button', { name: 'インフォメーション' })).toBeFocused();
    });

    test(`?error=login_failed: 「ログインできませんでした」を出し、URL からパラメータを消す${v}`, async ({ page }) => {
      await fakeBackend(page, null, { signedIn: false });
      await page.goto('/?error=login_failed&error_description=x');
      await expect(page.getByRole('alert').filter({ hasText: 'ログインできませんでした' })).toBeVisible();
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeEnabled();
    });

    test(`?error= だけでも失敗として扱う。元のパス・ほかのクエリは残す${v}`, async ({ page }) => {
      await fakeBackend(page, null, { signedIn: false });
      await page.goto('/?tab=mine&error=access_denied');
      await expect(page.getByText('ログインできませんでした')).toBeVisible();
      await expect(page).toHaveURL('/?tab=mine');
    });

    test(`ログインの開始に失敗したら「ログインできませんでした」。ボタンは押し直せる${v}`, async ({ page }) => {
      const be = await fakeBackend(page, null, { signedIn: false });
      await page.goto('/');
      // 偽のバックエンドは /sign-in/social に 404 を返す
      await page.getByRole('button', { name: /^Google でログイン/ }).click();
      await expect(page.getByText('ログインできませんでした')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Google でログイン', exact: true })).toBeEnabled();
      expect(be.calls).toEqual([]);
    });

    test(`未ログインでも規約・プライバシーポリシーは開ける（アカウントのボタンなし。ⓘ はアカウントの節）${v}`, async ({ page }) => {
      await fakeBackend(page, null, { signedIn: false });
      await page.goto('/terms');
      await expect(page.getByRole('heading', { level: 1, name: /利用規約/ })).toBeVisible();
      await page.getByRole('button', { name: 'インフォメーション' }).click();
      const dlg = page.getByRole('dialog', { name: 'アカウント' });
      await expect(dlg.locator('dt')).toHaveText(['アカウント削除']);
      await page.keyboard.press('Escape');
      await page.goto('/privacy');
      await expect(page.getByRole('heading', { level: 1, name: /プライバシーポリシー/ })).toBeVisible();
    });
  });

  test.describe(`A-01 バックエンドの状態${v}`, () => {
    test(`ヘルスチェックが 5xx → メンテナンス中（再読み込みのボタン）。ⓘ はアプリの説明（タイトル WWYD）${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      await fakeBackend(page, null);
      await healthAs(page, 503);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'メンテナンス中' })).toBeVisible();
      await expect(page.getByRole('button', { name: '再読み込み' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'アカウント' })).toHaveCount(0);
      await page.getByRole('button', { name: 'インフォメーション' }).click();
      const dlg = page.getByRole('dialog', { name: 'WWYD' });
      await expect(dlg.locator('dt')).toHaveText(['WWYD', 'ログイン']);
      await page.keyboard.press('Escape');
      expect(errors).toEqual([]);
    });

    test(`到達できない（接続拒否）→ メンテナンス中。再読み込みで回復する${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await healthAs(page, 'abort');
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'メンテナンス中' })).toBeVisible();
      await page.unroute('**/api/auth/ok');
      await page.getByRole('button', { name: '再読み込み' }).click();
      await expect(page.getByRole('link', { name: /Post/ }).first()).toBeVisible();
    });

    test(`オフライン（navigator.onLine=false かつ通信失敗）→「オフラインです」${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
      await healthAs(page, 'abort');
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'オフラインです' })).toBeVisible();
      await expect(page.getByRole('button', { name: '再読み込み' })).toBeVisible();
    });

    test(`whoami が allowed=false → 「このアカウントは利用できません」と「ログアウト」。ログアウトでログイン画面${v}`, async ({ page }) => {
      const be = await fakeBackend(page, null);
      await whoamiAs(page, 200, { allowed: false, admin: false });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'このアカウントは利用できません' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'アカウント' })).toHaveCount(0);
      await page.getByRole('button', { name: 'ログアウト' }).click();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
      expect(be.calls).toEqual(['sign-out']);
    });

    test(`whoami が 5xx → メンテナンス中、401 → ログイン画面${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await whoamiAs(page, 500, { code: 'XX000', message: 'boom' });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'メンテナンス中' })).toBeVisible();
      await page.unroute(`${'http://data.e2e.test'}/rpc/whoami`);
      await whoamiAs(page, 401, { code: 'PGRST301', message: 'JWT expired' });
      await page.reload();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
    });

    test(`get-session が 500 → メンテナンス中（ログイン画面にしない）${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.route('**/api/auth/get-session', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'メンテナンス中' })).toBeVisible();
    });

    test(`F-015 get-session が 429（混み合っている）→ メンテナンス中（ログイン画面にしない）${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.route('**/api/auth/get-session', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{}' }));
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'メンテナンス中' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toHaveCount(0);
    });

    test(`F-016 get-session が応答しない → 打ち切ってメンテナンス中（起動画面のまま待ち続けない）${v}`, async ({ page }) => {
      test.setTimeout(40_000);
      await fakeBackend(page, null);
      await page.route('**/api/auth/get-session', () => undefined);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'メンテナンス中' })).toBeVisible({ timeout: 20_000 });
    });

    test(`404: 知らないパスは「ページが見つかりません」＋「一覧へ」${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      await fakeBackend(page, null);
      for (const p of ['/nope', '/s/', '/s/a%20b', '/s/x/y', '/new/x', '/answer']) {
        await page.goto(p);
        await expect(page.getByRole('heading', { name: 'ページが見つかりません' }), p).toBeVisible();
      }
      await page.getByRole('button', { name: '一覧へ' }).click();
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('link', { name: /Post/ }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`404 でもヘッダーの ⓘ・アカウントは使える（ⓘ はログインの節でタイトル WWYD）${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.goto('/nope');
      await page.getByRole('button', { name: 'インフォメーション' }).click();
      await expect(page.getByRole('dialog', { name: 'WWYD' })).toBeVisible();
    });

    test(`末尾のスラッシュは 1 つだけ許す（/new/ は投稿、/new// は 404）${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.goto('/new/');
      await expect(page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' })).toBeVisible();
      await page.goto('/new//');
      await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
    });
  });

  test.describe(`A-01 ?devstate=${v}`, () => {
    for (const [state, title, button] of [
      ['maintenance', 'メンテナンス中', '再読み込み'],
      ['offline', 'オフラインです', '再読み込み'],
      ['unavailable', 'このアカウントは利用できません', 'ログアウト'],
    ] as const) {
      test(`?devstate=${state}${v}`, async ({ page }) => {
        await fakeBackend(page, null);
        await page.goto(`/?devstate=${state}`);
        await expect(page.getByRole('heading', { name: title })).toBeVisible();
        await expect(page.getByRole('button', { name: button })).toBeVisible();
        // 6 章の文言以外は出さない: 見出しとボタンだけ
        const text = (await page.locator('main').innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
        expect(text).toEqual([title, button]);
      });
    }

    test(`?devstate=signedOut はログイン画面、booting はロゴだけ（文字なし）、ready は一覧${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.goto('/?devstate=signedOut');
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
      await page.goto('/?devstate=booting');
      expect((await page.locator('body').innerText()).trim()).toBe('');
      await page.goto('/?devstate=ready');
      await expect(page.getByRole('link', { name: /Post/ }).first()).toBeVisible();
    });
  });
}

test('AUTH の直接呼び出しは無い（認証は自サイトの /api/auth 経由。fakeBackend が direct: を記録する）', async ({ page }) => {
  const be = await fakeBackend(page, null);
  const direct: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(AUTH)) direct.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Post/ }).first()).toBeVisible();
  expect(direct).toEqual([]);
  expect(be.calls).toEqual([]);
});
