/// <reference lib="dom.iterable" />
/**
 * T-E: すべての場面が PC・スマホで開けるか（場面の定義の確認）と、スクリーンショットの保存（test-results-te/shots）。
 */
import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { appliesTo, SCENES } from './te-scenes.ts';

const OUT = 'test-results-te/shots';
mkdirSync(OUT, { recursive: true });

for (const [label, vp, mobile] of [['pc', { width: 1280, height: 800 }, false], ['sp', { width: 390, height: 844 }, true]] as const) {
  test.describe(`smoke ${label}`, () => {
    test.use({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    for (const s of SCENES) {
      if (!appliesTo(s, mobile)) continue;
      test(`${s.id}`, async ({ page }) => {
        await s.open(page, mobile);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${OUT}/${label}-${s.id}.png` });
      });
    }
  });
}
