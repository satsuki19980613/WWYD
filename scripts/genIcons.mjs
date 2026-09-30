// アプリのアイコン（packages/app/public/icon.svg）から、ホーム画面用の PNG を作る（2026-09-30 さつき: レンジ表の案 D）。
//   node scripts/genIcons.mjs
// apple-touch-icon.png（180。iPhone と Android のホーム画面）を書き出す。manifest は置かない（index.html のコメント）。
// 描画は Playwright の Chromium（開発用の依存に入っている）。
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PUBLIC = resolve(import.meta.dirname, '../packages/app/public');
const svg = readFileSync(resolve(PUBLIC, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
try {
  for (const [file, size] of [['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:#000">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: resolve(PUBLIC, file), omitBackground: false });
    await page.close();
    console.log(`${file}（${size}×${size}）`);
  }
} finally {
  await browser.close();
}
