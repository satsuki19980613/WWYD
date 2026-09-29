/**
 * 一覧（06 章 §2・17 章）: PC は表、スマホはカード。どちらも Board（スポットの Street まで）と人数を出す。
 */
import { expect, test } from '@playwright/test';
import { fakeBackend } from './fakeBackend.ts';

const row = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: '00000000-0000-4000-8000-000000000001',
  created_at: '2026-09-28T10:00:00.123456+00:00',
  title: 'BTN の 3bet',
  fmt: 'cash',
  hero: 'BTN',
  street: 'turn',
  effective_stack: 100,
  answer_count: 3,
  is_mine: false,
  answered_by_me: false,
  can_delete: false,
  players: 6,
  board: ['Kh', '8d', '3c', '2s'],
  ...over,
});

const ROWS = [
  row({}),
  row({ id: '00000000-0000-4000-8000-000000000002', title: '自分の投稿', is_mine: true, can_delete: true, players: 3, street: 'flop', board: ['Ah', 'Kd', '2c'] }),
];

test('PC: 行に Board と人数。削除は専用の列で、ほかの列の位置は変わらない（17 章）', async ({ page }) => {
  const be = await fakeBackend(page, null);
  be.listRows = ROWS;
  await page.goto('/');
  const rows = page.locator('.spot-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('6 Players');
  await expect(rows.nth(0).getByLabel('Board K♥ 8♦ 3♣ 2♠')).toBeVisible();
  await expect(rows.nth(1)).toContainText('3 Players');
  await expect(rows.nth(1).locator('.pcard')).toHaveCount(3);
  // 行の高さは 144px 以上。「回答する」の位置は削除のボタンがあってもなくても同じ
  const h = (await rows.nth(0).boundingBox())?.height ?? 0;
  expect(h).toBeGreaterThanOrEqual(144);
  const go0 = await rows.nth(0).locator('.spot-go').boundingBox();
  const go1 = await rows.nth(1).locator('.spot-go').boundingBox();
  expect(go0?.x).toBeCloseTo(go1?.x ?? -1, 0);
  await expect(rows.nth(1).getByRole('button', { name: '削除' })).toBeVisible();
});

test('スマホ: カードに Board と人数 @sp', async ({ page }) => {
  const be = await fakeBackend(page, null);
  be.listRows = ROWS;
  await page.goto('/');
  const cards = page.locator('.spot-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('6 Players');
  await expect(cards.nth(0).locator('.pcard')).toHaveCount(4);
});
