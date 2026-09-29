/**
 * T-A（探索）: アクションの台の「よく使う額」（06 章 §3.6）。Preflop のオープン（2 / 2.2 / 2.5 / 3bb。リンプがあれば増える）、3bet 以降（直前の to の ×2.2 / ×2.5 / ×3 / ×4）、
 * Flop 以降のベット（Pot の 25 / 33 / 50 / 75 / 100 / 150%）とレイズ（直前のベットの ×2.5 / ×3 / ×4）、最後に All-in。最初に選んでおく額。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dock, openNew, pickBoard, setPlayers, step, S_ACTION } from './taPost.ts';

/** よく使う額のチップの文字（「2.5」「×3 7.5」「33% 1.8」「All-in」）と、押された（選ばれている）チップ */
async function chips(page: Page, group: 'Raise の額' | 'Bet の額'): Promise<{ labels: string[]; pressed: string | null }> {
  const g: Locator = dock(page).getByRole('group', { name: group });
  const all = g.getByRole('button');
  const labels = (await all.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  const on = g.locator('button[aria-pressed="true"]');
  const pressed = (await on.count()) > 0 ? ((await on.first().innerText()).replace(/\s+/g, ' ').trim()) : null;
  return { labels, pressed };
}

test.describe('A-03 よく使う額（PC）', () => {
  test('Preflop のオープン: 2 / 2.2 / 2.5 / 3 と All-in。最初に選ばれているのは 2.5', async ({ page }) => {
    await openNew(page);
    await setPlayers(page, 6);
    const c = await chips(page, 'Raise の額');
    expect(c.labels).toEqual(['2', '2.2', '2.5', '3', 'All-in']);
    expect(c.pressed).toBe('2.5');
    // 押すと額の欄が変わる（打つのはボタン）
    await dock(page).getByRole('group', { name: 'Raise の額' }).getByRole('button', { name: '3', exact: true }).click();
    await expect(dock(page).getByRole('textbox', { name: 'Raise の額（to。bb）' })).toHaveValue('3');
    await expect(dock(page).getByRole('button', { name: /^Open\s*3$/ })).toBeVisible();
  });

  test('リンプがあるとオープンの額が増える（3 / 4 / 5 に、リンプ 1 人につき 1bb を足す）', async ({ page }) => {
    await openNew(page);
    await setPlayers(page, 6);
    await dock(page).getByRole('button', { name: /^Limp/ }).click(); // UTG が Limp
    const one = await chips(page, 'Raise の額');
    // 観察: 1 人のリンプ後の Raise の額
    expect(one.labels.slice(0, -1)).toEqual(['4', '5', '6']);
    await dock(page).getByRole('button', { name: /^Limp/ }).click(); // HJ も Limp
    const two = await chips(page, 'Raise の額');
    expect(two.labels.slice(0, -1)).toEqual(['5', '6', '7']);
  });

  test('3bet: 直前の Raise の ×2.2 / ×2.5 / ×3 / ×4（額を添える）。最初は ×3。4bet も直前の額から', async ({ page }) => {
    await openNew(page);
    await setPlayers(page, 6);
    const d = dock(page);
    await d.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
    await d.getByRole('button', { name: /^Open/ }).click(); // BTN 2.5
    // SB の 3bet: 2.5 × 2.2 = 5.5、× 2.5 = 6.25、× 3 = 7.5、× 4 = 10
    const c = await chips(page, 'Raise の額');
    expect(c.labels.slice(0, -1)).toEqual(['×2.2 5.5', '×2.5 6.25', '×3 7.5', '×4 10']);
    expect(c.pressed).toBe('×3 7.5');
    await d.getByRole('button', { name: /^3bet/ }).click(); // SB 3bet 7.5
    await d.getByRole('button', { name: 'Fold' }).click(); // BB
    // BTN の 4bet: 7.5 × 2.2 = 16.5 ...
    const c4 = await chips(page, 'Raise の額');
    expect(c4.labels.slice(0, -1)).toEqual(['×2.2 16.5', '×2.5 18.75', '×3 22.5', '×4 30']);
    await expect(d.getByRole('button', { name: /^4bet/ })).toBeVisible();
  });

  test('Flop 以降のベット: Pot の 25 / 33 / 50 / 75 / 100 / 150%（0.1bb に丸める）。最初は 33%。相手のベットへのレイズは ×2.5 / ×3 / ×4', async ({ page }) => {
    await openNew(page);
    await setPlayers(page, 6);
    const d = dock(page);
    await d.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
    await d.getByRole('button', { name: /^Open/ }).click();
    await d.getByRole('button', { name: 'Fold' }).click(); // SB
    await d.getByRole('button', { name: /^Call/ }).click(); // BB。Pot 5.5
    await pickBoard(page, ['K♥', '8♦', '3♣']);
    // BB のベット
    const bet = await chips(page, 'Bet の額');
    expect(bet.labels.slice(0, -1)).toEqual(['25% 1.4', '33% 1.8', '50% 2.8', '75% 4.1', '100% 5.5', '150% 8.3']);
    expect(bet.pressed).toBe('33% 1.8');
    await d.getByRole('button', { name: /^Bet\s*1\.8$/ }).click();
    // BTN のレイズ: 直前のベット 1.8 の ×2.5 = 4.5、×3 = 5.4、×4 = 7.2
    const raise = await chips(page, 'Raise の額');
    expect(raise.labels.slice(0, -1)).toEqual(['×2.5 4.5', '×3 5.4', '×4 7.2']);
    expect(raise.pressed).toBe('×3 5.4');
    await expect(d.getByRole('button', { name: /^Raise\s*5\.4$/ })).toBeVisible();
  });

  test('最小に満たない額・All-in を超える額は出ない（BB を 3bb のスタックにする）。All-in だけなら行ごと出さない', async ({ page }) => {
    await openNew(page);
    await setPlayers(page, 2);
    await step(page, S_ACTION);
    await page.getByRole('textbox', { name: 'BTN の Stack（bb）' }).fill('2.6');
    const c = await chips(page, 'Raise の額');
    // BTN のスタック 2.6: 2 / 2.2 / 2.5 は出て、3 は出ない（スタックを超える）。All-in は最後
    expect(c.labels[0]).toBe('2');
    expect(c.labels).not.toContain('3');
    expect(c.labels.at(-1)).toBe('All-in');
    await page.getByRole('textbox', { name: 'BTN の Stack（bb）' }).fill('1.5');
    await expect(dock(page).getByRole('group', { name: 'Raise の額' })).toHaveCount(0); // All-in だけなので行ごと出さない
  });
});

test('Check to / Fold to（Flop 以降）: 4 人の Flop は SB から。Check to は 2 手以上の席だけ。押すとまとめて Check（Fold）を入れる', async ({ page }) => {
  await openNew(page);
  await setPlayers(page, 4); // CO・BTN・SB・BB
  const d = dock(page);
  for (let i = 0; i < 3; i++) await d.getByRole('button', { name: /^(Limp|Call)/ }).click(); // CO・BTN・SB
  await d.getByRole('button', { name: 'Check' }).click(); // BB
  await pickBoard(page, ['K♥', '8♦', '3♣']);
  // Flop の最初は SB。Check to: BB→CO（SB・BB の 2 手）、BTN（3 手）
  const to = d.getByRole('group', { name: 'Check to' });
  await expect(to.getByRole('button')).toHaveText(['CO', 'BTN']);
  await to.getByRole('button', { name: 'BTN' }).click();
  await expect(page.getByRole('group', { name: 'Table' }).locator('.pseat.acting')).toContainText('BTN');
  // BTN の番: ベットする → CO・SB・BB が Fold... 次は SB の番（BTN のベットに向き合う）。Fold to
  await d.getByRole('button', { name: /^Bet\s*\d/ }).click();
  await expect(page.getByRole('group', { name: 'Table' }).locator('.pseat.acting')).toContainText('SB'); // 先に Check した SB が、BTN のベットに向き合う
  // ベットに向き合うと Fold to（BB・CO を Fold して BTN…ではなく、SB → BB → CO の順に Fold して手番が回る席）
  await expect(d.getByRole('group', { name: 'Fold to' })).toBeVisible();
});
