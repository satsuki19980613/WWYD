/**
 * T-A（探索）: 2〜6 人のそれぞれで、Limp / Call と Check だけで River まで進めて Spot（最後の Hero の Check）を選んで投稿する。
 * 席の順（ヘッズアップは BTN = SB が Preflop の最初、Flop 以降は BB が最初）・Stack の欄・送る本文（席の数・Board・spot_index）を確かめる。
 */
import { expect, test, type Page } from '@playwright/test';
import { dock, isMobile, openNew, setHand, setPlayers, setTitle, step, S_ACTION, submit, table } from './taPost.ts';

const VARIANTS = ['', ' @sp'] as const;

/** ボードのピッカーが開いていたら、まだ使っていない札を要る枚数だけ押す */
async function fillBoard(page: Page): Promise<void> {
  for (let guard = 0; guard < 6; guard++) {
    const picker = page.getByRole('dialog').filter({ has: page.getByRole('grid', { name: 'Card' }) });
    if (!(await picker.isVisible().catch(() => false))) return;
    await picker.getByRole('gridcell').and(page.locator(':not([disabled])')).first().click();
    await page.waitForTimeout(50);
  }
}

for (const v of VARIANTS) {
  for (const n of [2, 3, 4, 5, 6]) {
    test(`${n} 人: Limp / Call と Check だけで River まで入れ、Spot を選んで投稿できる（席の数・Board・spot_index）${v}`, async ({ page }) => {
      const { cp } = await openNew(page);
      await setPlayers(page, n);
      await setHand(page, 'BTN', 'adkd');
      await step(page, S_ACTION);
      const d = dock(page);
      // Preflop: 全員 Limp / Call、BB は Check
      let acted = 0;
      for (let i = 0; i < 60; i++) {
        await fillBoard(page);
        if (await page.getByText(/Showdown|Pot 獲得/).isVisible().catch(() => false)) break;
        const check = d.getByRole('button', { name: 'Check', exact: true });
        const call = d.getByRole('button', { name: /^(Call|Limp)/ });
        if (await check.isVisible().catch(() => false)) await check.click();
        else if (await call.isVisible().catch(() => false)) await call.click();
        else await page.waitForTimeout(80);
        acted++;
      }
      await expect(page.getByText('Showdown')).toBeVisible();
      // 人数ぶんの席が卓にある
      await expect(table(page).locator('.pseat')).toHaveCount(n);
      // Preflop の Action の数 = n（全員が 1 回。SB は Call、BB は Check）。Flop・Turn・River は n × 3
      const stepsToSpot = isMobile(page) ? 0 : 0;
      void stepsToSpot;
      await step(page, /^4\s*Spot$/);
      const radios = page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio');
      // Hero（BTN）の Flop・Turn・River の Check が候補
      await expect(radios).toHaveText(['Flop / BTN Check', 'Turn / BTN Check', 'River / BTN Check']);
      await radios.last().click();
      await setTitle(page, `${n} 人の Check-down`);
      await submit(page);
      await expect(page).toHaveURL('/?tab=mine');
      const b = cp.calls[0]!.body as { stacks: Record<string, number>; board: string[]; actions: { street: string; pos: string }[]; spot_index: number; hero: string };
      expect(Object.keys(b.stacks)).toHaveLength(n);
      expect(b.board).toHaveLength(5);
      expect(b.actions).toHaveLength(n * 4);
      expect(b.actions[b.spot_index]).toMatchObject({ street: 'river', pos: 'BTN', type: 'check' });
      expect(b.actions.filter((a) => a.street === 'pf')).toHaveLength(n);
      // Flop 以降の最初の席: ヘッズアップは BB（BTN = SB は最後）、3 人以上は SB
      const first = b.actions.find((a) => a.street === 'flop');
      expect(first?.pos).toBe(n === 2 ? 'BB' : 'SB');
      expect(acted).toBeGreaterThan(0);
    });
  }
}
