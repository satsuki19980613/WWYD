/**
 * T-E E-02（不変条件 1: 画面に説明文を出さない）・E-03（不変条件 2: ポーカー用語は英語）。
 * 全場面（PC 1280x800・スマホ 390x844）の文字（見える文字・aria-label・placeholder・title）を集めて test-results-te/texts/*.json に残し、
 *  - 説明文らしい文が、許される面（エラー・トースト・プレースホルダー・ログイン画面の 1 行・ⓘ のモーダル・規約）以外にあれば失敗、
 *  - 15 章の用語表のカタカナ表記がどこかにあれば失敗、とする。
 * 確認ダイアログの本文（06 章 §0.4）は仕様に定めがあるので別扱いにして、一覧に出す（te-text-report.mjs）。
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { collectTexts, type TextItem } from './te-checks.ts';
import { appliesTo, SCENES, USER_TITLES } from './te-scenes.ts';
import { katakanaViolations } from './te-terms.ts';

const OUT = 'test-results-te/texts';
mkdirSync(OUT, { recursive: true });

/** 説明文らしい表現（「〜してください」「〜できます」「〜します」「〜です。」など） */
export const SENTENCE = /(してください|ください|できます|できません|されます|されません|します|しました|しています|ています|です。|ます。|ました。|しましょう|。(?!bb))/;

/** 説明文が許される面: エラー・トースト・ログイン画面の 1 行・ⓘ・規約・読み上げ専用 */
const ALLOWED_CTX = new Set(['error', 'toast', 'toast-error', 'login-line', 'info-modal', 'legal', 'sr-only', 'document']);

for (const [label, vp, mobile] of [['pc', { width: 1280, height: 800 }, false], ['sp', { width: 390, height: 844 }, true]] as const) {
  test.describe(`E-02/03 texts ${label}`, () => {
    test.use({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    for (const s of SCENES) {
      if (!appliesTo(s, mobile)) continue;
      test(s.id, async ({ page }) => {
        await s.open(page, mobile);
        await page.waitForTimeout(300);
        const items: TextItem[] = await collectTexts(page);
        writeFileSync(`${OUT}/${label}__${s.id}.json`, JSON.stringify({ label, scene: s.id, items }, null, 1));

        // E-02: 説明文らしい文が許されない面にある
        const sentences = items.filter(
          (i) => !ALLOWED_CTX.has(i.ctx) && i.kind !== 'placeholder' && SENTENCE.test(i.text) && i.ctx !== 'confirm-dialog' && !i.ctx.startsWith('dialog('),
        );
        expect(sentences.map((i) => `[${i.ctx}/${i.kind}] ${i.text}`), '説明文らしい文（許される面の外）').toEqual([]);

        // E-03: カタカナのポーカー用語（どの面でも）
        // 利用者が書くタイトル（見本のもの）は置き換えない（15 章 §2）。規約・プライバシーポリシーは下の別の試験
        const kata = items.filter((i) => i.ctx !== 'legal' && !USER_TITLES.some((t) => i.text.includes(t)) && katakanaViolations(i.text).length > 0);
        expect(kata.map((i) => `[${i.ctx}/${i.kind}] ${i.text}`), 'カタカナのポーカー用語').toEqual([]);
      });
    }
  });
}

// 規約・プライバシーポリシー（ページの文書）にもカタカナのポーカー用語が無いこと。
// 15 章は「アプリの画面の文字列」の置き換えを述べており、同梱の Markdown（規約）は対象に入っていたかが明記されていない → 仕様の確認が必要
test.describe('E-03 規約ページのカタカナのポーカー用語', () => {
  for (const path of ['/terms', '/privacy']) {
    test(path, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await (await import('../fakeBackend.ts')).fakeBackend(page, null, { signedIn: false });
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).waitFor();
      const items = await collectTexts(page);
      const bad = items.filter((i) => katakanaViolations(i.text).length > 0);
      expect(bad.map((i) => `${katakanaViolations(i.text).join(',')} ← ${i.text.slice(0, 80)}`)).toEqual([]);
    });
  }
});
