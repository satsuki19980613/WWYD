# バトン: P9 まで完了・本番反映済み → 次は UI の整備

**更新 2026-09-28 / セッション 6（Opus 5.5）から次セッションへの引き継ぎ**
**発注者: さつき（ディレクター兼意思決定者。日本語で対応。実装はすべて Claude に任されている。操作をお願いするときは非エンジニアにも分かる言葉で説明する）**

---

## 0. 結論から言うと、次のセッションでやること

**次のセッションは UI の整備**（さつきの指示）。何をどう整えるかはさつきと相談して決める。始める前に `wwyd-ui-concept`（見た目の正）と `frontend-design-principles` を読む。
**P9 OCR まで完了・本番公開済み**（https://wwyd.pages.dev 。PR #11・#12 をマージ済み。main は b8af601）。

セッション 6 で決まった仕様変更（詳細は plan.md の決定ログ）:
1. **スポットは Hero のフロップ以降のアクションだけ**。一覧のフィルタからプリフロップを外した。OCR は投稿できないハンドを読み込みの時点ではじく（`ocrPostability`）。create-post は dev・本番に配備済み。本番の既存のプリフロップの投稿は残す。
2. **集計の濃さは、レンジに入れた人の割合を 20% 刻みの 5 段**（`opacityLevel`・`levelOpacity`。05 章 §4.1）。回答者数の上限は決めない（仕組みの上限は 3,276）。
3. **Hero の想定レンジを廃止**。投稿者も自分の投稿に回答する（集計に含む・1 回だけ・回答してから集計を見る）。集計のタブは「全体」「自分」。DB はマイグレーション `20260928000000_author_answers.sql`（dev・本番に適用済み。本番はさつきが実行）。

ほかに:
- 試験データ: `npm run db:sample -- --branch <b>`（投稿 40 件）、`db:sample-large`（回答 400〜2000 件の投稿 4 件）、`db:sample-clean`（消す）。試験用ユーザーだけで作り、実在するユーザーには触れない。**本番の試験データは消去済み**。dev は `db:seed` の試験データ（46 件）と、`db:sample-large` の 4 件が入っている。
- Claude Code の安全機能で止められる操作: 本番の DB の読み書き（マイグレーション・試験データの一部）、Functions の配備、本番の画面の操作。止められたらさつきにコマンドを渡して実行してもらう。
- 未確認: マージ直後の本番の配信の切り替わり、さつきのスマホでの本番の確認（ログインの往復・OCR・投稿者の回答）。iPhone は保留。

### 0.1 P9 で作ったもの

| 場所 | 内容 |
|---|---|
| `packages/ocr` | 純 TS。`readHandHistory(image, reader)` → `OcrResult`（名前を含まない）。`vision.ts`（カード・スート・ボード・Hero の行）、`bodyText.ts`（本文。バッジ優先、名前は受け皿）、`rankTemplates.ts`（生成物） |
| `packages/app/src/ocr/runOcr.ts` | ブラウザの入口（動的 import）。tesseract.js を自サイトの `/ocr/` から（`scripts/copyOcrAssets.mjs` が predev・prebuild で配置。git 管理外） |
| `packages/app/src/post/OcrImport.tsx`・`OcrReview.tsx`・`t4Games.ts`・`ocrDraft.ts` | T4 のゲーム（通常 / エキスパート）を選ぶ → 画像 → 確認画面（画像と並べて直す。席とストリートは再生で決まる）→ 反映 |
| `packages/app/public/_headers` | CSP ほか。`npm run preview` も同じ（`vite.config.ts`）。launch.json の `app-preview` で本番ビルドを 5173 で動かせる |
| `scripts/ocr/` | `accuracy.mts`（精度。`--drafts` で正解の無い画像の下書き `*.ocr.json`）、`genRankTemplates.mts`（テンプレート）、`png.mts`（Node 標準だけの PNG の読み書き） |
| `e2e/ocr.spec.ts` | 外部通信 0 件（Worker を含む）・ゲームの選択・キャンセル |
| `sample/pc/`（122 枚）・`sample/sp/`（Android 26 枚。正解は同じハンドの PC 版を写したもの） | 画像と `*.expected.json`（git 管理外。公開リポジトリに入れない） |

- アプリで画像を読ませる確認は、`HTMLInputElement.prototype.click` をファイル欄だけ何もしないように差し替えてからゲームのボタンを押し、開発サーバーの `/@fs/<リポジトリの絶対パス>/sample/...` を fetch → `DataTransfer` で `[data-testid=ocr-file]` に入れて change を送る（OS のファイル選択の窓は操作できないため）。
- dev に試験投稿「試験 OCR 読み込み（AKs 3bet）」が 1 件増えた（`npm run db:seed -- --branch dev` で消える）。
- 流用元 `tenfour_watcher` は読み取り専用で使った（変更していない）。`data/tenfour_hands/` の 21 枚は未使用。

### いつもの注意

- [plan.md](plan.md) の「現在の状況」と「確認待ち」を見てから始める。
- Neon の URL を変えたら `.env.production` と `_headers` の connect-src を両方直す。
- 規約の文面は `packages/app/src/legal/{terms,privacy}.md`（さつきの文面そのまま）。直すときはさつきの確認後に。
- **このプロジェクトは非営利**（広告・寄付・有料機能など一切なし。CLAUDE.md §1）。
- PR の「Workers Builds: wwyd」の失敗は無視してよい（削除済みの Worker のビルドの設定が Cloudflare に残っているだけ）。
- E2E で応答を途中で差し替えるときは、画面の読み込みが終わってから差し替える（`open()` は読み込みを待たない）。

## 0.00001 P7 で作ったもの

| ファイル | 内容 |
|---|---|
| `packages/app/src/answer/resultModel.ts` | 集計画面の純関数（タブ・`?view=host`・白枠・マスと内訳・空状態・実際のアクション・`resultFrames`）。テストは同名の `.test.ts` |
| `packages/app/src/answer/ResultGrid.tsx` | 集計のレンジ表（選ぶだけ。`touch-action: manipulation`） |
| `packages/app/src/screens/ResultScreen.tsx` | PC 2 列 / スマホのタブ、内訳、実際のアクション、予想を編集・削除 |
| `Replay.tsx` の `PokerTable` | ホールカードは `holes`（席ごとに表向き・`'back'`・`'muck'`）、終了時の `note`。`useReplay(max, { atEnd: true })` は最後から始める |
| `e2e/result.spec.ts` | 12 件。`detailFixtures.ts` の `aggregateHex`・`paintOf`・`paintHexOf`、`admin` 指定。`fakeBackend.ts` は posts の delete と list_posts（空）に答える |

## 0.0001 P6 で作ったもの

| ファイル | 内容 |
|---|---|
| `packages/core/src/poker/spot.ts` | `stopState`（停止位置までに切り詰めたアクション列から停止位置の状態） |
| `packages/app/src/answer/` | `postDetail.ts`（get_post_detail の読み取りと Data API のエラーコード）、`answerApi.ts`（`usePostDetail`・`insertAnswer`・`saveHostAnswer`）、`brush.ts`・`paintEditor.ts`・`answerForm.ts`・`replayModel.ts`（純関数。単体テストあり）、部品（`Replay.tsx`・`BrushPanel.tsx`・`RangeGrid.tsx`・`SizeControl.tsx`・`ComboBar.tsx`）、`detailFixtures.ts`（テストと E2E 用の応答） |
| `packages/app/src/screens/SpotScreen.tsx` | `/s/:id`・answer・result を 1 つの器で読み、viewer に合わせて置き換え遷移。送信後は reload |
| `packages/app/src/screens/AnswerScreen.tsx` | PC 2 列 / スマホのタブ（下部固定バーの高さを測って余白に使う） |
| `e2e/`・`playwright.config.ts` | Playwright。`fakeBackend.ts` が Neon Auth・Data API を偽の応答に差し替える（ログイン不要）。開発サーバーは 5174 番で起動。スマホの試験はテスト名に `@sp` |

- 公開サイトは https://wwyd.pages.dev （Cloudflare Pages、main の push で自動ビルド、本番の Neon）。create-post の本番の許可するオリジンは `http://localhost:5173,https://wwyd.pages.dev`（配備し直すときも両方を渡す。新旧の混在は 2 分ほど続くことがある）。iPhone 実機の確認はさつきの知り合いに依頼中（保留）。
- dev のブラウザ（アプリ内ブラウザ）はさつきのログインが残っている。開発時は `await import('/src/backend/neon.ts')` で `db` を取り出し、get_post_detail を読んで確かめられる（書き込みは dev だけ）。
- 依存を追加した後は開発サーバーを起動し直す（React が 2 つ読み込まれて真っ白になったことがある）。

## 0.001 P5 で作ったもの

| ファイル | 内容 |
|---|---|
| `packages/functions/src/createPost/` | `handler.ts`（CORS・認証・検証・エラーの写し方。単体テスト付き）、`payload.ts`（insert_post の引数）、`index.ts`（pg のプールと jose の入口） |
| `packages/app/src/post/` | `cardInput.ts`（カードキーボードの規則・フリック）、`draft.ts`（下書き・進行・ログ・送信前の検査）、`draftStore.ts`（メモリの下書き・離脱確認）、`sendPost.ts`、`errorMessages.ts`（06 章 §7）、各セクションの部品 |
| `packages/app/src/screens/NewPostScreen.tsx` | PC 3 列 / スマホ 4 ステップ |
| `packages/core/src/post/postFixtures.ts` | H-S1 / H-MW / H-S3 の入力例（テスト専用） |

- 配備: `npx neonctl functions deploy createpost --project-id patient-leaf-06853495 --branch <dev|production> --src packages/functions/src/createPost/index.ts --env ALLOWED_ORIGINS=<カンマ区切りのオリジン>`（毎回さつきの承認。本番は Claude Code の安全機能で止められる可能性があり、その場合はさつきが実行）。
- dev の関数 URL は `.env.development` の `VITE_NEON_CREATE_POST_URL`。dev には試験投稿が 4 件ある（題名「試験」。`npm run db:seed -- --branch dev` で消える）。
- dev のさつきのユーザーは、2026-09-28（UTC）の投稿枠 5 件のうち 4 件を使った。

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
| CSP | `packages/app/public/_headers` は未作成。P9 で作る（§0 の 6.） |
| ICMCLEC の資料 | 非公開。`.claude/skills/wwyd-ui-concept/references/icmclec-*` はコミットしない |
| push | 毎回さつきの確認。force push しない |

## 3. さつきの手作業（担当: さつき）

- 残りは iPhone 実機の確認（保留）と M-12 運用手順の確認（P10）。N-05・M-05b・M-08・M-09 は済み。

手順は [10-manual-tasks.md](detailed-spec/10-manual-tasks.md)。
