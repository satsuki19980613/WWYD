# バトン: P1 基盤の着手

**作成 2026-09-27 / セッション 1（Opus 5.5）から次セッションへの引き継ぎ**
**発注者: さつき（ディレクター兼意思決定者。日本語で対応。実装はすべて Claude に任されている）**

---

## 0. 結論から言うと、次のセッションでやること

> **P1 基盤（[plan.md](plan.md) の T-101〜T-106）を実装し、フェーズの完了条件を確認して報告し、止まる。**
> P1 の完了条件: `npm run typecheck` / `npm test` / `npm run build` が CI で緑。外枠（ヘッダー・ⓘ・ルーティング・
> メンテナンス画面）がローカルで表示され、`wwyd-ui-concept` の自己レビュー（swap / squint / signature / token）に合格。

着手順の目安:

1. **T-101** npm workspaces の雛形（`packages/core`、`packages/app`）、TypeScript strict、Vitest。依存は承認済み（下記 §2）。
2. **T-102** GitHub Actions（typecheck・test・build）。
3. **T-104** デザイントークンと基本部品 → **T-105** アプリの外枠（ⓘ の文言は [09-info-modal.md](detailed-spec/09-info-modal.md)）。
4. **T-106** Cloudflare Pages の無料枠を公式ページで再確認し、決定ログに確認日を記録。
5. **T-103**（Edge Function から `packages/core` を import できるかのスパイク）。Docker Desktop は導入済み（M-04 完了）。

**P1 の終わりで必ず止まり、完了条件の確認結果を報告して、さつきの承認を得てから P2 へ進む**（依頼の STEP 4 の規則）。

---

## 1. 前提（読み飛ばさないこと）

- 最初に [CLAUDE.md](../CLAUDE.md) → [plan.md](plan.md) の「現在の状況」を読む（CLAUDE.md §8 の開始手順）。
- 正となる資料: [仕様書 v0.2](source/spot-crowd-app-spec.md)（最上位・編集禁止）→ [詳細仕様 d1.0](detailed-spec/00-index.md) → plan.md → [モック](source/spot-app-prototype.html)（編集禁止・画面構成と操作の参考のみ）。
- UI は **ICMCLEC の UI コンセプトを完全に踏襲**（`.claude/skills/wwyd-ui-concept/`、`.claude/skills/frontend-design-principles/`）。**UI を作る前に必ず両 Skill を読む**。モックの見た目（ライトテーマ・緑のフェルト・橙）は使わない。

## 2. 確定済みの決定（再確認不要）

詳細仕様 [11-open-questions.md](detailed-spec/11-open-questions.md) の **Q-1〜Q-23 はすべて推奨案で決定済み**（2026-09-27、plan.md の決定ログ）。P1 に効くもの:

| 項目 | 決定 |
|---|---|
| 技術構成 | React 18 + Vite + TypeScript、npm workspaces、Vitest、@supabase/supabase-js、Supabase CLI（開発用）、Playwright（E2E）。ルーティングとスキーマ検証は自前（依存を増やさない）。Node 22 |
| テーマ | **ダーク固定**（仕様書 §4.1 の両対応から変更済み） |
| アクション色 | fold = `--red`、check / call = `--cyan`、bet / raise（s1）= `--yellow`＋細いハザードストライプ、レンジ外 = `--cell-off` |
| ルーティング | History API（`/`、`/new`、`/s/:id`、`/s/:id/answer`、`/s/:id/result`、`/terms`、`/privacy`）。ハッシュではない |
| ホスティング | Cloudflare Pages（SPA フォールバック、`_headers` で CSP） |
| サーバー側の再生 | Supabase Edge Functions で `packages/core` を共有（ポーカーロジックは単一実装） |
| 金額 | 内部は mbb（1bb = 1000）の整数。% pot の結果は 0.01bb に四捨五入 |

上記以外の依存を追加するときは、さつきの承認が要る（CLAUDE.md §12）。

## 3. 前セッションで分かった注意点

| 事柄 | 内容 |
|---|---|
| **ICMCLEC の資料は公開しない** | ICMCLEC（GitHub: `pocket-ICM`）は**非公開**。`.claude/skills/wwyd-ui-concept/references/icmclec-*`（本番モックとトークンの写し）は git 管理外（`.gitignore` 済み）で、ローカルにだけある。**絶対にコミットしない**。トークンは WWYD の CSS に取り込んでよい（UI 踏襲の指示どおり）が、モックの HTML はそのまま載せない |
| コミットの作者アドレス | GitHub のメール非公開設定のため、個人のメールアドレスのコミットは push が拒否される。このリポジトリには `user.email = 221932870+satsuki19980613@users.noreply.github.com` を設定済み（リポジトリ単位） |
| ブランチ | このバトンは `phase/01-foundation` ブランチにある（未 push）。P1 の作業はこのブランチで続ける。main へのマージは P1 の承認後に PR 経由（前回は [satsuki19980613/WWYD#1](https://github.com/satsuki19980613/WWYD/pull/1)） |
| push | `git push` は毎回さつきの確認を取る（CLAUDE.md §11–12）。push 前に秘密情報のスキャンをする |
| 履歴の書き換え | `git filter-branch` 等は権限で止められる。必要なら理由を説明してさつきに許可を求める |
| `.env` | Claude Code から読み書き禁止の設定（`.claude/settings.json`）。値が必要な作業はさつきに依頼 |
| 改行 | `.gitattributes` で LF に統一済み。Windows の作業フォルダは OneDrive 配下で、パスに日本語を含む（`ドキュメント\一時ツール\WWYD`） |
| Docker | 導入済み（2026-09-27）。**ユーザー単位のインストール**で本体は `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`（`Program Files` ではない）。アプリが起動していないと `docker` は `failed to connect to the docker API at npipe:////./pipe/docker_engine` になる → Docker Desktop を起動して「Engine running」を待つ。Claude のシェルは起動が古いと PATH に `docker` が無いことがある |
| Supabase CLI | 未導入（`npx supabase` は初回にパッケージ取得が必要。devDependency として入れる） |
| モックの版 | 受領したモックは v0.1 の挙動（仕様書 §9.2 の差分あり）。仕様書が正 |

## 4. さつきの手作業（担当: さつき。進み具合は plan.md のタスク一覧）

- ~~M-04 Docker Desktop のインストール~~（2026-09-27 完了）
- M-01〜M-03 Supabase プロジェクト作成・`.env`・CLI リンク（P3 の前まで）
- M-05〜M-07 Google OAuth の設定（P3）、M-08 Cloudflare Pages（P5 まで）

手順は [10-manual-tasks.md](detailed-spec/10-manual-tasks.md)。

## 5. 関連ファイル

| ファイル | 役割 |
|---|---|
| [CLAUDE.md](../CLAUDE.md) | 全セッションの最初に読む。不変条件（§7）、開始・終了手順（§8–9）、確認が必要な操作（§12） |
| [plan.md](plan.md) | 現在の状況、タスク一覧、決定ログ、セッションログ |
| [detailed-spec/04-poker-logic.md](detailed-spec/04-poker-logic.md) | P2 で実装するロジックとテストケース表（P1 では `packages/core` の置き場所だけ作る） |
| [detailed-spec/06-screens.md](detailed-spec/06-screens.md) | §0（共通・アプリ全体の状態）と §8（デザインの適用）が P1 の対象 |
| [detailed-spec/08-hosting.md](detailed-spec/08-hosting.md) | CSP の案、Pages の構成 |
| `.claude/skills/wwyd-ui-concept/SKILL.md` | トークン名・配色の意味・シグネチャー要素・自己レビュー |
| ICMCLEC `packages/app/src/styles.css`、`components/GlassTable.tsx` | 見た目の実物（読むだけ。コードのコピーは要素単位で必要な分だけ） |

## 6. セッションの終わりに

CLAUDE.md §9 のとおり: タスクの状態更新 → plan.md の「現在の状況」更新 → セッションログ追記 → 決定ログ追記（あれば）→ コミット。
P1 が終わったら、このバトンを次のフェーズ用に書き換える（または「完了」と明記する）。
