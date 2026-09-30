/**
 * T2 の探索（計画書の ID の外）: Spot Read の候補の選び直し、キーの競合、二重送信、MTT の欄の画面の大きさ、タッチの操作。
 */
import type { Page } from '@playwright/test';
import { acts, draftJson, expect, isMobile, openDraft, openSeat, S_SETTINGS, S_SPOT, seatBtn, slider, srpTurn, step, test, threeBetPot, villains, type DraftSpec } from './t2Kit.ts';

const submitBtn = (page: Page) => page.getByRole('button', { name: /^投稿(する|中…)$/ });

/** Hero=BB。CO Open、BTN 3-Bet、BB Call、CO 4-Bet、BTN Fold（Fold to 4-Bet）、BB Call。Flop: BB x / CO b10 / BB f。Spot は Flop の BB の Check（9） */
function fourBetPot(spot = 9): DraftSpec {
  return {
    hero: 'BB',
    hands: { BB: '9s9c' },
    actions: acts({ pf: 'UTG f, HJ f, CO r2.5, BTN r8, SB f, BB c, CO r22, BTN f, BB c', flop: 'BB x, CO b10, BB f' }),
    board: ['Kh', '8d', '3c'],
    spotIndex: spot,
  };
}

for (const v of ['', ' @sp'] as const) {
  test(`T2-04b Spot Read: 候補が 2 つ（3-Bet と Fold to 4-Bet）。Bet 系の Lean で選んだあと Fold 系の候補に移ると外れる${v}`, async ({ page }) => {
    await openDraft(page, draftJson(fourBetPot()));
    await step(page, S_SPOT);
    await openSeat(page, 'BTN');
    const spot = villains(page).locator('.vr-read').first();
    const act = spot.getByRole('group', { name: 'Action' }).getByRole('button');
    await expect(act).toHaveText(['Preflop · 3-Bet', 'Preflop · Fold to 4-Bet']);
    // 最初は判断地点にいちばん近い（Fold to 4-Bet）。Lean は Over・Under だけ
    await expect(spot.getByRole('group', { name: 'Lean' }).getByRole('button')).toHaveText(['Over', 'Under']);
    // 3-Bet に移ると Lean が 4 つ。Value-heavy を選ぶ
    await act.nth(0).click();
    await expect(spot.getByRole('group', { name: 'Lean' }).getByRole('button')).toHaveText(['Over', 'Under', 'Value-heavy', 'Bluff-heavy']);
    await spot.getByRole('group', { name: 'Lean' }).getByRole('button').nth(2).click();
    await expect(seatBtn(page, 'BTN')).toContainText('1 Read');
    // Fold to 4-Bet に移る: Value-heavy は合わないので Spot Read が外れる
    await act.nth(1).click();
    await expect(seatBtn(page, 'BTN')).not.toContainText('Read');
    await expect(spot.getByRole('group', { name: 'Lean' }).getByRole('button')).toHaveText(['Over', 'Under']);
    // Over を選んで 3-Bet に戻ると Over は残る（3-Bet でも選べる）
    await spot.getByRole('group', { name: 'Lean' }).getByRole('button').nth(0).click();
    await act.nth(0).click();
    await expect(spot.getByRole('group', { name: 'Lean' }).getByRole('button').nth(0)).toHaveAttribute('aria-pressed', 'true');
    // CO の 4-Bet は候補 1 つ
    await seatBtn(page, 'BTN').click();
    await openSeat(page, 'CO');
    await expect(villains(page).locator('.vr-read').first().locator('.vr-line')).toHaveText('Preflop · 4-Bet');
  });

  test(`T2-04b Spot Read: 席を開いたまま Spot を変えて候補が増えたとき、最初の選択は判断地点にいちばん近い候補になる${v}`, async ({ page }) => {
    await openDraft(page, draftJson({ ...threeBetPot(), spotIndex: 7 }));
    await step(page, S_SPOT);
    await openSeat(page, 'BTN'); // 候補は 3-Bet の 1 つだけ
    await expect(villains(page).locator('.vr-read').first().locator('.vr-line')).toHaveText('Preflop · 3-Bet');
    // Spot を Flop の Fold（C-Bet の後）に変える → 候補は 3-Bet と C-Bet
    await page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio').last().click();
    const act = villains(page).locator('.vr-read').first().getByRole('group', { name: 'Action' }).getByRole('button');
    await expect(act).toHaveCount(2);
    await expect(act.nth(1), '判断地点にいちばん近い候補（C-Bet）が選ばれている').toHaveAttribute('aria-pressed', 'true');
  });
}

test('T2-11 PC: Villain の Slider・ボタンにフォーカスがあるとき Ctrl+Z でハンドの Action は戻らない（V-030）', async ({ page }) => {
  await openDraft(page, draftJson({ ...srpTurn(), reads: {} }));
  await openSeat(page, 'BB');
  const before = await page.locator('.hlog').innerText();
  await slider(page, 'VPIP').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+z');
  const after = await page.locator('.hlog').innerText();
  test.info().annotations.push({ type: 'ctrl-z-on-slider', description: before === after ? 'no-change' : 'hand-history-changed' });
  // 期待: Villain の入力中の Ctrl+Z でハンドの Action は消えない
  expect(after, 'Villain の Slider にフォーカスがあるのに、Ctrl+Z でハンドの Action が 1 つ戻った').toBe(before);
});

test('T2-11 二重に押しても create-post は 1 回だけ', async ({ page }) => {
  const { cp } = await openDraft(page, draftJson({ ...srpTurn(), reads: { BB: { vpip: 30 } } }));
  await step(page, S_SPOT);
  await submitBtn(page).dblclick();
  await page.waitForTimeout(800);
  expect(cp.calls.length).toBe(1);
});

test('T2-11 @sp タッチ: Tournament Type と VPIP の Slider をタップで動かせる', async ({ page }) => {
  await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt' }));
  await step(page, S_SETTINGS);
  const speed = page.getByRole('slider', { name: 'Tournament Type' });
  await speed.scrollIntoViewIfNeeded();
  const b = (await speed.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.touchscreen.tap(b.x + b.width * 0.7, b.y + b.height / 2);
  const n = Number(await speed.getAttribute('aria-valuenow'));
  expect(n).toBeGreaterThanOrEqual(67);
  expect(n).toBeLessThanOrEqual(73);
  await step(page, S_SPOT);
  await openSeat(page, 'BB');
  const vpip = slider(page, 'VPIP');
  await vpip.scrollIntoViewIfNeeded();
  const c = (await vpip.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.touchscreen.tap(c.x + c.width * 0.3, c.y + c.height / 2);
  const m = Number(await vpip.getAttribute('aria-valuenow'));
  expect(m).toBeGreaterThanOrEqual(27);
  expect(m).toBeLessThanOrEqual(33);
  expect(isMobile(page)).toBe(true);
});

const SIZES: [number, number][] = [[375, 667], [390, 844], [412, 915], [768, 1024], [1024, 640], [1280, 800], [1440, 900], [1920, 1080]];
for (const [w, h] of SIZES) {
  test(`T2-10b MTT の欄を全部入れた状態 ${w}x${h}: はみ出し・重なり・切れがない（赤い枠・長い名前）`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const mtt = { speed: 73, prize: 'standard', rank: '1000000', left: '1000000', paid: '1000000', entries: '1000000', avg: '99999.9' };
    await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', mtt, title: `mtt ${w}` }));
    await step(page, S_SETTINGS);
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw) out.push(`page-x-overflow ${document.documentElement.scrollWidth}>${vw}`);
      const sec = document.querySelector('.mtt-fields')?.closest('section[aria-labelledby]') as HTMLElement;
      const sr = sec.getBoundingClientRect();
      sec.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        if (r.right > sr.right + 1.5 || r.left < sr.left - 1.5) out.push(`outside ${el.tagName}.${el.className} [${Math.round(r.left)},${Math.round(r.right)}] vs [${Math.round(sr.left)},${Math.round(sr.right)}]`);
        const s = getComputedStyle(el);
        if ((s.overflowX === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 3) out.push(`clipped ${el.tagName}.${el.className} "${(el.textContent ?? '').slice(0, 20)}"`);
      });
      // 入力欄の中身（1000000 や 99999.9）が欄に収まって読める
      sec.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
        if (i.scrollWidth > i.clientWidth + 1) out.push(`input-clipped ${i.getAttribute('aria-label') ?? i.id} ${i.scrollWidth}>${i.clientWidth}`);
      });
      return out;
    });
    expect(problems).toEqual([]);
    if (w >= 768 && !isMobile(page)) {
      const ps = await page.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.clientHeight]);
      expect(ps[0]).toBeLessThanOrEqual((ps[1] as number) + 1);
    }
  });
}
