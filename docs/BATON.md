# バトン: P3 の仕上げ（Neon の本番適用と本番ログイン）

**作成 2026-09-27 / セッション 2（Opus 5.5）から次セッションへの引き継ぎ**
**発注者: さつき（ディレクター兼意思決定者。日本語で対応。実装はすべて Claude に任されている）**

---

## 0. 結論から言うと、次のセッションでやること

**バックエンドは Neon に移行済み**（詳細仕様 [12 章](detailed-spec/12-neon-migration.md) が確定稿。CLAUDE.md §3・§5 も Neon に更新済み）。ブランチ `phase/03-db-auth`（未 push）。

1. [plan.md](plan.md) の「さつきの確認待ち」を見る。
2. さつきの承認があれば **T-311** 本番へのマイグレーション適用: `npm run db:migrate -- --branch production`。
3. さつきが N-04（本番の Google OAuth を Neon Auth に設定）を終えていれば、本番（`.env.development.local` で production の URL につないだ開発サーバー等）で Google ログイン → whoami を確かめて P3 完了。
4. N-05（CI 用 NEON_API_KEY）が入っていれば、push → PR → CI（db ジョブが Neon の一時ブランチで動く）→ マージ。
5. iPhone でのログイン確認は Cloudflare Pages（M-08）の後。

## 0.05 Neon の要点（詳しくは 12 章 §5.1・§7.1）

- プロジェクト `patient-leaf-06853495`（シンガポール）。ブランチ `production` / `dev` / `test-base`（DB テストの元。空のまま。マイグレーションを入れない）。
- 利用者の ID は **`public.current_uid()`**（`request.jwt.claims` の `sub`）。Neon の `auth.uid()` は使わない（authenticated から使えず、SECURITY DEFINER の中で値を返さない）。
- 関数を作るたびに `revoke all on function … from public, anonymous, authenticated` してから必要な付与だけ。一括の revoke の後は `current_uid` などを付け直す。
- クライアントは `packages/app/src/backend/neon.ts`（Neon Auth の REST を直接。公式 SDK は Next.js 必須で使えない）。OAuth の戻りの `neon_auth_session_verifier` は一度しか使えない。
- Functions: `packages/functions`。配備は `npx neonctl functions deploy`（承認が要る）。CORS が必要。配備直後の約 1 分は新旧が混ざる。
- メール＋パスワードの登録は production・dev とも無効。

## 0.1 P3 で作ったもの（Supabase 向けに作り、Neon 向けに書き換え済み。以下の表の Supabase 固有の記述は古い）

| ファイル | 内容 |
|---|---|
| `supabase/migrations/20260927000001〜09_*.sql` | 型・表・インデックス・共通関数・RLS・トリガ・RPC。**関数を作るたびに `revoke all on function … from public, anon, authenticated` してから付与**（Postgres の既定で PUBLIC に実行権限が付くため） |
| `supabase/tests/*.test.sql` | pgTAP（`npx supabase test db`）。共通ヘルパーは `helpers/setup.psql`（`\ir` で読む。`pg_temp.login(n)` でユーザー n になる） |
| `supabase/tests/03_paint_vectors.test.sql` | 共有テストベクタから生成（`npm run gen:db-vectors`。手で編集しない） |
| `scripts/dbConcurrency.mjs` | DB-19 の同時回答（`npm run test:db-concurrency`。ローカルの DB コンテナにつなぐ） |
| `packages/app/src/auth/*` | 起動時の判定（純関数 `resolveAppState`）と `useAuth`（ログイン・ログアウト） |
| `packages/app/src/supabase/client.ts` | supabase-js のクライアント（PKCE） |
| `.env.development` | 開発時にローカルの Supabase につなぐ値（公開のデモキー） |

## 0.2 P2 で作ったもの（`packages/core`）

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
