/**
 * 集計画面の E2E（詳細仕様 06 章 §5。plan.md P7 の完了条件）。バックエンドは偽物（fakeBackend.ts）。
 * 投稿は H-S1（BTN が出題、Villain は BB。BB の実際のアクションはコール、ハンドは Ks Js でショーダウン）。
 * 集計は 05 章 PAINT-12 の 2 件（A: AA call 100%、B: AA call 50% / s1 50%・KK fold 100%）。自分の回答は A。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { aggregateHex, detailJson, paintHexOf, paintOf, type DetailOpts } from '../packages/app/src/answer/detailFixtures.ts';
import { hs1 } from '../packages/core/src/post/postFixtures.ts';
import { fakeBackend, type Backend } from './fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const ANSWER = `/s/${ID}/answer`;
const RESULT = `/s/${ID}/result`;

const AGG = aggregateHex([paintOf({ AA: { call: 20 } }), paintOf({ AA: { call: 10, s1: 10 }, KK: { fold: 20 } })]);
const MY = { paint: paintHexOf({ AA: { call: 20 } }), size: null };

function detail(o: Partial<DetailOpts> = {}): Record<string, unknown> {
  return detailJson(undefined, { viewer: 'answered', id: ID, answerCount: 2, aggregate: AGG, myAnswer: MY, ...o });
}

/** 自分の投稿（Hero の予想あり / なし） */
function authorDetail(prediction: boolean): Record<string, unknown> {
  return detail({
    viewer: 'author',
    myAnswer: null,
    hostAnswer: prediction ? { paint: paintHexOf({ QQ: { fold: 5, s1: 15 } }), size: 20 } : null,
  });
}

async function open(page: Page, d: Record<string, unknown> = detail(), path = RESULT): Promise<Backend> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const be = await fakeBackend(page, d);
  await page.goto(path);
  return be;
}

const cell = (page: Page, label: string): Locator => page.getByRole('button', { name: label, exact: true });
const tab = (page: Page, name: string): Locator => page.getByRole('tab', { name });
const detailBox = (page: Page): Locator => page.locator('.res-detail');
const table = (page: Page): Locator => page.locator('.ptable');

test.describe('集計レンジ（06 章 §5.2）', () => {
  test('全体: タブ・上部バー・白枠の初期選択・マスの内訳', async ({ page }) => {
    await open(page);
    await expect(tab(page, '全体（2人）')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, '自分')).toBeVisible();
    await expect(tab(page, 'Hero の予想')).toBeVisible();

    // 上部バー（05 章 PAINT-13）: fold 0.226% / call 0.339% / s1 0.113% / レンジ外 99.3%
    const legend = page.locator('.cbar-legend');
    await expect(legend).toContainText('フォールド 0.2%');
    await expect(legend).toContainText('コール 0.3%');
    await expect(legend).toContainText('レイズ 0.1%');
    await expect(legend).toContainText('レンジ外 99.3%');

    // 初期選択は Villain の実際のハンド（KJs、白枠）
    await expect(cell(page, 'KJs')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(page, 'KJs')).toHaveClass(/actual/);
    await expect(detailBox(page)).toContainText('KJs');
    await expect(detailBox(page)).toContainText('レンジ内 0 / 2人');
    await expect(detailBox(page)).toContainText('自分：レンジ外');

    // 濃さ: AA は 2 人 → 1、KK は 1 人 → 0.65、QQ は無色
    await expect(cell(page, 'AA').locator('.cfill')).toHaveCSS('opacity', '1');
    await expect(cell(page, 'KK').locator('.cfill')).toHaveCSS('opacity', '0.65');
    await expect(cell(page, 'QQ').locator('.cfill')).toHaveCount(0);

    await cell(page, 'AA').click();
    await expect(cell(page, 'AA')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(page, 'KJs')).toHaveAttribute('aria-pressed', 'false');
    await expect(detailBox(page)).toContainText('レンジ内 2 / 2人');
    await expect(detailBox(page)).toContainText('フォールド 0.0%（0人）');
    await expect(detailBox(page)).toContainText('コール 75.0%（2人）');
    await expect(detailBox(page)).toContainText('レイズ 25.0%（1人）');
    await expect(detailBox(page)).toContainText('自分：コール 100%');
  });

  test('自分 / Hero の予想のタブ。他人の投稿の予想なしにはボタンを出さない', async ({ page }) => {
    await open(page);
    await tab(page, '自分').click();
    await cell(page, 'AA').click();
    await expect(detailBox(page)).toContainText('コール 100%');
    await expect(page.locator('.cbar-legend')).toContainText('コール 0.5%');
    await cell(page, 'KK').click();
    await expect(detailBox(page)).toContainText('レンジ外');

    await tab(page, 'Hero の予想').click();
    await expect(page.getByText('予想なし')).toBeVisible();
    await expect(page.getByRole('link', { name: '予想を入力' })).toHaveCount(0);
    await expect(page.locator('.rgrid')).toHaveCount(0);
  });

  test('回答 0 件は「回答なし」', async ({ page }) => {
    await open(page, detail({ answerCount: 0, aggregate: undefined }));
    await expect(tab(page, '全体（0人）')).toBeVisible();
    await expect(page.getByText('回答なし')).toBeVisible();
  });

  test('キーボード: 矢印で選ぶマスを移す', async ({ page }) => {
    await open(page);
    await cell(page, 'AA').click();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, 'AKs')).toBeFocused();
    await expect(cell(page, 'AKs')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, 'KK')).toHaveAttribute('aria-pressed', 'true');
    await expect(detailBox(page)).toContainText('レンジ内 1 / 2人');
  });
});

test.describe('実際のアクションとハンドヒストリー（06 章 §5.3・§5.4）', () => {
  test('Villain の実際のアクションとハンド', async ({ page }) => {
    await open(page);
    const box = page.locator('.res-actual');
    await expect(box).toContainText('Villain（BB）実際のアクション');
    await expect(box).toContainText('コール');
    await expect(box).toContainText('KJs');
    await expect(box.getByLabel('スペードのK')).toBeVisible();
  });

  test('マックと不明', async ({ page }) => {
    await open(page, detailJson({ ...hs1(), known_cards: { BB: 'muck' } }, { viewer: 'answered', id: ID, answerCount: 2, aggregate: AGG, myAnswer: MY }));
    await expect(page.locator('.res-actual')).toContainText('マック');
    await expect(cell(page, 'AA')).toHaveAttribute('aria-pressed', 'true');
    await expect(table(page)).toContainText('マック');
  });

  test('最後の状態から始まり、最初から再生できる。ログに出題タグと実際のアクションの強調', async ({ page }) => {
    await open(page);
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await expect(table(page)).toContainText('ショーダウン');
    await expect(table(page)).toContainText('52.1bb');
    // 終了時は Hero と Villain のハンドを公開
    await expect(table(page).getByLabel('ダイヤのA')).toBeVisible();
    await expect(table(page).getByLabel('スペードのJ')).toBeVisible();
    await expect(page.locator('.hlog-tag')).toHaveText('出題');
    await expect(page.locator('.hlog-list li.actual')).toHaveText('BB コール 6.5');

    await page.getByRole('button', { name: '最初から' }).click();
    await expect(page.getByText('0 / 15 手目')).toBeVisible();
    await expect(table(page)).not.toContainText('ショーダウン');
    // Hero のハンドは表向きのまま、Villain は伏せる
    await expect(table(page).getByLabel('ダイヤのA')).toBeVisible();
    await expect(table(page).getByLabel('スペードのJ')).toHaveCount(0);
    await expect(page.locator('.hlog-list li')).toHaveCount(0);

    await page.getByRole('button', { name: '1手進む' }).click();
    await expect(page.getByText('1 / 15 手目')).toBeVisible();
    await expect(page.locator('.hlog-list li.latest')).toHaveText('UTG フォールド');
  });
});

test.describe('操作（06 章 §5.5）', () => {
  test('他人の投稿: 編集・削除のボタンを出さない', async ({ page }) => {
    await open(page);
    await expect(page.locator('.res-actual')).toBeVisible();
    await expect(page.getByRole('button', { name: '削除' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '予想を編集' })).toHaveCount(0);
  });

  test('管理者は他人の投稿を削除できる', async ({ page }) => {
    const be = await open(page, detail({ admin: true }));
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('この投稿を削除しますか');
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page).toHaveURL('/');
    expect(be.deletes).toEqual([ID]);
  });

  test('自分の投稿: 全体 / Hero の予想、予想を編集、削除（やめる）', async ({ page }) => {
    const be = await open(page, authorDetail(true));
    await expect(page.getByRole('tab')).toHaveText(['全体（2人）', 'Hero の予想']);
    await tab(page, 'Hero の予想').click();
    await cell(page, 'QQ').click();
    await expect(detailBox(page)).toContainText('フォールド 25% / レイズ 75%');

    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: 'やめる' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(be.deletes).toEqual([]);

    await page.getByRole('link', { name: '予想を編集' }).click();
    await expect(page).toHaveURL(ANSWER);
    await expect(page.getByRole('button', { name: '予想を保存' })).toBeVisible();
  });

  test('予想の保存後（?view=host）は Hero の予想のタブ。予想が無ければ「予想を入力」', async ({ page }) => {
    await open(page, authorDetail(false), `${RESULT}?view=host`);
    await expect(tab(page, 'Hero の予想')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('予想なし')).toBeVisible();
    await page.getByRole('link', { name: '予想を入力' }).click();
    await expect(page).toHaveURL(ANSWER);
  });
});

test.describe('スマホ（06 章 §5.1）', () => {
  test('集計 / ハンドヒストリーのタブ。切り替えてもリプレイの位置と選んだマスが残る @sp', async ({ page }) => {
    await open(page);
    await expect(tab(page, '集計')).toHaveAttribute('aria-selected', 'true');
    await cell(page, 'AA').tap();
    await expect(detailBox(page)).toContainText('レンジ内 2 / 2人');

    await tab(page, 'ハンドヒストリー').tap();
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await page.getByRole('button', { name: '1手戻る' }).tap();
    await expect(page.getByText('14 / 15 手目')).toBeVisible();

    await tab(page, '集計').tap();
    await expect(cell(page, 'AA')).toHaveAttribute('aria-pressed', 'true');
    await tab(page, 'ハンドヒストリー').tap();
    await expect(page.getByText('14 / 15 手目')).toBeVisible();
  });
});
