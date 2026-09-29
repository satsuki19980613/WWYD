/**
 * T-A A-09 / A-10: アカウント（メニュー・ログアウト・アカウント削除の確認と失敗）、利用規約・プライバシーポリシー、
 * ⓘ（各画面の節。09 章の確定稿と一致するか）、キー操作の入力欄・モーダルの除外（17 章）。
 * PC は既定、スマホは @sp。
 */
import { expect, test, type Page } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from './taKit.ts';
import { fulfillJson } from './taKit.ts';
import { setPlayers, setTitle } from './taPost.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const VARIANTS = ['', ' @sp'] as const;

/** 09 章の確定稿（見出し → 本文）。画面の文字と一字一句そろうこと */
const INFO: Record<string, { title: string; items: [string, string][] }> = {
  list: {
    title: 'List',
    items: [
      ['開く', '未回答は回答へ、回答済みは集計へ。集計は回答するまで見られない。'],
      ['削除', 'ごみ箱で自分の投稿を削除する（回答も消える。元に戻せない）。'],
      ['キー（PC）', '↑ ↓（j k）で行を移り、Enter で開く。'],
    ],
  },
  answer: {
    title: 'Range 入力',
    items: [
      ['回答', 'Hero の席で、この Spot の Range を塗る。塗らないマスは Range 外。'],
      ['SPOT', '卓の SPOT とバーの黄の目盛りが出題の局面。Hero の Hand は回答後に見られる。'],
      ['色', '赤は Fold、シアンは Check・Call、黄は Bet・Raise。'],
      ['ブラシ', 'バーの境界をドラッグすると混合（5% 刻み）。同じ頻度のマスを押すと消える。長押しでそのマスの頻度を読み込む。'],
      ['Size', '% は Call した後の Pot に対する割合。'],
      ['送信', '1 Spot に 1 回。送信後は変えられない。'],
      ['キー（PC）', '← → で 1 手、Home で最初、End で Spot。Ctrl+Z・Ctrl+Y で戻す・やり直す。B でブラシ、E で消しゴム。'],
    ],
  },
  result: {
    title: '集計',
    items: [
      ['色', 'マスの色の割合が回答者の平均の頻度。赤は Fold、シアンは Check・Call、黄は Bet・Raise。'],
      ['濃さ', 'その Hand を Range に入れた回答者の割合。薄いほど少ない。'],
      ['白枠', 'Hero の実際の Hand。'],
      ['自分との差', '全体との違い（黄が濃いほど違う）。正解・不正解ではない。'],
      ['SPOT', '卓の SPOT とバーの黄の目盛りが出題の局面。'],
      ['キー（PC）', '← → で 1 手、Home で最初、End で最後。マスにマウスを乗せると内訳（押すと固定）。'],
    ],
  },
  new: {
    title: 'Post',
    items: [
      ['画像読み込み', 'T4 の Hand History の画像を端末の中で読み取る。画像は保存も送信もしない。'],
      ['投稿できない Hand', 'Flop 以降に Hero の Action が無い Hand と、Preflop で All-in になった Hand。'],
      ['Hand', '分かっている Hand だけ入れる（Hero は必須）。入れていない席は Showdown で Muck。'],
      ['Card キーボード', 'Q を押したまま上で K・左で T・下で J。♠ を押したまま上で ♥・左で ♦・下で ♣。'],
      ['入れ直し', 'ログの Action や卓の Board の Card を押すと、そこから入れ直す。'],
      ['設定の変更', '設定・人数・Stack・Hero は Action の後も変えられる。合わなくなった Action は外れる。'],
      ['キー（PC）', 'Card はキーでも打てる（A → s）。Ctrl+Z・Ctrl+Y で Action を戻す・進める。'],
    ],
  },
  drafts: { title: '下書き', items: [['下書き', '3 件まで、この端末のブラウザに保存する。投稿すると消える。']] },
  account: { title: 'アカウント', items: [['アカウント削除', '投稿と回答をすべて消す（元に戻せない）。']] },
};

const PAGES: [string, string, keyof typeof INFO][] = [
  ['/', 'List（一覧）', 'list'],
  [`/s/${ID}/answer`, '回答', 'answer'],
  [`/s/${ID}/result`, '集計', 'result'],
  ['/new', 'Post', 'new'],
  ['/drafts', '下書き', 'drafts'],
  ['/terms', '利用規約', 'account'],
  ['/privacy', 'プライバシーポリシー', 'account'],
];

async function boot(page: Page, path: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const answeredDetail = detailJson(hs1bb(), { viewer: 'answered', id: ID, answerCount: 1 });
  const unansweredDetail = detailJson(hs1bb(), { viewer: 'unanswered', id: ID });
  await fakeBackend(page, path.endsWith('/result') ? answeredDetail : unansweredDetail);
  await page.goto(path);
}

for (const v of VARIANTS) {
  test.describe(`A-09 ⓘ の節${v}`, () => {
    for (const [path, name, key] of PAGES) {
      test(`${name}（${path}）の ⓘ は「${INFO[key]!.title}」の節で、09 章の確定稿と一字一句同じ${v}`, async ({ page }) => {
        await boot(page, path);
        await page.getByRole('button', { name: 'インフォメーション' }).click();
        const sec = INFO[key]!;
        const dlg = page.getByRole('dialog', { name: sec.title, exact: true });
        await expect(dlg).toBeVisible();
        await expect(dlg.locator('dt')).toHaveText(sec.items.map((i) => i[0]));
        await expect(dlg.locator('dd')).toHaveText(sec.items.map((i) => i[1]));
        // 1 項目 70 文字まで・1 節 7 項目まで（09 章）
        for (const [, d] of sec.items) expect([...d].length).toBeLessThanOrEqual(70);
        expect(sec.items.length).toBeLessThanOrEqual(7);
        await dlg.getByRole('button', { name: '閉じる' }).click();
        await expect(dlg).toHaveCount(0);
      });
    }

    test(`アカウントメニューを開いたまま ⓘ を押すとアカウントの節（メニューは閉じる）${v}`, async ({ page }) => {
      await boot(page, '/');
      await page.getByRole('button', { name: 'アカウント' }).click();
      await expect(page.getByRole('menu', { name: 'アカウント' })).toBeVisible();
      await page.getByRole('button', { name: 'インフォメーション' }).click();
      await expect(page.getByRole('dialog', { name: 'アカウント', exact: true })).toBeVisible();
      await expect(page.getByRole('menu', { name: 'アカウント' })).toHaveCount(0);
    });

    test(`ⓘ のモーダル: 初期フォーカスは「閉じる」。Tab はモーダルの中を巡る（Shift+Tab も）。Esc・背景で閉じ、フォーカスは ⓘ に戻る${v}`, async ({ page }) => {
      await boot(page, '/');
      const info = page.getByRole('button', { name: 'インフォメーション' });
      await info.click();
      const dlg = page.getByRole('dialog', { name: 'List', exact: true });
      await expect(dlg.getByRole('button', { name: '閉じる' })).toBeFocused();
      for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('.modal'))).toBe(true);
      for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('.modal'))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dlg).toHaveCount(0);
      await expect(info).toBeFocused();
      await info.click();
      await page.locator('.modal-backdrop').click({ position: { x: 3, y: 3 } });
      await expect(dlg).toHaveCount(0);
    });
  });

  test.describe(`A-09 アカウントメニュー${v}`, () => {
    test(`メニューの項目・順序・↑↓で巡る・Esc で閉じてフォーカスが戻る・外を押すと閉じる・aria-expanded${v}`, async ({ page }) => {
      await boot(page, '/');
      const btn = page.getByRole('button', { name: 'アカウント' });
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
      await btn.click();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
      const menu = page.getByRole('menu', { name: 'アカウント' });
      await expect(menu.getByRole('menuitem')).toHaveText(['利用規約', 'プライバシーポリシー', 'ログアウト', 'アカウントを削除']);
      await expect(menu.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp'); // 先頭から上へ → 末尾へ折り返す
      await expect(menu.getByRole('menuitem').last()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(btn).toBeFocused();
      await btn.click();
      await page.locator('main').click({ position: { x: 5, y: 300 } });
      await expect(menu).toHaveCount(0);
    });

    test(`アカウント削除: 未入力の下書き（保存していない入力）があっても、削除後に「下書きに保存しますか」を出さない${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.goto('/new');
      await setPlayers(page, 6);
      await setTitle(page, '入力中のタイトル');
      await page.getByRole('button', { name: 'アカウント' }).click();
      await page.getByRole('menuitem', { name: 'アカウントを削除' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
      await page.waitForTimeout(500);
      await expect(page.getByRole('alertdialog', { name: '下書きに保存しますか' })).toHaveCount(0);
      await expect(page).toHaveURL('/');
    });

    test(`ログアウト: 入力中の投稿があっても、ログアウトするとログイン画面。ログインの開始で離脱確認（beforeunload）は出ない${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.route('**/api/auth/sign-in/social', (r) => fulfillJson(r, 200, { url: `${new URL(page.url()).origin}/?after-login=1` }));
      await page.goto('/new');
      await setPlayers(page, 6);
      await setTitle(page, '入力中');
      await page.getByRole('button', { name: 'アカウント' }).click();
      await page.getByRole('menuitem', { name: 'ログアウト' }).click();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
      let asked = false;
      page.on('dialog', (d) => {
        asked = d.type() === 'beforeunload';
        void d.dismiss();
      });
      await page.getByRole('button', { name: 'Google でログイン' }).click();
      await page.waitForTimeout(800);
      expect(asked, 'ログアウト後のログインで「変更が保存されない」確認が出る').toBe(false);
    });

    test(`アカウント削除の確認: Esc・背景で閉じる（何もしない）。削除中は押せない。通信が切れたら「削除できませんでした」${v}`, async ({ page }) => {
      const be = await fakeBackend(page, null);
      await page.goto('/');
      await page.getByRole('button', { name: 'アカウント' }).click();
      await page.getByRole('menuitem', { name: 'アカウントを削除' }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      expect(be.calls).toEqual([]);
      // 通信が切れる
      await page.route('**/rpc/delete_my_account', (r) => r.abort('connectionrefused'));
      await page.getByRole('button', { name: 'アカウント' }).click();
      await page.getByRole('menuitem', { name: 'アカウントを削除' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
      await expect(page.locator('.toast')).toHaveText('削除できませんでした');
      await expect(page.getByRole('button', { name: 'アカウント' })).toBeVisible();
    });

    test(`ログアウトの通信が失敗しても画面はログアウトする${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      await page.route('**/api/auth/sign-out', (r) => r.abort('connectionrefused'));
      await page.goto('/');
      await page.getByRole('button', { name: 'アカウント' }).click();
      await page.getByRole('menuitem', { name: 'ログアウト' }).click();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
    });
  });

  test.describe(`A-09 利用規約・プライバシーポリシー${v}`, () => {
    test(`利用規約: h1 は 1 つ。運営者の対応（削除・制限・変更）と免責、連絡先の mailto${v}`, async ({ page }) => {
      await boot(page, '/terms');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('利用規約');
      const t = await page.locator('article').innerText();
      for (const w of ['禁止事項', '運営者の対応', '不適切な投稿は、予告なく削除', '変更・中断・終了', '免責']) expect(t, w).toContain(w);
      const mail = page.locator('article a[href^="mailto:"]');
      await expect(mail).toHaveCount(1);
      await expect(mail).toHaveAttribute('href', /^mailto:[^@\s]+@[^@\s]+$/);
    });

    test(`プライバシーポリシー: 保存する情報・画像を送信しない・下書きは端末だけ・外部サービス（Neon・Cloudflare・Google）・削除の方法${v}`, async ({ page }) => {
      await boot(page, '/privacy');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const t = await page.locator('article').innerText();
      for (const w of ['取得する情報', '画像は送信も保存もしません', '端末のブラウザにだけ保存', 'Neon', 'Cloudflare', 'Google', 'アカウントを削除']) expect(t, w).toContain(w);
      // 実際の保存データ（不変条件 6）との食い違い: 表示名とメールアドレスは「受け取る」が保存はしない、と書くべき所に「取得する」とだけある
      expect(t).toContain('表示名、メールアドレス');
    });

    test(`規約からログイン画面（未ログイン）と、アプリ内リンクの遷移。外部リンクは rel=noopener${v}`, async ({ page }) => {
      await fakeBackend(page, null, { signedIn: false });
      await page.goto('/');
      await page.getByRole('link', { name: '利用規約' }).click();
      await expect(page).toHaveURL('/terms');
      await page.goBack();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
      await page.getByRole('link', { name: 'プライバシーポリシー' }).click();
      await expect(page).toHaveURL('/privacy');
      for (const a of await page.locator('article a[href^="http"]').all()) await expect(a).toHaveAttribute('rel', /noopener/);
    });
  });
}

test.describe('A-10 キー操作の除外（17 章）', () => {
  test('回答: 入力欄・モーダル・確認ダイアログが開いている間は B / E / Ctrl+Z / ← が効かない', async ({ page }) => {
    await boot(page, `/s/${ID}/answer`);
    await expect(page.getByText('11 / 11 手目')).toBeVisible();
    await page.getByRole('button', { name: 'AA Range 外' }).click();
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('e');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Control+z');
    await page.getByRole('button', { name: 'やめる' }).click();
    await expect(page.getByText('11 / 11 手目')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ブラシ' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^AA / })).toHaveAccessibleName('AA Call 100%');
  });

  test('投稿: Hand の選択ボード（モーダル）・タイトル欄の中では Ctrl+Z / Ctrl+Y は Action に効かない。閉じたら効く', async ({ page }) => {
    await fakeBackend(page, null);
    await page.goto('/new');
    await setPlayers(page, 6);
    const d = page.getByRole('group', { name: 'Action' });
    await d.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
    const acting = page.getByRole('group', { name: 'Table' }).locator('.pseat.acting');
    await expect(acting).toContainText('BTN');
    await page.getByPlaceholder(/タイトル/).click();
    await page.keyboard.press('Control+z');
    await expect(acting).toContainText('BTN');
    await page.getByRole('button', { name: 'BTN の Hand' }).click();
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Escape');
    await expect(acting).toContainText('BTN');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(acting).toContainText('CO');
  });

  test('PC のカード選択ボードのキー: ランク→スート、Backspace で 1 文字、Delete で全部、← → で席、Enter で閉じる。使用済みの札はトースト', async ({ page }) => {
    await fakeBackend(page, null);
    await page.goto('/new');
    await setPlayers(page, 3);
    await page.getByRole('button', { name: 'BTN の Hand' }).click();
    const dlg = page.getByRole('dialog', { name: 'BTN の Hand' });
    for (const k of ['a', 's']) await page.keyboard.press(k);
    await expect(dlg.getByRole('button', { name: 'Spade の A を外す' }).or(dlg.getByRole('button', { name: /A♠ を外す/ }))).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(dlg.getByRole('button', { name: /を外す/ })).toHaveCount(0);
    for (const k of ['a', 's', 'k', 'h']) await page.keyboard.press(k);
    await expect(page.getByRole('dialog', { name: 'SB の Hand' })).toBeVisible(); // 2 枚そろうと次の空の席へ
    for (const k of ['a', 's']) await page.keyboard.press(k); // 使用済み
    await expect(page.locator('.toast')).toContainText('A♠ は使用済み');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', { name: 'BB の Hand' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('dialog', { name: 'BTN の Hand' })).toBeVisible();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
