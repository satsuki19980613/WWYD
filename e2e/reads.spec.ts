/**
 * Villain・MTT の情報（詳細仕様 18 章）の E2E。バックエンドは偽物（fakeBackend.ts）。
 * - 回答画面: ヘッダーの投稿のタイトル（流れる・止まる・動きを減らす設定）、席の印と席のモーダル、All Villains、MTT、情報なしで押せない
 * - 投稿画面: 席ごとの折りたたみ、Slider の未入力・リセット・PFR ≦ VPIP、数の直接入力、Memo の 30 文字、Preset、MTT の欄、送る本文
 * - 一覧: Reads・MTT の印
 */
import { expect, test, type Page } from '@playwright/test';
import { detailJson } from '../packages/app/src/answer/detailFixtures.ts';
import { hs1bb, type Raw } from '../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from './fakeBackend.ts';
import { fakeList, row } from './release/taKit.ts';
import { openNew, playSrpTurn, pickSpot, S_PLAYER, S_SETTINGS, setTitle, step, submit } from './release/taPost.ts';

const ID = '00000000-0000-4000-8000-000000000001';

// H-S1（Hero は BB）。Preflop: UTG・HJ・CO・SB が Fold、BTN が Raise → ポットに残るのは BTN
const READS = {
  BTN: { vpip: 32, pfr: 25, agg: 72, conf: 4, image: 3, memo: '3bet 多め' },
  UTG: { vpip: 12 },
};
const MTT = { speed: 80, rank: 12, left: 58, paid: 50, entries: 320, avg: 35, prize: 'top' };

function detail(over: Partial<Raw> = {}): Record<string, unknown> {
  return detailJson({ ...hs1bb(), ...over }, { viewer: 'unanswered', id: ID });
}

async function openAnswer(page: Page, d: Record<string, unknown>, motion: 'reduce' | 'no-preference' = 'reduce'): Promise<void> {
  await page.emulateMedia({ reducedMotion: motion });
  await fakeBackend(page, d);
  await page.goto(`/s/${ID}/answer`);
}

for (const v of ['', ' @sp'] as const) {
  test(`回答画面: 投稿のタイトルはヘッダー（本文に出さない）。画面名は出さない${v}`, async ({ page }) => {
    await openAnswer(page, detail());
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(page.locator('header h1')).toHaveText('K83r のターンのバレルを受ける');
    await expect(page.locator('main h1')).toHaveCount(0);
    await expect(page.locator('header').getByText('回答', { exact: true })).toBeHidden();
  });

  test(`回答画面: 情報が無ければ All Villains・MTT は押せず、席に印が無い${v}`, async ({ page }) => {
    await openAnswer(page, detail());
    await expect(page.getByRole('button', { name: 'All Villains' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'MTT', exact: true })).toBeDisabled();
    await expect(page.locator('.pseat-read')).toHaveCount(0);
  });

  test(`回答画面: 席の印を押すとその席、All Villains は参加した席を上に、MTT は 1 行の人数${v}`, async ({ page }) => {
    await openAnswer(page, detail({ fmt: 'mtt', rake: null, villain_reads: READS, mtt: MTT }));
    // 印は情報のある席だけ（BTN・UTG）
    await expect(page.locator('.pseat-read')).toHaveCount(2);
    await page.getByRole('button', { name: 'BTN の Villain の情報' }).click();
    const seat = page.getByRole('dialog', { name: 'Villain · BTN' });
    await expect(seat).toContainText('VPIP');
    await expect(seat).toContainText('Loose');
    await expect(seat).toContainText('Very Aggressive');
    await expect(seat).toContainText('HUD Stats');
    await expect(seat).toContainText('3bet 多め');
    // 数は出さない（段階のラベルとバーだけ）
    await expect(seat).not.toContainText('32');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'All Villains' }).click();
    const all = page.getByRole('dialog', { name: 'All Villains' });
    // 参加した席（BTN）が上。Preflop で Fold した席は折りたたむ
    await expect(all.locator('.rv-all > .rv-seats .rv-pos')).toHaveText(['BTN']);
    const folded = all.locator('details.rv-folded');
    await expect(folded).not.toHaveAttribute('open', '');
    await expect(folded.locator('.rv-fcount')).toHaveText('4');
    await folded.locator('summary').click();
    await expect(folded.locator('.rv-pos')).toHaveText(['UTG', 'HJ', 'CO', 'SB']);
    await expect(folded.locator('.rv-seat').first()).toContainText('Very Tight');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'MTT', exact: true }).click();
    const mtt = page.getByRole('dialog', { name: 'MTT' });
    // Tournament Type
    await expect(mtt).toContainText('Tournament Type');
    await expect(mtt).toContainText('Turbo');
    // 表示も Slider そのもの（段階のラベルは無く、左右に Deep・Turbo。80 の位置）
    await expect(mtt.locator('.rv-slider .rs-ends span')).toHaveText(['Deep', 'Turbo']);
    expect(await mtt.locator('.rv-slider .rs-thumb').evaluate((el) => (el as HTMLElement).style.left)).toBe('80%');
    await expect(mtt).toContainText('順位 / 残りの人数');
    await expect(mtt).toContainText('12/58 ・ ITM 50 ・ 320 entries');
    await expect(mtt).toContainText('35bb');
    await expect(mtt).toContainText('Top-heavy');
    await expect(mtt).toContainText('1st ≥ 25%');
  });
}

test('回答画面（スマホ）: History・All Villains・MTT は卓の上の 1 行で、卓と重ならない @sp', async ({ page }) => {
  await openAnswer(page, detail({ villain_reads: READS }));
  const btns = page.locator('.rp-info');
  await expect(btns.getByRole('button')).toHaveText(['History', 'All Villains', 'MTT']);
  const b = await btns.boundingBox();
  const t = await page.locator('.ptable').boundingBox();
  if (!b || !t) throw new Error('見えない');
  expect(b.y + b.height).toBeLessThanOrEqual(t.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('ヘッダーのタイトル: 収まれば止め、収まらなければ流し、動きを減らす設定では省略して押すと全文 @sp', async ({ page }) => {
  // 短い: 止めたまま
  await openAnswer(page, detail({ title: '短い題' }), 'no-preference');
  await expect(page.locator('.hdr-post .mq')).not.toHaveClass(/mq-run|mq-clip/);
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // 長い: 流す（アニメーションが付いている）
  const long = 'とても長いタイトルがヘッダーに収まらないときは横に流れて全文を見せる';
  await openAnswer(page, detail({ title: long }), 'no-preference');
  const run = page.locator('.hdr-post .mq-run .mq-inner');
  await expect(run).toHaveText(long);
  expect(await run.evaluate((el) => getComputedStyle(el).animationName)).toBe('mq-scroll');
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // 動きを減らす設定: 流さず省略、押すと全文を折り返す
  await openAnswer(page, detail({ title: long }), 'reduce');
  const toggle = page.locator('.hdr-post').getByRole('button');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await page.locator('.hdr-post .mq-inner').evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const box = await page.locator('.hdr-post').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(30); // 折り返して 2 行以上
});

test('集計画面でも Villain の情報を見られ、タイトルはヘッダー', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fakeBackend(page, detailJson({ ...hs1bb(), villain_reads: READS }, { viewer: 'answered', id: ID, answerCount: 1 }));
  await page.goto(`/s/${ID}/result`);
  await expect(page.locator('header h1')).toHaveText('K83r のターンのバレルを受ける');
  await expect(page.getByRole('button', { name: 'All Villains' })).toBeEnabled();
  await page.getByRole('button', { name: 'UTG の Villain の情報' }).click();
  await expect(page.getByRole('dialog', { name: 'Villain · UTG' })).toContainText('Very Tight');
});

test('前の版の投稿（情報のキーが無い）も表示できる', async ({ page }) => {
  const d = detail();
  const hand = d.hand as Record<string, unknown>;
  delete hand.villain_reads;
  delete hand.mtt;
  await openAnswer(page, d);
  await expect(page.locator('header h1')).toHaveText('K83r のターンのバレルを受ける');
  await expect(page.getByRole('button', { name: 'All Villains' })).toBeDisabled();
});

// ---- 投稿画面 ----

const villains = (page: Page) => page.getByRole('region', { name: 'Villain' });
const slider = (page: Page, name: string) => page.getByRole('slider', { name, exact: true });

for (const v of ['', ' @sp'] as const) {
  test(`投稿: Villain は Hero 以外の席ごとに 1 行。開くと Slider は未入力、触ると入力、× で未入力に戻る${v}`, async ({ page }) => {
    await openNew(page);
    await step(page, S_PLAYER);
    await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '3', exact: true }).click();
    const sec = villains(page);
    // 3 人（BTN・SB・BB）で Hero は BTN → SB・BB の 2 行
    await expect(sec.getByRole('button', { name: /の Villain の情報$/ })).toHaveCount(2);
    await sec.getByRole('button', { name: 'SB の Villain の情報' }).click();
    const vpip = slider(page, 'VPIP');
    await expect(vpip).toHaveAttribute('aria-valuetext', '未入力');
    await vpip.focus();
    await page.keyboard.press('ArrowRight'); // 未入力の最初の矢印は真ん中
    await expect(vpip).toHaveAttribute('aria-valuetext', 'Very Loose 50%');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await expect(vpip).toHaveAttribute('aria-valuetext', 'Loose 30%');
    await page.getByRole('button', { name: 'VPIP をリセット' }).click();
    await expect(vpip).toHaveAttribute('aria-valuetext', '未入力');
    // 段階だけの項目（Read Confidence）は押した位置の段階
    const conf = slider(page, 'Read Confidence');
    await conf.scrollIntoViewIfNeeded();
    const box = await conf.boundingBox();
    if (!box) throw new Error('見えない');
    await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
    await expect(conf).toHaveAttribute('aria-valuetext', 'HUD Stats');
    // 閉じると 1 行の要約
    await sec.getByRole('button', { name: 'SB の Villain の情報' }).click();
    await expect(slider(page, 'VPIP')).toHaveCount(0);
  });
}

test('投稿: PFR を VPIP より上げると VPIP も上がり、VPIP を PFR より下げると PFR も下がる。数を直接入れられる', async ({ page }) => {
  await openNew(page);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'BB の Villain の情報' }).click();
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('20');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'PFR を数で入力' }).click();
  await page.getByRole('textbox', { name: 'PFR（%）' }).fill('28');
  await page.keyboard.press('Enter');
  await expect(slider(page, 'VPIP')).toHaveAttribute('aria-valuenow', '28');
  await expect(slider(page, 'PFR')).toHaveAttribute('aria-valuenow', '28');
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('15');
  await page.keyboard.press('Enter');
  await expect(slider(page, 'PFR')).toHaveAttribute('aria-valuenow', '15');
  // 範囲の外は変えない
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('150');
  await page.keyboard.press('Enter');
  await expect(slider(page, 'VPIP')).toHaveAttribute('aria-valuenow', '15');
  // iPhone で拡大されない大きさ（16px）
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  expect(await page.getByRole('textbox', { name: 'VPIP（%）' }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
});

test('投稿: Memo は 30 文字まで、プレースホルダーで個人情報を書かないことを示す', async ({ page }) => {
  await openNew(page);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'BB の Villain の情報' }).click();
  const memo = page.getByRole('textbox', { name: 'BB の Memo' });
  await expect(memo).toHaveAttribute('placeholder', '個人を特定できる情報は書かない');
  await memo.fill('あ'.repeat(35));
  await expect(memo).toHaveValue('あ'.repeat(30));
  await expect(page.locator('.vr-count')).toHaveText('30/30');
});

test('投稿: Preset に保存・呼び出し・削除（端末だけ）', async ({ page }) => {
  await openNew(page);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'BB の Villain の情報' }).click();
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('45');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Preset' }).click();
  const dlg = page.getByRole('dialog', { name: 'Preset · BB' });
  await dlg.getByPlaceholder('Preset の名前').fill('Fish');
  await dlg.getByRole('button', { name: '保存' }).click();
  await expect(dlg.getByRole('listitem')).toHaveCount(1);
  await expect(dlg.getByRole('listitem')).toContainText('Very Loose');
  await page.keyboard.press('Escape');
  // localStorage に保存（サーバーには送らない）
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('wwyd.readPresets.v1.')))).toBe(true);

  // 別の席で呼び出す
  await page.getByRole('button', { name: 'BB の Villain の情報' }).click(); // 閉じる
  await page.getByRole('button', { name: 'SB の Villain の情報' }).click();
  await page.getByRole('button', { name: 'Preset' }).click();
  await page.getByRole('button', { name: 'Fish を呼び出す' }).click();
  await expect(slider(page, 'VPIP')).toHaveAttribute('aria-valuenow', '45');
  // 削除
  await page.getByRole('button', { name: 'Preset' }).click();
  await page.getByRole('button', { name: 'Fish を削除' }).click();
  await expect(page.getByRole('dialog', { name: 'Preset · SB' }).getByRole('listitem')).toHaveCount(0);
});

test('投稿: MTT の欄は Game 形式が MTT のときだけ。Tournament Type は左端 Deep・右端 Turbo の段階の無い Slider、数の欄は日本語の 5 つ @sp', async ({ page }) => {
  await openNew(page);
  await step(page, S_SETTINGS);
  const speed = page.getByRole('slider', { name: 'Tournament Type' });
  await expect(speed).toHaveCount(0);
  await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
  // Stage と Regular / PKO / Satellite の選択は無い
  await expect(page.getByRole('group', { name: 'Stage' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'PKO' })).toHaveCount(0);
  // Tournament Type: 未入力 → 右端で Turbo → 左端で Deep → × で未入力
  await expect(speed).toHaveAttribute('aria-valuetext', '未入力');
  await speed.focus();
  await page.keyboard.press('End');
  await expect(speed).toHaveAttribute('aria-valuetext', '100 / 100（Deep 0 〜 Turbo 100）');
  await page.keyboard.press('Home');
  await expect(speed).toHaveAttribute('aria-valuetext', '0 / 100（Deep 0 〜 Turbo 100）');
  // 段階のラベル・目盛りは無く、溝の下の左右に Deep と Turbo
  await expect(page.locator('.rs.ends .rs-tick')).toHaveCount(0);
  await expect(page.locator('.rs.ends .rs-ends span')).toHaveText(['Deep', 'Turbo']);
  await page.getByRole('button', { name: 'Tournament Type をリセット' }).click();
  await expect(speed).toHaveAttribute('aria-valuetext', '未入力');
  // 数の欄は 5 つ（日本語の名前）
  const pf = page.locator('.mtt-fields');
  await expect(pf.locator('label')).toHaveText(['スポットの順位', '残りの人数', 'エントリー数', 'ITM', 'Avg Stack（bb）']);
  await expect(page.getByRole('group', { name: 'Prize Structure' })).toContainText('1st 15–25%');
  // 読めない値は赤い枠
  await page.getByRole('textbox', { name: 'スポットの順位' }).fill('1.5');
  await expect(page.getByRole('textbox', { name: 'スポットの順位' })).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('投稿: 送る本文に Villain（Hero 以外）と MTT の情報が入り、情報なしならキーを送らない', async ({ page }) => {
  const { cp } = await openNew(page);
  await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
  await page.getByRole('slider', { name: 'Tournament Type' }).focus();
  await page.keyboard.press('ArrowRight'); // 未入力の最初の矢印は真ん中（50）
  await page.getByRole('textbox', { name: 'スポットの順位' }).fill('12');
  await page.getByRole('textbox', { name: '残りの人数' }).fill('58');
  await page.getByRole('group', { name: 'Prize Structure' }).getByRole('button', { name: /Flat/ }).click();
  await playSrpTurn(page);
  await page.getByRole('button', { name: 'BB の Villain の情報' }).click();
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('40');
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'BB の Memo' }).fill(' sticky ');
  await pickSpot(page, 'Turn / BTN Bet 3');
  await setTitle(page, 'Reads 付き');
  await submit(page);
  await expect.poll(() => cp.calls.length).toBe(1);
  const body = cp.calls[0]?.body ?? {};
  expect(body.villain_reads).toEqual({ BB: { vpip: 40, memo: 'sticky' } });
  expect(body.mtt).toEqual({ speed: 50, rank: 12, left: 58, prize: 'flat' });
});

test('一覧: Reads・MTT の印（スマホのカードは 3 段） @sp', async ({ page }) => {
  await fakeBackend(page, null);
  await fakeList(page, [row(1, { has_reads: true, has_mtt: true, fmt: 'mtt', title: 'BTN vs BB の SRP、ターンでチェックレイズを受けた場面', board: ['Kh', '8d', '3c', '2s', '7h'], street: 'river' }), row(2)]);
  await page.goto('/');
  const cards = page.locator('.spot-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('.spot-badge')).toHaveText(['Reads', 'MTT']);
  await expect(cards.nth(1).locator('.spot-badge')).toHaveCount(0);
  // 1 段目タイトル・2 段目 Board と条件・3 段目 回答数と CTA
  const t1 = await cards.nth(0).locator('.spot-t1').boundingBox();
  const t2 = await cards.nth(0).locator('.spot-t2').boundingBox();
  const t3 = await cards.nth(0).locator('.spot-foot').boundingBox();
  if (!t1 || !t2 || !t3) throw new Error('見えない');
  expect(t1.y + t1.height).toBeLessThanOrEqual(t2.y);
  expect(t2.y + t2.height).toBeLessThanOrEqual(t3.y);
  // 2 段目は 1 行。カードは画面の幅に収まり、右端の CTA が見える
  expect(t2.height).toBeLessThan(40);
  const card = await cards.nth(0).boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  expect((card?.x ?? 0) + (card?.width ?? 0)).toBeLessThanOrEqual(vw);
  await expect(cards.nth(0).locator('.spot-badge').last()).toBeInViewport({ ratio: 1 });
  await expect(cards.nth(0).locator('.spot-go')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('一覧（PC の表）: Reads・MTT の印', async ({ page }) => {
  await fakeBackend(page, null);
  await fakeList(page, [row(1, { has_reads: true }), row(2, { has_mtt: true })]);
  await page.goto('/');
  const rows = page.locator('.spot-row');
  await expect(rows.nth(0).locator('.spot-badge')).toHaveText(['Reads']);
  await expect(rows.nth(1).locator('.spot-badge')).toHaveText(['MTT']);
});
