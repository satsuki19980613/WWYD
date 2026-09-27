# 10 さつきが手作業で行う作業

> **2026-09-28 追記**: バックエンドを Supabase から Neon に変える（12 章）。Supabase の M-01〜M-03・M-07 は使わず、下の **N-01〜N-04** に置き換える。
> Google OAuth（M-05・M-06）はリダイレクト URI だけ変わる（N-04）。

アカウント・秘密情報・課金設定・外部への公開にかかわる作業は、Claude が代行しない（CLAUDE.md §10, §12）。
ここに手順をまとめ、plan.md のタスク一覧に担当「さつき」として載せる。

> 画面の文言やメニューの位置は各サービスの更新で変わることがある。見つからない場合は Claude に画面の様子を伝えてもらえれば、手順を合わせる。

---

## M-01 Supabase プロジェクトの作成

前提: Supabase の無料プランは、組織あたりアクティブなプロジェクト数に上限（2 つ）がある。ICMCLEC で 1 つ使っているなら、もう 1 つ作れる。

1. https://supabase.com/dashboard にログインし、「New project」。
2. 組織: ICMCLEC と同じ（Free プラン）。名前: `wwyd`。リージョン: **Northeast Asia (Tokyo)**。
3. データベースのパスワードを生成して、パスワードマネージャに保存（Claude には渡さない）。
4. 作成後、「Project Settings → API」で次を控える:
   - Project URL（`https://<ref>.supabase.co`）→ `.env` の `VITE_SUPABASE_URL`
   - `anon` / public キー → `.env` の `VITE_SUPABASE_ANON_KEY`
   - `service_role` キー → **どこにも書かない**（Edge Functions には自動で入る）
5. Project ref（URL の `<ref>` 部分）を Claude に伝える（秘密情報ではない）。

## M-02 ローカル開発環境の `.env`

1. リポジトリ直下で `.env.example` を `.env` に複製。
2. M-01 の URL と anon キーを入れる。
3. `.env` はコミットされない（`.gitignore` 済み）。Claude は `.env` を読めない設定になっている。
4. 補足: `npm run dev` はリポジトリ直下の `.env.development`（ローカルの Supabase につなぐ値。コミット済み）を `.env` より優先する。`.env` の値が使われるのは `npm run build` / `npm run preview` のとき。開発サーバーで本番 DB につなぎたいときは `.env.development.local` に本番の値を書く（コミットされない）。

## M-03 Supabase CLI のログインとリンク

1. Supabase のダッシュボード「Account → Access Tokens」でトークンを作成。
2. ターミナルで `npx supabase login`（トークンを貼る）。
3. `npx supabase link --project-ref <ref>`（DB パスワードを聞かれたら M-01 のもの）。

以後、本番 DB へのマイグレーション適用（`npx supabase db push`）と Edge Function の配備は、Claude が提案し、さつきの承認を得てから実行する。

## M-04 Docker Desktop のインストール（ローカル DB 用）

ローカルの Supabase（`npx supabase start`）と DB テスト（pgTAP）に必要。https://www.docker.com/products/docker-desktop/ からインストールし、起動しておく。
（入れない場合、DB のテストは本番とは別の Supabase プロジェクトで行うことになり、無料枠の上限に当たる。）

## M-05 Google Cloud: OAuth 同意画面

1. https://console.cloud.google.com/ で新しいプロジェクト `wwyd` を作成。
2. 「API とサービス → OAuth 同意画面」（Google Auth Platform の「ブランディング」「対象」「データアクセス」）。
3. ユーザーの種類: **外部**。
4. アプリ名: `WWYD`、ユーザーサポートメール、デベロッパーの連絡先: さつきのメールアドレス。
5. アプリのホームページ・プライバシーポリシー・利用規約の URL: M-08 のデプロイ後に入れる（`https://<ドメイン>/`、`/privacy`、`/terms`）。
6. 承認済みドメイン: 本番ドメインと `supabase.co`。
7. スコープ: `openid`、`.../auth/userinfo.email`、`.../auth/userinfo.profile` の 3 つだけ。
8. 公開ステータス: **「アプリを公開」で本番**にする（基本スコープのみなら審査不要。§3）。ロゴを出したい場合のみブランド確認を申請（任意）。

## M-06 Google Cloud: OAuth クライアント ID

1. 「API とサービス → 認証情報 → 認証情報を作成 → OAuth クライアント ID」。
2. 種類: **ウェブ アプリケーション**、名前: `wwyd-supabase`。
3. 承認済みの JavaScript 生成元: `http://localhost:5173`、本番の URL（M-08 後に追加）。
4. 承認済みのリダイレクト URI: `https://<ref>.supabase.co/auth/v1/callback`。
5. 作成されたクライアント ID とクライアント シークレットを M-07 で使う（シークレットはリポジトリに書かない）。

## M-07 Supabase: Google プロバイダの有効化と URL 設定

1. Supabase ダッシュボード「Authentication → Sign In / Providers → Google」を有効化し、M-06 のクライアント ID とシークレットを入れる。
2. 「Authentication → URL Configuration」:
   - Site URL: 本番の URL（M-08 前は `http://localhost:5173`）
   - Redirect URLs: `http://localhost:5173/**`、本番の URL `/**`、Cloudflare Pages のプレビュー URL（`https://*.<project>.pages.dev/**`）
3. メール・パスワード等、Google 以外のプロバイダは無効のままにする。

## M-08 Cloudflare Pages のプロジェクト作成（基盤フェーズの終わり）

1. Cloudflare ダッシュボード「Workers & Pages → 作成 → Pages → Git に接続」で `satsuki19980613/WWYD` を選ぶ。
2. ビルドコマンド `npm run build`、出力ディレクトリ `packages/app/dist`、Node のバージョン 22（環境変数 `NODE_VERSION=22`）。
3. 環境変数: `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（本番とプレビューの両方）。
4. 発行された URL（`https://<project>.pages.dev`、独自ドメインを使うならその URL）を Claude に伝え、M-05・M-06・M-07 の URL 欄に追加する。

## M-09 管理者 UID の登録（初回ログイン後）

1. 本番の WWYD に Google でログインする。
2. Supabase ダッシュボード「Authentication → Users」で自分の User UID を確認。
3. 「SQL Editor」で実行: `insert into public.app_admins (uid) values ('<自分の UID>');`

## M-10 GitHub への push の承認

初回の `git push`（`main` と作業ブランチ）は Claude が提案し、さつきの承認で実行する。リポジトリは公開（Public）なので、
秘密情報が含まれていないことを push 前に Claude が確認して報告する。

## M-11 利用規約・プライバシーポリシーの承認

Claude が起案した文面（06 章 §6.2）を読み、承認または修正指示を出す。問い合わせ先【Q-19】を決める。

## M-12 運用: 休止からの再開・容量の整理

- Supabase が休止したら（メンテナンス画面が出たら）: ダッシュボードでプロジェクトを開き「Restore / Resume」。【Q-12】で自動の防止策を採る場合は不要になる。
- 容量が 70% に達したら（ダッシュボード「Reports → Database」で確認）: SQL エディタで `select public.admin_delete_unanswered_posts('<基準日時>');` を実行（02 章 §4.7）。
- 荒らし・無料枠の逼迫で利用者を限定するとき: `insert into public.app_allowlist (uid) values (...)` で許可するユーザーを登録してから、`update public.app_settings set allowlist_enabled = true;`。

## M-13 OCR の流用元の確認と正解データの扱い

【Q-17】の回答。流用元のリポジトリとパス、正解画像を公開リポジトリに置いてよいか。

---

## N-01 Neon のアカウントとプロジェクトの作成（Supabase の M-01 の代わり）

Neon は WWYD のデータとログインを預かる「倉庫」。無料で使う（クレジットカードの登録は要らない）。

1. https://neon.com を開き、右上の「**Sign up**」。Google アカウントか GitHub アカウントで登録できる。
2. 登録後の画面、または「**New project**」でプロジェクトを作る。

| 項目 | 入れるもの |
|---|---|
| Project name | `wwyd` |
| Cloud provider | **AWS** |
| Region | **AWS Asia Pacific (Singapore)** |
| Postgres version | 最初に選ばれているまま |
| その他（Neon Auth などの項目が出たら） | 分からなければ最初のまま。後で Claude が案内する |

3. 作成後、プロジェクトの「**Settings**」を開き、**Project ID**（`例: cool-river-12345678` のような文字列）を Claude に伝える。
4. 接続文字列（`postgresql://…` で始まり、パスワードを含むもの）が表示されても、**Claude には渡さない**（パスワードが含まれる）。

教えてよいもの・いけないもの:

| もの | Claude に教えてよいか |
|---|---|
| Project ID | ✅ |
| Data API の URL・Auth の URL（`https://…neon.tech/…` でパスワードを含まないもの） | ✅ |
| 接続文字列（`postgresql://ユーザー:パスワード@…`） | ❌ |
| API キー（Neon CLI 用） | ❌ |

## N-02 Auth と Data API の有効化

N-01 の後、Claude が画面に沿って案内する（コンソールの「Auth」「Data API」の画面で有効にする）。

## N-03 Neon CLI のログイン

Claude がマイグレーションの適用と Functions の配備に使う。ターミナルで `npx neonctl auth` を実行し、開いたブラウザで許可する。
以後、本番のブランチへの適用・配備は、Claude が提案してさつきの承認を得てから行う。

## N-04 Google ログインを Neon につなぐ（M-05・M-06 の差し替え部分）

- M-06 の「承認済みのリダイレクト URI」は、Supabase の URL ではなく **Neon Auth の URL ＋ `/callback/google`**（Neon のコンソールの Auth 画面に出る）。
- 承認済みの JavaScript 生成元に、アプリの URL（`http://localhost:5173` と本番の URL）と Neon Auth の URL を入れる。
- Neon のコンソール「Settings → Auth → OAuth providers → Add OAuth provider」に、クライアント ID とシークレットを入れる。
- 同じ画面の「trusted domains」に、アプリの URL（`http://localhost:5173` と本番の URL）を入れる。
