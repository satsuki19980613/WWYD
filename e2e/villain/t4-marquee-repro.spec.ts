/**
 * T4（探索で見つけた不具合の再現）: 「動きを減らす」設定の端末で、ヘッダーの投稿のタイトルが画面の幅にわずかに収まらない長さのとき、
 * Marquee（packages/app/src/components/Marquee.tsx）が static ⇔ clip の表示を同期的に行き来して React の
 * 「Maximum update depth exceeded」になり、アプリ全体が真っ白になる（ヘッダーの h1 も消える）。
 * 探索（t4-marquee-sweep.spec.ts）で見つけた、落ちる（幅・文字・長さ）の組。直れば通る（VR1 では落ちる）。
 * 原因の推定: 表示の形（static / clip）で箱の幅が変わる（clip の箱は h1 の flex の中で縮む）ので、測った溢れ量が形ごとに違い、
 * 「溢れている（over > 1）→ clip → 溢れていない（over ≤ 1）→ static → 溢れている …」と収束しない。
 */
import { expect, test } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';

const CASES: { w: number; ch: string; n: number }[] = [
  { w: 412, ch: 'W', n: 15 },
  { w: 390, ch: 'あ', n: 11 },
  { w: 360, ch: 'i', n: 33 },
];

for (const c of CASES) {
  test.describe(`Marquee の境目（幅 ${c.w}・「${c.ch}」×${c.n}）`, () => {
    test.use({ viewport: { width: c.w, height: 900 }, reducedMotion: 'reduce' });
    test('動きを減らす設定でも、ヘッダーのタイトルが出てアプリが落ちない', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && /Maximum update depth/.test(m.text())) errors.push(m.text().slice(0, 80));
      });
      await fakeBackend(page, detailJson({ ...hs1bb(), title: c.ch.repeat(c.n) }, { viewer: 'unanswered', id: ID }));
      await page.goto(`/s/${ID}/answer`);
      await page.waitForTimeout(300);
      await expect(page.locator('header h1')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  });
}
