/**
 * スポット投稿のハンド入力の E2E（詳細仕様 06 章 §3.4〜3.6、13 章。2026-09-29）。
 * スマホで、人数の選択・カードキーボードの前後の席・アクションの台（Fold to・よく使う額・3 つのボタン）を通す。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend } from './fakeBackend.ts';

async function openPlayers(page: Page): Promise<void> {
  await fakeBackend(page, null);
  await page.goto('/new');
  await page.getByRole('button', { name: /^2\s*Player$/ }).click();
}

test('人数を選ぶまで席の表を出さず、選ぶと早い席から空く @sp', async ({ page }) => {
  await openPlayers(page);
  const table = page.getByRole('table', { name: 'Player と Hand' });
  await expect(table).toHaveCount(0);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '3' }).click();
  await expect(table.getByRole('row')).toHaveCount(4); // 見出し＋3 席
  await expect(table.getByRole('button', { name: 'BTN の Hand' })).toBeVisible();
  await expect(table.getByRole('button', { name: 'UTG の Hand' })).toHaveCount(0);
});

test('Card キーボードの ← → は座っている席を巡る @sp', async ({ page }) => {
  await openPlayers(page);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6' }).click();
  await page.getByRole('button', { name: 'UTG の Hand' }).click();
  const kb = page.getByRole('group', { name: 'Card キーボード' });
  await expect(kb.getByText('UTG', { exact: true })).toBeVisible();
  await kb.getByRole('button', { name: '前の席' }).click();
  await expect(kb.getByText('BB', { exact: true })).toBeVisible();
  await kb.getByRole('button', { name: '次の席' }).click();
  await kb.getByRole('button', { name: '次の席' }).click();
  await expect(kb.getByText('HJ', { exact: true })).toBeVisible();
});

test('Action の台: Fold to・Open の額・% pot でシングルレイズドポットを入れる @sp', async ({ page }) => {
  await openPlayers(page);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6' }).click();
  // Hero（BTN）のハンド A♦K♦（パソコンのキーで入れる）
  await page.getByRole('button', { name: 'BTN の Hand' }).click();
  for (const k of ['a', 'd', 'k', 'd']) await page.keyboard.press(k);
  await page.getByRole('button', { name: '完了' }).click();
  await page.getByRole('button', { name: /^3\s*Action$/ }).click();

  const dock = page.getByRole('group', { name: 'Action' });
  await expect(dock).toContainText('UTG');
  // UTG〜CO を 1 回でフォールド → BTN の番。オープンは 2.5 が選ばれている
  await dock.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
  await expect(dock).toContainText('BTN');
  // ボタンはプレイヤーが呼ぶ名前（オープン / リンプ）
  await expect(dock.getByRole('button', { name: /^Open\s*2\.5$/ })).toBeVisible();
  await expect(dock.getByRole('button', { name: /^Limp\s*1$/ })).toBeVisible();
  await dock.getByRole('button', { name: /^Open/ }).click();
  await dock.getByRole('button', { name: 'Fold' }).click();
  await dock.getByRole('button', { name: /^Call/ }).click();

  // フロップはカードピッカーが自動で開く
  for (const c of ['K♥', '8♦', '3♣']) await page.getByRole('gridcell', { name: c }).click();
  await dock.getByRole('button', { name: 'Check' }).click();
  // BTN のベットは 33% が選ばれている。75% に変えて打つ
  await expect(dock.getByRole('button', { name: /^Bet\s*1\.8$/ })).toBeVisible();
  await dock.getByRole('group', { name: 'Bet の額' }).getByRole('button', { name: /^75%/ }).click();
  await dock.getByRole('button', { name: /^Bet\s*4\.1$/ }).click();
  await dock.getByRole('button', { name: 'Fold' }).click();

  await expect(page.getByText('BTN Pot 獲得')).toBeVisible();
  // スマホのログはモーダル（14 章 §3.1）
  await expect(page.locator('.hlog')).toHaveCount(0);
  await page.getByRole('button', { name: 'History' }).click();
  const log = page.getByRole('dialog', { name: 'Hand History' });
  await expect(log).toContainText('UTG Fold');
  await expect(log).toContainText('BTN Raise 2.5');
  await expect(log).toContainText('BTN Bet 4.1');
  await page.keyboard.press('Escape');
  // 終わったら台を閉じ、下に「次へ：スポット」
  await expect(dock).toHaveCount(0);
  await expect(page.getByRole('button', { name: '次へ：Spot' })).toBeVisible();
});

test('入力中の卓（Hero を手前・手番・Bet）と、ログの 1 手からの入れ直し @sp', async ({ page }) => {
  await openPlayers(page);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6' }).click();
  await page.getByRole('button', { name: /^3\s*Action$/ }).click();

  const table = page.getByRole('group', { name: 'Table' });
  const dock = page.getByRole('group', { name: 'Action' });
  await expect(table.locator('.pseat.hero')).toContainText('BTN');
  await expect(table.locator('.pseat.acting')).toContainText('UTG');
  await dock.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
  await dock.getByRole('button', { name: /^Open/ }).click();
  // ブラインドとオープンがチップで出て、手番は SB
  await expect(table.locator('.pchip')).toHaveText(['2.5', '0.5', '1']);
  await expect(table.locator('.pseat.acting')).toContainText('SB');

  // ヒストリーの「HJ フォールド」から入れ直す → UTG のフォールドだけ残り、HJ の番
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('dialog', { name: 'Hand History' }).getByRole('button', { name: 'HJ Fold' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('HJ Fold から入れ直しますか');
  await page.getByRole('button', { name: '入れ直す' }).click();
  await expect(table.locator('.pseat.acting')).toContainText('HJ');

  // 1つ進む: 取り消した HJ・CO のフォールド、BTN のオープンを順に入れ直す
  const redo = dock.getByRole('button', { name: '1つ進む' });
  for (let i = 0; i < 3; i++) await redo.click();
  await expect(table.locator('.pseat.acting')).toContainText('SB');
  await expect(redo).toBeDisabled();
  // 1つ戻す → 1つ進むで同じ所へ。違うアクションを入れたら進めない
  await dock.getByRole('button', { name: '1つ戻す' }).click();
  await expect(redo).toBeEnabled();
  await dock.getByRole('button', { name: 'Fold' }).click();
  await expect(table.locator('.pseat.acting')).toContainText('SB');
  await expect(redo).toBeDisabled();

  // すべて消すは確かめてから
  await dock.getByRole('button', { name: 'すべて消す' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'やめる' }).click();
  await expect(table.locator('.pseat.acting')).toContainText('SB');
  await dock.getByRole('button', { name: 'すべて消す' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'すべて消す' }).click();
  await expect(table.locator('.pseat.acting')).toContainText('UTG');
});

test('額は縦のスライダーで選ぶ（キーボードを出さない） @sp', async ({ page }) => {
  await openPlayers(page);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6' }).click();
  await page.getByRole('button', { name: /^3\s*Action$/ }).click();
  const dock = page.getByRole('group', { name: 'Action' });
  await expect(dock.locator('input')).toHaveCount(0);
  await dock.getByRole('button', { name: 'Raise の額（to。bb）' }).click();
  const slider = page.getByRole('slider', { name: 'Raise の額（to。bb）' });
  await expect(slider).toHaveAttribute('aria-valuenow', '2.5');
  // ▲ で 0.1bb、End で最大、上端をなぞると最大
  await page.getByRole('button', { name: '0.1bb 上げる' }).click();
  await expect(dock.getByRole('button', { name: /^Open\s*2\.6$/ })).toBeVisible();
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(dock.getByRole('button', { name: /^Open\s*2$/ })).toBeVisible();
  const track = await page.locator('.sl-track').boundingBox();
  if (!track) throw new Error('溝が見えない');
  await page.mouse.click(track.x + track.width / 2, track.y + 1);
  await expect(dock.getByRole('button', { name: /^Open\s*100/ })).toBeVisible();
  // Esc（または外を押す）で閉じる
  await page.keyboard.press('Escape');
  await expect(slider).toHaveCount(0);
});

test('PC の Hand は Card の選択ボードで選び、2 枚そろうと次の空の席へ進む（17 章）', async ({ page }) => {
  await fakeBackend(page, null);
  await page.goto('/new');
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6' }).click();
  await page.getByRole('button', { name: 'BTN の Hand' }).click();
  // スマホ用の Card キーボードではなく、選択ボード（ダイアログ）が開く
  await expect(page.getByRole('group', { name: 'Card キーボード' })).toHaveCount(0);
  const board = page.getByRole('dialog', { name: 'BTN の Hand' });
  await board.getByRole('gridcell', { name: 'A♠' }).click();
  // 選んだ Card は押すと外れる
  await board.getByRole('gridcell', { name: 'A♠' }).click();
  await expect(board.getByRole('gridcell', { name: 'A♠' })).toHaveAttribute('aria-selected', 'false');
  await board.getByRole('gridcell', { name: 'A♠' }).click();
  await board.getByRole('gridcell', { name: 'K♦' }).click();
  // 次の空の席（SB）へ進み、使った Card は押せない
  const sb = page.getByRole('dialog', { name: 'SB の Hand' });
  await expect(sb).toBeVisible();
  await expect(sb.getByRole('gridcell', { name: 'A♠' })).toBeDisabled();
  // キーでも打てる。Enter で閉じる
  for (const k of ['q', 'h', 'q', 'd']) await page.keyboard.press(k);
  await expect(page.getByRole('dialog', { name: 'BB の Hand' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'BTN の Hand' })).toContainText('A');
  await expect(page.getByRole('button', { name: 'SB の Hand' })).toContainText('Q');
});
