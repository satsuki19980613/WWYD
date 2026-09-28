/**
 * OCR の文字認識（tesseract.js）の配信ファイルを node_modules から packages/app/public/ocr/ に写す。
 * 開発サーバーとビルドの前に自動で実行される（packages/app の predev / prebuild）。
 *
 * すべて自サイトから配信し、CDN から読み込まない（画像を含め外部に通信しない。07 章 §5）。
 * 利用者が OCR ボタンを押したときだけ読み込まれる。写す先は git 管理外（生成物）。
 *
 * - worker.min.js: 文字認識を動かす Web Worker
 * - core/: 認識エンジン（WASM を埋め込んだ JS）。端末の SIMD 対応に合わせて 3 種類のうち 1 つだけ読まれる。
 *   LSTM のみの版（OEM.LSTM_ONLY と対）
 * - lang/eng.traineddata.gz: 英語の学習データ（4.0.0_best_int）
 */
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'packages/app/public/ocr');

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js/LICENSE.md', 'LICENSE-tesseract.js.md'],
  ['tesseract.js-core/LICENSE', 'LICENSE-tesseract.js-core.txt'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

for (const [from, to] of files) {
  const src = join(nm, from);
  const dst = join(out, to);
  if (!existsSync(src)) throw new Error(`見つからない: ${src}（npm install を実行する）`);
  if (existsSync(dst) && statSync(dst).size === statSync(src).size && statSync(dst).mtimeMs >= statSync(src).mtimeMs) continue;
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}
