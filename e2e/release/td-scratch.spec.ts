import { test } from '@playwright/test';
import { ID, makeCfg, setupBackend } from './td-monkey.ts';

test('scratch', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const screen of ['answer', 'result', 'post'] as const) {
    const cfg = makeCfg(screen, 2);
    await setupBackend(page, cfg, 2);
    for (const [w, h] of [[1024, 640], [915, 412], [812, 375], [800, 600], [700, 500], [1280, 400], [1280, 300], [700, 900]]) {
      await page.setViewportSize({ width: w!, height: h! });
      await page.goto(screen === 'post' ? '/new' : `/s/${ID}/${screen}`);
      await page.waitForSelector('.hdr');
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const tall = [...document.querySelectorAll('body *')]
          .filter((e) => e.getBoundingClientRect().bottom > window.innerHeight + 1)
          .slice(0, 4)
          .map((e) => e.tagName + '.' + String((e as HTMLElement).className).slice(0, 30) + ' bottom=' + Math.round(e.getBoundingClientRect().bottom));
        const hdr = document.querySelector('.hdr')?.getBoundingClientRect().height;
        const fit = document.querySelector('.fit-outer')?.getBoundingClientRect();
        return { sh: de.scrollHeight, ih: window.innerHeight, hdr, fit: fit && [Math.round(fit.top), Math.round(fit.height)], tall };
      });
      console.log(screen, w, h, JSON.stringify(r));
    }
  }
});
