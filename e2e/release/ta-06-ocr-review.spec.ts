/**
 * T-A A-06（確認画面）: 読み取り結果の確認と修正、反映、取り消し、Preflop の All-in・Flop 以降に Hero の Action が無い画像のエラー、
 * 壊れたファイル、画面の幅の切り替え（06 章 §3.9・07 章・16 章）。T4 の画像は sample/ から読むだけ（無ければ skip）。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend, fakeCreatePost } from './taKit.ts';
import { acting, isMobile, pickSpot, S_ACTION, S_PLAYER, S_SETTINGS, setTitle, step, submit } from './taPost.ts';
import { diffReview, heroHasPostflop, importImage, loadSamples, NO_SPOT, PREFLOP_ALLIN, readReview, UNREADABLE, type Sample } from './taOcr.ts';

const pc = loadSamples('pc');
const sp = loadSamples('sp');
const postablePc = pc.filter((s) => heroHasPostflop(s.expected));
const postableSp = sp.filter((s) => heroHasPostflop(s.expected));
const noSpotPc = pc.filter((s) => !heroHasPostflop(s.expected));

test.skip(pc.length + sp.length === 0, '試験画像（sample/）が無いので skip');

const reviewOf = (page: Page) => page.getByRole('dialog', { name: '読み取り結果' });

/** 使う画像: PC のテストは PC の画像、スマホのテスト（@sp）はスマホの画像 */
function pick(page: Page, n = 0): Sample {
  const list = isMobile(page) ? postableSp : postablePc;
  const s = list[n] ?? list[0];
  if (!s) throw new Error('投稿できる試験画像が無い');
  return s;
}

const VARIANTS = ['', ' @sp'] as const;

for (const v of VARIANTS) {
  test.describe(`A-06 確認画面${v}`, () => {
    test.beforeEach(async ({ page }) => {
      await fakeBackend(page, null);
      await fakeCreatePost(page);
    });

    test(`読み取り結果が正解と一致し、「反映する」でフォームに入る（設定・人数・Hero・Hand・Board・Action）。スタックとタイトルは利用者の入力のまま${v}`, async ({ page }) => {
      const s = pick(page);
      await page.goto('/new');
      const title = page.getByPlaceholder(/タイトル/);
      await setTitleBefore(page, '残るタイトル');
      const out = await importImage(page, s.png);
      expect(out.kind).toBe('review');
      const view = await readReview(reviewOf(page));
      expect(diffReview(view, s.expected)).toEqual([]);
      // 確認画面の中身: 画像（PC は同時、スマホはタブ）・T4 のゲーム・Hero・Hand・Board・Action・問題の一覧
      if (isMobile(page)) {
        await expect(reviewOf(page).getByRole('tab', { name: '結果' })).toHaveAttribute('aria-selected', 'true');
        await reviewOf(page).getByRole('tab', { name: '画像' }).click();
        await expect(reviewOf(page).getByRole('img', { name: '読み込んだ画像' })).toBeVisible();
        await reviewOf(page).getByRole('tab', { name: '結果' }).click();
      } else {
        await expect(reviewOf(page).getByRole('img', { name: '読み込んだ画像' })).toBeVisible();
      }
      await reviewOf(page).getByRole('button', { name: '反映する' }).click();
      await expect(reviewOf(page)).toHaveCount(0);
      // 画像の Object URL は破棄され、画面に画像は残らない
      await expect(page.getByRole('img', { name: '読み込んだ画像' })).toHaveCount(0);
      if (isMobile(page)) await expect(page.getByRole('group', { name: 'Table' })).toBeVisible(); // アクションのステップへ移る
      // 基本設定: Cash・SB 0.5・Ante 0・Rake 5、6 人
      await step(page, S_SETTINGS);
      await expect(page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('SB（bb）')).toHaveValue('0.5');
      await expect(page.getByLabel('Ante（bb）')).toHaveValue('0');
      await expect(page.getByLabel('Rake（%）')).toHaveValue('5');
      await step(page, S_PLAYER);
      await expect(page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('radio', { name: `Hero を ${s.expected.hero} にする` })).toHaveAttribute('aria-checked', 'true');
      for (const [pos, cards] of Object.entries(s.expected.hands)) {
        const txt = (await page.getByRole('button', { name: `${pos} の Hand` }).innerText()).replace(/\s+/g, '');
        expect(txt, pos).toBe(cards.map((c) => `${c[0]}${{ s: '♠', h: '♥', d: '♦', c: '♣' }[c[1] as 's']}`).join(''));
      }
      // スタックは既定の 100 のまま
      await expect(page.getByRole('textbox', { name: 'UTG の Stack（bb）' })).toHaveValue('100');
      // タイトルは残る。Spot は解除されている（選び直す）
      await step(page, /^4\s*Spot$/);
      await expect(title).toHaveValue('残るタイトル');
      await expect(page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio', { checked: true })).toHaveCount(0);
      const n = await page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio').count();
      expect(n).toBeGreaterThan(0);
      // Spot を選んで投稿できる（サーバーに送る本文が画像の内容と一致）
      const cp = await fakeCreatePost(page);
      await page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio').first().click();
      await submit(page);
      await expect(page).toHaveURL('/?tab=mine');
      const body = cp.calls[0]!.body as { hero: string; hero_cards: string[]; known_cards: Record<string, string[]>; board: string[]; actions: unknown[]; rake: number; title: string };
      expect(body.hero).toBe(s.expected.hero);
      expect(body.hero_cards).toEqual(s.expected.hands[s.expected.hero]);
      expect(body.rake).toBe(5);
      expect(body.title).toBe('残るタイトル');
      for (const [pos, cards] of Object.entries(s.expected.hands)) if (pos !== s.expected.hero) expect(body.known_cards[pos]).toEqual(cards);
      expect(body.board.length).toBeGreaterThanOrEqual(3);
      expect(body.actions.length).toBeGreaterThan(0);
    });

    test(`「やめる」・Esc・背景ではフォームを変えない。もう一度同じ画像を読める${v}`, async ({ page }) => {
      const s = pick(page);
      await page.goto('/new');
      await setTitleBefore(page, '変えない');
      await importImage(page, s.png);
      await reviewOf(page).getByRole('button', { name: 'やめる' }).click();
      await expect(reviewOf(page)).toHaveCount(0);
      await importImage(page, s.png);
      await page.keyboard.press('Escape');
      await expect(reviewOf(page)).toHaveCount(0);
      await step(page, S_PLAYER);
      await expect(page.getByRole('table', { name: 'Player と Hand' })).toHaveCount(0); // 人数は未選択のまま
      await step(page, /^4\s*Spot$/);
      await expect(page.getByPlaceholder(/タイトル/)).toHaveValue('変えない');
      await step(page, S_SETTINGS);
      const out = await importImage(page, s.png); // 同じ画像をもう一度
      expect(out.kind).toBe('review');
    });

    test(`確認画面で直す: Hero・動詞・額・Action の追加と削除・Board・Hand。問題の一覧が変わる${v}`, async ({ page }) => {
      const s = pick(page);
      await page.goto('/new');
      await importImage(page, s.png);
      const rv = reviewOf(page);
      const before = await readReview(rv);
      expect(before.issues).toEqual([]);
      // 1 行目を消すと席が合わなくなる
      await rv.getByRole('button', { name: '1手目を消す' }).click();
      await expect(rv.locator('.pf-errors')).toContainText('手目から席が画像の読み取りと合いません');
      // 足し直す: 1 手目の位置に Fold を足す（UTG の Fold）
      await rv.getByRole('button', { name: /^Action を足す$/ }).click();
      expect((await readReview(rv)).actions.length).toBe(before.actions.length);
      // 最後の Action を消すと、以降が足りない（またはその手で終わる）
      const countBefore = (await readReview(rv)).actions.length;
      await rv.getByRole('button', { name: `${countBefore}手目を消す` }).click();
      expect((await readReview(rv)).actions.length).toBe(countBefore - 1);
      // Board の最後の 1 枚を消す → 問題の一覧が変わる（Board が 3 枚以上あればまだ有効）
      const b0 = (await readReview(rv)).board.length;
      await rv.getByRole('button', { name: '最後の Card を消す' }).click();
      expect((await readReview(rv)).board.length).toBe(b0 - 1);
      // 動詞を変える: 1 手目の Fold → Raise にすると額の欄が出る
      const first = rv.getByRole('combobox', { name: '1手目の Action' });
      await first.click();
      await page.getByRole('option', { name: 'Raise' }).click();
      await expect(rv.getByRole('textbox', { name: '1手目の額（bb）' })).toBeVisible();
      await first.click();
      await page.getByRole('option', { name: 'Fold' }).click();
      await expect(rv.getByRole('textbox', { name: '1手目の額（bb）' })).toHaveCount(0);
      // Hero を変えると Hero の印が動く
      const other = s.expected.hero === 'BB' ? 'BTN' : 'BB';
      await rv.getByRole('radio', { name: `Hero を ${other} にする` }).click();
      await expect(rv.getByRole('radio', { name: `Hero を ${other} にする` })).toHaveAttribute('aria-checked', 'true');
      await expect(rv.getByRole('radio', { name: `Hero を ${s.expected.hero} にする` })).toHaveAttribute('aria-checked', 'false');
    });

    test(`Hand の欄を空にすると「{席} の Hand がありません」、同じ札を入れると「正しくありません」。反映は再生できたところまで${v}`, async ({ page }) => {
      const s = pick(page);
      await page.goto('/new');
      await importImage(page, s.png);
      const rv = reviewOf(page);
      // 席 UTG の Hand を消す（PC は選択ボード、スマホはカードキーボード。どちらもキーで打てる）
      await rv.getByRole('button', { name: 'UTG の Hand' }).click();
      for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace'); // 1 文字ずつ消す（PC・スマホどちらもキーで打てる）
      await page.keyboard.press('Escape');
      await expect(rv.locator('.pf-errors')).toContainText('UTG の Hand がありません');
      // 反映すると、その席の Hand は空
      await rv.getByRole('button', { name: '反映する' }).click();
      await step(page, S_PLAYER);
      expect((await page.getByRole('button', { name: 'UTG の Hand' }).innerText()).replace(/\s+/g, '')).toBe('');
    });

    test(`確認画面で Preflop の All-in になる額に直すと、同じエラーが出て反映してもその手から後は入らない${v}`, async ({ page }) => {
      const s = pick(page);
      await page.goto('/new');
      await importImage(page, s.png);
      const rv = reviewOf(page);
      // 最初の額つきの行（Preflop の Raise）を 100 にする（スタック 100 の All-in）
      const amtInput = rv.locator('.ocr-rv-amt input').first();
      await amtInput.fill('100');
      await expect(rv.locator('.pf-errors')).toContainText(/Preflop で All-in になった Hand は投稿できません|手目の Action が正しくありません/);
    });

    test(`T4 のゲームをエキスパートに変えても Rake 5% で反映される${v}`, async ({ page }) => {
      const s = pick(page);
      await page.goto('/new');
      await importImage(page, s.png, /^エキスパート/);
      const rv = reviewOf(page);
      await expect(rv.getByRole('group', { name: 'T4 の Game' }).getByRole('button', { name: /^エキスパート/ })).toHaveAttribute('aria-pressed', 'true');
      await rv.getByRole('group', { name: 'T4 の Game' }).getByRole('button', { name: /^通常/ }).click();
      await rv.getByRole('button', { name: '反映する' }).click();
      await step(page, S_SETTINGS);
      await expect(page.getByLabel('Rake（%）')).toHaveValue('5');
    });

    test(`読み込みの前に入れていた Action・Hand は画像の内容に置き換わる（確認のダイアログに一言）${v}`, async ({ page }) => {
      const s = pick(page);
      await page.goto('/new');
      await step(page, S_PLAYER);
      await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '3', exact: true }).click();
      await step(page, S_SETTINGS);
      await page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' }).click();
      await expect(page.getByRole('dialog', { name: 'T4 の Game' })).toContainText('入力中の内容は画像の内容に置き換わります。');
      await page.getByRole('dialog', { name: 'T4 の Game' }).getByRole('button', { name: '閉じる' }).click();
      const out = await importImage(page, s.png);
      expect(out.kind).toBe('review');
      await reviewOf(page).getByRole('button', { name: '反映する' }).click();
      await step(page, S_PLAYER);
      await expect(page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true })).toHaveAttribute('aria-pressed', 'true');
      // 反映した内容は下書きに出る（離れるときに聞く）
      await page.getByRole('link', { name: /^下書き/ }).click();
      await expect(page.getByRole('alertdialog', { name: '下書きに保存しますか' })).toBeVisible();
    });
  });
}

/** 画像を読む前にタイトルを入れておく（スマホは Spot のステップで打ち、1 つ目のステップに戻す） */
async function setTitleBefore(page: Page, title: string): Promise<void> {
  await setTitle(page, title);
  await step(page, S_SETTINGS);
}

test.describe('A-06 投稿できない画像・壊れたファイル', () => {
  test.beforeEach(async ({ page }) => {
    await fakeBackend(page, null);
  });

  test('Hero に Flop 以降の Action が無い画像 →「Flop 以降の Hero の Action がない Hand です」。フォームは変わらない', async ({ page }) => {
    test.skip(noSpotPc.length === 0);
    await page.goto('/new');
    await setTitleBefore(page, '変わらない');
    const target = noSpotPc.find((s) => s.expected.actions.every((a) => !(a.street === 'pf' && a.verb === 'allin'))) ?? noSpotPc[0]!;
    const out = await importImage(page, target.png);
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect([NO_SPOT, PREFLOP_ALLIN]).toContain(out.message);
    await expect(reviewOf(page)).toHaveCount(0);
    await expect(page.getByPlaceholder(/タイトル/)).toHaveValue('変わらない');
    await expect(page.getByRole('table', { name: 'Player と Hand' })).toHaveCount(0);
  });

  test('Preflop でだれかが All-in になった画像 →「Preflop で All-in になった Hand は投稿できません」', async ({ page }) => {
    test.skip(noSpotPc.length === 0);
    await page.goto('/new');
    let found = false;
    for (const s of noSpotPc) {
      const out = await importImage(page, s.png);
      if (out.kind === 'error' && out.message === PREFLOP_ALLIN) {
        found = true;
        await expect(page.locator('.pf-ocr .pf-errors')).toContainText(PREFLOP_ALLIN);
        await expect(reviewOf(page)).toHaveCount(0);
        break;
      }
    }
    expect(found, 'sample/pc に Preflop の All-in の画像が 1 枚以上ある').toBe(true);
  });

  test('画像でないファイル・壊れた PNG・空のファイル・非常に小さい画像 →「読み取れませんでした」', async ({ page }) => {
    const files = [
      { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('これは画像ではない') },
      { name: 'trunc.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64').subarray(0, 40) },
      { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
    ];
    await page.goto('/new');
    for (const f of files) {
      const out = await importImage(page, f);
      expect(out, f.name).toEqual({ kind: 'error', message: UNREADABLE });
      await expect(page.getByRole('dialog', { name: '読み取り中…' }), f.name).toHaveCount(0);
    }
  });

  test('画面の幅が変わって PC / スマホのレイアウトが切り替わっても、確認画面の状態（直した Hero）を保つ', async ({ page }) => {
    test.skip(postablePc.length === 0);
    const s = postablePc[0]!;
    await page.goto('/new');
    await importImage(page, s.png);
    const rv = reviewOf(page);
    const other = s.expected.hero === 'BB' ? 'BTN' : 'BB';
    await rv.getByRole('radio', { name: `Hero を ${other} にする` }).click();
    await page.setViewportSize({ width: 412, height: 900 });
    await expect(rv).toBeVisible();
    await expect(rv.getByRole('tab', { name: '結果' })).toBeVisible();
    await expect(rv.getByRole('radio', { name: `Hero を ${other} にする` })).toHaveAttribute('aria-checked', 'true');
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(rv.getByRole('tab', { name: '結果' })).toHaveCount(0);
    await expect(rv.getByRole('radio', { name: `Hero を ${other} にする` })).toHaveAttribute('aria-checked', 'true');
    await expect(rv.getByRole('img', { name: '読み込んだ画像' })).toBeVisible();
  });

  test('読み取り中に画面の幅が変わっても止まらず、結果が出る（06 章 §3.9）', async ({ page }) => {
    test.skip(postablePc.length === 0);
    await page.route('**/ocr/lang/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue().catch(() => undefined);
    });
    await page.goto('/new');
    await page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('dialog', { name: 'T4 の Game' }).getByRole('button', { name: /^通常/ }).click();
    await (await chooser).setFiles(postablePc[0]!.png);
    await expect(page.getByRole('dialog', { name: '読み取り中…' })).toBeVisible();
    await page.setViewportSize({ width: 412, height: 900 }); // PC → スマホのレイアウト
    await expect(reviewOf(page)).toBeVisible({ timeout: 30_000 });
  });

  test('読み取り中は「読み取り中…」と「キャンセル」。キャンセルするとフォームは変わらず、次の読み込みができる', async ({ page }) => {
    test.skip(postablePc.length === 0);
    await page.route('**/ocr/lang/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue().catch(() => undefined);
    });
    await page.goto('/new');
    await page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('dialog', { name: 'T4 の Game' }).getByRole('button', { name: /^通常/ }).click();
    await (await chooser).setFiles(postablePc[0]!.png);
    const busy = page.getByRole('dialog', { name: '読み取り中…' });
    await expect(busy).toBeVisible();
    await expect(page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' })).toBeDisabled();
    await busy.getByRole('button', { name: 'キャンセル' }).click();
    await expect(busy).toHaveCount(0);
    await page.waitForTimeout(3000); // 取り消した結果は出ない
    await expect(reviewOf(page)).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: UNREADABLE })).toHaveCount(0);
    await page.unroute('**/ocr/lang/**');
    const out = await importImage(page, postablePc[0]!.png);
    expect(out.kind).toBe('review');
  });
});
