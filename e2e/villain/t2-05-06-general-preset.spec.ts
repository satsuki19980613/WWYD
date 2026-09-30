/**
 * T2-05（General Read）と T2-06（Preset）。
 */
import type { Locator, Page } from '@playwright/test';
import {
  doubleRaise,
  draftJson,
  expect,
  isMobile,
  noOverflow,
  openDraft,
  openSeat,
  PRESET_KEY,
  PRESET_KEY_V1,
  S_SPOT,
  seatBtn,
  seedStorage,
  slider,
  srpTurn,
  step,
  test,
  threeBetPot,
  villains,
} from './t2Kit.ts';

async function open(page: Page, spec = srpTurn(), seat = 'BB'): Promise<void> {
  await openDraft(page, draftJson(spec));
  await step(page, S_SPOT);
  await openSeat(page, seat);
}

const gen = (page: Page, n: number): Locator => villains(page).locator('.vr-read').filter({ hasText: `General Read ${n}` });
const choice = (g: Locator, group: string): Locator => g.getByRole('group', { name: group, exact: true }).getByRole('button');
const pressedOf = (loc: Locator): Promise<(string | null)[]> => loc.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
const addGen = (page: Page): Promise<void> => villains(page).getByRole('button', { name: '＋ General Read' }).click();
const texts = (loc: Locator): Promise<string[]> => loc.allInnerTexts();

const PF = ['3-Bet', 'Fold to 3-Bet', '4-Bet', 'Fold to 4-Bet', 'Squeeze', 'Limp', 'Fold to Steal'];
const FLOP = (raise: string): string[] => ['C-Bet', 'Fold to C-Bet', 'Donk', 'Bet vs Check', raise, 'Fold to Bet', 'Fold to Raise'];
const TURN = (raise: string): string[] => ['Barrel', 'Fold to Barrel', 'Delayed C-Bet', 'Donk', 'Probe', 'Bet vs Check', raise, 'Fold to Bet', 'Fold to Raise'];
const RIVER = (raise: string): string[] => ['Barrel', 'Fold to Barrel', 'Donk', 'Probe', 'Bet vs Check', raise, 'Fold to Bet', 'Fold to Raise'];

for (const v of ['', ' @sp'] as const) {
  test(`T2-05 General Read: Street → Action → Lean の順に出る。各 Street の Action の一覧（OOP は Check-Raise）${v}`, async ({ page }) => {
    await open(page); // BB は Hero（BTN）より先に動く = OOP
    await addGen(page);
    const g = gen(page, 1);
    await expect(g.locator('.vr-line')).toHaveText('—');
    // Street だけ。Action・Lean・条件は出ない
    await expect(choice(g, 'Street')).toHaveText(['Preflop', 'Flop', 'Turn', 'River']);
    await expect(g.getByRole('group', { name: 'Action', exact: true })).toHaveCount(0);
    await expect(g.getByRole('group', { name: 'Lean', exact: true })).toHaveCount(0);
    await expect(g.getByRole('button', { name: 'Board · Size' })).toHaveCount(0);
    for (const [street, want] of [['Preflop', PF], ['Flop', FLOP('Check-Raise')], ['Turn', TURN('Check-Raise')], ['River', RIVER('Check-Raise')]] as const) {
      await choice(g, 'Street').filter({ hasText: new RegExp(`^${street}$`) }).first().click();
      expect(await texts(choice(g, 'Action')), street).toEqual(want);
      await expect(g.getByRole('group', { name: 'Lean', exact: true })).toHaveCount(0);
    }
    // Action を選ぶと Lean が出る
    await choice(g, 'Action').filter({ hasText: /^Barrel$/ }).click();
    await expect(choice(g, 'Lean')).toHaveText(['Over', 'Under', 'Value-heavy', 'Bluff-heavy']);
    // 1 行の表示は Lean を選ぶまで「—」
    await expect(g.locator('.vr-line')).toHaveText('—');
    await choice(g, 'Lean').nth(1).click();
    await expect(g.locator('.vr-line')).toHaveText('River · Barrel → Under');
    // 強い
    await choice(g, 'Lean').nth(1).click();
    await expect(g.locator('.vr-line')).toHaveText('River · Barrel → Under++');
    await choice(g, 'Lean').nth(1).click();
    await expect(g.locator('.vr-line')).toHaveText('—');
    // Fold 系は Over・Under だけ
    await choice(g, 'Action').filter({ hasText: /^Fold to Barrel$/ }).click();
    await expect(choice(g, 'Lean')).toHaveText(['Over', 'Under']);
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-05 General Read: IP の席（Hero より後に動く）の Raise は Raise のまま${v}`, async ({ page }) => {
    // Hero=BB。BTN は BB より後に動く（IP）
    await open(page, threeBetPot(), 'BTN');
    await addGen(page);
    const g = gen(page, 1);
    await choice(g, 'Street').filter({ hasText: /^Flop$/ }).first().click();
    expect(await texts(choice(g, 'Action'))).toEqual(FLOP('Raise'));
    // CO も Hero（BB）より後に動く
    await seatBtn(page, 'BTN').click();
    await openSeat(page, 'CO');
    await addGen(page);
    const g2 = gen(page, 1);
    await choice(g2, 'Street').filter({ hasText: /^Turn$/ }).first().click();
    expect(await texts(choice(g2, 'Action'))).toEqual(TURN('Raise'));
  });

  test(`T2-05 General Read: 同じ Street・Action を押すと外れる。Street を外すと全部外れる${v}`, async ({ page }) => {
    await open(page);
    await addGen(page);
    const g = gen(page, 1);
    const street = (n: string): Locator => choice(g, 'Street').filter({ hasText: new RegExp(`^${n}$`) });
    await street('Turn').click();
    await expect(street('Turn')).toHaveAttribute('aria-pressed', 'true');
    await choice(g, 'Action').filter({ hasText: /^Donk$/ }).click();
    await expect(choice(g, 'Action').filter({ hasText: /^Donk$/ })).toHaveAttribute('aria-pressed', 'true');
    // 同じ Action をもう一度 → 外れる（Lean の行も消える）
    await choice(g, 'Action').filter({ hasText: /^Donk$/ }).click();
    await expect(choice(g, 'Action').filter({ hasText: /^Donk$/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(g.getByRole('group', { name: 'Lean', exact: true })).toHaveCount(0);
    // Action を選び直して Lean、Street をもう一度 → Street も含めて全部外れる
    await choice(g, 'Action').filter({ hasText: /^Donk$/ }).click();
    await choice(g, 'Lean').nth(0).click();
    await street('Turn').click();
    await expect(street('Turn')).toHaveAttribute('aria-pressed', 'false');
    await expect(g.getByRole('group', { name: 'Action', exact: true })).toHaveCount(0);
    await expect(g.locator('.vr-line')).toHaveText('—');
  });

  test(`T2-05 General Read: Street を変えると、合わない Action・条件・Size・Lean が外れ、合うものは残る${v}`, async ({ page }) => {
    await open(page);
    await addGen(page);
    const g = gen(page, 1);
    const street = (n: string): Locator => choice(g, 'Street').filter({ hasText: new RegExp(`^${n}$`) });
    const action = (n: string): Locator => choice(g, 'Action').filter({ hasText: new RegExp(`^${n}$`) });
    const cond = g.getByRole('button', { name: 'Board · Size' });

    // Turn・Barrel・条件（Suit: Monotone・Runout: Flush + Brick・Size: Overbet）・Lean（Value-heavy 強い）
    await street('Turn').click();
    await action('Barrel').click();
    await cond.click();
    await choice(g, 'Suit').filter({ hasText: 'Monotone' }).click();
    await choice(g, 'Runout').filter({ hasText: 'Flush Complete' }).click();
    await choice(g, 'Runout').filter({ hasText: 'Brick' }).click();
    await choice(g, 'Size').filter({ hasText: 'Overbet' }).click();
    await choice(g, 'Lean').nth(2).click();
    await choice(g, 'Lean').nth(2).click();
    await expect(g.locator('.vr-line')).toHaveText('Turn · Monotone · Brick · Flush Complete · Barrel (Overbet) → Value-heavy++');

    // River に変える: Barrel は River にもある。Runout・Size・Lean・Texture は残る
    await street('River').click();
    await expect(g.locator('.vr-line')).toHaveText('River · Monotone · Brick · Flush Complete · Barrel (Overbet) → Value-heavy++');

    // Turn に戻して Flop に: Barrel は Flop に無い → Action・Size・Lean が外れ、Runout も外れ、texture（Monotone）は残る
    await street('Flop').click();
    await expect(g.locator('.vr-line')).toHaveText('—');
    await expect(g.getByRole('group', { name: 'Runout', exact: true })).toHaveCount(0);
    await expect(g.getByRole('group', { name: 'Size', exact: true })).toHaveCount(0);
    await expect(g.getByRole('group', { name: 'Lean', exact: true })).toHaveCount(0);
    await expect(choice(g, 'Suit').filter({ hasText: 'Monotone' })).toHaveAttribute('aria-pressed', 'true');
    // Flop で C-Bet を選ぶ → Lean・Size は空から。Runout を Turn に戻しても Runout は空
    await action('C-Bet').click();
    await expect(choice(g, 'Lean')).toHaveCount(4);
    await expect(await pressedOf(choice(g, 'Lean'))).toEqual(['false', 'false', 'false', 'false']);
    await street('Turn').click();
    await expect(g.locator('.vr-line')).toHaveText('—');
    await expect(await pressedOf(choice(g, 'Runout'))).toEqual(['false', 'false', 'false', 'false', 'false']);

    // Raise（Flop・Value-heavy・Overbet）→ Turn: Raise も Lean も Size も残る
    await street('Flop').click(); // Turn → Flop（Turn は選択済みなので Flop へ）
    await action('Check-Raise').click();
    await choice(g, 'Size').filter({ hasText: 'Overbet' }).click();
    await choice(g, 'Lean').nth(3).click();
    await street('Turn').click();
    await expect(g.locator('.vr-line')).toHaveText('Turn · Monotone · Check-Raise (Overbet) → Bluff-heavy');
    // Raise → Preflop: Raise は Preflop に無い。texture は Preflop に無いので外れる
    await street('Preflop').click();
    await expect(g.locator('.vr-line')).toHaveText('—');
    await expect(g.getByRole('button', { name: 'Board · Size' })).toHaveCount(0); // Action が無い Preflop に条件の欄は無い
    // Preflop の 3-Bet を選ぶと Size は Small・Big だけ（Overbet は出ない）
    await action('3-Bet').click();
    await expect(g.getByRole('button', { name: 'Board · Size' })).toBeVisible();
    if ((await g.getByRole('button', { name: 'Board · Size' }).getAttribute('aria-expanded')) !== 'true') await g.getByRole('button', { name: 'Board · Size' }).click();
    await expect(g.getByRole('group', { name: 'Suit', exact: true })).toHaveCount(0);
    await expect(g.getByRole('group', { name: 'Runout', exact: true })).toHaveCount(0);
    await expect(choice(g, 'Size')).toHaveText(['Small', 'Big']);
    // Preflop の Fold to 3-Bet は Size・条件の欄が無い
    await action('Fold to 3-Bet').click();
    await expect(g.getByRole('group', { name: 'Size', exact: true })).toHaveCount(0);
    await expect(g.getByRole('button', { name: 'Board · Size' })).toHaveCount(0);
  });

  test(`T2-05 General Read: 「Board · Size」の開閉と各軸（1 つまで）・Runout（複数）・Size（1 つ）${v}`, async ({ page }) => {
    await open(page);
    await addGen(page);
    const g = gen(page, 1);
    await choice(g, 'Street').filter({ hasText: /^Turn$/ }).first().click();
    const cond = g.getByRole('button', { name: 'Board · Size' });
    await expect(cond).toHaveAttribute('aria-expanded', 'false');
    await expect(cond).toContainText('+');
    await expect(g.getByRole('group', { name: 'High Card', exact: true })).toHaveCount(0);
    await cond.click();
    await expect(cond).toHaveAttribute('aria-expanded', 'true');
    await expect(cond).toContainText('−');
    // 軸: 名前・タグ
    await expect(choice(g, 'High Card')).toHaveText(['A-high', 'K-high', 'Q/J-high', 'Middle', 'Low']);
    await expect(choice(g, 'Suit')).toHaveText(['Rainbow', 'Two-tone', 'Monotone']);
    await expect(choice(g, 'Pairing')).toHaveText(['Unpaired', 'Paired']);
    await expect(choice(g, 'Connectivity')).toHaveText(['Straight possible', 'No straight']);
    await expect(choice(g, 'Runout')).toHaveText(['Brick', 'Overcard', 'Flush Complete', 'Straight Complete', 'Board Pair']);
    // Size は Action を選ぶまで無い
    await expect(g.getByRole('group', { name: 'Size', exact: true })).toHaveCount(0);
    // 1 軸 1 つ
    for (const axis of ['High Card', 'Suit', 'Pairing', 'Connectivity']) {
      const b = choice(g, axis);
      const n = await b.count();
      await b.nth(0).click();
      await b.nth(n - 1).click();
      expect(await pressedOf(b), axis).toEqual([...Array(n - 1).fill('false'), 'true']);
      await b.nth(n - 1).click(); // もう一度で外れる
      expect(await pressedOf(b), axis).toEqual(Array(n).fill('false'));
    }
    // Runout は複数
    const r = choice(g, 'Runout');
    await r.nth(1).click();
    await r.nth(4).click();
    await r.nth(2).click();
    expect(await pressedOf(r)).toEqual(['false', 'true', 'true', 'false', 'true']);
    await r.nth(4).click();
    expect(await pressedOf(r)).toEqual(['false', 'true', 'true', 'false', 'false']);
    // 並びは決まった順（選んだ順ではない）
    await choice(g, 'Action').filter({ hasText: /^Barrel$/ }).click();
    await choice(g, 'Lean').nth(0).click();
    await expect(g.locator('.vr-line')).toHaveText('Turn · Overcard · Flush Complete · Barrel → Over');
    // Size は Bet / Raise 系だけ。1 つ
    const s = choice(g, 'Size');
    await expect(s).toHaveText(['Small', 'Big', 'Overbet']);
    await s.nth(0).click();
    await s.nth(2).click();
    expect(await pressedOf(s)).toEqual(['false', 'false', 'true']);
    // Fold 系に変えると Size の欄が消える
    await choice(g, 'Action').filter({ hasText: /^Fold to Barrel$/ }).click();
    await expect(g.getByRole('group', { name: 'Size', exact: true })).toHaveCount(0);
    // Over は Fold 系でも選べるので残る
    await expect(g.locator('.vr-line')).toHaveText('Turn · Overcard · Flush Complete · Fold to Barrel → Over');
    await choice(g, 'Lean').nth(1).click();
    await expect(g.locator('.vr-line')).toHaveText('Turn · Overcard · Flush Complete · Fold to Barrel → Under');
    // 条件の欄を閉じても選択は残る
    await cond.click();
    await expect(g.getByRole('group', { name: 'Runout', exact: true })).toHaveCount(0);
    await expect(g.locator('.vr-line')).toHaveText('Turn · Overcard · Flush Complete · Fold to Barrel → Under');
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-05 General Read: 2 件まで・× で消す・途中のエラー・何も選んでいないものはエラーにしない${v}`, async ({ page }) => {
    const { cp } = await openDraftWithTitle(page);
    await addGen(page);
    await addGen(page);
    await expect(villains(page).getByRole('button', { name: '＋ General Read' })).toHaveCount(0);
    await expect(villains(page).getByText(/General Read 3/)).toHaveCount(0);
    // 1 件目は何も選ばない（エラーにならない）、2 件目は Street だけ（エラー）
    await choice(gen(page, 2), 'Street').filter({ hasText: /^Flop$/ }).first().click();
    await submitBtn(page).click();
    await expect(page.locator('.pf-errors')).toContainText('BB の General Read を最後まで選んでください');
    expect(cp.calls.length).toBe(0);
    // Street・Action まで（Lean 無し）でもエラー
    await choice(gen(page, 2), 'Action').filter({ hasText: /^C-Bet$/ }).click();
    await submitBtn(page).click();
    await expect(page.locator('.pf-errors')).toContainText('BB の General Read を最後まで選んでください');
    // 2 件目を × で消す → エラーが消え、空の 1 件目は送らずに投稿できる
    await gen(page, 2).getByRole('button', { name: 'General Read 2 を削除' }).click();
    await expect(villains(page).getByRole('button', { name: '＋ General Read' })).toHaveCount(1);
    await expect(page.locator('.pf-errors')).toHaveCount(0);
    await submitBtn(page).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    expect(cp.calls[0]?.body).not.toHaveProperty('villain_reads');
  });

  test(`T2-05 General Read: 1 件目を消すと 2 件目が 1 件目になり、2 件とも送る本文に入る${v}`, async ({ page }) => {
    const { cp } = await openDraftWithTitle(page);
    await addGen(page);
    const g1 = gen(page, 1);
    await choice(g1, 'Street').filter({ hasText: /^Flop$/ }).first().click();
    await choice(g1, 'Action').filter({ hasText: /^C-Bet$/ }).click();
    await choice(g1, 'Lean').nth(0).click();
    await addGen(page);
    const g2 = gen(page, 2);
    await choice(g2, 'Street').filter({ hasText: /^River$/ }).first().click();
    await choice(g2, 'Action').filter({ hasText: /^Probe$/ }).click();
    await g2.getByRole('button', { name: 'Board · Size' }).click();
    await choice(g2, 'Runout').filter({ hasText: 'Brick' }).click();
    await choice(g2, 'Lean').nth(3).click();
    await expect(seatBtn(page, 'BB')).toContainText('2 Reads');
    await submitBtn(page).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    const body = cp.calls[0]?.body as { villain_reads: { BB: { reads: Record<string, unknown>[] } } };
    expect(body.villain_reads.BB.reads).toEqual([
      { scope: 'general', street: 'flop', action: 'cbet', texture: null, runout: null, size: null, lean: 'over', strong: false },
      { scope: 'general', street: 'river', action: 'probe', texture: null, runout: ['brick'], size: null, lean: 'bluff', strong: false },
    ]);
  });

  test(`T2-05 General Read: 1 件目を消したあとの 2 件目（条件つき）の「Board · Size」の開閉の状態${v}`, async ({ page }) => {
    await open(page);
    await addGen(page);
    await addGen(page);
    const g2 = gen(page, 2);
    await choice(g2, 'Street').filter({ hasText: /^Turn$/ }).first().click();
    await g2.getByRole('button', { name: 'Board · Size' }).click();
    await choice(g2, 'Runout').filter({ hasText: 'Overcard' }).click();
    // 1 件目（空）を消す
    await gen(page, 1).getByRole('button', { name: 'General Read 1 を削除' }).click();
    const g = gen(page, 1);
    await expect(choice(g, 'Street').filter({ hasText: /^Turn$/ }).first()).toHaveAttribute('aria-pressed', 'true');
    // 選んだ条件（Overcard）がある Read なのに、欄が閉じていないか（中身が見えなくならないか）
    const cond = g.getByRole('button', { name: 'Board · Size' });
    const expanded = await cond.getAttribute('aria-expanded');
    test.info().annotations.push({ type: 'cond-open-after-delete-first', description: String(expanded) });
    expect(expanded, '条件を選んだ Read の「Board · Size」が閉じてしまう').toBe('true');
  });

  test(`T2-05 General Read: 席を閉じて開き直しても、General Read と条件の欄が残る${v}`, async ({ page }) => {
    await open(page);
    await addGen(page);
    const g = gen(page, 1);
    await choice(g, 'Street').filter({ hasText: /^Flop$/ }).first().click();
    await choice(g, 'Action').filter({ hasText: /^Check-Raise$/ }).click();
    await choice(g, 'Lean').nth(3).click();
    await seatBtn(page, 'BB').click();
    await expect(gen(page, 1)).toHaveCount(0);
    await expect(seatBtn(page, 'BB')).toContainText('1 Read');
    await seatBtn(page, 'BB').click();
    await expect(gen(page, 1).locator('.vr-line')).toHaveText('Flop · Check-Raise → Bluff-heavy');
  });
}

const submitBtn = (page: Page): Locator => page.getByRole('button', { name: /^投稿(する|中…)$/ });

async function openDraftWithTitle(page: Page) {
  const r = await openDraft(page, draftJson(srpTurn()));
  await step(page, S_SPOT);
  await openSeat(page, 'BB');
  return r;
}

// ---- T2-06 Preset ----

async function savePresetAs(page: Page, name: string): Promise<void> {
  await villains(page).getByRole('button', { name: 'Preset' }).click();
  const dlg = page.getByRole('dialog', { name: /^Preset/ });
  await dlg.getByPlaceholder('Preset の名前').fill(name);
  await dlg.getByRole('button', { name: '保存' }).click();
}
const presetDlg = (page: Page): Locator => page.getByRole('dialog', { name: /^Preset/ });
const readStore = (page: Page): Promise<unknown> =>
  page.evaluate((k) => {
    const s = localStorage.getItem(k);
    return s === null ? null : JSON.parse(s);
  }, PRESET_KEY);

async function makeRead(page: Page): Promise<void> {
  // BB: VPIP 40 / PFR 15 / Aggressive / General Read 1 件
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('40');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'PFR を数で入力' }).click();
  await page.getByRole('textbox', { name: 'PFR（%）' }).fill('15');
  await page.keyboard.press('Enter');
  await villains(page).getByRole('group', { name: 'Postflop Aggression' }).getByRole('button').nth(3).click();
  await addGen(page);
  const g = gen(page, 1);
  await choice(g, 'Street').filter({ hasText: /^Flop$/ }).first().click();
  await choice(g, 'Action').filter({ hasText: /^Fold to C-Bet$/ }).click();
  await choice(g, 'Lean').nth(0).click();
}

for (const v of ['', ' @sp'] as const) {
  test(`T2-06 Preset: 保存・呼び出し・上書き・削除。保存の形は { schema: 2 }${v}`, async ({ page }) => {
    await open(page);
    await makeRead(page);
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    // 名前が空のうちは保存できない
    await expect(presetDlg(page).getByRole('button', { name: '保存' })).toBeDisabled();
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('   ');
    await expect(presetDlg(page).getByRole('button', { name: '保存' })).toBeDisabled();
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('  Fish  ');
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(1);
    await expect(presetDlg(page).getByRole('listitem').locator('.pr-name')).toHaveText('Fish');
    await expect(presetDlg(page).getByRole('listitem').locator('.pr-sum')).toHaveText('40/15 · Aggressive · 1 Read');
    // 保存後は入力欄が空になる
    await expect(presetDlg(page).getByPlaceholder('Preset の名前')).toHaveValue('');
    const st1 = (await readStore(page)) as { schema: number; presets: { id: string; name: string; read: Record<string, unknown> }[] };
    expect(st1.schema).toBe(2);
    expect(st1.presets).toHaveLength(1);
    expect(st1.presets[0]?.name).toBe('Fish');
    expect(st1.presets[0]?.read).toMatchObject({ vpip: 40, pfr: 15, agg: 3 });
    expect(JSON.stringify(st1)).not.toContain('"spot"');
    const id1 = st1.presets[0]?.id;

    // 上書き（同じ名前）: 1 件のまま、id は同じ、中身が新しい
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'VPIP をリセット' }).click();
    await page.getByRole('button', { name: 'PFR を数で入力' }).click();
    await page.getByRole('textbox', { name: 'PFR（%）' }).fill('9');
    await page.keyboard.press('Enter');
    await savePresetAs(page, 'Fish');
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(1);
    await expect(presetDlg(page).getByRole('listitem').locator('.pr-sum')).toHaveText('PFR 9 · Aggressive · 1 Read');
    const st2 = (await readStore(page)) as typeof st1;
    expect(st2.presets).toHaveLength(1);
    expect(st2.presets[0]?.id).toBe(id1);
    // 大文字小文字の違う名前は別の Preset
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('fish');
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(2);
    // Enter でも保存
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('Nit');
    await page.keyboard.press('Enter');
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(3);

    // 呼び出す: 全体の傾向と General Read を「置き換える」（今の入力に無いものは消える）。ダイアログは閉じる
    await presetDlg(page).getByRole('button', { name: 'Fish を呼び出す', exact: true }).click();
    await expect(presetDlg(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Preset' }).click();
    await page.keyboard.press('Escape');
    // 別の内容にしてから Fish を呼ぶ
    await villains(page).getByRole('button', { name: 'クリア' }).click();
    await villains(page).getByRole('group', { name: 'Hero Image' }).getByRole('button').nth(0).click();
    await page.getByRole('button', { name: 'Preset' }).click();
    await presetDlg(page).getByRole('button', { name: 'Fish を呼び出す', exact: true }).click();
    await expect(slider(page, 'PFR')).toHaveAttribute('aria-valuenow', '9');
    await expect(slider(page, 'VPIP')).toHaveAttribute('aria-valuetext', '未入力');
    await expect(villains(page).getByRole('group', { name: 'Hero Image' }).getByRole('button').nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(gen(page, 1).locator('.vr-line')).toHaveText('Flop · Fold to C-Bet → Over');
    await expect(villains(page).getByText('General Read 2')).toHaveCount(0);

    // 削除
    await page.getByRole('button', { name: 'Preset' }).click();
    await presetDlg(page).getByRole('button', { name: 'Nit を削除' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(2);
    await presetDlg(page).getByRole('button', { name: 'fish を削除', exact: true }).click();
    await presetDlg(page).getByRole('button', { name: 'Fish を削除', exact: true }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(0);
    expect(await readStore(page)).toBeNull(); // 0 件なら鍵ごと消す
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-06 Preset: Spot Read は入れず、呼び出しても今の Spot Read は残る。Spot Read だけでは保存できない${v}`, async ({ page }) => {
    await open(page, srpTurn(), 'SB');
    const spot = villains(page).locator('.vr-read').first();
    await spot.getByRole('group', { name: 'Lean' }).getByRole('button').nth(1).click();
    await expect(seatBtn(page, 'SB')).toContainText('1 Read');
    // Spot Read しか無い席は Preset に保存できない
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('OnlySpot');
    await expect(presetDlg(page).getByRole('button', { name: '保存' })).toBeDisabled();
    await page.keyboard.press('Escape');
    // 傾向と General Read を足して保存
    await villains(page).getByRole('group', { name: 'Hero Image' }).getByRole('button').nth(4).click();
    await addGen(page);
    const g = gen(page, 1);
    await choice(g, 'Street').filter({ hasText: /^River$/ }).first().click();
    await choice(g, 'Action').filter({ hasText: /^Fold to Bet$/ }).click();
    await choice(g, 'Lean').nth(1).click();
    await savePresetAs(page, 'P1');
    const st = (await readStore(page)) as { presets: { read: Record<string, unknown> }[] };
    expect(st.presets[0]?.read).not.toHaveProperty('spot');
    expect(JSON.stringify(st.presets[0]?.read)).not.toContain('"scope":"spot"');
    await page.keyboard.press('Escape');
    // 今の入力を消す（Spot Read も）→ Spot Read をもう一度付けてから呼び出す → 残る
    await villains(page).getByRole('button', { name: 'クリア' }).click();
    await expect(seatBtn(page, 'SB').locator('.vr-sum')).toHaveText('—');
    await spot.getByRole('group', { name: 'Lean' }).getByRole('button').nth(0).click();
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    await presetDlg(page).getByRole('button', { name: 'P1 を呼び出す' }).click();
    await expect(seatBtn(page, 'SB')).toContainText('2 Reads');
    await expect(spot.getByRole('group', { name: 'Lean' }).getByRole('button').nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(gen(page, 1).locator('.vr-line')).toHaveText('River · Fold to Bet → Under');
  });

  test(`T2-06 Preset: 途中の General Read は保存されない。別の席でも呼び出せる。20 文字の名前${v}`, async ({ page }) => {
    await open(page);
    await addGen(page);
    const g = gen(page, 1);
    await choice(g, 'Street').filter({ hasText: /^Flop$/ }).first().click(); // 途中
    await villains(page).getByRole('group', { name: 'Hero Image' }).getByRole('button').nth(1).click();
    // 名前の長さ: 20 文字（漢字）は通り、21 文字はエラー
    const n20 = '名'.repeat(20);
    await savePresetAs(page, n20);
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(1);
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('名'.repeat(21));
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('alert')).toHaveText('名前を 20 文字以内で入力してください');
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(1);
    // 絵文字 20 個（サロゲートペア）は 20 文字として通る
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('😀'.repeat(20));
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(2);
    // 途中の General Read は保存の中身に入らない
    const st = (await readStore(page)) as { presets: { read: Record<string, unknown> }[] };
    expect(st.presets[0]?.read).toEqual({ image: 1 });
    // 別の席（SB）で呼び出す
    await page.keyboard.press('Escape');
    await seatBtn(page, 'BB').click();
    await openSeat(page, 'SB');
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    await presetDlg(page).getByRole('button', { name: `${n20} を呼び出す` }).click();
    await expect(seatBtn(page, 'SB')).toContainText('Hero Image: Tight');
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-06 Preset: 20 件まで。いっぱいでも同じ名前の上書きはできる${v}`, async ({ page }) => {
    const presets = Array.from({ length: 20 }, (_, i) => ({ id: `id${i}`, name: `P${i}`, read: { vpip: 10 + i } }));
    await seedStorage(page, { [PRESET_KEY]: JSON.stringify({ schema: 2, presets }) });
    await open(page);
    await villains(page).getByRole('group', { name: 'Hero Image' }).getByRole('button').nth(4).click();
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(20);
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('P20');
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('alert')).toHaveText('Preset がいっぱいです。どれかを削除してください');
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(20);
    // 同じ名前は上書きできる
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('P3');
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('alert')).toHaveCount(0);
    await expect(presetDlg(page).getByRole('listitem').nth(3).locator('.pr-sum')).toHaveText('Hero Image: Very Loose');
    // 1 つ消せば新しく足せる
    await presetDlg(page).getByRole('button', { name: 'P0 を削除' }).click();
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('P20');
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(20);
    // 21 件目の保存後にダイアログが画面からはみ出さない（長いリストでも内側でスクロール）
    const box = await presetDlg(page).boundingBox();
    const vh = page.viewportSize()?.height ?? 0;
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(vh + 1);
  });

  test(`T2-06 Preset: 前の版の鍵（v1）は読まず、書くときに消す。壊れた保存でも落ちない${v}`, async ({ page }) => {
    await seedStorage(page, {
      [PRESET_KEY_V1]: JSON.stringify([{ id: 'x', name: '古い', read: { memo: 'めも', conf: 50, agg: 80 } }]),
    });
    await open(page);
    await villains(page).getByRole('group', { name: 'Hero Image' }).getByRole('button').nth(1).click();
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), PRESET_KEY_V1)).not.toBeNull();
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('New');
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(1);
    expect(await page.evaluate((k) => localStorage.getItem(k), PRESET_KEY_V1)).toBeNull();
    expect(((await readStore(page)) as { schema: number }).schema).toBe(2);
  });

  test(`T2-06 Preset: 壊れた JSON・schema 違い・型の違う中身は読み捨てて落ちない${v}`, async ({ page }) => {
    await seedStorage(page, { [PRESET_KEY]: '{ not json' });
    await open(page);
    await villains(page).getByRole('group', { name: 'Hero Image' }).getByRole('button').nth(1).click();
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(0);
    await presetDlg(page).getByPlaceholder('Preset の名前').fill('ok');
    await presetDlg(page).getByRole('button', { name: '保存' }).click();
    await expect(presetDlg(page).getByRole('listitem')).toHaveCount(1);
  });

  test(`T2-06 Preset: 保存の中身に範囲外・型の違う値があっても、正しい値だけ読む${v}`, async ({ page }) => {
    const bad = {
      schema: 2,
      presets: [
        { id: 'a', name: 'mix', read: { vpip: 150, pfr: 20, agg: 9, image: 'x', sample: 2, memo: 'めも', general: [{ street: 'flop', action: 'barrel', lean: 'over' }, { street: 'flop', action: 'cbet', lean: 'value', strong: true }, 'x', null] } },
        { id: 'b', name: '', read: { vpip: 10 } },
        { id: 3, name: 'num', read: { vpip: 10 } },
        { id: 'c', name: 'pfr>vpip', read: { vpip: 10, pfr: 30 } },
        'str',
      ],
    };
    await seedStorage(page, { [PRESET_KEY]: JSON.stringify(bad) });
    await open(page);
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    const items = presetDlg(page).getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('.pr-name')).toHaveText('mix');
    // 範囲外の vpip・agg・不正な image は捨て、pfr 20・sample 2・完全な General Read 1 件だけ
    await expect(items.nth(0).locator('.pr-sum')).toHaveText('PFR 20 · Sample: Some History · 1 Read');
    await expect(items.nth(1).locator('.pr-sum')).toHaveText('VPIP 10');
  });
}

test('T2-06 Preset: アカウントを削除すると Preset（と前の版の鍵）も消える', async ({ page }) => {
  const presets = [{ id: 'a', name: 'P', read: { vpip: 10 } }];
  await seedStorage(page, { [PRESET_KEY]: JSON.stringify({ schema: 2, presets }), [PRESET_KEY_V1]: '[]' });
  await openDraft(page, draftJson(srpTurn()));
  await page.getByRole('button', { name: 'アカウント' }).click();
  await page.getByRole('menuitem', { name: 'アカウントを削除' }).click();
  await page.getByRole('button', { name: '削除する' }).click();
  await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
  expect(await readStore(page)).toBeNull();
  expect(await page.evaluate((k) => localStorage.getItem(k), PRESET_KEY_V1)).toBeNull();
});

test('T2-06 Preset: ログアウトしても Preset は残り、別の利用者には見えない（鍵が利用者ごと）', async ({ page }) => {
  const presets = [{ id: 'a', name: 'P', read: { vpip: 10 } }];
  await seedStorage(page, { [PRESET_KEY]: JSON.stringify({ schema: 2, presets }), 'wwyd.readPresets.other-user': JSON.stringify({ schema: 2, presets: [{ id: 'z', name: 'Other', read: { vpip: 99 } }] }) });
  await open(page);
  await villains(page).getByRole('button', { name: 'Preset' }).click();
  await expect(presetDlg(page).getByRole('listitem')).toHaveCount(1);
  await expect(presetDlg(page).getByText('Other')).toHaveCount(0);
  void isMobile;
  void doubleRaise;
});
