/**
 * T-A（探索）: 利用者が付けるタイトル（40 文字まで。任意の文字）が、一覧・回答・集計・下書きで崩れない・注入されない。
 * 幅の広い文字・空白なしの長い文字・絵文字・結合文字・右から左の文字・HTML 風の文字列。ページが横にはみ出さない。タイトルは HTML として解釈しない。
 */
import { expect, test } from '@playwright/test';
import { aggregateHex, detailJson, paintHexOf, paintOf } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';
import { fakeList, row, watchErrors } from './taKit.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const TITLES = [
  'W'.repeat(40),
  'あ'.repeat(40),
  '😀'.repeat(40),
  'é'.repeat(20),
  'אבגדהוזחטיכלמנסעפצקרשת'.repeat(2),
  '<img src=x onerror="window.__xss=1"><b>太字</b>',
  '"><script>window.__xss=1</script>',
  '&lt;b&gt; &amp; ‮evil‬',
  'a'.repeat(40),
  '    ',
];

for (const v of ['', ' @sp'] as const) {
  test(`タイトルの表示（一覧・回答・集計・下書き）: はみ出さない・HTML として解釈しない・落ちない${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const raw = hs1bb();
    for (const [i, title] of TITLES.entries()) {
      const be = await fakeBackend(page, detailJson({ ...raw, title }, { viewer: 'unanswered', id: ID }));
      void be;
      if (i === 0) {
        await fakeList(page, TITLES.map((t, n) => row(n + 1, { title: t })));
      }
      // 回答画面
      await page.goto(`/s/${ID}/answer`);
      await expect(page.locator('.ans-title')).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `回答 ${JSON.stringify(title)}`).toBe(true);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
    // 集計
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const agg = aggregateHex([paintOf({ AA: { call: 20 } })]);
    for (const title of TITLES.slice(0, 4)) {
      await fakeBackend(page, detailJson({ ...raw, title }, { viewer: 'answered', id: ID, answerCount: 1, aggregate: agg, myAnswer: { paint: paintHexOf({ AA: { call: 20 } }), size: null } }));
      await page.goto(`/s/${ID}/result`);
      await expect(page.getByRole('button', { name: 'AA', exact: true })).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `集計 ${JSON.stringify(title)}`).toBe(true);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
    // 一覧
    await fakeBackend(page, null);
    await fakeList(page, TITLES.map((t, n) => row(n + 1, { title: t })));
    await page.goto('/');
    await expect(page.locator('.spot-link').first()).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '一覧').toBe(true);
    // HTML として解釈していない: 注入した要素も実行もない
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.locator('.spot-link script, .spot-link b').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(errors).toEqual([]);
  });
}
