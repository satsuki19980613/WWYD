# バトン: P1 基盤の承認 → P2 ポーカーロジック

**作成 2026-09-27 / セッション 2（Opus 5.5）から次セッションへの引き継ぎ**
**発注者: さつき（ディレクター兼意思決定者。日本語で対応。実装はすべて Claude に任されている）**

---

## 0. 結論から言うと、次のセッションでやること

1. [plan.md](plan.md) の「さつきの確認待ち」を見る。**P1 の承認と push の許可**が出ていれば:
   - push 前に秘密情報のスキャン → `git push -u origin phase/01-foundation` → PR 作成 → CI（`.github/workflows/ci.yml`）が緑か確認（T-102 を完了にする）。
   - 承認後に main へマージ（PR 経由）し、P2 用のブランチ `phase/02-poker-logic` を切る。
2. **P2 ポーカーロジック**（T-201〜T-206）。仕様は [04-poker-logic.md](detailed-spec/04-poker-logic.md) と [05-paint-format.md](detailed-spec/05-paint-format.md)。
   - 完了条件: 04 章 §10 と 05 章 §5 のテストケースがすべて緑、行カバレッジ 90% 以上。
   - **カバレッジの計測には `@vitest/coverage-v8` が要る（未承認の依存）→ 着手時にさつきに確認する。**
3. P2 の終わりで止まり、完了条件の確認結果を報告して承認を得る。

## 1. P1 で決まったこと（再確認不要。詳細は plan.md の決定ログ）

| 項目 | 内容 |
|---|---|
| 構成 | npm workspaces（`packages/core`、`packages/app`）。ルートの `npm test` / `npm run typecheck` / `npm run build` |
| 依存の版 | TypeScript ~5.9.3、Vite ^8.3.1、@vitejs/plugin-react ^6.1.1、Vitest ^5.0.2、React 18.3、supabase（CLI）^2.118.0 |
| lint | ESLint なし。tsc の検査（`noUnused*`、`noImplicitReturns`、`noUncheckedIndexedAccess` 等）で代用 |
| `packages/core` | 拡張子付き import（`./x.ts`）、Node API・外部依存なし（Deno からも読むため）。`allowImportingTsExtensions` + `noEmit` |
| Edge Function | `packages/core` を相対 import（`../../../packages/core/src/index.ts`）。**関数ごとに `deno.json` で `"nodeModulesDir": "none"`**（無いと node_modules 全体が bundle に入る）。本番配備での確認は T-501 |
| ローカル Supabase | ポートは **5532x 系**（Windows が 54319〜54418 を予約しているため）。API http://127.0.0.1:55321 |
| UI | トークンは `packages/app/src/styles/tokens.css`（ICMCLEC と同名・同値）。部品は `packages/app/src/components/`。ⓘ の文言は `src/info/infoSections.ts`（09 章の写し。文言を変えるときは 09 章が先） |
| 開発用 | `/_dev/ui`（部品一覧）と `?devstate=booting|signedOut|unavailable|maintenance|offline`。本番ビルドには含まれない |
| ホスティング | Cloudflare Pages で確定（2026-09-27 に公式ページで再確認） |

## 2. 注意点

| 事柄 | 内容 |
|---|---|
| Docker | Claude の Git Bash では PATH に `docker` が無い。`export PATH="$PATH:/c/Users/sa641.SATSUKIPC/AppData/Local/Programs/DockerDesktop/resources/bin"` |
| heredoc | Git Bash の heredoc で長い CSS を書くと途中で壊れたことがある。長いファイルは Write ツールで書く |
| ブラウザ確認 | `.claude/launch.json` の `app`（`npm run dev`、5173）。スクリーンショットはペインの大きさが変わると乱れるので、DOM（`javascript_tool`）で確かめるのが確実 |
| 未実装画面 | 一覧・投稿・回答・集計・規約は見出しだけの器（`ScreenStub`）。認証（P3）までは状態が常に `ready` |
| CSP | `public/_headers` は未作成。Supabase の URL が決まってから（M-01 後、遅くとも P5） |
| ICMCLEC の資料 | 非公開。`.claude/skills/wwyd-ui-concept/references/icmclec-*` はコミットしない |
| push | 毎回さつきの確認。force push しない |

## 3. さつきの手作業（担当: さつき）

- M-01〜M-03 Supabase プロジェクト作成・`.env`・CLI リンク（P3 の前まで）
- M-05〜M-07 Google OAuth（P3）、M-08 Cloudflare Pages（P5 まで）

手順は [10-manual-tasks.md](detailed-spec/10-manual-tasks.md)。
