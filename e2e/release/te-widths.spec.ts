/// <reference lib="dom.iterable" />
/**
 * T-E E-01（探索）: 10 種類の大きさの間の幅（スマホ用と PC 用の境界 700px の前後・320px・タブレットの幅）で、主要な場面のはみ出し・潰れを見る。
 * 結果は test-results-te/e01w/*.json。
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { layoutIssues, type Issue } from './te-checks.ts';
import { appliesTo, isMobileWidth, sceneById } from './te-scenes.ts';

const OUT = 'test-results-te/e01w';
const SHOTS = 'test-results-te/shots-widths';
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const WIDTHS = [320, 360, 480, 600, 699, 700, 720, 740, 768, 800, 850, 900, 1000, 1100, 1200, 1300];
const SCENES = ['login', 'list-rows', 'list-mine', 'list-empty-mine', 'drafts-3', 'terms', 'new-full-draft', 'new-players6', 'answer', 'result-all', 'result-author', 'info-list', 'account-menu'];

for (const w of WIDTHS) {
  const mobile = isMobileWidth(w);
  test.describe(`E-01w ${w}`, () => {
    test.use({ viewport: { width: w, height: 800 }, isMobile: mobile, hasTouch: mobile });
    for (const id of SCENES) {
      const s = sceneById(id);
      if (!appliesTo(s, mobile)) continue;
      test(id, async ({ page }) => {
        await s.open(page, mobile);
        await page.waitForTimeout(300);
        const issues: Issue[] = await layoutIssues(page, { fit: Boolean(s.fit), mobile, overlay: Boolean(s.overlay) });
        const bad = issues.filter((i) => i.type !== 'text-ellipsis');
        writeFileSync(`${OUT}/${w}__${id}.json`, JSON.stringify({ size: String(w), scene: id, issues }, null, 1));
        if (bad.length > 0) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `${SHOTS}/${w}__${id}.png` });
        }
        expect(bad, bad.map((i) => `${i.type}: ${i.detail}`).join('\n')).toEqual([]);
      });
    }
  });
}
