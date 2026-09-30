/**
 * T4（探索）: ヘッダーの投稿のタイトル（Marquee）の境目。収まるか収まらないかの境目の幅のタイトルで、
 * 「動きを減らす」設定の端末（clip の表示）が、収まる表示と収まらない表示を行き来して React の更新の上限（Maximum update depth）で
 * アプリが真っ白になることがないか。タイトルの長さ（1〜40 文字）× 文字の種類 × 画面の幅で回し、落ちたものを表示する。
 * 落ちたら、その長さ・文字・幅を種として報告する。T4_SWEEP=1 T4_OUT=結果のファイル E2E_PORT=… npx playwright test e2e/villain/t4-marquee-sweep.spec.ts --project=pc
 */
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const CHARS = ['あ', 'W', 'i'];
const WIDTHS: [number, number][] = [[360, 740], [390, 844], [412, 915], [1280, 800]];

for (const motion of ['reduce', 'no-preference'] as const) {
  test(`Marquee の境目: 長さ 1〜40 × 文字 × 幅で真っ白にならない（${motion}）`, async ({ browser }) => {
    // 10 分ほどかかる探索なので、環境変数 T4_SWEEP=1 のときだけ回す（結果は T4_OUT のファイルに足す）
    test.skip(!process.env['T4_SWEEP'], '探索（T4_SWEEP=1 で実行）');
    test.setTimeout(900_000);
    const crashes: string[] = [];
    for (const [w, h] of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: motion });
      const page = await ctx.newPage();
      const errs: string[] = [];
      page.on('pageerror', (e) => errs.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && /Maximum update depth/.test(m.text())) errs.push(m.text().slice(0, 60));
      });
      const be = await fakeBackend(page, null);
      for (const ch of CHARS) {
        for (let n = 1; n <= 40; n++) {
          const title = ch.repeat(n).trim() === '' ? 'x' : ch.repeat(n).slice(0, 40).trim();
          be.detail = detailJson({ ...hs1bb(), title }, { viewer: 'unanswered', id: ID });
          errs.length = 0;
          await page.goto(`/s/${ID}/answer`);
          await page.locator('header').waitFor();
          await page.waitForTimeout(150);
          const blank = (await page.locator('header h1').count()) === 0;
          if (blank || errs.length > 0) crashes.push(`${motion} ${w}x${h} 「${ch}」×${n} (${[...title].length}字): ${blank ? '真っ白' : ''} ${errs[0] ?? ''}`);
        }
      }
      await ctx.close();
    }
    try {
      writeFileSync(process.env['T4_OUT'] ?? 'marquee-sweep.log', `Marquee 境目 ${motion}: 落ちた ${crashes.length} 件\n${crashes.join('\n')}\n`, { flag: 'a' });
    } catch {
      /* 書けなくても試験は続ける */
    }
    expect(crashes).toEqual([]);
  });
}
