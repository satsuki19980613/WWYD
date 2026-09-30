/**
 * T4-04（Villain・MTT の情報（P11）の総合テスト。docs/villain-reads-test-plan.md §3 T4）: 前の版との互換（画面の起動から）。
 *  - 前の版の投稿（情報のキーが無い・{}・null）と、形の違う villain_reads・mtt（旧仕様の Memo の形など）が、回答画面・集計画面で
 *    落ちず「情報なし」になる。一覧の行に has_reads・has_mtt が無くても印が出ず落ちない。
 *  - 前の版の下書き（Memo・conf・0〜100 の agg・旧仕様の MTT）を localStorage に入れて開いても落ちず、捨てるべき値だけが消える。
 *  - 前の版の Preset の鍵（wwyd.readPresets.v1.<uid>）は読まず、書くときに消す。
 */
import { expect, test, type Page } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend, UID } from '../fakeBackend.ts';
import { fakeCreatePost, fakeList, row, watchErrors } from '../release/taKit.ts';
import { pickSpot, playSrpTurn, setTitle, step, submit } from '../release/taPost.ts';

const ID = '00000000-0000-4000-8000-000000000001';

const SHAPES: [string, (h: Record<string, unknown>) => void][] = [
  ['キーが無い（前の版の投稿）', (h) => { delete h.villain_reads; delete h.mtt; }],
  ['{} と null', (h) => { h.villain_reads = {}; h.mtt = null; }],
  ['JSON の null', (h) => { h.villain_reads = null; h.mtt = null; }],
  ['配列・文字列', (h) => { h.villain_reads = []; h.mtt = 'bubble'; }],
  ['旧仕様の Memo の形', (h) => { h.villain_reads = { BTN: { memo: 'fish', vpip: 30 }, SB: { conf: 2, agg: 75 } }; h.mtt = { stage: 'bubble', type: 'pko' }; }],
  ['Hero の席・席でないキー', (h) => { h.villain_reads = { BB: { vpip: 10 }, XX: { vpip: 10 } }; }],
  ['巨大な値', (h) => { h.villain_reads = { BTN: { reads: Array.from({ length: 5000 }, () => ({ scope: 'general' })) } }; h.mtt = { rank: 1e300 }; }],
];

for (const v of ['', ' @sp'] as const) {
  for (const [name, f] of SHAPES) {
    test(`T4-04 回答画面・集計画面: ${name} は落ちず「情報なし」${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const d = detailJson(hs1bb(), { viewer: 'unanswered', id: ID });
      f(d.hand as Record<string, unknown>);
      const be = await fakeBackend(page, JSON.parse(JSON.stringify(d)));
      await page.goto(`/s/${ID}/answer`);
      await expect(page.locator('header h1')).toHaveText('K83r のターンのバレルを受ける');
      await expect(page.getByRole('button', { name: 'All Villains' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'MTT', exact: true })).toBeDisabled();
      await expect(page.locator('.pseat-read')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // 集計画面
      const r = detailJson(hs1bb(), { viewer: 'answered', id: ID, answerCount: 1 });
      f(r.hand as Record<string, unknown>);
      be.detail = JSON.parse(JSON.stringify(r));
      await page.goto(`/s/${ID}/result`);
      await expect(page.locator('header h1')).toHaveText('K83r のターンのバレルを受ける');
      if (v) await page.getByRole('tab', { name: 'Hand History' }).click();
      await expect(page.getByRole('button', { name: 'All Villains' })).toBeDisabled();
      await expect(page.locator('.pseat-read')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test(`T4-04 一覧: has_reads・has_mtt が無い行（前の版の list_posts）は印なしで落ちない${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await fakeBackend(page, null);
    await fakeList(page, [row(1), row(2, { has_reads: null, has_mtt: null }), row(3, { has_reads: 'yes', has_mtt: 1 }), row(4, { has_reads: true })]);
    await page.goto('/');
    const items = page.locator('.spot-card, .spot-row');
    await expect(items).toHaveCount(4);
    // 印: 行 1・2 は無し。行 3 の真偽値でない値は、印が出ても落ちない。行 4 は Reads
    await expect(items.nth(0).locator('.spot-badge')).toHaveCount(0);
    await expect(items.nth(1).locator('.spot-badge')).toHaveCount(0);
    await expect(items.nth(3).locator('.spot-badge')).toHaveText(['Reads']);
    expect(errors).toEqual([]);
  });
}

// ---- 前の版の下書き・Preset ----

const DRAFTS = `wwyd.drafts.v1.${UID}`;

/** SRP（Hero BTN）を最後まで入れて Spot を選び、下書きに保存して一覧へ（保存された下書きの JSON を返す） */
async function saveSrpDraft(page: Page): Promise<{ id: string; savedAt: string; draft: Record<string, any> }[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.goto('/new');
  await playSrpTurn(page);
  await pickSpot(page, 'Turn / BTN Bet 3');
  await setTitle(page, '前の版の下書き');
  if ((page.viewportSize()?.width ?? 1280) < 700) await page.getByRole('link', { name: '一覧へ' }).click();
  else await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
  await page.getByRole('alertdialog', { name: '下書きに保存しますか' }).getByRole('button', { name: '保存する' }).click();
  await expect(page).toHaveURL('/');
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), DRAFTS);
}

for (const v of ['', ' @sp'] as const) {
  test(`T4-04 前の版の下書き（Memo・conf・0〜100 の agg・旧仕様の MTT）を開いても落ちず、捨てるべき値だけが消える${v}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await fakeBackend(page, null);
    const cp = await fakeCreatePost(page);
    const saved = await saveSrpDraft(page);
    expect(saved).toHaveLength(1);
    // 保存された下書きを、前の版の形に書き換える
    const old = saved.map((e) => ({
      ...e,
      draft: {
        ...e.draft,
        reads: {
          BB: { vpip: 30, pfr: 45, memo: '実在のプレイヤー名', conf: 2, agg: 75, image: 80, sample: 9 },
          SB: 'garbage',
          UTG: { vpip: 20 },
          XX: { vpip: 5 },
          CO: { general: [{ street: 'flop', action: 'barrel', lean: 'value' }, 5, null, { street: 'turn', action: 'barrel', lean: 'value', size: 'big', strong: true, texture: { suit: 'mono' }, runout: ['flush', 'bogus'] }] },
        },
        mtt: { stage: 'bubble', type: 'pko', speed: 'fast', rank: 12, prize: 'weird' },
      },
    }));
    await page.evaluate(([k, s]) => localStorage.setItem(k as string, JSON.stringify(s)), [DRAFTS, old]);
    await page.goto('/drafts');
    await page.getByRole('link', { name: '前の版の下書き' }).click();
    await expect(page).toHaveURL('/new');
    // 登録できる席（SB・BB）。BB の vpip 30 は残り、PFR 45（> VPIP）は捨てる。Memo・conf・範囲外の値は無い
    await step(page, /^4\s*Spot$/);
    const sec = page.getByRole('region', { name: 'Villain' });
    await expect(sec.getByRole('button', { name: /の Villain の情報$/ })).toHaveText([/^SB/, /^BB/]);
    await sec.getByRole('button', { name: 'BB の Villain の情報' }).click();
    await expect(page.getByRole('slider', { name: 'VPIP' })).toHaveAttribute('aria-valuenow', '30');
    await expect(page.getByRole('slider', { name: 'PFR' })).toHaveAttribute('aria-valuetext', '未入力');
    await expect(page.getByRole('textbox', { name: /Memo/ })).toHaveCount(0);
    // 範囲外の agg（75）・image（80）は捨てる（未入力）。廃止した Sample（V-007）は欄ごと無い
    for (const g of ['Postflop Aggression', 'Hero Image']) {
      await expect(sec.getByRole('group', { name: g }).getByRole('button', { pressed: true })).toHaveCount(0);
    }
    await expect(sec.getByRole('group', { name: 'Sample' })).toHaveCount(0);
    // 投稿すると、送る本文に旧仕様のキーも捨てた値も入らない
    await submit(page);
    await expect.poll(() => cp.calls.length).toBe(1);
    const body = cp.calls[0]?.body ?? {};
    expect(body.villain_reads).toEqual({ BB: { vpip: 30 } });
    expect(body.mtt).toBeUndefined(); // Cash の下書きに MTT の情報は送らない
    expect(errors).toEqual([]);
  });

  test(`T4-04 前の版の Preset の鍵（v1）は読まず、保存すると消える。新しい鍵は schema 2${v}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await fakeBackend(page, null);
    const OLD = `wwyd.readPresets.v1.${UID}`;
    await page.addInitScript(([k]) => {
      try {
        if (!localStorage.getItem('t4-seeded')) {
          localStorage.setItem(k as string, JSON.stringify([{ id: 'x', name: '旧 Preset', read: { vpip: 30, memo: 'fish', agg: 70 } }]));
          localStorage.setItem('t4-seeded', '1');
        }
      } catch {
        /* 保存できない環境 */
      }
    }, [OLD]);
    await page.goto('/new');
    await playSrpTurn(page);
    await pickSpot(page, 'Turn / BTN Bet 3');
    const sec = page.getByRole('region', { name: 'Villain' });
    await sec.getByRole('button', { name: 'BB の Villain の情報' }).click();
    await sec.getByRole('button', { name: 'Preset' }).click();
    const dlg = page.getByRole('dialog', { name: 'Preset · BB' });
    await expect(dlg.getByRole('listitem')).toHaveCount(0); // 前の版の Preset は出ない
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
    await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('33');
    await page.keyboard.press('Enter');
    await sec.getByRole('button', { name: 'Preset' }).click();
    await dlg.getByPlaceholder('Preset の名前').fill('新');
    await dlg.getByRole('button', { name: '保存' }).click();
    await expect(dlg.getByRole('listitem')).toHaveCount(1);
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('wwyd.readPresets')));
    expect(keys).toEqual([`wwyd.readPresets.${UID}`]); // 旧い鍵は消える
    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), `wwyd.readPresets.${UID}`);
    expect(stored.schema).toBe(2);
    expect(JSON.stringify(stored)).not.toContain('memo');
    expect(errors).toEqual([]);
  });
}
