/// <reference lib="dom.iterable" />
/**
 * T-E E-05（prefers-reduced-motion）・E-07（SPOT の演出の動き）。
 * 視差効果を減らす設定（reduce）では、動いているアニメーション・遷移が無いこと。減らさない設定（no-preference）では、
 * 出題の局面の演出（卓の縁が 1 回だけ光る・Hero の席がゆっくり光る）が有限の回数・ゆっくりであること。
 * 結果は test-results-te/motion/*.json。
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { appliesTo, SCENES, setMotion } from './te-scenes.ts';

const OUT = 'test-results-te/motion';
mkdirSync(OUT, { recursive: true });

type Anim = { name: string; target: string; state: string; duration: number; iterations: number; delay: number; property: string };

async function anims(page: Page): Promise<Anim[]> {
  return page.evaluate(() =>
    document.getAnimations().map((a) => {
      const e = a.effect as KeyframeEffect | null;
      const t = e?.getComputedTiming();
      const target = e?.target as HTMLElement | null;
      const cls = target && typeof target.className === 'string' ? target.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
      return {
        name: (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? '',
        target: target ? `${target.tagName.toLowerCase()}${cls ? '.' + cls : ''}` : '?',
        state: a.playState,
        duration: Number(t?.duration ?? 0),
        iterations: Number(t?.iterations ?? 0),
        delay: Number(t?.delay ?? 0),
        property: a.constructor.name,
      };
    }),
  );
}

const MOTION_SCENES = ['answer', 'result-all', 'new-action-btn-open', 'new-full-draft', 'list-loading', 'state-booting', 'new-ocr-busy', 'account-menu', 'list-delete-confirm', 'info-list', 'list-delete-failed-toast', 'new-hand-picker', 'answer-confirm'];

for (const [label, vp, mobile] of [['pc', { width: 1280, height: 800 }, false], ['sp', { width: 390, height: 844 }, true]] as const) {
  test.describe(`E-05 reduce ${label}`, () => {
    test.use({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    for (const id of MOTION_SCENES) {
      const s = SCENES.find((x) => x.id === id);
      if (!s || !appliesTo(s, mobile)) continue;
      test(`${id}`, async ({ page }) => {
        setMotion('reduce');
        await s.open(page, mobile);
        await page.waitForTimeout(400);
        const running = (await anims(page)).filter((a) => a.state === 'running' && a.duration > 1);
        writeFileSync(`${OUT}/reduce__${label}__${id}.json`, JSON.stringify(running, null, 1));
        // 動いているアニメーション（1ms より長いもの）が無い
        expect(running.map((a) => `${a.target} ${a.name} ${a.duration}ms x${a.iterations}`)).toEqual([]);
        // 遷移の長さ（全要素）が 1ms 以下
        const slow = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            const tds = cs.transitionDuration.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000));
            const ads = cs.animationName === 'none' ? [0] : cs.animationDuration.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000));
            const max = Math.max(...tds, ...ads);
            if (max > 1 && cs.transitionProperty !== 'none') {
              const c = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
              out.push(`${el.tagName.toLowerCase()}${c ? '.' + c : ''} ${max}ms`);
            }
          }
          return [...new Set(out)];
        });
        expect(slow, '視差効果を減らす設定でも 1ms を超える遷移・アニメーションがある要素').toEqual([]);
      });
    }
  });

  test.describe(`E-07 動き ${label}（減らさない設定）`, () => {
    test.use({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    for (const id of ['answer', 'result-all', 'answer-flop-multiway']) {
      const s = SCENES.find((x) => x.id === id);
      if (!s || !appliesTo(s, mobile)) continue;
      test(`${id}`, async ({ page }) => {
        setMotion('no-preference');
        await s.open(page, mobile);
        // 演出は局面に来たときに始まる: 開いた直後の 300ms に走っているものを記録する
        await page.waitForTimeout(150);
        const early = await anims(page);
        await page.waitForTimeout(3500);
        const late = await anims(page);
        writeFileSync(`${OUT}/noPref__${label}__${id}.json`, JSON.stringify({ early, late }, null, 1));
        setMotion('reduce');
        const decorative = [...early, ...late].filter((a) => a.state === 'running' || a.state === 'finished');
        // 演出があること（最低 1 つ）と、うるさくないこと（無限に速く繰り返さない: 繰り返すなら 1.5 秒以上の周期）
        expect(decorative.length, '出題の局面の演出のアニメーションが 1 つも走っていない').toBeGreaterThan(0);
        const fast = late.filter((a) => a.state === 'running' && a.iterations === Infinity && a.duration < 1500);
        expect(fast.map((a) => `${a.target} ${a.name} ${a.duration}ms 無限`), '速く無限に繰り返すアニメーション').toEqual([]);
      });
    }
  });
}
