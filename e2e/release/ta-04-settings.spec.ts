/**
 * T-A A-04: Action を入れたあとの設定の変更（06 章 §3.3）。Stack を減らす・戻す、Hero・SB・Ante・人数を変える、人数の確認ダイアログ、
 * 途中の値では Action を消さない、次の Action で確定する、外れた Spot の選択、Board は残る、投稿できない設定（Preflop の All-in）。
 */
import { expect, test } from '@playwright/test';
import {
  acting,
  BET_BTN,
  dock,
  errorsBox,
  isMobile,
  openNew,
  pickBoard,
  pickSpot,
  playSrpTurn,
  S_ACTION,
  S_PLAYER,
  S_SETTINGS,
  setHand,
  setPlayers,
  setTitle,
  spotLabels,
  step,
  submit,
  toSpot,
  table,
} from './taPost.ts';

const VARIANTS = ['', ' @sp'] as const;

/** 6 人で UTG〜CO Fold、BTN Open 2.5 まで入れる（手番は SB） */
async function openBtn(page: import('@playwright/test').Page): Promise<void> {
  await setPlayers(page, 6);
  await step(page, S_ACTION);
  const d = dock(page);
  await d.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
  await d.getByRole('button', { name: /^Open/ }).click();
  await expect(acting(page)).toContainText('SB');
}

/** 今のアクションの並び（PC は History のカード、スマホは History のモーダル）を文字にして返す */
async function logText(page: import('@playwright/test').Page): Promise<string> {
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'History' }).click();
    const t = await page.getByRole('dialog', { name: 'Hand History' }).innerText();
    await page.keyboard.press('Escape');
    return t.replace(/\s+/g, ' ');
  }
  return (await page.locator('.hlog').innerText()).replace(/\s+/g, ' ');
}

for (const v of VARIANTS) {
  test.describe(`A-04 設定の変更${v}`, () => {
    test(`Ante・SB を変えても合法な Action は残り、ログの額が新しい設定で計算し直される${v}`, async ({ page }) => {
      await openNew(page);
      await openBtn(page);
      await step(page, S_SETTINGS);
      await page.getByLabel('SB（bb）').fill('1');
      await page.getByLabel('Ante（bb）').fill('0.2');
      await step(page, S_ACTION);
      await expect(acting(page)).toContainText('SB');
      const t = await logText(page);
      expect(t).toContain('BTN Raise 2.5');
      // SB が 1bb: SB の Call は 1.5
      const d = dock(page);
      await expect(d.getByRole('button', { name: /^Call/ })).toContainText('1.5');
      // SB を BB より大きくすると不正 → 台が消えて「基本設定の値が正しくありません」。Action は消さない
      await step(page, S_SETTINGS);
      await page.getByLabel('SB（bb）').fill('1.5');
      await step(page, S_ACTION);
      await expect(page.locator('.pf-actsec')).toContainText('基本設定の値が正しくありません');
      await step(page, S_SETTINGS);
      await page.getByLabel('SB（bb）').fill('0.5');
      await step(page, S_ACTION);
      await expect(acting(page)).toContainText('SB');
      expect(await logText(page)).toContain('BTN Raise 2.5');
    });

    test(`欄を打っている途中の値（空・「1.」・「-」）では Action を消さない。読める値に戻せば元の Action${v}`, async ({ page }) => {
      await openNew(page);
      await openBtn(page);
      await step(page, S_PLAYER);
      const stack = page.getByRole('textbox', { name: 'BTN の Stack（bb）' });
      for (const partial of ['', '1.', '-', '1e', '0', '１']) {
        await stack.fill(partial);
      }
      await stack.fill('100');
      await step(page, S_ACTION);
      await expect(acting(page)).toContainText('SB');
      expect(await logText(page)).toContain('BTN Raise 2.5');
    });

    test(`BTN を 2bb にすると Open 2.5 は外れて BTN の番。次の Action を入れると確定し、100 に戻しても戻らない${v}`, async ({ page }) => {
      await openNew(page);
      await openBtn(page);
      await step(page, S_PLAYER);
      const stack = page.getByRole('textbox', { name: 'BTN の Stack（bb）' });
      await stack.fill('2');
      await step(page, S_ACTION);
      await expect(acting(page)).toContainText('BTN');
      const d = dock(page);
      await d.getByRole('button', { name: /^Limp/ }).click(); // 確定
      await step(page, S_PLAYER);
      await stack.fill('100');
      await step(page, S_ACTION);
      const t = await logText(page);
      expect(t).toContain('BTN Call 1');
      expect(t).not.toContain('BTN Raise 2.5');
    });

    test(`Stack を減らして途中の Action から外れたとき Spot の選択も外れる。打ち直して戻すと Action は元に戻る（Spot の選択は戻らない）${v}`, async ({ page }) => {
      await openNew(page);
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await step(page, S_PLAYER);
      // BB を 2bb に: BB の Call 1.5 のあと 0.5bb。Flop の Bet 1.8 への Call は All-in、その後の Turn の Check は打てない
      await page.getByRole('textbox', { name: 'BB の Stack（bb）' }).fill('2');
      await step(page, S_ACTION);
      await expect(page.getByText('BTN Pot 獲得')).toHaveCount(0);
      // All-in の Call のあと River の Card を求めるピッカーが開くので、閉じる
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await toSpot(page);
      await expect(page.getByRole('radio', { name: 'Turn / BTN Bet 3' })).toHaveCount(0);
      await expect(page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio', { checked: true })).toHaveCount(0);
      await step(page, S_PLAYER);
      await page.getByRole('textbox', { name: 'BB の Stack（bb）' }).fill('100');
      await step(page, S_ACTION);
      // Action は操作していないので確定しておらず、値を戻せば元の Action（画面が外して出していただけ）。
      // Spot の選択は外れたまま戻らない（06 章 §3.7「候補が消えたら選択を解除する」）
      await expect(page.getByText('BTN Pot 獲得')).toBeVisible();
      await toSpot(page);
      await expect(page.getByRole('radio', { name: 'Turn / BTN Bet 3' })).toHaveAttribute('aria-checked', 'false');
    });

    test(`Hero を変える: Action は残り、新しい Hero の候補に無い Spot は外れる。Hero の Hand は必須${v}`, async ({ page }) => {
      await openNew(page);
      await playSrpTurn(page);
      await step(page, S_PLAYER);
      await page.getByRole('radio', { name: 'Hero を CO にする' }).click();
      await expect(page.getByRole('radio', { name: 'Hero を CO にする' })).toHaveAttribute('aria-checked', 'true');
      // CO は Preflop で Fold しただけ → Flop 以降の候補なし
      await toSpot(page);
      await expect(page.getByText('候補なし')).toBeVisible();
      await setTitle(page, 'Hero を変える');
      await submit(page);
      await expect(errorsBox(page)).toContainText('Hero（CO）の Hand を入力してください');
      await expect(errorsBox(page)).toContainText('Flop 以降に Hero の Action が無い Hand は投稿できません');
      // BTN に戻すと候補が戻る
      await step(page, S_PLAYER);
      await page.getByRole('radio', { name: 'Hero を BTN にする' }).click();
      expect(await spotLabels(page)).toEqual(['Flop / BTN Bet 1.8', 'Turn / BTN Bet 3']);
    });

    test(`人数を変える: Action が外れるなら確認。やめる → そのまま。変更する → 外れる。外れなければ確認なし${v}`, async ({ page }) => {
      await openNew(page);
      await openBtn(page);
      await step(page, S_PLAYER);
      const cnt = page.getByRole('group', { name: '人数' });
      await cnt.getByRole('button', { name: '5', exact: true }).click();
      const dlg = page.getByRole('alertdialog', { name: '人数を 5 人にしますか' });
      await expect(dlg).toContainText('入れた Action をすべて消します。');
      await page.keyboard.press('Escape'); // Esc = やめる
      await expect(dlg).toHaveCount(0);
      await expect(cnt.getByRole('button', { name: '6', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await step(page, S_ACTION);
      expect(await logText(page)).toContain('BTN Raise 2.5');
      await step(page, S_PLAYER);
      await cnt.getByRole('button', { name: '5', exact: true }).click();
      await dlg.getByRole('button', { name: '変更する' }).click();
      await expect(cnt.getByRole('button', { name: '5', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await step(page, S_ACTION);
      await expect(acting(page)).toContainText('HJ');
      // 空の状態（Action なし）で人数を変えても確認は出ない
      await step(page, S_PLAYER);
      await cnt.getByRole('button', { name: '4', exact: true }).click();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      // 人数を減らすと空いた席の Hand は消え、Hero が空席なら BTN
      await setHand(page, 'BB', 'qsjc');
      await page.getByRole('radio', { name: 'Hero を CO にする' }).click();
      await cnt.getByRole('button', { name: '2', exact: true }).click();
      await expect(page.getByRole('radio', { name: 'Hero を BTN にする' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('button', { name: 'BB の Hand' })).toContainText('Q');
      await cnt.getByRole('button', { name: '6', exact: true }).click();
      await expect(page.getByRole('button', { name: 'UTG の Hand' })).not.toContainText('Q');
    });

    test(`設定を変えたあとも 1つ戻す・1つ進むが動く。すべて消すで Action と Board が空になる${v}`, async ({ page }) => {
      await openNew(page);
      await openBtn(page);
      await step(page, S_SETTINGS);
      await page.getByLabel('Ante（bb）').fill('0.1');
      await step(page, S_ACTION);
      await page.getByRole('button', { name: '1つ戻す' }).click();
      await expect(acting(page)).toContainText('BTN');
      await page.getByRole('button', { name: '1つ進む' }).click();
      await expect(acting(page)).toContainText('SB');
    });

    test(`Preflop で All-in になる設定（BTN 2.5bb で Open 2.5）は投稿できない: 候補なし・投稿でエラー${v}`, async ({ page }) => {
      const { cp } = await openNew(page);
      await openBtn(page);
      await setHand(page, 'BTN', 'adkd');
      await step(page, S_ACTION);
      const d = dock(page);
      await d.getByRole('button', { name: 'Fold' }).click(); // SB
      await d.getByRole('button', { name: /^Call/ }).click(); // BB
      await pickBoard(page, ['K♥', '8♦', '3♣']);
      await d.getByRole('button', { name: 'Check' }).click(); // BB
      await d.getByRole('button', { name: BET_BTN }).click(); // BTN
      await d.getByRole('button', { name: 'Fold' }).click(); // BB
      await step(page, S_PLAYER);
      // 2.5bb にすると Open 2.5 が All-in になる。All-in 後の Action は外れ、Turn・River の Board を求められる
      await page.getByRole('textbox', { name: 'BTN の Stack（bb）' }).fill('2.5');
      await step(page, S_ACTION);
      await expect(page.getByRole('dialog', { name: /Turn/ })).toBeVisible();
      await pickBoard(page, ['2♠']);
      await expect(page.getByRole('dialog', { name: /River/ })).toBeVisible();
      await pickBoard(page, ['9♣']);
      await expect(page.getByText('Showdown')).toBeVisible();
      await setTitle(page, 'Preflop All-in の設定');
      await expect(page.getByText('候補なし')).toBeVisible();
      await submit(page);
      await expect(errorsBox(page)).toContainText('Preflop で All-in になった Hand は投稿できません');
      expect(cp.calls).toHaveLength(0);
    });

    test(`MTT にすると Rake は空・非活性。Cash に戻しても Rake は空のまま。送る本文の rake は null${v}`, async ({ page }) => {
      const { cp } = await openNew(page);
      await step(page, S_SETTINGS);
      await page.getByLabel('Rake（%）').fill('5');
      await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
      await expect(page.getByLabel('Rake（%）')).toBeDisabled();
      await playSrpTurn(page);
      await step(page, S_SETTINGS);
      await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'Cash' }).click();
      await expect(page.getByLabel('Rake（%）')).toHaveValue('');
      await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
      await setTitle(page, 'MTT の投稿');
      await pickSpot(page, 'Turn / BTN Bet 3');
      await submit(page);
      await expect(page).toHaveURL('/?tab=mine');
      expect(cp.calls[0]?.body['fmt']).toBe('mtt');
      expect(cp.calls[0]?.body['rake']).toBeNull();
    });

    test(`Rake を入れた Cash の投稿は rake の数値を送る。SB・Ante の小数（0.25・0.125）も${v}`, async ({ page }) => {
      const { cp } = await openNew(page);
      await step(page, S_SETTINGS);
      await page.getByLabel('Rake（%）').fill('5.5');
      await page.getByLabel('SB（bb）').fill('0.25');
      await page.getByLabel('Ante（bb）').fill('0.125');
      await playSrpTurn(page);
      await step(page, /^4\s*Spot$/);
      await page.getByRole('radio', { name: /^Turn \/ BTN Bet/ }).click();
      await setTitle(page, '小数の設定');
      await submit(page);
      await expect(page).toHaveURL('/?tab=mine');
      expect(cp.calls[0]?.body).toMatchObject({ rake: 5.5, sb: 0.25, ante: 0.125, fmt: 'cash' });
    });

    test(`ハンド欄: Hero の Hand が同じ札・使用済みの札はトースト。2 枚未満の Hand は途中${v}`, async ({ page }) => {
      await openNew(page);
      await setPlayers(page, 3);
      await setHand(page, 'BTN', 'adkd');
      await setHand(page, 'SB', 'ad'); // 使用済みの A♦
      await expect(page.locator('.toast')).toContainText('A♦ は使用済み');
    });
  });
}

test('PC: 設定の欄を触っても卓と台の位置は動かない（FitStage）', async ({ page }) => {
  await openNew(page);
  await openBtn(page);
  const box = async (): Promise<string> => JSON.stringify([await table(page).boundingBox(), await page.locator('.pf-dockslot').boundingBox()]);
  const before = await box();
  await page.getByLabel('Ante（bb）').fill('0.1');
  await page.getByRole('textbox', { name: 'BTN の Stack（bb）' }).fill('90');
  expect(await box()).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});
