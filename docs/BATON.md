# バトン: P5 投稿へ（P4 一覧は実装済み・本番確認待ち）

**更新 2026-09-28 / セッション 3（Opus 5.5）から次セッションへの引き継ぎ**
**発注者: さつき（ディレクター兼意思決定者。日本語で対応。実装はすべて Claude に任されている）**

---

## 0. 結論から言うと、次のセッションでやること

**P4（一覧）は実装済み**（ブランチ `phase/04-list`）。dev の試験データで全状態と削除 → カスケードを確認済み。本番には投稿がまだ無いので、本番での一覧・削除の確認は P5 の後。

1. [plan.md](plan.md) の「現在の状況」と「確認待ち」を見る。
2. `phase/04-list` は PR #5 で main へマージ済み。P5 はブランチ `phase/05-post`（作成済み）で行う。
3. P5 スポット投稿（T-501〜）に着手。
4. さつきの手作業の残り: N-05（CI 用 NEON_API_KEY）、M-09（管理者 UID）、dev の「Sign-up with Email」をオフ。iPhone のログイン確認は M-08（Cloudflare Pages）の後。

## 0.01 P4 で作ったもの

| ファイル | 内容 |
|---|---|
| `packages/app/src/list/spotList.ts` | 一覧の純関数（クエリ・カーソル・重複除去・経過時間・カードの操作）。テストは同名の `.test.ts` |
| `packages/app/src/list/useSpotList.ts` | 読み込みの状態（初回・追加・エラー）と `deletePost`（`delete ... select id` で 1 件消えたか確かめる） |
| `packages/app/src/screens/ListScreen.tsx` | 一覧画面（チップ・カード・骨組み・追加読み込み・削除ダイアログ・スマホの下部固定ボタン） |
| `db/seed/dev.sql` | dev 専用の試験データ（`npm run db:seed -- --branch dev`）。何度でも入れ直せる |

## 0.05 Neon の要点（詳しくは 12 章 §5.1・§7.1）

- プロジェクト `patient-leaf-06853495`（シンガポール）。ブランチ `production` / `dev` / `test-base`（DB テストの元。空のまま。マイグレーションを入れない）。
- 利用者の ID は **`public.current_uid()`**（`request.jwt.claims` の `sub`）。Neon の `auth.uid()` は使わない（authenticated から使えず、SECURITY DEFINER の中で値を返さない）。
- 関数を作るたびに `revoke all on function … from public, anonymous, authenticated` してから必要な付与だけ。一括の revoke の後は `current_uid` などを付け直す。
- クライアントは `packages/app/src/backend/neon.ts`（Neon Auth の REST を直接。公式 SDK は Next.js 必須で使えない）。OAuth の戻りの `neon_auth_session_verifier` は一度しか使えない。
- Functions: `packages/functions`。配備は `npx neonctl functions deploy`（承認が要る）。CORS が必要。配備直後の約 1 分は新旧が混ざる。
- メール＋パスワードの登録は production・dev とも無効。

## 0.1 P3 で作ったもの

| ファイル | 内容 |
|---|---|
| `db/migrations/*.sql` | 10 本（`current_uid`・型・表・インデックス・共通関数・RLS・トリガ・RPC）。`npm run db:migrate -- --branch <ブランチ>` で適用、`migrations.applied` に記録 |
| `db/tests/*.test.sql` | pgTAP 143 件（`npm run test:db`。Neon の一時ブランチ。DB-19 の同時回答もこの中で実行）。`03_paint_vectors` は生成物 |
| `scripts/db.mjs` | マイグレーションと DB テスト。接続文字列は `neonctl connection-string` でその場で取り、出力では伏せる |
| `packages/app/src/backend/neon.ts` | Neon Auth の REST と Data API（`@supabase/postgrest-js`） |
| `packages/app/src/auth/*` | 起動時の判定（純関数 `resolveAppState`）と `useAuth` |
| `.env.development` / `.env.production` | dev / production の公開の URL（秘密ではない）。本番につなぐ確認は `npm run dev:prod`（launch.json の `app-production`） |

- **本番を変える操作（本番へのマイグレーション等）は Claude Code の安全機能で止められる**。さつきに実行してもらい、Claude は読み取り（`select`）で確かめる。
- Google の同意画面は「テスト中」。ログインできるのはテストユーザー（今はさつき）だけ。公開は M-05b。

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
| 依存の版 | TypeScript ~5.9.3、Vite ^8.3.1、@vitejs/plugin-react ^6.1.1、Vitest ^5.0.2、React 18.3、neonctl ^6.2.3、@supabase/postgrest-js ^2.117.2（Data API 用）、jose ^6.2.12（Functions） |
| lint | ESLint なし。tsc の検査（`noUnused*`、`noImplicitReturns`、`noUncheckedIndexedAccess` 等）で代用 |
| `packages/core` | 拡張子付き import（`./x.ts`）、Node API・外部依存なし（Deno からも読むため）。`allowImportingTsExtensions` + `noEmit` |
| Neon Functions | `packages/functions`。`packages/core` を相対 import し esbuild でまとめて配備（`npx neonctl functions deploy`、毎回さつきの承認）。CORS が必要、配備直後の約 1 分は新旧が混ざる（12 章 §5.1） |
| UI | トークンは `packages/app/src/styles/tokens.css`（ICMCLEC と同名・同値）。部品は `packages/app/src/components/`。ⓘ の文言は `src/info/infoSections.ts`（09 章の写し。文言を変えるときは 09 章が先） |
| 開発用 | `/_dev/ui`（部品一覧）と `?devstate=booting|signedOut|unavailable|maintenance|offline`。本番ビルドには含まれない |
| ホスティング | Cloudflare Pages で確定（2026-09-27 に公式ページで再確認） |

## 2. 注意点

| 事柄 | 内容 |
|---|---|
| Docker | Claude の Git Bash では PATH に `docker` が無い。`export PATH="$PATH:/c/Users/sa641.SATSUKIPC/AppData/Local/Programs/DockerDesktop/resources/bin"` |
| heredoc | Git Bash の heredoc で長い CSS を書くと途中で壊れたことがある。長いファイルは Write ツールで書く |
| ブラウザ確認 | `.claude/launch.json` の `app`（dev につなぐ）/ `app-production`（本番につなぐ）。どちらも 5173。スクリーンショットはペインの大きさが変わると乱れるので、DOM（`javascript_tool`）で確かめるのが確実 |
| 未実装画面 | 一覧・投稿・回答・集計・規約は見出しだけの器（`ScreenStub`） |
| CSP | `public/_headers` は未作成（遅くとも P5。Neon Auth と Data API の URL を許可） |
| ICMCLEC の資料 | 非公開。`.claude/skills/wwyd-ui-concept/references/icmclec-*` はコミットしない |
| push | 毎回さつきの確認。force push しない |

## 3. さつきの手作業（担当: さつき）

- N-05 CI 用 NEON_API_KEY、M-09 管理者 UID の登録（本番の `app_admins` に自分の UID）
- M-08 Cloudflare Pages（P5 まで）、M-05b 同意画面の公開（P10）

手順は [10-manual-tasks.md](detailed-spec/10-manual-tasks.md)。
