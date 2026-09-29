/**
 * オールインを含むハンドの投稿の E2E（2026-09-29 さつき「オールインも他のアクションと変わらない」）。
 * 見本（packages/core/src/post/allinFixtures.ts の 22 通り）を画面の操作どおりに入れ、
 * Spot の候補が Flop 以降の Hero の手番すべて（オールインも、その前の手番も）になることと、
 * どの候補を選んでも投稿できることを確かめる。
 * 投稿は本物の create-post の処理（createPostHandler。検証は packages/core）に通し、DB への保存だけを偽にする。
 */
import { expect, test, type Page } from '@playwright/test';
import type { Pos } from '../packages/core/src/constants.ts';
import { mbbToBb } from '../packages/core/src/money.ts';
import { ALLIN_CASES, allinTitle, boardOf, HERO_CARDS, type AllinCase } from '../packages/core/src/post/allinFixtures.ts';
import { acts } from '../packages/core/src/poker/testHelpers.ts';
import { createPostHandler, DbError } from '../packages/functions/src/createPost/handler.ts';
import type { InsertPayload } from '../packages/functions/src/createPost/payload.ts';
import { fakeBackend } from './fakeBackend.ts';

const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const cardName = (c: string): string => `${c[0]}${SUIT[c[1] as string]}`;

/**
 * create-post を本物の処理に通す。保存は `saved` に記録し、`last` でなければ 1 日の上限（daily_limit）として断る
 * （検証を通ったあとの DB の拒否なので、画面は投稿の画面に留まり、次の候補も試せる）。
 */
async function realCreatePost(page: Page, saved: InsertPayload[], last: () => boolean): Promise<void> {
  const handler = createPostHandler({
    verifyToken: async () => '11111111-1111-4111-8111-111111111111',
    insertPost: async (_uid, payload) => {
      saved.push(payload);
      if (!last()) throw new DbError('daily_limit');
      return 'post-id';
    },
    allowedOrigins: ['http://localhost:5174'],
  });
  await page.route('http://fn.e2e.test/**', async (route) => {
    const req = route.request();
    const res = await handler(
      new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined }),
    );
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    await route.fulfill({ status: res.status, headers, body: await res.text() });
  });
}

/** ハンドを入れる。受け付けない Action（`refusedAt`）で止まったら false */
async function enterHand(page: Page, c: AllinCase): Promise<boolean> {
  const stacks = c.stacks ?? { UTG: 100, HJ: 100, CO: 100, BTN: 100, SB: 100, BB: 100 };
  const seats = Object.keys(stacks) as Pos[];
  await page.goto('/new');
  if (c.fmt === 'mtt') await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
  if (c.ante) await page.getByLabel('Ante（bb）').fill(String(c.ante));
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: String(seats.length), exact: true }).click();
  for (const p of seats) if (stacks[p] !== 100) await page.getByLabel(`${p} の Stack（bb）`).fill(String(stacks[p]));
  await page.getByRole('radio', { name: `Hero を ${c.hero} にする` }).click();
  await page.getByRole('button', { name: `${c.hero} の Hand` }).click();
  for (const card of HERO_CARDS) for (const k of card.toLowerCase()) await page.keyboard.press(k);
  await page.getByRole('button', { name: '完了' }).click();

  const board = boardOf(c);
  let dealt = 0;
  const dock = page.getByRole('group', { name: 'Action' });
  const boardDock = page.getByRole('group', { name: 'Board' });
  // ストリートが終わったら（ランアウトも）ボードのカードを選ぶ
  const dealBoard = async (): Promise<void> => {
    while ((await boardDock.count()) > 0) {
      const cell = page.getByRole('gridcell', { name: cardName(board[dealt] as string), exact: true });
      if ((await cell.count()) === 0) await boardDock.getByRole('button', { name: /Card を選ぶ/ }).first().click();
      await cell.click();
      dealt++;
    }
  };

  for (const [i, a] of acts(c.actions).entries()) {
    await dealBoard();
    await expect(dock.locator('.ad-pos')).toHaveText(a.pos);
    if (i === c.refusedAt) {
      // Preflop で All-in になる Action は受け付けず、エラーを出して同じ手番のまま
      await dock.getByLabel(/の額（/).fill(String(mbbToBb(a.to as number)));
      await dock.locator('.act-btn.s1').click();
      await expect(page.getByText('Preflop で All-in になった Hand は投稿できません')).toBeVisible();
      await expect(dock.locator('.ad-pos')).toHaveText(a.pos);
      return false;
    }
    if (a.type === 'fold') await dock.getByRole('button', { name: 'Fold', exact: true }).click();
    else if (a.type === 'check') await dock.getByRole('button', { name: 'Check', exact: true }).click();
    else if (a.type === 'call') await dock.locator('.act-btn.call').click();
    else {
      await dock.getByLabel(/の額（/).fill(String(mbbToBb(a.to as number)));
      await dock.locator('.act-btn.s1').click();
    }
  }
  await dealBoard();
  expect(dealt).toBe(board.length);
  return true;
}

for (const c of ALLIN_CASES) {
  test(`オールイン: ${c.name}`, async ({ page }) => {
    await fakeBackend(page, null);
    const saved: InsertPayload[] = [];
    let isLast = false;
    await realCreatePost(page, saved, () => isLast);
    if (!(await enterHand(page, c))) return;
    await expect(page.getByText(/Pot 獲得|Showdown/).first()).toBeVisible();

    // Spot の候補（Flop 以降の Hero の手番すべて）
    const group = page.getByRole('radiogroup', { name: 'Hero の Action' });
    if (c.spots.length === 0) {
      await expect(group).toHaveCount(0);
      await expect(page.getByText('候補なし')).toBeVisible();
      return;
    }
    const radios = group.getByRole('radio');
    await expect(radios).toHaveText(c.spots.map(([label]) => label));
    await page.getByPlaceholder(/タイトル/).fill(allinTitle(c));

    // どの候補を選んでも、本物の create-post の検証を通って保存まで進む
    const n = c.spots.length;
    for (let i = 0; i < n; i++) {
      isLast = i === n - 1;
      await radios.nth(i).click();
      await expect(radios.nth(i)).toHaveAttribute('aria-checked', 'true');
      await page.getByRole('button', { name: '投稿する' }).click();
      await expect.poll(() => saved.length).toBe(i + 1);
      const p = saved[i] as InsertPayload;
      expect(p.keys.join(','), c.spots[i]?.[0]).toBe(c.spots[i]?.[1]);
      if (!isLast) await expect(page.getByRole('alert')).toContainText('上限');
    }
    // 最後の候補は保存でき、自分の投稿の一覧へ
    await expect(page).toHaveURL('/?tab=mine');
  });
}
