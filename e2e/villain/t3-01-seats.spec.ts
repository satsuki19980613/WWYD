/**
 * T3-01〜T3-04: 席のモーダル・All Villains・MTT のモーダル・ボタンの行と席の印（回答画面・集計画面。PC とスマホ）。
 * 18 章 §2.1.6・§5.2・§10 C-2・C-7。
 */
import { expect, test, type Page } from '@playwright/test';
import { hmw } from '../../packages/core/src/post/postFixtures.ts';
import { baseHs1bb, checkRaiseHand, detail, headsUp, isSp, noHScroll, openAnswer, openResult, overlaps, threeHanded, toHandHistoryTab } from './t3-kit.ts';
import { watchErrors } from '../release/taKit.ts';

const spot = (over: Record<string, unknown>) => ({ scope: 'spot', texture: null, runout: null, size: null, strong: false, ...over });
const general = (over: Record<string, unknown>) => ({ scope: 'general', texture: null, runout: null, size: null, strong: false, ...over });

const seatBtn = (page: Page, p: string) => page.getByRole('button', { name: `${p} の Villain の情報` });
const dlg = (page: Page, name: string) => page.getByRole('dialog', { name });

for (const v of ['', ' @sp'] as const) {
  test(`T3-01 席のモーダル: チップは VPIP・PFR が数、Aggression・Hero Image は中央を出さず、Sample は中央も出す${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await openAnswer(page, {
      ...baseHs1bb(),
      villain_reads: {
        UTG: { vpip: 0, pfr: 0 }, // 0 も出す
        HJ: { agg: 2, image: 2 }, // 中央だけ → 印なし
        CO: { sample: 2 }, // Sample は中央も出す
        BTN: { agg: 0, image: 4, sample: 0 },
        SB: { agg: 3, image: 1 },
      },
    });
    await expect(page.locator('.pseat-read')).toHaveCount(4); // HJ の中央だけの席には付けない
    await expect(seatBtn(page, 'HJ')).toHaveCount(0);
    await seatBtn(page, 'UTG').click();
    await expect(dlg(page, 'Villain · UTG').locator('.rv-chip')).toHaveText(['VPIP 0', 'PFR 0']);
    await page.keyboard.press('Escape');
    await seatBtn(page, 'CO').click();
    await expect(dlg(page, 'Villain · CO').locator('.rv-chip')).toHaveText(['Sample: Some History']);
    await page.keyboard.press('Escape');
    await seatBtn(page, 'BTN').click();
    await expect(dlg(page, 'Villain · BTN').locator('.rv-chip')).toHaveText(['Very Passive', 'Hero Image: Very Loose', 'Sample: First Impression']);
    await page.keyboard.press('Escape');
    await seatBtn(page, 'SB').click();
    await expect(dlg(page, 'Villain · SB').locator('.rv-chip')).toHaveText(['Aggressive', 'Hero Image: Tight']);
    // Read が無ければ Read の一覧の要素を出さない
    await expect(dlg(page, 'Villain · SB').locator('.rv-reads')).toHaveCount(0);
    expect(await noHScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`T3-01 Read の行: Spot Read が先、条件の順、Size、++ と読み上げ、Check-Raise の表示${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    // Hero = BTN。BB が Check → Raise（Check-Raise）。BB の Spot Read は Raise なので Check-Raise と表示する
    await openAnswer(page, {
      ...checkRaiseHand(),
      villain_reads: {
        BB: {
          reads: [
            general({ street: 'turn', action: 'barrel', texture: { connect: 'none', high: 'k', paired: 'paired', suit: 'mono' }, runout: ['pair', 'over', 'flush'], size: 'overbet', lean: 'bluff', strong: true }),
            spot({ street: 'flop', action: 'raise', size: 'big', lean: 'value', strong: true }),
            general({ street: 'river', action: 'raise', lean: 'under', strong: false }),
          ],
        },
        // SB は Preflop Fold のみ（Fold to Steal の Spot Read）
        SB: { reads: [spot({ street: 'pf', action: 'fold_steal', lean: 'over', strong: false })] },
        CO: { reads: [general({ street: 'flop', action: 'cbet', size: 'small', lean: 'over', strong: false })] },
      },
    });
    await seatBtn(page, 'BB').click();
    const m = dlg(page, 'Villain · BB');
    // Spot Read が先（保存の順に関わらず）。条件は High Card → Suit → Pairing → Connectivity → Runout（定義の順）→ Action（Size）
    await expect(m.locator('.rv-read')).toHaveText([
      'Flop · Check-Raise (Big) → Value-heavy++',
      'Turn · K-high · Monotone · Paired · No straight · Overcard · Flush Complete · Board Pair · Barrel (Overbet) → Bluff-heavy++',
      // General Read の Raise も、BB は Hero（BTN）より先に動くので Check-Raise
      'River · Check-Raise → Under',
    ]);
    await expect(m.locator('.rv-read').nth(0)).toHaveAccessibleName('Flop · Check-Raise (Big) → Value-heavy（強い）');
    await expect(m.locator('.rv-read').nth(2)).toHaveAccessibleName('River · Check-Raise → Under');
    // 強いだけに背景の class
    await expect(m.locator('.rv-read.strong')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await seatBtn(page, 'SB').click();
    await expect(dlg(page, 'Villain · SB').locator('.rv-read')).toHaveText(['Preflop · Fold to Steal → Over']);
    await page.keyboard.press('Escape');
    // CO は Hero（BTN）より先に動く席だが Raise の Read ではない
    await seatBtn(page, 'CO').click();
    await expect(dlg(page, 'Villain · CO').locator('.rv-read')).toHaveText(['Flop · C-Bet (Small) → Over']);
    expect(await noHScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`T3-01 Check-Raise にならない Raise（Spot Read で先に Check していない・Hero より後に動く席の General Read）${v}`, async ({ page }) => {
    // Hero = BB。BTN は Hero より後に動くので、General Read の Raise は Raise。Spot Read の Raise も（BTN は Check していない）Raise
    await openAnswer(page, {
      ...baseHs1bb(),
      villain_reads: {
        BTN: {
          reads: [
            spot({ street: 'flop', action: 'raise', lean: 'over', strong: false }),
            general({ street: 'turn', action: 'raise', lean: 'under', strong: false }),
          ],
        },
      },
    });
    await seatBtn(page, 'BTN').click();
    await expect(dlg(page, 'Villain · BTN').locator('.rv-read')).toHaveText(['Flop · Raise → Over', 'Turn · Raise → Under']);
  });

  test(`T3-02 All Villains: 参加した席が上（座席の順）、Preflop Fold は折りたたみと件数、情報の無い席は —${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    // H-MW（Hero = CO）: UTG・HJ・SB が Preflop Fold、BTN・BB が参加
    await openAnswer(page, {
      ...hmw(),
      villain_reads: {
        UTG: { vpip: 10 },
        SB: { pfr: 4, reads: [spot({ street: 'pf', action: 'fold_steal', lean: 'under', strong: false })] },
        BB: { agg: 1 },
      },
    });
    await page.getByRole('button', { name: 'All Villains' }).click();
    const all = dlg(page, 'All Villains');
    await expect(all.locator('.rv-all > .rv-seats > .rv-seat .rv-pos')).toHaveText(['BTN', 'BB']);
    const active = all.locator('.rv-all > .rv-seats > .rv-seat');
    await expect(active.nth(0)).toContainText('—'); // BTN は情報なし
    await expect(active.nth(0)).toHaveClass(/none/);
    await expect(active.nth(1)).toContainText('Passive');
    const folded = all.locator('details.rv-folded');
    await expect(folded.locator('summary')).toContainText('Preflop Fold');
    await expect(folded.locator('.rv-fcount')).toHaveText('3');
    await expect(folded).not.toHaveAttribute('open', '');
    // 閉じている間は中身が見えない
    await expect(folded.locator('.rv-seat').first()).toBeHidden();
    await folded.locator('summary').click();
    await expect(folded.locator('.rv-pos')).toHaveText(['UTG', 'HJ', 'SB']);
    await expect(folded.locator('.rv-seat').nth(0)).toContainText('VPIP 10');
    await expect(folded.locator('.rv-seat').nth(1)).toContainText('—'); // HJ
    await expect(folded.locator('.rv-seat').nth(2)).toContainText('Fold to Steal');
    // もう一度押すと閉じる
    await folded.locator('summary').click();
    await expect(folded).not.toHaveAttribute('open', '');
    // Hero（CO）は一覧に出ない
    await expect(all.locator('.rv-pos', { hasText: /^CO$/ })).toHaveCount(0);
    expect(await noHScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`T3-02 All Villains: 集計画面でも同じ並び${v}`, async ({ page }) => {
    await openResult(page, { ...hmw(), villain_reads: { UTG: { vpip: 10 }, BB: { agg: 1 } } });
    await toHandHistoryTab(page);
    await page.getByRole('button', { name: 'All Villains' }).click();
    const all = dlg(page, 'All Villains');
    await expect(all.locator('.rv-all > .rv-seats > .rv-seat .rv-pos')).toHaveText(['BTN', 'BB']);
    await expect(all.locator('details.rv-folded .rv-pos')).toHaveText(['UTG', 'HJ', 'SB']);
  });

  test(`V-038 スマホの集計画面は最初のタブ（集計）からも All Villains を開ける。情報の無い投稿はボタンを出さない${v}`, async ({ page }) => {
    test.skip(!isSp(page), 'スマホの集計画面のタブの話');
    await openResult(page, { ...hmw(), villain_reads: { UTG: { vpip: 10 }, BB: { agg: 1 } } });
    await expect(page.getByRole('tab', { name: '集計' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'All Villains' }).click();
    await expect(dlg(page, 'All Villains').locator('.rv-all > .rv-seats > .rv-seat .rv-pos')).toHaveText(['BTN', 'BB']);
    await page.keyboard.press('Escape');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openResult(page, hmw());
    await expect(page.getByRole('tab', { name: '全体' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All Villains' })).toHaveCount(0);
  });

  test(`T3-02 All Villains: Preflop Fold が 1 席もなければ折りたたみを出さない（3 人・ヘッズアップ）${v}`, async ({ page }) => {
    await openAnswer(page, { ...threeHanded(), villain_reads: { BTN: { vpip: 40 }, SB: { pfr: 10 } } });
    await page.getByRole('button', { name: 'All Villains' }).click();
    const all = dlg(page, 'All Villains');
    await expect(all.locator('.rv-all > .rv-seats > .rv-seat .rv-pos')).toHaveText(['BTN', 'SB']);
    await expect(all.locator('details.rv-folded')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openAnswer(page, { ...headsUp(), villain_reads: { BTN: { image: 0 } } });
    await page.getByRole('button', { name: 'All Villains' }).click();
    await expect(dlg(page, 'All Villains').locator('.rv-pos')).toHaveText(['BTN']);
    await expect(dlg(page, 'All Villains').locator('details.rv-folded')).toHaveCount(0);
  });
}

// ---- T3-03 MTT のモーダル ----

async function openMtt(page: Page, mtt: Record<string, unknown>, fmt = 'mtt') {
  const be = await openAnswer(page, { ...baseHs1bb(), fmt, rake: null, mtt });
  await page.getByRole('button', { name: 'MTT', exact: true }).click();
  return { be, m: dlg(page, 'MTT') };
}

for (const v of ['', ' @sp'] as const) {
  test(`T3-03 MTT: Tournament Type は動かせない Slider そのもの。つまみの位置（0・50・100）と Deep・Turbo${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    for (const s of [0, 50, 100]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const { m } = await openMtt(page, { speed: s });
      await expect(m.locator('.rv-slider .rs-ends span')).toHaveText(['Deep', 'Turbo']);
      expect(await m.locator('.rs-thumb').evaluate((el) => (el as HTMLElement).style.left)).toBe(`${s}%`);
      expect(await m.locator('.rs-fill').evaluate((el) => (el as HTMLElement).style.width)).toBe(`${s}%`);
      await expect(m.locator('.rv-slider')).toHaveAttribute('role', 'img');
      await expect(m.locator('.rv-slider')).toHaveAttribute('aria-label', `Tournament Type ${s} / 100（Deep 0 〜 Turbo 100）`);
      // 動かせない: 操作できる要素が無い
      await expect(m.getByRole('slider')).toHaveCount(0);
      const before = await m.locator('.rs-thumb').boundingBox();
      await m.locator('.rs-rail').click({ position: { x: 5, y: 3 }, force: true });
      await page.keyboard.press('ArrowRight');
      const after = await m.locator('.rs-thumb').boundingBox();
      expect(after).toEqual(before);
      // 数の見出し・Avg Stack などの行は無い（speed だけ）
      await expect(m.locator('.rv-row')).toHaveCount(1);
      await expect(m).not.toContainText('順位 / 残りの人数');
      await page.keyboard.press('Escape');
    }
    expect(errors).toEqual([]);
  });

  test(`T3-03 MTT: 人数の 1 行の組み合わせ・Avg Stack・Prize Structure と目安。無い項目は出さない${v}`, async ({ page }) => {
    const cases: [Record<string, unknown>, string | null][] = [
      [{ rank: 12 }, '#12'],
      [{ left: 58 }, '58 left'],
      [{ rank: 12, left: 58 }, '12/58'],
      [{ paid: 50 }, 'ITM 50'],
      [{ entries: 320 }, '320 entries'],
      [{ rank: 3, paid: 10 }, '#3 ・ ITM 10'],
      [{ left: 58, entries: 320 }, '58 left ・ 320 entries'],
      [{ rank: 1, left: 1, paid: 1, entries: 1 }, '1/1 ・ ITM 1 ・ 1 entries'],
      [{ rank: 12, left: 58, paid: 50, entries: 1000000 }, '12/58 ・ ITM 50 ・ 1000000 entries'],
    ];
    for (const [mtt, line] of cases) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const { m } = await openMtt(page, mtt);
      await expect(m.locator('.rv-row')).toHaveCount(1);
      await expect(m.locator('.rv-row dt')).toHaveText('順位 / 残りの人数');
      await expect(m.locator('.rv-row dd .num')).toHaveText(line as string);
      // ツールチップに項目名
      await expect(m.locator('.rv-row dd .num')).toHaveAttribute('title', 'スポットの順位 / 残りの人数 ・ ITM ・ エントリー数');
      await page.keyboard.press('Escape');
    }
    // Avg Stack だけ・Prize Structure だけ（Slider も数の行も出さない）
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    let r = await openMtt(page, { avg: 0.5 });
    await expect(r.m.locator('.rv-row dt')).toHaveText(['Avg Stack']);
    await expect(r.m.locator('.rv-row dd')).toHaveText('0.5bb');
    await expect(r.m.locator('.rv-slider')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    r = await openMtt(page, { avg: 99999 });
    await expect(r.m.locator('.rv-row dd')).toHaveText('99999bb');
    await page.keyboard.press('Escape');
    for (const [p, label, hint] of [['top', 'Top-heavy', '1st ≥ 25%'], ['standard', 'Standard', '1st 15–25%'], ['flat', 'Flat', '1st < 15%']] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      r = await openMtt(page, { prize: p });
      await expect(r.m.locator('.rv-row dt')).toHaveText(['Prize Structure']);
      await expect(r.m.locator('.rv-row dd')).toContainText(label);
      await expect(r.m.locator('.rv-row dd .rv-hint')).toHaveText(hint);
      await page.keyboard.press('Escape');
    }
    // 全項目: 並びは Tournament Type → 順位 / 残りの人数 → Avg Stack → Prize Structure
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    r = await openMtt(page, { speed: 20, rank: 5, left: 9, paid: 6, entries: 40, avg: 12.5, prize: 'flat' });
    await expect(r.m.locator('.rv-row dt')).toHaveText(['Tournament Type', '順位 / 残りの人数', 'Avg Stack', 'Prize Structure']);
    expect(await noHScroll(page)).toBe(true);
  });

  test(`T3-03 MTT: 中身の無い mtt（null・{}）では MTT ボタンが押せない。Cash の投稿でも mtt があれば見られる（互換）${v}`, async ({ page }) => {
    for (const mtt of [null, {}]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await openAnswer(page, { ...baseHs1bb(), mtt });
      await expect(page.getByRole('button', { name: 'MTT', exact: true })).toBeDisabled();
    }
  });
}

// ---- T3-04 ボタンの行と印 ----

for (const v of ['', ' @sp'] as const) {
  test(`T3-04 ボタンの状態（Reads だけ・MTT だけ・どちらも無い）と、席の ◆ を押すとその席。キーボードで押せる${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    const allBtn = page.getByRole('button', { name: 'All Villains' });
    const mttBtn = page.getByRole('button', { name: 'MTT', exact: true });
    // Reads だけ
    await openAnswer(page, { ...baseHs1bb(), villain_reads: { BTN: { vpip: 20 } } });
    await expect(allBtn).toBeEnabled();
    await expect(mttBtn).toBeDisabled();
    // キーボード: フォーカスして Enter、Esc で閉じるとフォーカスが戻る
    await allBtn.focus();
    await page.keyboard.press('Enter');
    await expect(dlg(page, 'All Villains')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg(page, 'All Villains')).toHaveCount(0);
    await expect(allBtn).toBeFocused();
    // 席の ◆（ボタン）: フォーカスして Space
    const seat = seatBtn(page, 'BTN');
    await seat.focus();
    await page.keyboard.press('Space');
    await expect(dlg(page, 'Villain · BTN')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(seat).toBeFocused();
    // MTT だけ
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openAnswer(page, { ...baseHs1bb(), fmt: 'mtt', rake: null, mtt: { avg: 30 } });
    await expect(allBtn).toBeDisabled();
    await expect(mttBtn).toBeEnabled();
    await expect(page.locator('.pseat-read')).toHaveCount(0);
    await mttBtn.focus();
    await page.keyboard.press('Enter');
    await expect(dlg(page, 'MTT')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mttBtn).toBeFocused();
    // どちらも無い
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openAnswer(page, baseHs1bb());
    await expect(allBtn).toBeDisabled();
    await expect(mttBtn).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test(`T3-04 席の印: Hero の席には付かない。中央だけの席・Hero のキーは…。席の印をクリックしても Replay の操作は壊れない${v}`, async ({ page }) => {
    await openAnswer(page, { ...baseHs1bb(), villain_reads: { BTN: { vpip: 20 }, UTG: { agg: 2 } } });
    // Hero は BB。◆ は BTN だけ
    await expect(page.locator('.pseat-read')).toHaveCount(1);
    await expect(page.locator('.pseat.hero .pseat-read')).toHaveCount(0);
    await expect(page.locator('.pseat.hero .pseat-btn')).toHaveCount(0);
    await expect(seatBtn(page, 'BTN')).toBeVisible();
  });

  test(`T3-04 ボタンの行は卓の上にあり、卓・画面の幅とぶつからない${v}`, async ({ page }) => {
    await openAnswer(page, { ...baseHs1bb(), fmt: 'mtt', rake: null, villain_reads: { BTN: { vpip: 20 } }, mtt: { avg: 30 } });
    const info = page.locator('.rp-info');
    const table = page.locator('.ptable');
    expect(await overlaps(info, table)).toBe(false);
    const ib = await info.boundingBox();
    const tb = await table.boundingBox();
    expect(ib && tb && ib.y + ib.height <= tb.y + 1).toBe(true);
    // 3 つ（スマホ）または 2 つ（PC は History が無い）が 1 行に並ぶ
    const btns = info.getByRole('button');
    const n = await btns.count();
    expect(n).toBe(isSp(page) ? 3 : 2);
    const ys = await btns.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1);
    expect(await noHScroll(page)).toBe(true);
    // ボタンの高さ（スマホの押しやすさ）
    if (isSp(page)) {
      const hs = await btns.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      for (const h of hs) expect(h).toBeGreaterThanOrEqual(36);
    }
  });

  test(`T3-04 集計画面: 同じボタンと席の印${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await openResult(page, { ...baseHs1bb(), fmt: 'mtt', rake: null, villain_reads: { BTN: { vpip: 20, pfr: 10 }, UTG: { agg: 4 } }, mtt: { rank: 2, left: 9 } });
    await toHandHistoryTab(page);
    await expect(page.getByRole('button', { name: 'All Villains' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'MTT', exact: true })).toBeEnabled();
    await expect(page.locator('.pseat-read')).toHaveCount(2);
    await seatBtn(page, 'BTN').click();
    await expect(dlg(page, 'Villain · BTN').locator('.rv-chip')).toHaveText(['VPIP 20', 'PFR 10']);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'MTT', exact: true }).click();
    await expect(dlg(page, 'MTT')).toContainText('2/9');
    expect(await noHScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });
}

// 回答画面の Read の情報を、Replay の手数を動かしても変わらず見られる（情報は投稿時点の静的なもの）
test('T3-04 Replay を最初へ戻しても席の ◆ は押せる', async ({ page }) => {
  await openAnswer(page, { ...baseHs1bb(), villain_reads: { BTN: { vpip: 20 } } });
  await page.keyboard.press('Home');
  await seatBtn(page, 'BTN').click();
  await expect(dlg(page, 'Villain · BTN')).toContainText('VPIP 20');
});

// 使っていない detail（型の確認用）
void detail;
