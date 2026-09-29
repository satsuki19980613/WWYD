# CLAUDE.md — WWYD（What Would You Do?）

このファイルは、このリポジトリで作業するすべてのセッションが**最初に読む**文書である。

> **2026-09-28: バックエンドを Supabase から Neon に変更した**（詳細仕様 [12 章](docs/detailed-spec/12-neon-migration.md)）。01〜03・08・10 章に残る Supabase 固有の記述より 12 章を優先する。
読んだら次に [docs/plan.md](docs/plan.md) の「現在の状況」を読み、そこから作業を再開する。

---

## 1. プロジェクトの概要

- **アプリ名**: WWYD（What Would You Do?）
- **リポジトリ**: https://github.com/satsuki19980613/WWYD.git（このリポジトリだけを使う）
- **目的**: ポーカー（6max）のハンドの 1 場面（スポット）で「相手ならどんなレンジでどう行動するか」を、
  他のプレイヤーの回答から**集合知**として知るためのウェブアプリ。ソルバーの均衡解ではなく、人の判断の
  ばらつきを見る「アンケート」に近い道具。
- **基本の流れ**:
  1. Hero（投稿者）がハンドヒストリーを登録し、Hero のアクション 1 つと Villain の席 1 つを選んでスポットとして投稿する。
  2. 回答者は Villain の席に座り、スポットまでのリプレイを見て、13×13 のレンジ表に混合戦略（5% 刻み）を塗って回答する。
  3. 回答後、集計レンジ、Villain の実際のアクションとハンド（判明時）、ハンドヒストリー全体を見られる。
  4. Hero（投稿者）も自分のスポットに他の回答者と同じように回答でき（集計に含まれる）、回答後に集計を同じ形式で確認する（2026-09-28 に Hero の想定レンジを廃止）。
- **非営利**: 利用は無料。広告・アフィリエイト・寄付・有料機能・データの販売など、収益を目的とする要素は一切入れない（2026-09-28 さつき）。
- **やらないこと**: 交流機能（チャット・コメント・フォロー等）、RTA、ソルバー / EV / エクイティ計算、画像の保存、ICM。
- **体制**: さつき＝ディレクター兼意思決定者。実装は Claude が担う。**判断が必要な点は推測で進めず、さつきに確認する。**

---

## 2. 資料の階層と役割

上ほど優先。食い違ったら上に従い、食い違いそのものを plan.md の「確認待ち」に記録してさつきに聞く。

| 順位 | 資料 | 役割 | 編集 |
|---|---|---|---|
| 1 | [docs/source/spot-crowd-app-spec.md](docs/source/spot-crowd-app-spec.md) | 仕様書 v0.2。**最上位の正** | **禁止** |
| 2 | [docs/detailed-spec/](docs/detailed-spec/) | 仕様書を実装できる粒度まで具体化した詳細仕様。仕様書の解釈・補完はここに書く | 可（仕様の解釈が変わる変更はさつきの承認後） |
| 3 | [docs/plan.md](docs/plan.md) | 実装計画書＝進捗管理書。現在の状況、タスク、**決定ログ**、セッションログ | 毎セッション更新 |
| 4 | [docs/source/spot-app-prototype.html](docs/source/spot-app-prototype.html) | 操作できるモック。UI と挙動の参考。仕様書と食い違えば仕様書が正（差分は仕様書 9 章） | **禁止** |
| — | [.claude/skills/wwyd-ui-concept/](.claude/skills/wwyd-ui-concept/SKILL.md) | UI コンセプト（ICMCLEC 踏襲）。見た目の正 | さつきの承認後 |
| — | [.claude/skills/frontend-design-principles/](.claude/skills/frontend-design-principles/SKILL.md) | 汎用のデザイン原則（ICMCLEC から原本のまま複製） | 禁止（上流から取り直すときのみ） |

- `docs/source/` の 2 ファイルは編集しない。変更が必要なら詳細仕様側に記録し、さつきに確認する。
- **モックの見た目（配色・フォント・フェルト卓など）は採用しない**。見た目は `wwyd-ui-concept` に従う。モックから採るのは画面構成・操作・挙動。
- 決定ログは plan.md の中にある（別ファイルにしない）。

---

## 3. 技術構成

| 区分 | 内容 | 状態 |
|---|---|---|
| バックエンド | **Neon**（プロジェクト `patient-leaf-06853495`、シンガポール。Postgres 18、Managed Better Auth の Google ログイン、Data API（PostgREST 互換）、RLS、トリガ）。ブランチ: `production`（本番）・`dev`（開発）・`test-base`（DB テストの元。空のまま保つ） | **確定**（2026-09-28。詳細仕様 12 章） |
| サーバー側のポーカーロジック | Neon Functions（Node.js 24 / TypeScript、`packages/functions`）。`packages/core` を相対 import で共有し、esbuild でまとめて配備。JWT は `jose` で Neon Auth の JWKS に対して検証 | **確定**（詳細仕様 12 章 S-4） |
| フロントエンド | React 18 + Vite + TypeScript（ICMCLEC と同じ）。バックエンドとの通信は `packages/app/src/backend/neon.ts`（Neon Auth の REST を直接呼び、Data API は `@supabase/postgrest-js`） | **確定** |
| モノレポ | npm workspaces（`packages/*`） | **確定** |
| テスト | Vitest（TS）、pgTAP（Neon の一時ブランチで実行。`npm run test:db`）、Playwright（E2E） | **確定** |
| 静的ホスティング | Cloudflare Pages（ICMCLEC と同じ） | **確定**（無料枠は 2026-09-27 に再確認済み。詳細仕様 08 章） |
| OCR | 流用元 `tenfour_watcher` を TypeScript に移植、本文認識は tesseract.js を自サイトから配信 | **確定**（詳細仕様 07 章） |
| Node.js | 22（`.node-version`） | **確定** |

「提案・未確定」の項目は、さつきの承認で plan.md の決定ログに記録してから、この表を「確定」に書き換える。

---

## 4. ディレクトリ構成

```
WWYD/
├── CLAUDE.md                     # このファイル
├── .claude/
│   ├── settings.json             # .env 系の読み書き禁止
│   └── skills/
│       ├── frontend-design-principles/   # 汎用デザイン原則（ICMCLEC から複製）
│       └── wwyd-ui-concept/              # WWYD の UI コンセプト（ICMCLEC 踏襲）
├── docs/
│   ├── source/                   # 正となる資料（編集禁止）
│   ├── detailed-spec/            # 詳細仕様
│   └── plan.md                   # 実装計画・進捗・決定ログ・セッションログ
├── packages/
│   ├── core/                     # ポーカーロジック・paint コーデック（純 TS・依存ゼロ・単一実装）
│   ├── app/                      # フロントエンド（React + Vite）
│   └── ocr/                      # 端末内 OCR（純 TS。画像処理と本文の解釈。文字認識は tesseract.js をアプリが渡す）
├── packages/functions/           # Neon Functions（投稿の再生と検証 create-post。P5 で作成）
├── db/
│   ├── migrations/               # DDL・RLS・トリガ・RPC（SQL。scripts/db.mjs で適用）
│   └── tests/                    # pgTAP テスト（03_paint_vectors は生成物）
├── e2e/                          # E2E（Playwright。Neon への通信は fakeBackend.ts の偽の応答）
├── scripts/                      # db.mjs（マイグレーション・DB テスト）、genPaintVectorsSql.mjs、copyOcrAssets.mjs、ocr/（OCR の精度測定・テンプレート生成）
├── sample/                       # OCR の確認用の T4 画像と正解（pc/・sp/。git 管理外。個人の対戦画像）
├── .env.example                  # 環境変数の雛形（実値は .env に。コミットしない）
└── .gitignore
```

---

## 5. よく使うコマンド

| 目的 | コマンド |
|---|---|
| セットアップ | `npm install`。Neon CLI のログイン `npx neonctl auth`（さつき。ブラウザで許可） |
| 開発サーバー | `npm run dev`（http://localhost:5173。`.env.development` で Neon の `dev` ブランチにつなぐ）。部品一覧は `/_dev/ui`、全画面の状態は `?devstate=maintenance` 等（開発時のみ） |
| 手元で本番につなぐ確認 | `npm run dev:prod`（`.env.production` の本番の URL を使う。Google ログインはテストユーザーだけ。本番のデータを書き換えるので確認だけに使う） |
| 単体テスト | `npm test`（Vitest）。カバレッジは `npm run test:coverage`（core の行 90% 以上） |
| 型検査 | `npm run typecheck` |
| ビルド | `npm run build`（出力 `packages/app/dist`） |
| E2E | `npm run e2e`（Playwright。Neon への通信は偽の応答に差し替え、本物にはつながない。初回だけ `npx playwright install chromium`。スマホの試験はテスト名に `@sp`） |
| OCR の精度 | `npm run ocr:accuracy`（`sample/pc`・`sample/sp` の画像を正解 `*.expected.json` と比べる。手元専用。合格はボード 100%・プレイヤー・アクション 95% 以上） |
| OCR のテンプレートを作り直す | `npm run ocr:templates`（`sample/pc` の正解から `packages/ocr/src/rankTemplates.ts` を生成。`-- --check sample/sp` で照合だけ） |
| 本番のビルドを CSP 付きで確かめる | `npm run build` → `npm run preview -w @wwyd/app -- --port 5173`（launch.json の `app-preview`。`public/_headers` と同じヘッダー） |
| DB テスト | `npm run test:db`（空の `test-base` から一時ブランチを作り、全マイグレーション → pgTAP → 同時回答 → 削除。1 時間で自動削除もされる。Docker が必要） |
| 共有テストベクタの pgTAP を生成 | `npm run gen:db-vectors`（CI は `check:db-vectors` で最新かを検査） |
| マイグレーションを dev に適用 | `npm run db:migrate -- --branch dev` |
| dev に試験データを入れ直す | `npm run db:seed -- --branch dev`（`db/seed/dev.sql`。試験用ユーザー 8 人の投稿 40 件と回答、dev の実在ユーザーの「自分の投稿」。題名が「試験」で始まる投稿を消してから作る。dev 以外には実行できない） |
| 試験データ（本番でも使える） | `npm run db:sample -- --branch <ブランチ>`（`db/seed/sample.sql`。試験用ユーザー 8 人の投稿 40 件と、その人たち同士の回答だけ。実在するユーザーには触れない）。回答が 400〜2000 件の投稿 4 件は `npm run db:sample-large -- --branch <ブランチ>`（回答者として試験用ユーザー 2000 人を作る）。消すときは `npm run db:sample-clean -- --branch <ブランチ>`（作成者で選んで消す。どちらの試験データも消える）。本番は**さつきの指示があるときだけ** |
| マイグレーションを本番に適用 | `npm run db:migrate -- --branch production`（**さつきの確認が必要**） |
| Function の配備 | `npx neonctl functions deploy <slug> --project-id patient-leaf-06853495 --branch <ブランチ> --src <入口>`（本番は**さつきの確認が必要**）。配備直後の 1 分ほどは新旧の版が混ざって応答する |

- マイグレーションの新規作成は `db/migrations/` に `YYYYMMDDHHMMSS_<目的>.sql` を置く。適用済みは `migrations.applied` 表に記録される。
- Claude のシェル（Git Bash）で `docker` が見つからないときは `export PATH="$PATH:/c/Users/sa641.SATSUKIPC/AppData/Local/Programs/DockerDesktop/resources/bin"`。
- DB の接続文字列（パスワードを含む）は `npx neonctl connection-string <ブランチ> --role-name neondb_owner` でその場で取り、画面・ログ・ファイルに出さない。

---

## 6. コーディング規約

- TypeScript は `strict: true`。`any` を使わない（やむを得ない場合は理由をコメントに書く）。
- **ポーカーロジックと paint コーデックは `packages/core` に 1 つだけ置く**。純粋関数・依存ゼロ・DOM や DB を触らない。フロントと Neon Function の両方がこれを import する。
- 数値: チップ額は bb 単位。浮動小数の誤差を持ち込まないよう、比較と丸めは `packages/core` の共通関数だけで行う（方式は詳細仕様 04 章）。
- ミックスは 0〜20 の整数（5% 単位）で持つ。UI での % 表示は表示時に変換する。
- SQL: スネークケース、1 マイグレーション 1 目的。既に適用済みのマイグレーションは書き換えない（新しいマイグレーションで直す）。
- テスト: 仕様の判定ごとにテストを書く。バグを直すときは、先に再現テストを書く。
- UI: `wwyd-ui-concept` と `frontend-design-principles`（app.md）を読んでから作る。トークンは ICMCLEC と同名。ネイティブの `<select>` 等は使わない。
- コメント・ドキュメント・コミットメッセージは**日本語**で書く。識別子は英語。
- ファイル名: コンポーネントは `PascalCase.tsx`、それ以外は `camelCase.ts`。

---

## 7. プロダクトの不変条件（破ってはいけないルール）

1. **画面上に説明文を出さない。** 説明・操作方法・記号の意味はすべてヘッダーの ⓘ（インフォメーションモーダル）に集約する。例外は入力欄のプレースホルダー、エラー表示、ログイン画面のサービス説明 1 行（Google の同意画面の要件）のみ。操作を説明するトーストも出さない。
2. **アプリ内のポーカー用語は専門用語で統一し、英単語で表記する**（Hero / Villain / to call / % pot / Fold / Range / Spot / Runout / Muck など。カタカナにしない。説明の文は日本語。用語表は詳細仕様 15 章。2026-09-29 さつき）。
3. **サーバー代ゼロ。** Neon・ホスティングとも無料枠の範囲で設計する。有料プランが必要になる選択はしない（必要ならさつきに確認）。
4. **回答の検証、集計、閲覧制限、カスケード削除、投稿上限はサーバー側で強制する。** クライアントから来た値（派生メタ、answer_count、集計値など）を信用しない。RLS・トリガ・RPC・Neon Function で担保する。
5. **画像を保存しない、外部に送信しない。** OCR は端末内（ブラウザ内）で完結させ、読み取り後ただちに破棄する。
6. **プレイヤー名、Google の表示名とメールアドレスを保存しない。** DB に置くのは UID・ハンドヒストリー（ポジションのみ）・回答だけ。他ユーザーに UID 以外の識別情報を見せない。
7. **ポーカーロジック（仕様書 6 章）は単一の実装を正とし、クライアントとサーバーで食い違わせない。** SQL 等で二重実装しない。
8. **未認証では何も読めない・書けない**（すべての表で RLS を有効にする）。
9. **回答は 1 ユーザー 1 スポット 1 回・送信後は変更不可**（投稿者の自分の投稿への回答も同じ）。
10. **スポットの集計は、回答するまで返さない**（投稿者も自分の投稿に回答してから）。**他人のスポットの Hero のハンド・known_cards も回答するまで返さない**（サーバー側で強制）。

---

## 8. セッションの開始手順

1. この CLAUDE.md を読む。
2. [docs/BATON.md](docs/BATON.md)（前セッションからの引き継ぎ）があれば読む。続けて [docs/plan.md](docs/plan.md) の「現在の状況」と「確認待ち」を読む。確認待ちに回答が来ていれば、決定ログに記録してから進む。
3. `git status` と `git log --oneline -10` で、前回の終わりの状態と plan.md が一致しているか確かめる（食い違えば先に報告する）。
4. 今回やるタスクを plan.md のタスク一覧から選び、状態を「進行中」にする。
5. 着手するタスクに関係する詳細仕様の章を読む。UI を触るなら `wwyd-ui-concept` Skill を使う。

## 9. セッションの終了手順（必ず行う）

1. テストと型検査を通す（通らない場合は、その事実と出力を plan.md とさつきへの報告に書く）。
2. plan.md のタスクの**状態を更新**する。
3. plan.md の「**現在の状況**」欄（フェーズ、直近で完了したこと、次にやること 1〜3 件、ブロッカー、確認待ち）を更新する。
4. plan.md の「**セッションログ**」に追記する（日付、行ったこと、変更したファイル、残課題）。
5. 仕様の解釈・技術選定で決めたことがあれば「**決定ログ**」に追記する。
6. **コミット**する。

---

## 10. 秘密情報の扱い

- DB の接続文字列（パスワードを含む）、Neon の API キー、Google OAuth のクライアントシークレット等は、各サービスの設定と CI の Secrets で管理し、**コミットしない**。Neon Auth の URL と Data API の URL は公開の住所なので `.env.development` に置いてよい（12 章 §7.1）。
- `.env.example` にキー名と説明だけを書いてコミットする。
- `.claude/settings.json` で Claude Code から `.env` / `.env.local` / `.env.*.local` の読み書きを禁止している。値が必要な作業はさつきに依頼する。
- **DB の接続文字列（DB の所有者）はフロントエンドに絶対に含めない**（Neon Functions には Neon が `DATABASE_URL` として自動で入れる）。
- 誤ってコミットした場合は、ただちにさつきに報告し、キーを再発行する。

---

## 11. Git の運用

- 既定ブランチは `main`。作業はフェーズ単位のブランチ（例: `phase/01-foundation`）で行い、フェーズ完了の承認後に `main` へマージする。
- コミットは小さく、こまめに（1 タスク 1 コミット以上）。
- コミットメッセージ: `種別(範囲): 日本語の要約`。種別は `feat` / `fix` / `docs` / `test` / `refactor` / `chore`。本文に理由を書く。
  - 例: `feat(core): 不完全レイズでアクションを再オープンしない`
- `git push` はさつきの確認後に行う（初回 push を含む）。force push はしない。
- `.env` 等の秘密情報、`node_modules`、ビルド成果物はコミットしない（`.gitignore`）。
- コミットの作者アドレスは GitHub の noreply（`221932870+satsuki19980613@users.noreply.github.com`、リポジトリ単位で設定済み）。個人のメールアドレスのコミットは GitHub に拒否される。
- **ICMCLEC（非公開リポジトリ）由来の資料をコミットしない**（`.claude/skills/wwyd-ui-concept/references/icmclec-*` は git 管理外）。

---

## 12. さつきに確認が必要な操作

次は**実行前に必ず**さつきに確認する。承認は操作ごと・その場限り。

- 破壊的な操作: ファイル・ブランチ（git・Neon とも。ただし DB テストの一時ブランチは除く）の削除、`git reset --hard`、force push、本番（`production` ブランチ）へのマイグレーション適用、本番データの削除、Neon の本番の設定変更。
- 外部への公開: `git push`、Neon Functions の配備（dev への試験配備も含め、その都度）、ホスティングへのデプロイ。
- **依存ライブラリの追加**（npm パッケージ、Postgres の拡張）。
- **仕様の解釈が分かれる判断**（plan.md の「確認待ち」に選択肢と推奨を添えて記録する）。
- **有料プランが必要になる選択**、無料枠を超えるおそれのある設計。
- `docs/source/` や Skill の変更が必要になったとき。

---

## 13. ドキュメント

- ドキュメントは**日本語**で書く。
- 実装がモックの挙動と異なる場合は、仕様書に従っていることを確認したうえで、差分を plan.md に記録する。
- 実装中に仕様の不明点が出たら、推測で進めずに plan.md の「確認待ち」に記録してさつきに聞く。
