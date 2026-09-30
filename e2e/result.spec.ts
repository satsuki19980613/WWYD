/**
 * 集計画面の E2E（詳細仕様 06 章 §5。plan.md P7 の完了条件）。バックエンドは偽物（fakeBackend.ts）。
 * 投稿は H-S1 を BB の手番で出題した形（hs1bb。Hero = BB が BTN の 6.5 ベットに向き合う。実際はコール、ハンドは Ks Js でショーダウン）。
 * 集計は 05 章 PAINT-12 の 2 件（A: AA call 100%、B: AA call 50% / s1 50%・KK fold 100%）。自分の回答は A。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { aggregateHex, detailJson, paintHexOf, paintOf, type DetailOpts } from '../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../packages/core/src/post/postFixtures.ts';
import { DATA, fakeBackend, type Backend } from './fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const RESULT = `/s/${ID}/result`;

const AGG = aggregateHex([paintOf({ AA: { call: 20 } }), paintOf({ AA: { call: 10, s1: 10 }, KK: { fold: 20 } })]);
const MY = { paint: paintHexOf({ AA: { call: 20 } }), size: null };

function detail(o: Partial<DetailOpts> = {}): Record<string, unknown> {
  return detailJson(hs1bb(), { viewer: 'answered', id: ID, answerCount: 2, aggregate: AGG, myAnswer: MY, ...o });
}

/** 自分の投稿（投稿者も回答済み。自分の回答は QQ fold 25% / s1 75%） */
function authorDetail(): Record<string, unknown> {
  return detail({ viewer: 'author', myAnswer: { paint: paintHexOf({ QQ: { fold: 5, s1: 15 } }), size: 20 } });
}

async function open(page: Page, d: Record<string, unknown> = detail(), path = RESULT): Promise<Backend> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const be = await fakeBackend(page, d);
  await page.goto(path);
  return be;
}

const cell = (page: Page, label: string): Locator => page.getByRole('button', { name: label, exact: true });
const tab = (page: Page, name: string): Locator => page.getByRole('tab', { name, exact: true });
const detailBox = (page: Page): Locator => page.locator('.res-detail');
const table = (page: Page): Locator => page.locator('.ptable');

test.describe('集計 Range（06 章 §5.2）', () => {
  test('全体: タブ・上部バー・白枠の初期選択・マスの内訳', async ({ page }) => {
    await open(page);
    await expect(tab(page, '全体（2人）')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab')).toHaveText(['全体（2人）', '自分', '自分との差']);

    // 上部のまとめ（14 章。05 章 PAINT-13 の fold 0.226% / call 0.339% / s1 0.113% をレンジの中の割合に）:
    // 全体は 9 combos（AA 6 + KK 6 × 1/2）· 0.7%、fold 33.3% / call 50.0% / s1 16.7%。自分は AA だけ
    const all = page.locator('.cbar').first();
    await expect(all).toContainText('全体');
    await expect(all).toContainText('9 combos');
    await expect(all).toContainText('0.7%');
    await expect(all.locator('.cbar-legend')).toContainText('Fold 33.3%');
    await expect(all.locator('.cbar-legend')).toContainText('Call 50.0%');
    await expect(all.locator('.cbar-legend')).toContainText('Raise 16.7%');
    await expect(page.locator('.cbar').nth(1)).toContainText('6 combos');

    // 初期選択は Hero の実際のハンド（KJs、白枠。答え合わせ）
    await expect(cell(page, 'KJs')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(page, 'KJs')).toHaveClass(/actual/);
    await expect(detailBox(page)).toContainText('KJs');
    await expect(detailBox(page)).toContainText('Range 内 0 / 2人');
    await expect(detailBox(page)).toContainText('自分：Range 外');

    // 濃さ: AA は 2 人 → 1、KK は 1 人 → 0.65、QQ は無色
    await expect(cell(page, 'AA').locator('.cfill')).toHaveCSS('opacity', '1');
    await expect(cell(page, 'KK').locator('.cfill')).toHaveCSS('opacity', '0.65');
    await expect(cell(page, 'QQ').locator('.cfill')).toHaveCount(0);

    await cell(page, 'AA').click();
    await expect(cell(page, 'AA')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(page, 'KJs')).toHaveAttribute('aria-pressed', 'false');
    await expect(detailBox(page)).toContainText('Range 内 2 / 2人');
    await expect(detailBox(page)).toContainText('Fold 0.0%（0人）');
    await expect(detailBox(page)).toContainText('Call 75.0%（2人）');
    await expect(detailBox(page)).toContainText('Raise 25.0%（1人）');
    await expect(detailBox(page)).toContainText('自分：Call 100%');
  });

  test('自分のタブ', async ({ page }) => {
    await open(page);
    await tab(page, '自分').click();
    await cell(page, 'AA').click();
    await expect(detailBox(page)).toContainText('Call 100%');
    // 自分のタブは自分のまとめだけ
    await expect(page.locator('.cbar')).toHaveCount(1);
    await expect(page.locator('.cbar')).toContainText('6 combos');
    await expect(page.locator('.cbar-legend')).toContainText('Call 100.0%');
    await cell(page, 'KK').click();
    await expect(detailBox(page)).toContainText('Range 外');
  });

  test('自分との差: 差の濃さで塗り、内訳に「差」', async ({ page }) => {
    await open(page);
    await tab(page, '自分との差').click();
    // KK: 全体 fold 50% / レンジ外 50%、自分はレンジ外 → 差 50%。72o はどちらもレンジ外 → 塗らない
    await expect(cell(page, 'KK').locator('.cheat')).toHaveCount(1);
    await expect(cell(page, '72o').locator('.cheat')).toHaveCount(0);
    await cell(page, 'KK').click();
    await expect(detailBox(page)).toContainText('差 50%');
  });

  test('答え合わせ（実際の Action）を右の列の先頭に出す（PC。17 章）', async ({ page }) => {
    await open(page);
    const first = page.locator('.res-side > *').first();
    await expect(first).toContainText('実際の Action');
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
    await expect(detailBox(page)).toContainText('Range 内 1 / 2人');
  });
});

test.describe('実際の Action と Hand History（06 章 §5.3・§5.4）', () => {
  test('答え合わせ: Hero の実際の Action と Hand', async ({ page }) => {
    await open(page);
    const box = page.locator('.res-actual');
    await expect(box).toContainText('Hero（BB）実際の Action');
    await expect(box).toContainText('Call');
    await expect(box).toContainText('KJs');
    await expect(box.getByLabel('Spade の K')).toBeVisible();
  });

  test('Showdown で Hand を見せなかった席は「Muck」。答え合わせの Hand は Hero のもの', async ({ page }) => {
    await open(page, detailJson({ ...hs1bb(), known_cards: { BTN: 'muck' } }, { viewer: 'answered', id: ID, answerCount: 2, aggregate: AGG, myAnswer: MY }));
    await expect(page.locator('.res-actual')).toContainText('KJs');
    await expect(cell(page, 'KJs')).toHaveAttribute('aria-pressed', 'true');
    await expect(table(page)).toContainText('Muck');
  });

  test('最後の状態から始まり、最初から再生できる。ログに出題タグと実際の Action の強調', async ({ page }) => {
    await open(page);
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await expect(table(page)).toContainText('Showdown');
    await expect(table(page)).toContainText('52.1bb');
    // 終了時は Hero と、Showdown で見せた席のハンドを公開
    await expect(table(page).getByLabel('Diamond の A')).toBeVisible();
    await expect(table(page).getByLabel('Spade の J')).toBeVisible();
    await expect(page.locator('.hlog-tag')).toHaveText('出題');
    // 出題の手番が Hero の実際の Action（出題タグと強調が同じ行）
    await expect(page.locator('.hlog-list li.actual')).toHaveText('BB Call 6.5出題');

    await page.getByRole('button', { name: '最初から' }).click();
    await expect(page.getByText('0 / 15 手目')).toBeVisible();
    await expect(table(page)).not.toContainText('Showdown');
    // Hero（BB）のハンドは表向きのまま、ほかの席は伏せる
    await expect(table(page).getByLabel('Spade の J')).toBeVisible();
    await expect(table(page).getByLabel('Diamond の A')).toHaveCount(0);
    await expect(page.locator('.hlog-list li')).toHaveCount(0);

    await page.getByRole('button', { name: '1手進む' }).click();
    await expect(page.getByText('1 / 15 手目')).toBeVisible();
    await expect(page.locator('.hlog-list li.latest')).toHaveText('UTG Fold');
  });

  test('River まで続くハンドの途中の Spot: 出題の局面（Hero の Call の直前）だけ卓に SPOT（17 章）', async ({ page }) => {
    await open(page);
    // 最後の状態（River の Showdown）では出さない
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await expect(page.locator('.pseat-spot')).toHaveCount(0);
    await page.keyboard.press('Home');
    for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('11 / 15 手目')).toBeVisible();
    await expect(page.locator('.ptable.at-spot .pseat-spot')).toBeVisible();
    await expect(page.locator('.ptable-board .pcard')).toHaveCount(4);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.pseat-spot')).toHaveCount(0);
  });
});

test.describe('次の Spot（14 章）', () => {
  const row = (id: string, o: Record<string, unknown> = {}) => ({
    id,
    created_at: '2026-09-28T00:00:00.000000+00:00',
    title: 't',
    fmt: 'cash',
    hero: 'BTN',
    street: 'turn',
    effective_stack: 100,
    answer_count: 0,
    is_mine: false,
    answered_by_me: false,
    can_delete: false,
    ...o,
  });
  const NEXT = '00000000-0000-4000-8000-000000000009';

  test('未回答・自分の投稿でない新着へ進める', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, detail());
    await page.route(`${DATA}/rpc/list_posts`, (r) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': r.request().headers()['origin'] ?? '*', 'access-control-allow-credentials': 'true', 'content-type': 'application/json' },
        body: JSON.stringify([row(ID), row('a', { answered_by_me: true }), row('b', { is_mine: true }), row(NEXT)]),
      }),
    );
    await page.goto(RESULT);
    await expect(page.getByRole('link', { name: '次の Spot' })).toHaveAttribute('href', `/s/${NEXT}`);
  });

  test('候補が無ければ出さない', async ({ page }) => {
    await open(page);
    await expect(cell(page, 'AA')).toBeVisible();
    await expect(page.getByRole('link', { name: '次の Spot' })).toHaveCount(0);
  });
});

test.describe('操作（06 章 §5.5）', () => {
  test('他人の投稿: 編集・削除のボタンを出さない', async ({ page }) => {
    await open(page);
    await expect(page.locator('.res-actual')).toBeVisible();
    await expect(page.getByRole('button', { name: '削除' })).toHaveCount(0);
  });

  test('管理者は他人の投稿を削除できる', async ({ page }) => {
    const be = await open(page, detail({ admin: true }));
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('この投稿を削除しますか');
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page).toHaveURL('/');
    expect(be.deletes).toEqual([ID]);
  });

  test('自分の投稿: 全体 / 自分（自分の回答）、削除（やめる）。編集のボタンは無い', async ({ page }) => {
    const be = await open(page, authorDetail());
    await expect(page.getByRole('tab')).toHaveText(['全体（2人）', '自分', '自分との差']);
    await cell(page, 'QQ').click();
    await expect(detailBox(page)).toContainText('自分：Fold 25% / Raise 75%');
    await tab(page, '自分').click();
    await expect(detailBox(page)).toContainText('Fold 25% / Raise 75%');
    await expect(page.getByRole('link', { name: /想定 Range/ })).toHaveCount(0);

    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: 'やめる' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(be.deletes).toEqual([]);
  });
});

test.describe('スマホ（06 章 §5.1）', () => {
  test('集計 / Hand History のタブ。切り替えても Replay の位置と選んだマスが残る @sp', async ({ page }) => {
    await open(page);
    await expect(tab(page, '集計')).toHaveAttribute('aria-selected', 'true');
    await cell(page, 'AA').tap();
    await expect(detailBox(page)).toContainText('Range 内 2 / 2人');

    await tab(page, 'Hand History').tap();
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await page.getByRole('button', { name: '1手戻る' }).tap();
    await expect(page.getByText('14 / 15 手目')).toBeVisible();

    await tab(page, '集計').tap();
    await expect(cell(page, 'AA')).toHaveAttribute('aria-pressed', 'true');
    await tab(page, 'Hand History').tap();
    await expect(page.getByText('14 / 15 手目')).toBeVisible();
  });
});

test.describe('スクロールしても固定する部分（2026-09-29）', () => {
  test('集計: 画面のタブと集計の表示の切り替えは上に固定 @sp', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(tab(page, '集計')).toBeInViewport();
    await expect(tab(page, '自分')).toBeInViewport();
    await tab(page, '自分').click();
    await expect(tab(page, '自分')).toHaveAttribute('aria-selected', 'true');
  });

  test('一覧: 範囲のタブ・Street・並び替えは上に固定 @sp', async ({ page }) => {
    await fakeBackend(page, null);
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000000${10 + i}`,
      created_at: '2026-09-28T00:00:00.000000+00:00',
      title: `t${i}`,
      fmt: 'cash',
      hero: 'BTN',
      street: 'turn',
      effective_stack: 100,
      answer_count: 0,
      is_mine: false,
      answered_by_me: false,
      can_delete: false,
    }));
    await page.route(`${DATA}/rpc/list_posts`, (r) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': r.request().headers()['origin'] ?? '*', 'access-control-allow-credentials': 'true', 'content-type': 'application/json' },
        body: JSON.stringify(rows),
      }),
    );
    await page.goto('/');
    await expect(page.getByText('t11')).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByText('t0', { exact: true })).not.toBeInViewport();
    await expect(page.getByRole('tab', { name: '自分の投稿' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'River' })).toBeInViewport();
    await expect(page.getByRole('button', { name: '回答が多い順' })).toBeInViewport();
  });
});

test('PC の Hand History は卓の下に横一列（横にスクロール。押すとその時点へ。2026-09-29）', async ({ page }) => {
  await open(page);
  const strip = page.locator('.ans-replay .hlog.strip');
  // 最初は最後の手（River の BB の Call）まで出して、そこへ送ってある
  await expect(strip.locator('li').last()).toContainText('BB Call');
  await expect(strip.locator('li').last()).toBeInViewport();
  const tops = await strip.locator('li').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // 最後の手まで送ってある
  // 最新の手のカードが枠の中に欠けずに見えている。scrollLeft などの数値は FitStage の zoom で見た目と合わないことがある
  // （CI の Linux で、見た目は右端でも 10px 足りない値になった）ので、要素の位置で確かめる
  const edge = await strip.evaluate((e) => {
    const s = e.getBoundingClientRect();
    const items = e.querySelectorAll('li');
    const l = (items[items.length - 1] as HTMLElement).getBoundingClientRect();
    return { right: l.right - s.right, left: l.left - s.left };
  });
  expect(edge.right).toBeLessThanOrEqual(1);
  expect(edge.left).toBeGreaterThanOrEqual(-1);
  // 卓は縦長にしない（460px まで）
  const t = await page.locator('.ans-replay .ptable').boundingBox();
  expect(t!.height).toBeLessThanOrEqual(461);
  await strip.getByRole('button', { name: 'BTN Bet 1.8' }).click();
  await expect(page.getByText('8 / 15 手目')).toBeVisible();
});
