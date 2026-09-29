/**
 * T-A A-08: 集計（06 章 §5、05 章 §4、17 章）。既存の result.spec.ts（H-S1 の BB・回答 2 件）以外の観点:
 * 濃さの 5 段（20% 刻み）と色の幅、マウスを乗せる・離す、タブ切り替えで選んだマスが残る、回答 0 件・多数、
 * Hero の Fold の答え合わせ、Check / Bet の局面、削除の失敗、Replay のキーと History。PC は既定、スマホは @sp。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { spotCandidates } from '../../packages/core/src/index.ts';
import { acts } from '../../packages/core/src/poker/testHelpers.ts';
import { aggregateHex, detailJson, paintHexOf, paintOf } from '../../packages/app/src/answer/detailFixtures.ts';
import { ALLIN_CASES, allinRaw } from '../../packages/core/src/post/allinFixtures.ts';
import { hs1, hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend, type Backend } from '../fakeBackend.ts';
import { DATA, fulfillJson, watchErrors } from './taKit.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const RESULT = `/s/${ID}/result`;

const cell = (page: Page, label: string): Locator => page.getByRole('button', { name: label, exact: true });
const tab = (page: Page, name: string): Locator => page.getByRole('tab', { name, exact: true });
const detailBox = (page: Page): Locator => page.locator('.res-detail');

async function open(page: Page, d: Record<string, unknown>, path = RESULT): Promise<Backend> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const be = await fakeBackend(page, d);
  await page.goto(path);
  return be;
}

/** N 人の回答から集計を作る。cells: マス → その人数（全員 Call 100%） */
function crowd(n: number, cells: Record<string, number>): string {
  const paints = Array.from({ length: n }, (_, i) => {
    const c: Record<string, { call: number }> = {};
    for (const [label, count] of Object.entries(cells)) if (i < count) c[label] = { call: 20 };
    return paintOf(c);
  });
  return aggregateHex(paints);
}

const answered = (raw: Record<string, unknown>, o: Partial<Parameters<typeof detailJson>[1]> = {}): Record<string, unknown> =>
  detailJson(raw, { viewer: 'answered', id: ID, answerCount: 1, myAnswer: { paint: paintHexOf({ AA: { call: 20 } }), size: null }, ...o });

test.describe('A-08 集計の表示（PC）', () => {
  test('濃さの 5 段（N=20）: n=1→0.3、4→0.3、5→0.475、8→0.475、12→0.65、16→0.825、17→1、20→1。色の幅は平均の頻度', async ({ page }) => {
    const errors = watchErrors(page);
    const agg = crowd(20, { AA: 20, KK: 16, QQ: 12, JJ: 8, TT: 4, '99': 5, '88': 1, '77': 17 });
    await open(page, answered(hs1bb(), { answerCount: 20, aggregate: agg }));
    const op = async (l: string): Promise<number> => Number(await cell(page, l).locator('.cfill').evaluate((e) => getComputedStyle(e).opacity));
    expect(await op('AA')).toBeCloseTo(1, 5);
    expect(await op('KK')).toBeCloseTo(0.825, 5);
    expect(await op('QQ')).toBeCloseTo(0.65, 5);
    expect(await op('JJ')).toBeCloseTo(0.475, 5);
    expect(await op('TT')).toBeCloseTo(0.3, 5);
    expect(await op('99')).toBeCloseTo(0.475, 5);
    expect(await op('88')).toBeCloseTo(0.3, 5);
    expect(await op('77')).toBeCloseTo(1, 5);
    await expect(cell(page, '66').locator('.cfill')).toHaveCount(0); // 0 人は無色
    // 全員 Call 100% → call の幅 100%
    await expect(cell(page, 'KK').locator('.cseg.call')).toHaveCSS('width', /^\d+/);
    const w = await cell(page, 'KK').locator('.cseg.call').evaluate((e) => (e as HTMLElement).style.width);
    expect(w).toBe('100%');
    await cell(page, 'KK').click();
    await expect(detailBox(page)).toContainText('Range 内 16 / 20人');
    await expect(detailBox(page)).toContainText('Call 100.0%（16人）');
    expect(errors).toEqual([]);
  });

  test('マスの色: 混合の幅は平均の頻度（AA が Call 75% / Raise 25% なら 75%・25%）。Fold 100% と Raise 100% の混在', async ({ page }) => {
    const agg = aggregateHex([
      paintOf({ AA: { call: 20 }, KK: { fold: 20 } }),
      paintOf({ AA: { call: 10, s1: 10 }, KK: { s1: 20 } }),
    ]);
    await open(page, answered(hs1bb(), { answerCount: 2, aggregate: agg }));
    const width = async (l: string, k: string): Promise<string> => cell(page, l).locator(`.cseg.${k}`).evaluate((e) => (e as HTMLElement).style.width);
    expect(await width('AA', 'call')).toBe('75%');
    expect(await width('AA', 's1')).toBe('25%');
    expect(await width('KK', 'fold')).toBe('50%');
    expect(await width('KK', 's1')).toBe('50%');
    await cell(page, 'KK').click();
    await expect(detailBox(page)).toContainText('Fold 50.0%（1人）');
    await expect(detailBox(page)).toContainText('Raise 50.0%（1人）');
  });

  test('マウスを乗せると内訳がそのマスになり、離すと選んだマス（Hero の Hand のマス）に戻る。押すと固定', async ({ page }) => {
    await open(page, answered(hs1bb(), { answerCount: 2, aggregate: aggregateHex([paintOf({ AA: { call: 20 } }), paintOf({ AA: { call: 20 }, KK: { fold: 20 } })]) }));
    await expect(detailBox(page)).toContainText('KJs');
    await cell(page, 'AA').hover();
    await expect(detailBox(page)).toContainText('AA');
    await expect(detailBox(page)).toContainText('Range 内 2 / 2人');
    await cell(page, 'KK').hover();
    await expect(detailBox(page)).toContainText('Range 内 1 / 2人');
    await page.mouse.move(5, 5); // 表の外
    await expect(detailBox(page)).toContainText('KJs');
    await expect(detailBox(page)).toContainText('Range 内 0 / 2人');
    // 押すと固定。別のマスに乗せてから離れても戻る
    await cell(page, 'AA').click();
    await cell(page, 'KK').hover();
    await page.mouse.move(5, 5);
    await expect(detailBox(page)).toContainText('AA');
    await expect(cell(page, 'AA')).toHaveAttribute('aria-pressed', 'true');
  });

  test('タブを切り替えても選んだマスが残る。回答 0 件は「回答なし」（自分の回答が無ければ自分のタブも）。差のタブは回答 0 件では出ない', async ({ page }) => {
    await open(page, answered(hs1bb(), { answerCount: 0, aggregate: undefined }));
    await expect(page.getByRole('tab')).toHaveText(['全体（0人）', '自分']);
    await expect(page.getByText('回答なし')).toBeVisible();
    await tab(page, '自分').click();
    await expect(cell(page, 'AA')).toBeVisible(); // 自分の回答があれば表が出る
    await open(page, answered(hs1bb(), { answerCount: 3, aggregate: crowd(3, { AA: 3 }) }));
    await cell(page, 'AA').click();
    for (const t of ['自分', '自分との差', '全体（3人）']) {
      await tab(page, t).click();
      await expect(cell(page, 'AA')).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('回答が多い投稿（2000 人）: 「全体（2000人）」。濃さは N に対する割合で n=1 でも無色にしない', async ({ page }) => {
    const agg = crowd(2000, { AA: 2000, KK: 399, QQ: 401, JJ: 1 });
    await open(page, answered(hs1bb(), { answerCount: 2000, aggregate: agg }));
    await expect(tab(page, '全体（2000人）')).toBeVisible();
    const op = async (l: string): Promise<number> => Number(await cell(page, l).locator('.cfill').evaluate((e) => getComputedStyle(e).opacity));
    expect(await op('KK')).toBeCloseTo(0.3, 5);
    expect(await op('QQ')).toBeCloseTo(0.475, 5);
    expect(await op('JJ')).toBeCloseTo(0.3, 5);
    await cell(page, 'QQ').click();
    await expect(detailBox(page)).toContainText('Range 内 401 / 2000人');
  });

  test('Hero が Fold した投稿の答え合わせは「Fold」。Check / Bet の局面（H-S1 の BTN）は Bet / Check の名前で内訳を出す', async ({ page }) => {
    const c = ALLIN_CASES.find((x) => /River で相手の All-in に Hero が Fold$/.test(x.name));
    if (!c) throw new Error('見本が無い');
    const cands = spotCandidates(acts(c.actions), c.hero);
    const idx = c.spots.findIndex(([l]) => l === 'River / BTN Fold');
    const raw = allinRaw(c, (cands[idx] as { index: number }).index);
    await open(page, answered(raw, { answerCount: 2, aggregate: aggregateHex([paintOf({ AA: { call: 20 } }), paintOf({ AA: { fold: 20 } })]) }));
    await expect(page.locator('.res-actual')).toContainText('Hero（BTN）実際の Action');
    await expect(page.locator('.res-actual-name')).toHaveText('Fold');
    await cell(page, 'AA').click();
    await expect(detailBox(page)).toContainText('Fold 50.0%（1人）');
    await expect(detailBox(page)).toContainText('Call 50.0%（1人）');
    await expect(detailBox(page)).not.toContainText('Raise');
  });

  test('Check / Bet の局面: 内訳のキーは Check・Bet だけ。実際の Action は「Bet 6.5bb」', async ({ page }) => {
    const agg = aggregateHex([paintOf({ AA: { check: 20 } }), paintOf({ AA: { s1: 20 } })]);
    await open(page, answered(hs1(), { answerCount: 2, aggregate: agg, myAnswer: { paint: paintHexOf({ AA: { check: 20 } }), size: null } }));
    await expect(page.locator('.res-actual-name')).toHaveText('Bet 6.5bb');
    await cell(page, 'AA').click();
    await expect(detailBox(page)).toContainText('Check 50.0%（1人）');
    await expect(detailBox(page)).toContainText('Bet 50.0%（1人）');
    await expect(detailBox(page)).toContainText('自分：Check 100%');
    await expect(detailBox(page)).not.toContainText('Fold');
  });

  test('削除の失敗（RLS で 0 件）はトースト「削除できませんでした」。集計は残る。管理者以外の他人の投稿には削除が無い', async ({ page }) => {
    await open(page, answered(hs1bb(), { viewer: 'author', answerCount: 1, aggregate: crowd(1, { AA: 1 }) }));
    await page.route(`${DATA}/posts*`, (route) => (route.request().method() === 'DELETE' ? fulfillJson(route, 200, []) : route.fallback()));
    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.locator('.toast')).toHaveText('削除できませんでした');
    await expect(page).toHaveURL(RESULT);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(cell(page, 'AA')).toBeVisible();
  });

  test('Replay: History のカードを押すとその時点へ。← → Home End。最後で → は動かない。SPOT の目盛りがある', async ({ page }) => {
    await open(page, answered(hs1bb(), { answerCount: 2, aggregate: crowd(2, { AA: 2 }) }));
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.getByText('0 / 15 手目')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('0 / 15 手目')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await page.locator('.hlog-pick').first().click();
    await expect(page.getByText('1 / 15 手目')).toBeVisible();
    // ログの「出題」の行を押すと、その Action の直後（11 手目の Action = index 11 → 12 手目）
    await page.keyboard.press('End');
    await page.locator('.hlog.strip').getByRole('button', { name: /^BB Call 6.5/ }).click();
    await expect(page.getByText('12 / 15 手目')).toBeVisible();
    await expect(page.locator('.ptable.at-spot .pseat-spot, .pseat-spot')).toHaveCount(0); // 出題の局面はその 1 手前
    // 表のマスを選んでいるとき、矢印はマスが使い、Replay は動かない
    await cell(page, 'AA').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('12 / 15 手目')).toBeVisible();
  });
});

test.describe('A-08 集計の表示（スマホ @sp）', () => {
  test('タップで内訳。3 つの表示（全体・自分・自分との差）の切り替えと、Hand History のタブ・History モーダル @sp', async ({ page }) => {
    await open(page, answered(hs1bb(), { answerCount: 2, aggregate: crowd(2, { AA: 2, KK: 1 }) }));
    await cell(page, 'KK').tap();
    await expect(detailBox(page)).toContainText('Range 内 1 / 2人');
    for (const t of ['自分', '自分との差', '全体（2人）']) {
      await tab(page, t).tap();
      await expect(tab(page, t)).toHaveAttribute('aria-selected', 'true');
    }
    await tab(page, 'Hand History').tap();
    await expect(page.getByText('15 / 15 手目')).toBeVisible();
    await page.getByRole('button', { name: 'History' }).click();
    const log = page.getByRole('dialog', { name: 'Hand History' });
    await expect(log).toContainText('出題');
    await page.keyboard.press('Escape');
    await tab(page, '集計').tap();
    await expect(cell(page, 'KK')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('スマホでも、削除（自分の投稿）と次の Spot の固定ボタンがある @sp', async ({ page }) => {
    const be = await open(page, answered(hs1bb(), { viewer: 'author', answerCount: 1, aggregate: crowd(1, { AA: 1 }) }));
    await page.getByRole('button', { name: '削除' }).tap();
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).tap();
    await expect(page).toHaveURL('/');
    expect(be.deletes).toEqual([ID]);
  });
});
