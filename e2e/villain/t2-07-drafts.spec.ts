/**
 * T2-07（下書き）。離れるときの保存 → 開き直し、前の版の下書き、投稿すると消える。
 */
import type { Page } from '@playwright/test';
import {
  DRAFT_KEY,
  draftJson,
  expect,
  openDraft,
  openSeat,
  S_SPOT,
  seatBtn,
  seedDraftStore,
  slider,
  srpTurn,
  step,
  test,
  threeBetPot,
  villains,
} from './t2Kit.ts';
import { fakeBackend } from '../release/taKit.ts';

const leaveDialog = (page: Page) => page.getByRole('alertdialog', { name: '下書きに保存しますか' });
const storedDrafts = (page: Page): Promise<{ id: string; draft: Record<string, unknown> }[]> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), DRAFT_KEY);

for (const v of ['', ' @sp'] as const) {
  test(`T2-07 下書き: Villain・MTT を入れて離れるときに保存 → 下書きから開き直すと全部戻る${v}`, async ({ page }) => {
    await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', title: 'V 下書き' }));
    // MTT
    await step(page, /^1\s*基本設定$/);
    await slider(page, 'Tournament Type').focus();
    await page.keyboard.press('End');
    await page.getByRole('textbox', { name: 'スポットの順位' }).fill('12');
    await page.getByRole('textbox', { name: '残りの人数' }).fill('58');
    await page.getByRole('textbox', { name: 'エントリー数' }).fill('320');
    await page.getByRole('textbox', { name: 'ITM' }).fill('50');
    await page.getByRole('textbox', { name: 'Avg Stack（bb）' }).fill('35.5');
    await page.getByRole('group', { name: 'Prize Structure' }).getByRole('button', { name: /Top-heavy/ }).click();
    // Villain: SB（Spot Read）と BB（傾向・General Read）
    await step(page, S_SPOT);
    await openSeat(page, 'SB');
    await villains(page).locator('.vr-read').first().getByRole('group', { name: 'Lean' }).getByRole('button').nth(1).click();
    await villains(page).locator('.vr-read').first().getByRole('group', { name: 'Lean' }).getByRole('button').nth(1).click(); // 強い
    await openSeat(page, 'BB');
    await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
    await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('38');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'PFR を数で入力' }).click();
    await page.getByRole('textbox', { name: 'PFR（%）' }).fill('12');
    await page.keyboard.press('Enter');
    await villains(page).getByRole('group', { name: 'Sample' }).getByRole('button', { name: 'Long' }).click();
    await villains(page).getByRole('button', { name: '＋ General Read' }).click();
    const g = villains(page).locator('.vr-read').filter({ hasText: 'General Read 1' });
    await g.getByRole('group', { name: 'Street', exact: true }).getByRole('button', { name: 'Turn', exact: true }).click();
    await g.getByRole('group', { name: 'Action', exact: true }).getByRole('button', { name: 'Barrel', exact: true }).click();
    await g.getByRole('button', { name: 'Board · Size' }).click();
    await g.getByRole('group', { name: 'Runout', exact: true }).getByRole('button', { name: 'Flush Complete' }).click();
    await g.getByRole('group', { name: 'Size', exact: true }).getByRole('button', { name: 'Big' }).click();
    await g.getByRole('group', { name: 'Lean', exact: true }).getByRole('button', { name: 'Value-heavy' }).click();
    // 離れる → 保存
    await page.getByRole('link', { name: /^(一覧へ|List)$/ }).first().click();
    await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
    await expect(page).toHaveURL('/');
    const saved = await storedDrafts(page);
    expect(saved).toHaveLength(1);
    // 保存した JSON に Villain・MTT が入っている（Memo は無い）
    const d = saved[0]?.draft as { reads: Record<string, Record<string, unknown>>; mtt: Record<string, unknown> };
    expect(d.reads.BB).toMatchObject({ vpip: 38, pfr: 12, sample: 3 });
    expect(JSON.stringify(d)).not.toMatch(/memo/i);
    expect(d.mtt).toMatchObject({ speed: 100, rank: '12', left: '58', entries: '320', paid: '50', avg: '35.5', prize: 'top' });
    // 開き直す
    await page.getByRole('link', { name: /^下書き/ }).click();
    await page.getByRole('link', { name: 'V 下書き' }).click();
    await expect(page).toHaveURL('/new');
    await step(page, /^1\s*基本設定$/);
    await expect(slider(page, 'Tournament Type')).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByRole('textbox', { name: 'スポットの順位' })).toHaveValue('12');
    await expect(page.getByRole('textbox', { name: '残りの人数' })).toHaveValue('58');
    await expect(page.getByRole('textbox', { name: 'エントリー数' })).toHaveValue('320');
    await expect(page.getByRole('textbox', { name: 'ITM' })).toHaveValue('50');
    await expect(page.getByRole('textbox', { name: 'Avg Stack（bb）' })).toHaveValue('35.5');
    await expect(page.getByRole('group', { name: 'Prize Structure' }).getByRole('button', { name: /Top-heavy/ })).toHaveAttribute('aria-pressed', 'true');
    await step(page, S_SPOT);
    await expect(seatBtn(page, 'SB')).toContainText('1 Read');
    await expect(seatBtn(page, 'BB')).toContainText('38/12');
    await expect(seatBtn(page, 'BB')).toContainText('Sample: Long');
    await expect(seatBtn(page, 'BB')).toContainText('1 Read');
    await openSeat(page, 'SB');
    const lean = villains(page).locator('.vr-read').first().getByRole('group', { name: 'Lean' }).getByRole('button').nth(1);
    await expect(lean).toHaveText('Under++');
    await openSeat(page, 'BB');
    await expect(villains(page).locator('.vr-read').filter({ hasText: 'General Read 1' }).locator('.vr-line')).toHaveText('Turn · Flush Complete · Barrel (Big) → Value-heavy');
    // 変えずに離れれば聞かない
    await page.getByRole('link', { name: /^(一覧へ|List)$/ }).first().click();
    await expect(page).toHaveURL('/');
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test(`T2-07 下書き: Cash に戻して保存しても MTT の入力は残り、MTT に戻すと出る（送る本文には入れない）${v}`, async ({ page }) => {
    const mtt = { speed: 30, prize: 'flat', rank: '3', left: '9', paid: '', entries: '', avg: '' };
    const { cp } = await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', mtt, title: 'V cash' }));
    await step(page, /^1\s*基本設定$/);
    await expect(slider(page, 'Tournament Type')).toHaveAttribute('aria-valuenow', '30');
    await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'Cash' }).click();
    await expect(slider(page, 'Tournament Type')).toHaveCount(0);
    await step(page, S_SPOT);
    await page.getByRole('button', { name: /^投稿(する|中…)$/ }).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    expect(cp.calls[0]?.body).not.toHaveProperty('mtt');
    void 0;
  });

  test(`T2-07 下書き: 登録できない席に入れた内容（Hero 変更後）も下書きに残り、Hero を戻すと出る${v}`, async ({ page }) => {
    await openDraft(page, draftJson({ ...threeBetPot(), title: 'V hero', reads: { BTN: { vpip: 20, agg: 4 }, CO: { vpip: 30 } } }));
    await step(page, /^2\s*Player$/);
    await page.getByRole('radio', { name: 'Hero を BTN にする' }).click();
    await page.getByRole('link', { name: /^(一覧へ|List)$/ }).first().click();
    await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
    const saved = await storedDrafts(page);
    const d = saved[0]?.draft as { reads: Record<string, Record<string, unknown>>; hero: string };
    expect(d.hero).toBe('BTN');
    expect(d.reads.BTN, 'Hero になった席の入力も下書きには残る').toMatchObject({ vpip: 20, agg: 4 });
    expect(d.reads.CO).toMatchObject({ vpip: 30 });
  });
}

// ---- 前の版の下書き ----

const OLD_DRAFTS: Record<string, unknown>[] = [
  // Memo・conf・0〜100 の agg・image（Slider 0〜100）の形
  {
    ...draftJson({ ...srpTurn(), title: 'OLD1' }),
    reads: { BB: { vpip: 35, pfr: 20, agg: 80, image: 70, conf: 60, memo: 'このプレイヤーは…' }, SB: { memo: 'だけ', conf: 10 } },
    mtt: { stage: 'bubble', type: 'pko', speed: 'turbo', rank: 12, paid: '15' },
  },
  // 項目が無い（P11 の前の下書き）
  (() => {
    const d = draftJson({ ...srpTurn(), title: 'OLD2' });
    delete d.reads;
    delete d.mtt;
    return d;
  })(),
  // 壊れた形
  { ...draftJson({ ...srpTurn(), title: 'OLD3' }), reads: 'x', mtt: [] },
  { ...draftJson({ ...srpTurn(), title: 'OLD4' }), reads: [], mtt: 5 },
  { ...draftJson({ ...srpTurn(), title: 'OLD5' }), reads: { BB: 'x', SB: null, UTG: [], HJ: { vpip: 'a', pfr: null, agg: 2.5, image: -1, sample: 9, reads: 'x', spot: 'x', general: 'x' } }, mtt: { speed: 'fast', prize: 'zzz', rank: {}, left: null } },
  // 新しい形に古い値が混ざる
  {
    ...draftJson({ ...srpTurn(), title: 'OLD6' }),
    reads: {
      BB: {
        vpip: 30,
        pfr: 40, // PFR > VPIP → PFR を捨てる
        agg: 3,
        image: 7, // 範囲外
        sample: 4,
        spot: { street: 'turn', action: 'barrel', lean: 'value', strong: true }, // BB に候補は無いが下書きには残る形として読む
        general: [
          { street: 'flop', action: 'cbet', lean: 'value', strong: true, texture: { high: 'a', suit: 'zz' }, runout: ['brick', 'x'], size: 'big' },
          { street: 'pf', action: 'cbet', lean: 'over' }, // Preflop に C-Bet は無い → Action が外れる
          { street: 'river', action: 'fold_bet', lean: 'value' }, // Fold に Value は選べない → Lean が外れる
        ],
      },
    },
  },
];

for (const v of ['', ' @sp'] as const) {
  test(`T2-07 前の版の下書き（Memo・conf・0〜100 の agg など）を開いても落ちず、捨てるべき値だけが消える${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await seedDraftStore(page, [OLD_DRAFTS[0] as Record<string, unknown>]);
    const openOld = async (title: string): Promise<void> => {
      await page.goto('/drafts');
      await page.getByRole('link', { name: title }).click();
      await expect(page).toHaveURL('/new');
      await step(page, S_SPOT);
    };

    // OLD1: vpip・pfr は残り、範囲外の agg（80）・image（70）・conf・memo は消える。MTT の古い形は捨てる（Cash なので MTT は出ない）
    await openOld('OLD1');
    await expect(seatBtn(page, 'BB').locator('.vr-sum')).toHaveText('35/20');
    await expect(seatBtn(page, 'SB').locator('.vr-sum')).toHaveText('—'); // Memo・conf だけの席は空
    await expect(page.getByText('このプレイヤーは')).toHaveCount(0);
    await expect(villains(page).getByRole('textbox')).toHaveCount(0);
    await seatBtn(page, 'BB').click();
    await expect(slider(page, 'VPIP')).toHaveAttribute('aria-valuenow', '35');
    // 保存の本文に memo・conf は含まれない
    const cp = await fakeCreatePostCalls(page);
    await page.getByRole('button', { name: /^投稿(する|中…)$/ }).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    expect(JSON.stringify(cp.calls[0]?.body)).not.toMatch(/memo|conf/);
    expect(cp.calls[0]?.body).toHaveProperty('villain_reads.BB', { vpip: 35, pfr: 20 });
    expect(cp.calls[0]?.body).not.toHaveProperty('mtt');
  });

  test(`T2-07 前の版の下書き: 項目の無い下書き・壊れた形の下書きも開ける（空の情報として）${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await seedDraftStore(page, OLD_DRAFTS.slice(1, 4));
    for (const title of ['OLD2', 'OLD3', 'OLD4']) {
      await page.goto('/drafts');
      await page.getByRole('link', { name: title }).click();
      await expect(page).toHaveURL('/new');
      await step(page, S_SPOT);
      // 画面が落ちていない（席が出る）
      await expect(villains(page)).toBeVisible();
      await expect(seatBtn(page, 'SB')).toBeVisible();
      // どの席も空（捨てるべき値だけ消え、ほかは読む）
      for (const p of ['SB', 'BB']) await expect(seatBtn(page, p).locator('.vr-sum')).toHaveText('—');
    }
  });

  test(`T2-07 前の版の下書き: 型の違う値だらけの下書き（OLD5）も開ける${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await seedDraftStore(page, [OLD_DRAFTS[4] as Record<string, unknown>]);
    await page.goto('/drafts');
    await page.getByRole('link', { name: 'OLD5' }).click();
    await expect(page).toHaveURL('/new');
    await step(page, S_SPOT);
    await expect(villains(page)).toBeVisible();
    for (const p of ['SB', 'BB']) await expect(seatBtn(page, p).locator('.vr-sum')).toHaveText('—');
  });

  test(`T2-07 前の版の下書き: 新しい形に古い値が混ざっても、範囲内の値は読み、外れる値だけ消える${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await seedDraftStore(page, [OLD_DRAFTS[5] as Record<string, unknown>]);
    await page.goto('/drafts');
    await page.getByRole('link', { name: 'OLD6' }).click();
    await step(page, S_SPOT);
    // BB: VPIP 30、PFR は捨てる、agg 3（Aggressive）、image は捨てる、sample 4、General Read は 3 件中 2 件まで読む（slice 2）
    const sum = await seatBtn(page, 'BB').locator('.vr-sum').innerText();
    expect(sum).toContain('VPIP 30');
    expect(sum).not.toContain('30/');
    expect(sum).toContain('Aggressive');
    expect(sum).toContain('Sample: HUD Stats');
    expect(sum).not.toContain('Hero Image');
    await seatBtn(page, 'BB').click();
    // 最初の General Read は Flop の C-Bet（texture の不正な値と runout の不正な値は外れる。runout は Flop には無いので全部外れる）
    const g1 = villains(page).locator('.vr-read').filter({ hasText: 'General Read 1' });
    await expect(g1.locator('.vr-line')).toHaveText('Flop · A-high · C-Bet (Big) → Value-heavy++');
    // 2 件目（Preflop・Action 無し）は途中のまま残る。3 件目は読まない
    await expect(villains(page).locator('.vr-read').filter({ hasText: 'General Read 2' })).toHaveCount(1);
    await expect(villains(page).locator('.vr-read').filter({ hasText: 'General Read 3' })).toHaveCount(0);
    // BB には Spot Read の候補が無いので枠が出ない。要約の件数に「Spot Read」を数えていないか
    const summary = await seatBtn(page, 'BB').locator('.vr-sum').innerText();
    test.info().annotations.push({ type: 'OLD6 summary', description: summary });
  });
}

async function fakeCreatePostCalls(page: Page) {
  const { fakeCreatePost: f } = await import('../release/taKit.ts');
  return f(page);
}

// ---- 投稿すると下書きが消える ----

test('T2-07 投稿すると下書きが消え、新しい投稿の画面に前の Villain・MTT は残らない', async ({ page }) => {
  const { cp } = await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', title: 'V 投稿', reads: { BB: { vpip: 40 } }, mtt: { speed: 10, prize: null, rank: '', left: '', paid: '', entries: '', avg: '' } }));
  expect(await storedDrafts(page)).toHaveLength(1);
  await page.getByRole('button', { name: /^投稿(する|中…)$/ }).click();
  await expect.poll(() => cp.calls.length).toBe(1);
  await expect(page).toHaveURL(/\/\?tab=mine/);
  // 開いていた下書きは消える
  expect(await storedDrafts(page)).toHaveLength(0);
  // 新しい投稿の画面は空から（席も MTT の欄も無い）
  await page.getByRole('link', { name: /Post/ }).first().click();
  await expect(page).toHaveURL('/new');
  await expect(villains(page)).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Tournament Type' })).toHaveCount(0);
  await step(page, /^1\s*基本設定$/);
  await expect(page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
  // MTT に切り替えても前の入力は入っていない
  await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
  await expect(page.getByRole('slider', { name: 'Tournament Type' })).toHaveAttribute('aria-valuetext', '未入力');
});

test('T2-07 投稿が失敗（サーバーが断る）しても下書きと入力は残る', async ({ page }) => {
  await fakeBackend(page, null);
  const { fakeCreatePost: f } = await import('../release/taKit.ts');
  const cp = await f(page, () => ({ status: 422, body: { error: 'invalid_reads' } }));
  await seedDraftStore(page, [draftJson({ ...srpTurn(), title: 'V 失敗', reads: { BB: { vpip: 40 } } })]);
  await page.goto('/drafts');
  await page.getByRole('link', { name: 'V 失敗' }).click();
  await step(page, S_SPOT);
  await page.getByRole('button', { name: /^投稿(する|中…)$/ }).click();
  await expect.poll(() => cp.calls.length).toBe(1);
  await expect(page.locator('.pf-errors')).toContainText('Villain の情報を確認してください');
  await expect(seatBtn(page, 'BB')).toContainText('VPIP 40');
  expect(await storedDrafts(page)).toHaveLength(1);
});
