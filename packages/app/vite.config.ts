import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * public/_headers（Cloudflare Pages のヘッダー。CSP など）の `/*` の分を読む。
 * `npm run preview` でビルドを同じヘッダーで確かめるため（開発サーバーは HMR のインラインのスクリプトがあるので付けない）。
 */
function pagesHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  let inAll = false;
  for (const line of readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inAll = line.trim() === '/*';
      continue;
    }
    const i = line.indexOf(':');
    if (inAll && i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return headers;
}

// History API のルーティング（詳細仕様 06 章 §0.1）。base は絶対パス（/s/:id/answer のような深いパスで
// 直接開いても資産が読めるように）。本番の SPA フォールバックは Cloudflare Pages が行う（08 章）。
export default defineConfig({
  base: '/',
  // .env はリポジトリ直下に置く（.env.example と同じ場所。CLAUDE.md §5）
  envDir: '../..',
  plugins: [react()],
  // OneDrive 上のフォルダではファイルの変更の通知を取りこぼし、古い版のまま真っ白になることがあるので、
  // 開発サーバーはポーリングで変更を見る（2026-09-29。本番のビルドには関係しない）
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
  preview: { port: 4173, strictPort: true, headers: pagesHeaders() },
});
