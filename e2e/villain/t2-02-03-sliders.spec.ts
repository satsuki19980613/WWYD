/**
 * T2-02（VPIP・PFR の Slider）と T2-03（5 分割のボタン）。SRP の局面で BB の席を開いて操作する。
 */
import type { Locator, Page } from '@playwright/test';
import { draftJson, expect, noOverflow, openDraft, openSeat, S_SPOT, seatBtn, slider, srpTurn, step, test, villains } from './t2Kit.ts';

async function open(page: Page): Promise<void> {
  await openDraft(page, draftJson(srpTurn()));
  await step(page, S_SPOT);
  await openSeat(page, 'BB');
}

const num = async (page: Page, name: 'VPIP' | 'PFR', text: string, how: 'Enter' | 'Escape' | 'blur' = 'Enter'): Promise<void> => {
  await page.getByRole('button', { name: `${name} を数で入力` }).click();
  const input = page.getByRole('textbox', { name: `${name}（%）` });
  await input.fill(text);
  if (how === 'blur') await input.blur();
  else await page.keyboard.press(how);
};
const valnow = (page: Page, name: string): Promise<string | null> => slider(page, name).getAttribute('aria-valuenow');
const valtext = (page: Page, name: string): Promise<string | null> => slider(page, name).getAttribute('aria-valuetext');

/** Slider のつまみの left（%） */
const thumbLeft = async (loc: Locator): Promise<string | null> => loc.locator('xpath=ancestor::div[contains(@class,"rs")][1]').locator('.rs-thumb').evaluate((el) => (el as HTMLElement).style.left).catch(() => null);

for (const v of ['', ' @sp'] as const) {
  test(`T2-02 VPIP・PFR: 未入力の見た目（つまみ無し・— ・--%）と、最初の矢印で真ん中、× で未入力${v}`, async ({ page }) => {
    await open(page);
    for (const name of ['VPIP', 'PFR'] as const) {
      const box = slider(page, name).locator('xpath=ancestor::div[contains(@class,"rs")][1]');
      await expect(slider(page, name)).toHaveAttribute('aria-valuetext', '未入力');
      await expect(slider(page, name)).not.toHaveAttribute('aria-valuenow', /.*/);
      await expect(box.locator('.rs-thumb')).toHaveCount(0);
      await expect(box.locator('.rs-label')).toHaveText('—');
      await expect(page.getByRole('button', { name: `${name} を数で入力` })).toHaveText('--%');
      await expect(page.getByRole('button', { name: `${name} をリセット` })).toHaveCount(0);
      await slider(page, name).focus();
      await page.keyboard.press('ArrowRight');
      await expect(slider(page, name)).toHaveAttribute('aria-valuenow', '50');
      await expect(box.locator('.rs-thumb')).toHaveCount(1);
      await page.getByRole('button', { name: `${name} をリセット` }).click();
      await expect(slider(page, name)).toHaveAttribute('aria-valuetext', '未入力');
      await expect(box.locator('.rs-thumb')).toHaveCount(0);
    }
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-02 VPIP・PFR: 未入力のときの最初のキーは、どの矢印・PageUp/Down でも真ん中。Home・End は端${v}`, async ({ page }) => {
    await open(page);
    const s = slider(page, 'VPIP');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']) {
      await s.focus();
      await page.keyboard.press(key);
      expect(await valnow(page, 'VPIP'), `最初の ${key}`).toBe('50');
      await page.keyboard.press('Delete');
      await expect(s).toHaveAttribute('aria-valuetext', '未入力');
    }
    await page.keyboard.press('Home');
    expect(await valnow(page, 'VPIP')).toBe('0');
    await expect(s).toHaveAttribute('aria-valuetext', 'Very Tight 0%');
    await page.keyboard.press('ArrowLeft');
    expect(await valnow(page, 'VPIP'), '0 より下がらない').toBe('0');
    await page.keyboard.press('End');
    expect(await valnow(page, 'VPIP')).toBe('100');
    await page.keyboard.press('ArrowRight');
    expect(await valnow(page, 'VPIP'), '100 より上がらない').toBe('100');
    await page.keyboard.press('Delete');
    await expect(s).toHaveAttribute('aria-valuetext', '未入力');
    // 未入力で Home・End は未入力から端に
    await page.keyboard.press('End');
    expect(await valnow(page, 'VPIP')).toBe('100');
    await page.keyboard.press('Backspace');
    await expect(s).toHaveAttribute('aria-valuetext', '未入力');
    await page.keyboard.press('Home');
    expect(await valnow(page, 'VPIP')).toBe('0');
    // 矢印 ±1、PageUp/Down ±10
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    expect(await valnow(page, 'VPIP')).toBe('2');
    await page.keyboard.press('PageUp');
    expect(await valnow(page, 'VPIP')).toBe('12');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    expect(await valnow(page, 'VPIP'), 'PageDown で 0 より下がらない').toBe('0');
    // Delete を未入力でもう一度押しても落ちない
    await page.keyboard.press('Delete');
    await page.keyboard.press('Delete');
    await expect(s).toHaveAttribute('aria-valuetext', '未入力');
    // 関係ないキーは何もしない（Tab で抜けられる）
    await page.keyboard.press('a');
    await expect(s).toHaveAttribute('aria-valuetext', '未入力');
  });

  test(`T2-02 VPIP・PFR: 段階の境目（VPIP 15・22・30・40、PFR 8・14・20・26）のラベルと読み上げ${v}`, async ({ page }) => {
    await open(page);
    const VPIP: [number, string][] = [[0, 'Very Tight'], [14, 'Very Tight'], [15, 'Tight'], [21, 'Tight'], [22, 'Standard'], [29, 'Standard'], [30, 'Loose'], [39, 'Loose'], [40, 'Very Loose'], [100, 'Very Loose']];
    // V-006: PFR の境目は 10/16/23/30
    const PFR: [number, string][] = [[0, 'Very Low'], [9, 'Very Low'], [10, 'Low'], [15, 'Low'], [16, 'Standard'], [22, 'Standard'], [23, 'High'], [29, 'High'], [30, 'Very High'], [100, 'Very High']];
    for (const [val, lab] of VPIP) {
      await num(page, 'VPIP', String(val));
      expect(await valtext(page, 'VPIP'), `VPIP ${val}`).toBe(`${lab} ${val}%`);
    }
    await page.getByRole('button', { name: 'VPIP をリセット' }).click();
    for (const [val, lab] of PFR) {
      await num(page, 'PFR', String(val));
      expect(await valtext(page, 'PFR'), `PFR ${val}`).toBe(`${lab} ${val}%`);
    }
    // 表の見出し側のラベル
    await expect(villains(page).locator('.rs').first().locator('.rs-label')).toHaveText('—');
  });

  test(`T2-02 PFR ≦ VPIP: 両方入力のときだけ追従する。片方が未入力なら追従しない${v}`, async ({ page }) => {
    await open(page);
    // PFR だけ入れる → VPIP は未入力のまま
    await num(page, 'PFR', '40');
    await expect(slider(page, 'VPIP')).toHaveAttribute('aria-valuetext', '未入力');
    // VPIP だけ入れる（PFR が未入力なら追従しない）
    await page.getByRole('button', { name: 'PFR をリセット' }).click();
    await num(page, 'VPIP', '10');
    await expect(slider(page, 'PFR')).toHaveAttribute('aria-valuetext', '未入力');
    // 両方
    await num(page, 'VPIP', '30');
    await num(page, 'PFR', '20');
    expect(await valnow(page, 'VPIP')).toBe('30');
    expect(await valnow(page, 'PFR')).toBe('20');
    // PFR を VPIP より上げる → VPIP も同じ値に
    await num(page, 'PFR', '45');
    expect(await valnow(page, 'VPIP')).toBe('45');
    // VPIP を PFR より下げる → PFR も下がる
    await num(page, 'VPIP', '12');
    expect(await valnow(page, 'PFR')).toBe('12');
    // 等しいのはそのまま
    await num(page, 'PFR', '12');
    expect(await valnow(page, 'VPIP')).toBe('12');
    // キーでも追従
    await slider(page, 'PFR').focus();
    await page.keyboard.press('ArrowRight');
    expect(await valnow(page, 'VPIP')).toBe('13');
    await slider(page, 'VPIP').focus();
    await page.keyboard.press('PageDown');
    expect(await valnow(page, 'PFR')).toBe('3');
    expect(await valnow(page, 'VPIP')).toBe('3');
    // VPIP を × で未入力にしても PFR は残る
    await page.getByRole('button', { name: 'VPIP をリセット' }).click();
    expect(await valnow(page, 'PFR')).toBe('3');
    // PFR が入力済みのとき、VPIP の最初の矢印（真ん中 50）
    await num(page, 'PFR', '80');
    await slider(page, 'VPIP').focus();
    await page.keyboard.press('ArrowRight');
    const afterFirst = { vpip: await valnow(page, 'VPIP'), pfr: await valnow(page, 'PFR') };
    test.info().annotations.push({ type: 'first-arrow-vpip-with-pfr80', description: JSON.stringify(afterFirst) });
    // PFR 80 > VPIP 50 の組は作れない（どちらかが追従する）
    expect(Number(afterFirst.pfr)).toBeLessThanOrEqual(Number(afterFirst.vpip));
  });

  test(`T2-02 数の直接入力: 範囲の外・小数・空・文字は変えない。Esc は取り消し、欄の外で確定${v}`, async ({ page }) => {
    await open(page);
    await num(page, 'VPIP', '35');
    expect(await valnow(page, 'VPIP')).toBe('35');
    // 変えない入力
    for (const bad of ['101', '150', '-1', '1.5', 'abc', '', '  ', '1e1', '１２', '1000', '+5', '5%']) {
      await num(page, 'VPIP', bad);
      expect(await valnow(page, 'VPIP'), `入力 "${bad}" では変えない`).toBe('35');
      // 入力欄が閉じている（画面に残らない）
      await expect(page.getByRole('textbox', { name: 'VPIP（%）' })).toHaveCount(0);
    }
    // 変わる入力
    for (const [ok, want] of [['0', '0'], ['100', '100'], [' 20 ', '20'], ['020', '20'], ['7', '7']] as const) {
      await num(page, 'VPIP', ok);
      expect(await valnow(page, 'VPIP'), `入力 "${ok}"`).toBe(want);
    }
    // Esc は取り消し
    await num(page, 'VPIP', '66', 'Escape');
    expect(await valnow(page, 'VPIP')).toBe('7');
    // 欄の外（blur）で確定
    await num(page, 'VPIP', '66', 'blur');
    expect(await valnow(page, 'VPIP')).toBe('66');
    // 未入力のときに欄を開いても、何も入れずに閉じたら未入力のまま
    await page.getByRole('button', { name: 'PFR を数で入力' }).click();
    await page.keyboard.press('Enter');
    await expect(slider(page, 'PFR')).toHaveAttribute('aria-valuetext', '未入力');
    // 入力欄は 16px
    await page.getByRole('button', { name: 'PFR を数で入力' }).click();
    expect(await page.getByRole('textbox', { name: 'PFR（%）' }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    await page.keyboard.press('Escape');
    // Esc が下書きの離脱確認など別の動作にならない（画面が残る）
    await expect(villains(page)).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-02 なぞる操作: 押した所に動く・ドラッグ・端の外に出ても端。縦スクロールを妨げない（touch-action）${v}`, async ({ page }) => {
    await open(page);
    const track = slider(page, 'VPIP');
    await track.scrollIntoViewIfNeeded();
    const b = (await track.boundingBox()) as { x: number; y: number; width: number; height: number };
    const y = b.y + b.height / 2;
    // 50% の位置を押す
    await page.mouse.click(b.x + b.width * 0.5, y);
    const mid = Number(await valnow(page, 'VPIP'));
    expect(mid).toBeGreaterThanOrEqual(48);
    expect(mid).toBeLessThanOrEqual(52);
    // 20% から 80% へドラッグ
    await page.mouse.move(b.x + b.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, y, { steps: 5 });
    await page.mouse.move(b.x + b.width * 0.8, y, { steps: 5 });
    const at80 = Number(await valnow(page, 'VPIP'));
    expect(at80).toBeGreaterThanOrEqual(78);
    expect(at80).toBeLessThanOrEqual(82);
    // 右の外まで引いても 100、左の外まで引いても 0
    await page.mouse.move(b.x + b.width + 80, y + 30, { steps: 4 });
    expect(await valnow(page, 'VPIP')).toBe('100');
    await page.mouse.move(b.x - 80, y + 30, { steps: 4 });
    expect(await valnow(page, 'VPIP')).toBe('0');
    await page.mouse.up();
    // 離したあとはマウスを動かしても変わらない
    await page.mouse.move(b.x + b.width * 0.6, y, { steps: 3 });
    expect(await valnow(page, 'VPIP')).toBe('0');
    // touch-action: pan-y（縦のスクロールは妨げない）
    expect(await track.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
    // 左端・右端をちょうど押す
    await page.mouse.click(b.x + 1, y);
    expect(Number(await valnow(page, 'VPIP'))).toBeLessThanOrEqual(2);
    await page.mouse.click(b.x + b.width - 1, y);
    expect(Number(await valnow(page, 'VPIP'))).toBeGreaterThanOrEqual(98);
    // つまみの位置（ratio）が値と一致
    await num(page, 'VPIP', '25');
    expect(await thumbLeft(track)).toBe('25%');
  });

  test(`T2-02 Slider の操作が席の要約に出る（38/12 の形）と、× で消える${v}`, async ({ page }) => {
    await open(page);
    await num(page, 'VPIP', '38');
    await expect(seatBtn(page, 'BB')).toContainText('VPIP 38');
    await num(page, 'PFR', '12');
    await expect(seatBtn(page, 'BB').locator('.vr-sum')).toHaveText('38/12');
    await page.getByRole('button', { name: 'VPIP をリセット' }).click();
    await expect(seatBtn(page, 'BB').locator('.vr-sum')).toHaveText('PFR 12');
    await page.getByRole('button', { name: 'PFR をリセット' }).click();
    await expect(seatBtn(page, 'BB').locator('.vr-sum')).toHaveText('—');
    // クリアボタンは入力が無ければ無効
    await expect(villains(page).getByRole('button', { name: 'クリア' })).toBeDisabled();
    await num(page, 'VPIP', '10');
    await villains(page).getByRole('button', { name: 'クリア' }).click();
    await expect(slider(page, 'VPIP')).toHaveAttribute('aria-valuetext', '未入力');
  });
}

// ---- T2-03 5 分割のボタン ----

const STEPS = [
  { name: 'Postflop Aggression', labels: ['Very Passive', 'Passive', 'Balanced', 'Aggressive', 'Very Aggressive'], ends: ['Passive', 'Aggressive'], chip: ['Very Passive', 'Passive', 'Balanced', 'Aggressive', 'Very Aggressive'] },
  { name: 'Hero Image', labels: ['Very Tight', 'Tight', 'Standard', 'Loose', 'Very Loose'], ends: ['Tight', 'Loose'], chip: ['Hero Image: Very Tight', 'Hero Image: Tight', 'Hero Image: Standard', 'Hero Image: Loose', 'Hero Image: Very Loose'] },
] as const;

for (const v of ['', ' @sp'] as const) {
  test(`T2-03 5 分割のボタン: 2 つとも 押すと選ぶ・もう一度で未入力・別のボタンで移る。帯は選んだ所まで点灯。左右の端の名前${v}`, async ({ page }) => {
    await open(page);
    for (const st of STEPS) {
      const grp = villains(page).getByRole('group', { name: st.name });
      const btns = grp.getByRole('button');
      await expect(btns).toHaveCount(5);
      const head = grp.locator('xpath=ancestor::div[contains(@class,"rs")][1]');
      await expect(head.locator('.rs-label')).toHaveText('—');
      await expect(head.locator('.rs-ends span')).toHaveText([...st.ends]);
      for (let i = 0; i < 5; i++) {
        await expect(btns.nth(i)).toHaveAccessibleName(st.labels[i] as string);
        await expect(btns.nth(i)).toHaveAttribute('aria-pressed', 'false');
      }
      await expect(head.locator('.seg5-b.lit')).toHaveCount(0);
      // 全部を順に押す
      for (let i = 0; i < 5; i++) {
        await btns.nth(i).click();
        await expect(head.locator('.rs-label'), `${st.name} ${i}`).toHaveText(st.labels[i] as string);
        for (let j = 0; j < 5; j++) await expect(btns.nth(j)).toHaveAttribute('aria-pressed', j === i ? 'true' : 'false');
        await expect(head.locator('.seg5-b.lit')).toHaveCount(i + 1);
      }
      // もう一度押すと未入力
      await btns.nth(4).click();
      await expect(head.locator('.rs-label')).toHaveText('—');
      await expect(head.locator('.seg5-b.lit')).toHaveCount(0);
      for (let j = 0; j < 5; j++) await expect(btns.nth(j)).toHaveAttribute('aria-pressed', 'false');
      // 0 番を押してから別のボタン（2）に移る
      await btns.nth(0).click();
      await btns.nth(2).click();
      await expect(head.locator('.rs-label')).toHaveText(st.labels[2] as string);
      // キーボード（Space・Enter）でも押せて、もう一度で外れる
      await btns.nth(3).focus();
      await page.keyboard.press('Enter');
      await expect(btns.nth(3)).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Space');
      await expect(btns.nth(3)).toHaveAttribute('aria-pressed', 'false');
    }
    expect(await noOverflow(page)).toBe(true);
  });

  test(`T2-03 5 分割のボタンは Postflop Aggression・Hero Image の 2 つだけ（Sample は廃止。V-007）${v}`, async ({ page }) => {
    await open(page);
    const sec = villains(page);
    await expect(sec.locator('.seg5')).toHaveCount(2);
    expect(await sec.locator('.seg5').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Postflop Aggression', 'Hero Image']);
    await expect(sec.getByRole('group', { name: 'Sample' })).toHaveCount(0);
    for (const name of ['First Impression', 'Few Orbits', 'Some History', 'Long', 'HUD Stats']) {
      await expect(sec.getByRole('button', { name, exact: true }), name).toHaveCount(0);
    }
    await expect(sec).not.toContainText('Sample');
  });

  test(`T2-03 5 分割のボタン: 席の要約の 1 行（投稿画面の要約は中央も出す。V-029）${v}`, async ({ page }) => {
    await open(page);
    const sum = seatBtn(page, 'BB').locator('.vr-sum');
    const press = async (name: string, i: number): Promise<void> => {
      await villains(page).getByRole('group', { name }).getByRole('button').nth(i).click();
    };
    await expect(sum).toHaveText('—');
    // 中央（Balanced・Standard）だけでも要約に出す（未入力の「—」と見分ける。V-029）
    await press('Postflop Aggression', 2);
    await expect(sum).toHaveText('Balanced');
    await press('Hero Image', 2);
    await expect(sum).toHaveText('Balanced · Hero Image: Standard');
    await press('Postflop Aggression', 1);
    await expect(sum).toHaveText('Passive · Hero Image: Standard');
    await press('Hero Image', 4);
    await expect(sum).toHaveText('Passive · Hero Image: Very Loose');
    await num(page, 'VPIP', '38');
    await num(page, 'PFR', '12');
    await expect(sum).toHaveText('38/12 · Passive · Hero Image: Very Loose');
    // チップの文言の表（tendencyChips と同じ）を要約で 1 つずつ確かめる
    await villains(page).getByRole('button', { name: 'クリア' }).click();
    for (const st of STEPS) {
      for (let i = 0; i < 5; i++) {
        await press(st.name, i);
        const want = st.chip[i];
        if (want) await expect(sum, `${st.name} ${i}`).toHaveText(want);
        await press(st.name, i); // 外す
      }
    }
    // 全部の Read の要約が長くても、要約は 1 行に収まって、はみ出さない
    await press('Postflop Aggression', 4);
    await press('Hero Image', 4);
    await num(page, 'VPIP', '100');
    await num(page, 'PFR', '100');
    const r = await seatBtn(page, 'BB').boundingBox();
    const vw = page.viewportSize()?.width ?? 0;
    expect((r?.x ?? 0) + (r?.width ?? 0)).toBeLessThanOrEqual(vw + 1);
    expect(await noOverflow(page)).toBe(true);
  });
}
