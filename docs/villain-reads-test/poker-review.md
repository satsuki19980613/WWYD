# ポーカーの専門家としてのレビュー（Villain・MTT の情報 P11）

[villain-reads-test-plan.md](../villain-reads-test-plan.md) §4。レビュー担当 R（Opus 5.5。シニアエンジニア兼プロのポーカープレイヤー）の報告を、リーダーが保存した。
対象は VR1 = `d637b93`。R は読むだけで、挙動は `node --experimental-strip-types -e` で core を import して確かめた（ファイルは作っていない）。
指摘の扱い（重大度・状態）は [findings.md](findings.md) にまとめる。

## 1. プロのポーカープレイヤーの知見（出典つきの要約）

### 1.1 HUD の統計

- **VPIP・PFR**: 6-max のキャッシュで勝っているレギュラーは、おおよそ VPIP 21〜26・PFR 18〜22（例 26/21）。
  VPIP が 35 を超えるとかなり Loose、40 を超えると Fish とされることが多い。VPIP と PFR の差が 8〜10 ポイントを超えると、Preflop の Call が多すぎる目安。
  （[pokercoaching PFR](https://pokercoaching.com/blog/pfr-poker-stat/)、[BlackRain79 PFR](https://www.blackrain79.com/2019/10/what-is-good-pfr-in-poker.html)、[SplitSuit VPIP](https://www.splitsuit.com/the-most-important-poker-stat-vpip)）
- **AF と AFq**: AF は（Bet＋Raise）÷ Call で、Check と Fold を数えない。そのため「タイトで Nuts の時だけ打つ人」と「何でも打つ人」が同じ値になりうる。
  AFq は（Bet＋Raise）÷（Bet＋Raise＋Call＋Fold）の %。HUD では AFq の方が相手の評価に向く、という意見がある。
  （[Upswing AFq](https://upswingpoker.com/glossary/aggression-frequency-afq/)、[CardPlayer](https://www.cardplayer.com/cardplayer-poker-magazines/65881-aussie-millions-24-5/articles/20034-aggression-frequency-vs-aggression-factor)）
- **3-Bet・Fold to 3-Bet**: レギュラーの 3-Bet はおおよそ 6〜10%。12〜15% を超えると非常に広い。
  Fold to 3-Bet は 55% 前後が釣り合いの目安で、30% 以下なら Value 寄りに、65% 以上なら Bluff 寄りに 3-Bet する。
  （[pokercopilot 3-Bet](https://pokercopilot.com/poker-statistics/three-betting)、[deepfold](https://deepfold.co/en/blog/hud-stats-guide)）
- **Fold to Steal（PT4 の定義）**: Steal は CO・BTN・SB の Open Raise。Limp の後の Raise は Steal に数えない。
  Fold to Steal は「Blind にいて、ほかのプレイヤーが関わっていない Steal に Fold した」割合。SB が BTN の Steal に Call すると Steal は「解除」され、BB の Fold は数えない。
  （[PT4 フォーラム t=98452](https://www.pokertracker.com/forums/viewtopic.php?t=98452&p=355559)、[2+2 PT フォーラム](https://forumserver.twoplustwo.com/114/pokertracker/attempt-steal-stat-290037/)）
- **C-Bet・Fold to C-Bet**: C-Bet は Preflop の Aggressor が Flop で打つ Bet。PT4 の Fold to Flop Cbet は「Preflop の最後の Raiser の Flop Bet に Fold した」割合。
  マルチウェイでは IP/OOP の扱いが粗くなる、という注記がある。
  （[pokercopilot C-Bet](https://pokercopilot.com/poker-statistics/continuation-bet)、[PT4 フォーラム](https://pt4.pokertracker.com/forums/viewtopic.php?f=61&t=102672)）
- **サンプル数**: VPIP・PFR は 20 ハンドほどで目安になる。AF・3-Bet・Fold to 3-Bet・Steal・C-Bet は 100 ハンド以上。3-Bet の頻度を掴むには 500〜1000 ハンド、4-Bet は 1000 ハンド以上。
  ハンド数より「機会の数」（最低 5、確かなら 10）を見るべき、とされる。
  （[BlackRain79 サンプル数](https://www.blackrain79.com/2017/11/poker-hud-stat-sample-size.html)、[deepfold](https://deepfold.co/en/blog/hud-stats-guide)）

### 1.2 Action の名前

- **Squeeze**: Open Raise に 1 人以上が Call した後の 3-Bet。（[GTO Wizard](https://gtowizard.com/en/glossary/squeeze/)、[pokercopilot](https://pokercopilot.com/poker-statistics/squeeze-bet)）
- **Donk**: 前の Street の Aggressor ではない OOP のプレイヤーが、Aggressor より先に打つ Bet（典型は Flop の Lead）。（[Upswing Donk](https://upswingpoker.com/donk-bet-lead-flop-strategy/)）
- **Probe**: IP の Aggressor が前の Street で C-Bet しなかった後に、OOP が打つ Bet。GTO Wizard の用語集は Turn だけで定義している。PT4 には Probe の統計がある。
  （[GTO Wizard Probe](https://gtowizard.com/en/glossary/probe-bet/)、[Upswing Probe](https://upswingpoker.com/probe-bet-probing-poker-strategy/)）
- **Delayed C-Bet**: Flop の C-Bet を見送り、Turn で打つ Bet。（[Upswing](https://upswingpoker.com/delayed-continuation-bet-c-bet-strategy/)、[GTO Wizard](https://blog.gtowizard.com/delayed-c-betting/)）
- **Bet vs Missed C-Bet・Float Bet・Stab**: PT4 では、PFR が Check した後の IP の Bet を Float Bet、PFR の Check への Bet を Bet vs Missed Cbet と呼ぶ。
  本アプリの「Bet vs Check」はこの一群に当たる。（[PT4 フォーラム t=55466](https://www.pokertracker.com/forums/viewtopic.php?t=55466)、[Smart Poker Study](https://www.smartpokerstudy.com/probe-bets-float-bets-med-8-class-3-poker-podcast-147/)）
- **Barrel（PT4 の Turn/River Cbet）**: 前の Street で C-Bet・Barrel したプレイヤーが続けて打つ Bet。途中の Street が全員 Check なら普通は Barrel と呼ばない（delayed・stab）。
  上の定義から導いた一般的な理解で、断定する出典は見つけていない。

### 1.3 Bet の大きさ

- ソルバーの解説での目安: Block 10〜25%、Small 約 33%、Medium 50〜70%、Large 75〜100%、Overbet 125% 以上。**50% は普通「Medium」で、「Big」とは呼ばない**。
  （[GTO Wizard C-Bet の大きさ](https://blog.gtowizard.com/the-mechanics-of-c-bet-sizing/)、[GTO Wizard 解の解説](https://blog.gtowizard.com/all-you-need-to-know-about-our-solutions/)）
- **Raise の測り方**: GTO Wizard などは「Call した後の Pot に対する %」で測る（X% の Raise ＝ Call の額＋X%×（Call 後の Pot））。倍数（3x など）はゲーム理論と合わないとして勧めていない。
  X% の Raise は X% の Bet と同じ Pot Odds になる。本アプリの測り方はこれと一致する。
  （[GTO Wizard Raise の計算](https://blog.gtowizard.com/how-to-calculate-raises-in-poker/)、[pokerstrategy](https://www.pokerstrategy.com/strategy/various-poker/calculate-pot-size-raise/)）

### 1.4 Board のテクスチャ

- 分類の軸: 高いカード（A・K・Broadway・Middle・Low）、Suit（Rainbow・Two-tone・Monotone）、Pair（Unpaired・Paired・Trips）、Connectivity、Wet・Dry。
  （[GTO Wizard Board texture](https://gtowizard.com/en/glossary/board-texture/)、[GTO Wizard Flop heuristics](https://blog.gtowizard.com/flop-heuristics-ip-c-betting-in-cash-games/)）
- Turn の種類は Brick・Overcard・Flush 完成・Straight 完成・Board Pair の 5 つで考えるのが一般的。
  （[Upswing Brick の Turn](https://upswingpoker.com/c-bet-turn-barreling-bricks/)、[vip-grinders](https://www.vip-grinders.com/poker-strategy/double-barreling/)）

### 1.5 Exploit の読みの表し方

- プロの読みは「頻度」（Overfold・Underbluff、やりすぎ・やらなさすぎ）と「中身」（Value-heavy・Bluff-heavy、Polar・Linear）の 2 つの軸で語られる。
  例: River の大きい Bet は Underbluff が多いので Bluff Catcher は Fold（Overfold が正しい）、50NL の BB の 3-Bet は Linear で Bluff が少ない。
  （[2+2 Population Tendencies](https://forumserver.twoplustwo.com/69/online-no-limit-holdem-cash/population-tendencies-exploits-1796608/)、[Saulo Costa](https://saulocosta.poker/12-the-ultimate-guide-to-exploitative-bluffcatching/)、[Phil Galfond](https://www.philgalfond.com/articles/how-understanding-your-player-pool-can-boost-your-winrate)）

### 1.6 MTT

- Bubble Factor は、賞金が Top-heavy だと低く、Flat だと高い（Flat は 5 を超え、中くらいのスタックで 10 を超えることもある）。Top-heavy では優勝の価値が大きく、チップを集める方に傾く。
  （[GTO Wizard 賞金の構造と ICM](https://blog.gtowizard.com/how-payout-structures-impact-icm/)、[GTO Wizard Bubble Factor](https://blog.gtowizard.com/what-is-the-bubble-factor-in-poker-tournaments/)、[bbzpoker ICM](https://bbzpoker.com/the-complete-guide-to-independent-chip-model-icm/)）
- 1 位の取り分は多くの大会で 20〜35%（主要な大会は 25〜30%）。WSOP Main Event は約 10〜15% で Flat な例。**大人数の大会ほど 1 位の割合は下がる**ので、1 位の % だけで分けると人数の多い大会が Flat 側に寄る。
  （[riverodds](https://riverodds.app/poker-payout-structure/)。数値の出典の確かさは中）
- ストラクチャー: 開始スタックが 80〜150bb で普通、それより多いと Deep、少ないと Turbo（Blind の上がる間隔が短い）。
  （[BetMGM](https://poker.betmgm.com/en/blog/poker-guides/how-poker-tournament-chip-structures-work/)、[pokerskill Turbo](https://www.pokerskill.com/poker-glossary/turbo/)）

## 2. レビュー（R-01〜R-05）

findings.md の ID を括弧に付ける。

### 2.1 R-01 ポーカーとしての正しさ

| # | 内容 | R の重大度の案 | 確信度 |
|---|---|---|---|
| R01-1 | Steal に SB が Call した後の BB の Fold が Fold to Steal になる（`readActions.ts:148`。`villainSeats` も同じ）。例 `UTG..CO f, BTN r2.5, SB c, BB f`。PT4 の定義では Steal は「解除」されている。直す案: `callersAfterOpen === 0` を条件に足す。直さない案: §10.3 の字義どおりとし、ⓘ に書く | S3（仕様への意見） | 挙動は高・直すべきかは中 |
| R01-2 | 前の Street で All-in した Aggressor への Bet が Donk になる（`readActions.ts:171-177`。`aggInHand` が All-in を除かない）。例: BTN 20bb が Flop で All-in、SB・BB が Call、Turn の SB の Bet → `donk`。Side Pot への Lead は Donk ではない | S3 | 高 |
| R01-3 | Flop・Turn とも全員 Check の後、PFR の River の Bet が Barrel になる（§10.3 の意図どおり。T1-01 にもある）。プロの感覚では Barrel ではない | 仕様への意見（S4） | 中 |
| R01-4 | 50% Pot が Big になる（§10 C-5）。ソルバーの解説では 50% は Medium で、Big は 75〜100%。いちばんよくある Half-pot の C-Bet が Big と出る。Raise の測り方は正しい | 仕様への意見（S4） | 中 |
| R01-5 | PFR の段階の境目（8/14/20/26）で、レギュラーの PFR 18〜22 が Standard と High に割れる。直す案 10/16/23/30。VPIP の境目は目安と合う | S4 | 中 |
| R01-6 | Sample の段階の並び（Long と HUD Stats はどちらが多いとは限らない） | S4 | 中 |
| R01-7 | 18 章 B-4 の Connectivity の定義文が Paired Board（8-8-9）に合わない。判定のコードは無く、文書だけ | S4 | 高 |
| R01-8 | Prize Structure の目安（1 位の %）は大会の人数に左右される | 仕様への意見（S4） | 低〜中 |

`node -e` で確かめて問題が無かったもの: Squeeze（Call 1 人）、Opener の Fold → Fold to 3-Bet、Limp の後の Iso Raise（候補なし）と Limper の再 Raise（3-Bet）、
BB の Raise over Limps の後の Flop の Bet（C-Bet）、ヘッズアップ（BTN が SB を払う形）の Fold to Steal と Limp、4 人（CO が最初）の Fold to Steal、
マルチウェイの Donk、不完全な All-in の Raise（Check-Raise）、Raise の Size の測り方。

### 2.2 R-02 集合知の道具としての有用性

1. **Range を GTO から Exploit へ変えられるか**: おおむね変えられる。Spot Read は実際の Action に Lean を付ける形で、プロの読みの 2 つの軸（頻度と中身）にそのまま対応する。Size は実際の額から自動で入るのでぶれない。
   弱い点は、Over/Under・Small/Big・Aggression・Sample の定義が画面にも ⓘ にも無く、投稿者と回答者の解釈がずれうること。
2. **足りない情報・誤解を招く表示**: 50% が Big（R01-4）、2 回 Check の後の River の Barrel（R01-3）、Steal の解除（R01-1）、Sample の並び（R01-6）、Prize の目安（R01-8）、
   Limp のポットで最初に動く席の Bet（Lead）を Spot Read にできない（§10.3 で決めたもの）、Calling Station の読みは「Fold to Bet → Under」と裏返して書くしかない。
3. **全体の傾向と Read の矛盾**: エラーにしないのは妥当。むしろ「C-Bet → Over」と「C-Bet → Bluff-heavy」のように、ほぼ同じ読みを Lean の選び方で書き分けられてしまい、集計のキー（action × lean）がばらつく。
   ⓘ で「Over/Under は頻度、Value/Bluff は打ったときの中身」と定義するのを勧める。
4. **入力の手間**: 妥当（全項目任意、1 行に折りたたみ、Spot Read は Lean を押すだけ、Preset）。Postflop Aggression の 5 段は HUD の数を持つ人に変換の手間。General Read の条件はスマホでボタンが多い。

### 2.3 R-03 答えの漏れと不正な使い方

1. **後の Action・Villain のハンド・答えの推測**: 技術的な漏れは無い。Spot Read の候補は `classifyActions(actions.slice(0, spotIndex))`、サーバーの `verifyReads` も同じ候補と照らす。登録できる席は Preflop だけで決まる。
   `get_post_detail` は `villain_reads` を加えても、未回答の人に後の Action・Board・Hero のハンドを返さない。
   残る余地は投稿者の選び方（結果を知ったうえでの Lean、後の Board を暗示する General Read）で、注記で抑えるだけ。仕様の想定内。
2. **自由記述がタイトルだけになったか**: なった（Read はすべて列挙値、全体の傾向は整数。create-post は正規化した値だけを保存。Preset の名前は端末だけ）。
3. **個人を特定できる情報の埋め込み**: 文字列は埋め込めない。正確な MTT の数（エントリー数・残りの人数・順位・Avg Stack）と投稿の日時から、大会と局面を絞り込めるおそれがある（R03-1。仕様への意見）。
4. **回答の前に Villain の情報を返すこと**: 妥当（回答の手がかりが目的。`post_hands` は直接読めず RPC だけ）。

### 2.4 R-04 シニアエンジニアとしてのコードレビュー

| # | 内容 | R の重大度の案 | 確信度 |
|---|---|---|---|
| R04-1 | 同じ Street の 2 回目の Raise の Spot Read が選べない（`spotCandidateOf` がいつも最後の候補を返す。SpotDraft が Street・Action しか持たない）。送る Size も 2 つ目のもの | S3 | 高（コードの読み） |
| R04-2 | Spot を変えても Spot Read の `pick` の初期値が追従しない（`VillainSection.tsx:255`） | S3 | 高（コードの読み） |
| R04-3 | 閉じた席の要約が、送られない Spot Read（Spot を変えて候補から外れたもの）を「1 Read」と数える（`readsModel.ts:445`） | S3 | 高 |
| R04-4 | General Read を消すと「Board · Size」の開閉の状態が入れ替わる（`key={i}`） | S4 | 中 |
| R04-5 | 使っていない export `STEP_DEF` | S4 | 高 |
| R04-6 | `villainContext` を描画ごとと `buildSubmission` で呼ぶ（体感上の問題は無い） | S4 | — |
| R04-7 | `readActions.test.ts` に、ヘッズアップ・R01-1・R01-2・R04-1・River の Barrel の試験が無い | S4 | — |

問題が無かったもの: クライアントとサーバーの一致（`buildSubmission` が送る前に `validateInput`＋`verifyPost` を通す）、create-post は正規化した値を保存する、
DB の上限 8KB に対して最大の組み合わせでも約 3.8KB、`post_hands` は authenticated に直接の select を与えていない、`insert_post` は authenticated から実行できない。

### 2.5 R-05 資料と実装の一致

| # | 内容 | R の重大度の案 | 確信度 |
|---|---|---|---|
| R05-1 | ⓘ の「参加した席だけ」が、Fold to Steal の Blind も登録できることと合わない（`infoSections.ts:68`・09 章） | S3 | 高 |
| R05-2 | ⓘ に、回答者が Read を読むのに要る定義（Over/Under と Value/Bluff の違い、Size の境目、Aggression の意味、Sample の目安、「スポットの順位」がチップの順位であること）が無い | S3 | 高 |
| R05-3 | CLAUDE.md の不変条件 1 の例外に、MTT のモーダルの「順位 / 残りの人数」の見出しが無い（18 章 §1 にはある） | S4 | 中 |
| R05-4 | MTT の表示の `entries`・`left` が 15 章の用語の表に無い | S4 | 中 |
| R05-5 | High Card のタグの表記（18 章「Q-high・J-high」とコード「Q/J-high」） | S4 | 高 |
| R05-6 | B-4 の定義文（R01-7 と同じ） | S4 | 高 |
| R05-7 | MTT の人数の大小の誤りは「MTT の情報を確認してください」だけで、どの欄かを示さない | S4 | 高 |

## 3. 仕様への意見（18 章 §10 の決定を変える提案）

- C-5: Size の境目（R01-4）
- §10.3: Fold to Steal に Call が入った場合（R01-1）
- §10.3: 前の Street が全員 Check の後の River の Barrel（R01-3）
- §2.4: Prize Structure の目安（R01-8）
- §10.3: Limp のポットで最初に動く席の Bet を候補にしない（R-02 の 2）
- MTT の数の粒度（R03-1）

## 4. R が読んだもの・調べた出典

- 読んだファイル: `CLAUDE.md`、`docs/villain-reads-test-plan.md`、18 章・15 章（§1〜3）・09 章（Villain の部分）、plan.md（決定ログの P11 の行）、
  `packages/core/src/poker/{readActions,state,replay,testHelpers}.ts`・`constants.ts`・`post/{reads,verifyPost,validateInput}.ts` と試験の名前、
  `packages/app/src/reads/*`・`post/draft.ts`・`screens/NewPostScreen.tsx`・`answer/postDetail.ts`・`info/infoSections.ts`・`legal/*`、
  `packages/functions/src/createPost/{handler,payload,index}.ts`、`db/migrations/20260930000000_villain_reads_mtt.sql`・`20260927000007_rls.sql`
- 確かめていないもの: 画面の描画、R04-1〜R04-4 の画面での再現、E2E・pgTAP・Vitest の実行
- 出典（上の本文のリンクのほか）: [pokerstrategy MTT の賞金](https://www.pokerstrategy.com/strategy/mtt/payout-structures-mt-sngs/)（例の記述が食い違っていたので根拠にしていない）、
  [PioSOLVER の文書](https://piosolver.com/docs/viewer/postflop_tree_building/)（Raise の測り方の明記は無かった）
