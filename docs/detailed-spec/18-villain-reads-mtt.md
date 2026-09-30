# 18. Villain の情報（Reads）と MTT の情報、回答画面のヘッダー、一覧のカード（2026-09-30）

さつきの依頼（2026-09-30）。Villain の傾向と MTT の状況（ICM）が無いと、回答者は GTO のレンジで答えるしかなく、回答が似通う。
投稿者が Villain の情報と MTT の状況を共有できれば、exploit や ICM を考えた多様なレンジが集まり、集合知としての価値が上がる。

- **16 章との関係**: 出題は Hero の手番のまま（回答者は Hero の席で答える）。「Villain」は **Hero 以外の席の呼び名**として、この情報にだけ使う。
  出題の仕組み（Villain の席を 1 つ選ぶ）は戻さない。
- **用語**: ポーカーの専門用語は英語のまま（VPIP・PFR・ICM・ITM・Deep・Turbo など。15 章 §1.1）。それ以外の文言は日本語。
  **ただし MTT の数の欄の名前は日本語**（スポットの順位・残りの人数・エントリー数。ITM と Avg Stack はそのまま。2026-09-30 さつき）。
- **全項目が任意**。何も入れなくても投稿できる。既存の投稿は「情報なし」として扱う（後方互換）。

## 1. さつきの判断（2026-09-30）

| 論点 | 決定 |
|---|---|
| Memo に実在のプレイヤーの名前を書けてしまう（不変条件 6） | ~~Memo は作る（規約で禁止）~~ → **2026-09-30 さつきの仕様変更で Memo を廃止**し、選択肢を組み合わせて一文を作る Read（§2.1）に置き換える。自由記述は投稿のタイトルだけになり、運営者が見張る対象をそこに絞る。個人を特定できる情報の禁止は、タイトルに対する規定として規約に残す |
| 画面に説明を出さない（不変条件 1） | 例外として画面に出す: Prize Structure の目安（選択肢の一部として小さく）、MTT の数の欄の名前、回答画面の MTT のモーダルの「順位 / 残りの人数」の見出し。詳しい説明は ⓘ（09 章） |
| 新しいカードのデザインの範囲 | スマホのカードだけ。PC の一覧は表のまま（17 章。F-029 で直したばかり）で、印（Reads・MTT）と黄の使い方だけ合わせる |
| Slider の 5 段階の境目 | Claude の案（§2.1）。数字はあとで変えてよい |
| Villain の情報の形（2026-09-30 仕様変更） | 全体の傾向（VPIP・PFR の Slider と、Postflop Aggression・Hero Image・Sample の 5 分割のボタン）と、構造化した Read（`[When] · [Action] → [Lean]`）。§2.1。**未決定の論点は §10、今の実装との食い違いは §11**。承認まで実装しない |

## 2. 投稿画面

### 2.1 Villain の情報（2026-09-30 さつきの仕様変更。Memo を廃止）

2026-09-30 にさつきの承認（§10 の論点はすべて推奨どおり）を受けて実装した。判定は core の `poker/readActions.ts`（Action の語彙・表 2 枚・Spot Read の Action の決め方・登録できる席）と
`post/reads.ts`（`validateReads`・`verifyReads`）、画面は `packages/app/src/reads/`。

#### 2.1.1 全体の傾向（席ごと。全項目任意。上から この順）

| 順 | 項目 | 入力 | 値 |
|---|---|---|---|
| 1 | VPIP | Slider（§2.2 の操作のまま） | 0〜100 の整数（%）。表示は段階のラベルが基本、数を押して直接入れられる |
| 2 | PFR | Slider（同上） | 0〜100 の整数（%）。PFR ≦ VPIP（PFR を上げたら VPIP も追従） |
| 3 | Postflop Aggression（Passive〜Aggressive） | 5 分割のボタン | 0〜4 |
| 4 | Hero Image（Tight〜Loose） | 5 分割のボタン | 0〜4 |
| 5 | Sample（First Impression〜Long / HUD Stats） | 5 分割のボタン | 0〜4。旧 Read Confidence を改名。プレイヤーに 1 つだけ（Read ごとには持たない） |

- VPIP・PFR は「未入力」を持ち、初めは未入力。× で未入力に戻す。
- 5 分割のボタンは、選んでいるボタンをもう一度押すと未入力に戻る。
- ラベル（左から 0〜4。§10 C-1）: Postflop Aggression は Very Passive / Passive / Balanced / Aggressive / Very Aggressive、Hero Image は Very Tight / Tight / Standard / Loose / Very Loose、
  Sample は First Impression / Few Orbits / Some History / Long / HUD Stats。帯を 5 つに分けたボタンで、選んだ所まで黄。帯の下の左右に両端の名前。
- VPIP・PFR の段階の境目: VPIP 15・22・30・40、PFR 8・14・20・26（その値以上で次の段階。Claude の案。`READ_DEFS`）。

#### 2.1.2 Read の型（1 つだけ）

```
[When] · [Action] → [Lean]
```

表示は英語と記号だけ（日本語の助詞を入れない）。例: `River · Barrel (Big) → Value-heavy` / `Flop · Fold to C-Bet → Over` /
`Turn · Flush Complete · Barrel → Under` / `Flop · A-high · C-Bet → Over`。

| スロット | 内容 | 必須 |
|---|---|---|
| When | Street。任意で条件（Board・Size）を足せる | Street だけ必須 |
| Action | Street を選ぶと候補が絞られる（§2.1.5） | 必須 |
| Lean | 下の 4 語から 1 つ | 必須 |

| Lean | 意味 | 使える Action |
|---|---|---|
| Over | やりすぎる | すべて |
| Under | やらなさすぎる | すべて |
| Value-heavy | やるときは強い | Bet / Raise 系だけ |
| Bluff-heavy | やるときは弱い | Bet / Raise 系だけ |

- 強さは 2 段（通常・強い）。同じ Lean をもう一度押すと「強い」（`++`）、もう一度押すと外れる（§10 C-6）。
- 中央（GTO 並み）と未入力の Lean は無い。偏りが無ければ Read を作らない。

#### 2.1.3 条件（任意。付けなければ「その Street 全般」）

| 種類 | 軸 | タグ |
|---|---|---|
| Flop texture（Flop の時点の Board） | High Card | A-high / K-high / Q/J-high / Middle（T〜8） / Low（7 以下） |
| | Suit | Rainbow / Two-tone / Monotone |
| | Pairing | Unpaired / Paired |
| | Connectivity | **Straight possible** / **No straight**（Flop の 3 枚でストレートが完成しうるか。§10 B-4） |
| Runout（Turn・River だけ） | — | Brick / Overcard / Flush Complete / Straight Complete / Board Pair |
| Size（Bet / Raise 系だけ） | — | Small / Big / Overbet |

#### 2.1.4 Read の 2 種類

| 種類 | 内容 | 件数 |
|---|---|---|
| Spot Read | 投稿のスポットで Villain が実際に取った Action に付ける。When と Action は Action の列から自動で入り、投稿者は Lean を選ぶだけ。Board は入れない（実際の Board が画面にある） | 1 席 1 件 |
| General Read | Preset に残す汎用の読み。Street → Action → Lean の順に選び、必要なら条件を足す | 1 席 2 件まで |

- Spot Read を付けられるのは **Hero の判断地点より前の Action だけ**（後の Action は候補に出さない。回答者に答えが漏れるため。不変条件 10 と同じ考え）。
- Spot Read の欄に「この Hand の結果を知る前の読みで」と短く添える（後知恵の読みを抑える）。**不変条件 1（画面に説明を出さない）の例外になる**（§10 C-10）。
- 自動で入れられる Action が無い席では、Spot Read の枠を出さない。
- Action の列から Action の名前を決める規則は §10.3。候補が複数なら投稿者が選ぶ（最初は判断地点にいちばん近いもの）。Size は実際の額から自動（§10 C-5）。
- 情報を登録できる席: Preflop で Fold 以外の Action をした席と、Fold to Steal の Fold をした Blind（§10 B-2。`villainSeats`）。
  Steal に Call が入った後の Blind の Fold は Fold to Steal ではないので、その Blind は登録できない（2026-09-30 さつき。§10.4）。
  このため Villain の欄は **Spot の下**に置く（PC は右の列の Spot の下、スマホはステップ 4（Spot））。Spot を選ぶまで Spot Read は出ない。

#### 2.1.5 Action の語彙（安定した ID で持つ）

| Street | Action |
|---|---|
| Preflop | 3-Bet / Fold to 3-Bet / 4-Bet / Fold to 4-Bet / Squeeze / Limp / Fold to Steal |
| Flop | C-Bet / Fold to C-Bet / Donk / Bet vs Check / Raise / Fold to Bet / Fold to Raise |
| Turn・River | Barrel / Fold to Barrel / Delayed C-Bet（Turn だけ）/ Donk / Probe / Bet vs Check / Raise / Fold to Bet / Fold to Raise |

- C-Bet は Flop だけ。Turn・River は Barrel。
- Block Bet・Call Down は作らない（Block Bet は Size: Small、Call Down は Fold to Bet → Under で表す）。
- Check-Raise は Raise にまとめ、OOP のときだけ表示名を Check-Raise にする（Spot Read はその Street で先に Check したか、General Read は Villain が Postflop で Hero より先に動くか。§10 C-7）。
- **Bet / Raise 系**（Value-heavy・Bluff-heavy を選べる）: 3-Bet / 4-Bet / Squeeze / C-Bet / Barrel / Delayed C-Bet / Donk / Probe / Bet vs Check / Raise。ほかは Over・Under だけ。

#### 2.1.6 表示

- 中央以外の値と Read だけを出す（VPIP・PFR は数でいつも、Postflop Aggression・Hero Image は中央を出さない、Sample は中央も出す。§10 C-2）。1 席の例:

```
BTN  VPIP 38 · PFR 12 · Passive · Sample: Long
     River · Barrel (Big) → Value-heavy
     Flop · Fold to C-Bet → Over
```

- 全体の傾向と Read が食い違ってもエラーにしない（全体の傾向に対する例外として扱う）。

#### 2.1.7 データ

- 投稿には Preset の参照ではなく**写し**を保存する（今と同じ）。
- 回答が 1 件でも付いたら Villain の情報は編集できない（投稿を編集する機能が無いので、投稿後はいつも変えられない。§10 C-13）。
- Preset: 名前は端末の中だけ（サーバーに送らない）。中身は全体の傾向と、最後まで選んだ General Read（Spot Read は入れない。呼び出しても今の Spot Read は残す）。
  `wwyd.readPresets.<uid>` に `{ schema: 2, presets }`。前の版（`wwyd.readPresets.v1.<uid>`。Memo の形）は読まず、書くときに消す。
- Read 1 件の形（案）:

```
{ scope: 'spot' | 'general', street, action,          // enum。安定した ID
  texture: { high, suit, paired, connect } | null,
  runout: [enum] | null, size: enum | null,
  lean: 'over' | 'under' | 'value' | 'bluff', strong: boolean }
```

- 検証: 表 2 枚（Street → 選べる Action、Action → 選べる Lean）は core に 1 つ置き、画面と create-post が使う（§10 C-9。DB は形と大きさだけ）。Preflop の Read に texture・runout があれば断る。
- 集計のキーは粗く（action × lean）。条件は保存だけで集計に使わない。今回は保存だけで、集計の画面は作らない（§10 C-11）。
- 旧仕様の Memo（30 文字）のスキーマ・画面・検証は消した。途中の General Read（Street だけ選んだもの等）があると投稿の前に「{席} の General Read を最後まで選んでください」。

### 2.2 Slider の操作（VPIP・PFR と MTT の Tournament Type）

- **未入力と中央値は別**。初めは未入力（つまみを出さず、溝を斜線にし、ラベルは「—」）。触ると入力になる。× で未入力に戻す。
- 表示は 5 段階のラベルが基本。VPIP・PFR は右の数（%）を押すと数を直接入れられる（HUD の値。0〜100 の整数でなければ変えない）。
  入力欄は 16px（iPhone の Safari が拡大しないように。リリース前テスト F-032）。
- **PFR は VPIP を超えない**: PFR を VPIP より上げると VPIP も同じ値に上がる。VPIP を PFR より下げると PFR も同じ値に下がる。
  片方が未入力なら追従しない（触っていない項目を勝手に入力にしない）。サーバーも PFR > VPIP を断る（§3）。
- 横になぞって動かす（縦のスクロールは妨げない。`touch-action: pan-y`）。キーボードは ←→ で 1、PageUp/Down で %の項目は 10・段階の項目は 1、
  Home・End で端、Delete で未入力。未入力のときの最初の矢印は真ん中（50% または 2）に置く。
- 読み上げは `role="slider"`。値は「Loose 30%」「未入力」。5 分割のボタンは `aria-pressed` のボタンの組（名前は段階のラベル）。

### 2.3 席ごとの折りたたみと Preset

- 見出し「Villain」の下に、情報を登録できる席（§2.1.4）を 1 行ずつ並べる。閉じた席は 1 行（席と要約。例「38/12 · Passive · Sample: Long · 1 Read」）。
  未入力の席は「—」。開けるのは 1 席ずつ。
- 開いた席の中: VPIP・PFR の Slider、5 分割のボタン 3 つ、Spot Read（候補があるときだけ）、General Read（「＋ General Read」で 2 件まで。× で消す）。
  General Read の条件（Board・Size）は「Board · Size」を押して開く。
- 開いた席の下に「Preset」「クリア」。Preset は名前（20 文字まで）を付けて保存・呼び出し・削除。同じ名前は上書き。20 件まで。
  **端末の localStorage にだけ、ログインしている利用者ごとに保存する**（サーバーには送らない。プライバシーポリシー §1）。アカウントを削除したら、その利用者の Preset も消す。
- 登録できなくなった席（Hero・Action を変えた）の情報は画面に出さず送らない（下書きには残る。戻せば出る）。

### 2.4 MTT の情報（Game 形式が MTT のときだけ）

| 項目 | 値 |
|---|---|
| Tournament Type（ストラクチャーの速さ） | **段階の無い Slider**（0 = Deep 〜 100 = Turbo の整数。§2.2 と同じ操作。未入力あり）。段階のラベル・目盛り・数の表示は無く、溝の下の左に「Deep」、右に「Turbo」。**回答・集計の表示も Slider そのもの**（動かせない。つまみの位置で速さが分かる） |
| スポットの順位・残りの人数・エントリー数・ITM（入賞する人数） | 1〜1,000,000 の整数。**欄の名前は日本語**、並びはこの順 |
| Avg Stack（bb） | 0 より大きく 99,999 まで、小数第 1 位まで |
| Prize Structure | Top-heavy（1st ≥ 25%）/ Standard（1st 15–25%）/ Flat（1st < 15%）。括弧の目安（1st prize が賞金総額に占める割合。暫定値）を選択肢の下に小さく出す |

- **2026-09-30 さつきの修正**: Stage（Early / Bubble / ITM / Final Table）の項目をなくした。Tournament Type は Regular / PKO / Satellite の選択をやめ、左端 Deep・右端 Turbo の段階の無い Slider にした（最初は 5 段階にしたが、さつきの指示で段階をやめた）。数の欄は上の 5 つだけ（Paid Places は「ITM」の名前で残す）。
- Prize Structure の選択肢は押すと選び、もう一度押すと未選択に戻る（全項目任意）。
- 人数の大小: スポットの順位 ≦ 残りの人数 ≦ エントリー数、ITM ≦ エントリー数（両方あるときだけ比べる。ITM は残りの人数を超えてよい＝入賞後）。
  読めない値は欄を赤い枠にし、投稿の時に「MTT の スポットの順位 の値が正しくありません」の形で出す。
- 置き場所: PC は左の列の「基本設定」の下、スマホはステップ 1（基本設定）の下。
- **表示の形**: `12/58 ・ ITM 50 ・ 320 entries`（スポットの順位 / 残りの人数・ITM・エントリー数。無い項目は出さない。Rank だけなら `#12`、Players Left だけなら `58 left`）。

## 3. サーバーでの検証（不変条件 4・7）

ハンドに照らした検証（登録できる席か、Spot Read が判断地点より前の実際の Action に合うか）は `verifyReads`（`verifyPost` がハンドを再生したあとに呼ぶ）。

`packages/core/src/post/reads.ts` の `validateReads`・`validateMtt`。画面（送信前の `buildSubmission`）と create-post の `validateInput` の両方がこれを通す。

| 違反 | コード | 画面の文言 |
|---|---|---|
| 形が違う（オブジェクトでない・知らない項目・整数でない・選択肢の外）、Hero・空席・席でないキー | `malformed` | 入力内容を確認してください |
| 範囲の外（% は 0〜100、5 分割は 0〜4）、PFR > VPIP、Street と Action・Action と Lean の組、条件（Preflop の texture、Turn・River 以外の runout、Bet / Raise 系以外の Size、Preflop の Overbet、Spot Read の条件）、Spot Read 2 件以上・General Read 3 件以上、**登録できない席、実際の Action（Street・Action・Size）に合わない Spot Read** | `invalid_reads` | Villain の情報を確認してください |
| 人数・Avg Stack の範囲、人数の大小、Cash に MTT の情報 | `invalid_mtt` | MTT の情報を確認してください |

- 中身の無い席・空の MTT の情報は落とす（保存しない）。空の texture・runout は null、runout は決まった順に並べ、Spot Read を先にして保存する。
- 画面は情報が無ければ本文にキー（`villain_reads`・`mtt`）を入れない（前の版と同じ本文。前の版の create-post が動いていても投稿できる）。

## 4. DB（マイグレーション `20260930000000_villain_reads_mtt.sql`）

- `post_hands.villain_reads jsonb not null default '{}'`（オブジェクト、8KB まで。2026-09-30 の仕様変更で 4KB から上げた。未適用のうちにマイグレーションを直した）、`post_hands.mtt jsonb`（null かオブジェクト、1KB まで）。
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
- 表示する情報のある席（中央の値だけの席は除く）は、席の札の右上に小さなシアンの ◆ を付け、押せるようにする。押すとその席のモーダル（「Villain · BTN」）。
- All Villains: ポットに参加した席（Preflop で Fold していない席）を上に、Preflop で Fold した席は「Preflop Fold n」の下に折りたたむ。
  どちらも座席の順。情報の無い席は 1 行（「—」）。回答画面は見せている範囲（停止位置まで）の Action で並べる。
- MTT: Tournament Type（Slider そのものと左右の Deep・Turbo）・「順位 / 残りの人数」の見出しと `12/58 ・ ITM 50 ・ 320 entries`（ツールチップにも項目名）・Avg Stack・Prize Structure（目安つき）。
- 表示は簡潔に: **未入力の項目は出さない**。Villain は全体の傾向のチップと Read の行（§2.1.6。Lean はシアン、強いは `++` と背景）。
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
- **2026-09-30 の仕様変更（Memo の廃止）で直した**:
  - 利用規約 §1: 「Villain の情報（Memo など）に、実名・…を書くこと」の行を消す。タイトルの行（「スポットのタイトルに、実在の人物を特定できる情報…」）は残す。「他人を誹謗中傷すること」は残す。
  - 利用規約 §3: 「Villain の情報（スライダーと Memo）」→「Villain の情報」。
  - プライバシーポリシー §1: Preset を端末にだけ保存する文は残す（変えない）。

## 8. スクロールバー（2026-09-30 さつき。アプリ全体）

- 細く（4px）、ふだんは見せず、**スクロールしている間だけ**出す（止まって 0.9 秒で消える）。つまみにマウスを乗せた・掴んだときはシアンで出す。PC・スマホとも同じ。
- `styles/scrollbar.css`（Chromium・Safari は `::-webkit-scrollbar`、Firefox は `scrollbar-width: thin` と `scrollbar-color`）と
  `scrollIndicator.ts`（スクロールした要素に `is-scrolling` を付ける）。スマホの OS が重ねて描くスクロールバー（iOS・Android）は、もともと細くスクロール中だけ出る。
- 試験: `e2e/scrollbar.spec.ts`（幅 4px 以下、スクロール中だけ `is-scrolling`）。Playwright の画面なしの Chromium はスクロールバーを描かないので、色は目で確かめる。

## 9. 試験

- 単体: `packages/core/src/poker/readActions.test.ts`（RA。Action の決め方・Size・登録できる席）、`packages/core/src/post/reads.test.ts`（RD・MT）、
  `packages/app/src/reads/readsModel.test.ts`（ラベル・追従・5 分割・Lean の順・General Read の操作・表示・送る形・下書きの読み直し・Preset・MTT の欄・並び）、
  `packages/functions/src/createPost/handler.test.ts`（EF-05・EF-06）。
- DB: `db/tests/08_reads.test.sql`（DB-20）。
- E2E: `e2e/reads.spec.ts`（ヘッダーのタイトル・席のモーダルのチップと Read・All Villains・MTT・押せない状態・前の版の投稿・登録できる席・Spot Read・General Read・5 分割・PFR の追従・数の直接入力・Preset・MTT の欄・送る本文・一覧の印）。
- テストとレビュー（2026-09-30。[villain-reads-test](../villain-reads-test/report.md)）で足した試験: `e2e/villain/`（T2〜T5。モンキーの全量は環境変数で。`e2e/villain/t5-monkey.spec.ts` の先頭）、
  `packages/**/villain.*.test.ts`（T1・T3・T4）、`db/tests/91_villain_reads.test.sql`（T4）。

## 10. 論点（2026-09-30 の仕様変更。**さつきの回答: すべて推奨どおり**）

### 10.1 さつきの推奨がある論点（Claude の懸念を添える）

| # | 論点 | さつきの推奨 | Claude の懸念 |
|---|---|---|---|
| B-1 | Bet vs Check の名前 | Bet vs Check のまま | なし |
| B-2 | 情報を登録できる席 | ハンド参加者と、Hero の後ろの未アクション席に絞る | ① Spot は Flop 以降なので、判断地点で Hero の後ろにいて未アクションの席は必ず Flop に残っている＝参加者に含まれる（2 つ目の条件は実質いらない）。② Preflop で Fold しただけの SB・BB を「参加者」から外すと、Fold to Steal の Spot Read を付けられない。案: 参加者＝Preflop で Fold 以外の Action を 1 回でもした席、または Fold to Steal の候補がある Blind。③ 今の実装は Hero 以外の座っている席すべて |
| B-3 | 「強い」の表示 | `++` などの文字の印を必須、色の濃さは補助 | なし。読み上げは「Over（強い）」のように言葉にする |
| B-4 | Connectivity | 2 値のまま、ラベルを `Straight possible / No straight` に | なし。判定は「Flop の異なる 3 つのランクが連続する 5 つのランクに収まる」（A は 1 と 14 の両方。8-8-9 のような Paired Board は当たらない。2026-09-30 villain-reads-test V-008 で文を直した。判定のコードは無く、投稿者がタグを選ぶ）とする |
| B-5 | MTT 固有の読み | MTT の情報の実装後にまとめて検討 | なし |

### 10.2 Claude が見つけた論点（選択肢と Claude の推奨）

| # | 論点 | 選択肢 | Claude の推奨 |
|---|---|---|---|
| C-1 | 5 分割のボタンの中間のラベル | 下の案 / ほかの語 | Postflop Aggression: Very Passive / Passive / Balanced / Aggressive / Very Aggressive。Hero Image: Very Tight / Tight / Standard / Loose / Very Loose（どちらも今のまま）。Sample: First Impression / Few Orbits / Some History / **Long** / HUD Stats（例の「Sample: Long」に合わせ Long Session を Long に） |
| C-2 | 表示で「中央」を出さないこと（前の決定「未入力と中央は別」と、見る側からは区別できなくなる） | (a) 項目ごとに決める (b) 5 分割の 3 つすべてで中央を出さない (c) 入力した値はすべて出す | (a): VPIP・PFR は数でいつも出す（例のとおり）。Postflop Aggression・Hero Image は中央（Balanced・Standard）を出さない。Sample は入っていれば中央でも出す（読みの確かさなので中央にも意味がある） |
| C-3 | Spot Read の Action を Action の列から決める規則 | 下の案 / 直す | 下の案（§10.3） |
| C-4 | 1 席に候補が複数ある（例: Preflop の 3-Bet と Flop の C-Bet） | (a) 投稿者が候補から 1 つ選ぶ (b) 判断地点にいちばん近い Action に決める | (a)。最初は判断地点にいちばん近い Action を選んだ状態にする |
| C-5 | Spot Read の Size | (a) 実際の額から自動で付ける (b) 付けない | (a)。Pot に対して 50% 未満 Small・50〜100% Big・100% 超 Overbet。Preflop は付けない |
| C-6 | 「強い」の Lean を 3 回目に押したとき | (a) 選んでいない状態に戻る (b) 通常に戻る | (a)（未選択 → 通常 → 強い → 未選択）。Spot Read はそれで消え、General Read は作りかけに戻る |
| C-7 | Check-Raise の表示の「OOP」の決め方 | Spot Read: その Street で先に Check していれば Check-Raise。General Read: (a) 投稿の Villain の席が Postflop で Hero より先に動くなら Check-Raise (b) General Read はいつも Raise | (a) |
| C-8 | Preflop の Size | (a) Small・Big だけ (b) Overbet も | (a)（Preflop の Overbet は意味が薄い） |
| C-9 | 表 2 枚の置き場所（「DB 側と共有」） | (a) `packages/core` に 1 つ置き、画面と create-post（サーバー）が使う。DB は形と大きさだけ (b) SQL にも同じ表を作る | (a)。(b) は不変条件 7（ロジックを SQL で二重に作らない）に反する。今の Villain・MTT の検証も (a) の形 |
| C-10 | 注記「この Hand の結果を知る前の読みで」 | (a) 不変条件 1 の例外に加えて画面に出す (b) ⓘ に入れる | (a)（入力欄の近くにないと効かない） |
| C-11 | 集計（action × lean） | (a) 今回は保存だけ（あとで集計できる形で持つ）(b) 集計の画面も作る | (a)。今は Villain の情報を集計する画面が無く、何を見せるかが決まっていない |
| C-12 | 条件の選び方 | Flop texture は軸ごとに 0〜1 つ（全部任意）。Runout は複数選べる（その Street で落ちたカードについて。Overcard と Flush Complete を両方など） | この形 |
| C-13 | 「回答が付いたら編集不可」 | (a) 投稿を編集する機能は作らない（今と同じ。投稿後は回答の有無に関係なく変えられない）(b) 回答が付くまで Villain の情報だけ直せる機能を作る | (a)。(b) は新しい機能（画面・RPC・サーバーでの強制）になる |

### 10.3 Spot Read の Action の決め方（案。C-3）

「Aggressor」＝それまでに最後に Bet / Raise した席（前の Street が全員 Check なら、さらに前の Street。Flop では Preflop の最後の Raise）。

| Action | 決め方 |
|---|---|
| Limp | だれも Raise していない Preflop の Call（BB を除く） |
| 3-Bet / Squeeze | Preflop の 2 回目の Raise。最初の Raise との間に Call が無ければ 3-Bet、1 人以上あれば Squeeze |
| 4-Bet | Preflop の 3 回目の Raise |
| Fold to 3-Bet / Fold to 4-Bet | 最初の Raise をした席が 3-Bet・Squeeze に Fold / 3-Bet・Squeeze をした席が 4-Bet に Fold |
| Fold to Steal | CO・BTN・SB の最初の Raise（それより前は全員 Fold）に、SB・BB が Fold。**その Raise に Call が 1 人でも入ったら当たらない**（PT4 の定義。2026-09-30 さつき。§10.4） |
| C-Bet | Flop で Aggressor がする最初の Bet |
| Barrel | Turn・River で Aggressor がする最初の Bet（Delayed C-Bet に当たるものを除く） |
| Delayed C-Bet | Flop が全員 Check のあと、Turn で Preflop の Aggressor がする最初の Bet |
| Donk | 前の Street に Bet / Raise があり、Aggressor がまだ動いていない時に、Aggressor より先に動く席がする最初の Bet。**Aggressor が All-in（もう動けない）なら当たらない**（2026-09-30 さつき。§10.4） |
| Probe | 前の Street が全員 Check のあと（Turn・River）、Aggressor より先に動く席がする最初の Bet（Aggressor が All-in なら当たらない） |
| Bet vs Check | 上に当たらない最初の Bet で、その Street で先に Check があったもの |
| Raise | Postflop の Raise（その Street で先に Check していれば Check-Raise と表示） |
| Fold to C-Bet / Fold to Barrel | C-Bet / Barrel・Delayed C-Bet に Fold |
| Fold to Bet / Fold to Raise | そのほかの Bet に Fold / Raise に Fold |
| 候補にしない | 最初の Raise（Open）、Limp 以外の Call、Check、5-Bet 以降、上に当たらない Fold・Bet（Limp のポットで最初に動く席の Bet など） |

### 10.4 テストとレビューを受けた決定（2026-09-30 さつき。[villain-reads-test](../villain-reads-test/report.md)）

プロのポーカープレイヤーの知見（[poker-review.md](../villain-reads-test/poker-review.md)）と試験の指摘を受けて、さつきが決めた。

| # | 論点 | 決定 |
|---|---|---|
| V-002 | Steal に Call が入った後の Blind の Fold | **Fold to Steal にしない**（PT4 の定義。Call が入ると Steal ではなくなる）。その Blind は登録できる席からも外れる |
| V-003 | 前の Street で All-in した Aggressor への Bet | **Donk・Probe にしない**（もう動けない相手への Side Pot の Bet）。先に Check があれば Bet vs Check、無ければ候補にしない |
| V-004 | Flop・Turn とも全員 Check の後の PFR の River の Bet | 今のまま Barrel（§10.3 のとおり） |
| V-024 | Donk した人が次の Street でも打つ Bet | 今のまま（Donk した人が Aggressor になるので、次の Street の Bet は Barrel。同じ Street の Raise を受けた後の Bet は Donk のまま） |
| V-005 | Size の境目（§10 C-5） | 今のまま（50% 未満 Small・100% まで Big・その上 Overbet）。**ⓘ に定義を書く**（回答画面の Size の項目。09 章） |
| V-015・V-016 | ⓘ の Villain の項目 | 投稿は「参加した席と Steal に Fold した Blind」。回答・集計は Read の項目にし、「Over・Under は頻度、Value・Bluff-heavy は打つ手の中身」を書く（09 章） |
| V-036 | Spot Read の注記のカタカナ | 「この Hand の結果を知る前の読みで」（不変条件 2 に合わせる。CLAUDE.md の不変条件 1 も直した） |

## 11. 前の実装・スキーマとの食い違い（2026-09-30 の仕様変更。すべて実装で直した）

1. **Memo**: core（`MEMO_MAX`・`normalizeMemo`）、投稿画面の欄、Preset、表示、規約 §1・§3、CLAUDE.md 不変条件 6、ⓘ、試験（RD・E2E）にある → すべて消す。
2. **Postflop Aggression**: 今は 0〜100%（AFq）の Slider で数を直接入れられる → 0〜4 の 5 分割のボタン（数は無い）。
3. **Hero Image・Read Confidence**: 今は Slider → 5 分割のボタン。Read Confidence は Sample に改名（C-1）。
4. **回答・集計の表示**: 今は「段階のラベルとバー」（前回の指示）→ チップ。中央を出さないと、前回決めた「未入力と中央は別」が見る側からは区別できない（C-2）。
5. **席**: 今は Hero 以外の座っている席すべて → 絞る（B-2）。
6. **表の共有先**: 指示の「DB 側」は、今の作りと不変条件 7 では core の 1 か所（C-9）。
7. **編集不可**: 投稿を編集する機能は今も無い（C-13）。
8. **画面の注記**: 不変条件 1 に反する（C-10）。
9. **新しく要る処理**: Action の列から Spot Read の Action の名前を決める処理（ポーカーのロジックなので core に 1 つ。不変条件 7）と、Spot Read が判断地点より前の実際の Action に合っているかのサーバーでの確認（create-post はハンドを再生しているので、そこで確かめる）。
10. **DB**: マイグレーション `20260930000000_villain_reads_mtt.sql` は dev・本番とも未適用なので、新しいマイグレーションを足さずにこのファイルを直す。`villain_reads` の上限 4KB は、Read が 1 席 3 件×5 席だと足りなくなるおそれ → 8KB に上げる（案）。
11. **Preset**: 今は鍵の名前に版（`wwyd.readPresets.v1.<uid>`）→ 中身に schema version を持たせ、前の形（Memo・Slider）は読み捨てる（まだ公開していないので、利用者の Preset は無い）。
12. **用語**: 15 章 §1.1 と ⓘ（09 章）に Sample・Lean の 4 語・Action の語・条件のタグを足し、Memo・Read Confidence を消す。
13. **MTT**: 「前回の指示のまま」は、そのあとの修正（Stage なし・段階の無い Slider・日本語の 5 つの欄）を含むものとして扱う。
