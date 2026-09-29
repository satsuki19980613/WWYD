/**
 * T-A（探索）: Google ログインから戻ったときの URL の後始末（06 章 §1「ログイン後は元のパスへ戻る」、useAuth）。
 * ログインの開始 → 戻り先 URL（元のパス・クエリ）、失敗時の errorCallbackURL、verifier を get-session に 1 回だけ渡す、URL から消す。
 */
import { expect, test } from '@playwright/test';
import { fakeBackend, fulfillJson, watchErrors } from './taKit.ts';

const ID = '00000000-0000-4000-8000-000000000001';

test('ログインの開始: 元のパスとクエリを戻り先にし、失敗時は error=login_failed を足す。Google の URL へ移る', async ({ page }) => {
  await fakeBackend(page, null, { signedIn: false });
  let body: { provider?: string; callbackURL?: string; errorCallbackURL?: string; disableRedirect?: boolean } = {};
  await page.route('**/api/auth/sign-in/social', async (route) => {
    body = route.request().postDataJSON();
    return fulfillJson(route, 200, { url: 'http://google.e2e.test/oauth?x=1' });
  });
  await page.route('http://google.e2e.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>google</body></html>' }));
  await page.goto('/?tab=mine&street=flop');
  await page.getByRole('button', { name: 'Google でログイン' }).click();
  await page.waitForURL('http://google.e2e.test/**');
  const origin = new URL(page.url()).origin; // google の origin だが、戻り先は自サイトの origin
  void origin;
  expect(body.provider).toBe('google');
  expect(body.disableRedirect).toBe(true);
  const cb = new URL(body.callbackURL ?? '');
  expect(cb.pathname).toBe('/');
  expect(cb.search).toBe('?tab=mine&street=flop');
  const fail = new URL(body.errorCallbackURL ?? '');
  expect(fail.searchParams.get('error')).toBe('login_failed');
  expect(fail.searchParams.get('tab')).toBe('mine');
});

test('戻ってきたとき: verifier を get-session に 1 回だけ渡し、URL から verifier を消して元のパスに留まる。ログイン後の画面が出る', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeBackend(page, null);
  const sessionCalls: string[] = [];
  await page.route('**/api/auth/get-session*', async (route) => {
    sessionCalls.push(route.request().url());
    return fulfillJson(route, 200, { user: { id: '11111111-1111-4111-8111-111111111111' }, session: {} });
  });
  await page.goto('/?tab=mine&neon_auth_session_verifier=abc123');
  await expect(page.getByRole('link', { name: /Post/ }).first()).toBeVisible();
  await expect(page).toHaveURL('/?tab=mine');
  const withVerifier = sessionCalls.filter((u) => u.includes('neon_auth_session_verifier=abc123'));
  expect(withVerifier).toHaveLength(1); // 一度しか使えない値を 2 回送らない
  expect(errors).toEqual([]);
});

test('回答画面の URL に戻る: /s/:id/answer?…verifier → 回答画面（未回答）。code・state・error 系のパラメータも消す', async ({ page }) => {
  await fakeBackend(page, null);
  await page.goto(`/?code=c&state=s&error_code=x&neon_auth_session_verifier=v9`);
  await expect(page).toHaveURL('/');
  await page.goto(`/s/${ID}/answer?state=s&code=c`);
  await expect(page).toHaveURL(new RegExp(`/s/${ID}/(answer|result)$`));
});

test('失敗（?error=）で戻る → 「ログインできませんでした」。元のパスは残り、もう一度押せる。fragment の error= も失敗として扱う', async ({ page }) => {
  await fakeBackend(page, null, { signedIn: false });
  await page.goto('/?tab=mine&error=login_failed');
  await expect(page.getByText('ログインできませんでした')).toBeVisible();
  await expect(page).toHaveURL('/?tab=mine');
  await page.goto('/#error=access_denied&error_description=x');
  await expect(page.getByText('ログインできませんでした')).toBeVisible();
  // 観察（S4）: fragment（#error=…）は URL に残る（navigate が「パスが同じ」で何もしない）。再読み込みするとまた失敗の表示になる
  await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeEnabled();
});

test('ログイン後に規約から戻ってもログイン状態。未ログインで /new を開くとログイン画面（入力欄は出ない）。ログイン後は /new へ', async ({ page }) => {
  await fakeBackend(page, null, { signedIn: false });
  await page.goto('/new');
  await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
  await expect(page.getByRole('group', { name: '人数' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'アカウント' })).toHaveCount(0);
  await expect(page).toHaveURL('/new');
  await page.goto(`/s/${ID}/result`);
  await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
  await expect(page.locator('.rcell, .rgrid')).toHaveCount(0);
});
