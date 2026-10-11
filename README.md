# WWYD（What Would You Do?）

[![CI](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml/badge.svg)](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml)
[![Live](https://github.com/satsuki19980613/WWYD/actions/workflows/live.yml/badge.svg)](https://github.com/satsuki19980613/WWYD/actions/workflows/live.yml)
[![CodeQL](https://github.com/satsuki19980613/WWYD/actions/workflows/codeql.yml/badge.svg)](https://github.com/satsuki19980613/WWYD/actions/workflows/codeql.yml)

ポーカーのハンドの Hero の手番（Spot）で、ほかの人ならどんな Range でどう打つかを、回答を集めて知る Web アプリ。ソルバーの答えではなく、人の判断のばらつきを見るアンケートに近い道具。

サイト：https://wwyd.pages.dev/

- **投稿** — Hand History を入力し（スクリーンショットからの読み取りも使える）、Flop 以降の Hero の手番を 1 つ選んで Spot として出す。
- **回答** — Hero の席に座って Spot までのリプレイを見て（Hero のハンドは伏せてある）、13×13 の Range 表に混合戦略（5% 刻み）を塗る。
- **答え合わせ** — 回答すると、全員の回答の集計 Range、Hero の実際のアクションとハンド、Hand History の続きが見られる。

2〜6 人の No-Limit Hold'em、Cash と MTT。利用は無料で、広告・課金・寄付などの収益を目的とする要素はありません。

## 安全とプライバシー

### ひと目で

- **運営者は、あなたのメールアドレス・氏名・プロフィール画像・IP アドレスを保存しません。** 見ることもできません。
- **投稿や回答が誰のものかは、ほかの利用者には分かりません。** 投稿者の ID も読めないようにしています。
- **回答するまで、集計と Hero のハンドは返しません。** 画面で隠すのではなく、サーバーが返さない仕組みです。
- **Hand History の画像は、あなたの端末から出ません。** 読み取りは端末の中だけで行い、画像は送信も保存もしません。
- **広告・アクセス解析はありません。** このサイトと、データベースのある Neon 以外へは通信しない設定です。
- **ここに書いたことは、自動の確認で確かめ続けています。** 結果は誰でも見られます（上のバッジ）。

一方で、**運営者は、どの投稿・回答が同じ利用者のものか（ランダムな番号どうしの結び付き）を見ることができます。** 番号が誰なのか（メールアドレスや氏名）は分かりません。

以下は、その詳しい中身と根拠です。

### 扱う情報の一覧

| 情報 | サーバーに保存されるもの | 運営者が見られるか | ほかの利用者に見えるか |
|---|---|---|---|
| メールアドレス | **保存しない**（実在しない宛先 `<ランダムな ID>@wwyd.invalid` に置き換える） | 見られない | 見えない |
| Google の表示名（氏名） | **保存しない**（全員 `Player` に置き換える） | 見られない | 見えない |
| プロフィール画像 | **保存しない** | 見られない | 見えない |
| IP アドレス・ブラウザの種類 | **保存しない** | 見られない | 見えない |
| Google のトークン（中にメールアドレスが入っている） | **保存しない** | 見られない | 見えない |
| Google がアカウントごとに発行する番号 | 保存する（次のログインで同じ人だと見分けるため） | 見られる | 見えない |
| ログインの記録（日時） | 保存する（ログインを保つため） | 見られる | 見えない |
| 利用者の ID（ランダムな番号） | 保存する（投稿・回答の持ち主を見分けるため） | 見られる | 見えない |
| 投稿（Hand History・題名・Villain の Read・MTT の情報） | 保存する（投稿者か運営者が消すまで残る。席はポジションだけで、プレイヤー名は入らない） | 見られる | ログインした人に見える（誰の投稿かは見えない） |
| 投稿の Hero のハンド、Spot より後のアクションとボード | 保存する | 見られる | 回答した人にだけ見える |
| 回答（塗った Range とサイズ） | 保存する（投稿が消えるか、アカウントを削除するまで残る） | 見られる（どの利用者の番号の回答かは分かる） | 1 人分は見えない。全員分の集計だけが、回答した人に見える |
| Hand History の画像・画像に写ったプレイヤー名 | **保存しない・送信しない**（端末の中で読み取って捨てる） | 見られない | 見えない |
| 投稿の下書き・Read の Preset | **保存しない**（自分の端末にだけ置く） | 見られない | 見えない |

外部のサービスに届くもの：

- **Google** — ログインするとき。
- **Cloudflare**（サイトとログインの中継）・**Neon**（データベース・ログイン・投稿の検証） — 通信を中継するので、接続の情報（IP アドレスなど）が届く。
- フォントと文字の読み取りの部品（tesseract.js と学習データ）はこのサイトから配っているので、開いただけでほかのサービスに通信することはない。

### 期待できること・できないこと

期待できること：

- 運営者に、メールアドレス・氏名・画像・IP アドレスを知られない。
- ほかの利用者に、どの投稿・回答があなたのものかを知られない。
- 回答する前に、集計・Hero のハンド・Spot より後の展開を見られない（投稿者も、自分で回答するまで集計は見えない）。
- 集計をごまかされない。回答の形の検証と集計はサーバーが行い、回答は 1 人 1 回・送信後は変えられない。
- Hand History の画像を、運営者を含め誰にも見られない。
- ログインしていない人には、何も読めない・書けない。
- アカウントメニューの「アカウントを削除」で、自分の投稿・回答・アカウント情報をすべて消せる。
- 1 人が投稿を出し続けて一覧を埋めることを防ぐ（1 人が 1 日に出せる投稿の数に上限がある。初期値は 5 件）。

期待できないこと（限界）：

- **運営者は、どの投稿・回答が同じ利用者のものかを見られる。** データベースの持ち主として読める（番号どうしの結び付きで、誰なのかは分からない）。どの投稿でも削除できる。
- **Google アカウントがあれば誰でもログインでき、ログインした人は全員の投稿を読める。** プレイヤー名は保存しないが、Hand の中身から場面を知っている人に推測されることはありうる。題名は自由に書けるので、個人が分かることは書かないでください。
- **1 人 1 回の制限は Google アカウントごと。** アカウントを大量に用意する相手には、集計を偏らせられる。
- **回数の制限は投稿の数だけ。** 読む・回答する回数には、アプリとしての制限を設けていない。
- **外部のサービス（Google・Cloudflare・Neon）がどう扱うかは、それぞれの規約による。**
- **第三者による監査は受けていない。** 個人で運営していて、確かめているのは下の自動の確認と、公開前に行った AI による点検（[docs/release-test/report.md](docs/release-test/report.md)）だけ。

### 仕組みと根拠

想定している相手は、回答する前に答えを見ようとする利用者、投稿者を突き止めようとする利用者、集計をごまかそうとする利用者、個人の情報を持ちすぎてしまう運営者自身、そして Web の一般的な攻撃です。ブラウザから来た値は信用しません。投稿の検証・回答の検証・集計・見てよいかの判定はサーバーが行います。

| 守ること | 仕組み | 根拠 |
|---|---|---|
| 個人の情報を残さない | ログインの仕組み（Neon Auth）が書き込む表で、データベースのトリガーが書き込まれる直前に置き換える。ログインの仕組みがどう書き込んでも、置き換える前の値は保存されない | [20261011000000_auth_scrub.sql](db/migrations/20261011000000_auth_scrub.sql)。確かめる試験 [09_auth_scrub.test.sql](db/tests/09_auth_scrub.test.sql)。本番に残っていないかを毎週数える [scripts/db.mjs](scripts/db.mjs)（`auth-audit`） |
| ログインしていない人に何も見せない | すべての表で行ごとの権限（RLS）を有効にし、ログインした利用者にも必要な表・列・行だけを許す。ログインの仕組みが保存する表（メールアドレスなど）は、ブラウザが使う役割から読めない | [20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)。確かめる試験 [01_access.test.sql](db/tests/01_access.test.sql)・[90_release_c01_enforce.test.sql](db/tests/90_release_c01_enforce.test.sql) |
| 投稿者を結び付けさせない | 投稿の表から投稿者の ID の列を読めなくし、「自分の投稿か」「消せるか」だけをサーバーが答える。回答の表は本人の行しか読めない | [20260930000001_hide_author_uid.sql](db/migrations/20260930000001_hide_author_uid.sql)・[20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)（`answers_select`）。確かめる試験 [90_release_c01_enforce.test.sql](db/tests/90_release_c01_enforce.test.sql) |
| 回答するまで答えを見せない | Hero のハンドの表は投稿者本人か回答した人に、集計の表は回答した人にだけ行を返す。Spot の詳細を返す関数も、回答していなければ Hero のハンドと Spot より後のアクション・ボードを伏せる | [20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)（`post_secrets_select`）・[20260928000000_author_answers.sql](db/migrations/20260928000000_author_answers.sql)（`can_view_aggregate`）・[20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`get_post_detail`）。確かめる試験 [05_detail.test.sql](db/tests/05_detail.test.sql) |
| 集計をごまかさせない | 回答は 1 人 1 Spot 1 件。回答者の ID と時刻はサーバーが入れ直し、塗り方がルールに合うかもデータベースで確かめる。集計の加算もデータベースのトリガーが行い、回答の書き換えは拒む | [20260927000004_answers.sql](db/migrations/20260927000004_answers.sql)・[20260928000000_author_answers.sql](db/migrations/20260928000000_author_answers.sql)（`answers_before_insert`）・[20260927000006_helpers.sql](db/migrations/20260927000006_helpers.sql)（`validate_paint`）・[20260927000008_triggers.sql](db/migrations/20260927000008_triggers.sql)。確かめる試験 [04_answers.test.sql](db/tests/04_answers.test.sql) |
| ありえない Hand を投稿させない | 投稿はブラウザから直接書き込めず、サーバーの関数（create-post）だけが入れられる。関数はログインの署名と発行元を確かめたうえで、ルールどおりに最初から再生して確かめる（画面と同じ 1 つの実装） | [packages/functions/src/createPost/index.ts](packages/functions/src/createPost/index.ts)（`verifyToken`）・[handler.ts](packages/functions/src/createPost/handler.ts)・[packages/core/src/post/verifyPost.ts](packages/core/src/post/verifyPost.ts) |
| 投稿の出しすぎを止める | 1 人 1 日あたりの投稿の数をデータベースで数える | [20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`insert_post`）。確かめる試験 [02_quota.test.sql](db/tests/02_quota.test.sql) |
| 画像を端末から出さない | 読み取りはブラウザの中だけで、認識エンジンもこのサイトから読む。読み取った結果にプレイヤー名を入れない。さらに、通信先をこのサイトと Neon だけに限る設定にしている | [packages/app/src/ocr/runOcr.ts](packages/app/src/ocr/runOcr.ts)・[packages/ocr/src/readHandHistory.ts](packages/ocr/src/readHandHistory.ts)・[packages/app/public/_headers](packages/app/public/_headers)。外に通信しないことを確かめる試験 [e2e/ocr.spec.ts](e2e/ocr.spec.ts) |
| 画面を乗っ取らせない | 利用者が書いた文字（題名など）は文字として表示し、HTML として扱わない。さらに、このサイト以外のスクリプトは動かない設定。ほかのサイトの枠の中にも表示させない | [packages/app/public/_headers](packages/app/public/_headers) |
| ログインを保ち、ほかへ渡さない | ログインのクッキーはこのサイトのもので、ページのスクリプトからは読めない形（HttpOnly）。中継するのはログインに要る API だけ。データを読むための鍵（15 分で切れる）はページを開いている間だけメモリに持つ | [functions/api/auth/[[path]].ts](functions/api/auth/%5B%5Bpath%5D%5D.ts)・[packages/app/src/backend/authProxy.ts](packages/app/src/backend/authProxy.ts)（`firstPartyCookie`）・[packages/app/src/backend/neon.ts](packages/app/src/backend/neon.ts)（`getToken`） |
| 消したいときに全部消せる | 自分の回答（他人の投稿の集計からも引く）・投稿・アカウントの順に消す | [20260927000009_rpc.sql](db/migrations/20260927000009_rpc.sql)（`delete_my_account`）。確かめる試験 [06_delete.test.sql](db/tests/06_delete.test.sql) |
| 鍵やパスワードを漏らさない | リポジトリには置かず、各サービスの設定と GitHub の Secrets に置く。`.env` はコミットしない | [CLAUDE.md](CLAUDE.md)（10 章）・[.gitignore](.gitignore)・[.env.example](.env.example) |

### 自動の確認

このページの上のバッジは、次の確認に通っていることを示します（安全を保証するものではありません）。

| 確認 | 何を確かめているか | いつ |
|---|---|---|
| [CI](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml) | 型検査・単体テスト・ビルド、データベースの権限のテスト（ログインしていない人・回答していない人に見えないか）、ブラウザでの操作のテスト | コードを変えるたび |
| [Live](https://github.com/satsuki19980613/WWYD/actions/workflows/live.yml) | 本番のサイトに保護ヘッダが付いているか、ログインせずに本番のデータベースと投稿の関数を読めない・呼べないか、Mozilla HTTP Observatory の評価が A+ か、本番のデータベースに個人の情報が残っていないか | 毎週と、ヘッダや中継を変えたとき（個人の情報は毎週） |
| [CodeQL](https://github.com/satsuki19980613/WWYD/actions/workflows/codeql.yml) | GitHub 公式のコードスキャン（危ない書き方が無いか） | コードを変えるたびと毎週 |
| [Mozilla HTTP Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=wwyd.pages.dev) | 公開しているサイトの保護ヘッダ。**A+**（130 点、12 項目すべて合格。2026-10-11 に測定） | リンク先でいつでも測り直せる（Live も毎週測る） |

ほかに、使っている部品に弱点が見つかったら GitHub から知らせが届くようにしています（Dependabot）。

### 問題を見つけたら

[SECURITY.md](SECURITY.md) を見てください。このリポジトリの Security タブから、公開されない形で運営者に知らせることができます。

### この節の書き方について

読む人が確かめやすいよう、次の考え方に沿って書いています。

- **大事なことを先に短く、詳しいことは後ろに**（英国の個人情報保護機関 ICO の「[段階的に示す](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-methods-can-we-use-to-provide-privacy-information/)」考え方）
- **扱う情報を決まった形の表にする**（カーネギーメロン大学の[プライバシーの「栄養成分表示」の研究](https://doi.org/10.1145/1753326.1753561)。Apple や Google のアプリストアの表示も同じ考え方）
- **期待できること・できないことを両方書き、想定する相手と対策の根拠を示す**（[OpenSSF Best Practices](https://www.bestpractices.dev/en/criteria/1) の基準）
- **知らせ方を用意し、動かしている検査を示す**（[GitHub のリポジトリのベストプラクティス](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)）

## 開発

- 開発：`npm install && npm run dev` → http://localhost:5173 （部品の一覧は `/_dev/ui`、全画面の状態は `?devstate=maintenance` などで確認できる）
- テスト：`npm test`（単体）・`npm run e2e`（ブラウザ）・`npm run test:db`（データベース。Neon の一時ブランチ）
- 作業の手順と決まりごと：[CLAUDE.md](CLAUDE.md)
- 詳細仕様：[docs/detailed-spec/](docs/detailed-spec/00-index.md)、進捗と決定ログ：[docs/plan.md](docs/plan.md)
