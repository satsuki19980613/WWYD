/**
 * Villain・MTT の情報（詳細仕様 18 章）の E2E。バックエンドは偽物（fakeBackend.ts）。
 * - 回答画面: ヘッダーの投稿のタイトル（流れる・止まる・動きを減らす設定）、席の印と席のモーダル、All Villains、MTT、情報なしで押せない
 * - 投稿画面: 登録できる席、Spot Read、General Read、5 分割のボタン、Slider の未入力・リセット・PFR ≦ VPIP、数の直接入力、Preset、MTT の欄、送る本文
 *   （2026-09-30 さつきの仕様変更: Memo を廃止し、構造化した Read に。18 章 §2.1）
 * - 一覧: Reads・MTT の印
 */
import { expect, test, type Page } from '@playwright/test';
import { detailJson } from '../packages/app/src/answer/detailFixtures.ts';
import { hs1bb, type Raw } from '../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from './fakeBackend.ts';
import { fakeList, row } from './release/taKit.ts';
import { openNew, playSrpTurn, pickSpot, S_SETTINGS, setTitle, step, submit } from './release/taPost.ts';

const ID = '00000000-0000-4000-8000-000000000001';

// H-S1（Hero は BB）。Preflop: UTG・HJ・CO・SB が Fold、BTN が Raise → ポットに残るのは BTN
// BTN はターンの Barrel（Big）に Spot Read、SB は中央（Balanced）だけなので表示しない
const READS = {
  BTN: {
    vpip: 32,
    pfr: 25,
    agg: 4,
    image: 3,
    sample: 4, // 廃止した Sample（V-007）。前の版の投稿に残っていても出さず、ほかの情報は出す
    reads: [
      { scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: true },
      { scope: 'general', street: 'flop', action: 'cbet', texture: { high: 'a' }, runout: null, size: null, lean: 'over', strong: false },
    ],
  },
  SB: { agg: 2 },
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
    // 印は表示する情報のある席だけ（BTN・UTG。SB は中央だけなので出さない）
    await expect(page.locator('.pseat-read')).toHaveCount(2);
    await page.getByRole('button', { name: 'BTN の Villain の情報' }).click();
    const seat = page.getByRole('dialog', { name: 'Villain · BTN' });
    // 全体の傾向はチップ（VPIP・PFR は数）、Read は 1 行ずつ（Spot Read が先、強いは ++）
    await expect(seat.locator('.rv-chip')).toHaveText(['VPIP 32', 'PFR 25', 'Very Aggressive', 'Hero Image: Loose']);
    await expect(seat).not.toContainText('Sample');
    await expect(seat.locator('.rv-read')).toHaveText(['Turn · Barrel (Big) → Value-heavy++', 'Flop · A-high · C-Bet → Over']);
    await expect(seat.locator('.rv-read').first()).toHaveAccessibleName('Turn · Barrel (Big) → Value-heavy（強い）');
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
    await expect(folded.locator('.rv-seat').first()).toContainText('VPIP 12');
    await expect(folded.locator('.rv-seat').last()).toContainText('—');
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
  await expect(page.getByRole('dialog', { name: 'Villain · UTG' })).toContainText('VPIP 12');
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
const seatBtn = (page: Page, p: string) => villains(page).getByRole('button', { name: `${p} の Villain の情報` });

/** SRP のターンまで入れて、Turn の BTN の Bet を Spot に選ぶ（Hero は BTN。登録できる席は SB（Fold to Steal）と BB） */
async function toVillains(page: Page): Promise<void> {
  await playSrpTurn(page);
  await pickSpot(page, 'Turn / BTN Bet 3');
}

for (const v of ['', ' @sp'] as const) {
  test(`投稿: Villain は Hand に参加した席だけで Spot の下。Spot Read は判断地点より前の実際の Action に Lean を付ける${v}`, async ({ page }) => {
    await openNew(page);
    await toVillains(page);
    const sec = villains(page);
    // Preflop で Fold しただけの UTG・HJ・CO は出さない。SB は Fold to Steal なので出す
    await expect(sec.getByRole('button', { name: /の Villain の情報$/ })).toHaveText([/^SB/, /^BB/]);
    await seatBtn(page, 'SB').click();
    const spot = sec.locator('.vr-read').first();
    await expect(spot).toContainText('Spot Read');
    await expect(spot).toContainText('この Hand の結果を知る前の読みで');
    await expect(spot).toContainText('Preflop · Fold to Steal');
    // Fold 系は Over・Under だけ。押すと通常、もう一度で強い（++）、もう一度で外れる
    const lean = spot.getByRole('group', { name: 'Lean' }).getByRole('button');
    await expect(lean).toHaveText(['Over', 'Under']);
    await lean.nth(1).click();
    await expect(lean.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await lean.nth(1).click();
    await expect(lean.nth(1)).toHaveText('Under++');
    await expect(lean.nth(1)).toHaveAccessibleName('Under（強い）');
    await expect(seatBtn(page, 'SB')).toContainText('1 Read');
    await lean.nth(1).click();
    await expect(lean.nth(1)).toHaveAttribute('aria-pressed', 'false');
    // BB は判断地点より前に語彙に当たる Action が無い（Call・Check だけ）→ Spot Read の枠を出さない
    await seatBtn(page, 'SB').click();
    await seatBtn(page, 'BB').click();
    await expect(sec.getByText('Spot Read')).toHaveCount(0);
    // 5 分割のボタン: 押すと選び、もう一度押すと未入力。左右の端に名前
    const agg = sec.getByRole('group', { name: 'Postflop Aggression' });
    await agg.getByRole('button', { name: 'Passive', exact: true }).click();
    await expect(agg.getByRole('button', { name: 'Passive', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(seatBtn(page, 'BB')).toContainText('Passive');
    await agg.getByRole('button', { name: 'Passive', exact: true }).click();
    await expect(agg.getByRole('button', { name: 'Passive', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(sec.locator('.rs.step').first().locator('.rs-ends span')).toHaveText(['Passive', 'Aggressive']);
    // VPIP の Slider: 未入力 → 最初の矢印で真ん中 → × で未入力
    const vpip = slider(page, 'VPIP');
    await expect(vpip).toHaveAttribute('aria-valuetext', '未入力');
    await vpip.focus();
    await page.keyboard.press('ArrowRight');
    await expect(vpip).toHaveAttribute('aria-valuetext', 'Very Loose 50%');
    await page.getByRole('button', { name: 'VPIP をリセット' }).click();
    await expect(vpip).toHaveAttribute('aria-valuetext', '未入力');
    // Memo は無い
    await expect(page.getByRole('textbox', { name: /Memo/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`投稿: General Read は Street → Action → Lean の順。条件は後から、Street を変えると合わない選択は外れる${v}`, async ({ page }) => {
    await openNew(page);
    await toVillains(page);
    const sec = villains(page);
    await seatBtn(page, 'BB').click();
    await sec.getByRole('button', { name: '＋ General Read' }).click();
    const g = sec.locator('.vr-read').filter({ hasText: 'General Read 1' });
    await g.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Turn' }).click();
    // Turn の Action（C-Bet は無く、Barrel と Delayed C-Bet がある。BB は Hero（BTN）より先に動くので Raise は Check-Raise）
    const actions = g.getByRole('group', { name: 'Action' }).getByRole('button');
    await expect(actions).toHaveText(['Barrel', 'Fold to Barrel', 'Delayed C-Bet', 'Donk', 'Probe', 'Bet vs Check', 'Check-Raise', 'Fold to Bet', 'Fold to Raise']);
    await g.getByRole('button', { name: 'Barrel', exact: true }).click();
    await g.getByRole('button', { name: 'Board · Size' }).click();
    await g.getByRole('group', { name: 'Runout' }).getByRole('button', { name: 'Flush Complete' }).click();
    await g.getByRole('group', { name: 'Size' }).getByRole('button', { name: 'Big' }).click();
    // Bet / Raise 系は 4 つの Lean
    await expect(g.getByRole('group', { name: 'Lean' }).getByRole('button')).toHaveText(['Over', 'Under', 'Value-heavy', 'Bluff-heavy']);
    await g.getByRole('group', { name: 'Lean' }).getByRole('button', { name: 'Value-heavy' }).click();
    await expect(g.locator('.vr-line')).toHaveText('Turn · Flush Complete · Barrel (Big) → Value-heavy');
    // Flop に変えると Barrel・Runout・Lean は外れる
    await g.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Flop', exact: true }).click();
    await expect(g.locator('.vr-line')).toHaveText('—');
    await expect(g.getByRole('group', { name: 'Runout' })).toHaveCount(0);
    await expect(g.getByRole('group', { name: 'Lean' })).toHaveCount(0);
    // 2 件まで
    await sec.getByRole('button', { name: '＋ General Read' }).click();
    await expect(sec.getByRole('button', { name: '＋ General Read' })).toHaveCount(0);
    // 途中の General Read は投稿の前のエラー
    await setTitle(page, 'Reads 付き');
    await submit(page);
    await expect(page.locator('.pf-errors')).toContainText('BB の General Read を最後まで選んでください');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('投稿: PFR を VPIP より上げると VPIP も上がり、VPIP を PFR より下げると PFR も下がる。数を直接入れられる', async ({ page }) => {
  await openNew(page);
  await toVillains(page);
  await seatBtn(page, 'BB').click();
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

test('投稿: Preset は全体の傾向と General Read を端末だけに保存し、呼び出すと Spot Read は残す', async ({ page }) => {
  await openNew(page);
  await toVillains(page);
  const sec = villains(page);
  await seatBtn(page, 'BB').click();
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('45');
  await page.keyboard.press('Enter');
  await sec.getByRole('button', { name: '＋ General Read' }).click();
  const g = sec.locator('.vr-read').filter({ hasText: 'General Read 1' });
  await g.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Flop', exact: true }).click();
  await g.getByRole('button', { name: 'Fold to C-Bet' }).click();
  await g.getByRole('group', { name: 'Lean' }).getByRole('button', { name: 'Over', exact: true }).click();
  await sec.getByRole('button', { name: 'Preset' }).click();
  const dlg = page.getByRole('dialog', { name: 'Preset · BB' });
  await dlg.getByPlaceholder('Preset の名前').fill('Fish');
  await dlg.getByRole('button', { name: '保存' }).click();
  await expect(dlg.getByRole('listitem')).toHaveCount(1);
  await expect(dlg.getByRole('listitem')).toContainText('VPIP 45 · 1 Read');
  await page.keyboard.press('Escape');
  // localStorage に schema version つきで保存（サーバーには送らない）
  const saved = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('wwyd.readPresets.'));
    return k ? JSON.parse(localStorage.getItem(k) ?? '{}') : null;
  });
  expect(saved?.schema).toBe(2);

  // SB（Spot Read あり）で呼び出す
  await seatBtn(page, 'BB').click();
  await seatBtn(page, 'SB').click();
  await sec.locator('.vr-read').first().getByRole('button', { name: 'Under', exact: true }).click();
  await sec.getByRole('button', { name: 'Preset' }).click();
  await page.getByRole('button', { name: 'Fish を呼び出す' }).click();
  await expect(slider(page, 'VPIP')).toHaveAttribute('aria-valuenow', '45');
  await expect(sec.locator('.vr-read').filter({ hasText: 'General Read 1' }).locator('.vr-line')).toHaveText('Flop · Fold to C-Bet → Over');
  await expect(seatBtn(page, 'SB')).toContainText('2 Reads');
  // 削除
  await sec.getByRole('button', { name: 'Preset' }).click();
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

test('投稿: 送る本文に Villain（登録できる席）と MTT の情報が入り、情報なしならキーを送らない', async ({ page }) => {
  const { cp } = await openNew(page);
  await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
  await page.getByRole('slider', { name: 'Tournament Type' }).focus();
  await page.keyboard.press('ArrowRight'); // 未入力の最初の矢印は真ん中（50）
  await page.getByRole('textbox', { name: 'スポットの順位' }).fill('12');
  await page.getByRole('textbox', { name: '残りの人数' }).fill('58');
  await page.getByRole('group', { name: 'Prize Structure' }).getByRole('button', { name: /Flat/ }).click();
  await toVillains(page);
  const sec = villains(page);
  await seatBtn(page, 'BB').click();
  await page.getByRole('button', { name: 'VPIP を数で入力' }).click();
  await page.getByRole('textbox', { name: 'VPIP（%）' }).fill('40');
  await page.keyboard.press('Enter');
  await sec.getByRole('group', { name: 'Postflop Aggression' }).getByRole('button', { name: 'Aggressive', exact: true }).click();
  await sec.getByRole('button', { name: '＋ General Read' }).click();
  const g = sec.locator('.vr-read').filter({ hasText: 'General Read 1' });
  await g.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Flop', exact: true }).click();
  await g.getByRole('button', { name: 'Check-Raise' }).click();
  await g.getByRole('button', { name: 'Board · Size' }).click();
  await g.getByRole('group', { name: 'High Card' }).getByRole('button', { name: 'A-high' }).click();
  await g.getByRole('group', { name: 'Connectivity' }).getByRole('button', { name: 'Straight possible' }).click();
  const leans = g.getByRole('group', { name: 'Lean' });
  await leans.getByRole('button', { name: 'Bluff-heavy' }).click();
  await leans.getByRole('button', { name: 'Bluff-heavy' }).click();
  await seatBtn(page, 'BB').click();
  await seatBtn(page, 'SB').click();
  await sec.locator('.vr-read').first().getByRole('button', { name: 'Under', exact: true }).click();
  await setTitle(page, 'Reads 付き');
  await submit(page);
  await expect.poll(() => cp.calls.length).toBe(1);
  const body = cp.calls[0]?.body ?? {};
  expect(body.villain_reads).toEqual({
    SB: { reads: [{ scope: 'spot', street: 'pf', action: 'fold_steal', texture: null, runout: null, size: null, lean: 'under', strong: false }] },
    BB: {
      vpip: 40,
      agg: 3,
      reads: [
        { scope: 'general', street: 'flop', action: 'raise', texture: { high: 'a', connect: 'straight' }, runout: null, size: null, lean: 'bluff', strong: true },
      ],
    },
  });
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
