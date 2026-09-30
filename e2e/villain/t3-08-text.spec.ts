/**
 * T3-08: 不変条件 1（画面に説明文を出さない。例外はエラー・プレースホルダー・Prize Structure の目安・MTT の数の欄の名前・Spot Read の注記）。
 * T3-09: 不変条件 2（ポーカー用語は英語・カタカナにしない。Read の 1 行は英語と記号だけ）。
 * 新しい画面（投稿画面の Villain・MTT・Preset、回答・集計の席のモーダル・All Villains・MTT のモーダル、一覧のカード）の文字を集める。
 */
import { expect, test, type Page } from '@playwright/test';
import { hmw } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';
import { fakeList, row, watchErrors } from '../release/taKit.ts';
import { openNew, pickSpot, playSrpTurn, setTitle, step, submit, S_SETTINGS } from '../release/taPost.ts';
import { baseHs1bb, checkRaiseHand, JP, KATAKANA, openAnswer, openResult, visibleTexts, toHandHistoryTab } from './t3-kit.ts';

// 画面に出してよい日本語の文字列（ラベル・ボタン・状態。説明文ではない）
const ALLOWED_JP: RegExp[] = [
  /^このハンドの結果を知る前の読みで$/, // 不変条件 1 の例外（18 章 §10 C-10）
  /^スポットの順位$/,
  /^残りの人数$/,
  /^エントリー数$/,
  /^順位 \/ 残りの人数$/,
  /^クリア$/,
  /^保存$/,
  /^呼び出す$/,
  /^閉じる$/,
  /^削除$/,
  /^[0-9#\/ ・A-Za-z]+$/, // 人数の 1 行（12/58 ・ ITM 50 ・ 320 entries。区切りの ・ だけが日本語の記号）
  /^未入力$/,
];
// エラー表示（不変条件 1 の例外）
const ERROR_JP: RegExp[] = [
  /を最後まで選んでください$/,
  /の値が正しくありません$/,
  /^Villain の情報を確認してください$/,
  /^MTT の情報を確認してください$/,
  /^名前を \d+ 文字以内で入力してください$/,
  /^保存する情報がありません$/,
  /^Preset がいっぱいです。どれかを削除してください$/,
  /^この端末には保存できません$/,
];

const isAllowed = (t: string): boolean => ALLOWED_JP.some((r) => r.test(t)) || ERROR_JP.some((r) => r.test(t));

/** 説明文らしい文字列か: 句読点を含む・日本語が 12 文字を超える */
function looksLikeSentence(t: string): boolean {
  const jp = [...t].filter((c) => JP.test(c)).length;
  return /[。、]/.test(t) || jp > 12;
}

/** 文字の一覧を検査する（説明文が無い・許す日本語以外が無い・許すカタカナ以外が無い） */
function audit(where: string, texts: string[]): { extra: string[]; katakana: string[] } {
  const extra: string[] = [];
  const kata: string[] = [];
  for (const t of texts) {
    const isErr = ERROR_JP.some((r) => r.test(t));
    if (!isErr && !isAllowed(t)) expect(looksLikeSentence(t), `${where}: 説明文らしい文字列「${t}」`).toBe(false);
    if (JP.test(t) && !isAllowed(t)) extra.push(t);
    // Spot Read の注記（「ハンド」とカタカナ。CLAUDE.md 不変条件 1 が文言を固定している）は、不変条件 2 との食い違いとして別に報告する
    if (t === 'このハンドの結果を知る前の読みで') {
      console.log('[T3-09 所見] 注記「このハンドの結果を知る前の読みで」にカタカナの「ハンド」（15 章の用語表は Hand）');
      continue;
    }
    for (const m of t.match(KATAKANA) ?? []) kata.push(m);
  }
  return { extra, katakana: kata };
}

// 許すカタカナ: ポーカー用語でない語と、MTT の数の欄の名前の例外
const ALLOWED_KATAKANA = new Set(['スポット', 'エントリー', 'クリア']);

async function postWithVillain(page: Page): Promise<void> {
  await openNew(page);
  await playSrpTurn(page);
  await pickSpot(page, 'Turn / BTN Bet 3');
}

const villains = (page: Page) => page.getByRole('region', { name: 'Villain' });

for (const v of ['', ' @sp'] as const) {
  test(`T3-08・T3-09 投稿画面の Villain・Preset・MTT の欄: 説明文が無く、日本語は許す語だけ、カタカナのポーカー用語が無い${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await postWithVillain(page);
    const sec = villains(page);
    // 席を開く
    await sec.getByRole('button', { name: 'SB の Villain の情報' }).click();
    await sec.getByRole('button', { name: '＋ General Read' }).click();
    const g = sec.locator('.vr-read').filter({ hasText: 'General Read 1' });
    await g.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Turn' }).click();
    await g.getByRole('button', { name: 'Barrel', exact: true }).click();
    await g.getByRole('button', { name: 'Board · Size' }).click();
    const a1 = audit('Villain の欄', await visibleTexts(page, '.vr-list'));
    // 途中の General Read のエラー（Lean を選ばないまま投稿）
    await setTitle(page, 'Reads 付き');
    await submit(page);
    await expect(page.locator('.pf-errors')).toContainText('を最後まで選んでください');
    const a2 = audit('投稿のエラー', await visibleTexts(page, '.pf-errors'));
    // Preset のダイアログ
    await step(page, /^4\s*Spot$/);
    await sec.getByRole('button', { name: 'Preset' }).click();
    const a3 = audit('Preset', await visibleTexts(page, '[role="dialog"]'));
    await page.keyboard.press('Escape');
    // MTT の欄（読めない値でエラー表示）
    await step(page, S_SETTINGS);
    await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
    await page.getByLabel('スポットの順位').fill('abc');
    await expect(page.getByLabel('スポットの順位')).toHaveAttribute('aria-invalid', 'true');
    const a4 = audit('MTT の欄', await visibleTexts(page, '.pf-fieldset:has(.mtt-fields)'));
    // 結果を集めて、許す語だけ
    const extra = [...a1.extra, ...a2.extra, ...a3.extra, ...a4.extra];
    const kata = [...a1.katakana, ...a2.katakana, ...a3.katakana, ...a4.katakana];
    console.log('[T3-08] 日本語の文字列（許す語以外。エラーは除く）:', JSON.stringify([...new Set(extra)]));
    console.log('[T3-09] カタカナの連なり:', JSON.stringify([...new Set(kata)]));
    expect([...new Set(extra)], '許す語以外の日本語').toEqual([]);
    for (const k of new Set(kata)) expect(ALLOWED_KATAKANA.has(k), `カタカナ「${k}」`).toBe(true);
    // Read の 1 行は英語と記号だけ
    await step(page, /^4\s*Spot$/);
    const lines = await page.locator('.vr-line').allInnerTexts();
    for (const l of lines) expect(l, l).toMatch(/^[A-Za-z0-9 ·→()+\-/—.:%'Ⅰ-]+$/);
    expect(errors).toEqual([]);
  });

  test(`T3-08・T3-09 回答画面・集計画面の Villain の表示: 説明文が無く、英語と記号だけ（例外は MTT の見出し）${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    const reads = {
      UTG: { vpip: 12, pfr: 8, agg: 0, image: 4, sample: 3, reads: [{ scope: 'general', street: 'flop', action: 'cbet', texture: { high: 'a', suit: 'two', paired: 'paired', connect: 'straight' }, runout: null, size: 'big', lean: 'bluff', strong: true }] },
      BTN: { agg: 4, reads: [{ scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: false }] },
    };
    const mtt = { speed: 10, rank: 12, left: 58, paid: 50, entries: 320, avg: 35, prize: 'standard' };
    await openAnswer(page, { ...baseHs1bb(), fmt: 'mtt', rake: null, villain_reads: reads, mtt });
    const texts: string[] = [];
    await page.getByRole('button', { name: 'UTG の Villain の情報' }).click();
    texts.push(...(await visibleTexts(page, '[role="dialog"]')));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'All Villains' }).click();
    await page.locator('details.rv-folded summary').click();
    texts.push(...(await visibleTexts(page, '[role="dialog"]')));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'MTT', exact: true }).click();
    texts.push(...(await visibleTexts(page, '[role="dialog"]')));
    // モーダルの見出し（Villain · UTG など）は英語
    const a = audit('回答画面のモーダル', texts);
    console.log('[T3-08] 回答画面の日本語（許す語以外）:', JSON.stringify([...new Set(a.extra)]));
    expect([...new Set(a.extra)]).toEqual([]);
    expect([...new Set(a.katakana)]).toEqual([]);
    // Read の行は英語と記号だけ
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'All Villains' }).click();
    for (const l of (await page.locator('.rv-read').allInnerTexts()).filter((x) => x.trim() !== '')) expect(l, l).toMatch(/^[A-Za-z0-9 ·→()+\-/—.:%]+$/);
    expect(errors).toEqual([]);
  });

  test(`T3-08・T3-09 集計画面と Check-Raise・前の版の投稿でも、説明文は出ない${v}`, async ({ page }) => {
    await openResult(page, { ...checkRaiseHand(), villain_reads: { BB: { reads: [{ scope: 'spot', street: 'flop', action: 'raise', texture: null, runout: null, size: 'big', lean: 'value', strong: true }] } } });
    await toHandHistoryTab(page);
    await page.getByRole('button', { name: 'BB の Villain の情報' }).click();
    const a = audit('集計画面のモーダル', await visibleTexts(page, '[role="dialog"]'));
    expect(a.extra).toEqual([]);
    expect(a.katakana).toEqual([]);
  });

  test(`T3-08・T3-09 H-MW の All Villains（情報の無い席は —）と、一覧のカードの印（英語）${v}`, async ({ page }) => {
    await openAnswer(page, { ...hmw(), villain_reads: { BB: { vpip: 20 } } });
    await page.getByRole('button', { name: 'All Villains' }).click();
    const a = audit('All Villains', await visibleTexts(page, '[role="dialog"]'));
    expect(a.extra).toEqual([]);
    expect(a.katakana).toEqual([]);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await fakeBackend(page, null);
    await fakeList(page, [row(1, { has_reads: true, has_mtt: true })]);
    await page.goto('/');
    await expect(page.locator('.spot-badge')).toHaveText(['Reads', 'MTT']);
  });
}
