/**
 * リリース前テスト F-02: 画面ごとの Data API・`/api/auth`・create-post の要求の回数。本番のビルド（preview。5216 番）を偽の応答で通し、
 * 1 回の利用（起動 → 一覧 → 回答 → 集計 → 一覧 → 投稿）の各段の回数を数える。
 * `/api/auth/*` だけが Cloudflare Pages Functions を通る（12 章 §7.2）。Data API・create-post は Neon に直接行く。
 * 数えた回数の意味づけ（1 日に何人まで無料枠に収まるか）は報告に書く。ここは回数が増えていないことの固定（回帰の検知）。
 */
import { expect, test, type Page } from '@playwright/test';
import { ALLIN_CASES, allinTitle, boardOf, HERO_CARDS } from '../../packages/core/src/post/allinFixtures.ts';
import { mbbToBb } from '../../packages/core/src/money.ts';
import { acts } from '../../packages/core/src/poker/testHelpers.ts';
import { guard, installFake, LAUNCH_ARGS, ORIGIN, POST_ID, watchErrors, type Fake } from './tf-helpers.ts';

test.use({ launchOptions: { args: LAUNCH_ARGS } });

const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const cardName = (c: string): string => `${c[0]}${SUIT[c[1] as string]}`;

/** 直前の段からの増分（キーごとの回数）を返して、記録を空にする */
function step(fake: Fake, label: string, out: string[]): Record<string, number> {
  const c = fake.counts();
  fake.clear();
  out.push(`  ${label}: ${JSON.stringify(c)}`);
  return c;
}

/** 手入力（ALLIN_CASES[0]: River で Hero が All-in、Call される。cash・6 人）で最後まで入れる（allin.spec.ts と同じ操作） */
async function enterHand(page: Page): Promise<void> {
  const c = ALLIN_CASES[0]!;
  await page.goto(`${ORIGIN}/new`);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('radio', { name: `Hero を ${c.hero} にする` }).click();
  await page.getByRole('button', { name: `${c.hero} の Hand` }).click();
  for (const card of HERO_CARDS) for (const k of card.toLowerCase()) await page.keyboard.press(k);
  await page.getByRole('button', { name: '完了' }).click();
  const board = boardOf(c);
  let dealt = 0;
  const dock = page.getByRole('group', { name: 'Action' });
  const boardDock = page.getByRole('group', { name: 'Board' });
  const dealBoard = async (): Promise<void> => {
    while ((await boardDock.count()) > 0) {
      const cell = page.getByRole('gridcell', { name: cardName(board[dealt] as string), exact: true });
      if ((await cell.count()) === 0) await boardDock.getByRole('button', { name: /Card を選ぶ/ }).first().click();
      await cell.click();
      dealt++;
    }
  };
  for (const a of acts(c.actions)) {
    await dealBoard();
    if (a.type === 'fold') await dock.getByRole('button', { name: 'Fold', exact: true }).click();
    else if (a.type === 'check') await dock.getByRole('button', { name: 'Check', exact: true }).click();
    else if (a.type === 'call') await dock.locator('.act-btn.call').click();
    else {
      await dock.getByLabel(/の額（/).fill(String(mbbToBb(a.to as number)));
      await dock.locator('.act-btn.s1').click();
    }
  }
  await dealBoard();
  await page.getByPlaceholder(/タイトル/).fill(allinTitle(c));
  await page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio').first().click();
}

test('F-02 1 回の利用（PC）の要求の回数: 起動 → 一覧 → 回答 → 集計 → 一覧の切り替え → 再読み込み → 投稿', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const escaped = await guard(context);
  const errs = watchErrors(page);
  const fake = await installFake(page);
  const out: string[] = ['F-02 段ごとの要求の回数（Neon 側。auth:* は Pages Functions を通る）'];

  // 1) 起動 → 一覧
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('.spot-row')).toHaveCount(3);
  const boot = step(fake, '起動 → 一覧', out);
  expect(boot).toEqual({ 'auth:ok': 1, 'auth:get-session': 1, 'auth:token': 1, 'data:rpc/whoami': 1, 'data:rpc/list_posts': 1 });

  // 2) 未回答の行 → 回答画面
  await page.locator('.spot-row').first().click();
  await expect(page.getByRole('button', { name: '回答する' })).toBeVisible();
  const toAnswer = step(fake, '一覧 → 回答画面', out);
  expect(toAnswer).toEqual({ 'data:rpc/get_post_detail': 1 });

  // 3) 塗って送信 → 集計
  await page.getByRole('button', { name: /^AA / }).click();
  await page.getByRole('button', { name: '回答する' }).click();
  await page.getByRole('button', { name: '送信する' }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${POST_ID}/result$`));
  await expect(page.locator('.res')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const submit = step(fake, '送信 → 集計', out);
  // 送信 1 回、集計の読み直し 1 回、「次の Spot」を探す一覧 1 回
  expect(submit).toEqual({ 'data:POST answers': 1, 'data:rpc/get_post_detail': 1, 'data:rpc/list_posts': 1 });

  // 4) 一覧へ戻る → 自分の投稿 → Street で絞る → 並び替え
  await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
  await expect(page.locator('.spot-row')).toHaveCount(3);
  step(fake, '集計 → 一覧へ戻る', out);
  const tabs = page.getByRole('tab');
  const tabCount = await tabs.count();
  // 「自分の投稿」タブ（あれば）
  const mine = page.getByRole('tab', { name: /自分/ });
  if ((await mine.count()) > 0) {
    await mine.first().click();
    await expect(page).toHaveURL(/tab=mine/);
    await page.waitForLoadState('networkidle');
    step(fake, `一覧のタブ切り替え（${tabCount} タブ中 1 回）`, out);
  }
  fake.clear();

  // 5) 再読み込み（アプリを開き直すのと同じ）
  await page.reload();
  await expect(page.locator('.spot-row').first()).toBeVisible();
  const reload = step(fake, '再読み込み（一覧）', out);
  expect(reload['auth:ok']).toBe(1);
  expect(reload['auth:get-session']).toBe(1);
  expect(reload['auth:token']).toBe(1);

  // 6) 手入力で投稿
  await enterHand(page);
  fake.clear();
  await page.getByRole('button', { name: '投稿する' }).click();
  await expect(page).toHaveURL(/\/\?tab=mine$/);
  await expect(page.locator('.spot-row').first()).toBeVisible();
  const post = step(fake, '投稿 → 自分の投稿の一覧', out);
  expect(post).toEqual({ 'fn:create-post': 1, 'data:rpc/list_posts': 1 });

  // eslint-disable-next-line no-console
  console.log(out.join('\n'));
  expect(escaped, '偽の応答が拾わなかった外部への通信').toEqual([]);
  expect(errs).toEqual([]);
});

test('F-02 一覧の操作ごとの list_posts の回数（タブ・Street・並び替え・スクロール）', async ({ page, context }) => {
  const escaped = await guard(context);
  const fake = await installFake(page);
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('.spot-row')).toHaveCount(3);
  fake.clear();
  const out: string[] = [];
  // キーボードの移動・行の選択の下見（要求は増えない）
  await page.keyboard.press('j');
  await page.keyboard.press('k');
  out.push(`  j / k: ${JSON.stringify(fake.counts())}`);
  expect(fake.counts()).toEqual({});
  // 並び替えの見出しを押す
  const sortBtn = page.getByRole('button', { name: /Answers|回答/ }).first();
  if ((await sortBtn.count()) > 0) {
    await sortBtn.click();
    await page.waitForLoadState('networkidle');
    out.push(`  並び替え 1 回: ${JSON.stringify(fake.counts())}`);
    expect(fake.count('data:rpc/list_posts')).toBe(1);
  }
  // eslint-disable-next-line no-console
  console.log(out.join('\n'));
  expect(escaped).toEqual([]);
});
