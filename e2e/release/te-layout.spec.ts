/**
 * T-E E-01: 10 種類の画面の大きさ × 全場面で、はみ出し・重なり・切れを機械的に確かめる。
 * PC の投稿・回答・集計は 1 画面に収まる（17 章 §3.0）。結果は test-results-te/e01/*.json に残す（te-summary.mjs でまとめる）。
 * 情報だけの種類（text-ellipsis）は失敗にしない（長いタイトルの省略は仕様）。
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { layoutIssues, type Issue } from './te-checks.ts';
import { appliesTo, isMobileWidth, SCENES, SIZES } from './te-scenes.ts';

const OUT = 'test-results-te/e01';
const SHOTS = 'test-results-te/shots-layout';
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const INFO_ONLY = new Set(['text-ellipsis']);

for (const size of SIZES) {
  const mobile = isMobileWidth(size.w);
  test.describe(`E-01 ${size.name}`, () => {
    test.use({ viewport: { width: size.w, height: size.h }, isMobile: mobile, hasTouch: mobile });
    for (const s of SCENES) {
      if (!appliesTo(s, mobile)) continue;
      test(`${s.id}`, async ({ page }) => {
        await s.open(page, mobile);
        await page.waitForTimeout(300);
        const issues: Issue[] = await layoutIssues(page, { fit: Boolean(s.fit), mobile, overlay: Boolean(s.overlay) });

        const bad = issues.filter((i) => !INFO_ONLY.has(i.type));
        writeFileSync(`${OUT}/${size.name}__${s.id}.json`, JSON.stringify({ size: size.name, scene: s.id, issues }, null, 1));
        if (bad.length > 0) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `${SHOTS}/${size.name}__${s.id}.png` });
        }
        expect(bad, bad.map((i) => `${i.type}: ${i.detail}`).join('\n')).toEqual([]);
      });
    }
  });
}
