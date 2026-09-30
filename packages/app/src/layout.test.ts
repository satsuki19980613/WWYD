import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIT_MIN_ZOOM, fitZoom, MOBILE_QUERY, PC_MIN_HEIGHT, PC_MIN_WIDTH, PC_QUERY, STAGE_H, STAGE_W } from './layout.ts';

/**
 * PC とスマホの構成の境目（F-033。17 章 §3.0）。JS の判定（useIsMobile）と CSS のメディアクエリが同じ数を使っているか、
 * 境目の画面で FitStage の倍率が下限ちょうどになるかを確かめる。
 */
describe('構成の境目（layout.ts）', () => {
  it('境目は FitStage の倍率の下限から決まる（927 × 605）', () => {
    expect(PC_MIN_WIDTH).toBe(927);
    expect(PC_MIN_HEIGHT).toBe(605);
    expect(MOBILE_QUERY).toBe(`(max-width: ${PC_MIN_WIDTH - 0.02}px), (max-height: ${PC_MIN_HEIGHT - 0.02}px)`);
    expect(PC_QUERY).toBe(`(min-width: ${PC_MIN_WIDTH}px) and (min-height: ${PC_MIN_HEIGHT}px)`);
    expect(STAGE_W).toBe(1376);
    expect(STAGE_H).toBe(800);
  });

  it('PC の構成になる最小の画面では、倍率は下限以上。1px 小さいと下限を下回る', () => {
    expect(fitZoom(PC_MIN_WIDTH, 2000)).toBeGreaterThanOrEqual(FIT_MIN_ZOOM);
    expect(fitZoom(2000, PC_MIN_HEIGHT)).toBeGreaterThanOrEqual(FIT_MIN_ZOOM);
    expect(fitZoom(PC_MIN_WIDTH - 1, 2000)).toBeLessThan(FIT_MIN_ZOOM);
    expect(fitZoom(2000, PC_MIN_HEIGHT - 1)).toBeLessThan(FIT_MIN_ZOOM);
  });

  it.each([
    [1024, 640, true],
    [1280, 800, true],
    [1440, 900, true],
    [1920, 1080, true],
    [768, 1024, false],
    [915, 412, false],
    [800, 600, false],
  ])('%i×%i は PC の構成か: %s', (w, h, pc) => {
    expect(w >= PC_MIN_WIDTH && h >= PC_MIN_HEIGHT).toBe(pc);
    expect(fitZoom(w, h) >= FIT_MIN_ZOOM).toBe(pc);
  });

  it('CSS のメディアクエリは PC とスマホの境目に同じ数を使い、前の 700px の境目が残っていない', () => {
    const dir = resolve(__dirname, 'styles');
    const css = readdirSync(dir)
      .filter((n) => n.endsWith('.css'))
      .map((n) => ({ n, s: readFileSync(resolve(dir, n), 'utf-8') }));
    for (const { n, s } of css) {
      expect(s, n).not.toMatch(/@media[^{]*(699\.98|700)px/);
    }
    const all = css.map((c) => c.s).join('\n');
    const media = Array.from(all.matchAll(/@media ([^{]+)\{/g), (m) => (m[1] ?? '').trim());
    // PC / スマホの構成の切り替えに使うクエリは、この 2 つ（と、PC の中の広さの段）だけ
    expect(media.filter((q) => q === PC_QUERY).length).toBeGreaterThanOrEqual(3);
    expect(media.filter((q) => q === MOBILE_QUERY).length).toBeGreaterThanOrEqual(3);
    for (const q of media) {
      if (q.includes('927') || q.includes('926.98')) expect([PC_QUERY, MOBILE_QUERY], q).toContain(q);
    }
  });
});
