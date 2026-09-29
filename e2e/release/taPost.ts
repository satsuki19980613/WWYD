/**
 * 投稿画面（/new）の操作の部品。PC（全部の節が並ぶ）とスマホ（4 ステップ）の両方で同じ呼び出しで動かす。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { fakeBackend, fakeCreatePost, type Backend, type CreatePostCall } from './taKit.ts';

/** スマホには「Bet の額（bb）」のボタンもあるので、額つきの Bet ボタン（「Bet 1.8」）だけに当てる */
export const BET_BTN = /^Bet\s*\d/;
export const isMobile =(page: Page): boolean => (page.viewportSize()?.width ?? 1280) < 700;

export const dock = (page: Page): Locator => page.getByRole('group', { name: 'Action' });
export const table = (page: Page): Locator => page.getByRole('group', { name: 'Table' });
export const acting = (page: Page): Locator => table(page).locator('.pseat.acting');
export const errorsBox = (page: Page): Locator => page.locator('.pf-errors');

export async function openNew(page: Page): Promise<{ be: Backend; cp: { calls: CreatePostCall[] } }> {
  const be = await fakeBackend(page, null);
  const cp = await fakeCreatePost(page);
  await page.goto('/new');
  return { be, cp };
}

/** スマホはステップを移る（PC は全部の節が並んでいるので何もしない） */
export async function step(page: Page, name: RegExp): Promise<void> {
  if (!isMobile(page)) return;
  await page.getByRole('button', { name }).first().click();
}
export const S_SETTINGS = /^1\s*基本設定$/;
export const S_PLAYER = /^2\s*Player$/;
export const S_ACTION = /^3\s*Action$/;
export const S_SPOT = /^4\s*Spot$/;

export async function setPlayers(page: Page, n: number): Promise<void> {
  await step(page, S_PLAYER);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: String(n), exact: true }).click();
}

/** 席のハンドをキーで入れて閉じる（PC は選択ボード、スマホはカードキーボード。パソコンのキーで打てる） */
export async function setHand(page: Page, seat: string, keys: string): Promise<void> {
  await step(page, S_PLAYER);
  await page.getByRole('button', { name: `${seat} の Hand` }).click();
  for (const k of keys) await page.keyboard.press(k);
  await page.keyboard.press('Escape');
}

/** ボードのカード（ピッカーが開いているとき）を順に押す。例 ['K♥','8♦','3♣'] */
export async function pickBoard(page: Page, cards: string[]): Promise<void> {
  for (const c of cards) await page.getByRole('gridcell', { name: c }).click();
}

export async function toSpot(page: Page): Promise<void> {
  await step(page, S_SPOT);
}

export async function setTitle(page: Page, title: string): Promise<void> {
  await toSpot(page);
  await page.getByPlaceholder(/タイトル/).fill(title);
}

export async function submit(page: Page): Promise<void> {
  await toSpot(page);
  await page.getByRole('button', { name: /^投稿(する|中…)$/ }).click();
}

/**
 * 6 人。Hero=BTN の Ad Kd、BB の Qs Jc。UTG〜CO Fold、BTN Open 2.5、SB Fold、BB Call。
 * Flop K♥8♦3♣: BB Check、BTN Bet（33%）、BB Call。Turn 2♠: BB Check、BTN Bet（33%）、BB Fold。
 * 12 手（0〜11）で、Hero の Flop 以降の手番は 7（Flop の Bet）と 10（Turn の Bet）。
 */
export async function playSrpTurn(page: Page): Promise<void> {
  await setPlayers(page, 6);
  await setHand(page, 'BTN', 'adkd');
  await setHand(page, 'BB', 'qsjc');
  await step(page, S_ACTION);
  const d = dock(page);
  await d.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
  await d.getByRole('button', { name: /^Open/ }).click();
  await d.getByRole('button', { name: 'Fold' }).click(); // SB
  await d.getByRole('button', { name: /^Call/ }).click(); // BB
  await pickBoard(page, ['K♥', '8♦', '3♣']);
  await d.getByRole('button', { name: 'Check' }).click(); // BB
  await d.getByRole('button', { name: BET_BTN }).click(); // BTN
  await d.getByRole('button', { name: /^Call/ }).click(); // BB
  await pickBoard(page, ['2♠']);
  await d.getByRole('button', { name: 'Check' }).click(); // BB
  await d.getByRole('button', { name: BET_BTN }).click(); // BTN
  await d.getByRole('button', { name: 'Fold' }).click(); // BB
  await expect(page.getByText('BTN Pot 獲得')).toBeVisible();
}

/** Spot の候補を 1 つ選ぶ */
export async function pickSpot(page: Page, label: string): Promise<void> {
  await toSpot(page);
  await page.getByRole('radio', { name: label }).click();
}

/** Spot の候補（ラベルの一覧） */
export async function spotLabels(page: Page): Promise<string[]> {
  await toSpot(page);
  return page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio').allInnerTexts();
}
