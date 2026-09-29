/// <reference lib="dom.iterable" />
/**
 * T-E E-01（探索）: 高さの低い PC の画面（ブラウザの上部の UI で縮んだ 1366x650 など）と縦長・超ワイドで、
 * 1 画面に収める画面（投稿・回答・集計）がはみ出さず、文字が読める大きさ（実際の大きさ 8px 以上）か。
 */
import { expect, test } from '@playwright/test';
import { layoutIssues } from './te-checks.ts';
import { measureText } from './te-colors.ts';
import { SCENES } from './te-scenes.ts';

const SIZES = [
  [1366, 650], [1280, 600], [1280, 500], [1440, 700], [1024, 500], [1600, 600], [2560, 800], [3440, 1440], [1000, 1400], [800, 1200],
] as const;
const FIT = SCENES.filter((s) => s.fit && !s.only && !s.overlay);

for (const [w, h] of SIZES) {
  test.describe(`高さ ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const s of FIT) {
      test(s.id, async ({ page }) => {
        await s.open(page, false);
        await page.waitForTimeout(300);
        const issues = (await layoutIssues(page, { fit: true, mobile: false, overlay: false })).filter((i) => i.type !== 'text-ellipsis' && i.type !== 'clipped-by-ancestor-x');
        const text = await measureText(page);
        const minPx = Math.min(...text.map((t) => t.fontPx));
        console.log(`${w}x${h} ${s.id}: 最小の文字 ${minPx}px`);
        expect(issues.map((i) => `${i.type}: ${i.detail}`)).toEqual([]);
        expect(minPx, `実際の大きさが 8px 未満の文字（最小 ${minPx}px）`).toBeGreaterThanOrEqual(8);
      });
    }
  });
}
