/**
 * T-D の点検（td-monkey.ts の SNAPSHOT_JS）が、壊れた画面を本当に見つけるかの確認（カナリア）。
 * わざと壊したページを作り、点検が期待した違反を返すことを確かめる。これが通らなければ「違反 0 件」に意味がない。
 */
import { expect, test } from '@playwright/test';
import { makeCfg, setupBackend, SNAPSHOT_JS, type Snapshot } from './td-monkey.ts';

const kinds = (s: Snapshot): string[] => s.problems.map((p) => p.kind);

test('点検が「undefined」「NaN」「[object Object]」・横のはみ出し・重複カードを見つける', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setupBackend(page, makeCfg('post', 1), 1);
  await page.goto('/new');
  await page.getByRole('group', { name: '人数' }).waitFor();

  // 正常: 違反なし
  expect(kinds((await page.evaluate(SNAPSHOT_JS)) as Snapshot)).toEqual([]);

  // 壊す 1: 画面に NaN・undefined・[object Object]、aria-label に undefined、横にはみ出す要素
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.textContent = 'to call NaN / bet undefined / [object Object]';
    d.setAttribute('aria-label', 'x undefined');
    d.style.cssText = 'position:absolute;left:0;top:0;width:3000px';
    document.body.append(d);
  });
  const broken = kinds((await page.evaluate(SNAPSHOT_JS)) as Snapshot);
  expect(broken).toContain('bad-text');
  expect(broken).toContain('bad-attr');
  expect(broken).toContain('overflow-x-pc');
});

test('点検が「PC の投稿でページがスクロールする」を見つける', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setupBackend(page, makeCfg('post', 1), 1);
  await page.goto('/new');
  await page.getByRole('group', { name: '人数' }).waitFor();
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'height:3000px;width:10px';
    document.body.append(d);
  });
  expect(kinds((await page.evaluate(SNAPSHOT_JS)) as Snapshot)).toContain('page-scroll-pc');
});

test('点検が「真っ白」「下書きの重複カード・再生できない Action」「XSS」を見つける', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setupBackend(page, makeCfg('post', 1), 1);
  await page.goto('/new');
  await page.getByRole('group', { name: '人数' }).waitFor();
  // 重複カード（席 BTN と SB に同じ札）
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
  await page.evaluate(`(async () => {
    const store = await import('/src/post/draftStore.ts');
    const d = store.getDraft();
    store.setDraft({ ...d, hands: { ...d.hands, BTN: 'AsKd', SB: 'AsQh' } });
  })()`);
  expect(kinds((await page.evaluate(SNAPSHOT_JS)) as Snapshot)).toContain('dup-card');
  // 下書きに合法でない Action（BTN が最初に Check）を入れても、settleActions で外れるので「再生できない」にはならない（画面が守っている）
  await page.evaluate(`(async () => {
    const store = await import('/src/post/draftStore.ts');
    const d = store.getDraft();
    store.setDraft({ ...d, hands: { ...d.hands, BTN: '', SB: '' }, actions: [{ street: 'pf', pos: 'BTN', type: 'check' }] });
  })()`);
  const s = (await page.evaluate(SNAPSHOT_JS)) as Snapshot;
  expect(kinds(s)).not.toContain('draft-replay');
  // XSS の印
  await page.evaluate(() => ((window as unknown as { __xss?: number }).__xss = 1));
  expect(kinds((await page.evaluate(SNAPSHOT_JS)) as Snapshot)).toContain('xss');
  // 真っ白（ルートの中身を消す）
  await page.evaluate(() => {
    document.getElementById('root')?.replaceChildren();
  });
  expect(kinds((await page.evaluate(SNAPSHOT_JS)) as Snapshot)).toContain('blank');
});

test('点検（スマホ）が「横にはみ出し」を見つける @sp', async ({ page }) => {
  await setupBackend(page, makeCfg('list', 1), 1);
  await page.goto('/');
  await page.waitForSelector('.hdr');
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'width:2000px;height:10px';
    document.body.append(d);
  });
  expect(kinds((await page.evaluate(SNAPSHOT_JS)) as Snapshot)).toContain('overflow-x-sp');
});

test('ウォークの判定（serverJudge）は、正しい本文を通し、壊した本文を断る', async () => {
  const { hs1 } = await import('../../packages/core/src/post/postFixtures.ts');
  const { serverJudge } = await import('./td-walk.ts');
  expect(serverJudge(hs1()).ok).toBe(true);
  const bad = hs1();
  (bad.derived as Record<string, unknown>).pot_base = 22;
  expect(serverJudge(bad).ok).toBe(false);
  expect(serverJudge({ ...hs1(), title: '  ' }).ok).toBe(false);
});
