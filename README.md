# WWYD

[![CI](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml/badge.svg)](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml)

WWYD（What Would You Do?）— ポーカーの Hero の手番（スポット）で、ほかの人ならどんなレンジで打つかを、集合知として見る Web アプリ。

サイト：https://wwyd.pages.dev/

- **一覧** — 投稿されたスポットの一覧。「すべて／自分の投稿」の切り替え、Street での絞り込み、新着順・回答が多い順の並び替え。
- **投稿** — ハンドヒストリーを入力し、Hero の手番を 1 つ選んでスポットとして投稿する。T4 の Hand History 画像から読み込むこともできる（読み取りは端末の中だけ）。Villain の情報（Reads）と MTT の情報も付けられる。下書きはこの端末に保存される。
- **回答** — Hero の席に座り、スポットまでのリプレイを見て（Hero のハンドは伏せてある）、13×13 のレンジ表に混合戦略（5% 刻み）を塗って答える。回答は 1 回だけで、送信後は変えられない。
- **集計** — 回答すると、全員の回答を合わせたレンジ、Hero の実際のアクションとハンド、ハンドヒストリー全体が見られる。投稿者も自分のスポットに回答でき、集計に含まれる。

ログインは Google アカウント。ソルバーの答えではなく、人の判断のばらつきを見る「アンケート」に近い道具です。利用は無料で、広告や有料機能はありません。

## 安全とプライバシー

### ひと目で

- **ほかの利用者には、誰が投稿・回答したかは表示されません。** 一人ひとりの回答も見えず、見えるのは全員分の集計だけです。
- **回答する前に、Hero のハンド・その後の展開・集計を見ることはできません。** サーバーが返さない作りです。
- **Hand History の画像はサーバーに送りません。** 読み取りは端末の中で行い、終わったら捨てます。
- **課金・広告・アクセス解析はありません。** このサイト以外のスクリプトは動かない設定です。
- **ここに書いた仕組みの多くは、コードを変えるたびに自動の試験で確かめています。** 結果は誰でも見られます（上のバッジ）。

一方で、**運営者は、Google から受け取ったメールアドレス・表示名・プロフィール画像の URL と、ログインの記録（IP アドレス・ブラウザの種類）を保存していて、見ることができます。** ログインの仕組み（Neon Auth）が、アプリと同じデータベースに保存するためです。**運営者は、どの投稿・回答が誰のものかも分かります。** 運営者を信頼して使うアプリです。

以下は、その詳しい中身と根拠です。

### 扱う情報の一覧

| 情報 | サーバーに保存されるもの | 運営者が見られるか | ほかの利用者に見えるか |
|---|---|---|---|
| メールアドレス | **保存する**（ログインの仕組みが保存する。アプリの表には置かない） | 見られる | 見えない |
| Google の表示名（氏名） | **保存する**（同上） | 見られる | 見えない |
| プロフィール画像の URL | **保存する**（同上） | 見られる | 見えない |
| ログインの記録（ログイン日時・IP アドレス・ブラウザの種類） | **保存する**（同上） | 見られる | 見えない |
| 利用者の番号（UID） | 保存する（投稿・回答を本人に結び付けるため） | 見られる | 見えない |
| 投稿（タイトル・ハンドヒストリー・Villain の情報・MTT の情報） | 保存する（投稿者か運営者が消すまで残る）。席はポジションだけで、プレイヤー名は入らない | 見られる | ログインした人に見える（誰の投稿かは見えない） |
| 投稿の Hero のハンド、スポットより後のアクションとボード | 保存する | 見られる | 回答した人にだけ見える |
| 回答（塗ったレンジとサイズ） | 保存する（投稿が消えるか、アカウントを削除するまで残る） | 見られる（誰の回答かも分かる） | 一人ひとりの回答は見えない。回答した人に、全員分の集計だけが見える |
| Hand History の画像・画像に写ったプレイヤー名 | **保存しない・送らない**（端末の中で読んで捨てる） | 見られない | 見えない |
| 投稿の下書き・Villain の情報の Preset | **保存しない**（自分の端末にだけ置く） | 見られない | 見えない |

外部のサービスに届くもの：

- **Google** — ログインするとき。
- **Neon**（ログイン・データベース・投稿の確認。米国の事業者で、サーバーはシンガポール） — ログインの情報、投稿と回答。通信を受けるので、接続の情報（IP アドレスなど）が届く。
- **Cloudflare**（サイトの配信とログインの中継。米国） — 通信を中継するので、接続の情報（IP アドレスなど）が届く。
- フォントと文字認識のエンジンはこのサイトから配っているので、開いただけで Google などに通信することはない。

### 期待できること・できないこと

期待できること：

- ほかの利用者に、誰が投稿・回答したかを知られない（投稿者の番号も返さない）。
- ほかの利用者に、自分の回答そのものを見られない（全員分の集計に混ざるだけ）。
- 回答する前に、Hero のハンドやその後の展開・集計を見てしまうことがない（サーバーが返さない）。
- 回答は 1 つのスポットに 1 人 1 回で、送信した後は誰も書き換えられない。集計はサーバーが足すので、ブラウザから値をごまかせない。
- Hand History の画像が端末の外に出ない。
- アカウントメニューの「アカウントを削除」で、自分の投稿・回答・ログインの情報（メールアドレスなど）がまとめて消える。
- 1 人が投稿を作り続けることを防ぐ（1 人が 1 日に投稿できる数に上限がある。初期値は 5 件）。

期待できないこと（限界）：

- **運営者は、メールアドレス・表示名・画像の URL・ログインの記録を見られる。** どの投稿・回答が誰のものかも分かる。どの投稿でも削除できる。
- **Google アカウントがあれば誰でもログインでき、ログインした人は全員の投稿を読める。** 投稿のタイトルは自由に書けるので、個人が分かることは書かないでください。
- **回答の 1 回の制限は Google アカウントごと。** アカウントを複数用意すれば、同じスポットに何度も回答して集計を偏らせることができる。
- **回数の制限は投稿の数だけ。** 読む・回答する回数には、アプリとしての制限を設けていない。
- **外部のサービス（Google・Neon・Cloudflare）がどう扱うかは、それぞれの規約による。**
- **第三者による監査は受けていない。** 個人で運営していて、確かめているのは下の自動の確認と、公開前に行った AI による点検（[docs/release-test/report.md](docs/release-test/report.md)）だけ。

### 仕組みと根拠

想定している相手は、答えを先に見ようとする利用者、誰が投稿・回答したかを知ろうとする利用者、回答や集計をごまかそうとする利用者、そして Web の一般的な攻撃です。ブラウザは信用しません。投稿の確認・回答の確認・集計・見せてよい範囲の判断はサーバー（データベースと Neon の関数）が行い、ブラウザには本人が見てよいものだけを送ります。

| 守ること | 仕組み | 根拠 |
|---|---|---|
| 誰が投稿・回答したかを見せない | 投稿者の番号の列は、ほかの利用者が読めないようにしている。一覧と詳細を返す関数も、投稿者の番号を返さない。回答の表は、本人の行しか読めない | [20260930000001_hide_author_uid.sql](db/migrations/20260930000001_hide_author_uid.sql)・[20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)（`answers_select`）・[20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`get_post_detail`・`list_posts`）。確かめる試験 [db/tests/90_release_c01_enforce.test.sql](db/tests/90_release_c01_enforce.test.sql) |
| メールアドレスなどをブラウザに渡さない | アプリの表には、メールアドレス・名前・画像・IP アドレスの列を作らない。ログインの仕組みが保存する表（`neon_auth`）は、ブラウザが使う役割から読めない | [20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)（権限の一括の取り消し）・[docs/detailed-spec/12-neon-migration.md](docs/detailed-spec/12-neon-migration.md)（Q-26）。確かめる試験 [db/tests/90_release_c01_enforce.test.sql](db/tests/90_release_c01_enforce.test.sql) |
| 回答する前に答えを見せない | Hero のハンド・スポットより後のアクションとボードは、投稿者本人か回答した人にだけ返す。集計は回答した人にだけ返す。ハンドの表はブラウザから直接読めず、決まった関数を通す | [20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`get_post_detail`）・[20260928000000_author_answers.sql](db/migrations/20260928000000_author_answers.sql)（`can_view_aggregate`）・[20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)（`post_secrets_select`）。確かめる試験 [db/tests/05_detail.test.sql](db/tests/05_detail.test.sql) |
| 回答と集計をごまかせない | 回答は 1 人 1 スポット 1 件で、書き換えを拒む。回答者の番号と時刻はサーバーが入れ直し、塗り方がルールに合うかもサーバーで確かめる。集計はデータベースが足す | [20260927000004_answers.sql](db/migrations/20260927000004_answers.sql)・[20260928000000_author_answers.sql](db/migrations/20260928000000_author_answers.sql)（`answers_before_insert`）・[20260927000008_triggers.sql](db/migrations/20260927000008_triggers.sql)（`answers_no_update`・`answers_after_insert`）・[20260927000006_helpers.sql](db/migrations/20260927000006_helpers.sql)（`validate_paint`）。確かめる試験 [db/tests/04_answers.test.sql](db/tests/04_answers.test.sql) |
| 投稿の中身をサーバーで確かめる | 投稿はブラウザから直接書き込めず、サーバーの関数（create-post）だけが入れられる。関数はログインの署名と発行元を確かめ、ハンドを最初から再生してルールに合うかを確かめる。1 日の投稿数の上限はデータベースで数える | [packages/functions/src/createPost/index.ts](packages/functions/src/createPost/index.ts)（`verifyToken`）・[handler.ts](packages/functions/src/createPost/handler.ts)（`createPostHandler`）・[packages/core/src/post/verifyPost.ts](packages/core/src/post/verifyPost.ts)・[20260930000000_villain_reads_mtt.sql](db/migrations/20260930000000_villain_reads_mtt.sql)（`insert_post`）。確かめる試験 [db/tests/02_quota.test.sql](db/tests/02_quota.test.sql) |
| ログインした本人だけが操作できる | ログインしていなければ何も読み書きできない。ログインのクッキーはこのサイトのもの（ページのスクリプトからは読めない形）にする。データの通信に使うトークン（15 分で切れる）は、ページを開いている間だけメモリに持つ | [20260927000007_rls.sql](db/migrations/20260927000007_rls.sql)・[functions/api/auth/[[path]].ts](functions/api/auth/%5B%5Bpath%5D%5D.ts)・[packages/app/src/backend/authProxy.ts](packages/app/src/backend/authProxy.ts)（`firstPartyCookie`）・[packages/app/src/backend/neon.ts](packages/app/src/backend/neon.ts)（`getToken`）。確かめる試験 [db/tests/01_access.test.sql](db/tests/01_access.test.sql) |
| 画像を端末の外に出さない | 文字認識は端末の中で行い、認識エンジンもこのサイトから読む。読み取った結果にプレイヤー名を入れない。画面からの通信先は、このサイトと Neon だけに限る設定 | [packages/app/src/ocr/runOcr.ts](packages/app/src/ocr/runOcr.ts)（`runOcr`）・[packages/ocr/src/readHandHistory.ts](packages/ocr/src/readHandHistory.ts)・[packages/app/public/_headers](packages/app/public/_headers)。外に通信しないことを確かめる試験 [e2e/ocr.spec.ts](e2e/ocr.spec.ts) |
| ほかの人のタイトルで画面を乗っ取られない | 利用者が書いた文字は、文字として表示する（HTML として扱わない）。さらに、このサイト以外のスクリプトは動かない設定にしている | [packages/app/public/_headers](packages/app/public/_headers) |
| 自分の情報を消せる | アカウントを削除すると、自分の回答（ほかの人の集計からも引く）、自分の投稿、ログインの情報の順に消す | [20260927000009_rpc.sql](db/migrations/20260927000009_rpc.sql)（`delete_my_account`）。確かめる試験 [db/tests/06_delete.test.sql](db/tests/06_delete.test.sql) |
| 鍵やパスワードを漏らさない | リポジトリには置かず、Neon と GitHub の Secrets に置く。`.env` はコミットしない | [CLAUDE.md](CLAUDE.md)（10 章）・[.gitignore](.gitignore)・[.env.example](.env.example) |

### 自動の確認

このページの上のバッジは、次の確認に通っていることを示します（安全を保証するものではありません）。

| 確認 | 何を確かめているか | いつ |
|---|---|---|
| [CI](https://github.com/satsuki19980613/WWYD/actions/workflows/ci.yml) | 型検査、単体テスト（ポーカーロジックの行の 90% 以上を通る）、ビルド。データベースの試験（Neon の一時的な環境で、権限・回答前に見せない範囲・回答・削除などを確かめる。鍵が設定されていないときは飛ばす）。画面の試験（Playwright。Neon への通信は偽の応答に差し替える。画像の読み込みで外に通信しないことを含む） | コードを変えるたび（main への反映と pull request） |
| [Mozilla HTTP Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=wwyd.pages.dev) | 公開しているサイトの保護ヘッダ（点数はここには記録していない） | リンク先でいつでも測れる |

本番のサイトとデータベースを定期的に確かめる自動の確認は、まだありません。

### 問題を見つけたら

このリポジトリの Security タブから、公開されない形で運営者に知らせることができます。

### この節の書き方について

読む人が確かめやすいよう、次の考え方に沿って書いています。

- **大事なことを先に短く、詳しいことは後ろに**（英国の個人情報保護機関 ICO の「[段階的に示す](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-methods-can-we-use-to-provide-privacy-information/)」考え方）
- **扱う情報を決まった形の表にする**（カーネギーメロン大学の[プライバシーの「栄養成分表示」の研究](https://doi.org/10.1145/1753326.1753561)。Apple や Google のアプリストアの表示も同じ考え方）
- **期待できること・できないことを両方書き、想定する相手と対策の根拠を示す**（[OpenSSF Best Practices](https://www.bestpractices.dev/en/criteria/1) の基準）
- **知らせ方を用意し、動かしている検査を示す**（[GitHub のリポジトリのベストプラクティス](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)）

## 開発

- 開発：`npm install && npm run dev` → http://localhost:5173 （Neon の開発用の環境につなぐ。開発時だけ、部品の一覧は `/_dev/ui`、画面の状態は `?devstate=maintenance` などで確認できる）
- 確認：`npm run typecheck`（型検査）・`npm test`（単体テスト）・`npm run e2e`（画面の試験。Neon にはつながない）・`npm run test:db`（データベースの試験。Neon CLI のログインと Docker が必要）
- ビルド：`npm run build`（出力は `packages/app/dist`。main に反映すると Cloudflare Pages が公開する）
- コマンドの一覧と作業の決まり：[CLAUDE.md](CLAUDE.md)
- 詳細仕様：[docs/detailed-spec/00-index.md](docs/detailed-spec/00-index.md)（バックエンドは [12 章](docs/detailed-spec/12-neon-migration.md)、手作業の手順は [10 章](docs/detailed-spec/10-manual-tasks.md)）
- 計画と進み具合：[docs/plan.md](docs/plan.md)
