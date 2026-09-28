import { defineConfig, devices } from '@playwright/test';

/**
 * E2E（Playwright）。Google ログインは自動化できないので、Neon（Auth・Data API・Functions）への通信は
 * すべて偽の応答に差し替え（e2e/fakeBackend.ts）、画面の操作だけを確かめる。本物のバックエンドには接続しない。
 * 開発サーバーは 5174 番で起動し、接続先の URL を存在しない偽のホストにする（.env.development より優先される）。
 */
const PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // テスト名に @sp を付けたものはスマホ（幅 412px・タッチ）で、それ以外は PC で実行する
    { name: 'pc', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }, grepInvert: /@sp/ },
    { name: 'sp', use: { ...devices['Pixel 7'] }, grep: /@sp/ },
  ],
  webServer: {
    command: `npm run dev -w @wwyd/app -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_NEON_AUTH_URL: 'http://auth.e2e.test',
      VITE_NEON_DATA_API_URL: 'http://data.e2e.test',
      VITE_NEON_CREATE_POST_URL: 'http://fn.e2e.test',
    },
  },
});
