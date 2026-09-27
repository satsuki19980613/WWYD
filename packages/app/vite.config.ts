import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// History API のルーティング（詳細仕様 06 章 §0.1）。base は絶対パス（/s/:id/answer のような深いパスで
// 直接開いても資産が読めるように）。本番の SPA フォールバックは Cloudflare Pages が行う（08 章）。
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
