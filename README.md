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

- **投稿や回答が誰のものかは、ほかの利用者には分かりません。** 投稿者の ID も読めないようにしています。
- **回答するまで、集計と Hero のハンドは返しません。** 画面で隠すのではなく、サーバーが返さない仕組みです。
- **Hand History の画像は、あなたの端末から出ません。** 読み取りは端末の中だけで行い、画像は送信も保存もしません。
- **広告・アクセス解析はありません。** このサイトと、データベースのある Neon 以外へは通信しない設定です。
- **ここに書いたことは、自動の確認で確かめ続けています。** 結果は誰でも見られます（上のバッジ）。

一方で、**運営者は、ログインに使った Google アカウントの表示名・メールアドレスと、誰がどの投稿・回答をしたかを見ることができます。** ログインの仕組み（Neon Auth）がデータベースに保存するためです。運営者を信頼できる場合に使うアプリです。

以下は、その詳しい中身と根拠です。

### 扱う情報の一覧

| 情報 | サーバーに保存されるもの | 運営者が見られるか | ほかの利用者に見えるか |
|---|---|---|---|
| Google の表示名・メールアドレス・プロフィール画像の URL | 保存する（ログインの仕組み Neon Auth が、アプリとは別の場所に置く） | 見られる | 見えない（アプリからは読めない） |
| ログインの記録（日時・IP アドレス・ブラウザの種類） | 保存する（同じく Neon Auth。ログインを保つため） | 見られる | 見えない |
| 利用者の ID（ランダムな番号） | 保存する（投稿・回答の持ち主を見分けるため） | 見られる | 見えない |
| 投稿（Hand History・題名・Villain の Read・MTT の情報） | 保存する（ポジションだけ。プレイヤー名は保存しない） | 見られる | 見える（Hero のハンドは回答した人だけ） |
| 回答（塗った Range） | 保存する | 見られる | 1 人分は見えない。全員分の集計だけが、回答した人に見える |
| Hand History の画像 | **保存しない・送信しない**（端末の中で読み取って捨てる） | 見られない | 見えない |
| 投稿の下書き・Read の Preset | **保存しない**（自分の端末にだけ置く） | 見られない | 見えない |

外部のサービスに届くもの：

- **Google** — ログインするとき。
- **Cloudflare**（サイトとログインの中継）・**Neon**（データベース・ログイン・投稿の検証） — 通信を中継するので、接続の情報（IP アドレスなど）が届く。
- フォントと文字の読み取りの部品（tesseract.js と学習データ）はこのサイトから配っているので、開いただけでほかのサービスに通信することはない。

### 期待できること・できないこと

期待できること：

- ほかの利用者に、どの投稿・回答があなたのものかを知られない。
- 回答する前に、集計や Hero のハンドを見られない（投稿者も、自分で回答するまで集計は見えない）。
- 集計をごまかされない。回答の形の検証と集計はサーバーが行い、回答は 1 人 1 回・送信後は変えられない。
- Hand History の画像を、運営者を含め誰にも見られない。
- ログインしていない人には、何も読めない・書けない。
- アカウントメニューの「アカウントを削除」で、自分の投稿・回答・アカウント情報をすべて消せる。
- 1 人が投稿を出し続けて一覧を埋めることを防ぐ（1 日に出せる投稿の数に上限がある）。

期待できないこと（限界）：

- **運営者は、表示名・メールアドレス・ログインの記録と、誰がどの投稿・回答をしたかを見られる。** データベースの持ち主として読める。
- **投稿した Hand の中身は、ログインした人なら誰でも見られる。** プレイヤー名は保存しないが、Hand の中身から場面を知っている人に推測されることはありうる。
- **1 人 1 回の制限は Google アカウントごと。** アカウントを大量に用意する相手には、集計を偏らせられる。
- **外部のサービス（Google・Cloudflare・Neon）がどう扱うかは、それぞれの規約による。**
- **第三者による監査は受けていない。** 個人で運営していて、確かめているのは下の自動の確認だけ。

### 仕組みと根拠

想定している相手は、回答する前に答えを見ようとする利用者、投稿者を突き止めようとする利用者、集計をごまかそうとする利用者、そして Web の一般的な攻撃です。ブラウザから来た値は信用しません。投稿の検証・回答の検証・集計・見てよいかの判定はサーバーが行います。

| 守ること | 仕組み | 根拠 |
|---|---|---|
| ログインしていない人に何も見せない | すべての表で行ごとの権限（RLS）を有効にし、ログインした利用者にも必要な表・列・行だけを許す | [20260927000007_rls.sql](db/migrations/20260927000007_rls.sql) |
| 投稿者を結び付けさせない | 投稿の表から投稿者の ID の列を読めなくし、「自分の投稿か」「消せるか」だけをサーバーが答える | [20260930000001_hide_author_uid.sql](db/migrations/20260930000001_hide_author_uid.sql) |
| 回答するまで答えを見せない | 集計・Hero のハンドの表は「投稿者本人か回答済み」の行しか返さない。Spot の詳細を返す関数も、回答していなければ伏せる | [20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)（`can_view_results`）・[20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`get_post_detail`） |
| 集計をごまかさせない | 回答の形の検証・集計の加算はデータベースのトリガーが行う。回答の書き換えは拒む | [20260927000008_triggers.sql](db/migrations/20260927000008_triggers.sql)・[20260927000004_answers.sql](db/migrations/20260927000004_answers.sql) |
| ありえない Hand を投稿させない | 投稿はサーバーの関数が、ログインの署名と発行元を確かめたうえで、ルールどおりに最初から再生して確かめる（画面と同じ 1 つの実装） | [packages/functions/src/createPost/](packages/functions/src/createPost/index.ts)・[packages/core/](packages/core/) |
| 投稿の出しすぎを止める | 1 人 1 日あたりの投稿の数をデータベースで数える | [20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`insert_post`） |
| 画像を端末から出さない | 読み取りはブラウザの中だけ。さらに、通信先をこのサイトと Neon だけに限る設定にしている | [packages/ocr/](packages/ocr/)・[packages/app/public/_headers](packages/app/public/_headers) |
| 画面を乗っ取らせない | このサイト以外のスクリプトは動かない設定。ほかのサイトの枠の中にも表示させない | [packages/app/public/_headers](packages/app/public/_headers) |
| ログインを保ち、ほかへ渡さない | ログインのクッキーはこのサイトのもの。中継するのはログインに要る API だけ。データを読むための鍵（15 分で切れる）はページを開いている間だけメモリに持つ | [packages/app/src/backend/authProxy.ts](packages/app/src/backend/authProxy.ts)・[packages/app/src/backend/neon.ts](packages/app/src/backend/neon.ts) |
| 消したいときに全部消せる | 自分の回答（他人の投稿の集計からも引く）・投稿・アカウントの順に消す | [20260927000009_rpc.sql](db/migrations/20260927000009_rpc.sql)（`delete_my_account`） |
| 鍵やパスワードを漏らさない | リポジトリには置かず、各サービスの設定と GitHub の Secrets に置く | [.env.example](.env.example) |

### 自動の確認

このページの上のバッジは、次の確認に通っていることを示します（安全を保証するものではありません）。

| 確認 | 何を確かめているか | いつ |
|---|---|---|
| [CI](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml) | 型検査・単体テスト・ビルド、データベースの権限のテスト（ログインしていない人・回答していない人に見えないか）、ブラウザでの操作のテスト | コードを変えるたび |
| [Live](https://github.com/satsuki19980613/WWYD/actions/workflows/live.yml) | 本番のサイトに保護ヘッダが付いているか、ログインせずに本番のデータベースと投稿の関数を読めない・呼べないか、Mozilla HTTP Observatory の評価が A+ か | 毎週と、ヘッダや中継を変えたとき |
| [CodeQL](https://github.com/satsuki19980613/WWYD/actions/workflows/codeql.yml) | GitHub 公式のコードスキャン（危ない書き方が無いか） | コードを変えるたびと毎週 |
| [Mozilla HTTP Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=wwyd.pages.dev) | 公開しているサイトの保護ヘッダ。**A+**（130 点、12 項目すべて合格。2026-10-11 に測定） | リンク先でいつでも測り直せる（Live も毎週測る） |

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
