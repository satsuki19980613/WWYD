/// <reference lib="dom.iterable" />
/**
 * T-E E-04: UI コンセプトの色の役割（赤 = Fold・エラー・削除だけ、黄 = 主要な操作・選択・アグレッシブな Action、シアン = 情報・操作系・パッシブな Action）。
 * 全場面（PC・スマホ）の計算した色（getComputedStyle）を集めて test-results-te/colors/*.json に残す。
 * 赤の使われ方は、許される要素（下の RED_OK）以外があれば失敗にする。黄・シアンは一覧を te-color-report.mjs で目で確かめる。
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { collectColors, type ColorItem } from './te-colors.ts';
import { appliesTo, SCENES } from './te-scenes.ts';

const OUT = 'test-results-te/colors';
mkdirSync(OUT, { recursive: true });

/**
 * 赤に許される要素（クラスの断片）。Fold のマス・バー・凡例、エラー、削除、破壊的な操作、
 * 4 色デッキの ♥♦（札の実色。UI コンセプトの例外）。
 */
export const RED_OK = [
  'fold', // Fold の色（cseg.fold・cdot.fold・cell の fold・Fold のタイル）
  'form-err', 'pf-errors', 'err', 'toast', // エラー
  'danger', 'red', 'spot-del', 'ad-tool', // 削除・破壊的
  'pcard', 'suit', // 札の実色
  'brk tone-error', 'tone-error', 'tone-danger', // エラーの状態・破壊的ダイアログ
];

export const isRedOk = (c: ColorItem): boolean => {
  const hay = `${c.el} ${c.ancestors}`;
  return RED_OK.some((k) => hay.includes(k));
};

for (const [label, vp, mobile] of [['pc', { width: 1280, height: 800 }, false], ['sp', { width: 390, height: 844 }, true]] as const) {
  test.describe(`E-04 colors ${label}`, () => {
    test.use({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    for (const s of SCENES) {
      if (!appliesTo(s, mobile)) continue;
      test(s.id, async ({ page }) => {
        await s.open(page, mobile);
        await page.waitForTimeout(300);
        const colors = await collectColors(page);
        writeFileSync(`${OUT}/${label}__${s.id}.json`, JSON.stringify({ label, scene: s.id, colors }, null, 1));
        const badRed = colors.filter((c) => c.family === 'red' && !isRedOk(c));
        expect(badRed.map((c) => `${c.el} [${c.prop}] rgb(${c.rgb}) a=${c.alpha} "${c.text}" < ${c.ancestors}`), '赤が Fold・エラー・削除・札の実色以外に使われている').toEqual([]);
      });
    }
  });
}
