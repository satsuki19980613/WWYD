/**
 * T-A（探索）: スマホのカードキーボード（06 章 §3.5）のフリック入力を、実際のタッチ（CDP の touch イベント）で確かめる。
 * Q のキー: タップ / 上 / 左 / 下 = Q / K / T / J。♠ のキー: ♠ / ♥ / ♦ / ♣。右への払いは何もしない。C = Hand を消す、⌫ = 1 文字消す。
 * 使用済みの札はトースト。完了・キーボードの外・Esc で閉じる。前の席・次の席。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend } from './taKit.ts';
import { S_PLAYER, setPlayers, step } from './taPost.ts';

async function openKeyboard(page: Page, seat = 'BTN'): Promise<void> {
  await fakeBackend(page, null);
  await page.goto('/new');
  await setPlayers(page, 6);
  await step(page, S_PLAYER);
  await page.getByRole('button', { name: `${seat} の Hand` }).click();
  await expect(page.getByRole('group', { name: 'Card キーボード' })).toBeVisible();
}

const handText = async (page: Page, seat = 'BTN'): Promise<string> => (await page.getByRole('button', { name: `${seat} の Hand` }).innerText()).replace(/\s+/g, '');

/** キーの中心から (dx, dy) だけ払う。hold ms 押したままにしてから離す */
async function flick(page: Page, label: string, dx: number, dy: number, hold = 0): Promise<void> {
  const key = page.getByRole('button', { name: label });
  const b = (await key.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const t = (type: 'touchStart' | 'touchMove' | 'touchEnd', px: number, py: number): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }] });
  await t('touchStart', x, y);
  if (hold > 0) await page.waitForTimeout(hold);
  if (dx !== 0 || dy !== 0) {
    await t('touchMove', x + dx / 2, y + dy / 2);
    await t('touchMove', x + dx, y + dy);
  }
  await t('touchEnd', 0, 0);
  await cdp.detach();
}

const Q = 'Q（フリックで K T J）';
const SUIT = 'Suit（フリックで ♥ ♦ ♣）';

test.describe('カードキーボードのフリック @sp', () => {
  test('Q のキー: タップ Q・上 K・左 T・下 J。右へ払っても何も入らない @sp', async ({ page }) => {
    await openKeyboard(page);
    // ランクだけ → 次のスートで札にする
    await flick(page, Q, 0, 0);
    await expect.poll(() => handText(page)).toContain('Q');
    await flick(page, SUIT, 0, 0); // ♠
    await expect.poll(() => handText(page)).toBe('Q♠');
    await page.getByRole('button', { name: 'Hand を消す' }).click();
    await flick(page, Q, 0, -45); // 上 → K
    await flick(page, SUIT, 0, -45); // 上 → ♥
    await expect.poll(() => handText(page)).toBe('K♥');
    await flick(page, Q, -45, 0); // 左 → T
    await flick(page, SUIT, -45, 0); // 左 → ♦
    await expect.poll(() => handText(page)).toBe('K♥T♦');
    await page.getByRole('button', { name: 'Hand を消す' }).click();
    await flick(page, Q, 0, 45); // 下 → J
    await flick(page, SUIT, 0, 45); // 下 → ♣
    await expect.poll(() => handText(page)).toBe('J♣');
    // 右への払いは割り当てなし
    await flick(page, Q, 45, 0);
    await expect.poll(() => handText(page)).toBe('J♣');
  });

  test('押したまま 150ms でポップアップ（払う先の候補）が出て、離すと消える。5px 動かしても出る @sp', async ({ page }) => {
    await openKeyboard(page);
    const key = page.getByRole('button', { name: Q });
    const b = (await key.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }] });
    await expect(page.locator('.ckb-pop')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.ckb-pop')).toHaveCount(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 - 12, id: 1 }] });
    await expect(page.locator('.ckb-pop')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });

  test('数字キー・A・⌫・C。3 枚目は入らない。使用済みの札はトースト（A♠ を BTN に入れたあと SB に A♠） @sp', async ({ page }) => {
    await openKeyboard(page);
    await page.getByRole('button', { name: 'A', exact: true }).click();
    await flick(page, SUIT, 0, 0);
    await page.getByRole('button', { name: '9', exact: true }).click();
    await flick(page, SUIT, 0, -45); // ♥
    await expect.poll(() => handText(page)).toBe('A♠9♥');
    await page.getByRole('button', { name: 'A', exact: true }).click(); // 3 枚目は無視
    await expect.poll(() => handText(page)).toBe('A♠9♥');
    await page.getByRole('button', { name: '1 文字消す' }).click();
    await expect.poll(() => handText(page)).toContain('A♠');
    // 次の席（SB）へ。A♠ は使用済み
    await page.getByRole('button', { name: '次の席' }).click();
    await page.getByRole('button', { name: 'A', exact: true }).click();
    await flick(page, SUIT, 0, 0);
    await expect(page.locator('.toast')).toContainText('A♠ は使用済み');
    await expect.poll(() => handText(page, 'SB')).not.toContain('A♠');
  });

  test('前の席・次の席は座っている席を巡る（UTG の前は BB）。完了・Esc・キーボードの外で閉じる @sp', async ({ page }) => {
    await openKeyboard(page, 'UTG');
    const kb = page.getByRole('group', { name: 'Card キーボード' });
    await page.getByRole('button', { name: '前の席' }).click();
    await expect(kb.getByText('BB', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '次の席' }).click();
    await expect(kb.getByText('UTG', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '完了' }).click();
    await expect(kb).toHaveCount(0);
    await page.getByRole('button', { name: 'HJ の Hand' }).click();
    await page.keyboard.press('Escape');
    await expect(kb).toHaveCount(0);
    await page.getByRole('button', { name: 'CO の Hand' }).click();
    await page.getByRole('heading', { name: 'Player と Hand' }).click({ force: true }).catch(() => undefined);
    await page.mouse.click(200, 120); // キーボードの外
    await expect(kb).toHaveCount(0);
  });
});
