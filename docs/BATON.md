# バトン: P2 の承認 → P3 DB と認証

**作成 2026-09-27 / セッション 2（Opus 5.5）から次セッションへの引き継ぎ**
**発注者: さつき（ディレクター兼意思決定者。日本語で対応。実装はすべて Claude に任されている）**

---

## 0. 結論から言うと、次のセッションでやること

1. [plan.md](plan.md) の「さつきの確認待ち」を見る。**Q-24（RAISE-08 の期待値）と P2 の承認**が出ていれば:
   - 秘密情報のスキャン → `git push -u origin phase/02-poker-logic` → PR → CI 緑を確認 → main へマージ（P1 と同じ手順）。
   - Q-24 が (b) になった場合は `poker/state.ts` の `legal` の raise 条件と LEGAL-04 / RAISE-08 のテストを直す。
2. **P3 DB と認証**（T-301〜）。01 章・02 章のマイグレーションをローカル（`npx supabase start`、ポート 5532x）で作り、pgTAP で DB-01〜19。DB-06 は `packages/core/test-vectors/paint-validation.json` を読む。
   - 本番への適用（T-305）と Google ログイン（T-304）には、さつきの手作業 M-01〜M-03・M-05〜M-07 が要る。
3. P3 の終わりで止まり、完了条件の確認結果を報告して承認を得る。

## 0.1 P2 で作ったもの（`packages/core`）

| ファイル | 内容 |
|---|---|
| `money.ts` / `cards.ts` / `errors.ts` | mbb 変換と表示、カード、`ValidationError`（コード＋添字） |
| `poker/state.ts` | `initialState`・`status`・`nextActor`・`advance`・`legal`・`apply`（04 章 §3〜6） |
| `poker/replay.ts` | `runActions`（途中まで。`states[0]` が初期状態）・`replay`（完了とボード枚数の検査） |
| `poker/spot.ts` | `spotCandidates`・`spotView`（停止位置・派生メタ・実際のキー）・`sizeFromPct`・`pctFromSize` |
| `paint/*` | ラベル・コンボ、paint の encode / decode / hex、`validatePaintBytes`、集計と表示計算 |
| `post/*` | `validateInput`（JSON → mbb の型付き入力）・`verifyPost`（再生・照合・マック補完） |
| `poker/testHelpers.ts` | テスト用の記法（`acts({ pf: 'UTG..CO f, BTN r2.5' })`）。本番コードからは使わない |

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
