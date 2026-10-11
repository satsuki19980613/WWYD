# WWYD（What Would You Do?）

[![CI](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml/badge.svg)](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml)
[![Live](https://github.com/satsuki19980613/WWYD/actions/workflows/live.yml/badge.svg)](https://github.com/satsuki19980613/WWYD/actions/workflows/live.yml)
[![CodeQL](https://github.com/satsuki19980613/WWYD/actions/workflows/codeql.yml/badge.svg)](https://github.com/satsuki19980613/WWYD/actions/workflows/codeql.yml)
[![Secrets](https://github.com/satsuki19980613/WWYD/actions/workflows/secrets.yml/badge.svg)](https://github.com/satsuki19980613/WWYD/actions/workflows/secrets.yml)

ポーカーの Hero の手番（Spot）について、他のプレイヤーならどの Range でどう打つかを回答から集計する Web アプリ。ソルバーの解ではなく、人の判断のばらつきを可視化するアンケートに近いツールである。

2〜6 人の No-Limit Hold'em（Cash・MTT）に対応する。利用は無料で、広告・課金・寄付など収益を目的とする要素は無い。

**公開サイト**：https://wwyd.pages.dev/

## 機能

- **投稿** — Hand History を入力し（スクリーンショットからの読み取りにも対応）、Flop 以降の Hero の手番を 1 つ選んで Spot として投稿する。
- **回答** — Hero の席から Spot までのリプレイを確認し（Hero のハンドは非表示）、13×13 の Range 表に混合戦略（5% 刻み）を塗って回答する。
- **答え合わせ** — 回答後、全回答の集計 Range、Hero の実際のアクションとハンド、Hand History の続きを閲覧できる。

## セキュリティとプライバシー

### 要約

- **メールアドレス・氏名・プロフィール画像・IP アドレスを保存しない。** 運営者も閲覧できない。
- **投稿や回答の主は、他の利用者には分からない。** 投稿者の ID も読めないようにしている。
- **回答するまで、集計と Hero のハンドを返さない。** 画面上で隠すのではなく、サーバーが返さない設計である。
- **Hand History の画像は端末の外に出ない。** 読み取りは端末内で行い、画像は送信も保存もしない。
- **広告・アクセス解析は無い。** 自サイトとデータベース（Neon）以外へは通信しない設定である。
- **以上の内容は自動検証で継続的に確認している。** 結果は上部のバッジで公開している。

**制約**：運営者は、どの投稿・回答が同一利用者のものか（ランダムな識別子同士の対応）を閲覧できる。識別子が誰に対応するか（メールアドレスや氏名）は分からない。

### 取り扱う情報

| 情報 | サーバーへの保存 | 運営者による閲覧 | 他の利用者への表示 |
|---|---|---|---|
| メールアドレス | **保存しない**（実在しない宛先 `<ランダムな ID>@wwyd.invalid` に置換） | 不可 | 不可 |
| Google の表示名（氏名） | **保存しない**（全員 `Player` に置換） | 不可 | 不可 |
| プロフィール画像 | **保存しない** | 不可 | 不可 |
| IP アドレス・ブラウザの種類 | **保存しない** | 不可 | 不可 |
| Google のトークン（メールアドレスを含む） | **保存しない** | 不可 | 不可 |
| Google のアカウント識別子 | 保存（再ログイン時の本人識別のため） | 可 | 不可 |
| ログイン記録（日時） | 保存（セッション維持のため） | 可 | 不可 |
| 利用者 ID（ランダムな識別子） | 保存（投稿・回答の所有者の識別のため） | 可 | 不可 |
| 投稿（Hand History・題名・Villain の Read・MTT の情報） | 保存（投稿者か運営者が削除するまで。席はポジションのみで、プレイヤー名は含まない） | 可 | ログインした利用者に表示（投稿者は非表示） |
| 投稿の Hero のハンド、Spot より後のアクションとボード | 保存 | 可 | 回答した利用者にのみ表示 |
| 回答（塗った Range とサイズ） | 保存（投稿の削除かアカウント削除まで） | 可（どの識別子の回答かは分かる） | 個別の回答は非表示。全回答の集計のみ、回答した利用者に表示 |
| Hand History の画像・画像内のプレイヤー名 | **保存・送信しない**（端末内で読み取って破棄） | 不可 | 不可 |
| 投稿の下書き・Read の Preset | **保存しない**（端末内のみ） | 不可 | 不可 |

外部サービスに送信される情報：

- **Google** — ログイン時。
- **Cloudflare**（サイト配信・認証の中継）・**Neon**（データベース・認証基盤・投稿の検証） — 通信を中継するため、接続情報（IP アドレスなど）が送信される。
- フォントと文字認識の部品（tesseract.js と学習データ）は自サイトから配信しており、ページを開くだけで他のサービスに通信することはない。

### 保証範囲と制約

保証する事項：

- メールアドレス・氏名・画像・IP アドレスを運営者に知られない。
- どの投稿・回答が自分のものかを、他の利用者に知られない。
- 回答前に、集計・Hero のハンド・Spot より後の展開を閲覧できない（投稿者も、自分で回答するまで集計は見られない）。
- 集計を改ざんされない。回答の形式の検証と集計はサーバーが行い、回答は 1 人 1 回・送信後の変更不可である。
- Hand History の画像を、運営者を含め誰にも見られない。
- 未ログインの利用者は、何も読み書きできない。
- アカウントメニューの「アカウントを削除」で、自分の投稿・回答・アカウント情報をすべて削除できる。
- 1 人による大量投稿で一覧が埋まることを防ぐ（1 人あたり 1 日の投稿数に上限がある。初期値は 5 件）。

制約：

- **運営者は、どの投稿・回答が同一利用者のものかを閲覧できる。** データベースの所有者として読める（識別子同士の対応であり、個人は特定できない）。また、任意の投稿を削除できる。
- **Google アカウントがあれば誰でもログインでき、ログインした利用者は全投稿を閲覧できる。** プレイヤー名は保存しないが、Hand の内容から場面を知る人に推測される可能性はある。題名は自由記述のため、個人を特定できる内容は書かないこと。
- **1 人 1 回の制限は Google アカウント単位である。** アカウントを大量に用意する攻撃者は、集計を偏らせることができる。
- **レート制限は投稿数のみである。** 閲覧・回答の回数には、アプリとしての制限を設けていない。
- **外部サービス（Google・Cloudflare・Neon）における取り扱いは、各社の規約に従う。**
- **第三者による監査は受けていない。** 個人による運営であり、検証は下記の自動検証と、公開前に実施した AI による点検（[docs/release-test/report.md](docs/release-test/report.md)）に限られる。

### 脅威モデルと対策

想定する脅威は、回答前に答えを見ようとする利用者、投稿者の特定を試みる利用者、集計の改ざんを試みる利用者、個人情報を過剰に保持してしまう運営者自身、および一般的な Web 攻撃である。ブラウザから送られる値は信頼しない。投稿の検証・回答の検証・集計・閲覧権限の判定はサーバーが行う。

| 対策目標 | 実装 | 根拠 |
|---|---|---|
| 個人情報を保持しない | 認証基盤（Neon Auth）が書き込むテーブルで、データベースのトリガーが書き込みの直前に値を置換する。認証基盤がどの経路で書き込んでも、置換前の値は保存されない | [20261011000000_auth_scrub.sql](db/migrations/20261011000000_auth_scrub.sql)。テスト [09_auth_scrub.test.sql](db/tests/09_auth_scrub.test.sql)。本番の残存を毎週検査する [scripts/db.mjs](scripts/db.mjs)（`auth-audit`） |
| 未ログインの利用者への非公開 | 全テーブルで RLS を有効にし、ログインした利用者にも必要なテーブル・列・行だけを許可する。認証基盤のテーブル（メールアドレスなど）は、ブラウザが使うロールから読めない | [20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)。テスト [01_access.test.sql](db/tests/01_access.test.sql)・[90_release_c01_enforce.test.sql](db/tests/90_release_c01_enforce.test.sql) |
| 投稿者の匿名性 | 投稿テーブルの投稿者 ID 列を読めなくし、「自分の投稿か」「削除できるか」だけをサーバーが返す。回答テーブルは本人の行しか読めない | [20260930000001_hide_author_uid.sql](db/migrations/20260930000001_hide_author_uid.sql)・[20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)（`answers_select`）。テスト [90_release_c01_enforce.test.sql](db/tests/90_release_c01_enforce.test.sql) |
| 回答前の答えの秘匿 | Hero のハンドのテーブルは投稿者本人と回答者に、集計のテーブルは回答者にだけ行を返す。Spot の詳細を返す関数も、未回答なら Hero のハンドと Spot より後のアクション・ボードを伏せる | [20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)（`post_secrets_select`）・[20260928000000_author_answers.sql](db/migrations/20260928000000_author_answers.sql)（`can_view_aggregate`）・[20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`get_post_detail`）。テスト [05_detail.test.sql](db/tests/05_detail.test.sql) |
| 集計の改ざん防止 | 回答は 1 人 1 Spot 1 件。回答者 ID と時刻はサーバーが再設定し、塗り方の妥当性もデータベースで検証する。集計の加算はデータベースのトリガーが行い、回答の更新は拒否する | [20260927000004_answers.sql](db/migrations/20260927000004_answers.sql)・[20260928000000_author_answers.sql](db/migrations/20260928000000_author_answers.sql)（`answers_before_insert`）・[20260927000006_helpers.sql](db/migrations/20260927000006_helpers.sql)（`validate_paint`）・[20260927000008_triggers.sql](db/migrations/20260927000008_triggers.sql)。テスト [04_answers.test.sql](db/tests/04_answers.test.sql) |
| 不正な Hand の投稿防止 | 投稿はブラウザから直接書き込めず、サーバーの関数（create-post）だけが登録できる。関数はトークンの署名と発行者を検証したうえで、ルールに従って最初から再生して検証する（画面と同一の実装） | [packages/functions/src/createPost/index.ts](packages/functions/src/createPost/index.ts)（`verifyToken`）・[handler.ts](packages/functions/src/createPost/handler.ts)・[packages/core/src/post/verifyPost.ts](packages/core/src/post/verifyPost.ts) |
| 大量投稿の防止 | 1 人 1 日あたりの投稿数をデータベースで計数する | [20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`insert_post`）。テスト [02_quota.test.sql](db/tests/02_quota.test.sql) |
| 画像を端末の外に出さない | 読み取りはブラウザ内で行い、認識エンジンも自サイトから読み込む。読み取り結果にプレイヤー名を含めない。加えて、通信先を自サイトと Neon に限定する | [packages/app/src/ocr/runOcr.ts](packages/app/src/ocr/runOcr.ts)・[packages/ocr/src/readHandHistory.ts](packages/ocr/src/readHandHistory.ts)・[packages/app/public/_headers](packages/app/public/_headers)。外部に通信しないことのテスト [e2e/ocr.spec.ts](e2e/ocr.spec.ts) |
| XSS・クリックジャッキングの防止 | 利用者の入力（題名など）はテキストとして表示し、HTML として解釈しない。加えて、自サイト以外のスクリプトを実行させず、他サイトのフレーム内への表示も禁止する | [packages/app/public/_headers](packages/app/public/_headers) |
| セッションの保護 | ログインの Cookie は自サイトのもので、スクリプトから読めない（HttpOnly）。中継対象は認証に必要な API に限る。データ取得用のトークン（有効期限 15 分）はページ表示中のみメモリに保持する | [functions/api/auth/[[path]].ts](functions/api/auth/%5B%5Bpath%5D%5D.ts)・[packages/app/src/backend/authProxy.ts](packages/app/src/backend/authProxy.ts)（`firstPartyCookie`）・[packages/app/src/backend/neon.ts](packages/app/src/backend/neon.ts)（`getToken`） |
| 全データの削除 | 自分の回答（他人の投稿の集計からも減算）・投稿・アカウントの順に削除する | [20260927000009_rpc.sql](db/migrations/20260927000009_rpc.sql)（`delete_my_account`）。テスト [06_delete.test.sql](db/tests/06_delete.test.sql) |
| 秘密情報の管理 | リポジトリには置かず、各サービスの設定と GitHub の Secrets で管理する。`.env` はコミットしない | [CLAUDE.md](CLAUDE.md)（10 章）・[.gitignore](.gitignore)・[.env.example](.env.example) |

### 自動検証

上部のバッジは、次の検証の結果を示す（安全性を保証するものではない）。

| 検証 | 内容 | 実行タイミング |
|---|---|---|
| [CI](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml) | 型検査・単体テスト・ビルド、データベースの権限のテスト（未ログイン・未回答の利用者に見えないこと）、ブラウザでの E2E テスト | コード変更時 |
| [Live](https://github.com/satsuki19980613/WWYD/actions/workflows/live.yml) | 本番サイトのセキュリティヘッダー、未ログインで本番のデータベースと投稿の関数を読めない・呼べないこと、Mozilla HTTP Observatory の評価が A+ であること、本番のデータベースに個人情報が残っていないこと | 毎週・ヘッダーや中継の変更時（個人情報の検査は毎週） |
| [CodeQL](https://github.com/satsuki19980613/WWYD/actions/workflows/codeql.yml) | GitHub CodeQL による静的解析 | コード変更時・毎週 |
| [Secrets](https://github.com/satsuki19980613/WWYD/actions/workflows/secrets.yml) | gitleaks による秘密情報（API キー・トークン・パスワード・秘密鍵など）の検査。全ブランチの全履歴が対象 | コード変更時・毎週 |
| [Mozilla HTTP Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=wwyd.pages.dev) | 公開サイトのセキュリティヘッダー。**A+**（130 点、12 項目すべて合格。2026-10-11 測定） | リンク先で随時再測定できる（Live も毎週測定） |

このほか、依存パッケージの脆弱性を Dependabot で通知している。

### 脆弱性の報告

[SECURITY.md](SECURITY.md) を参照。リポジトリの Security タブから非公開で報告できる。

### 記載方針

本節は次の指針に基づいて構成している。

- 要点を先に、詳細を後に示す（英国 ICO の[段階的な情報提供](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-methods-can-we-use-to-provide-privacy-information/)）
- 取り扱う情報を定型の表で示す（カーネギーメロン大学の[プライバシーの「栄養成分表示」の研究](https://doi.org/10.1145/1753326.1753561)。Apple・Google のアプリストアの表示も同じ考え方）
- 保証範囲と制約、想定する脅威と対策の根拠を示す（[OpenSSF Best Practices](https://www.bestpractices.dev/en/criteria/1)）
- 報告窓口と実施中の検証を示す（[GitHub のリポジトリのベストプラクティス](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)）

## 開発

### 必要環境

- Node.js 22.12 以上

### コマンド

| コマンド | 内容 |
|---|---|
| `npm install` | 依存パッケージのインストール |
| `npm run dev` | 開発サーバー（http://localhost:5173/）。部品の一覧は `/_dev/ui`、各画面の状態は `?devstate=maintenance` などで確認できる |
| `npm test` | 単体テスト |
| `npm run typecheck` | 型検査 |
| `npm run e2e` | ブラウザでの E2E テスト（Playwright） |
| `npm run test:db` | データベースのテスト（Neon の一時ブランチを使用） |
| `npm run build` | 本番ビルド（`packages/app/dist`） |

### 関連資料

- 作業手順と規約：[CLAUDE.md](CLAUDE.md)
- 詳細仕様：[docs/detailed-spec/](docs/detailed-spec/00-index.md)
- 進捗と決定ログ：[docs/plan.md](docs/plan.md)
