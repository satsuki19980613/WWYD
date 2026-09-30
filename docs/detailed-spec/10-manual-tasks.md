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

## M-08 Cloudflare Pages のプロジェクト作成（Neon 版。2026-09-28 に書き直し）

1. Cloudflare ダッシュボード「Workers & Pages → 作成 → Pages → Git に接続」で `satsuki19980613/WWYD` を選ぶ。本番のブランチは `main`。
   - **注意**: 作成画面の最初の大きなボタンは Workers 用。Workers で作ると「Deploy command（`npx wrangler deploy`）」の欄があり、ビルドは通っても公開で失敗する（2026-09-28 に発生）。Pages の設定画面には Deploy command の欄が無い。
2. ビルドコマンド `npm run build`、出力ディレクトリ `packages/app/dist`、環境変数 `NODE_VERSION` = `22`。
3. アプリが使う住所（Neon Auth・Data API・create-post の URL）はリポジトリの `.env.production` に入っていてビルドが自動で読むので、Cloudflare に秘密の値を入れる必要はない。
4. 発行された URL（`https://<名前>.pages.dev`）を Claude に伝える。その後、次の 2 つを行う:
   - Neon のコンソール（production ブランチ）「Auth」の **trusted domains** にその URL を足す（さつき）。
   - create-post の許可するオリジンにその URL を足して配備し直す（Claude がコマンドを用意し、止められたらさつきが実行）。

実施結果（2026-09-28）: プロジェクト `wwyd`、URL は **https://wwyd.pages.dev** 。フレームワークは None。枝ごとのプレビュー（`<ブランチ>.wwyd.pages.dev`）も本番の Neon を向くが、trusted domains に無いのでログインできない（使わない）。

## M-09 管理者の登録（Neon 版。本番で一度ログインした後）

1. 本番の WWYD に Google で一度ログインする（`npm run dev:prod` でよい）。
2. Neon のコンソールでプロジェクト → ブランチ **production** →「SQL Editor」を開き、次の 1 行の `<自分の Gmail>` を書き換えて実行する（UID を書き写さなくてよい）:
   `insert into public.app_admins (uid) select id from neon_auth."user" where email = '<自分の Gmail>';`
3. 「INSERT 0 1」と出れば完了。Claude に「入れた」と伝える。

## M-10 GitHub への push の承認

初回の `git push`（`main` と作業ブランチ）は Claude が提案し、さつきの承認で実行する。リポジトリは公開（Public）なので、
秘密情報が含まれていないことを push 前に Claude が確認して報告する。

## M-11 利用規約・プライバシーポリシーの承認

Claude が起案した文面（06 章 §6.2）を読み、承認または修正指示を出す。問い合わせ先【Q-19】を決める。

## M-12 運用（Neon 版。2026-09-30 に書き直し。F-021）

SQL はすべて Neon のコンソールの「SQL Editor」で、ブランチを選んでから実行する（本番は **production**。試すときは **dev**）。
SQL Editor は DB の所有者の権限で動くので、書き間違えると本番のデータが変わる。**本番で実行する前に、同じ SQL を dev で一度試す**。

### 1. 毎週の見張り（5 分ほど）

無料枠で先に尽きるのは Neon の計算時間（月 100 CU 時間）と、Cloudflare の Pages Functions（`/api/auth/*`。1 日 10 万回）。

| 見る場所 | 見る値 | 目安と対応 |
|---|---|---|
| Neon のコンソール → プロジェクト `patient-leaf-06853495` の使用量（Usage / Monitoring） | 今月の Compute（CU 時間）と Storage | Compute は「今月の日数 ÷ 30 × 100」を超えるペースなら使いすぎ（例: 15 日目で 50 を超える）→ Claude に相談（許可リストで利用者を絞る、など）。Storage が 0.35GB（70%）を超えたら §3 の整理 |
| Cloudflare のダッシュボード → Workers & Pages → `wwyd` → Functions の要求数 | 1 日の要求数 | 数千を超えていたら、外からの大量のアクセスの疑い（ふつうは 1 回の利用で数回）→ Claude に相談 |

### 2. DB が止まったとき（メンテナンス画面が出る）

- Neon は 5 分使わないと自動で止まり、次のアクセスで自動で起動する（操作は要らない。1 週間の休止も無い。T-1003 の休止対策は不要）。
- 月の計算時間（100 CU 時間）を使い切ると、翌月まで DB が止まる。そのときは翌月を待つか、Claude に相談する（有料プランには上げない。不変条件 3）。

### 3. 容量の整理（回答の無い古い投稿を消す。02 章 §4.7）

管理者（M-09 で登録した自分）として実行する。`90 days` を消したい古さに変える。投稿者本人の回答だけの投稿も「回答なし」として消える。

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select uid from public.app_admins limit 1))::text, true);
select public.admin_delete_unanswered_posts(now() - interval '90 days');  -- 消した件数が出る
commit;
```

### 4. 利用者を絞る（荒らし・無料枠の逼迫）

```sql
-- 許可する人を登録する（相手に一度ログインしてもらってから。メールアドレスで選ぶ）
insert into public.app_allowlist (uid) select id from neon_auth."user" where email = '<相手の Gmail>';
-- 許可リストを有効にする（管理者と許可リストの人だけが使える。ほかの人は「このアカウントは利用できません」の画面）
update public.app_settings set allowlist_enabled = true;
-- 元に戻す
update public.app_settings set allowlist_enabled = false;
```

### 5. 管理者が投稿を消す

画面から: 管理者でログインすると、一覧のすべての投稿にごみ箱が出る（06 章 §2）。

### 6. dev で一度試す（さつき。15 分ほど。F-06）

1. §1 の 2 つの画面を開き、値の場所を確かめる。
2. SQL Editor でブランチ **dev** を選び、§3 の SQL を `interval '3650 days'`（10 年前より古い投稿 = 0 件）で実行し、`0` が出ることを確かめる。
3. §4 の `allowlist_enabled = true` を dev で実行 → 手元（`npm run dev`）で自分（管理者）は使え続けることを確かめる → `false` に戻す。

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

実施時の注意（2026-09-28、production で実施）:
- Google Cloud のプロジェクトは `wwyd`、クライアント名は `wwyd-neon`。同意画面の承認済みドメインに `neon.tech`。
- 同意画面の「アプリを公開」は、ブランディングのホームページ・プライバシーポリシーの URL が無いと押せない。公開は M-05b（Cloudflare Pages の後）に回し、それまでは「テスト中」のまま「対象 → テストユーザー」にログインする人を登録する。
- Neon の Google の行（Shared keys）の「⋮」から開く画面に入力欄が出ないときは、Google を一度外して「Add OAuth provider → Google」で追加し直すと、クライアント ID とシークレットの欄が出る。
- 同じ画面の「Sign-up with Email」がオンになっていないか確かめる（オンならオフにする）。
- 設定はブランチごと。dev は共用の鍵のままでよい。

## N-05 CI 用の Neon の API キー（GitHub の Secrets）

CI（GitHub Actions）で DB テストを動かすために、Neon の API キーを GitHub に預ける。キーは秘密情報なので、Claude には渡さず、さつきが直接 GitHub に入れる。

1. Neon のコンソールで、組織（Organization）の設定 →「**API keys**」→「**Create new API key**」。種類を選べる場合は **Project-scoped（プロジェクト `wwyd` だけ）** を選ぶ。名前は `wwyd-ci`。
2. 表示されたキーをコピーする（一度しか表示されない）。
3. GitHub のリポジトリ `satsuki19980613/WWYD` →「**Settings**」→「**Secrets and variables**」→「**Actions**」→「**New repository secret**」。
4. Name に `NEON_API_KEY`、Secret にコピーしたキーを貼って「Add secret」。
5. 終わったら Claude に「入れた」とだけ伝える（キーは伝えない）。
