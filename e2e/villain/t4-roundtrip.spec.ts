/**
 * T4-01（Villain・MTT の情報（P11）の総合テスト。docs/villain-reads-test-plan.md §3 T4）: 一周の流れ。
 * 投稿画面で Villain・MTT を入れて投稿 → 受け取った本文を create-post の handler（単体）に通す → insert_post に渡る値
 * → その値から detailJson で回答画面（未回答）・集計画面を開いて、入れたものがそのまま出る。
 * PC・スマホ、Cash・MTT、2〜6 人、Hero が BTN と BB（Villain が BB・SB か BTN・SB）。バックエンドは偽物（本物にはつながない）。
 */
import { expect, test, type Page } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { createPostHandler } from '../../packages/functions/src/createPost/handler.ts';
import type { InsertPayload } from '../../packages/functions/src/createPost/payload.ts';
import type { Raw } from '../../packages/core/src/post/postFixtures.ts';
import { POST_ID, watchErrors } from '../release/taKit.ts';
import { BET_BTN, dock, isMobile, openNew, pickBoard, pickSpot, S_ACTION, S_PLAYER, S_SETTINGS, setHand, setPlayers, setTitle, step, submit } from '../release/taPost.ts';

const UID = '11111111-1111-4111-8111-111111111111';

/** 本文を handler に通して、insert_post に渡る値を得る（422 なら例外） */
async function throughHandler(body: Record<string, unknown>): Promise<InsertPayload> {
  let got: InsertPayload | undefined;
  const handler = createPostHandler({
    verifyToken: async () => UID,
    insertPost: async (_u, p) => {
      got = p;
      return POST_ID;
    },
    allowedOrigins: ['http://localhost:5173'],
    logError: () => undefined,
  });
  const res = await handler(
    new Request('https://fn.example/', { method: 'POST', headers: { Authorization: 'Bearer x', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) }),
  );
  expect(res.status, await res.clone().text()).toBe(201);
  return got as InsertPayload;
}

/** insert_post が保存した値 → get_post_detail の見本の元（detailFixtures の detailJson が読む形） */
function rawFromPayload(p: InsertPayload): Raw {
  return {
    title: p.title, fmt: p.fmt, sb: p.sb, bb: p.bb, ante: p.ante, rake: p.rake, stacks: p.stacks, hero: p.hero,
    hero_cards: p.hero_cards, known_cards: p.known_cards, board: p.board, actions: p.actions, spot_index: p.spot_index,
    derived: { street: p.street, keys: p.keys, s1_label: p.s1_label, min_to: p.min_to, max_to: p.max_to, pot_base: p.pot_base, effective_stack: p.effective_stack, stop_index: p.stop_index },
    villain_reads: p.villain_reads, mtt: p.mtt,
  };
}

/** n 人。BTN の Ad Kd、BB の Qs Jc。全員 Fold して BTN Open 2.5、（SB Fold）、BB Call。Flop K83: BB Check・BTN Bet・BB Call。Turn 2: BB Check・BTN Bet・BB Fold */
async function playHand(page: Page, n: number): Promise<void> {
  await setPlayers(page, n);
  await setHand(page, 'BTN', 'adkd');
  await setHand(page, 'BB', 'qsjc');
  await step(page, S_ACTION);
  const d = dock(page);
  // 5・6 人は「Fold to BTN」で手前の席をまとめて Fold。4 人は CO だけなので Fold（Fold to には BTN が出ない）
  if (n >= 5) await d.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
  else if (n === 4) await d.getByRole('button', { name: 'Fold' }).click(); // CO
  await d.getByRole('button', { name: /^Open/ }).click();
  if (n >= 3) await d.getByRole('button', { name: 'Fold' }).click(); // SB
  await d.getByRole('button', { name: /^Call/ }).click(); // BB
  await pickBoard(page, ['K♥', '8♦', '3♣']);
  await d.getByRole('button', { name: 'Check' }).click(); // BB
  await d.getByRole('button', { name: BET_BTN }).click(); // BTN
  await d.getByRole('button', { name: /^Call/ }).click(); // BB
  await pickBoard(page, ['2♠']);
  await d.getByRole('button', { name: 'Check' }).click(); // BB
  await d.getByRole('button', { name: BET_BTN }).click(); // BTN
  await d.getByRole('button', { name: 'Fold' }).click(); // BB
  await expect(page.getByText('BTN Pot 獲得')).toBeVisible();
}

const villains = (page: Page) => page.getByRole('region', { name: 'Villain' });
const seatBtn = (page: Page, p: string) => villains(page).getByRole('button', { name: `${p} の Villain の情報` });

async function setNumber(page: Page, what: 'VPIP' | 'PFR', v: string): Promise<void> {
  await page.getByRole('button', { name: `${what} を数で入力` }).click();
  await page.getByRole('textbox', { name: `${what}（%）` }).fill(v);
  await page.keyboard.press('Enter');
}

async function fillTendencies(page: Page): Promise<void> {
  const sec = villains(page);
  await setNumber(page, 'VPIP', '40');
  await setNumber(page, 'PFR', '22');
  await sec.getByRole('group', { name: 'Postflop Aggression' }).getByRole('button', { name: 'Aggressive', exact: true }).click();
  await sec.getByRole('group', { name: 'Hero Image' }).getByRole('button', { name: 'Loose', exact: true }).click();
}

type Case = { name: string; n: number; fmt: 'cash' | 'mtt'; hero: 'BTN' | 'BB' };
const CASES: Case[] = [
  { name: 'Cash 2 人（Hero BTN）', n: 2, fmt: 'cash', hero: 'BTN' },
  { name: 'Cash 3 人（Hero BTN）', n: 3, fmt: 'cash', hero: 'BTN' },
  { name: 'Cash 4 人（Hero BTN）', n: 4, fmt: 'cash', hero: 'BTN' },
  { name: 'Cash 5 人（Hero BTN）', n: 5, fmt: 'cash', hero: 'BTN' },
  { name: 'Cash 6 人（Hero BTN）', n: 6, fmt: 'cash', hero: 'BTN' },
  { name: 'Cash 6 人（Hero BB）', n: 6, fmt: 'cash', hero: 'BB' },
  { name: 'MTT 6 人（Hero BTN）', n: 6, fmt: 'mtt', hero: 'BTN' },
  { name: 'MTT 3 人（Hero BB）', n: 3, fmt: 'mtt', hero: 'BB' },
];

for (const v of ['', ' @sp'] as const) {
  for (const c of CASES) {
    // スマホは代表だけ（6 人 Cash の 2 つ・MTT 3 人・Cash 2 人）
    if (v && !['Cash 6 人（Hero BTN）', 'Cash 6 人（Hero BB）', 'MTT 3 人（Hero BB）', 'Cash 2 人（Hero BTN）'].includes(c.name)) continue;
    test(`T4-01 一周: ${c.name}${v}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      const { be, cp } = await openNew(page);
      const mtt = c.fmt === 'mtt';
      // ヘッダーの Marquee の境目に当たらない短い題（境目の不具合は t4-marquee-repro.spec.ts で別に見る）
      const title = `T4 ${c.n}${c.fmt}${c.hero}`;
      if (mtt) {
        await step(page, S_SETTINGS);
        await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
        await page.getByRole('slider', { name: 'Tournament Type' }).focus();
        await page.keyboard.press('End'); // 100 = Turbo
        await page.getByRole('textbox', { name: 'スポットの順位' }).fill('12');
        await page.getByRole('textbox', { name: '残りの人数' }).fill('58');
        await page.getByRole('textbox', { name: 'エントリー数' }).fill('320');
        await page.getByRole('textbox', { name: 'ITM' }).fill('50');
        await page.getByRole('textbox', { name: /Avg Stack/ }).fill('35.5');
        await page.getByRole('group', { name: 'Prize Structure' }).getByRole('button', { name: /Flat/ }).click();
      }
      await playHand(page, c.n);
      if (c.hero === 'BB') {
        await step(page, S_PLAYER);
        await page.getByRole('radio', { name: 'Hero を BB にする' }).click();
        await pickSpot(page, 'Turn / BB Fold');
      } else {
        await pickSpot(page, 'Turn / BTN Bet');
      }
      const sec = villains(page);
      // 登録できる席（席の順。Preflop の Fold to Steal の SB を含む）: Hero が BTN なら SB・BB、Hero が BB なら BTN・SB
      const expectSeats = c.hero === 'BTN' ? (c.n >= 3 ? ['SB', 'BB'] : ['BB']) : ['BTN', 'SB'].filter((p) => c.n >= 3 || p !== 'SB');
      await expect(sec.getByRole('button', { name: /の Villain の情報$/ })).toHaveText(expectSeats.map((p) => new RegExp(`^${p}`)));

      // ---- 入力 ----
      const vil = c.hero === 'BTN' ? 'BB' : 'BTN';
      await seatBtn(page, vil).click();
      await fillTendencies(page);
      await sec.getByRole('button', { name: '＋ General Read' }).click();
      const g = sec.locator('.vr-read').filter({ hasText: 'General Read 1' });
      let expectGeneral: Record<string, unknown>;
      let expectGeneralLine: string;
      if (c.hero === 'BTN') {
        // BB（Hero の BTN より先に動く）の Raise は Check-Raise
        await g.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Flop', exact: true }).click();
        await g.getByRole('button', { name: 'Check-Raise' }).click();
        await g.getByRole('button', { name: 'Board · Size' }).click();
        await g.getByRole('group', { name: 'High Card' }).getByRole('button', { name: 'A-high' }).click();
        await g.getByRole('group', { name: 'Connectivity' }).getByRole('button', { name: 'Straight possible' }).click();
        const lean = g.getByRole('group', { name: 'Lean' }).getByRole('button', { name: 'Bluff-heavy' });
        await lean.click();
        await lean.click();
        expectGeneral = { scope: 'general', street: 'flop', action: 'raise', texture: { high: 'a', connect: 'straight' }, runout: null, size: null, lean: 'bluff', strong: true };
        expectGeneralLine = 'Flop · A-high · Straight possible · Check-Raise → Bluff-heavy++';
      } else {
        // BTN は Hero の BB より後に動くので Raise は Raise のまま。Turn の Fold to Barrel → Over
        await g.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Turn', exact: true }).click();
        await g.getByRole('button', { name: 'Fold to Barrel' }).click();
        await g.getByRole('group', { name: 'Lean' }).getByRole('button', { name: 'Over', exact: true }).click();
        expectGeneral = { scope: 'general', street: 'turn', action: 'fold_barrel', texture: null, runout: null, size: null, lean: 'over', strong: false };
        expectGeneralLine = 'Turn · Fold to Barrel → Over';
      }
      let expectSpotLine: string | null = null;
      let expectSpot: Record<string, unknown> | null = null;
      if (c.hero === 'BB') {
        // BTN の Spot Read: 最初は判断地点にいちばん近い Action（Turn の Barrel。33% pot の Bet は Small）に Value-heavy++
        const spot = sec.locator('.vr-read').first();
        await expect(spot).toContainText('Spot Read');
        await expect(spot).toContainText('Turn · Barrel (Small)');
        const lean = spot.getByRole('group', { name: 'Lean' }).getByRole('button', { name: 'Value-heavy' });
        await lean.click();
        await lean.click();
        expectSpot = { scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'small', lean: 'value', strong: true };
        expectSpotLine = 'Turn · Barrel (Small) → Value-heavy++';
      }
      let expectSb: Record<string, unknown> | null = null;
      if (c.n >= 3) {
        await seatBtn(page, vil).click(); // 閉じる
        await seatBtn(page, 'SB').click();
        await sec.locator('.vr-read').first().getByRole('button', { name: 'Under', exact: true }).click();
        expectSb = { scope: 'spot', street: 'pf', action: 'fold_steal', texture: null, runout: null, size: null, lean: 'under', strong: false };
      }
      await setTitle(page, title);
      await submit(page);
      await expect.poll(() => cp.calls.length).toBe(1);

      // ---- 本文 → handler → insert_post に渡る値 ----
      const body = cp.calls[0]?.body as Record<string, unknown>;
      const payload = await throughHandler(body);
      const vilExpect = { vpip: 40, pfr: 22, agg: 3, image: 3, reads: [...(expectSpot ? [expectSpot] : []), expectGeneral] };
      expect(payload.villain_reads[vil as 'BB' | 'BTN']).toEqual(vilExpect);
      if (expectSb) expect(payload.villain_reads.SB).toEqual({ reads: [expectSb] });
      expect(Object.keys(payload.villain_reads).sort()).toEqual([vil, ...(expectSb ? ['SB'] : [])].sort());
      const mttExpect = { speed: 100, rank: 12, left: 58, paid: 50, entries: 320, avg: 35.5, prize: 'flat' };
      expect(payload.mtt).toEqual(mtt ? mttExpect : null);
      expect(payload.fmt).toBe(c.fmt);

      // ---- insert_post の値 → 回答画面（未回答）・集計画面 ----
      const raw = rawFromPayload(payload);
      be.detail = detailJson(raw, { viewer: 'unanswered', id: POST_ID });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/s/${POST_ID}/answer`);
      await expect(page.locator('header h1')).toHaveText(title);
      const check = async (): Promise<void> => {
        await page.getByRole('button', { name: `${vil} の Villain の情報` }).click();
        const dlg = page.getByRole('dialog', { name: `Villain · ${vil}` });
        await expect(dlg.locator('.rv-chip')).toHaveText(['VPIP 40', 'PFR 22', 'Aggressive', 'Hero Image: Loose']);
        await expect(dlg.locator('.rv-read')).toHaveText([...(expectSpotLine ? [expectSpotLine] : []), expectGeneralLine]);
        await page.keyboard.press('Escape');
        if (expectSb) {
          await page.getByRole('button', { name: 'SB の Villain の情報' }).click();
          await expect(page.getByRole('dialog', { name: 'Villain · SB' }).locator('.rv-read')).toHaveText(['Preflop · Fold to Steal → Under']);
          await page.keyboard.press('Escape');
        }
        await page.getByRole('button', { name: 'All Villains' }).click();
        await expect(page.getByRole('dialog', { name: 'All Villains' })).toContainText('VPIP 40');
        await page.keyboard.press('Escape');
        if (mtt) {
          await page.getByRole('button', { name: 'MTT', exact: true }).click();
          const m = page.getByRole('dialog', { name: 'MTT' });
          await expect(m).toContainText('12/58 ・ ITM 50 ・ 320 entries');
          await expect(m).toContainText('35.5bb');
          await expect(m).toContainText('Flat');
          expect(await m.locator('.rv-slider .rs-thumb').evaluate((el) => (el as HTMLElement).style.left)).toBe('100%');
          await page.keyboard.press('Escape');
        } else {
          await expect(page.getByRole('button', { name: 'MTT', exact: true })).toBeDisabled();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      };
      await check();
      // 未回答に、判断地点より後の Action・Hero のハンドが出ない（答えの漏れ）: 読み込んだ応答の形
      const hand = (be.detail as { hand: { actions: unknown[]; truncated: boolean; board: string[] } }).hand;
      expect(hand.truncated).toBe(true);
      expect(hand.actions.length).toBe(payload.stop_index);
      expect(hand.board.length).toBe(4);
      expect((be.detail as { secrets: unknown }).secrets).toBeNull();

      // 集計画面でも同じ
      be.detail = detailJson(raw, { viewer: 'answered', id: POST_ID, answerCount: 1 });
      await page.goto(`/s/${POST_ID}/result`);
      await expect(page.locator('header h1')).toHaveText(title);
      // スマホの集計画面は既定が「集計」で、卓・席の印・All Villains・MTT は「Hand History」のタブにある
      if (isMobile(page)) await page.getByRole('tab', { name: 'Hand History' }).click();
      await check();
      expect(isMobile(page) ? 'sp' : 'pc').toBe(v ? 'sp' : 'pc');
      expect(errors).toEqual([]);
    });
  }
}

