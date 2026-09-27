import { defineConfig } from 'vitest/config';

// 全パッケージの単体テストをルートから 1 回で実行する。
// UI 部品の DOM テストは入れていない（jsdom 等の依存を増やさないため）。画面は E2E（Playwright）で確かめる。
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
