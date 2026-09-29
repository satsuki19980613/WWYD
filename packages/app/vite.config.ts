import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { AUTH_PROXY_PREFIX, authCookies, firstPartyCookie, isProxiedPath } from './src/backend/authProxy.ts';

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

/**
 * 開発・プレビューの `/api/auth/*` → Neon Auth の中継（本番の Pages Functions と同じ。12 章 §7.2）。
 * 接続先は VITE_NEON_AUTH_URL（モードの .env が決める）。Set-Cookie は authProxy と同じく自サイトのクッキーにする。
 */
function authProxy(authUrl: string | undefined): Record<string, ProxyOptions> {
  if (!authUrl) return {};
  const upstream = new URL(authUrl);
  return {
    [AUTH_PROXY_PREFIX]: {
      target: upstream.origin,
      changeOrigin: true,
      bypass: (req) => (isProxiedPath((req.url ?? '').split('?')[0]!.slice(AUTH_PROXY_PREFIX.length)) ? undefined : false),
      rewrite: (p) => upstream.pathname.replace(/\/+$/, '') + p.slice(AUTH_PROXY_PREFIX.length),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          // Neon Auth のクッキーだけを送る
          const cookie = proxyReq.getHeader('cookie');
          const kept = authCookies(typeof cookie === 'string' ? cookie : null);
          if (kept) proxyReq.setHeader('cookie', kept);
          else proxyReq.removeHeader('cookie');
        });
        proxy.on('proxyRes', (res) => {
          const cookies = res.headers['set-cookie'];
          if (cookies) res.headers['set-cookie'] = cookies.map(firstPartyCookie);
          for (const k of Object.keys(res.headers)) if (k.startsWith('access-control-')) delete res.headers[k];
        });
      },
    },
  };
}

// History API のルーティング（詳細仕様 06 章 §0.1）。base は絶対パス（/s/:id/answer のような深いパスで
// 直接開いても資産が読めるように）。本番の SPA フォールバックは Cloudflare Pages が行う（08 章）。
export default defineConfig(({ mode }) => {
  const proxy = authProxy(loadEnv(mode, '../..', 'VITE_').VITE_NEON_AUTH_URL);
  return {
  base: '/',
  // .env はリポジトリ直下に置く（.env.example と同じ場所。CLAUDE.md §5）
  envDir: '../..',
  plugins: [react()],
  // OneDrive 上のフォルダではファイルの変更の通知を取りこぼし、古い版のまま真っ白になることがあるので、
  // 開発サーバーはポーリングで変更を見る（2026-09-29。本番のビルドには関係しない）
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 }, proxy },
  preview: { port: 4173, strictPort: true, headers: pagesHeaders(), proxy },
  };
});
