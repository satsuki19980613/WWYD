/**
 * T-E E-06: 文字の大きさ・色のコントラスト（4.5:1、大きい文字は 3:1。無効のボタンは対象外）・スマホのタップの大きさ。
 * 計算した色（getComputedStyle）で測る。背景がグラデーション・画像のものは最初の色で近似するので目安。
 * 結果は test-results-te/contrast/*.json、te-contrast-report.mjs でまとめる。
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { measureTargets, measureText } from './te-colors.ts';
import { appliesTo, SCENES } from './te-scenes.ts';

const OUT = 'test-results-te/contrast';
mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['pc1280', { width: 1280, height: 800 }, false],
  ['pc1024', { width: 1024, height: 640 }, false],
  ['tab768', { width: 768, height: 1024 }, false],
  ['sp390', { width: 390, height: 844 }, true],
  ['sp375', { width: 375, height: 667 }, true],
] as const;

for (const [label, vp, mobile] of VIEWS) {
  test.describe(`E-06 ${label}`, () => {
    test.use({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    for (const s of SCENES) {
      if (!appliesTo(s, mobile)) continue;
      // 768 と 1024 は 1 画面に収める画面（縮小されて文字が小さくなる）と代表だけ
      if ((label === 'pc1024' || label === 'tab768') && !s.fit && !['list-rows', 'login'].includes(s.id)) continue;
      if (label === 'sp375' && !s.fit && !['list-rows', 'login', 'drafts-3'].includes(s.id)) continue;
      test(s.id, async ({ page }) => {
        await s.open(page, mobile);
        await page.waitForTimeout(300);
        const text = await measureText(page);
        const targets = mobile ? await measureTargets(page) : [];
        writeFileSync(`${OUT}/${label}__${s.id}.json`, JSON.stringify({ label, scene: s.id, text, targets }, null, 1));
        const low = text.filter((t) => !t.disabled && t.ratio < (t.large ? 3 : 4.5));
        expect(low.map((t) => `${t.el} "${t.text}" ${t.ratio}:1 (${t.fontPx}px) fg=${t.fg} bg=${t.bg}`), '文字のコントラスト不足（4.5:1、大きい文字は 3:1）').toEqual([]);
        const tiny = text.filter((t) => t.fontPx < 9);
        expect(tiny.map((t) => `${t.el} "${t.text}" ${t.fontPx}px`), '実際の大きさが 9px 未満の文字').toEqual([]);
        if (mobile) {
          const small = targets.filter((t) => Math.min(t.w, t.h) < 32);
          expect(small.map((t) => `${t.el} "${t.label}" ${t.w}x${t.h}`), 'タップの大きさが 32px 未満').toEqual([]);
        }
      });
    }
  });
}
