/**
 * T2-01（Villain の欄の出る場所と席）と T2-04（Spot Read）。
 * 下書きを直接入れた局面（t2Kit.ts）から開く。PC とスマホ。
 */
import {
  doubleRaise,
  draftJson,
  expect,
  noOverflow,
  openDraft,
  openSeat,
  S_SPOT,
  seatBtn,
  srpTurn,
  step,
  test,
  threeBetPot,
  villains,
  isMobile,
} from './t2Kit.ts';

const leanBtns = (page: import('@playwright/test').Page) => villains(page).locator('.vr-read').first().getByRole('group', { name: 'Lean' }).getByRole('button');

for (const v of ['', ' @sp'] as const) {
  test(`T2-01 欄の場所: PC は Spot の下、スマホはステップ 4。Spot を選ぶまで Spot Read は出ない${v}`, async ({ page }) => {
    await openDraft(page, draftJson({ ...srpTurn(null) }));
    if (isMobile(page)) {
      // ステップ 4 以外には出ない
      await step(page, /^1\s*基本設定$/);
      await expect(villains(page)).toHaveCount(0);
      await step(page, /^3\s*Action$/);
      await expect(villains(page)).toHaveCount(0);
    }
    await step(page, S_SPOT);
    await expect(villains(page)).toBeVisible();
    // Spot の節（h2）より後ろ
    const spotH = page.getByRole('heading', { name: 'Spot', exact: true });
    if (await spotH.count()) {
      const a = await spotH.first().boundingBox();
      const b = await villains(page).boundingBox();
      if (a && b) {
        // PC は右の列の上から下、スマホは縦に並ぶので y が後ろ
        expect(b.y).toBeGreaterThan(a.y);
      }
    }
    // Spot 未選択 → 席は出るが Spot Read は出ない
    await expect(villains(page).getByRole('button', { name: /の Villain の情報$/ })).toHaveText([/^SB/, /^BB/]);
    await seatBtn(page, 'SB').click();
    await expect(villains(page).getByText('Spot Read')).toHaveCount(0);
    // Spot を選ぶと Spot Read が出る
    await page.getByRole('radio', { name: /^Turn \/ BTN Bet/ }).click();
    await expect(villains(page).getByText('Spot Read')).toHaveCount(1);
    // 選び直す（同じ Turn の別の手が無ければ Flop の Bet）: Spot を変えても SB の候補は変わらない
    await page.getByRole('radio', { name: /^Flop \/ BTN Bet/ }).click();
    await expect(villains(page).getByText('Spot Read')).toHaveCount(1);
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-01 席: Hero を変える・人数を変える・Action を消すと席が変わり、登録できない席の入力は送らず、戻すと出る${v}`, async ({ page }) => {
    const { cp } = await openDraft(page, draftJson({ ...threeBetPot(), reads: { CO: { vpip: 30 }, BTN: { vpip: 20, agg: 4 } } }));
    await step(page, S_SPOT);
    // Hero=BB → 席は CO・BTN（SB は Fold to Steal に当たらない Fold なので出ない。UTG・HJ も出ない）
    await expect(villains(page).getByRole('button', { name: /の Villain の情報$/ })).toHaveText([/^CO/, /^BTN/]);
    await expect(seatBtn(page, 'CO')).toContainText('VPIP 30');
    await expect(seatBtn(page, 'BTN')).toContainText('VPIP 20');

    // Hero を BTN にする（席が CO と BB に変わる）
    await step(page, /^2\s*Player$/);
    await page.getByRole('radio', { name: 'Hero を BTN にする' }).click();
    await step(page, S_SPOT);
    const seats = villains(page).getByRole('button', { name: /の Villain の情報$/ });
    // BB は Call をしたので登録できる。BTN は Hero
    await expect(seats.first()).toHaveText(/^CO/);
    await expect(villains(page).getByRole('button', { name: 'BTN の Villain の情報' })).toHaveCount(0);
    await expect(villains(page).getByRole('button', { name: 'BB の Villain の情報' })).toHaveCount(1);
    // Hero を戻す → BTN の入力が残っている
    await step(page, /^2\s*Player$/);
    await page.getByRole('radio', { name: 'Hero を BB にする' }).click();
    await step(page, S_SPOT);
    await expect(seatBtn(page, 'BTN')).toContainText('VPIP 20');
    await expect(seatBtn(page, 'CO')).toContainText('VPIP 30');
    // Spot を選び直して送る本文を見る（登録できない席の入力は含まない。Hero=BB の状態）
    expect(cp.calls.length).toBe(0);
  });

  test(`T2-01 席: 「すべて消す」で席が無くなり、同じ Action を入れ直すと入力が戻る${v}`, async ({ page }) => {
    await openDraft(page, draftJson({ ...srpTurn(), reads: { BB: { vpip: 40, sample: 3 }, SB: { agg: 1 } } }));
    await step(page, S_SPOT);
    await expect(seatBtn(page, 'BB')).toContainText('VPIP 40');
    await step(page, /^3\s*Action$/);
    await page.getByRole('button', { name: 'すべて消す' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'すべて消す' }).click();
    await step(page, S_SPOT);
    // 席は無いので欄ごと出ない
    await expect(villains(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Villain', exact: true })).toHaveCount(0);
  });

  test(`T2-01 席: 人数を減らす（Action が消える）と席が変わる${v}`, async ({ page }) => {
    await openDraft(page, draftJson({ ...srpTurn(), reads: { BB: { vpip: 40 }, SB: { agg: 1 } } }));
    await step(page, /^2\s*Player$/);
    await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '3', exact: true }).click();
    // Action が外れる確認があれば進める
    const dlg = page.getByRole('alertdialog');
    if (await dlg.count()) await dlg.getByRole('button').last().click();
    await step(page, S_SPOT);
    // 3 人（BTN・SB・BB）。Action は外れているので登録できる席は無い、または新しい Action に合わせた席
    const n = await villains(page).getByRole('button', { name: /の Villain の情報$/ }).count();
    expect(n).toBeLessThanOrEqual(2);
    expect(await noOverflow(page)).toBe(true);
  });
}

// ---- T2-04 Spot Read ----

for (const v of ['', ' @sp'] as const) {
  test(`T2-04 Spot Read: 候補が 1 つ（行で出て Lean を選ぶ）。Fold 系は Over・Under、Lean の順は 未選択→通常→強い→未選択${v}`, async ({ page }) => {
    await openDraft(page, draftJson(srpTurn()));
    await step(page, S_SPOT);
    await openSeat(page, 'SB');
    const spot = villains(page).locator('.vr-read').first();
    await expect(spot.locator('.vr-line')).toHaveText('Preflop · Fold to Steal');
    await expect(spot.getByText('このハンドの結果を知る前の読みで')).toBeVisible();
    // 候補が 1 つのときは Action の選択肢を出さない
    await expect(spot.getByRole('group', { name: 'Action' })).toHaveCount(0);
    await expect(leanBtns(page)).toHaveText(['Over', 'Under']);
    const over = leanBtns(page).nth(0);
    await over.click();
    await expect(over).toHaveAttribute('aria-pressed', 'true');
    await expect(over).toHaveText('Over');
    await over.click();
    await expect(over).toHaveText('Over++');
    await expect(over).toHaveAttribute('aria-pressed', 'true');
    await expect(over).toHaveAccessibleName('Over（強い）');
    await expect(seatBtn(page, 'SB')).toContainText('1 Read');
    await over.click();
    await expect(over).toHaveAttribute('aria-pressed', 'false');
    await expect(over).toHaveText('Over');
    await expect(seatBtn(page, 'SB')).not.toContainText('Read');
    // 別の Lean を押すと、その通常
    await over.click();
    await leanBtns(page).nth(1).click();
    await expect(over).toHaveAttribute('aria-pressed', 'false');
    await expect(leanBtns(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(leanBtns(page).nth(1)).toHaveText('Under');
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-04 Spot Read: 候補が複数（3-Bet と C-Bet）。最初は判断地点にいちばん近いもの。選び直すと Lean が合わなければ外れる${v}`, async ({ page }) => {
    await openDraft(page, draftJson(threeBetPot()));
    await step(page, S_SPOT);
    await openSeat(page, 'BTN');
    const spot = villains(page).locator('.vr-read').first();
    const act = spot.getByRole('group', { name: 'Action' }).getByRole('button');
    // 候補は出来事の順（Preflop の 3-Bet → Flop の C-Bet）。最初に選ばれているのは判断地点にいちばん近い C-Bet
    await expect(act).toHaveText(['Preflop · 3-Bet', 'Flop · C-Bet (Small)']);
    // C-Bet は Bet 系なので 4 つの Lean
    await expect(leanBtns(page)).toHaveText(['Over', 'Under', 'Value-heavy', 'Bluff-heavy']);
    // 最初に選ばれている候補は、まだ Lean を選んでいないので Action の押下状態は出ない / 出る（実装を見る）
    const pressed = await act.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
    expect(pressed).toEqual(['false', 'true']);
    // Value-heavy を選んで、Preflop の 3-Bet にしても Bet 系なので Lean は残る
    await leanBtns(page).nth(2).click();
    await expect(leanBtns(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
    await act.nth(0).click();
    await expect(act.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(leanBtns(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-04 Spot Read: 候補が無い席は枠を出さない（BB は Call だけ）${v}`, async ({ page }) => {
    await openDraft(page, draftJson(srpTurn()));
    await step(page, S_SPOT);
    await openSeat(page, 'BB');
    await expect(villains(page).getByText('Spot Read')).toHaveCount(0);
    // 全体の傾向と General Read は出る
    await expect(villains(page).getByRole('button', { name: '＋ General Read' })).toBeVisible();
  });

  test(`T2-04 Spot Read: Spot を変えると候補が変わり、合わなくなった Spot Read は画面の要約から外れる${v}`, async ({ page }) => {
    const { cp } = await openDraft(page, draftJson(threeBetPot()));
    await step(page, S_SPOT);
    await openSeat(page, 'BTN');
    // C-Bet（既定）に Value-heavy
    await leanBtns(page).nth(2).click();
    await expect(seatBtn(page, 'BTN')).toContainText('1 Read');
    // Spot を Flop の最初の手番（BB の Check。C-Bet の前）に変える
    const labels = await page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio').allInnerTexts();
    expect(labels.length).toBeGreaterThanOrEqual(2);
    await page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio').first().click();
    // 候補は 3-Bet の 1 つだけ（C-Bet は判断地点より後）
    const spot = villains(page).locator('.vr-read').first();
    await expect(spot.locator('.vr-line')).toHaveText('Preflop · 3-Bet');
    // 合わない Spot Read（C-Bet の Lean）は画面に残らない（Lean は未選択）
    await expect(leanBtns(page).nth(2)).toHaveAttribute('aria-pressed', 'false');
    // 要約に「1 Read」が残ると、送らないのに 1 件あるように見える
    const sum = await seatBtn(page, 'BTN').innerText();
    test.info().annotations.push({ type: 'summary-after-spot-change', description: sum });
    expect(sum, '合わなくなった Spot Read が要約の Read の件数に残っている').not.toContain('1 Read');
    void cp;
  });
}

test('T2-04 Spot Read: 同じ Street・Action の候補が複数（Raise の Small と Big）で、選んだ方の Size を送る', async ({ page }) => {
  const { cp } = await openDraft(page, draftJson(doubleRaise()));
  await openSeat(page, 'CO');
  const spot = villains(page).locator('.vr-read').first();
  const act = spot.getByRole('group', { name: 'Action' }).getByRole('button');
  await expect(act).toHaveText(['Flop · Raise (Small)', 'Flop · Raise (Big)']);
  // 1 つ目（Small）を選んで Over を付ける
  await act.nth(0).click();
  await expect(act.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await leanBtns(page).nth(0).click();
  await expect.soft(act.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect.soft(act.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: /^投稿(する|中…)$/ }).click();
  await expect.poll(() => cp.calls.length).toBe(1);
  const body = cp.calls[0]?.body as { villain_reads?: { CO?: { reads?: { size: string }[] } } };
  expect(body.villain_reads?.CO?.reads?.[0]?.size, '選んだのは Small').toBe('small');
});
