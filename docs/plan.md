# WWYD 実装計画書（進捗管理書）

このファイル 1 つで、どのセッションでも現状を把握して作業を再開できるようにする。
**セッションの終わりに必ず**: タスクの状態を更新 → 「現在の状況」を更新 → セッションログに追記 → （決めたことがあれば）決定ログに追記 → コミット。
（CLAUDE.md §9 と同じ）

---

## 現在の状況

| 項目 | 内容 |
|---|---|
| 現在のフェーズ | **P8 アカウントと管理者 — 実装完了**（PR #9 で main へマージ・本番に公開済み。次の作業ブランチは `phase/09-ocr`）。残りは T-802 の本番の検証用アカウントでの確認。P5〜P8 はスマホ実機のみ残り |
| 直近で完了したこと | P8: アカウント削除、規約ページ（利用規約 6 条・プライバシーポリシー。Fable の起草をさつきと整理して確定）、書体の自サイト配信（Google への通信なし）、「Hero の予想」→「Hero の想定レンジ」、ⓘ のログインの文言の修正。E2E 50 件 |
| 次にやること | 1. T-802: 本番の検証用 Google アカウントでアカウント削除を確認（さつきがアカウントを用意し、同意画面のテストユーザーに追加）<br>2. P9 OCR（リリースまでに実装。プライバシーポリシー 1.3 と一致させる。T-1001 に確認項目を追加済み） |
| ブロッカー | なし |
| さつきの確認待ち | T-802 の検証用アカウント、使われなくなった `screens/ScreenStub.tsx` の削除、ログイン画面のサービス説明 1 行（Google の同意画面を本番に公開する条件。M-05b の前に）、iPhone 実機の確認（保留）、N-05 と dev の Sign-up with Email |

---

## フェーズと完了条件

| フェーズ | 内容 | 完了条件 | 状態 |
|---|---|---|---|
| P0 準備 | Skill 導入、CLAUDE.md、詳細仕様、計画書 | さつきがレビューし、優先度 A の確認待ちに回答済み | 完了 |
| P1 基盤 | モノレポ、ツール、CI、デザイントークンとアプリの外枠、Edge Function の import 検証 | `npm run typecheck` / `npm test` / `npm run build` が CI で緑。外枠（ヘッダー・ⓘ・ルーティング・メンテナンス画面）がローカルで表示され、`wwyd-ui-concept` の自己レビューに合格 | 完了 |
| P2 ポーカーロジック | `packages/core` のロジックと paint / 集計コーデック | 04 章 §10 と 05 章 §5 のテストケースがすべて自動テストで緑。カバレッジ（行）90% 以上 | 完了 |
| P3 DB と認証 | マイグレーション、RLS、トリガ、RPC、Google ログイン | 02 章 §5 の DB テスト（pgTAP）がすべて緑。ローカルと本番で Google ログイン → `whoami` が動く | 完了（2026-09-28。本番で Google ログイン → 一覧を確認。iPhone は M-08 の後） |
| P4 一覧 | スポット一覧 | 06 章 §2 の状態がすべて表示できる。タブ・フィルタ・並び替え・追加読み込み・削除が本番 DB で動く | 完了（2026-09-28。本番で空状態・投稿の表示・本人の削除 → カスケードを確認。絞り込み・並び替え・追加読み込みは dev の試験データ 46 件で確認（本番は件数が少なく同じ処理）。管理者の削除の画面は M-09 の後） |
| P5 スポット投稿 | 投稿画面、カードキーボード、Edge Function `create-post` | 03 章 §5 の EF テストが緑。PC とスマホで H-S1 / H-MW / H-S3 を入力して投稿でき、`get_post_detail` で読める | 実装完了（2026-09-28。dev で H-S1 / H-MW / H-S3、本番で H-S1 を画面から投稿し get_post_detail で確認。スマホ実機は M-08 の後） |
| P6 回答 | リプレイ、ブラシ、塗り、サイズ、送信、Hero の予想 | 06 章 §4 の操作を E2E で確認（塗り・なぞり・スポイト・重なったハンドル・元に戻す・送信・再回答の拒否）。スマホ実機で確認 | 実装完了（2026-09-28。E2E 32 件（PC 29・スマホ 3）と dev の実データで確認。スマホ実機は M-08 の後） |
| P7 集計 | 集計レンジ、実際のアクション、ハンドヒストリー | 05 章 §4 の表示計算を単体テスト、06 章 §5 を E2E で確認。未回答者に集計が返らないことを確認 | 実装完了（2026-09-28。表示計算は core（P2 の PAINT-12・13）と `answer/resultModel.test.ts`、06 章 §5 は E2E 12 件、未回答者は DB-12・13 と dev の実データで確認。スマホ実機は保留） |
| P8 アカウントと管理者 | アカウントメニュー、アカウント削除、規約ページ、管理者の削除 | DB-16 相当を E2E で確認。規約文をさつきが承認 | 未着手 |
| P9 OCR | 端末内 OCR | 07 章 §6 の合格基準（ボード 100%、プレイヤー・アクション 95%）。外部通信が発生しないことを確認 | 未着手 |
| P10 仕上げとリリース | アクセシビリティ、E2E 総点検、CSP、休止対策、同意画面の本番化、本番デプロイ | リリース前チェックリスト（T-1001）をすべて満たし、さつきが本番公開を承認 | 未着手 |

---

## タスク一覧

状態: 未着手 / 完了（`answer/postDetail.ts`・`screens/SpotScreen.tsx`。E2E と dev で振り分けを確認） / 完了 / 保留 / 確認待ち。担当が空欄のものは Claude。

### P0 準備

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-001 | UI の Skill 導入（ICMCLEC から複製＋UI コンセプト明文化） | — | `.claude/skills/` に 2 つの Skill。原本と差分なし | 完了 | | — |
| T-002 | 資料を `docs/source/` に配置、git 初期化 | — | コミット済み | 完了 | | — |
| T-003 | CLAUDE.md 作成（STEP 1） | T-001 | さつきの承認 | 完了 | | — |
| T-004 | 詳細仕様 d0.1（STEP 2） | T-003 | さつきの承認 | 完了 | | 00〜11 |
| T-005 | 実装計画書（STEP 3） | T-004 | さつきの承認 | 完了 | | — |
| T-006 | 確認待ち Q-1〜Q-23 への回答 | T-004 | 回答を決定ログに記録、11 章の状態を更新、詳細仕様の【Q-n】箇所を確定稿に | 完了 | さつき | 11 |
| T-007 | 初回 `git push` の承認 | T-003 | `origin/main` に push 済み | 完了 | さつき | 10 M-10 |

### P1 基盤

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-101 | npm workspaces の雛形（`packages/core`, `packages/app`）、TypeScript strict、Vitest、ESLint 相当の最小設定 | T-006(Q-16) | `npm run typecheck` / `npm test` が通る | 完了 | | CLAUDE.md §3–6 |
| T-102 | GitHub Actions: typecheck・test・build | T-101, T-007 | PR で CI が緑 | 完了 | | — |
| T-103 | スパイク: Edge Function から `packages/core` を import して配備できるか（ローカルの `supabase functions serve`） | T-101, M-04 | 結果を決定ログに記録（直接 import か複製＋CI 検査か） | 完了 | | 03 §2.1 |
| T-104 | デザイントークン（`wwyd-ui-concept`）と基本部品（ボタン・面取りプレート・タブ・確認ダイアログ・トースト・カスタムセレクト） | T-101, T-006(Q-1,2) | 部品一覧ページで表示確認、自己レビュー 4 項目に合格 | 完了 | | 06 §0, §8 |
| T-105 | アプリの外枠: ヘッダー、ⓘ モーダル（09 章の文言）、ルーティング、起動中・メンテナンス中・オフライン・404 | T-104 | 各状態をローカルで表示確認 | 完了 | | 06 §0, 09 |
| T-106 | ホスティング先の最終確認（料金ページ再確認）と決定 | T-006(Q-18) | 決定ログに記録 | 完了 | | 08 |

### P2 ポーカーロジック

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-201 | 金額（mbb）の変換・丸め・表示 | T-101, T-006(Q-5) | 単体テスト緑 | 完了 | | 04 §1 |
| T-202 | 初期状態・合法アクション・適用・status・advance | T-201, T-006(Q-4,7,8) | INIT / LEGAL / RAISE / INC / BBOPT / ANTE / RUN / END のテスト緑 | 完了 | | 04 §3–7, §10.1–10.8 |
| T-203 | 再生（replay）と検証エラー | T-202 | VAL のテスト緑 | 完了 | | 04 §7, §10.12 |
| T-204 | スポット候補・停止位置・派生メタ・% pot | T-202, T-006(Q-6) | MW / SPOT / PCT / SD のテスト緑 | 完了 | | 04 §8–9, §10.9–10.13 |
| T-205 | paint / 集計コーデックと検証、共有テストベクタ | T-101 | PAINT のテスト緑、`test-vectors/paint-validation.json` 作成 | 完了 | | 05 |
| T-206 | 投稿入力の形の検証（`validateInput`） | T-203 | VAL-04, 10, 11, 15〜17 のテスト緑 | 完了 | | 03 §3.2 |

### P3 DB と認証

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| M-01 | Supabase プロジェクトの作成 | — | Project ref を Claude に共有 | 取り消し（Supabase の枠が無い。N-01 に置き換え） | さつき | 10 M-01 |
| M-02 | `.env` の作成 | M-01 | ローカルで接続できる | 取り消し（Neon の N-01〜N-04 に置き換え） | さつき | 10 M-02 |
| M-03 | Supabase CLI のログインとリンク | M-01 | `npx supabase link` 済み | 取り消し（Neon の N-01〜N-04 に置き換え） | さつき | 10 M-03 |
| M-04 | Docker Desktop のインストール | — | `docker run hello-world` 成功（2026-09-27）。`npx supabase start` は P1 / P3 で確認 | 完了 | さつき | 10 M-04 |
| T-301 | マイグレーション: 型・表・インデックス | T-006(Q-9,10,20), M-04 | ローカルで `supabase db reset` が通る | 完了 | | 01 |
| T-302 | マイグレーション: 共通関数・RLS・トリガ・RPC | T-301 | 同上 | 完了 | | 02 |
| T-303 | pgTAP テスト DB-01〜19、共有テストベクタで DB-06 | T-302, T-205 | `supabase test db` が緑 | 完了 | | 02 §5 |
| M-05 | Google Cloud: OAuth 同意画面（テスト状態で開始） | — | 設定済み | 完了（2026-09-28。プロジェクト `wwyd`、テスト中＋さつきをテストユーザーに。公開は M-05b） | さつき | 10 M-05 |
| M-06 | Google Cloud: OAuth クライアント ID | M-05, M-01 | 作成済み | 完了（2026-09-28。`wwyd-neon`） | さつき | 10 M-06 |
| M-07 | Supabase: Google プロバイダと URL 設定 | M-06 | 有効化済み | 取り消し（Neon の N-01〜N-04 に置き換え） | さつき | 10 M-07 |
| T-304 | ログイン画面・認証状態・`whoami`・利用不可画面 | T-105, T-302, M-07 | ローカルで Google ログイン → 一覧（空）まで | 完了（T-309 で Neon に書き換え、本番で確認） | | 06 §0.3, §1 |
| T-305 | 本番 DB へのマイグレーション適用（承認後） | T-303, M-03 | さつきの承認後に `db push`、本番で DB テストの一部をスモーク | 取り消し（Neon に移行。T-311 に置き換え） | | — |
| M-09 | 管理者 UID の登録 | T-311 | `app_admins` に 1 行 | 完了（2026-09-28。本番の app_admins に 1 行・neon_auth の利用者に対応することを読み取りで確認） | さつき | 10 M-09 |
| N-01 | Neon のアカウントとプロジェクト作成（シンガポール） | Q-25 | Project ID を Claude に共有 | 完了（Project ID `patient-leaf-06853495`、AWS Asia Pacific 1 (Singapore)。アカウント作成時に自動で作られたものを使う。2026-09-28） | さつき | 10 N-01 |
| N-02 | Neon の Auth と Data API の有効化 | N-01 | 有効化済み | 完了（2026-09-28。Data API URL と Auth URL を 12 章 §7.1 に記録） | さつき | 10 N-02 |
| N-03 | Neon CLI のログイン | N-01 | `npx neonctl` が使える | 完了（2026-09-28） | さつき | 10 N-03 |
| N-04 | Google OAuth を Neon Auth につなぐ（M-05・M-06 の差し替え） | N-02, M-05 | Neon Auth に Google を設定済み | 完了（2026-09-28。production は専用の鍵、信頼するドメイン `http://localhost:5173`。dev は共用の鍵のまま） | さつき | 10 N-04 |
| N-05 | CI 用の Neon の API キーを GitHub の Secrets（NEON_API_KEY）に入れる | N-01 | CI の db ジョブが動く | 未着手 | さつき | 10 N-05 |
| T-306 | スパイク: Neon の Data API・Auth・Functions・権限・ローカルの pgTAP（12 章 §5 の S-1〜S-7） | N-01〜N-03, Q-25〜Q-29 | 結果を 12 章と決定ログに記録し、12 章を確定稿に | 完了（iPhone でのログインだけ M-08 の後に確認。12 章 §5.1） | | 12 §5 |
| T-307 | マイグレーションを Neon 向けに書き換え（利用者の表・auth.uid・ロール・権限） | T-306 | 開発用ブランチに適用できる | 完了（dev ブランチに適用済み） | | 12 §4 |
| T-308 | pgTAP を Neon 向けに書き換え、ローカルの Postgres で実行（CI の db ジョブも） | T-307 | DB-01〜19 が緑 | 完了（Neon の一時ブランチで 143 件＋DB-19 が緑） | | 12 §5 S-7 |
| T-309 | アプリのログインまわりを neon-js に書き換え（T-304 の置き換え） | T-306, N-04 | 開発用ブランチで Google ログイン → whoami | 完了（パソコンの Chrome で確認。iPhone は M-08 の後） | | 12 §2 |
| T-310 | Supabase のローカル環境・設定・依存を外す | T-307〜T-309 | 残骸なし | 完了 | | 12 Q-29 |
| T-311 | 本番ブランチへのマイグレーション適用（承認後） | T-308 | さつきの承認後に適用、スモーク | 完了（2026-09-28。さつきが実行。10 本の適用、public の 10 表すべてで RLS、未認証の Data API が 400 で拒否されることを確認） | | — |

### P4 一覧

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-401 | データ層: `list_posts` の呼び出しとページング | T-302 | 単体テスト（モック）緑 | 完了（`list/spotList.ts`、29 件） | | 02 §4.2 |
| T-402 | 一覧画面（PC / スマホ、カード、タブ、フィルタ、並び替え、追加読み込み、空状態、エラー） | T-401, T-104 | 06 §2 の状態をすべて表示確認 | 完了（dev の試験データで確認） | | 06 §2 |
| T-403 | 削除（本人・管理者）と確認ダイアログ | T-402 | 本番 DB で削除 → カスケードを確認 | 完了（dev と本番で画面から削除 → 6 表のカスケードを確認。管理者の削除は DB-18・06_delete で確認済み、画面は M-09 の後） | | 06 §2.4 |

### P5 スポット投稿

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-501 | Edge Function `create-post`（認証・検証・再生・照合・補完・保存） | T-203, T-204, T-206, T-103, T-302 | EF-01〜05 緑 | 完了（`packages/functions/src/createPost`。依存 pg・@neon/functions を追加。dev と本番に配備（本番はさつきが実行）。EF-05 を確認） | | 03 §3, §5 |
| T-502 | 基本設定・プレイヤーとハンド（ロック含む） | T-104, T-201 | 06 §3.3–3.4 のバリデーションを表示確認 | 完了 | | 06 §3.3–3.4 |
| T-503 | カードキーボード（フリック・1→0・使用済み・自動スクロール） | T-502 | 06 §3.5 の全入力を単体テスト＋スマホ実機 | 進行中（単体テスト 34 件・スマホ幅のエミュレーションで確認。実機は M-08 の後） | | 06 §3.5 |
| T-504 | アクション入力・ボード・カードピッカー・1つ戻す・すべて消す・終了表示 | T-202, T-502 | H-S1 / H-MW / H-S3 / RUN-01 を入力できる | 完了（H-S1 / H-MW / H-S3 を画面から入力。ランアウトで 5 枚を続けて求めることは draft.test.ts で確認） | | 06 §3.6 |
| T-505 | スポット選択・タイトル・投稿時のバリデーション・送信 | T-204, T-501, T-504 | 投稿 → 一覧の「自分の投稿」に出る。エラー一覧の表示確認 | 完了（dev と本番で投稿 → 「自分の投稿」タブ） | | 06 §3.7–3.8 |
| T-506 | スマホの 4 ステップ構成 | T-505 | スマホ実機で投稿まで | 進行中（スマホ幅 375px で H-S3 を投稿。実機は M-08 の後） | | 06 §3.1 |
| M-08 | Cloudflare Pages のプロジェクト作成 | T-102, T-106 | プレビュー URL が発行される | 完了（2026-09-28。https://wwyd.pages.dev 。main の push で自動ビルド。本番の Neon につながる） | さつき | 10 M-08 |

### P6 回答

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-601 | `get_post_detail` の呼び出しと振り分け | T-302 | 06 §4.2 の振り分けを確認 | 完了（`answer/postDetail.ts`・`screens/SpotScreen.tsx`。E2E と dev で振り分けを確認） | | 06 §4.2 |
| T-602 | テーブル（ICMCLEC の卓を参照）とリプレイ | T-202, T-104 | 自動再生・操作・reduced motion を確認 | 完了（`answer/Replay.tsx`・`replayModel.ts`。自動再生・操作・reduced motion を E2E で確認） | | 06 §4.3 |
| T-603 | ブラシとミックスバー（重なったハンドルの規則、キーボード操作） | T-104 | 単体テスト（ハンドル選択の規則）＋E2E | 完了（`answer/brush.ts`・`BrushPanel.tsx`。ハンドル選択の単体テスト＋E2E。書き方は Q-30） | | 06 §4.4 |
| T-604 | レンジ表の塗り・なぞり・消去・スポイト・元に戻す / やり直す・クリア | T-205, T-603 | E2E | 完了（`answer/paintEditor.ts`・`RangeGrid.tsx`。E2E（マウスとタッチ）） | | 06 §4.5–4.6 |
| T-605 | サイズ（プリセット・入力・ゲージ・範囲外）と集計バー | T-204, T-604 | PCT のケースが画面で一致 | 完了（`answer/answerForm.ts`・`SizeControl.tsx`・`ComboBar.tsx`。H-S1 の 50% 17.55bb・33% 13.79bb が画面で一致） | | 06 §4.7–4.8 |
| T-606 | 送信（確認ダイアログ・answers insert・エラー）と Hero の予想（`save_host_answer`） | T-605 | 送信 → 集計へ。2 回目は集計へ。予想は上書きできる | 完了（E2E と dev の実データで、送信 → 集計、2 回目の拒否、予想の上書きを確認） | | 06 §4.9 |
| T-607 | スマホのタブ構成（上部固定パネル、下部固定バー） | T-606 | スマホ実機で回答まで | 進行中（スマホ幅 360〜412px と Pixel 7 のエミュレーション（タッチ）で回答まで。実機は M-08 の後） | | 06 §4.1 |

### P7 集計

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-701 | 集計レンジ（全体・自分・Hero の予想、濃さ、白枠、内訳、上部バー、空状態） | T-205, T-601 | 05 §4 の表示計算の単体テスト緑、画面確認 | 完了（`answer/resultModel.ts`・`ResultGrid.tsx`・`screens/ResultScreen.tsx`。単体テストと E2E、dev で画面確認） | | 05 §4, 06 §5.2 |
| T-702 | 実際のアクションとハンドヒストリー（最後まで再生、出題タグ、強調） | T-602 | 画面確認 | 完了（`resultFrames`・卓のホールカードを席ごとに。E2E と dev で確認） | | 06 §5.3–5.4 |
| T-703 | 操作（予想を編集・削除）とスマホのタブ | T-701, T-702 | スマホ実機で確認 | 進行中（E2E（Pixel 7）と 375px のエミュレーションで確認。実機は保留） | | 06 §5.5 |

### P8 アカウントと管理者

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-801 | アカウントメニュー・ログアウト | T-304 | 動作確認 | 完了（P1・P3 で作成済み。E2E でメニュー・規約への移動・ログアウトを確認） | | 06 §0.2 |
| T-802 | アカウント削除（`delete_my_account`、必要なら予備の Edge Function） | T-302 | DB-16 相当を本番の検証用アカウントで確認 | 進行中（画面と E2E（成功・失敗・やめる）は完了。サーバー側は DB-16。本番の検証用アカウントでの確認が残り） | | 02 §4.6, 03 §6 |
| T-803 | 利用規約・プライバシーポリシーの起案と表示 | T-006(Q-11,19) | さつきが承認（M-11） | 完了（Fable の起草をさつきと整理し、確認用サイトでさつきが確認。【要記入】なし） | | 06 §6.2 |
| M-11 | 規約文の承認・問い合わせ先の決定 | T-803 | 承認 | 完了（2026-09-28。問い合わせ先 baudouiniv5853@gmail.com。施行日・運営者名・管轄は載せない） | さつき | 10 M-11 |

### P9 OCR

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| M-13 | OCR の流用元と正解データの扱いの確認 | — | Q-17 に回答 | 完了 | さつき | 10 M-13 |
| T-901 | 正解データの変換（名前を除去）と配置 | M-13 | fixtures 作成 | 未着手 | | 07 §6 |
| T-902 | カード・スート・ボード・行検出の移植 | T-901 | ボード 100% | 未着手 | | 07 §2 |
| T-903 | 本文認識（方式は Q-17）とパーサ移植、All-in の正規化 | T-902 | プレイヤー・アクション 95% 以上 | 未着手 | | 07 §3–4 |
| T-904 | 投稿画面への組み込み（上書き確認・再生検証・破棄） | T-903, T-505 | 実画像で投稿まで。外部通信なし（DevTools と CSP で確認） | 未着手 | | 06 §3.9, 07 §5 |

### P10 仕上げとリリース

| ID | 内容 | 依存 | 完了条件 | 状態 | 担当 | 詳細仕様 |
|---|---|---|---|---|---|---|
| T-1001 | リリース前チェックリスト作成と実施（不変条件 10 項目、a11y、CSP、秘密情報の混入なし、無料枠の見積もり。**プライバシーポリシー 1.3（OCR）の記述が実装と一致し、外部通信が無いこと**） | P1〜P9 | すべて満たす | 未着手 | | CLAUDE.md §7 |
| T-1002 | E2E 総点検（PC / スマホ、主要フロー） | P4〜P8 | Playwright 緑 | 未着手 | | 06 |
| T-1003 | 休止対策（Q-12 で採用する場合） | T-006(Q-12) | 定期実行の成功を確認 | 未着手 | | 08 §4 |
| M-05b | OAuth 同意画面を本番に公開、URL（ホーム・規約・プライバシー）を登録 | M-08, T-803 | 公開ステータスが本番 | 未着手 | さつき | 10 M-05 |
| M-12 | 運用手順（休止からの再開・容量整理・許可リスト）の確認 | T-1001 | さつきが手順を把握 | 未着手 | さつき | 10 M-12 |
| T-1004 | 本番公開（さつきの承認後） | T-1001, M-05b | 本番 URL で主要フローが動く | 未着手 | | — |

---

## 決定ログ

| 日付 | 決定内容 | 理由 | 決めた人 |
|---|---|---|---|
| 2026-09-27 | アプリ名を「WWYD（What Would You Do?）」とする | 依頼で指定（仕様書 §12 未決 1 の解消） | さつき |
| 2026-09-27 | リポジトリは `satsuki19980613/WWYD` のみを使う | 依頼で指定 | さつき |
| 2026-09-27 | バックエンドは Supabase（Auth の Google プロバイダ、Postgres、RLS、トリガ） | 仕様書 v0.2 §7・§11 で確定 | さつき（仕様書） |
| 2026-09-27 | UI は ICMCLEC の UI コンセプトを完全に踏襲し、Skill（`frontend-design-principles`、`wwyd-ui-concept`）を最初に導入する | 依頼で指定 | さつき |
| 2026-09-27 | モックの見た目（配色・フォント・フェルト卓）は採用せず、画面構成と操作だけを参考にする | 上記の UI 方針による | Claude（さつきの指示の解釈。確認待ちの Q-1・Q-2 と合わせてレビュー） |
| 2026-09-27 | STEP 1〜3 を承認。詳細仕様 11 章の Q-1〜Q-23 をすべて推奨案で決定（ダーク固定、アクション配色＝fold 赤 / check・call シアン / s1 黄＋斜線、受領モックで進める、BB 1 固定、mbb 整数と 0.01bb 丸め、実効スタック＝開始スタック、最大額＝自席のベット額＋残り、不完全レイズは累積でも再オープンしない、未回答者には停止位置まで返す、投稿枠は削除で戻らない、技術構成は CLAUDE.md §3 のとおり、表示名は認証基盤側の保持を許容、休止は定期アクセスで防止、ログイン画面は最小構成、予想入力時の Hero ハンドは表向き、完了トーストなし、OCR は tenfour_watcher を tesseract.js で移植、Cloudflare Pages、問い合わせ先は専用メール＋ハンドルネーム、許可リストは最初から入れて無効、Hero の予想も回答と同じ検証、アプリ名 WWYD・ロゴなし、一覧は自動の追加読み込み） | すべて推奨でよいとの回答 | さつき |
| 2026-09-27 | OCR の正解画像（個人の対戦画像）は公開リポジトリに置かず、ローカルのみで検証する | Q-17 ③は推奨を示していなかったため、公開範囲を広げない側を選んだ | Claude |
| 2026-09-27 | ICMCLEC（pocket-ICM・非公開）由来の本番モックとトークンの写しは git 管理外にし、未 push の履歴からも削除する | WWYD は公開リポジトリのため | さつき（履歴の削除を許可） |
| 2026-09-27 | 正となる資料 2 点を `C:\Users\sa641.SATSUKIPC\Downloads` から `docs/source/` に配置（内容は無変更） | 依頼時点でリポジトリが空だったため | Claude |
| 2026-09-27 | 依存の版: TypeScript ~5.9.3、Vite ^8.3.1、@vitejs/plugin-react ^6.1.1、Vitest ^5.0.2、React 18.3、Supabase CLI ^2.118.0（開発用） | TypeScript 7（Go 版）はエコシステムの対応を待つため 5 系の最新にした。他は執筆時点の最新 | Claude |
| 2026-09-27 | ESLint は入れず、tsc の検査（`noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns` / `noFallthroughCasesInSwitch` / `noUncheckedIndexedAccess`）で「ESLint 相当」とする | 承認済みの依存に ESLint が無く、依存を増やさない方針（T-101） | Claude |
| 2026-09-27 | UI 部品の単体テストは入れない（jsdom 等を追加しない）。画面の挙動は P6 以降の Playwright で確かめる。純関数（ルーター・状態判定・ⓘ の対応）は Vitest | 依存を増やさない | Claude |
| 2026-09-27 | PC（700px 以上）ではアプリ面の幅 `--app-w` を 1120px に広げる（スマホは ICMCLEC と同じ 420px）。トークンの追加はアクション色の別名 `--act-*`（既存色の参照のみ）と `--hdr-h` だけ | 06 章 §0.2 の「PC は構成を変える」。新しい色は作らない | Claude |
| 2026-09-27 | 開発時だけ `/_dev/ui`（部品一覧）と `?devstate=`（全画面の状態の強制表示）を置く。本番ビルドには含めない（`import.meta.env.DEV` で分岐ごと削除されることを確認） | T-104 / T-105 の表示確認のため | Claude |
| 2026-09-27 | **ホスティングは Cloudflare Pages で確定（T-106）**。公式ページで確認（2026-09-27）: 全プランで帯域・リクエスト無制限、1 ファイル 25MiB、2 万ファイル、ビルド月 500 回、`_headers` 100 ルール（1 ヘッダー 2,000 文字）、プレビュー無制限、トップレベルに `404.html` が無ければ SPA として扱う | 08 章の要件をすべて満たす | Claude（Q-18 の決定の再確認） |
| 2026-09-27 | Supabase Edge Functions の制限を公式ページで確認（2026-09-27）: CPU 2 秒/リクエスト、メモリ 256MB、関数サイズ 20MB（CLI でローカル bundle）、無料で 100 関数 | 03 章 §1 の前提どおり | Claude |
| 2026-09-27 | **Edge Function から `packages/core` を相対 import で共有する（T-103）**。関数ごとに `deno.json`（`"nodeModulesDir": "none"`）を置く。本番配備での確認は T-501 で行い、失敗したら複製＋CI 検査方式に切り替える | ローカル serve と edge-runtime の bundle で動作を確認。`deno.json` なしでは node_modules 全体（232MB）が bundle に入る。詳細は 03 章 §2.1 | Claude |
| 2026-09-27 | ローカル Supabase のポートを 5432x から 5532x に変更（`supabase/config.toml`） | Windows（Hyper-V）が 54319〜54418 を予約しており DB が起動できなかった | Claude |
| 2026-09-27 | P1 を承認。`phase/01-foundation` を push し PR #2 で CI 緑を確認して main へマージ | さつきの指示（PR を作成してマージ） | さつき |
| 2026-09-27 | GitHub Actions を `actions/checkout@v7` / `actions/setup-node@v7` に更新 | v4 は Node 20 の非推奨警告が出たため | Claude |
| 2026-09-27 | `@vitest/coverage-v8` ^5.0.2 を追加。`npm run test:coverage` で `packages/core` の行カバレッジを計測し、90% 未満で失敗させる | P2 の完了条件の計測のため（さつき承認） | さつき |
| 2026-09-27 | レーキ（%）は小数第 2 位まで。第 3 位以下は `malformed`（DB の numeric(5,2) に合わせる。0〜100 の外は仕様どおり `invalid_settings`） | 04 章 VAL-15/16 にレーキの小数桁の定めが無いため、DB の型に合わせた | Claude |
| 2026-09-27 | `runActions` の戻り値は `states[0]` = 初期状態、`states[i+1]` = アクション i の適用直後。検証エラーの順序は street_mismatch → not_your_turn → malformed（to の有無）→ illegal_action → amount_out_of_range | 04 章 §6・§7 に順序の定めが無いため。リプレイ画面でも同じ配列を使う | Claude |
| 2026-09-27 | CI の単体テストを `npm run test:coverage` に変更（core の行カバレッジ 90% 未満で失敗） | P2 の完了条件を CI で保つため | Claude |
| 2026-09-27 | Q-24: RAISE-08 は §5 の規則どおり raise なし（推奨 (a)）。04 章の RAISE-08 を修正し RAISE-08b を追加 | さつきの回答（推奨どおり） | さつき |
| 2026-09-27 | P2 を承認。`phase/02-poker-logic` を push し PR #3 で CI 緑を確認して main へマージ | さつきの指示（マージ） | さつき |
| 2026-09-27 | 関数の実行権限は「関数を作るたびに PUBLIC・anon・authenticated から取り消し、必要な付与だけ」にする。02 章の SQL のままでは、後から作る関数（insert_post を含む）に PUBLIC の実行権限が残り anon から呼べた | Postgres の関数の既定権限はスキーマ単位では取り消せない。全体の既定権限を変えるとテスト用の一時関数など他へも影響するため、局所的に行う。DB-01 のテストで実行できる関数の一覧を固定して検出する | Claude |
| 2026-09-27 | validate_paint の判定順を 05 章 §2.3 と TS に合わせる（値域 → 合法キー → 合計 → 空を、それぞれ全マスについて） | 02 章の SQL はマスごとに混ぜて判定しており、違反が複数あると TS と結果が変わるため | Claude |
| 2026-09-27 | アカウント削除は RPC `delete_my_account` だけで行う（予備の Edge Function `delete-account` は作らない） | ローカル（CLI 2.118.0 / Postgres 17）で postgres 所有の関数から auth.users を削除できた（DB-16）。本番でも T-305 で確認する | Claude |
| 2026-09-27 | DB-19（同時回答）は pgTAP ではなく `scripts/dbConcurrency.mjs`（10 接続で同時に挿入）で確かめ、CI の db ジョブで実行する | pgTAP は 1 トランザクションで動くため同時実行を作れない | Claude |
| 2026-09-27 | DB-06 の pgTAP は共有テストベクタ（JSON）から `scripts/genPaintVectorsSql.mjs` で生成し、CI で最新かを検査する | pgTAP から JSON ファイルを直接読むにはスーパーユーザー権限が要るため | Claude |
| 2026-09-27 | `.env` はリポジトリ直下から読む（Vite の envDir）。開発時はローカルの Supabase につなぐ `.env.development`（CLI の公開デモキー。秘密情報ではない）をコミットし、`.env` より優先する | .env.example と同じ場所に置く手順（CLAUDE.md §5）に合わせ、ローカル開発を既定にするため | Claude |
| 2026-09-27 | `@supabase/supabase-js` ^2.117.2 を追加 | Q-16 で承認済みの依存 | さつき（Q-16） |
| 2026-09-28 | **バックエンドを Supabase から Neon に変更する** | Supabase の無料プランは 1 人 2 プロジェクトまでで、さつきの枠は使用中の 2 つで埋まっている。代替（既存の Supabase への同居、Neon、Cloudflare D1、Firebase、Nhost）を比較し、WWYD 専用にでき、無料枠が広く、Postgres・RLS・PostgREST 互換の API で今の設計を活かせる Neon を選んだ。細部は詳細仕様 12 章（確認待ち Q-25〜Q-29、スパイク S-1〜S-7） | さつき |
| 2026-09-28 | 12 章の Q-25〜Q-29 をすべて推奨案で決定（地域はシンガポール、表示名・メールは neon_auth に置き非公開、新しい依存を追加、投稿の検証は Neon Functions、Supabase 向けの成果は書き換えて使う） | さつきの回答 | さつき |
| 2026-09-28 | 利用者の ID は Neon の `auth.uid()` ではなく自前の `public.current_uid()`（`request.jwt.claims` の `sub` を読む）で取る | Neon の `auth.uid()` は `authenticated` から使えず（`auth` スキーマの権限を付与できない）、SECURITY DEFINER の関数の中では値を返さないため（スパイク S-1） | Claude |
| 2026-09-28 | 開発用ブランチ `dev`（`br-morning-thunder-b3cfadmk`）を production から作り、スパイクと開発に使う | 本番を触らずに試すため | Claude |
| 2026-09-28 | メールアドレス＋パスワードの新規登録を production・dev で無効化 | WWYD は Google ログインだけ（さつき承認） | さつき |
| 2026-09-28 | DB テストは Neon の一時ブランチ（空の `test-base` から作成、1 時間で自動削除）で実行する。CI は Secrets の NEON_API_KEY があるときだけ | Neon にローカル版が無く、本物のロール・拡張で確かめられるため | Claude |
| 2026-09-28 | Neon の公式 SDK は使わず、Neon Auth の REST を直接呼ぶ（`backend/neon.ts`）。Data API は `@supabase/postgrest-js`。`better-auth` は入れない | 公式 SDK は Next.js を必須の依存に持ち Vite では入らない。直接呼ぶ手順は 4 つだけで依存を増やさずに済む | Claude（Q-27 の範囲） |
| 2026-09-28 | 投稿の検証は Neon Functions（`packages/functions`、Node.js 24）で行う。JWT は `jose`（Q-27 で承認）で Neon Auth の JWKS に対して検証し、CORS は許可するオリジンの一覧で限定する | スパイク S-4 で core の取り込み・JWT の検証を確認（12 章 §5.1） | Claude |
| 2026-09-28 | Google の同意画面は「テスト中」のまま進め、さつきをテストユーザーに登録する。公開（本番）は M-05b（Cloudflare Pages の後） | 公開にはブランディングのホームページ・プライバシーポリシーの URL が必要で、まだ公開のページが無い | さつき（推奨どおり） |
| 2026-09-28 | 本番の公開の URL を `.env.production` に置き、手元で本番につなぐ確認は `npm run dev:prod`（`.claude/launch.json` の `app-production`）で行う | URL は秘密ではない（12 章 §7.1）。ビルドもこの値を使う | Claude |
| 2026-09-28 | 本番を変える操作（マイグレーション適用など）は Claude Code の安全機能で止められるため、さつきが自分で実行し、Claude は読み取りで結果を確かめる | T-311 で実際に止められた | Claude |
| 2026-09-28 | 詳細仕様 12 章を確定稿 1.0 にし、CLAUDE.md の技術構成・コマンド・秘密情報・確認が必要な操作を Neon に合わせて更新 | スパイクが iPhone を除き完了したため | Claude |
| 2026-09-28 | 一覧のストリートと並び替えは択一のチップ（`aria-pressed`、選択中は黄）。切り替えは URL のクエリを履歴を増やさず置き換える（`?street=pf` 等、値は DB と同じ）。カードの「回答する」は黄の面取り、「結果を見る」「回答を見る」はシアンの副次ボタン、「削除」は赤の枠線（06 章 §8） | 06 章 §2.1 に部品の指定が無く、モックもチップだったため。ネイティブの select は使わない | Claude |
| 2026-09-28 | 席名（Hero BTN vs Villain BB）はポジション色（`--bu` 等）で表示する | ポジション色は席の識別用のトークン（wwyd-ui-concept） | Claude |
| 2026-09-28 | 投稿の削除は Data API の `delete ... select id` で行い、消えた行が 1 件でなければ失敗とする | RLS で弾かれた削除はエラーにならず 0 件になるため | Claude |
| 2026-09-28 | Neon Function の依存に pg・@types/pg・@neon/functions を追加 | Neon の公式手順が Functions では pg（プール）を推奨し @neondatabase/serverless を使わないよう書いているため | さつき |
| 2026-09-28 | create-post の構成: HTTP の振る舞いは `createPostHandler`（JWT の検証と DB を引数で受け取る純粋な部分）で単体テストし、入口 `index.ts` は pg のプールと jose だけを持つ。関数名は `createpost`（Neon の slug は英小文字と数字だけ）。許可するオリジンは環境変数 `ALLOWED_ORIGINS`（カンマ区切り、配備時の --env） | 03 章 §3 の仕様を Neon Functions（12 章）で実装するため。配備時の esbuild は createRequire のバナーを付けるので pg の require も動く（手元で同じ設定で確認） | Claude |
| 2026-09-28 | アプリは create-post の URL を `VITE_NEON_CREATE_POST_URL` で受け取る（公開の住所。dev の分は `.env.development` に記録） | Data API・Auth の URL と同じ扱い（12 章 §7.1） | Claude |
| 2026-09-28 | H-S1 / H-MW / H-S3 の入力例は `packages/core/src/post/postFixtures.ts`（テスト専用）に置き、core・Function・投稿画面のテストで共有する | 同じ見本を 3 か所で使うため | Claude |
| 2026-09-28 | 投稿画面の送信前の検査は、06 章 §3.8 の一覧の後に core の validateInput と verifyPost を通す（03 章 §4）。サーバーと同じ判定なので、通れば create-post で拒否されない | 不変条件 7 | Claude |
| 2026-09-28 | 「T4ハンドヒストリー画像を読み込む」ボタンは P9（OCR）で置く。それまでは投稿画面に出さない | 押しても何もできないボタンを置かないため | Claude |
| 2026-09-28 | カードキーボードはパソコンのキーでも打てる（2〜9・A K Q J T・1→0・s h d c・Backspace・Delete でクリア） | PC でも同じキーボードを出すため、手で打てると速い。仕様の規則（06 章 §3.5）はそのまま | Claude |
| 2026-09-28 | create-post を本番に配備（許可するオリジンは当面 `http://localhost:5173`。Cloudflare Pages の URL は M-08 の後に足して配備し直す）。本番を変える配備は Claude Code の安全機能で止められるので、さつきが実行する | さつきの承認（推奨どおり） | さつき |
| 2026-09-28 | 手順書 10 章の M-08（Cloudflare Pages）と M-09（管理者の登録）を Neon 版に書き直した。M-08 では Cloudflare に秘密の値を入れない（公開の住所は `.env.production` からビルドが読む）。M-09 は Gmail を書き換えた SQL 1 行で登録する | Supabase 時代の手順のままだったため | Claude |
| 2026-09-28 | 秘密の値（API キー等）は手元のファイルに置かず、各サービスの設定（GitHub Secrets 等）に直接入れる運用を基本にする。`.claude/settings.json` の禁止は Claude のファイル読み書きの機能にだけ効き、シェルのコマンドは塞いでいないため | さつきの質問への回答（推奨どおり） | さつき |
| 2026-09-28 | 開発用の試験データを `db/seed/dev.sql`（`npm run db:seed -- --branch dev`）で入れる。dev 以外のブランチには実行できない。ハンドは H-S1、派生メタは core の spotView で計算した値 | create-post（P5）ができるまで投稿を作る手段が無く、一覧以降の画面を確かめるため | Claude |
| 2026-09-28 | **E2E に Playwright（`@playwright/test`、開発用の依存）を追加する**。Neon Auth・Data API への通信は偽の応答に差し替え（`e2e/fakeBackend.ts`）、本物のバックエンドにはつながない。PC（1280px）とスマホ（Pixel 7、テスト名に `@sp`）で実行。CI に e2e ジョブを追加 | P6 の完了条件（E2E）。Google ログインは自動化できないため。実データとの結合は dev で手動確認する | さつき |
| 2026-09-28 | 重なったハンドルは「その方向へ動けるもの」を掴む（右へは添字の大きい方、左へは小さい方）。06 章 §4.4 の書き方もこれに合わせて直した（Q-30） | 仕様書 §5.3.3 の原則。括弧内の字面どおりだと動かないことがある | さつき（Q-30、推奨案） |
| 2026-09-28 | 回答画面のメタ行のアンティは 0 のとき出さない | モックと同じ。キャッシュでは常に 0 なので | Claude |
| 2026-09-28 | Hero の予想モードでは Villain の席のラベルを「Villain」にする（「（あなた）」を付けない） | 入力しているのは Hero 本人なので | Claude |
| 2026-09-28 | 卓のポットは回収済みの額を出し、このストリートのベットは各席のチップで出す（フォールドした席のチップも回収まで残す） | モックと同じ。額が合うように | Claude |
| 2026-09-28 | `/s/:id` は未回答なら回答画面、回答済みと自分の投稿は集計へ（一覧のカードの遷移先と同じ）。Hero の予想の保存後は `/s/:id/result?view=host`（P7 で「Hero の予想」タブを選んで開く） | 06 章 §0.1・§4.9 | Claude |
| 2026-09-28 | 回答画面の離脱確認は、塗りが開いたときから変わっているときだけ出す（Hero の予想で既存の予想を開いただけでは出さない） | 06 章 §4.9 の意図 | Claude |
| 2026-09-28 | サイズのゲージはスタイルを付けた `<input type="range">`（キーボード・読み上げに対応済みの部品を使う）。`<select>` のように見た目を変えられない部品ではないため | CLAUDE.md §6 の趣旨 | Claude |
| 2026-09-28 | create-post（本番）の許可するオリジンを `http://localhost:5173,https://wwyd.pages.dev` にして配備し直した（版 2、URL は変わらない） | 公開サイトから投稿できるように | さつき（承認） |
| 2026-09-28 | Cloudflare Pages のプロジェクトは `wwyd`（https://wwyd.pages.dev）。最初に Workers で作ってしまい、公開の段階（`npx wrangler deploy`）で失敗したので、Pages で作り直した | 決定済みの Pages（08 章）。手順書 10 章 M-08 に注意を追記 | さつき |
| 2026-09-28 | **このプロジェクトは非営利**。利用は無料で、広告・アフィリエイト・寄付・有料機能・データの販売など収益を目的とする要素は一切入れない。CLAUDE.md §1 に追記 | 大前提の共有 | さつき |
| 2026-09-28 | 利用規約・プライバシーポリシーの文面は claude.ai の Fable が起草する（リポジトリを読み、起草前にネットリサーチをする条件）。Claude Code は表示と、文案とコードの突き合わせを担う | さつきの指示 | さつき |
| 2026-09-28 | 規約ページは `packages/app/src/legal/*.md` を同梱し、自前の小さな Markdown の解釈（見出し・段落・リスト 2 段・表・区切り線・太字・リンク。HTML は解釈しない）で React の要素として描く | 依存を増やさない。同梱の文書だけを読むので十分 | Claude |
| 2026-09-28 | アカウント削除の後は一覧の URL（`/`）のログイン画面へ移る。削除に失敗したらダイアログを閉じて「削除できませんでした」のトースト（ログインしたまま） | 06 章 §6.1。消えた投稿の URL に留まらないように | Claude |
| 2026-09-28 | **書体を自サイトから配信する**。依存 `@fontsource/rajdhani`・`@fontsource/share-tech-mono`・`@fontsource/zen-kaku-gothic-new`（^5.3.0、OFL-1.1）を追加し、`index.html` の Google Fonts の読み込みを外した。太さは従来と同じ。ビルドは 934 ファイル・16MB（Cloudflare Pages の無料枠の上限内）。プライバシーポリシーから Google Fonts の行を削除、08 章の CSP 案を `font-src 'self'` に | 利用者の情報が Google に届かないようにする。OCR の「外部と通信しない」の確認もしやすくなる | さつき（依存の追加も承認） |
| 2026-09-28 | 仕様書の「Hero の予想」を、画面・文書では「**Hero の想定レンジ**」と表示する（ボタン「想定レンジを保存」「想定レンジを編集」「想定レンジを入力」、空状態「想定レンジなし」）。コード・テスト・詳細仕様・CLAUDE.md・プライバシーポリシーを直した（`docs/source/` と 11 章の確認待ちの記録、plan.md の過去の記録はそのまま） | 「予想」がしっくりこない | さつき |
| 2026-09-28 | **利用規約に「対局中の使用禁止（RTA の禁止）」を入れない**（仕様書 §8 からの変更。06 章 §6.2 を直した） | 本サービスは RTA に使えるような作りではない | さつき |
| 2026-09-28 | 利用規約に賠償の条項（上限額など）を置かない。免責は「利用によって生じた損害について責任を負わない」の一文だけにする。不適切な投稿は運営者の判断で予告なく削除する、とだけ書く | 100 人程度の非営利の小さなツールには過剰 | さつき |
| 2026-09-28 | 集計の内訳の平均（キーごとの %）は小数第 1 位で出す。自分 / Hero の予想のミックスは 5% 刻みなので整数で出す | 05 章 §4.3（比率の数値表示は小数第 1 位）。モックは整数に丸めていた | Claude |
| 2026-09-28 | 集計画面のハンドヒストリーは最後の状態から始め、自動再生しない。Hero のハンドは最初から表向き（回答済み・投稿者はもう知っている）、ほかの判明しているハンドは終了時だけ公開。終了時はベットをポットに回収し「ショーダウン」または「{席} ポット獲得」を卓の中央に出す | 06 章 §5.4 とモックの挙動 | Claude |
| 2026-09-28 | 集計画面の Villain の席のラベルは「Villain」（「（あなた）」を付けない）。スマホのタブ（集計 / ハンドヒストリー）を切り替えてもリプレイの位置・タブ・選んだマスを残す | 回答画面と同じ扱い | Claude |
| 2026-09-28 | 集計のレンジ表は選ぶだけなので `touch-action: manipulation`（回答のレンジ表と違い、表の上から縦にスクロールできる）。選んだマスは黄の枠、Villain の実際のハンドは白枠 | 黄＝選択（UI コンセプト）、白枠は仕様書 §5.4.2 | Claude |
| 2026-09-28 | スマホの回答画面は、下部固定バーの高さを測って画面下の余白に使う（最後の行がバーのすぐ上に来る）。タイルは 2 行にして上部固定パネルを低くした。360×740 でレンジ表の 13 行が一度に見える | レンジ表は `touch-action: none` でスクロールしにくいため | Claude |

---

## モックとの差分（実装がモックの挙動と異なる点）

仕様書 §9.2 の差分に加え、実装で生じた差分をここに記録する（仕様書に従っていることを確認したうえで）。

| 箇所 | モック | 本番 | 根拠 |
|---|---|---|---|
| 見た目全般 | ライト / ダーク、緑のフェルト、橙のアクセント | ICMCLEC 踏襲のダーク HUD【Q-1】 | 依頼 |
| アクション色 | fold 灰・check 緑・call 青・bet 橙 | fold 赤・check / call シアン・s1 黄【Q-2】 | 依頼（ICMCLEC 踏襲） |
| 仕様書 §9.2 の各項目 | v0.1 の挙動 | v0.2 の仕様 | 仕様書 §9.2 |
| ルーティング | ハッシュ（`#/answer/…`） | History API（`/s/:id/answer`） | 06 §0.1（OAuth の戻り先と衝突させない） |
| 回答前のハンド本体 | 全アクションを保持 | 停止位置まで【Q-9】 | 仕様書 §7.6 の意図 |
| スポイト | 読み込んだミックスをトーストで表示 | トーストを出さない（レンジ外のときだけ「レンジ外」） | 06 §4.5 |
| 何も変わらない塗り | 履歴に積む | 積まない（消しゴムで空のマスを押した等） | 元に戻すの 1 手が空振りしないように |
| Hero の予想の Villain のラベル | 「回答席」 | 「Villain」 | 決定ログ（2026-09-28） |
| 集計画面の他人の投稿の「回答を編集」 | ボタンがある | 出さない | 仕様書 §5.4.5・06 章 §5.5（回答は変更不可） |
| 集計の内訳の平均 | 整数の % | 小数第 1 位 | 05 章 §4.3 |
| 集計画面の終了時のハンドの一覧 | 卓の下に文字で並べる | 卓の上にカードで公開（マックは「マック」） | 表示の重複を避けた（内容は同じ） |

---

## セッションログ

### 2026-09-27（セッション 1）

- **行ったこと**:
  - 作業フォルダが空・リモートも空（`isEmpty: true`）であることを確認。`git init`（`main`）、remote 設定。
  - ICMCLEC の `.claude/skills/frontend-design-principles` を原本のまま複製（差分なしを確認）、`.claude/settings.json`（.env 系の読み書き禁止）を複製。
  - ICMCLEC の UI コンセプト（`styles.css` のトークン、本番モック、SPEC §11）を読み、`wwyd-ui-concept` Skill を新設（トークンの写しと本番モックを references に同梱）。
  - 正となる資料 2 点を Downloads から `docs/source/` に配置。
  - 仕様書 v0.2 とモックを精読。モックは v0.1 の挙動と判明（Q-3）。
  - OCR 流用元の候補 `tenfour_watcher` を読み取り専用で下調べ（外部 API なし・Python ＋ Tesseract・開始スタック等は画像に無い）。
  - CLAUDE.md、詳細仕様 d0.1（00〜11 章）、この計画書を作成。
- **変更したファイル**: `.gitignore`、`.gitattributes`、`.node-version`、`.env.example`、`.claude/settings.json`、`.claude/skills/**`、`CLAUDE.md`、`docs/source/*`、`docs/detailed-spec/*`、`docs/plan.md`
- **残課題**: さつきのレビュー（STEP 1〜3）、確認待ち Q-1〜Q-23、初回 push の承認（M-10）。push はまだしていない。

### 2026-09-27（セッション 1 の続き）

- **行ったこと**: さつきの承認（すべて推奨案）を決定ログ・11 章・CLAUDE.md §3・Skill に反映。詳細仕様を d1.0 に。ICMCLEC が非公開リポジトリと判明したため、同梱していた本番モックとトークンの写しを git 管理外にした（ファイルはローカルに残す）。履歴（72e7c66）からの削除は `git filter-branch` が権限で拒否されたため未実施。
- **変更したファイル**: `CLAUDE.md`、`.gitignore`、`.claude/skills/wwyd-ui-concept/SKILL.md`、`docs/detailed-spec/00-index.md`、`07-ocr.md`、`11-open-questions.md`、`docs/plan.md`
- **残課題**: 初回 push の方法をさつきが決める → push → `phase/00-prep` を main へマージ → P1 着手。
- **追記（M-04）**: さつきが Docker Desktop を導入。ユーザー単位のインストール（`%LOCALAPPDATA%\Programs\DockerDesktop`）で、アプリが起動していないと `docker` が `npipe:////./pipe/docker_engine` のエラーになることを確認。起動後 `docker run hello-world` 成功。
- **追記（引き継ぎ）**: 次セッション向けに `docs/BATON.md` を作成し、CLAUDE.md の開始手順に追加。ブランチ `phase/01-foundation` を作成してコミット（未 push）。
- **追記**: さつきの許可を得て `git filter-branch` で 2 ファイルを履歴から削除（該当 0 件を確認、ファイルはローカルに残置）。全コミットの秘密情報スキャン（該当なし）の後、`main` を初回 push し、`phase/00-prep` を PR 経由でマージ。

### 2026-09-27（セッション 2）

- **行ったこと**: P1 基盤（T-101〜T-106）を実装。
  - T-101: npm workspaces（`packages/core`、`packages/app`）、TypeScript 5.9 strict（ESLint の代わりに tsc の検査を強化）、Vitest 5。
  - T-104 / T-105: ICMCLEC と同名・同値のトークン、基本部品（ボタン・面取りプレート・コーナーブラケット・ハザード見出し・タブ・カスタムセレクト・モーダル・確認ダイアログ・トースト・アカウントメニュー）、ヘッダー、ⓘ（09 章の文言）、History API ルーター、起動中・未ログイン・利用不可・メンテナンス中・オフライン・404。開発時だけの部品一覧 `/_dev/ui` と `?devstate=`。
  - T-102: `.github/workflows/ci.yml`（typecheck・test・build）。push 前のため CI の実行は未確認。
  - T-106: Cloudflare Pages と Supabase Edge Functions の制限を公式ページで再確認（決定ログ）。
  - T-103: Supabase CLI を導入、`supabase init`。スパイク関数で直接 import を確認（serve と bundle）。スパイク関数は削除済み。
- **完了条件の確認**: `npm run typecheck` 緑、`npm test` 緑（4 ファイル 44 件）、`npm run build` 緑（JS 157KB / gzip 51KB、部品一覧は本番ビルドに含まれない）。ブラウザ（PC 幅とスマホ 375px）で、ヘッダー・ⓘ（画面ごとの節、アカウントメニューを開いているときはアカウントの節）・アカウントメニュー・確認ダイアログ（Esc で閉じてフォーカスが戻る）・各状態の画面・404 を表示確認。コンソールエラーなし。
- **自己レビュー（wwyd-ui-concept）**: 黄＝主要 CTA・選択中のタブ・ヘッダーの線・ハザードティック・起動中のマーク／赤＝削除・エラー・利用不可のブラケットのみ／シアン＝ⓘ・リンク・副次ボタン・フォーカス。シグネチャー: 面取り（主要ボタン・プレート・モーダル）、ブラケット（状態画面）、ハザードティック（見出し）、ヘッダーの減衰線、mono の小ラベル。トークン名は ICMCLEC と同じ（追加は別名 `--act-*` と `--hdr-h` のみ）。画面に説明文なし（未実装画面は見出しだけの器）。
- **変更したファイル**: `package.json`、`package-lock.json`、`tsconfig.base.json`、`tsconfig.tools.json`、`vitest.config.ts`、`packages/core/**`、`packages/app/**`、`.github/workflows/ci.yml`、`.claude/launch.json`、`supabase/config.toml`、`supabase/.gitignore`、`CLAUDE.md`、`docs/detailed-spec/03-server-replay.md`、`docs/plan.md`、`docs/BATON.md`
- **残課題**: push と PR での CI 確認（さつきの承認待ち）。本番の `functions deploy` での import 確認は T-501。CSP の `_headers` は Supabase の URL が決まってから（M-01 後、遅くとも P5）。
- **追記**: さつきの指示で push → [satsuki19980613/WWYD#2](https://github.com/satsuki19980613/WWYD/pull/2) を作成。CI 緑（19 秒）を確認。Node 20 の警告に対応して Actions を v7 に上げ、再度 CI 緑を確認してから main へマージ。

### 2026-09-27（セッション 2 の続き・P2）

- **行ったこと**: `@vitest/coverage-v8` を追加（さつき承認）。`packages/core` に P2 を実装。
  - T-201 `money.ts`（bb ↔ mbb、表示）、`cards.ts`、`errors.ts`
  - T-202〜T-204 `poker/state.ts`（初期状態・status・nextActor・advance・legal・apply）、`poker/replay.ts`、`poker/spot.ts`（候補・停止位置・派生メタ・% pot と逆算）
  - T-205 `paint/`（ラベル・コンボ、paint の encode / decode / hex、検証、集計の encode / decode・差分加算・表示計算）、共有テストベクタ `test-vectors/paint-validation.json`（18 件）
  - T-206 `post/validateInput.ts`・`post/verifyPost.ts`（03 章 §3.2 の 2〜7）
- **完了条件の確認**: 04 章 §10.1〜10.13 と 05 章 §5 の全ケースを自動テスト化して緑（254 件）。行カバレッジ 100%（閾値 90%）。型検査・ビルド緑。edge-runtime（Deno）上で `validateInput` → `verifyPost` と paint の往復が Node と同じ結果になることを確認（一時関数で確認し、削除済み）。
- **見つけた食い違い**: RAISE-08 の期待値が §5 の規則と合わない → 11 章 Q-24（確認待ち）。規則どおり実装し、RAISE-08b を追加。
- **変更したファイル**: `package.json`、`package-lock.json`、`vitest.config.ts`、`.github/workflows/ci.yml`、`packages/core/**`、`docs/detailed-spec/11-open-questions.md`、`docs/plan.md`、`docs/BATON.md`
- **残課題**: Q-24 の回答、push・PR での CI 確認、P2 の承認。EF-01〜04 の Edge Function 本体での実行は T-501（純関数部分は `post.test.ts` で確認済み）。
- **追記**: さつきが Q-24 を推奨案 (a) で決定。04 章の RAISE-08 を修正し RAISE-08b を追加、11 章を「決定」に更新。
- **追記**: さつきの指示で push → [satsuki19980613/WWYD#3](https://github.com/satsuki19980613/WWYD/pull/3) を作成。CI 緑（カバレッジ検査を含む）を確認して main へマージ。

### 2026-09-27（セッション 2 の続き・P3）

- **行ったこと**: ブランチ `phase/03-db-auth` で P3 のうちローカルでできる分を実装。
  - T-301 / T-302: `supabase/migrations/` に 9 本（型・設定表・投稿・回答と集計・インデックス・共通関数・RLS・トリガ・RPC）。
  - T-303: `supabase/tests/` に pgTAP 7 ファイル 143 件（DB-01〜18。DB-06 は共有テストベクタから生成）。DB-19 は `scripts/dbConcurrency.mjs`。CI に db ジョブを追加。
  - T-304: `@supabase/supabase-js` を追加。起動時の判定（ヘルスチェック → セッション → whoami）、Google ログイン（PKCE）、ログアウト、利用不可画面。
- **見つけて直したこと**: 02 章の SQL のままだと insert_post などが anon から実行できた（DB-01 で検出）。validate_paint の判定順が TS と違った。いずれもマイグレーションで修正し、02 章に注記。
- **確認**: pgTAP 143 件緑、同時回答 10 件で集計一致、Vitest 267 件緑（core の行カバレッジ 100%）、型検査・ビルド緑。ブラウザ（ローカルの Supabase）で、未ログイン → ログイン画面、テスト用アカウントでのログイン → 一覧（whoami の allowed）、許可リスト有効 → 利用不可 → ログアウト、`?error=` で戻る → 「ログインできませんでした」と URL の後始末、API 停止 → メンテナンス中 → 再開後に再読み込みで復帰、を確認（テスト用アカウントは削除済み）。
- **変更したファイル**: `supabase/migrations/*`、`supabase/tests/*`、`supabase/config.toml`、`scripts/*`、`package.json`、`package-lock.json`、`.github/workflows/ci.yml`、`.env.development`、`packages/app/**`（auth・supabase・App・vite 設定）、`docs/detailed-spec/02-rls-triggers-rpc.md`、`docs/detailed-spec/10-manual-tasks.md`、`docs/plan.md`、`docs/BATON.md`
- **残課題**: M-01〜M-03・M-05〜M-07（さつき）→ T-305 本番適用（承認後）→ 本番で Google ログイン確認 → M-09。push はまだしていない（CI の db ジョブは初回 push で確認）。

### 2026-09-28（セッション 2 の続き・Neon への移行決定）

- **行ったこと**: Supabase のプロジェクト作成で無料枠の上限（1 人 2 つ）に当たった。代替をネットで調査して比較（既存 Supabase への同居・Neon・Cloudflare D1・Firebase・Nhost・有料化・別アカウント）。さつきが Neon を選択。Neon の文書（Data API・Managed Better Auth・Functions・地域・移行ガイド）を読み、移行の設計案を詳細仕様 12 章にまとめた。10 章に Neon の手作業 N-01〜N-04、11 章に Q-25〜Q-29、CLAUDE.md に移行中の注記。
- **分かったこと**: Neon に東京リージョンは無い（最寄りはシンガポール）。Neon Auth は利用者（表示名・メールを含む）を同じ DB の `neon_auth` スキーマに置く。Neon Functions は Node.js で、シンガポールで使える。Data API は PostgREST 互換で、ロール名は `authenticated` / `anonymous`。
- **変更したファイル**: `docs/detailed-spec/12-neon-migration.md`（新規）、`00-index.md`、`10-manual-tasks.md`、`11-open-questions.md`、`CLAUDE.md`、`docs/plan.md`、`docs/BATON.md`
- **残課題**: Q-25〜Q-29 の回答、N-01（Neon のプロジェクト作成）、スパイク T-306。
- **追記（2026-09-28）**: さつきが N-01 を完了（Neon の Project ID `patient-leaf-06853495`）。N-02 の手順を案内。
- **追記（2026-09-28）**: N-01 のプロジェクトはアカウント作成時に自動で作られたもの（Singapore）と確認。作り直しは不要。作成直後の使用量は 31.69MB（0.5GB の枠に含まれる初期分）。
- **追記（2026-09-28）**: さつきが N-02（Data API と Managed Better Auth の有効化）を完了。
- **追記（2026-09-28）**: N-03 完了。dev ブランチを作成し、スパイク S-1〜S-3・S-5 を確認（12 章 §5.1）。`auth.uid()` の制約を見つけ、自前の `current_uid()` で解決できることを確認。
- **追記（2026-09-28）**: T-307〜T-310 を完了（Neon 向けのマイグレーション・DB テスト・ログイン、Supabase の撤去）。さつきがパソコンの Chrome で Google ログイン → 一覧まで確認。
- **追記（2026-09-28）**: スパイク S-4（Neon Functions に core を配備、さつきのログインの JWT を検証）を完了し、試作の関数は削除。12 章を確定稿に、CLAUDE.md を Neon に更新。10 章に N-05（CI 用 API キー）を追加。
- **追記（2026-09-28）**: T-311（本番へのマイグレーション適用）をさつきが実行し、Claude が読み取りで確認。N-04（WWYD 専用の Google OAuth、同意画面はテスト中）をさつきが完了。本番の「Sign-up with Email」が残っていたのでオフにしてもらった（Claude の確認漏れ）。`.env.production` と `npm run dev:prod` を追加し、さつきが本番で Google ログイン → スポット一覧を確認。**P3 完了**。
  - 変更したファイル: `.env.production`（新規）、`package.json`、`.claude/launch.json`、`CLAUDE.md`、`docs/detailed-spec/10-manual-tasks.md`、`docs/plan.md`、`docs/BATON.md`
  - 残課題: push・PR・マージ、N-05、M-09、dev の Sign-up with Email をオフ、iPhone の確認（M-08 の後）

### 2026-09-28（セッション 3・P4）

- **行ったこと**: plan.md の先頭に紛れ込んでいた「現在の状況」の更新分を表の中へ戻した（P3 の PR #4 はマージ済みと確認）。ブランチ `phase/04-list` で P4 を実装。
  - T-401: `packages/app/src/list/spotList.ts`（クエリの解釈、`list_posts` の引数とカーソル、ページの連結と重複の除去、経過時間・形式の表示、カードの操作と空状態）と単体テスト 29 件。
  - T-402: `useSpotList`（クエリが変わったら読み直し、古い応答は捨てる）と `ListScreen`（PC はグリッド、スマホは 1 列＋下部固定の投稿ボタン、チップは横スクロール、骨組み 3 枚、IntersectionObserver の追加読み込み、空状態、エラーと再試行）。
  - T-403: 削除の確認ダイアログ、Data API での削除、失敗のトースト。
  - `db/seed/dev.sql` と `npm run db:seed`（dev 専用の試験データ）。
- **確認**: dev の試験データで、表示・タブ・ストリート・並び替え・URL・追加読み込み（46 件、重複なし）・空状態・骨組み・読み込みエラーと再試行・削除（画面から削除 → posts / post_hands / post_secrets / answers / post_aggregates / host_answers が 0 行）・削除の失敗のトースト（role=alert）を確認。スマホ幅で横スクロールが出ないこと。Vitest 296 件、core の行カバレッジ 99.8%、型検査・ビルド緑。
- **変更したファイル**: `packages/app/src/list/*`（新規）、`packages/app/src/screens/ListScreen.tsx`（新規）、`packages/app/src/App.tsx`、`packages/app/src/styles/screens.css`、`db/seed/dev.sql`（新規）、`scripts/db.mjs`、`package.json`、`CLAUDE.md`、`docs/plan.md`
- **残課題**: 本番での一覧・削除の確認（本番に投稿が無いので P5 の後）、管理者の削除の画面確認（M-09 の後）、push・PR（さつきの承認待ち）。
- **追記（2026-09-28）**: さつきの指示で `phase/04-list` を push → [satsuki19980613/WWYD#5](https://github.com/satsuki19980613/WWYD/pull/5) を作成。CI（check・db）緑を確認して main へマージ。db ジョブは NEON_API_KEY（N-05）が未設定のため DB テストを実行していない。

### 2026-09-28（セッション 3・P5）

- **行ったこと**: ブランチ `phase/05-post` で P5 を実装。
  - T-501: `packages/functions/src/createPost`（`handler.ts` = CORS・認証・検証・エラーの写し方、`payload.ts` = insert_post の引数、`index.ts` = pg と jose の入口）。依存 pg・@types/pg・@neon/functions（さつき承認）。単体テスト 19 件。dev に配備（さつき承認）し、ブラウザのログイン中のセッションで未認証 401・改ざん 422・投稿 201 → get_post_detail / list_posts で読める（EF-05）を確認。
  - T-502〜T-506: `packages/app/src/post/`（`cardInput.ts` カードキーボードの規則、`draft.ts` 下書き・進行・ログ・送信前の検査、`draftStore.ts` メモリの下書きと離脱確認、`sendPost.ts`、`errorMessages.ts`、各セクションの部品）と `screens/NewPostScreen.tsx`、`styles/post.css`、`components/PlayingCard.tsx`。単体テスト 74 件。
- **確認**: dev で H-S1・H-MW（PC 幅）、H-S3（スマホ幅 375px の 4 ステップ）を画面から投稿し、get_post_detail の値（派生メタ・アンティ・レーキ・マック補完）が 04 章と一致。ロックと「すべて消す」、Villain の複数候補の選択と 1 席の自動選択、エラー一覧、使用済みのトースト、額の範囲外のトースト、フリック（上 K・右 ♦・下 ♣・タップ A）、ボードを押してそのストリート以降を消す（ピッカーが自動で開く）を確認。Vitest 388 件、core の行カバレッジ 99.8%、型検査・ビルド緑。
- **直したこと**: 合成イベントで setPointerCapture が例外を出してフリックが止まったので握りつぶすようにした。
- **変更したファイル**: `packages/functions/**`、`packages/core/src/post/postFixtures.ts`（新規）・`post.test.ts`、`packages/app/src/post/**`（新規）、`packages/app/src/screens/NewPostScreen.tsx`（新規）、`packages/app/src/components/{PlayingCard,ChipGroup}.tsx`・`posColor.ts`（新規）、`Select.tsx`、`ListScreen.tsx`、`App.tsx`、`main.tsx`、`styles/post.css`（新規）、`backend/neon.ts`、`vite-env.d.ts`、`.env.development`、`.env.example`、`package.json`、`package-lock.json`、`vitest.config.ts`、`docs/plan.md`、`docs/BATON.md`
- **残課題**: create-post の本番配備（承認待ち）と `.env.production` の URL、本番での P4・P5 の確認、スマホ実機（M-08 の後）、CSP の `_headers`（本番の関数 URL が決まってから）、dev に試験投稿が 4 件（題名「試験」。`npm run db:seed -- --branch dev` で消える）。
- **追記（2026-09-28）**: さつきの指示で `phase/05-post` を push → [satsuki19980613/WWYD#6](https://github.com/satsuki19980613/WWYD/pull/6) を作成。CI（check・db）緑を確認して main へマージ。db ジョブは N-05 が未設定のため DB テストを実行していない。
- **追記（2026-09-28）**: さつきが create-post を本番に配備（Claude の配備は安全機能で停止）。Claude が `neonctl functions list` で配備を確認し、本番の URL を `.env.production` に追加。さつきが本番にログインし、Claude が画面から H-S1 を投稿 → 表示 → get_post_detail → 削除 → カスケード（本番の 6 表が 0 行、読み取り専用のトランザクションで確認）。**P4 完了、P5 は実機確認を残して完了**。10 章の M-08・M-09 を Neon 版に書き直した。

### 2026-09-28（セッション 4・P6）

- **行ったこと**: ブランチ `phase/06-answer` で P6（T-601〜T-607）を実装。さつきの承認で Playwright を追加。
  - core: `stopState`（未回答者に返る、停止位置までに切り詰めたアクション列から停止位置の状態を求める）。spotView もこれを使う。
  - `packages/app/src/answer/`: `postDetail.ts`（get_post_detail の読み取り・エラーコード）、`brush.ts`（ブラシ・境界・重なったハンドル）、`paintEditor.ts`（ストローク・消去・スポイト・元に戻す 100 手・クリア）、`answerForm.ts`（サイズ・送信前の検査）、`replayModel.ts`（各手の状態・席の表示）、`answerApi.ts`（読み込み・insert・save_host_answer）、部品（`Replay.tsx`・`BrushPanel.tsx`・`RangeGrid.tsx`・`SizeControl.tsx`・`ComboBar.tsx`）、`detailFixtures.ts`（テスト用の応答）。単体テスト 48 件（core の stopState 2 件は別）。
  - `screens/SpotScreen.tsx`（`/s/:id`・answer・result の振り分け）、`screens/AnswerScreen.tsx`（PC 2 列 / スマホのタブ）、`styles/answer.css`、道具のアイコン。
  - E2E: `playwright.config.ts`、`e2e/fakeBackend.ts`、`e2e/answer.spec.ts`（32 件）、`npm run e2e`、CI の e2e ジョブ、typecheck に e2e を追加。
- **確認**: 単体テスト 439 件・core の行カバレッジ 99.8%・型検査・ビルド・E2E 32 件がすべて緑。dev の実データで、`/s/:id` → 回答画面、自動再生、送信 → DB に AA call 100% / KK raise 100% / 17.55bb・answer_count が 1 増える・集計へ、回答済みの `/answer` → 集計、2 回目の insert（`already_answered`）・自分の投稿（`own_post`）・合法でないキー（`paint_illegal_key`）の拒否、Hero の予想（A♦K♦ 表向き・確認なしで保存・`?view=host`・再読み込みで復元・上書き・集計に入らない）を確認。スマホは 360×740・412×915 のエミュレーション。
- **直したこと**: 開発サーバーが依存の追加後に React を 2 つ読み込んで真っ白になった → 開発サーバーを起動し直した（コードの問題ではない）。
- **変更したファイル**: `packages/core/src/poker/spot.ts`・`spot.test.ts`、`packages/app/src/answer/**`（新規）、`packages/app/src/screens/{SpotScreen,AnswerScreen}.tsx`（新規）、`packages/app/src/styles/answer.css`（新規）、`packages/app/src/{App,main}.tsx`、`packages/app/src/components/Icons.tsx`、`e2e/**`・`playwright.config.ts`（新規）、`package.json`・`package-lock.json`、`.gitignore`、`.github/workflows/ci.yml`、`CLAUDE.md`、`docs/plan.md`、`docs/BATON.md`、`docs/detailed-spec/11-open-questions.md`
- **残課題**: Q-30 の確認、push・PR（承認待ち）、スマホ実機（M-08 の後）、P7 集計。dev に試験の回答 1 件（「試験 ドライボードでのチェックレイズ頻度」）と Hero の予想 1 件（「試験 画面からの投稿（H-S1 ターン）」）が増えた（`npm run db:seed -- --branch dev` で消える）。`npm audit` の警告 4 件（neonctl の依存。今回の追加とは無関係）。
- **追記（2026-09-28）**: さつきの指示で `phase/06-answer` を push → [satsuki19980613/WWYD#7](https://github.com/satsuki19980613/WWYD/pull/7) を作成。CI（check・db・e2e）緑を確認して main へマージ。db ジョブは N-05 が未設定のため DB テストを実行していない。次の作業ブランチ `phase/07-result` を作成。
- **追記（2026-09-28）**: Q-30 をさつきが推奨案で承認。11 章を「決定」に、06 章 §4.4 の重なったハンドルの書き方を「その方向へ動けるハンドルを掴む」に直した。
- **追記（2026-09-28）**: M-08（Cloudflare Pages、https://wwyd.pages.dev ）と M-09（本番の管理者の登録）をさつきが完了。Claude が公開サイト（深いパスも index.html が返る・本番の Neon の URL が入っている）と app_admins（1 行・利用者に対応）を読み取りで確認。最初は Workers で作られてデプロイの段階で失敗したため、10 章 M-08 に注意を追記。
- **追記（2026-09-28）**: さつきが Neon（production）の trusted domains と Google Cloud の JavaScript 生成元に `https://wwyd.pages.dev` を追加。iPhone 実機の確認はさつきの判断で保留（知り合いに依頼する）。本番の許可リストは無効（allowlist_enabled = false）なので、依頼先は Google のテストユーザーへの追加だけでログインできる。
- **追記（2026-09-28）**: さつきの承認で create-post を本番に配備し直した（版 2、ALLOWED_ORIGINS に https://wwyd.pages.dev を追加、Claude が実行できた）。新旧の混在は約 2 分続き（前回の約 1 分より長い）、その後は wwyd.pages.dev・localhost が 10/10 で許可、ほかのオリジンは 0/10 で拒否されることを確認。

### 2026-09-28（セッション 5・P7）

- **行ったこと**: ブランチ `phase/07-result` で P7（T-701〜T-703）を実装。
  - `packages/app/src/answer/resultModel.ts`（タブ・初期表示・白枠・マスと内訳・空状態・実際のアクション・最後まで再生する各手目）と単体テスト 15 件、`ResultGrid.tsx`（集計のレンジ表。選ぶだけ・矢印キー）、`screens/ResultScreen.tsx`（PC 2 列 / スマホのタブ、内訳、実際のアクション、予想を編集・削除）。
  - `Replay.tsx`: 卓のホールカードを席ごとに渡す形（表向き・裏向き・マック）と終了時の表示に。`useReplay` に最後から始める指定。
  - `detailFixtures.ts` に集計・管理者の指定と集計の組み立て、`e2e/fakeBackend.ts` に投稿の削除と一覧、`e2e/result.spec.ts`（12 件）。
- **確認**: 単体テスト 454 件・型検査・ビルド・E2E 44 件（PC 40・スマホ 4）がすべて緑。dev の実データで、他人の投稿（全体 / 自分 / Hero の予想の空状態・白枠・内訳・最初から再生）と自分の投稿（`?view=host` で Hero の予想のタブ）を表示し、375px でスマホのタブを確認。未回答の投稿の get_post_detail は aggregate・secrets・host_answer が null（DB-12・13 と同じ）。
- **変更したファイル**: `packages/app/src/answer/{resultModel.ts,resultModel.test.ts,ResultGrid.tsx}`（新規）、`packages/app/src/screens/ResultScreen.tsx`（新規）、`packages/app/src/answer/{Replay.tsx,detailFixtures.ts}`、`packages/app/src/screens/{SpotScreen,AnswerScreen}.tsx`、`packages/app/src/styles/answer.css`、`e2e/result.spec.ts`（新規）、`e2e/fakeBackend.ts`、`docs/plan.md`、`docs/BATON.md`
- **残課題**: push・PR（承認待ち）、スマホ実機（保留）、P8。dev の試験データの回答は AA・22 だけのものが多く、濃さの違いは E2E（KK 0.65）で確認した。
- **追記（2026-09-28）**: さつきの指示で `phase/07-result` を push → [satsuki19980613/WWYD#8](https://github.com/satsuki19980613/WWYD/pull/8) を作成。最初の CI で e2e の「既に回答済み（2 回目）」が失敗した（試験が読み込みの完了を待たずに応答を回答済みへ差し替えていたため、最初から集計へ移った。アプリの不具合ではない）。回答画面が出てから差し替えるように直し（20 回続けて緑）、CI（check・db・e2e・Cloudflare Pages）緑を確認して main へマージ。「Workers Builds: wwyd」の失敗は、削除済みの Worker のビルドの設定が Cloudflare に残っているためで、公開サイトとマージには影響しない。次の作業ブランチ `phase/08-account` を作成。

### 2026-09-28（セッション 5・P8 の前半）

- **行ったこと**: ブランチ `phase/08-account` で P8 のうち規約の文面以外を進めた。
  - さつきの指示で、規約の起草を claude.ai の Fable に依頼するためのプロンプトを作成（非営利の前提、リポジトリの読み方、起草前のネットリサーチの項目、出してほしいもの）。
  - T-802: `auth/useAuth.ts` に `deleteAccount`（`delete_my_account` → ログアウト → `/`）、`App.tsx` にアカウントを削除の確認ダイアログ（06 章 §6.1 の文言、赤の「削除する」）。
  - T-803（表示）: `legal/LegalScreen.tsx`・`markdown.ts`（単体テスト 7 件）・`terms.md`・`privacy.md`（題だけの仮）、`styles/screens.css` に規約ページの見た目。
  - E2E: `e2e/account.spec.ts`（6 件）。`fakeBackend.ts` に sign-out・delete_my_account・未ログインの指定。
  - 非営利の前提を CLAUDE.md §1 と決定ログに記録。
- **確認**: 単体テスト 461 件・型検査・ビルド・E2E 50 件が緑。dev でアカウントメニュー → アカウントを削除の確認ダイアログ（「やめる」で閉じた）と `/terms` の表示を確認。dev のさつきは管理者ではないため、管理者の削除は E2E（集計画面）と DB-18 で確認済みとした（画面は投稿者の削除と同じ処理）。
- **変更したファイル**: `CLAUDE.md`、`packages/app/src/{App.tsx,auth/useAuth.ts,styles/screens.css}`、`packages/app/src/legal/**`（新規）、`e2e/{account.spec.ts（新規）,fakeBackend.ts}`、`docs/plan.md`、`docs/BATON.md`
- **残課題**: 規約の文面（Fable）と M-11、T-802 の本番の検証用アカウントでの確認、`screens/ScreenStub.tsx`（使われなくなった）の削除の承認、ⓘ のログインの文言と Q-26 の食い違いの見直し。
- **追記（2026-09-28）**: Fable の文案（利用規約・プライバシーポリシー・起草レポート）を受け取り、コードと DB で突き合わせた。
  - 事実として直した 2 か所: 規約 第3条7項「Hero の予想を削除できる」→ 削除の手段は無い（`save_host_answer` の上書きだけ）ので「書き換えられる」に。プライバシーポリシー 1.6 の IP・UA の【要確認】→ dev と本番の `neon_auth.session` で全行に IP・UA が入っていることを読み取り専用で確認し（件数だけを見た）、「含めます」に。
  - あわせて確認: `neon_auth.account` に Google のアクセストークンと ID トークンが入る（リフレッシュトークンは無い）、スコープは openid・email・profile だけ、`neon_auth."user"` に表示名・メール・画像 URL（本番・dev とも）。Google Fonts の外部読み込み、端末の保存領域を使っていないこと、各表の外部キーのカスケードはコードどおり。
  - レポートの誤り: 「本番のメール＋パスワード登録が有効のまま」→ P3 でさつきがオフにした（決定ログ）。残りは dev だけ。管轄の「千葉」はリポジトリに無い（Fable の例示）。
  - `markdown.ts` に行内のコードと段落内の改行を追加（文案の書き方に合わせた）。
- **追記（2026-09-28）**: さつきと仕様の前提を整理（自由入力はタイトル 40 字だけ、投稿も回答も他の利用者には誰のものか示さない、形式の壊れた投稿はサーバーが拒否する）。これを踏まえた修正依頼で Fable が改訂版（v2）を作成。利用規約は 13 条 → 7 条、禁止事項はタイトルの 3 つと負荷・不正アクセスに絞られた。v2 を `legal/` に入れ、表示を確認。
- **追記（2026-09-28）**: さつきの指示で、利用規約 6 の賠償の上限の一文を削除し、4 を「不適切と判断した投稿（3 に当たるものを含む）を運営者の判断で予告なく削除する」に直した。
- **追記（2026-09-28）**: さつきの指示で、規約の 2 文書のポーカー用語を専門用語にそろえた（注釈なし）。利用規約: 「ハンドの 1 場面（スポット）」→「スポット」、「対局中の使用の禁止」→「RTA の禁止」、「対局後にハンドを振り返る」→「プレイ後のハンドレビュー」。プライバシーポリシー: 「6 席」→「各ポジション」、「アクションの列」→「アクション」、「Hero の席」→「Hero のポジション」、「判明している相手の席とハンド」→「判明している他のプレイヤーのハンド」、「出題するスポットの位置」→「スポット」、「レンジ表に塗った内容と、ベット / レイズのサイズ」→「レンジ表とベットサイズ / レイズサイズ」、「投稿者本人が自分のスポットに入力する」→「Hero が入力する」など。
- **追記（2026-09-28）**: さつきの指示で、プライバシーポリシー 7 を「自分の情報に関する申し出、苦情」にし、「請求」を「申し出」に（損害賠償の請求と紛らわしいため。自分で削除できることを先に書く）。冒頭の「（個人情報取扱事業者）」の表記を削除（法律上の区分で資格ではなく、書かなくても扱いは同じ）。1.1 に本人確認での利用を追記。`phase/08-account` を push し、Cloudflare Pages の確認用サイト（https://phase-08-account.wwyd.pages.dev ）でさつきが内容を確認中。
- **追記（2026-09-28）**: さつきの指示で、利用規約の「行動」を「アクション」に。「2. RTA の禁止」を項目ごと削除し、以降の番号を繰り上げた（6 条に）。仕様書 §8 からの変更として 06 章 §6.2 と決定ログに記録。
- **追記（2026-09-28）**: さつきの指示で「Hero の予想」の表示を「Hero の想定レンジ」に変更（101 か所）。
- **追記（2026-09-28）**: 問い合わせ先に baudouiniv5853@gmail.com を入れた（さつきの指示）。書体を自サイト配信に切り替え、dev で Google への通信が 0 件・使っている書体と太さが読み込まれることを確認。OCR の項は、リリースまでに実装する前提でそのまま残す（さつきの判断）。
- **追記（2026-09-28）**: さつきの指示で、規約の 2 文書の冒頭の「施行日」「運営者」の行を削除。
- **追記（2026-09-28）**: さつきの判断（推奨どおり）で、プライバシーポリシーの「運営者の氏名は申し出があれば回答する」の一文を残し、利用規約の準拠法・管轄の一文を削除（6 条は「規約の変更、連絡先」）。OCR の【要確認】は公開ページに出るため文書から外し、T-1001 の確認項目にした。ⓘ のログインの文言を「投稿や回答と一緒には保存されない」に直した（09 章→コード）。
- **追記（2026-09-28）**: さつきの指示で `phase/08-account` を push → [satsuki19980613/WWYD#9](https://github.com/satsuki19980613/WWYD/pull/9) を作成。CI（check・db・e2e・Cloudflare Pages）緑を確認して main へマージ。本番（https://wwyd.pages.dev/terms ・ /privacy）で文面の表示、【要記入】が無いこと、書体が自サイトから読み込まれ Google への通信が 0 件であることを確認。次の作業ブランチ `phase/09-ocr` を作成。
