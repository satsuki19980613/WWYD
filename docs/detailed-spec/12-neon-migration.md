# 12 バックエンドを Supabase から Neon に移す（設計案）

- 版: 案 0.1（2026-09-28）。**§6 の確認待ちに回答をもらい、§5 のスパイクで確かめてから確定稿にする。**
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

## 6. 確認待ち（さつきの判断）

| # | 内容 | 推奨 |
|---|---|---|
| Q-25 | **地域**: Neon に東京は無い。シンガポールにする（日本からの遅延は Supabase 東京より 60〜80ms ほど増える） | シンガポール |
| Q-26 | **表示名とメールアドレスの置き場所**: Neon Auth は Google の表示名・メールを `neon_auth.user` に保存する。Supabase でも認証基盤（`auth.users`）が保持しており Q-11 で許容したが、Neon では**同じ DB の別スキーマ**になる。アプリの表・画面・Data API からは読めないようにする（`neon_auth` スキーマは Data API に公開しない・権限を与えない） | 許容する（Q-11 と同じ扱い）。プライバシーポリシーに明記 |
| Q-27 | **新しい依存**: `@neondatabase/neon-js`（クライアント。`@supabase/supabase-js` と置き換え）、`jose`（Functions での JWT の検証）、Neon CLI（開発用。Functions の配備）。テスト用の Postgres＋pgTAP の Docker イメージ | 追加する（supabase-js と Supabase CLI は外す） |
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

## 8. 参照

- [Neon Pricing](https://neon.com/pricing) / [Neon Regions](https://neon.com/docs/introduction/regions)
- [Neon Data API](https://neon.com/docs/data-api/get-started) / [Managed Better Auth](https://neon.com/docs/auth/overview) / [Set up OAuth](https://neon.com/docs/auth/guides/setup-oauth)
- [Neon Functions](https://neon.com/docs/compute/functions/overview) / [Functions authentication](https://neon.com/docs/compute/functions/authentication)
- [JavaScript SDK（neon-js）](https://neon.com/docs/reference/javascript-sdk)
- [Supabase から Neon への移行ガイド](https://neon.com/guides/complete-supabase-migration)
