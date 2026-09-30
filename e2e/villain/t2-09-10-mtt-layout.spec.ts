/**
 * T2-09（MTT の欄）と T2-10（画面の大きさ）。
 */
import type { Locator, Page } from '@playwright/test';
import {
  doubleRaise,
  draftJson,
  expect,
  isMobile,
  openDraft,
  openSeat,
  S_SETTINGS,
  S_SPOT,
  seatBtn,
  slider,
  srpTurn,
  step,
  test,
  threeBetPot,
  villains,
} from './t2Kit.ts';

const submitBtn = (page: Page): Locator => page.getByRole('button', { name: /^投稿(する|中…)$/ });
const speed = (page: Page): Locator => page.getByRole('slider', { name: 'Tournament Type' });
const FIELDS = ['スポットの順位', '残りの人数', 'エントリー数', 'ITM', 'Avg Stack（bb）'] as const;
const box = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });

async function openMtt(page: Page): Promise<void> {
  await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt' }));
  await step(page, S_SETTINGS);
}

for (const v of ['', ' @sp'] as const) {
  test(`T2-09 Game 形式: MTT のときだけ MTT の欄が出る。Cash に戻すと欄が消え、送る本文に mtt を入れない。MTT に戻すと入力が残っている${v}`, async ({ page }) => {
    const { cp } = await openDraft(page, draftJson({ ...srpTurn(), fmt: 'cash' }));
    await step(page, S_SETTINGS);
    const fmt = page.getByRole('group', { name: 'Game 形式' });
    await expect(page.getByRole('heading', { name: 'MTT', exact: true })).toHaveCount(0);
    await fmt.getByRole('button', { name: 'MTT' }).click();
    await expect(page.getByRole('heading', { name: 'MTT', exact: true })).toBeVisible();
    // 置き場所: PC は基本設定の下（同じ列）、スマホも基本設定の下（同じ画面）
    const hs = await page.getByRole('heading', { name: '基本設定', exact: true }).boundingBox();
    const hm = await page.getByRole('heading', { name: 'MTT', exact: true }).boundingBox();
    expect(hm?.y ?? 0).toBeGreaterThan(hs?.y ?? 0);
    if (!isMobile(page)) expect(Math.abs((hm?.x ?? 0) - (hs?.x ?? 0))).toBeLessThan(5);
    await box(page, 'スポットの順位').fill('5');
    await speed(page).focus();
    await page.keyboard.press('ArrowRight');
    await fmt.getByRole('button', { name: 'Cash' }).click();
    await expect(page.getByRole('heading', { name: 'MTT', exact: true })).toHaveCount(0);
    await step(page, S_SPOT);
    await submitBtn(page).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    expect(cp.calls[0]?.body).not.toHaveProperty('mtt');
    expect(cp.calls[0]?.body).toHaveProperty('fmt', 'cash');
  });

  test(`T2-09 Game 形式を MTT → Cash → MTT と往復しても入力が残る${v}`, async ({ page }) => {
    await openMtt(page);
    const fmt = page.getByRole('group', { name: 'Game 形式' });
    await box(page, 'スポットの順位').fill('5');
    await speed(page).focus();
    await page.keyboard.press('End');
    await fmt.getByRole('button', { name: 'Cash' }).click();
    await fmt.getByRole('button', { name: 'MTT' }).click();
    await expect(box(page, 'スポットの順位')).toHaveValue('5');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '100');
  });

  test(`T2-09 Tournament Type の Slider: 段階のラベル・目盛り・数の表示が無く、左に Deep・右に Turbo。キー・なぞる・× の操作${v}`, async ({ page }) => {
    await openMtt(page);
    const rs = speed(page).locator('xpath=ancestor::div[contains(@class,"rs")][1]');
    await expect(speed(page)).toHaveAttribute('aria-valuetext', '未入力');
    await expect(rs.locator('.rs-tick')).toHaveCount(0);
    await expect(rs.locator('.rs-label')).toHaveText('');
    await expect(rs.getByRole('button', { name: /を数で入力/ })).toHaveCount(0);
    await expect(rs.locator('.rs-ends span')).toHaveText(['Deep', 'Turbo']);
    await expect(rs.locator('.rs-thumb')).toHaveCount(0);
    // 最初の矢印は 50
    await speed(page).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '50');
    await expect(speed(page)).toHaveAttribute('aria-valuetext', '50 / 100（Deep 0 〜 Turbo 100）');
    // ±1、PageUp/Down ±10、Home・End、端で止まる
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '51');
    await page.keyboard.press('PageUp');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '61');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '41');
    await page.keyboard.press('Home');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '0');
    // 0 でもつまみは出ている（未入力と区別できる）
    await expect(rs.locator('.rs-thumb')).toHaveCount(1);
    expect(await rs.locator('.rs-thumb').evaluate((el) => (el as HTMLElement).style.left)).toBe('0%');
    await page.keyboard.press('End');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '100');
    // なぞる: 押した所へ、ドラッグ
    const b = (await speed(page).boundingBox()) as { x: number; y: number; width: number; height: number };
    const y = b.y + b.height / 2;
    await page.mouse.click(b.x + b.width * 0.25, y);
    const at25 = Number(await speed(page).getAttribute('aria-valuenow'));
    expect(at25).toBeGreaterThanOrEqual(23);
    expect(at25).toBeLessThanOrEqual(27);
    await page.mouse.move(b.x + b.width * 0.25, y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.9, y, { steps: 8 });
    await page.mouse.up();
    const at90 = Number(await speed(page).getAttribute('aria-valuenow'));
    expect(at90).toBeGreaterThanOrEqual(88);
    expect(at90).toBeLessThanOrEqual(92);
    expect(await speed(page).evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
    // × と Delete で未入力
    await page.getByRole('button', { name: 'Tournament Type をリセット' }).click();
    await expect(speed(page)).toHaveAttribute('aria-valuetext', '未入力');
    await speed(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Delete');
    await expect(speed(page)).toHaveAttribute('aria-valuetext', '未入力');
  });

  test(`T2-09 Tournament Type: 端（0・100）で更に矢印・PageUp/Down を押しても範囲の外に出ない${v}`, async ({ page }) => {
    test.fail(true, '既知: MTT の Tournament Type は端でキーを押すと -1 / 101 などの範囲外になる（setRead と違い onChange が丸めない）（S2）。直ったらこの行を消す');
    await openMtt(page);
    await speed(page).focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('PageDown');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('PageUp');
    await expect(speed(page)).toHaveAttribute('aria-valuenow', '100');
  });

  test(`T2-09 Tournament Type: 端で矢印を押したあとの値を送ると、画面はエラー（MTT の情報を確認してください）になる${v}`, async ({ page }) => {
    test.fail(true, '既知: 上と同じ原因で -1 を保持し、投稿が「MTT の情報を確認してください」で止まる（S2）。直ったらこの行を消す');
    const { cp } = await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', title: 'mtt -1' }));
    await step(page, S_SETTINGS);
    await speed(page).focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft');
    await step(page, S_SPOT);
    await submitBtn(page).click();
    await expect.poll(() => cp.calls.length, { timeout: 3000 }).toBe(1);
  });

  test(`T2-09 Tournament Type: 0（Deep の端）も送る本文に入る${v}`, async ({ page }) => {
    const { cp } = await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', mtt: { speed: 0, prize: null, rank: '', left: '', paid: '', entries: '', avg: '' } }));
    await step(page, S_SPOT);
    await submitBtn(page).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    expect(cp.calls[0]?.body).toHaveProperty('mtt', { speed: 0 });
  });

  test(`T2-09 数の欄: 名前の日本語・並び・入力モード。境目の値（1・1000000・0・1000001・小数・負・全角・指数・カンマ）と赤い枠${v}`, async ({ page }) => {
    await openMtt(page);
    await expect(page.locator('.mtt-fields label')).toHaveText([...FIELDS]);
    for (const f of FIELDS) await expect(box(page, f)).toHaveAttribute('inputmode', f === 'Avg Stack（bb）' ? 'decimal' : 'numeric');
    const invalid = async (f: string): Promise<boolean> => (await box(page, f).getAttribute('aria-invalid')) === 'true';
    const ok: Record<string, string[]> = {
      count: ['', '1', '1000000', ' 12 ', '012', '999999'],
      avg: ['', '0.1', '99999', '99999.0', '35.5', '1', ' 7 '],
    };
    const ng: Record<string, string[]> = {
      count: ['0', '1000001', '1.5', '-1', 'abc', '1e3', '1,000', '１２', '+5', '12a', '0x10', '00'],
      avg: ['0', '0.0', '99999.1', '100000', '1.23', '.5', '5.', '1e2', '35,5', '-1', 'abc', '０.５'],
    };
    for (const f of ['スポットの順位', '残りの人数', 'エントリー数', 'ITM'])
      for (const t of ok.count as string[]) {
        await box(page, f).fill(t);
        expect(await invalid(f), `${f} "${t}" は正しい`).toBe(false);
      }
    for (const f of ['スポットの順位', '残りの人数', 'エントリー数', 'ITM'])
      for (const t of ng.count as string[]) {
        await box(page, f).fill(t);
        expect(await invalid(f), `${f} "${t}" は赤い枠`).toBe(true);
      }
    for (const t of ok.avg as string[]) {
      await box(page, 'Avg Stack（bb）').fill(t);
      expect(await invalid('Avg Stack（bb）'), `Avg "${t}" は正しい`).toBe(false);
    }
    for (const t of ng.avg as string[]) {
      await box(page, 'Avg Stack（bb）').fill(t);
      expect(await invalid('Avg Stack（bb）'), `Avg "${t}" は赤い枠`).toBe(true);
    }
    // 赤い枠の見た目（枠の色が通常と違い、赤い。色の遷移が終わるまで待つ）
    await box(page, 'ITM').fill('');
    await box(page, 'ITM').blur();
    await page.waitForTimeout(700);
    const normal = await box(page, 'ITM').evaluate((el) => getComputedStyle(el).borderTopColor);
    await box(page, 'ITM').fill('x');
    await box(page, 'ITM').blur();
    await page.waitForTimeout(700);
    const bad = await box(page, 'ITM').evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(bad).not.toBe(normal);
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bad);
    expect(Number(m?.[1]), '赤み（R が G・B より大きい）').toBeGreaterThan(Number(m?.[2]) + 40);
  });

  test(`T2-09 数の欄: 読めない値は投稿の時に「MTT の {名前} の値が正しくありません」。直すと消えて送れる。送る本文は数${v}`, async ({ page }) => {
    const { cp } = await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', title: 'mtt err' }));
    await step(page, S_SETTINGS);
    await box(page, 'スポットの順位').fill('1.5');
    await box(page, 'Avg Stack（bb）').fill('abc');
    await box(page, 'エントリー数').fill('320');
    await step(page, S_SPOT);
    // 投稿ボタンを押す前はエラーを出さない
    await expect(page.locator('.pf-errors')).toHaveCount(0);
    await submitBtn(page).click();
    await expect(page.locator('.pf-errors')).toContainText('MTT の スポットの順位 の値が正しくありません');
    await expect(page.locator('.pf-errors')).toContainText('MTT の Avg Stack（bb） の値が正しくありません');
    expect(cp.calls.length).toBe(0);
    await step(page, S_SETTINGS);
    await box(page, 'スポットの順位').fill('30');
    await box(page, 'Avg Stack（bb）').fill('22.5');
    await step(page, S_SPOT);
    await expect(page.locator('.pf-errors')).toHaveCount(0);
    await submitBtn(page).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    expect(cp.calls[0]?.body).toHaveProperty('mtt', { rank: 30, entries: 320, avg: 22.5 });
  });

  test(`T2-09 Prize Structure: 選ぶ・もう一度で解除・別の選択肢に移る。目安は選択肢の下に小さく${v}`, async ({ page }) => {
    await openMtt(page);
    const grp = page.getByRole('group', { name: 'Prize Structure' });
    const btns = grp.getByRole('button');
    await expect(btns).toHaveCount(3);
    await expect(btns.nth(0)).toContainText('Top-heavy');
    await expect(btns.nth(0)).toContainText('1st ≥ 25%');
    await expect(btns.nth(1)).toContainText('Standard');
    await expect(btns.nth(1)).toContainText('1st 15–25%');
    await expect(btns.nth(2)).toContainText('Flat');
    await expect(btns.nth(2)).toContainText('1st < 15%');
    const pressed = (): Promise<(string | null)[]> => btns.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
    expect(await pressed()).toEqual(['false', 'false', 'false']);
    await btns.nth(1).click();
    expect(await pressed()).toEqual(['false', 'true', 'false']);
    await btns.nth(2).click();
    expect(await pressed()).toEqual(['false', 'false', 'true']);
    await btns.nth(2).click();
    expect(await pressed()).toEqual(['false', 'false', 'false']);
    // 目安の文字は名前より小さい
    const [fsName, fsHint] = await btns.nth(0).evaluate((el) => [getComputedStyle(el.querySelector('span') as Element).fontSize, getComputedStyle(el.querySelector('small') as Element).fontSize]);
    expect(parseFloat(fsHint as string)).toBeLessThan(parseFloat(fsName as string));
  });
}

for (const prize of ['top', 'standard', 'flat'] as const) {
  test(`T2-09 Prize Structure: ${prize} が送る本文に入る`, async ({ page }) => {
    const { cp } = await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', title: `prize ${prize}` }));
    const label = { top: /Top-heavy/, standard: /Standard/, flat: /Flat/ }[prize];
    await page.getByRole('group', { name: 'Prize Structure' }).getByRole('button', { name: label }).click();
    await submitBtn(page).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    expect(cp.calls[0]?.body).toHaveProperty('mtt', { prize });
  });
}

// ---- T2-10 画面の大きさ ----

const SIZES: [number, number][] = [
  [375, 667],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1024, 640],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

/** Villain の欄を全部開く: 席の 1 つで傾向を全部入れ、General Read 2 件の条件を開いて、長い Read の行にする */
async function fillAll(page: Page): Promise<void> {
  await step(page, S_SPOT);
  await openSeat(page, 'BTN');
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('100');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'PFR を数で入力' }).click();
  await page.getByRole('textbox', { name: 'PFR（%）' }).fill('100');
  await page.keyboard.press('Enter');
  await villains(page).getByRole('group', { name: 'Postflop Aggression' }).getByRole('button').nth(4).click();
  await villains(page).getByRole('group', { name: 'Hero Image' }).getByRole('button').nth(4).click();
  await villains(page).getByRole('group', { name: 'Sample' }).getByRole('button').nth(0).click();
  // Spot Read の Lean（強い）
  const lean = villains(page).locator('.vr-read').first().getByRole('group', { name: 'Lean' }).getByRole('button');
  await lean.nth(2).click();
  await lean.nth(2).click();
  for (let n = 1; n <= 2; n++) {
    await villains(page).getByRole('button', { name: '＋ General Read' }).click();
    const g = villains(page).locator('.vr-read').filter({ hasText: `General Read ${n}` });
    await g.getByRole('group', { name: 'Street', exact: true }).getByRole('button', { name: n === 1 ? 'Turn' : 'River', exact: true }).click();
    await g.getByRole('group', { name: 'Action', exact: true }).getByRole('button', { name: 'Barrel', exact: true }).click();
    await g.getByRole('button', { name: 'Board · Size' }).click();
    await g.getByRole('group', { name: 'High Card', exact: true }).getByRole('button', { name: 'Q/J-high' }).click();
    await g.getByRole('group', { name: 'Suit', exact: true }).getByRole('button', { name: 'Monotone' }).click();
    await g.getByRole('group', { name: 'Pairing', exact: true }).getByRole('button', { name: 'Unpaired' }).click();
    await g.getByRole('group', { name: 'Connectivity', exact: true }).getByRole('button', { name: 'Straight possible' }).click();
    for (const r of ['Brick', 'Overcard', 'Flush Complete', 'Straight Complete', 'Board Pair']) await g.getByRole('group', { name: 'Runout', exact: true }).getByRole('button', { name: r }).click();
    await g.getByRole('group', { name: 'Size', exact: true }).getByRole('button', { name: 'Overbet' }).click();
    const l = g.getByRole('group', { name: 'Lean', exact: true }).getByRole('button', { name: 'Value-heavy' });
    await l.click();
    await l.click();
  }
}

type Problem = { what: string; detail: string };

/** 画面の崩れの検査（ブラウザ内で実行） */
function inspectLayout(): Problem[] {
  const out: Problem[] = [];
  const vw = window.innerWidth;
  const sec = document.querySelector('section[aria-labelledby]:has(.vr-list)') as HTMLElement | null;
  if (!sec) return [{ what: 'no-section', detail: 'Villain の節が無い' }];
  const isScrollable = (el: Element): boolean => {
    const s = getComputedStyle(el);
    return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
  };
  // ページ全体の横のはみ出し
  if (document.documentElement.scrollWidth > vw) out.push({ what: 'page-x-overflow', detail: `${document.documentElement.scrollWidth} > ${vw}` });
  // 節の中の要素が節（または画面）の右・左からはみ出す
  const sr = sec.getBoundingClientRect();
  for (const el of Array.from(sec.querySelectorAll<HTMLElement>('*'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.closest('svg')) continue;
    if (r.right > sr.right + 1.5 || r.left < sr.left - 1.5) out.push({ what: 'outside-section-x', detail: `${el.tagName}.${el.className} [${Math.round(r.left)},${Math.round(r.right)}] vs [${Math.round(sr.left)},${Math.round(sr.right)}]` });
  }
  // 文字が切れている（overflow hidden / ellipsis で内容のほうが広い）
  for (const el of Array.from(sec.querySelectorAll<HTMLElement>('*'))) {
    const s = getComputedStyle(el);
    if ((s.overflowX === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 3 && !el.classList.contains('vr-sum')) {
      out.push({ what: 'text-clipped', detail: `${el.tagName}.${el.className} "${(el.textContent ?? '').slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}` });
    }
  }
  // 兄弟のボタン・チップ・行が重なる
  const groups = Array.from(sec.querySelectorAll<HTMLElement>('.vr-chips, .vr-read-h, .vr-head, .rs-head, .seg5, .vr-foot, .pr-save-row'));
  for (const g of groups) {
    const kids = Array.from(g.children).map((c) => c as HTMLElement).filter((c) => c.getBoundingClientRect().width > 0);
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = (kids[i] as HTMLElement).getBoundingClientRect();
        const b = (kids[j] as HTMLElement).getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1.5 && oy > 1.5) out.push({ what: 'overlap', detail: `${g.className}: "${(kids[i] as HTMLElement).textContent?.slice(0, 20)}" × "${(kids[j] as HTMLElement).textContent?.slice(0, 20)}"` });
      }
  }
  // タップできる大きさ（モバイル: 幅 < 700 のとき 24px 未満の操作要素）
  if (vw < 700) {
    for (const el of Array.from(sec.querySelectorAll<HTMLElement>('button, [role="slider"]'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.height < 24 || r.width < 24) out.push({ what: 'small-target', detail: `${el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}` });
    }
  }
  // 最初のスクロールできる祖先の中に、節の最後の操作（Preset）が見えるところまでスクロールできる
  let anc: HTMLElement | null = sec.parentElement;
  while (anc && !isScrollable(anc)) anc = anc.parentElement;
  const last = sec.querySelector<HTMLElement>('.vr-foot');
  if (last && anc && anc !== document.documentElement && anc !== document.body) {
    last.scrollIntoView({ block: 'end' });
    const lr = last.getBoundingClientRect();
    const ar = anc.getBoundingClientRect();
    if (lr.bottom > ar.bottom + 2 || lr.top < ar.top - 2) out.push({ what: 'cannot-scroll-to-foot', detail: `foot [${Math.round(lr.top)},${Math.round(lr.bottom)}] vs scroller [${Math.round(ar.top)},${Math.round(ar.bottom)}]` });
  }
  return out;
}

for (const [w, h] of SIZES) {
  test(`T2-10 画面の大きさ ${w}x${h}: Villain の欄を全部開いた状態（General Read 2 件・条件を開く）のはみ出し・重なり・切れがない`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openDraft(page, draftJson({ ...threeBetPot(), title: `size ${w}` }));
    await fillAll(page);
    const problems = await page.evaluate(inspectLayout);
    expect(problems, JSON.stringify(problems, null, 1)).toEqual([]);
    // PC: 投稿画面は 1 画面に収まる（ページはスクロールしない）
    if (w >= 768 && !isMobile(page)) {
      const pageScroll = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
      expect(pageScroll.sh, 'PC ではページ全体はスクロールしない').toBeLessThanOrEqual(pageScroll.ch + 1);
    }
    // スマホ（ステップ式）: いちばん下までスクロールしたとき、Preset・クリアが下の固定バー（Back・投稿する）に隠れない
    if (isMobile(page)) {
      const cover = await page.evaluate(() => {
        const scroller = (document.scrollingElement ?? document.documentElement) as HTMLElement;
        scroller.scrollTo(0, scroller.scrollHeight);
        document.querySelectorAll<HTMLElement>('*').forEach((el) => {
          if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
        });
        const foot = document.querySelector('.vr-foot')?.getBoundingClientRect();
        const bar = document.querySelector('.pf-bar')?.getBoundingClientRect();
        return foot && bar ? { footBottom: foot.bottom, barTop: bar.top } : null;
      });
      expect(cover, 'バーと .vr-foot が見つかる').not.toBeNull();
      expect(cover?.footBottom ?? 0, `Preset・クリアの下端が固定バーの上端より上（foot ${cover?.footBottom} / bar ${cover?.barTop}）`).toBeLessThanOrEqual((cover?.barTop ?? 0) + 1);
    }
    await page.screenshot({ path: test.info().outputPath(`villain-${w}x${h}.png`) });
  });
}

test('T2-10 PC（1024x640）: 投稿ボタンは右の列の中でスクロールすれば押せる（Villain を全部開いても）', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await openDraft(page, draftJson({ ...threeBetPot(), title: 'size 1024' }));
  await fillAll(page);
  await submitBtn(page).scrollIntoViewIfNeeded();
  await expect(submitBtn(page)).toBeInViewport({ ratio: 0.9 });
  // 文字の大きさ（FitStage の縮小後）を記録する
  const fs = await page.evaluate(() => {
    const b = document.querySelector('.vr-chip') as HTMLElement;
    const r = b.getBoundingClientRect();
    return { fontPx: parseFloat(getComputedStyle(b).fontSize), zoom: getComputedStyle(document.querySelector('.fit-stage') as Element).getPropertyValue('zoom'), h: r.height };
  });
  test.info().annotations.push({ type: 'pc-1024x640-chip', description: JSON.stringify(fs) });
  void seatBtn;
  void slider;
  void doubleRaise;
});
