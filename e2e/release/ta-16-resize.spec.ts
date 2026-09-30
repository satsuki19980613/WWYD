/**
 * T-A（探索）: 使っている途中で画面の幅が変わる（スマホの横向き・ウィンドウの大きさ変更）。幅 927px・高さ 605px を境に PC とスマホでレイアウトが切り替わる（06 章 §0.2・17 章 §3.0）。
 * 入力中の内容（投稿の下書き・回答の塗りと Size・集計で選んだマスと Replay の位置）が保たれるか。OCR の確認画面は ta-06-ocr-review.spec.ts。
 */
import { expect, test, type Page } from '@playwright/test';
import { aggregateHex, detailJson, paintHexOf, paintOf } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';
import { watchErrors } from './taKit.ts';
import { dock, pickSpot, playSrpTurn, setTitle, step, S_ACTION } from './taPost.ts';

const ID = '00000000-0000-4000-8000-000000000001';

const NARROW = { width: 412, height: 839 };
const WIDE = { width: 1280, height: 900 };

async function open(page: Page, d: Record<string, unknown>, path: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fakeBackend(page, d);
  await page.goto(path);
}

test('回答: 塗り・ブラシ・Size・Replay の位置は PC ⇄ スマホの切り替えで保たれる', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, detailJson(hs1bb(), { viewer: 'unanswered', id: ID }), `/s/${ID}/answer`);
  await page.getByRole('button', { name: /^AA / }).click();
  await page.getByRole('button', { name: /^Raise \d+%/ }).click();
  await page.getByRole('button', { name: /^KK / }).click();
  await page.keyboard.press('ArrowLeft'); // Replay を 1 手戻す
  await expect(page.getByText('10 / 11 手目')).toBeVisible();
  await page.getByRole('button', { name: /^Raise Size/ }).click();
  await page.getByRole('textbox', { name: 'Raise Size（bb）' }).fill('30');
  await page.setViewportSize(NARROW);
  await expect(page.getByRole('tab', { name: 'Range' })).toBeVisible();
  await expect(page.getByText('10 / 11 手目')).toBeVisible(); // Replay のタブが既定
  await page.getByRole('tab', { name: 'Range' }).click();
  await expect(page.getByRole('button', { name: /^AA / })).toHaveAccessibleName('AA Call 100%');
  await expect(page.getByRole('button', { name: /^KK / })).toHaveAccessibleName('KK Raise 100%');
  await expect(page.getByRole('button', { name: /^Raise Size/ })).toContainText('30');
  await page.setViewportSize(WIDE);
  await expect(page.getByRole('button', { name: /^AA / })).toHaveAccessibleName('AA Call 100%');
  await expect(page.getByRole('button', { name: /^Raise Size/ })).toContainText('30');
  await expect(page.getByText('10 / 11 手目')).toBeVisible();
  expect(errors).toEqual([]);
});

test('集計: 選んだマス・表示（自分との差）・Replay の位置は切り替えで保たれる', async ({ page }) => {
  const agg = aggregateHex([paintOf({ AA: { call: 20 } }), paintOf({ AA: { call: 10, s1: 10 }, KK: { fold: 20 } })]);
  await open(page, detailJson(hs1bb(), { viewer: 'answered', id: ID, answerCount: 2, aggregate: agg, myAnswer: { paint: paintHexOf({ AA: { call: 20 } }), size: null } }), `/s/${ID}/result`);
  await page.getByRole('tab', { name: '自分との差' }).click();
  await page.getByRole('button', { name: 'KK', exact: true }).click();
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // 表にフォーカスがあると矢印・Home は表が使う
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 / 15 手目')).toBeVisible();
  await page.setViewportSize(NARROW);
  await expect(page.getByRole('tab', { name: '自分との差' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'KK', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Hand History' }).click();
  await expect(page.getByText('2 / 15 手目')).toBeVisible();
  await page.setViewportSize(WIDE);
  await expect(page.getByText('2 / 15 手目')).toBeVisible();
});

test('投稿: Action・Board・Spot・タイトルを入れたあと PC → スマホ → PC に切り替えても入力が保たれる。Card ピッカーを開いたままでも落ちない', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeBackend(page, null);
  await page.goto('/new');
  await playSrpTurn(page);
  await pickSpot(page, 'Turn / BTN Bet 3');
  await setTitle(page, '幅の切り替え');
  await page.setViewportSize(NARROW);
  await step(page, S_ACTION);
  await expect(page.getByText('BTN Pot 獲得')).toBeVisible();
  await page.getByRole('button', { name: /^4\s*Spot$/ }).click();
  await expect(page.getByRole('radio', { name: 'Turn / BTN Bet 3' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByPlaceholder(/タイトル/)).toHaveValue('幅の切り替え');
  await page.setViewportSize(WIDE);
  await expect(page.getByPlaceholder(/タイトル/)).toHaveValue('幅の切り替え');
  await expect(page.getByText('BTN Pot 獲得')).toBeVisible();
  // Card の選択ボード（Hand）を開いたまま幅を変える → 落ちない。閉じてから続けられる
  await page.getByRole('button', { name: 'SB の Hand' }).click();
  await page.setViewportSize(NARROW);
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.setViewportSize(WIDE);
  await expect(dock(page)).toHaveCount(0); // ハンドは終わっているので台は無い
  await expect(page.getByPlaceholder(/タイトル/)).toHaveValue('幅の切り替え');
  expect(errors).toEqual([]);
});

test('一覧: 絞り込みは URL にあるので、切り替えても保たれる。PC の表 ⇄ スマホのカード', async ({ page }) => {
  await fakeBackend(page, null);
  await page.goto('/?tab=mine&street=flop&sort=many');
  await expect(page.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Flop' })).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize(NARROW);
  await expect(page.getByRole('tab', { name: '自分の投稿' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Flop' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: '並び替え' }).getByRole('button', { name: '回答が多い順' })).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize(WIDE);
  await expect(page.getByRole('group', { name: '範囲' }).getByRole('button', { name: '自分の投稿' })).toHaveAttribute('aria-pressed', 'true');
});
