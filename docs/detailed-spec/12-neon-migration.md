# 12 バックエンドを Supabase から Neon に移す（設計案）

- 版: **確定稿 1.0（2026-09-28）**。§6 の Q-25〜Q-29 はすべて推奨案で決定、§5 のスパイクは iPhone でのログイン（M-08 の後）を除き確認済み。
- きっかけ: Supabase の無料プランは 1 人 2 プロジェクトまでで、さつきの枠は既存の 2 つで埋まっている（どちらも使用中）。
  代替を調べ（plan.md のセッションログ 2026-09-27〜28）、**2026-09-28 にさつきが Neon への変更を決定**した。
- 調べた日: 2026-09-28。無料枠・提供地域・機能は変わることがあるので、確定前にもう一度確かめる。

---

## 1. Neon の無料プランで使うもの

| 用途 | Neon の機能 | 無料プランの範囲 |
|---|---|---|
| データベース | Neon Postgres | プロジェクト 100 個まで、容量 **0.5GB / プロジェクト**、計算 **100 CU 時間 / 月 / プロジェクト**。5 分使わないと停止し、次のアクセスで起動（1 週間の休止は無い） |
| ログイン | Managed Better Auth（Neon Auth）。Google ログインに対応。利用者は同じ DB の `neon_auth` スキーマに保存 | 月 6 万人まで |
| ブラウザからの読み書き | Neon Data API（PostgREST 互換。JWT と RLS で守る） | 無料プランで利用可 |
| 投稿の検証（サーバー側） | Neon Functions（Node.js、TypeScript） | 月 100 万回の呼び出し、10 active / 400 waiting capacity-hours |
| 静的ホスティング | **変更なし**（Cloudflare Pages） | — |

- 計算の上限（100 CU 時間）を使い切ると、翌月まで DB が止まる。最小構成（0.25 CU）なら月約 400 時間動ける。WWYD の想定規模では足りる見込みだが、運用時に使用量を確認する。
- 容量 0.5GB は Supabase の 500MB と同じ。見積もり（01 章 §5）どおり、想定規模で約 1 年半。

## 2. 対応表（Supabase → Neon）

| 項目 | Supabase（これまで） | Neon（案） |
|---|---|---|
| 地域 | 東京 | **シンガポール（aws-ap-southeast-1）**。Neon に東京は無い。Functions が使える地域のうち日本に最も近い |
| 利用者の表 | `auth.users`（uuid） | `neon_auth.user`（id は uuid） |
| 自分の ID | `auth.uid()` | `auth.user_id()`（text）または `auth.uid()`（uuid。Data API の文書で案内あり。スパイクで確認） |
| 未認証のロール | `anon` | `anonymous` |
| 認証済みのロール | `authenticated` | `authenticated`（同じ） |
| クライアント | `@supabase/supabase-js` | `@neondatabase/neon-js`（`from / select / insert / rpc` は同じ書き方） |
| ログイン | `signInWithOAuth({ provider: 'google' })` | `auth.signIn.social({ provider: 'google', callbackURL })` |
| 投稿の検証 | Supabase Edge Functions（Deno） | **Neon Functions（Node.js）**。JWT は `jose` で Neon Auth の JWKS に対して検証 |
| service_role キー | Edge Function に自動で入る | 不要。Functions には `DATABASE_URL` が自動で入る（DB の所有者として `insert_post` を呼ぶ） |
| 休止 | 1 週間アクセスが無いと休止（手動で再開） | 5 分で自動停止・自動起動。**休止対策（Q-12）は不要** |
| ローカル開発 | `supabase start`（Docker） | Neon にはローカル版が無い。**DB のテストは Docker の素の Postgres＋pgTAP**、アプリの動作確認は **Neon の開発用ブランチ**（無料で 10 個まで） |

## 3. 変わらないもの

- `packages/core`（ポーカーロジック・paint・投稿の検証）: そのまま。Neon Functions（Node.js）でも動く（Deno 固有のものを使っていない）。
- 表・インデックス・トリガ・RPC の SQL: ほぼそのまま。変えるのは利用者の表の参照先、`auth.uid()`、ロール名、権限の付け方。
- pgTAP のテスト（DB-01〜19）と共有テストベクタ: 考え方はそのまま。なりすましの方法（JWT の渡し方）だけ Neon に合わせる。
- 画面・ルーティング・デザイン: そのまま。ログインまわりのコード（`packages/app/src/auth/*`）を Neon の SDK に合わせて書き換える。
- 不変条件（CLAUDE.md §7）: すべて維持する。

## 4. 各章への影響

| 章 | 変更 |
|---|---|
| 01 DB スキーマ | `auth.users` → `neon_auth.user`。外部キーの張り方はスパイクで確かめる（張れなければ、アカウント削除の RPC で消す） |
| 02 RLS・トリガ・RPC | `auth.uid()` の置き換え、`anon` → `anonymous`、権限の付け方。`delete_my_account` の中身（Neon Auth の利用者の消し方） |
| 03 サーバー側の再生 | Edge Function → Neon Functions。認証は JWT の検証。`insert_post` の呼び出しは DB 直結 |
| 06 画面 | ログイン・メンテナンス判定のヘルスチェック先 |
| 08 ホスティング | CSP の `connect-src` を Neon の Data API・Auth・Functions の URL に |
| 10 手作業 | Supabase の M-01〜M-03・M-07 を Neon の手順（N-01〜）に置き換え。Google OAuth（M-05・M-06）はリダイレクト URI だけ変わる |
| 11 確認待ち | Q-11（表示名・メールの保持）、Q-12（休止対策）を見直す |
| CLAUDE.md | §3 技術構成、§5 コマンド、§10 秘密情報（service_role の記述） |

## 5. プロジェクト作成後に確かめること（スパイク）

さつきが Neon のプロジェクトを作った後（§7 の N-01）、開発用ブランチで次を確かめてから本実装に入る。

| # | 確かめること | だめだった場合 |
|---|---|---|
| S-1 | Data API で RLS が効き、`auth.uid()`（または `auth.user_id()::uuid`）で自分の ID が取れる | `auth.user_id()::uuid` に置き換える |
| S-2 | 公開テーブルから `neon_auth.user(id)` に外部キー（on delete cascade）を張れる | 外部キーを張らず、`delete_my_account` で自前で消す |
| S-3 | `delete_my_account` から自分の利用者を消せる（`neon_auth.user` の削除、または Better Auth の削除 API） | クライアントから Better Auth の削除 API を呼ぶ形にする |
| S-4 | Neon Functions から `packages/core` を import して配備でき、Neon Auth の JWT を検証できる | Cloudflare Pages Functions で動かす（DB の接続文字列を Cloudflare の秘密情報に置く） |
| S-5 | 関数の実行権限（PUBLIC の既定付与）・`anonymous` ロールの権限が Supabase と同じ考え方で閉じられる | 付与の仕方を変える |
| S-6 | Google ログイン（自前のクライアント ID）でログインし、`whoami` まで動く | — |
| S-7 | ローカルの Docker の Postgres＋pgTAP で、Neon と同じロール・`auth.uid()` を再現して DB-01〜19 が通る | Neon の開発用ブランチに対してテストを流す |

### 5.1 スパイクの途中結果（2026-09-28、開発用ブランチ `dev` = `br-morning-thunder-b3cfadmk`）

| # | 結果 |
|---|---|
| 環境 | PostgreSQL 18.6。スキーマ `auth`（所有者 cloud_admin、拡張 pg_session_jwt 0.5.0）・`neon_auth`・`public`。ロール `authenticated` / `anonymous` / `authenticator`。DB 所有者 `neondb_owner` は `neon_auth` のメンバーで BYPASSRLS。pgTAP 拡張は Neon 上でも使える |
| S-1（一部） | `auth.uid()`（uuid）と `auth.user_id()`（text）がある。`request.jwt.claims` を設定すると `auth.uid()` が値を返す（Supabase と同じなりすましでテストできる）。**ただし `authenticated` には `auth` スキーマの使用権限が無く、所有者からも付与できない。さらに `auth.uid()` は SECURITY DEFINER の関数の中では値を返さない**（「cannot set parameter request.jwt.claims within security-definer function」）。→ **自前の `public.current_uid()`（`request.jwt.claims` の `sub` を読む SQL 関数。Supabase の `auth.uid()` と同じ作り）を使う**。呼び出し元・DEFINER のどちらでも値が取れることを確認。Data API が `request.jwt.claims` を設定することは、実際のログイン（S-6）で確かめる |
| S-2 | `public` の表から `neon_auth."user"(id)` へ `on delete cascade` の外部キーを張れる（トランザクション内で確認し、ロールバック） |
| S-3 | DB 所有者の関数から `neon_auth."user"` の行を消せる（`session`・`account` はカスケードで消える）。確認時の関数は `auth.uid()` を使ったため値が取れず削除されなかった。`current_uid()` に置き換えて本実装で確かめる |
| S-5 | 関数の既定の実行権限は Postgres の既定どおり（PUBLIC）。Supabase と同じく、関数ごとに取り消す方式でよい |
| Data API | トークンの無いリクエストは 400 で拒否（未認証では何も読めない） |
| Auth | `{Auth URL}/ok` が `{"ok":true}` を返す → **メンテナンス判定のヘルスチェックに使う**。dev ブランチでは Neon の共有 Google 認証がすでに有効。信頼するドメインは未設定 |
| 注意 | **両ブランチでメールアドレス＋パスワードの新規登録が有効**（確認メールなしで誰でも登録できる）。WWYD は Google だけにするため、無効にする（本番の設定変更なのでさつきの承認後） |
| 注意 | JWT の有効期限は 15 分で、`email`・`name` の claims を含む（DB には保存しない。`request.jwt.claims` として一時的に見えるだけ）。セッションは Neon Auth のドメインの `SameSite=None` のクッキー → **iPhone の Safari など、他サイトのクッキーを制限するブラウザでログインが保てるか**を S-6 で必ず確かめる |
| S-3（完了） | `delete_my_account`（`neon_auth."user"` の削除）を DB-16 で確認（Neon の一時ブランチ） |
| S-5（完了） | DB-01 で、anonymous・authenticated が実行できる関数が決めたものだけであることを確認 |
| S-7（完了） | **DB テストは Neon の一時ブランチで実行する**（空のブランチ `test-base` から作り、1 時間で自動削除。`npm run test:db`）。pgTAP は `tap` スキーマに入れる（`fail()` の衝突回避）。pgTAP 143 件＋DB-19 が緑 |
| クライアント | 公式 SDK（`@neondatabase/neon-js` 0.7.0-beta / `@neondatabase/auth` 0.5.0-beta）は Next.js を必須の依存に持ち、Vite の workspace ではインストールに失敗した。SDK が内部で行う手順（`POST /sign-in/social` → 戻り先 URL の `neon_auth_session_verifier` → `GET /get-session?neon_auth_session_verifier=…` → `GET /token`）を `packages/app/src/backend/neon.ts` で直接行う。Data API は `@supabase/postgrest-js`（安定版・依存なし）に JWT を付けて使う |
| S-1・S-6（パソコン、完了） | さつきが Chrome（http://localhost:5173）で Google ログイン（dev ブランチ・Neon の共有認証）→ whoami（Data API 経由。`current_uid()` が値を返し allowed = true）→ 一覧まで到達。再読み込み後もログインが保たれた。**注意: verifier は一度しか使えず、React の開発モードは起動処理を 2 回実行するため、2 回目の失敗で未ログインになっていた → 同じ verifier の結果を共有するよう修正** |
| S-6（iPhone） | 未確認。Cloudflare Pages に置いた後（M-08）に確かめる |
| S-4（完了） | `packages/functions` から `neonctl functions deploy --src <入口>` で配備（esbuild が `../../core/src` を取り込む）。Node.js 24 で `packages/core` の投稿検証が手元と同じ結果。`NEON_AUTH_JWKS_URL`・`NEON_AUTH_BASE_URL`・`DATABASE_URL` が自動で入る。`jose` の `jwtVerify`（issuer = Auth URL のオリジン）で、さつきのログインの JWT を検証できた（role = authenticated）。偽のトークンは拒否。**ブラウザから呼ぶには CORS（OPTIONS と応答の Access-Control-Allow-Origin。許可するオリジンは一覧で限定）が必要。配備し直した直後の約 1 分は新旧の版が混ざって応答する**。試作の関数は削除済み。DB への接続（`insert_post` の呼び出し）には Postgres のドライバが要る（T-501 で依存の追加をさつきに確認） |

## 6. 確認待ち（さつきの判断）→ 2026-09-28 すべて推奨案で決定

| # | 内容 | 推奨 |
|---|---|---|
| Q-25 | **地域**: Neon に東京は無い。シンガポールにする（日本からの遅延は Supabase 東京より 60〜80ms ほど増える） | シンガポール |
| Q-26 | **表示名とメールアドレスの置き場所**: Neon Auth は Google の表示名・メールを `neon_auth.user` に保存する。Supabase でも認証基盤（`auth.users`）が保持しており Q-11 で許容したが、Neon では**同じ DB の別スキーマ**になる。アプリの表・画面・Data API からは読めないようにする（`neon_auth` スキーマは Data API に公開しない・権限を与えない） | 許容する（Q-11 と同じ扱い）。プライバシーポリシーに明記 |
| Q-27 | **新しい依存**（注: 2026-09-28 時点で `@neondatabase/neon-js` は `0.7.0-beta` しか無く、`pg`・`prettier` など CLI 向けの依存も引き込む。スパイク S-6 で、安定版の `better-auth` のクライアント＋`@supabase/postgrest-js` の組み合わせ（Neon の移行ガイドの方式）と比べて選ぶ）: `@neondatabase/neon-js`（クライアント。`@supabase/supabase-js` と置き換え）、`jose`（Functions での JWT の検証）、Neon CLI（開発用。Functions の配備）。テスト用の Postgres＋pgTAP の Docker イメージ | 追加する（supabase-js と Supabase CLI は外す） |
| Q-28 | **投稿の検証の置き場所**: Neon Functions（同じ Neon の中・シンガポール）か、Cloudflare Pages Functions（ホスティングと同じ場所。DB の接続文字列を Cloudflare に置く） | Neon Functions（秘密情報を Neon の外に出さない。03 章の方針と同じ） |
| Q-29 | **これまでの Supabase 用の作業の扱い**: ブランチ `phase/03-db-auth` の成果（マイグレーション・pgTAP・ログイン画面）は Neon 向けに書き換えて使う。Supabase のローカル環境・設定（`supabase/config.toml`、`.env.development`）は、置き換えが済んだら削除する | 書き換えて使う |

## 7. さつきの手作業（Neon）

| ID | 内容 | いつ |
|---|---|---|
| N-01 | Neon のアカウント作成とプロジェクト作成（地域はシンガポール）。Project ID を Claude に伝える | **完了（2026-09-28、Project ID `patient-leaf-06853495`）** |
| N-02 | Neon のコンソールで Auth と Data API を有効にする（「Postgres database → Data API」で「Use Managed Better Auth」をオン、「Grant public schema access」は**オフ**＝権限はマイグレーションで必要な分だけ付ける）。Data API URL と Auth URL を Claude に伝える | N-01 の直後 |
| N-03 | Neon CLI のログイン（Claude が配備・マイグレーション適用に使う。実行前に毎回さつきの承認） | スパイクの前 |
| N-04 | Google OAuth のリダイレクト URI を Neon Auth のもの（`{NEON_AUTH_BASE_URL}/callback/google`）にする（M-05・M-06 の手順の差し替え）、Neon の Auth 設定にクライアント ID とシークレットを入れる | S-6 の前 |

手順の詳細は、非エンジニア向けの説明を 10 章に追記する（N-01 から順に）。

## 7.1 プロジェクトの情報（秘密情報ではない）

| 項目 | 値 |
|---|---|
| Project ID | `patient-leaf-06853495`（AWS Asia Pacific 1 (Singapore)） |
| ブランチ | `production`（`br-old-meadow-b3h9xgbz`）＝本番 |
| Data API URL | `https://ep-aged-wave-b3j6dpzy.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1` |
| Auth URL | `https://ep-aged-wave-b3j6dpzy.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth` |

- 上の 2 つの URL は、ブラウザ（アプリ）が使う公開の住所。環境変数 `VITE_NEON_DATA_API_URL` / `VITE_NEON_AUTH_URL` に入れる。
- DB の接続文字列（パスワードを含む）はここに書かない。

## 7.2 ログインを保つ中継（2026-09-29）

さつき「数日使わないと Google にログインし直しになる。接続をある程度保つ仕組みを」。

- **原因**: Neon Auth のセッションのクッキー（`__Secure-neonauth.session_token`。HttpOnly・SameSite=None・Partitioned）は Neon Auth のドメインに付く。
  アプリ（wwyd.pages.dev）から見ると他サイトのクッキーで、Safari（ITP）・ホーム画面のアプリなどは消す・閉じ込める。サーバー側のセッションは 7 日（使うと延びる）で残っていても、ブラウザがクッキーを失うとログインし直しになる。
- **採らなかった方法**: セッションの値を localStorage に置き Bearer で送る（Neon Auth は受け付けない。2026-09-29 に dev で確かめた。同じ試みの事例も同じ結論）。独自ドメインで Neon Auth を同じサイトにする（ドメインの費用がかかる）。
- **方式**（Neon 公式の Next.js 版の `auth.handler()` と同じ考え方）: セッションの確認・JWT・ログアウト・ヘルスチェック（`get-session`・`token`・`sign-out`・`ok`）を
  自サイトの `/api/auth/*` から Neon Auth へ中継し、応答の Set-Cookie を自サイトのクッキーにする（Domain・Partitioned を外し SameSite=Lax。期限・HttpOnly・Secure はそのまま）。
  - 本番: Cloudflare Pages Functions（`functions/api/auth/[[path]].ts`。中継先は上の Auth URL を書く。変えたら `.env.production`・`public/_headers` と合わせて直す。単体テストで `_headers` と照合）。
    Pages Functions は Workers の無料枠（1 日 10 万回）に数える。起動 1 回で 3 回（ok・get-session・token）＋ 15 分ごとの token。静的なファイルは関数を通らない（不変条件 3 の範囲）。
  - 開発・プレビュー: Vite の proxy（`vite.config.ts`。接続先は `VITE_NEON_AUTH_URL`）。E2E は `/api/auth/*` も偽の応答にする。
  - 中身は `packages/app/src/backend/authProxy.ts`（中継する API の許可リスト、Neon Auth のクッキーだけを送る、Set-Cookie の書き換え）。
- **Google へのログインの開始（`sign-in/social`）は Neon Auth に直接**: OAuth の state は、Google から戻る Neon Auth のドメインで確かめるため。戻ったあとの `get-session?neon_auth_session_verifier=…` を中継で呼び、自サイトにセッションのクッキーを受け取る。
- **切り替え時**: 今までのクッキーは Neon Auth のドメインにあり中継からは読めないので、切り替え後に 1 回だけログインし直しになる。
- **期限**: サーバー側のセッションは 7 日で、使うと延びる（Better Auth の既定。1 日に 1 回以上使えば延長）。7 日より長く使わなければログインし直し。

## 8. 参照

- [Neon Pricing](https://neon.com/pricing) / [Neon Regions](https://neon.com/docs/introduction/regions)
- [Neon Data API](https://neon.com/docs/data-api/get-started) / [Managed Better Auth](https://neon.com/docs/auth/overview) / [Set up OAuth](https://neon.com/docs/auth/guides/setup-oauth)
- [Neon Functions](https://neon.com/docs/compute/functions/overview) / [Functions authentication](https://neon.com/docs/compute/functions/authentication)
- [JavaScript SDK（neon-js）](https://neon.com/docs/reference/javascript-sdk)
- [Supabase から Neon への移行ガイド](https://neon.com/guides/complete-supabase-migration)
