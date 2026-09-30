# 18. Villain の情報（Reads）と MTT の情報、回答画面のヘッダー、一覧のカード（2026-09-30）

さつきの依頼（2026-09-30）。Villain の傾向と MTT の状況（ICM）が無いと、回答者は GTO のレンジで答えるしかなく、回答が似通う。
投稿者が Villain の情報と MTT の状況を共有できれば、exploit や ICM を考えた多様なレンジが集まり、集合知としての価値が上がる。

- **16 章との関係**: 出題は Hero の手番のまま（回答者は Hero の席で答える）。「Villain」は **Hero 以外の席の呼び名**として、この情報にだけ使う。
  出題の仕組み（Villain の席を 1 つ選ぶ）は戻さない。
- **用語**: ポーカーの専門用語は英語のまま（VPIP・PFR・ICM・ITM・Bubble・Final Table・PKO・Satellite など。15 章 §1.1）。それ以外の文言は日本語。
- **全項目が任意**。何も入れなくても投稿できる。既存の投稿は「情報なし」として扱う（後方互換）。

## 1. さつきの判断（2026-09-30）

| 論点 | 決定 |
|---|---|
| Memo に実在のプレイヤーの名前を書けてしまう（不変条件 6） | Memo は作る。利用規約で実名・アカウント名・ハンドルネームなど個人を識別できる情報と誹謗中傷を禁止し、違反した投稿は運営者が予告なく削除・非表示にできる。機械では防がない（書かれた文字を判定しない）。プレースホルダーで「個人を特定できる情報は書かない」と示す |
| 画面に説明を出さない（不変条件 1） | 例外として画面に出す: Prize Structure の目安（選択肢の一部として小さく）、MTT の人数の欄の名前（Rank・Players Left など）、回答画面の MTT のモーダルの「Rank / Players Left」の見出し。詳しい説明は ⓘ（09 章） |
| 新しいカードのデザインの範囲 | スマホのカードだけ。PC の一覧は表のまま（17 章。F-029 で直したばかり）で、印（Reads・MTT）と黄の使い方だけ合わせる |
| Slider の 5 段階の境目 | Claude の案（§2.1）。数字はあとで変えてよい |

## 2. 投稿画面

### 2.1 Villain の情報（Hero 以外の座っている席ごと）

| 項目 | 値 | 5 段階のラベル（左から 0〜4） | 境目 |
|---|---|---|---|
| VPIP | 0〜100 の整数（%） | Very Tight / Tight / Standard / Loose / Very Loose | 15・22・30・40（その値以上で次の段階） |
| PFR | 0〜100 の整数（%） | Very Low / Low / Standard / High / Very High | 8・14・20・26 |
| Postflop Aggression | 0〜100 の整数（AFq の %） | Very Passive / Passive / Balanced / Aggressive / Very Aggressive | 25・40・55・70 |
| Read Confidence | 0〜4（段階だけ） | First Impression / Few Orbits / Some History / Long Session / HUD Stats | — |
| Hero Image（Villain から見た Hero の印象） | 0〜4（段階だけ） | Very Tight / Tight / Standard / Loose / Very Loose | — |
| Memo | 30 文字まで（コードポイント数。1 行。前後の空白は除く） | — | — |

- 境目は 6-max のキャッシュの一般的な目安（HUD の統計の読み方）。`packages/app/src/reads/readsModel.ts` の `READ_DEFS` で変える。

### 2.2 Slider の操作

- **未入力と中央値は別**。初めは未入力（つまみを出さず、溝を斜線にし、ラベルは「—」）。触ると入力になる。× で未入力に戻す。
- 表示は 5 段階のラベルが基本。VPIP・PFR・Postflop Aggression は右の数（%）を押すと数を直接入れられる（HUD の値。0〜100 の整数でなければ変えない）。
  入力欄は 16px（iPhone の Safari が拡大しないように。リリース前テスト F-032）。
- **PFR は VPIP を超えない**: PFR を VPIP より上げると VPIP も同じ値に上がる。VPIP を PFR より下げると PFR も同じ値に下がる。
  片方が未入力なら追従しない（触っていない項目を勝手に入力にしない）。サーバーも PFR > VPIP を断る（§3）。
- 横になぞって動かす（縦のスクロールは妨げない。`touch-action: pan-y`）。キーボードは ←→ で 1、PageUp/Down で %の項目は 10・段階の項目は 1、
  Home・End で端、Delete で未入力。未入力のときの最初の矢印は真ん中（50% または 2）に置く。
- 読み上げは `role="slider"`。値は「Loose 30%」「HUD Stats」「未入力」。

### 2.3 席ごとの折りたたみと Preset

- 見出し「Villain」の下に、Hero 以外の座っている席を 1 行ずつ並べる（人数を選ぶまでは出さない）。閉じた席は 1 行（席と、入力した項目の要約。
  VPIP と PFR があれば「28/21」、Postflop Aggression のラベル、Memo）。未入力の席は「—」。開けるのは 1 席ずつ。
- 開いた席の下に「Preset」「クリア」。Preset は名前（20 文字まで）を付けて今の席の情報を保存し、保存したものを呼び出す（今の席に入れる）・削除する。
  同じ名前は上書き。20 件まで。**端末の localStorage にだけ、ログインしている利用者ごとに保存する**（`wwyd.readPresets.v1.<uid>`。サーバーには送らない。
  プライバシーポリシー §1）。アカウントを削除したら、その利用者の Preset も消す。
- Hero を変えた・人数を減らしたときは、Hero・空席の情報を画面に出さず送らない（下書きには残る。戻せば出る）。
- 置き場所: PC は左の列の「Player と Hand」の下、スマホはステップ 2（Player）の下。

### 2.4 MTT の情報（Game 形式が MTT のときだけ）

| 項目 | 値 |
|---|---|
| Stage（最初に選ぶ） | Early / Bubble / ITM / Final Table |
| Tournament Type | Regular / PKO / Satellite |
| Rank・Players Left・Paid Places・Entries | 1〜1,000,000 の整数 |
| Avg Stack（bb） | 0 より大きく 99,999 まで、小数第 1 位まで。**Final Table では出さない・送らない** |
| Prize Structure | Top-heavy（1st ≥ 25%）/ Standard（1st 15–25%）/ Flat（1st < 15%）。括弧の目安（1st prize が賞金総額に占める割合。暫定値）を選択肢の下に小さく出す |

- 選択肢は押すと選び、もう一度押すと未選択に戻る（全項目任意）。
- 人数の大小: Rank ≦ Players Left ≦ Entries、Paid Places ≦ Entries（両方あるときだけ比べる。Paid Places は Players Left を超えてよい＝入賞後）。
  読めない値は欄を赤い枠にし、投稿の時に「MTT の Rank の値が正しくありません」。
- 置き場所: PC は左の列の「基本設定」の下、スマホはステップ 1（基本設定）の下。
- **表示の形**: `12/58 ・ ITM 50 ・ 320 entries`（Rank/Players Left・Paid Places・Entries。無い項目は出さない。Rank だけなら `#12`、Players Left だけなら `58 left`）。

## 3. サーバーでの検証（不変条件 4・7）

`packages/core/src/post/reads.ts` の `validateReads`・`validateMtt`。画面（送信前の `buildSubmission`）と create-post の `validateInput` の両方がこれを通す。

| 違反 | コード | 画面の文言 |
|---|---|---|
| 形が違う（オブジェクトでない・知らない項目・整数でない・選択肢の外）、Hero・空席・席でないキー | `malformed` | 入力内容を確認してください |
| 範囲の外（% は 0〜100、段階は 0〜4）、PFR > VPIP、Memo が 30 文字を超える・改行や制御文字・NUL・対のないサロゲート | `invalid_reads` | Villain の情報を確認してください |
| 人数・Avg Stack の範囲、人数の大小、Cash に MTT の情報 | `invalid_mtt` | MTT の情報を確認してください |

- 中身の無い席・空の MTT の情報は落とす（保存しない）。Memo は前後の空白を除いて保存する。
- 画面は情報が無ければ本文にキー（`villain_reads`・`mtt`）を入れない（前の版と同じ本文。前の版の create-post が動いていても投稿できる）。

## 4. DB（マイグレーション `20260930000000_villain_reads_mtt.sql`）

- `post_hands.villain_reads jsonb not null default '{}'`（オブジェクト、4KB まで）、`post_hands.mtt jsonb`（null かオブジェクト、1KB まで）。
  中身の検証は create-post で行い、DB は形と大きさだけを強制する（最後の砦）。既存の投稿は `{}` と null。
- `insert_post`: `p->'villain_reads'`（無ければ `{}`）と `p->'mtt'`（無い・JSON の null なら null）を保存する。
- `get_post_detail`: `hand` に `villain_reads` と `mtt` を足す。**回答の前でも返す**（回答の手がかり。不変条件 10 の対象外）。
- `list_posts`: 戻り値に `has_reads`・`has_mtt`（一覧の印）を足す（戻り値の型が変わるので作り直す。権限・security definer・`search_path` は前と同じ）。
- 画面は `get_post_detail` の 2 つの情報を core の検証に通し、形が違えば「情報なし」にする（回答の画面を落とさない）。
- 試験: `db/tests/08_reads.test.sql`（DB-20）。

## 5. 回答画面・集計画面

### 5.1 ヘッダー

- 画面名（「回答」「結果」「List」「Post」「下書き」「利用規約」「プライバシーポリシー」）は**画面に出さない**（読み上げ用の見出しとしてだけ残す）。
  PC はナビ（List・＋ Post）で居場所が分かる。
- 回答・集計の画面は、**投稿のタイトルをヘッダーに出し、本文からは外す**（ヘッダーのタイトルが h1）。
- 収まるなら止めたまま。収まらなければ横に流す: 左端で止まる → 右端まで流れる（36px/秒）→ 止まる → 左端に戻る、を繰り返す（止まる時間は周期の 18% ずつ）。
- `prefers-reduced-motion` の端末では流さず、末尾を「…」で省略し、押すと全文を折り返して出す（もう一度押すと戻す）。

### 5.2 Villain・MTT の情報の表示

- 卓の上の 1 行に「History」（スマホだけ）「All Villains」「MTT」。情報が 1 つも無ければ All Villains・MTT は押せない。
- 情報のある席は、席の札の右上に小さなシアンの ◆ を付け、押せるようにする。押すとその席のモーダル（「Villain · BTN」）。
- All Villains: ポットに参加した席（Preflop で Fold していない席）を上に、Preflop で Fold した席は「Preflop Fold n」の下に折りたたむ。
  どちらも座席の順。情報の無い席は 1 行（「—」）。回答画面は見せている範囲（停止位置まで）の Action で並べる。
- MTT: Stage・Tournament Type・「Rank / Players Left」の見出しと `12/58 ・ ITM 50 ・ 320 entries`（ツールチップにも項目名）・Avg Stack・Prize Structure（目安つき）。
- 表示は簡潔に: **未入力の項目は出さない**。Slider は段階のラベルとバーだけ（数は出さない）。
- 集計画面にも同じボタンと席の印を置く。

### 5.3 レイアウト

- タイトルがヘッダーへ移って空いた縦の場所に、卓の上のボタンの行を置く。スマホは卓の最小の高さを 380px から 340px にして、ボタンの行の分を卓から縮める。

## 6. 一覧のカード（スマホ）

情報に優先度を付けて 3 段に分ける（段の間は区切り線ではなく余白 16px）。カード全体を押せる（14 章）。

| 段 | 内容 |
|---|---|
| 1 | タイトル（いちばん強い文字。最大 2 行、あふれたら省略）。自分の投稿は右上に削除 |
| 2 | Street・Board（左）、Hero の席（席の色。「Hero」の語は省く）・Game 形式・Stack・人数（小さく控えめの色）、末尾に印 `Reads`・`MTT`（シアンの枠）。1 行に収め、入りきらなければ条件の文字を「…」にする（Board と印は縮めない） |
| 3 | 左に回答数（数字だけ黄で大きく）・経過時間・状態（自分の投稿・回答済み）、右に CTA（回答する / 結果を見る / 回答を見る ＞） |

- 黄は CTA（回答する）と回答数だけに使う。状態の札（自分の投稿・回答済み）は控えめの色にする（前は黄・シアン）。文字の色は fg・dim・dim2 の 3 階調。
- PC の表: 条件の行の後ろに同じ印。回答数を黄にする。状態の札は控えめの色。

## 7. 規約・プライバシーポリシー（2026-09-30 の変更）

- 利用規約 §1 禁止事項に追加: 「Villain の情報（Memo など）に、実名・アカウント名・ハンドルネームなど特定の個人を識別できる情報を書くこと」「他人を誹謗中傷すること」。
- 利用規約 §2: 「不適切な投稿は、予告なく削除することがあります。」→「禁止事項に反する投稿や不適切な投稿は、予告なく削除または非表示にすることがあります。」
- 利用規約 §3 の冒頭に追加: 「投稿に付いた Villain の情報（スライダーと Memo）は、投稿者の主観的な評価です。」
- プライバシーポリシー §1: 「投稿の下書きは、その端末のブラウザにだけ保存します。」→「投稿の下書きと Villain の情報の Preset は、その端末のブラウザにだけ保存し、サーバーには送信しません。」
- 非表示の機能は作っていない（違反した投稿は管理者の削除で消す。06 章 §2）。

## 8. 試験

- 単体: `packages/core/src/post/reads.test.ts`（RD・MT）、`packages/app/src/reads/readsModel.test.ts`（段階・追従・送る形・MTT の欄・並び・下書きの読み直し・Preset）、
  `packages/functions/src/createPost/handler.test.ts`（EF-05・EF-06）。
- DB: `db/tests/08_reads.test.sql`（DB-20）。
- E2E: `e2e/reads.spec.ts`（ヘッダーのタイトル・席のモーダル・All Villains・MTT・押せない状態・前の版の投稿・Slider・PFR の追従・数の直接入力・Memo・Preset・MTT の欄・送る本文・一覧の印）。
