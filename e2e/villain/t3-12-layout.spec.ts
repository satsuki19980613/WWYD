/**
 * 画面の大きさごとの崩れ（T3 の探索）: 回答・集計の画面で、情報が最大のとき（全席に Read・MTT の全項目・長いタイトル）に、
 * 横のはみ出し・卓とボタンの行の重なり・◆ の見切れ・モーダルが画面から出る、が無いこと。
 */
import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from '../release/taKit.ts';
import { baseHs1bb, noHScroll, openAnswer, openResult, overlaps } from './t3-kit.ts';

const SIZES: [number, number][] = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1024, 640],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

const entry = (street: string, action: string, lean: string, over: Record<string, unknown> = {}) => ({
  scope: 'general',
  street,
  action,
  texture: null,
  runout: null,
  size: null,
  lean,
  strong: true,
  ...over,
});

const FULL = (() => {
  const r: Record<string, unknown> = {};
  for (const p of ['UTG', 'HJ', 'CO', 'BTN', 'SB']) {
    r[p] = {
      vpip: 38,
      pfr: 12,
      agg: 4,
      image: 0,
      reads: [
        entry('flop', 'cbet', 'bluff', { texture: { high: 'qj', suit: 'two', paired: 'unpaired', connect: 'straight' }, size: 'overbet' }),
        entry('turn', 'barrel', 'value', { texture: { high: 'mid', suit: 'mono', paired: 'paired', connect: 'none' }, runout: ['over', 'flush', 'straight', 'pair'], size: 'overbet' }),
      ],
    };
  }
  return r;
})();
const MTT_FULL = { speed: 100, rank: 1000000, left: 1000000, paid: 1000000, entries: 1000000, avg: 99999, prize: 'standard' };
const TITLE40 = 'とても長いタイトルの例として四十文字いっぱいの題名を付けたとき'.slice(0, 40);

async function checkScreen(page: Page, label: string): Promise<void> {
  expect(await noHScroll(page), `${label}: ページの横はみ出し`).toBe(true);
  const info = page.locator('.rp-info');
  const table = page.locator('.ptable');
  if ((await info.count()) > 0 && (await table.count()) > 0) {
    expect(await overlaps(info, table), `${label}: ボタンの行と卓が重なる`).toBe(false);
  }
  // 席の ◆ は画面の中に入っている
  const w = page.viewportSize()?.width ?? 0;
  for (const b of await page.locator('.pseat-read').all()) {
    const bb = await b.boundingBox();
    expect(bb && bb.x >= -1 && bb.x + bb.width <= w + 1, `${label}: ◆ が見切れる ${JSON.stringify(bb)}`).toBe(true);
  }
  // 席の札（ボタン）は画面の幅の中
  for (const b of await page.locator('.pseat-btn').all()) {
    const bb = await b.boundingBox();
    expect(bb && bb.x >= -1 && bb.x + bb.width <= w + 1, `${label}: 席の札が見切れる`).toBe(true);
  }
}

async function checkModal(page: Page, label: string): Promise<void> {
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await page.waitForTimeout(450); // 下からせり上がるアニメーションが終わるまで
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  const bb = await dlg.boundingBox();
  expect(bb, `${label}: モーダルが見えない`).not.toBeNull();
  if (!bb) return;
  expect(bb.x, `${label}: モーダルの左が画面の外`).toBeGreaterThanOrEqual(-1);
  expect(bb.x + bb.width, `${label}: モーダルの右が画面の外`).toBeLessThanOrEqual(vp.width + 1);
  expect(bb.y + bb.height, `${label}: モーダルの下が画面の外`).toBeLessThanOrEqual(vp.height + 1);
  expect(bb.y, `${label}: モーダルの上が画面の外`).toBeGreaterThanOrEqual(-1);
  // モーダルの中に横のあふれが無い
  const over = await dlg.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>('*')).filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map((e) => e.className));
  expect(over, `${label}: モーダルの中ではみ出す要素`).toEqual([]);
  // 閉じるボタンが見えて押せる
  await expect(dlg.getByRole('button', { name: /閉じる|Close/ }).first()).toBeVisible();
}

test('T3 探索: 回答画面・集計画面（最大の情報）を 10 種類の画面の大きさで見て、崩れが無い', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const screen of ['answer', 'result'] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const raw = { ...baseHs1bb(), title: TITLE40, fmt: 'mtt', rake: null, villain_reads: FULL, mtt: MTT_FULL };
      if (screen === 'answer') await openAnswer(page, raw, { motion: 'no-preference' });
      else await openResult(page, raw, { motion: 'no-preference' });
      await expect(page.locator('.ptable')).toBeVisible().catch(async () => {
        // スマホの集計は Hand History のタブ
        await page.getByRole('tab', { name: 'Hand History' }).click();
        await expect(page.locator('.ptable')).toBeVisible();
      });
      const label = `${screen} ${w}×${h}`;
      await checkScreen(page, label);
      // 席のモーダル（情報のある席のうち最初）・All Villains・MTT
      await page.locator('.pseat-btn').first().click();
      await checkModal(page, `${label} 席`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'All Villains' }).click();
      await checkModal(page, `${label} All Villains`);
      await page.locator('details.rv-folded summary').click();
      await checkModal(page, `${label} All Villains（Fold を開く）`);
      expect(await noHScroll(page)).toBe(true);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'MTT', exact: true }).click();
      await checkModal(page, `${label} MTT`);
      await page.keyboard.press('Escape');
    }
  }
  expect(errors).toEqual([]);
});

test('T3 探索: 一覧（スマホ幅 4 種・PC）で、印つきの長い行が崩れない', async ({ page }) => {
  const { fakeBackend } = await import('../fakeBackend.ts');
  const { fakeList, row } = await import('../release/taKit.ts');
  await fakeBackend(page, null);
  await fakeList(page, [
    row(1, { title: TITLE40, has_reads: true, has_mtt: true, fmt: 'mtt', effective_stack: 100.5, street: 'river', board: ['Kh', '8d', '3c', '2s', '7h'], hero: 'BB', players: 6, answer_count: 1234, is_mine: true, can_delete: true }),
  ]);
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await expect(page.locator('.spot-link').first()).toBeVisible();
    const wide = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5).map((e) => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().right)}`).slice(0, 8));
    expect(await noHScroll(page), `一覧 ${w}: ${JSON.stringify(wide)}`).toBe(true);
  }
});
