/**
 * 回答（レンジ入力）画面の E2E（詳細仕様 06 章 §4。plan.md P6 の完了条件）。
 * バックエンドは偽物（fakeBackend.ts）。投稿は H-S1（ターン、BTN の 6.5 ベットに BB が答える。fold / call / raise）。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { emptyPaint, encodePaint, toHex } from '../packages/core/src/index.ts';
import { detailJson } from '../packages/app/src/answer/detailFixtures.ts';
import { DUPLICATE, fakeBackend, type Backend } from './fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const ANSWER = `/s/${ID}/answer`;
const RESULT = `/s/${ID}/result`;

const unanswered = (): Record<string, unknown> => detailJson(undefined, { viewer: 'unanswered', id: ID });
const answered = (): Record<string, unknown> => detailJson(undefined, { viewer: 'answered', id: ID, answerCount: 1 });

/** 回答画面を開く（視差効果を減らす設定にして、リプレイは停止位置から始める） */
async function open(page: Page, detail: Record<string, unknown> | null = unanswered(), path = ANSWER): Promise<Backend> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const be = await fakeBackend(page, detail);
  await page.goto(path);
  return be;
}

/** レンジ表のマス（読み上げは「AA コール 100%」「AA レンジ外」） */
const cell = (page: Page, label: string): Locator => page.getByRole('button', { name: new RegExp(`^${label} `) });
/** ブラシのタイル（読み上げは「コール 100% 6.5bb」） */
const tile = (page: Page, name: string): Locator => page.getByRole('button', { name: new RegExp(`^${name} \\d+%`) });

async function center(l: Locator): Promise<{ x: number; y: number }> {
  const b = await l.boundingBox();
  if (!b) throw new Error('要素が見えない');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** マスを順になぞる（1 回のストローク） */
async function stroke(page: Page, labels: string[]): Promise<void> {
  const first = await center(cell(page, labels[0] as string));
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const l of labels.slice(1)) {
    const p = await center(cell(page, l));
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  await page.mouse.up();
}

/** 長押し（スポイト） */
async function longPress(page: Page, label: string): Promise<void> {
  const p = await center(cell(page, label));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

/** ミックスバー上で x の割合（0〜1）の位置から dx の割合だけドラッグする */
async function dragBar(page: Page, from: number, dx: number): Promise<void> {
  const b = await page.locator('.mixbar').boundingBox();
  if (!b) throw new Error('Mix バーが見えない');
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + b.width * from, y);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * (from + dx), y, { steps: 10 });
  await page.mouse.up();
}

const slider = (page: Page, name: string): Locator => page.getByRole('slider', { name });

async function press(l: Locator, key: string, times: number): Promise<void> {
  await l.focus();
  for (let i = 0; i < times; i++) await l.press(key);
}

test.describe('振り分け（06 章 §4.2）', () => {
  test('/s/:id: 未回答 → 回答画面', async ({ page }) => {
    await open(page, unanswered(), `/s/${ID}`);
    await expect(page).toHaveURL(ANSWER);
    await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
  });

  test('/s/:id: 回答済み → 集計', async ({ page }) => {
    await open(page, answered(), `/s/${ID}`);
    await expect(page).toHaveURL(RESULT);
  });

  test('/s/:id/answer: 回答済み → 集計（回答し直せない）', async ({ page }) => {
    await open(page, answered());
    await expect(page).toHaveURL(RESULT);
    await expect(page.getByRole('button', { name: '回答する' })).toHaveCount(0);
  });

  test('/s/:id/result: 未回答 → 回答画面', async ({ page }) => {
    await open(page, unanswered(), RESULT);
    await expect(page).toHaveURL(ANSWER);
  });

  test('存在しない投稿', async ({ page }) => {
    await open(page, null);
    await expect(page.getByText('Spot が見つかりません')).toBeVisible();
    await page.getByRole('link', { name: '一覧へ' }).last().click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Replay（06 章 §4.3）', () => {
  test('視差効果を減らす設定: 自動再生せず停止位置を表示', async ({ page }) => {
    await open(page);
    await expect(page.getByText('11 / 11 手目')).toBeVisible();
    await expect(page.getByText('▶ BB to act')).toBeVisible();
    await expect(page.getByText('Villain（あなた）')).toBeVisible();
    // Hero のハンドは裏向き、ボードはターンまで
    await expect(page.locator('.pback')).toHaveCount(2);
    await expect(page.locator('.ptable-board .pcard')).toHaveCount(4);
    await expect(page.locator('.hlog-tag')).toHaveText('出題');
  });

  test('開くと停止位置まで自動再生し、操作できる', async ({ page }) => {
    await fakeBackend(page, unanswered());
    await page.goto(ANSWER);
    await expect(page.getByText(/^[0-2] \/ 11 手目$/)).toBeVisible();
    await expect(page.getByText('11 / 11 手目')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: '1手進む' })).toBeDisabled();

    await page.getByRole('button', { name: '最初から' }).click();
    await expect(page.getByText('0 / 11 手目')).toBeVisible();
    await expect(page.getByRole('button', { name: '1手戻る' })).toBeDisabled();
    await expect(page.locator('.ptable-board .pcard')).toHaveCount(0);
    await page.getByRole('button', { name: '1手進む' }).click();
    await expect(page.getByText('1 / 11 手目')).toBeVisible();
    await page.getByRole('button', { name: '1手戻る' }).click();
    await expect(page.getByText('0 / 11 手目')).toBeVisible();

    await page.getByRole('button', { name: '再生' }).click();
    await expect(page.getByRole('button', { name: '一時停止' })).toBeVisible();
    await page.getByRole('button', { name: '一時停止' }).click();
    await expect(page.getByRole('button', { name: '再生' })).toBeVisible();
  });
});

test.describe('塗り・道具（06 章 §4.5・§4.6）', () => {
  test('タップで塗り、同じ Mix のマスをもう一度押すと消える', async ({ page }) => {
    await open(page);
    await cell(page, 'AA').click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Call 100%');
    await expect(page.locator('.cbar')).toContainText('6 combos');
    await expect(page.locator('.cbar-legend')).toContainText('Call 100.0%');
    await cell(page, 'AA').click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Range 外');
  });

  test('なぞった範囲を塗り、1 回の「元に戻す」で全部戻る。やり直しもできる', async ({ page }) => {
    await open(page);
    await stroke(page, ['AA', 'AKs', 'AQs', 'KQs']);
    for (const l of ['AA', 'AKs', 'AQs', 'KQs']) await expect(cell(page, l)).toHaveAccessibleName(`${l} Call 100%`);
    await page.getByRole('button', { name: '元に戻す' }).click();
    for (const l of ['AA', 'AKs', 'AQs', 'KQs']) await expect(cell(page, l)).toHaveAccessibleName(`${l} Range 外`);
    await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
    await page.getByRole('button', { name: 'やり直す' }).click();
    await expect(cell(page, 'KQs')).toHaveAccessibleName('KQs Call 100%');
  });

  test('塗ったマスから始めたなぞりは消去になる', async ({ page }) => {
    await open(page);
    await stroke(page, ['AA', 'AKs', 'AQs']);
    await stroke(page, ['AKs', 'AQs', 'AJs']);
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Call 100%');
    for (const l of ['AKs', 'AQs', 'AJs']) await expect(cell(page, l)).toHaveAccessibleName(`${l} Range 外`);
  });

  test('別の Mix のマスは上書き。消しゴム。クリアと元に戻す', async ({ page }) => {
    await open(page);
    await stroke(page, ['AA', 'AKs']);
    await tile(page, 'Raise').click();
    await cell(page, 'AA').click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Raise 100%');

    await page.getByRole('button', { name: '消しゴム' }).click();
    await expect(page.getByRole('button', { name: '消しゴム' })).toHaveAttribute('aria-pressed', 'true');
    await cell(page, 'AA').click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Range 外');
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Call 100%');

    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Range 外');
    await expect(page.getByRole('button', { name: 'クリア' })).toBeDisabled();
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Call 100%');
  });

  test('スポイト: 長押しで塗りを取り消し、マスの Mix をブラシに読み込む', async ({ page }) => {
    await open(page);
    // コール 50% / レイズ 50% のブラシで AKs を塗る
    await press(slider(page, 'Call / Raise の境界'), 'ArrowLeft', 10);
    await cell(page, 'AKs').click();
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Call 50% / Raise 50%');
    // フォールド 100% に変えてから AKs を長押し
    await tile(page, 'Fold').click();
    await longPress(page, 'AKs');
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Call 50% / Raise 50%');
    await expect(tile(page, 'Call')).toHaveAccessibleName(/^Call 50%/);
    await expect(tile(page, 'Raise')).toHaveAccessibleName(/^Raise 50%/);
    await expect(tile(page, 'Fold')).toHaveAccessibleName(/^Fold 0%/);
    // 長押しは履歴に残らない（元に戻すと最初の塗りが消える）
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Range 外');
  });

  test('スポイト: Range 外のマスでは「Range 外」とトーストし、塗らない', async ({ page }) => {
    await open(page);
    await longPress(page, 'KK');
    await expect(page.locator('.toast')).toHaveText('Range 外');
    await expect(cell(page, 'KK')).toHaveAccessibleName('KK Range 外');
    await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  });

  test('キーボード: 矢印で移動、Enter で塗る', async ({ page }) => {
    await open(page);
    await cell(page, 'AA').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(cell(page, 'KK')).toHaveAccessibleName('KK Call 100%');
  });

  test('PC では取れない Action を非活性で並べる', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Bet', exact: true })).toBeDisabled();
  });
});

test.describe('ブラシと Mix バー（06 章 §4.4）', () => {
  test('初期は Call 100%。タイルでそのキー 100%。境界は左右キーで ±5%', async ({ page }) => {
    await open(page);
    await expect(tile(page, 'Call')).toHaveAttribute('aria-pressed', 'true');
    const h = slider(page, 'Fold / Call の境界');
    await press(h, 'ArrowRight', 3);
    await expect(h).toHaveAttribute('aria-valuenow', '15');
    await expect(tile(page, 'Fold')).toHaveAccessibleName(/^Fold 15%/);
    await expect(tile(page, 'Call')).toHaveAccessibleName(/^Call 85%/);
    await tile(page, 'Raise').click();
    await expect(tile(page, 'Raise')).toHaveAccessibleName(/^Raise 100%/);
  });

  test('右端で重なったハンドル（Fold 100%）: 左へドラッグで動ける方を掴む', async ({ page }) => {
    await open(page);
    await tile(page, 'Fold').click();
    await dragBar(page, 1, -0.3);
    await expect(tile(page, 'Fold')).toHaveAccessibleName(/^Fold 70%/);
    await expect(tile(page, 'Call')).toHaveAccessibleName(/^Call 30%/);
  });

  test('中央で重なったハンドル（Fold 50% / Call 0% / Raise 50%）: 右へも左へも動かせる', async ({ page }) => {
    await open(page);
    await tile(page, 'Raise').click();
    await press(slider(page, 'Call / Raise の境界'), 'ArrowRight', 10);
    await press(slider(page, 'Fold / Call の境界'), 'ArrowRight', 10);
    await expect(tile(page, 'Fold')).toHaveAccessibleName(/^Fold 50%/);
    await expect(tile(page, 'Call')).toHaveAccessibleName(/^Call 0%/);

    await dragBar(page, 0.5, 0.2);
    await expect(tile(page, 'Fold')).toHaveAccessibleName(/^Fold 50%/);
    await expect(tile(page, 'Call')).toHaveAccessibleName(/^Call 20%/);
    await expect(tile(page, 'Raise')).toHaveAccessibleName(/^Raise 30%/);

    // もう一度重ねてから左へ
    await press(slider(page, 'Call / Raise の境界'), 'ArrowLeft', 4);
    await dragBar(page, 0.5, -0.2);
    await expect(tile(page, 'Fold')).toHaveAccessibleName(/^Fold 30%/);
    await expect(tile(page, 'Call')).toHaveAccessibleName(/^Call 20%/);
    await expect(tile(page, 'Raise')).toHaveAccessibleName(/^Raise 50%/);
  });

  test('消しゴムのときにバーを動かすとブラシに戻る', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '消しゴム' }).click();
    await press(slider(page, 'Fold / Call の境界'), 'ArrowRight', 1);
    await expect(page.getByRole('button', { name: 'ブラシ' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Size（06 章 §4.7）', () => {
  test('初期値 50%、プリセット、増減、範囲外', async ({ page }) => {
    await open(page);
    const row = page.getByRole('button', { name: /^Raise Size/ });
    await expect(row).toContainText('17.55bb');
    await expect(row).toContainText('50% pot');
    await expect(tile(page, 'Raise')).toContainText('17.55bb');
    await row.click();
    await page.getByRole('button', { name: '33%' }).click();
    await expect(row).toContainText('13.79bb');
    await page.getByRole('button', { name: '0.1bb 増やす' }).click();
    await expect(page.getByRole('textbox', { name: 'Raise Size（bb）' })).toHaveValue('13.89');
    await page.getByRole('button', { name: 'All-in' }).click();
    await expect(row).toContainText('All-in');
    await expect(tile(page, 'Raise')).toContainText('All-in');
    await expect(page.getByText('min 13 / max 95.7bb')).toBeVisible();

    await page.getByRole('textbox', { name: 'Raise Size（bb）' }).fill('5');
    await expect(page.getByText('範囲外')).toBeVisible();
    await page.getByRole('button', { name: '0.1bb 減らす' }).click();
    await expect(page.getByRole('textbox', { name: 'Raise Size（bb）' })).toHaveValue('13');
    await expect(page.getByText('範囲外')).toHaveCount(0);
  });
});

test.describe('送信（06 章 §4.9）', () => {
  test('1 マスも塗っていないと送れない', async ({ page }) => {
    const be = await open(page);
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alert')).toHaveText('1マス以上塗ってください');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(be.inserts).toHaveLength(0);
  });

  test('Raise を含むのに Size が範囲外だと送れない（Raise を含まなければ見ない）', async ({ page }) => {
    await open(page);
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: /^Raise Size/ }).click();
    await page.getByRole('textbox', { name: 'Raise Size（bb）' }).fill('200');
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'やめる' }).click();

    await tile(page, 'Raise').click();
    await cell(page, 'KK').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alert')).toHaveText('Size を 13〜95.7bb にしてください');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('確認ダイアログ → 送信 → 集計へ', async ({ page }) => {
    const be = await open(page);
    be.afterInsert = answered();
    await cell(page, 'AA').click();
    await tile(page, 'Raise').click();
    await cell(page, 'KK').click();
    await page.getByRole('button', { name: '回答する' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('回答を送信しますか');
    await expect(dialog).toContainText('送信後は変更できません。');
    await dialog.getByRole('button', { name: 'やめる' }).click();
    await expect(dialog).toHaveCount(0);
    expect(be.inserts).toHaveLength(0);

    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(RESULT);
    expect(be.inserts).toHaveLength(1);
    const p = emptyPaint();
    p[0] = { fold: 0, check: 0, call: 20, s1: 0 };
    p[14] = { fold: 0, check: 0, call: 0, s1: 20 };
    expect(be.inserts[0]).toEqual({ post_id: ID, paint: toHex(encodePaint(p)), size: 17.55 });
  });

  test('Raise を含まない回答は Size を送らない', async ({ page }) => {
    const be = await open(page);
    be.afterInsert = answered();
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(RESULT);
    expect(be.inserts[0]?.size).toBeNull();
  });

  test('既に回答済み（2 回目）はエラーを出さずに集計へ', async ({ page }) => {
    const be = await open(page);
    // 画面を開いた後に別のタブで回答した（サーバーでは回答済み）。
    // 読み込みが終わる前に差し替えると最初から集計へ移ってしまうので、回答画面が出てから差し替える
    await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
    be.insertError = DUPLICATE;
    be.detail = answered();
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(RESULT);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('サーバーに拒否されたらエラーを出して留まる', async ({ page }) => {
    const be = await open(page);
    be.insertError = { status: 403, body: { code: '42501', message: 'new row violates row-level security policy', details: null, hint: null } };
    await cell(page, 'AA').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page.getByRole('alert')).toHaveText('この操作はできません');
    await expect(page).toHaveURL(ANSWER);
  });

  test('塗ったまま閉じようとすると離脱確認が出る', async ({ page }) => {
    await open(page);
    await cell(page, 'AA').click();
    const dialog = page.waitForEvent('dialog');
    void page.close({ runBeforeUnload: true });
    const d = await dialog;
    expect(d.type()).toBe('beforeunload');
    await d.accept();
  });
});

test.describe('投稿者の回答（06 章 §4.2・§4.9。投稿者も回答者の 1 人）', () => {
  const author = (): Record<string, unknown> => detailJson(undefined, { viewer: 'author', id: ID });

  test('自分の投稿でも空の表から回答し、確認ダイアログ → 送信 → 集計へ', async ({ page }) => {
    const be = await open(page, author());
    be.afterInsert = detailJson(undefined, {
      viewer: 'author',
      id: ID,
      answerCount: 1,
      myAnswer: { paint: toHex(encodePaint(emptyPaint())), size: null },
    });
    // Hero のハンドは自分の投稿でも伏せる（回答してから集計で見せる。2026-09-29）。席は他の回答者と同じ「Villain（あなた）」
    await expect(page.locator('.pback')).toHaveCount(2);
    await expect(page.getByLabel('Diamond の A')).toHaveCount(0);
    await expect(page.getByText('Villain（あなた）')).toBeVisible();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Range 外');
    await expect(page.getByRole('button', { name: /^Raise Size/ })).toContainText('17.55bb');

    await cell(page, 'KK').click();
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('送信後は変更できません。');
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(RESULT);
    expect(be.inserts).toHaveLength(1);
    const p = emptyPaint();
    p[14] = { fold: 0, check: 0, call: 20, s1: 0 };
    expect(be.inserts[0]).toEqual({ post_id: ID, paint: toHex(encodePaint(p)), size: null });
  });

  test('未回答の投稿者が集計の URL を開いても回答画面へ', async ({ page }) => {
    await open(page, author(), RESULT);
    await expect(page).toHaveURL(ANSWER);
    await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
  });
});

test.describe('スマホ（06 章 §4.1）', () => {
  test('Replay / Range のタブ、下部固定の送信まで @sp', async ({ page }) => {
    const be = await open(page);
    be.afterInsert = answered();
    await expect(page.getByRole('tab', { name: 'Replay' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.ptable')).toBeVisible();
    // Hand History はボタンからモーダル（14 章）
    await expect(page.locator('.hlog')).toHaveCount(0);
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('dialog', { name: 'Hand History' }).locator('.hlog')).toBeVisible();
    await page.keyboard.press('Escape');
    // 取れないアクションは出さない
    await page.getByRole('button', { name: 'Range 入力' }).click();
    await expect(page.getByRole('tab', { name: 'Range' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toHaveCount(0);

    await cell(page, 'AA').tap();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Call 100%');
    await expect(page.locator('.ans-bottom')).toContainText('6 combos');
    await expect(page.locator('.ans-bottom')).toContainText('Call 100.0%');
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(RESULT);
    expect(be.inserts).toHaveLength(1);
  });

  test('指でなぞる・長押し（スポイト）@sp', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Range' }).click();
    const cdp = await page.context().newCDPSession(page);
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }): Promise<void> => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] });
    };
    // なぞる
    await touch('touchStart', await center(cell(page, 'AA')));
    for (const l of ['AKs', 'AQs', 'AJs']) await touch('touchMove', await center(cell(page, l)));
    await touch('touchEnd');
    for (const l of ['AA', 'AKs', 'AQs', 'AJs']) await expect(cell(page, l)).toHaveAccessibleName(`${l} Call 100%`);
    // 長押し
    await tile(page, 'Fold').tap();
    await touch('touchStart', await center(cell(page, 'AKs')));
    await page.waitForTimeout(700);
    await touch('touchEnd');
    await expect(cell(page, 'AKs')).toHaveAccessibleName('AKs Call 100%');
    await expect(tile(page, 'Call')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Range のタブは画面をスクロールしない。Size と Hand History は道具の行からモーダル @sp', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Range' }).click();
    await expect(cell(page, '22')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
    // Size（畳んだ行は無く、ボタンからモーダル。2026-09-29）
    await expect(page.locator('.size-row')).toHaveCount(0);
    const sizeBtn = page.getByRole('button', { name: /^Raise Size 17\.55bb/ });
    await expect(sizeBtn).toContainText('17.55');
    await sizeBtn.click();
    const dlg = page.getByRole('dialog', { name: 'Raise Size' });
    await dlg.getByRole('button', { name: '75%' }).click();
    await expect(dlg.getByRole('textbox', { name: 'Raise Size（bb）' })).toHaveValue('23.08');
    await dlg.getByRole('button', { name: '決定' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(tile(page, 'Raise')).toContainText('23.08bb');
    // Hand History（停止位置までのログ）
    await page.getByRole('button', { name: 'Hand History' }).click();
    const log = page.getByRole('dialog', { name: 'Hand History' });
    await expect(log.locator('.hlog')).toBeVisible();
    await expect(log).toContainText('▶ BB to act');
  });

  test('タブを切り替えても塗りと Replay の位置が残る @sp', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '1手戻る' }).click();
    await page.getByRole('tab', { name: 'Range' }).click();
    await cell(page, 'AA').tap();
    await page.getByRole('tab', { name: 'Replay' }).click();
    await expect(page.getByText('10 / 11 手目')).toBeVisible();
    await page.getByRole('tab', { name: 'Range' }).click();
    await expect(cell(page, 'AA')).toHaveAccessibleName('AA Call 100%');
  });
});
