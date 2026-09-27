import { defineConfig } from 'vitest/config';

// 全パッケージの単体テストをルートから 1 回で実行する。
// UI 部品の DOM テストは入れていない（jsdom 等の依存を増やさないため）。画面は E2E（Playwright）で確かめる。
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // P2 の完了条件（plan.md）: packages/core の行カバレッジ 90% 以上
      include: ['packages/core/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/testHelpers.ts', '**/postFixtures.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 90 },
    },
  },
});
