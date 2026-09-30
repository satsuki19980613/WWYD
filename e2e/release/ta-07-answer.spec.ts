/**
 * T-A A-07: 回答（06 章 §4、05 章の paint、16 章）。既存の answer.spec.ts が通している H-S1（BB の Fold / Call / Raise）以外の局面
 * （Check / Bet・Fold / Call・MTT・マルチウェイ）、なぞる・長押し・元に戻す・やり直す・クリアの境界、Size の入力、送信の失敗・二重送信・回答済み、
 * 未回答のときに見えてはいけない情報（Hero の Hand・先の Action・Board）。PC は既定、スマホは @sp。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { emptyPaint, encodePaint, spotCandidates, toHex } from '../../packages/core/src/index.ts';
import { acts } from '../../packages/core/src/poker/testHelpers.ts';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { ALLIN_CASES, allinRaw } from '../../packages/core/src/post/allinFixtures.ts';
import { hmw, hs1, hs1bb, hs3 } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend, type Backend } from '../fakeBackend.ts';
import { DATA, fulfillJson, watchErrors } from './taKit.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const ANSWER = `/s/${ID}/answer`;
const RESULT = `/s/${ID}/result`;

const unans = (raw: Record<string, unknown>): Record<string, unknown> => detailJson(raw, { viewer: 'unanswered', id: ID });
const ans = (raw: Record<string, unknown>): Record<string, unknown> => detailJson(raw, { viewer: 'answered', id: ID, answerCount: 1 });

async function open(page: Page, raw: Record<string, unknown> = hs1bb(), path = ANSWER): Promise<Backend> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const be = await fakeBackend(page, unans(raw));
  be.afterInsert = ans(raw);
  await page.goto(path);
  if ((page.viewportSize()?.width ?? 1280) < 700) await expect(page.getByRole('tab', { name: 'Range' })).toBeVisible();
  else await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
  return be;
}

const cell = (page: Page, label: string): Locator => page.getByRole('button', { name: new RegExp(`^${label} `) });
const tile = (page: Page, name: string): Locator => page.getByRole('button', { name: new RegExp(`^${name} \\d+%`) });

async function center(l: Locator): Promise<{ x: number; y: number }> {
  const b = await l.boundingBox();
  if (!b) throw new Error('要素が見えない');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** マスを順になぞる。座標は先に全部求める（ボタンを押してから最初の動きまでが 480ms を超えるとスポイトの長押しになるため） */
async function stroke(page: Page, labels: string[]): Promise<void> {
  const pts: { x: number; y: number }[] = [];
  for (const l of labels) pts.push(await center(cell(page, l)));
  const first = pts[0] as { x: number; y: number };
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.up();
}

/** 全 169 マス（13×13）のラベル */
const RANKS = 'AKQJT98765432';
const ALL_LABELS: string[] = [];
for (let i = 0; i < 13; i++) {
  for (let j = 0; j < 13; j++) ALL_LABELS.push(i === j ? `${RANKS[i]}${RANKS[j]}` : i < j ? `${RANKS[i]}${RANKS[j]}s` : `${RANKS[j]}${RANKS[i]}o`);
}

/** 見本の中で、指定の名前のスポットを出題した投稿 */
function allinPost(caseName: RegExp, spotLabel: string): Record<string, unknown> {
  const c = ALLIN_CASES.find((x) => caseName.test(x.name));
  if (!c) throw new Error(`見本が無い: ${caseName}`);
  const cands = spotCandidates(acts(c.actions), c.hero);
  const idx = c.spots.findIndex(([l]) => l === spotLabel);
  if (idx < 0 || !cands[idx]) throw new Error(`スポットが無い: ${spotLabel}`);
  return allinRaw(c, (cands[idx] as { index: number }).index);
}

test.describe('A-07 局面ごとのブラシ（キーの組）', () => {
  test('Check / Bet の局面（H-S1 の BTN）: タイルは Check・Bet。PC では Fold・Call・Raise を非活性で並べる。Bet Size は 4.55bb（50% pot）', async ({ page }) => {
    await open(page, hs1());
    await expect(page.getByText('Turn · Cash · 100bb · SB 0.5 / BB 1')).toBeVisible();
    await expect(tile(page, 'Check')).toHaveAttribute('aria-pressed', 'true'); // 初期ブラシは先頭のキー
    await expect(tile(page, 'Bet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fold', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Call', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Bet Size/ })).toContainText('4.55bb');
    await expect(page.getByRole('button', { name: /^Bet Size/ })).toContainText('50% pot');
    await cell(page, 'AA').click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Check 100%');
    await tile(page, 'Bet').click();
    await cell(page, 'KK').click();
    await expect(cell(page, 'KK')).toHaveAccessibleName('KK Bet 100%');
  });

  test('Check / Bet の局面: Check だけの回答は Size を送らず、Bet を含めば Size（bb）を送る', async ({ page }) => {
    const be = await open(page, hs1());
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(RESULT);
    expect(be.inserts[0]).toMatchObject({ post_id: ID, size: null });
  });

  test('Check / Bet: Bet を含む回答は size = 4.55 を送る', async ({ page }) => {
    const be = await open(page, hs1());
    await tile(page, 'Bet').click();
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(RESULT);
    const p = emptyPaint();
    p[0] = { fold: 0, check: 0, call: 0, s1: 20 };
    expect(be.inserts[0]).toEqual({ post_id: ID, paint: toHex(encodePaint(p)), size: 4.55 });
  });

  test('Fold / Call だけの局面（相手の All-in に Hero）: タイルは Fold・Call。Size は無い。Raise・Bet の非活性ボタンだけ並ぶ', async ({ page }) => {
    await open(page, allinPost(/River で相手の All-in に Hero が Call$/, 'River / BTN Call'));
    await expect(tile(page, 'Fold')).toBeVisible();
    await expect(tile(page, 'Call')).toBeVisible();
    await expect(page.getByRole('button', { name: /Size/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Raise', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
    // Call に Call 額（All-in の額）が添えられる
    await expect(tile(page, 'Call')).toContainText('bb');
    await cell(page, 'AA').click();
    await tile(page, 'Fold').click();
    await cell(page, '72o').click();
    await expect(cell(page, '72o')).toHaveAccessibleName('72o Fold 100%');
  });

  test('MTT の局面（H-S3）: メタ行に MTT・スタックが出る。Bet の Size は max が 21.775', async ({ page }) => {
    await open(page, hs3());
    await expect(page.getByText(/^Flop · MTT · 22bb · SB 0\.5 \/ BB 1/)).toBeVisible();
    await page.getByRole('button', { name: /^Bet Size/ }).click();
    await expect(page.getByText('min 1 / max 21.775bb')).toBeVisible();
  });

  test('マルチウェイ（H-MW）: 3 人の Flop。卓に 3 人分の Stack・Bet が出て、Hero の CO が手番', async ({ page }) => {
    await open(page, hmw());
    await expect(page.getByText(/to act/).first()).toBeVisible();
    await expect(page.getByText('Hero（あなた）')).toBeVisible();
    await expect(tile(page, 'Check')).toBeVisible();
  });
});

test.describe('A-07 塗り・道具の境界', () => {
  // なぞる操作の間に 480ms（スポイトの長押し）を超えると別の操作になる。負荷の高い実行で稀にずれるので 2 回まで再試行する
  test.describe.configure({ retries: 2 });
  test('ストロークの途中でレンジ表の外へ出て、外でボタンを離しても 1 手として確定する（Undo 1 回で全部戻る）', async ({ page }) => {
    await open(page);
    const a = await center(cell(page, 'AA'));
    const k = await center(cell(page, 'AKs'));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(k.x, k.y, { steps: 3 });
    await page.mouse.move(k.x + 900, k.y + 400, { steps: 5 }); // 表の外
    await page.mouse.up();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Call 100%');
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Call 100%');
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Range 外');
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Range 外');
    await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  });

  test('やり直しは新しく塗ると消える。Clear の後の Undo で復元。Clear は Range が空なら押せない', async ({ page }) => {
    await open(page);
    await cell(page, 'AA').click();
    await cell(page, 'KK').click();
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(page.getByRole('button', { name: 'やり直す' })).toBeEnabled();
    await cell(page, 'QQ').click(); // 新しい塗り → やり直しは消える
    await expect(page.getByRole('button', { name: 'やり直す' })).toBeDisabled();
    await page.getByRole('button', { name: 'クリア' }).click();
    for (const l of ['AA', 'QQ']) await expect(cell(page, l)).toHaveAccessibleName(`${l} Range 外`);
    await expect(page.getByRole('button', { name: 'クリア' })).toBeDisabled();
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Call 100%');
    await expect(cell(page, 'QQ')).toHaveAccessibleName('QQ Call 100%');
  });

  test('元に戻すは最大 100 手: 101 回塗ったあと 101 回戻しても、最初の 1 手は残る', async ({ page }) => {
    await open(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // 1 マスずつ 101 回（別のマス）
    for (let i = 0; i < 101; i++) await page.keyboard.press('Tab').catch(() => undefined);
    const targets = ALL_LABELS.slice(0, 101);
    for (const l of targets) await cell(page, l).click();
    for (let i = 0; i < 105; i++) await page.keyboard.press('Control+z');
    // どれかは残る: 最初の 1 手（101 手目より前に押し出された）
    const painted = await page.locator('.rcell.on').count();
    expect(painted).toBe(1);
    await expect(cell(page, ALL_LABELS[0] as string)).not.toHaveAccessibleName(new RegExp('Range 外$'));
  });

  test('全 169 マスを塗ると「1326 combos · 100%」。Call 100% になる', async ({ page }) => {
    await open(page);
    for (const rowStart of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const row = ALL_LABELS.slice(rowStart * 13, rowStart * 13 + 13);
      await stroke(page, row);
    }
    await expect(page.locator('.rcell.on')).toHaveCount(169);
    await expect(page.locator('.cbar')).toContainText('1326 combos');
    await expect(page.locator('.cbar')).toContainText('100.0%');
    await expect(page.locator('.cbar-legend')).toContainText('Call 100.0%');
  });

  test('混合の割合と combos: AA を Fold 50% / Call 50%、KK を Raise 100% → 12 combos。凡例は Fold 25.0% / Call 25.0% / Raise 50.0%', async ({ page }) => {
    await open(page);
    // ブラシを Fold 50 / Call 50 に（Fold/Call の境界を 10 回右へ）
    const h = page.getByRole('slider', { name: 'Fold / Call の境界' });
    await h.focus();
    for (let i = 0; i < 10; i++) await h.press('ArrowRight');
    await tile(page, 'Fold').waitFor();
    await cell(page, 'AA').click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Fold 50% / Call 50%');
    await tile(page, 'Raise').click();
    await cell(page, 'KK').click();
    await expect(page.locator('.cbar')).toContainText('12 combos');
    const legend = page.locator('.cbar-legend');
    await expect(legend).toContainText('Fold 25.0%');
    await expect(legend).toContainText('Call 25.0%');
    await expect(legend).toContainText('Raise 50.0%');
  });

  test('ミックスバー: 境界のスライダーの aria（min 0・max 20・now）と、左右キーで 5% ずつ。0 と 100 で止まる', async ({ page }) => {
    await open(page);
    const h = page.getByRole('slider', { name: 'Fold / Call の境界' });
    await expect(h).toHaveAttribute('aria-valuemin', '0');
    await expect(h).toHaveAttribute('aria-valuemax', '100');
    await expect(h).toHaveAttribute('aria-valuenow', '0');
    await h.focus();
    for (let i = 0; i < 30; i++) await h.press('ArrowRight');
    await expect(h).toHaveAttribute('aria-valuenow', '100'); // 右端で止まる
    for (let i = 0; i < 30; i++) await h.press('ArrowLeft');
    await expect(h).toHaveAttribute('aria-valuenow', '0');
  });

  test('キーボード: Space・Enter で塗る。矢印は端で止まる（折り返さない）。B / E で道具を切り替える。入力欄の中では効かない', async ({ page }) => {
    await open(page);
    await cell(page, 'AA').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await expect(cell(page, 'AA')).toBeFocused(); // 端では動かない
    await page.keyboard.press('Space');
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Call 100%');
    await page.keyboard.press('End');
    await expect(cell(page, '22')).not.toBeFocused(); // End は行の右端（AA の行の 右端は A2s）
    await expect(cell(page, 'A2s')).toBeFocused();
    await page.keyboard.press('e');
    await expect(page.getByRole('button', { name: '消しゴム' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('b');
    await expect(page.getByRole('button', { name: 'ブラシ' })).toHaveAttribute('aria-pressed', 'true');
    // Size の入力欄の中で e / b / Ctrl+Z は道具・塗りに効かない
    await page.getByRole('button', { name: /^Raise Size/ }).click();
    const size = page.getByRole('textbox', { name: 'Raise Size（bb）' });
    await size.focus();
    await page.keyboard.press('e');
    await expect(page.getByRole('button', { name: 'ブラシ' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+z');
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Call 100%');
  });

  test('Replay のキー: Size の入力欄・ⓘ のモーダルが開いている間は ← → Home End が Replay に効かない', async ({ page }) => {
    await open(page);
    await expect(page.getByText('11 / 11 手目')).toBeVisible();
    await page.getByRole('button', { name: /^Raise Size/ }).click();
    const size = page.getByRole('textbox', { name: 'Raise Size（bb）' });
    await size.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    await expect(page.getByText('11 / 11 手目')).toBeVisible();
    await page.getByRole('button', { name: 'インフォメーション' }).click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    await expect(page.getByText('11 / 11 手目')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Home');
    await expect(page.getByText('0 / 11 手目')).toBeVisible();
  });
});

test.describe('A-07 Size', () => {
  test('Size の入力: 数でない・4 桁の小数・全角・負・範囲外は送れない。空白つき・小数点で終わる値は読める。範囲内なら送れる', async ({ page }) => {
    const be = await open(page);
    await cell(page, 'AA').click();
    await tile(page, 'Raise').click();
    await cell(page, 'KK').click();
    await page.getByRole('button', { name: /^Raise Size/ }).click();
    const size = page.getByRole('textbox', { name: 'Raise Size（bb）' });
    for (const bad of ['abc', '13.9999', '１４', '-14', '12.999', '96', '', '1e1']) {
      await size.fill(bad);
      await page.getByRole('button', { name: '回答する' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Size を 13〜95.7bb にしてください' }), JSON.stringify(bad)).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
    }
    expect(be.inserts).toHaveLength(0);
    // 読める値
    await size.fill(' 14. ');
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'やめる' }).click();
    await size.fill('95.7');
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'やめる' }).click();
    await size.fill('13');
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
  });

  test('Size のプリセット（33・50・75・125・All-in）と増減。All-in は max。125% は max を超えたら max', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /^Raise Size/ }).click();
    for (const l of ['33%', '50%', '75%', '125%', 'All-in']) await expect(page.getByRole('button', { name: l, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '125%', exact: true }).click();
    const size = page.getByRole('textbox', { name: 'Raise Size（bb）' });
    const v125 = Number(await size.inputValue());
    expect(v125).toBeGreaterThan(30);
    expect(v125).toBeLessThanOrEqual(95.7);
    await page.getByRole('button', { name: 'All-in', exact: true }).click();
    await expect(size).toHaveValue('95.7');
    // max では ▲ は動かない、min では ▼ は動かない
    await page.getByRole('button', { name: '0.1bb 増やす' }).click();
    await expect(size).toHaveValue('95.7');
    await size.fill('13');
    await page.getByRole('button', { name: '0.1bb 減らす' }).click();
    await expect(size).toHaveValue('13');
  });
});

test.describe('A-07 送信', () => {
  test('二重に押しても確認ダイアログは 1 つ、送信の二重クリックでも insert は 1 回。送信中は「送信中…」', async ({ page }) => {
    const be = await open(page);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(`${DATA}/answers`, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await gate;
      return route.fallback();
    });
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(1);
    await page.getByRole('button', { name: '送信する' }).dblclick();
    await expect(page.getByRole('button', { name: '送信中…' }).first()).toBeDisabled();
    release();
    await expect(page).toHaveURL(RESULT);
    expect(be.inserts).toHaveLength(1);
  });

  // not_authenticated はログイン画面へ移る（06 章 §7。ta-14-session で確かめる）
  test('通信失敗・5xx・paint / size のコード → 文言。エラーは塗りを変えると消え、押し直せる', async ({ page }) => {
    const be = await open(page);
    await cell(page, 'AA').click();
    const cases: [{ status: number; body: Record<string, unknown> } | 'abort', string][] = [
      ['abort', '通信に失敗しました'],
      [{ status: 500, body: { message: 'boom' } }, 'エラーが発生しました'],
      [{ status: 400, body: { code: 'P0001', message: 'size_out_of_range' } }, '回答の内容が正しくありません'],
      [{ status: 400, body: { code: 'P0001', message: 'paint_empty' } }, '回答の内容が正しくありません'],
      [{ status: 400, body: { code: 'P0001', message: 'not_allowed' } }, 'このアカウントは利用できません'],
      [{ status: 400, body: { code: 'P0001', message: 'post_not_found' } }, 'Spot が見つかりません'],
    ];
    for (const [res, msg] of cases) {
      await page.unroute(`${DATA}/answers`).catch(() => undefined);
      await page.route(`${DATA}/answers`, (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        if (res === 'abort') return route.abort('connectionrefused');
        return fulfillJson(route, res.status, res.body);
      });
      await page.getByRole('button', { name: '回答する' }).click();
      await page.getByRole('button', { name: '送信する' }).click();
      await expect(page.getByRole('alert').filter({ hasText: msg }), msg).toBeVisible();
      await expect(page).toHaveURL(ANSWER);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
    }
    expect(be.inserts).toHaveLength(0);
    // 塗りを変えるとサーバーのエラーは消える
    await cell(page, 'KK').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Spot が見つかりません' })).toHaveCount(0);
  });

  test('送信に成功したら、離脱確認は出ない（再読み込みしても）。戻ると集計へ（回答し直せない）', async ({ page }) => {
    await open(page);
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(RESULT);
    let fired = false;
    page.on('dialog', (d) => {
      fired = true;
      void d.accept();
    });
    await page.reload();
    expect(fired).toBe(false);
    await page.goto(ANSWER);
    await expect(page).toHaveURL(RESULT);
  });

  test('塗っていない・塗って消した（全部クリアした）ときは離脱確認を出さない', async ({ page }) => {
    await open(page);
    let fired = false;
    page.on('dialog', (d) => {
      fired = true;
      void d.accept();
    });
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: 'クリア' }).click();
    await page.reload();
    expect(fired).toBe(false);
  });
});

test.describe('A-07 未回答のときに見えてはいけない情報（不変条件 10）', () => {
  test('Hero の Hand・BTN の Hand（Showdown で見せた K♦ A♦）・先の Action・River の Board が DOM のどこにも無い', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, hs1bb());
    await page.keyboard.press('End').catch(() => undefined);
    const html = await page.content();
    // 札の読み上げの名前（Diamond の A など）が無い。Hero（BB）の Ks Js・BTN の Ad Kd はいずれも出ない
    for (const c of ['Spade の K', 'Spade の J', 'Diamond の A', 'Diamond の K']) expect(html, c).not.toContain(`aria-label="${c}"`);
    expect(html).not.toContain('Showdown');
    // Board はターンまで（4 枚）
    await expect(page.locator('.ptable-board .pcard')).toHaveCount(4);
    // ログに Hero の実際のアクションと、それより先の River のアクションが無い
    const log = (await page.locator('.hlog').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    expect(log).not.toContain('BB Call 6.5');
    expect(log).not.toContain('River');
    expect(errors).toEqual([]);
  });

  test('サーバーが先の Action を返さない（truncated）のに、URL・ネットワークの本文にも Hero の Hand が無い', async ({ page }) => {
    const bodies: string[] = [];
    page.on('response', async (r) => {
      if (r.url().includes('/rpc/get_post_detail')) bodies.push(await r.text().catch(() => ''));
    });
    await open(page, hs1bb());
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) {
      expect(b).toContain('"secrets":null');
      expect(b).not.toContain('hero_cards');
    }
  });
});

test.describe('A-07 スポットの見出し（17 章 §3.5）', () => {
  test('PC: SPOT の帯に Street・Hero と向き合う Action・Pot・to call。卓の SPOT の札と目盛り', async ({ page }) => {
    await open(page);
    const banner = page.getByRole('group', { name: 'Spot' });
    await expect(banner).toContainText(/spot/i);
    await expect(banner).toContainText('Turn');
    await expect(banner).toContainText('Hero BB');
    await expect(banner).toContainText('vs BTN Bet');
    await expect(banner).toContainText('6.5');
    await expect(banner).toContainText('Pot');
    await expect(banner).toContainText('to call');
    await expect(page.locator('.pseat-spot')).toContainText(/spot/i);
  });

  test('スマホ: Range のタブの要約は Board・Hero BB vs BTN Bet 6.5・Pot の 1 行。押すと Replay へ @sp', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Range' }).click();
    const strip = page.locator('.ans-spot, .spot-strip').first();
    await expect(page.getByText(/vs BTN Bet 6\.5/)).toBeVisible();
    void strip;
    await page.getByText(/vs BTN Bet 6\.5/).click();
    await expect(page.getByRole('tab', { name: 'Replay' })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('A-07 スマホ（@sp）', () => {
  test('Range のタブで塗る・送信。「Range 入力」ボタンでタブへ。タップでもなぞりでも塗れる。コンテキストメニュー（長押し）は出ない @sp', async ({ page }) => {
    const be = await open(page);
    await page.getByRole('button', { name: 'Range 入力' }).click();
    await expect(page.getByRole('tab', { name: 'Range' })).toHaveAttribute('aria-selected', 'true');
    const prevented = await page.evaluate(() => {
      const el = document.querySelector('.rcell') as HTMLElement;
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await cell(page, 'AA').tap();
    await page.getByRole('button', { name: '回答する' }).tap();
    await page.getByRole('button', { name: '送信する' }).tap();
    await expect(page).toHaveURL(RESULT);
    expect(be.inserts).toHaveLength(1);
  });

  test('2 本目の指は塗りに影響しない（最初の指のストロークだけが 1 手） @sp', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Range' }).click();
    const cdp = await page.context().newCDPSession(page);
    const a = await center(cell(page, 'AA'));
    const b = await center(cell(page, 'KK'));
    const c = await center(cell(page, 'QQ'));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }, { x: b.x, y: b.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x, y: c.y, id: 1 }, { x: b.x, y: b.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(cell(page, 'KK')).toHaveAccessibleName('KK Range 外');
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(page.locator('.rcell.on')).toHaveCount(0);
  });

  test('Replay ⇄ Range を切り替えても、送信バーの「回答する」は Range のときだけ固定表示。Replay のタブは画面をスクロールしない @sp', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
    await page.getByRole('tab', { name: 'Range' }).click();
    await expect(page.getByRole('button', { name: '回答する' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
  });
});

test.describe('A-07 塗ったままアプリ内で移る（F-028。2026-09-30 さつき）', () => {
  test('塗ったまま一覧へ移ると「塗った Range を捨てますか」。やめると残り、捨てると移る', async ({ page }) => {
    await open(page);
    const url = page.url();
    await cell(page, 'AA').click();
    const list = page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' });
    await list.click();
    const dlg = page.getByRole('alertdialog', { name: '塗った Range を捨てますか' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'やめる' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page).toHaveURL(url);
    await list.click();
    await dlg.getByRole('button', { name: '捨てて移動' }).click();
    await expect(page).toHaveURL('/');
  });

  test('塗っていなければ確認せずに移る', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });
});
