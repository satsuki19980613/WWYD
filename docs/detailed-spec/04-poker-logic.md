# 04 ポーカーロジック

> **2026-09-29: 出題を Hero の手番に変え、Villain の概念をなくした**（[16 章](16-hero-spot.md)）。この章の Villain・停止位置・派生メタの記述より 16 章を優先する。

仕様書 §6 と §5.2.6〜5.2.8 を、実装とテストができる形にしたもの。実装は `packages/core/src/poker/` に
**1 つだけ**置き、フロントエンド（スポット投稿・リプレイ・回答・集計）と Edge Function `create-post`
（03 章）が同じコードを使う。

---

## 1. 金額の表現【Q-5】

- 内部表現は **mbb（ミリ bb）の整数**。1bb = 1000mbb。浮動小数を計算に使わない。
- 入力（SB・アンティ・スタック・ベット額・レイズ額・回答のサイズ）は小数第 3 位まで受け付ける。第 4 位以下があれば入力エラー。
- 表示は bb で、末尾の 0 を削る（`2.500` → `2.5`、`100.000` → `100`）。
- DB では `numeric(9,3)`（bb）で保存する（01 章）。TS ↔ DB の変換は `mbbToBb` / `bbToMbb` の 1 箇所で行う。
- BB は 1bb 固定（= 1000mbb）【Q-4】。

## 2. 型

```ts
type Pos = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
type Street = 'pf' | 'flop' | 'turn' | 'river';
type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
type Action = { street: Street; pos: Pos; type: ActionType; to?: Mbb }; // to は bet / raise のみ（そのストリートでの合計額）

type HandSetup = { sb: Mbb; bb: Mbb; ante: Mbb; stacks: Record<Pos, Mbb> };

type State = {
  street: Street;
  pot: Mbb;                        // 回収済みポット（前のストリートまでのベットとアンティ）
  bets: Record<Pos, Mbb>;          // このストリートのベット額（フォールドした席の分も回収まで残る）
  stacks: Record<Pos, Mbb>;        // 残りスタック
  folded: Set<Pos>;
  allin: Set<Pos>;
  currentBet: Mbb;                 // 現在ベット額
  minRaise: Mbb;                   // 直前の有効なレイズ幅（最小レイズ幅）
  actedThisStreet: Set<Pos>;       // このストリートでアクション済みの席
  actedSinceFullRaise: Set<Pos>;   // 最後の有効なレイズ以降にアクション済みの席（§6.2, 6.3）
  lastActor: Pos | null;           // 直前にアクションした席
  lastAction: Partial<Record<Pos, Action>>; // 表示用（このストリートの直前のアクション）
};
```

順序定数:

- `ORDER_PF = [UTG, HJ, CO, BTN, SB, BB]`
- `ORDER_POST = [SB, BB, UTG, HJ, CO, BTN]`

### 2.1 人数（2〜6 人。2026-09-29 さつきの決定。仕様書の「6max 固定」を改める）

| 人数 | 席（`SEATS_BY_COUNT`） |
|---|---|
| 6 | UTG, HJ, CO, BTN, SB, BB |
| 5 | HJ, CO, BTN, SB, BB |
| 4 | CO, BTN, SB, BB |
| 3 | BTN, SB, BB |
| 2 | BTN, BB（ヘッズアップ。BTN が SB を払う） |

- 早い席から削る。BTN と BB はどの人数にもある。
- **空席はスタック 0** で表す（`HandSetup.stacks` は 6 席のまま）。空席は初期状態で `folded` に入れ、アンティもブラインドも払わない。
  `State.seated` に座っている席（プリフロップの順）を持つ（表示用）。
- 投稿の JSON・DB の `stacks` は**座っている席のキーだけ**を持つ（キーの集合が上の表のどれかと一致しなければ `invalid_settings`）。
  Hero・判明したハンドの席は座っている席に限る。
- ヘッズアップ: SB の席が空いているので BTN が SB を払う。プリフロップは `ORDER_PF` の順で BTN → BB、フロップ以降は
  `ORDER_POST` の順（SB が空き）で BB → BTN になり、特別な分岐は要らない。

## 3. 初期状態（§6.2）

1. `pot = 0`、全席 `bets = 0`、`stacks = 入力値`。
2. **アンティ**: 座っている各席 `a = min(ante, stack)` を徴収して `pot += a`。徴収後にスタックが 0 の席は `allin` に入れる。空席（§2.1）は `folded` に入れる。
3. **ブラインド**: SB（空席ならボタン。§2.1）は `min(sb, stack)`、BB は `min(bb, stack)` を `bets` に置く。ポスト後にスタックが 0 なら `allin`。
4. `street = pf`、`currentBet = bb`（BB が不足でポストした額が bb 未満でも bb）、`minRaise = bb`。
5. `actedThisStreet = ∅`、`actedSinceFullRaise = ∅`、`lastActor = BB`（次の席探索が UTG から始まるように）。

> ブラインドのポストはアクションではない。BB はプリフロップで未アクションのまま始まる（= BB オプションが生じる）。

## 4. 局面の判定（`status`）

各アクションの適用後（と初期状態）に、次の順で判定する。**この順序が重要**（§6.4 の「アクション可能な席が 1 人以下で
ベット額が揃っている場合はランアウト」を、次の席探索より先に見る）。

用語: `active` = フォールドしていない席、`canAct` = `active` かつ `allin` でない席。

1. `|active| ≤ 1` → **`over`**（ハンド終了・ポット獲得。勝者は残った 1 席）。
2. `|canAct| = 0`、または `|canAct| = 1` かつ その席の `bets ≥ currentBet` → **`runout`**
   （ボードを 5 枚まで配ってショーダウン。リバー終了後なら即ショーダウン）。
3. `nextActor(state)` が見つかる → **`act`**（その席の手番）。
4. それ以外 → ストリート終了。`street = river` なら **`showdown`**、そうでなければ **`streetEnd`**（次のストリートへ。ボード入力を要求）。

### 4.1 次にアクションする席（`nextActor`、§6.4）

`order = street === 'pf' ? ORDER_PF : ORDER_POST`。`lastActor` の次の席から順に 1 周見て、最初に次を満たす席:

- `canAct` に含まれる、かつ
- `actedThisStreet` に含まれない、または `bets < currentBet`

`lastActor = null`（ポストフロップの開始）のときは `order[0]` から見る。

### 4.2 ストリートの進行（`advance`）

`pot += Σ bets`、全席 `bets = 0`、`street` を 1 つ進める、`currentBet = 0`、`minRaise = bb`、
`actedThisStreet = ∅`、`actedSinceFullRaise = ∅`、`lastActor = null`、`lastAction = {}`。

### 4.3 ボードの必要枚数

| 到達したストリート | 必要枚数 |
|---|---|
| pf | 0 |
| flop | 3 |
| turn | 4 |
| river | 5 |
| ランアウト | 5 |

## 5. 合法アクション（`legal(state, p)`、§6.3）

```
toCall      = currentBet − bets[p]
stack       = stacks[p]
maxTo       = bets[p] + stack                         // オールイン【Q-7】
othersCanAct = |canAct \ {p}| > 0
reopened    = p ∉ actedSinceFullRaise
```

| 状況 | fold | check | call | bet | raise |
|---|---|---|---|---|---|
| `toCall > 0` | ○ | × | ○（額 = `min(toCall, stack)`） | × | `stack > toCall ∧ othersCanAct ∧ reopened` |
| `toCall = 0 ∧ currentBet = 0` | × | ○ | × | `stack > 0 ∧ othersCanAct` | × |
| `toCall = 0 ∧ currentBet > 0`（BB オプション等） | × | ○ | × | × | `stack > 0 ∧ othersCanAct ∧ reopened` |

- `minTo`（raise）= `min(currentBet + minRaise, maxTo)`
- `minTo`（bet）= `min(bb, maxTo)`
- `to` の範囲は `minTo ≤ to ≤ maxTo`。`maxTo` は常に合法（オールイン）。
- `toCall = 0` のフォールドは合法でない（仕様書 §6.3 の表に従う）。

## 6. アクションの適用（`apply(state, action)`）

前提: `status = act` かつ `action.pos = nextActor`、`action.street = state.street`、`action.type` が合法、
`to` の有無と範囲が正しい。満たさなければ**エラー**（03 章のエラーコード）。

| 種別 | 処理 |
|---|---|
| fold | `folded += p` |
| check | 何もしない |
| call | `amt = min(toCall, stack)`、`stacks[p] −= amt`、`bets[p] += amt` |
| bet / raise | `add = to − bets[p]`、`stacks[p] −= add`、`bets[p] = to`。`size = to − currentBet`。`size ≥ minRaise` なら**有効なレイズ**: `minRaise = size`、`actedSinceFullRaise = ∅`。そうでなければ**不完全レイズ**（オールイン時のみ起こる）: `minRaise` も `actedSinceFullRaise` も変えない。どちらでも `currentBet = to` |

共通の後処理: `actedThisStreet += p`、`actedSinceFullRaise += p`、`lastActor = p`、`lastAction[p] = action`。
fold 以外で `stacks[p] = 0` になったら `allin += p`。

> `bet` は `currentBet = 0` のときだけ、`raise` は `currentBet > 0` のときだけ合法。BB オプションのレイズは `raise`（§6.3、§7.2）。

## 7. ハンドの再生（`replay(setup, actions, board)`）

1. 初期状態を作る。
2. 各アクションについて: `status` が `streetEnd` の間は `advance` する（ボードの枚数は最後にまとめて検査）。
   `status` が `act` でなければエラー（`action_after_end`）。`apply` する。
3. 全アクション適用後、`streetEnd` なら `advance` を繰り返す…のではなく、**最終状態の `status` が
   `over` / `showdown` / `runout` のいずれか**でなければ `hand_incomplete`。
   - `streetEnd` で止まっている（次のストリートのアクションが無い）場合も `hand_incomplete`。
4. ボード枚数 = 最後に到達したストリートの必要枚数（`runout` なら 5）。一致しなければ `board_mismatch`。
5. 結果: `{ states[], final, result: {kind: 'over', winner} | {kind: 'showdown', seats} }`。

スポット投稿画面（入力中）は同じ関数の「途中状態」を使い、`status` を UI の表示に使う
（`act` → アクションボタン、`streetEnd` / `runout` → ボード入力、`over` / `showdown` → 終了表示）。

## 8. スポットの候補と停止位置（§5.2.7, 6.5）

### 8.1 候補

Hero の**フロップ以降**のアクション `i`（`street ≠ pf` かつ `type ≠ fold`）ごとに、区間 `S(i)` = `i+1` から「次に Hero がアクションする直前」
（無ければハンドの最後）までのアクション。`S(i)` が空でなければ候補。
Villain の候補 = `S(i)` に現れる席（重複を除き、現れた順）。フォールドした席も含む。

**プリフロップは出題しない**（2026-09-28 さつきの決定。仕様書 v0.2 の「プリフロップを対象に含める」を改める）。
Hero がフロップ以降にアクションする場面だけを投稿できる。サーバー（create-post）も同じ `spotCandidates` で検証するので、
プリフロップの `spot_index` は `invalid_spot` になる。

### 8.2 停止位置と派生メタ

`stop = S(i)` の中で Villain が最初に現れる添字。停止位置の状態 = `actions[0..stop)` を適用し、
さらに `actions[stop].street` に達するまで `advance` した状態（ストリートをまたぐ場合を含む）。

| 派生メタ | 計算 |
|---|---|
| `street` | `actions[stop].street` |
| `keys` | `legal(state, villain)` から: `toCall > 0` なら `['fold','call']`、そうでなければ `['check']`。bet または raise が合法なら `'s1'` を追加 |
| `s1_label` | `'s1' ∈ keys` のとき、`currentBet = 0` なら `'bet'`、それ以外 `'raise'`。無ければ null |
| `min_to` / `max_to` | `'s1' ∈ keys` のとき `legal` の `minTo` / `maxTo`。無ければ null |
| `pot_base` | §9 のポット基準 |
| `effective_stack` | `min(stacks_start[hero], stacks_start[villain])`（ハンド開始時のスタック）【Q-6】 |

回答対象は停止位置の Villain の 1 アクションのみ。Villain の実際のアクションのキーは
`fold→fold, check→check, call→call, bet/raise→s1`。

## 9. % pot（§6.6）

```
call     = min(toCall, stacks[villain])            // toCall = 0 なら 0
potBase  = pot + Σ bets + call
bet   (currentBet = 0): to = potBase × p
raise (currentBet > 0): to = currentBet + potBase × p
```

- 丸め: 厳密な有理数で計算し、**0.01bb（10mbb）単位に四捨五入**（0.5 は切り上げ）してから `[minTo, maxTo]` に収める【Q-5】。
  整数演算: `num = currentBet×100 + potBase×pct`（mbb × %）、`to = floor((num + 500) / 1000) × 10`。
- プリセットは 33 / 50 / 75 / 125%、オールイン = `maxTo`。初期値は 50%。
- 逆算（表示用）: `pct = (to − currentBet) / potBase × 100`（bet は `currentBet = 0`）。表示は整数に四捨五入。`to = maxTo` は「オールイン」と表示する。

---

## 10. テストケース表

すべて `packages/core` の自動テストにする（Vitest、テーブル駆動）。表記:

- 既定の設定 **S100** = SB 0.5 / BB 1 / アンティ 0 / 全員 100bb。金額はすべて bb。
- アクション列は `UTG f, HJ f, CO f, BTN r2.5, SB f, BB c` のように書く（f=fold, x=check, c=call, b=bet, r=raise、数字は to）。
- 「合法」は `{fold, check, call(額), bet[min,max], raise[min,max]}` のうち取れるもの。

### 10.1 初期状態（INIT）

| ID | 設定 | 期待 |
|---|---|---|
| INIT-01 | S100 | pot 0、bets SB 0.5 / BB 1、stacks SB 99.5 / BB 99 / 他 100、currentBet 1、minRaise 1、次 UTG、UTG 合法 = fold, call 1, raise[2, 100] |
| INIT-02 | S100 + アンティ 0.125 | pot 0.75、stacks UTG〜BTN 99.875 / SB 99.375 / BB 98.875、UTG raise の max 99.875 |
| INIT-03 | アンティ 0.125、UTG 100→**0.1** | UTG は 0.1 を払いスタック 0 → allin。pot 0.725。次 HJ |
| INIT-04 | アンティ 0.125、SB **0.125** | SB はアンティで 0 → allin、bets SB 0。pot 0.75、currentBet 1、次 UTG |
| INIT-05 | S100、SB **0.3** | bets SB 0.3、SB allin |
| INIT-06 | S100、BB **0.6** | bets BB 0.6、BB allin、currentBet **1**（bb のまま）、UTG の call 額 1 |
| INIT-07 | アンティ 0.125、BB **1** | BB はアンティ後 0.875、それを全額ポストして allin。bets BB 0.875、currentBet 1 |

### 10.2 合法アクション（LEGAL）

| ID | 設定・アクション列 | 期待 |
|---|---|---|
| LEGAL-01 | S100、HJ **2.5**。`UTG r3` | HJ 合法 = fold, call 2.5（オールイン）。raise なし（stack ≤ toCall） |
| LEGAL-02 | S100。`UTG..CO f, BTN r2.5, SB f, BB c` 後のフロップ | BB 合法 = check, bet[1, 97.5]。fold / call なし |
| LEGAL-03 | S100、BB **3.1**。`UTG..CO f, BTN r2.5, SB f, BB c` 後のフロップ（BB 残り 0.6） | BB 合法 = check, bet[0.6, 0.6]（最小ベット BB に満たないので全額） |
| LEGAL-04 | S100、BB **150**。`UTG r100`（オールイン）, `HJ..SB f` | BB 合法 = fold, call 99。raise なし（他にアクション可能な席がない） |
| LEGAL-05 | S100。`UTG r3` の後、HJ が `x` | エラー `illegal_action`（toCall > 0 で check） |
| LEGAL-06 | S100。フロップ先頭で BB が `r3` | エラー `illegal_action`（currentBet = 0 は bet） |
| LEGAL-07 | S100。UTG が `b3` | エラー `illegal_action`（プリフロップは raise） |
| LEGAL-08 | S100。フロップで BB `x` の後 BTN が `c` | エラー `illegal_action`（toCall = 0 で call） |
| LEGAL-09 | S100。BB オプションの局面（BBOPT-01）で BB が `f` | エラー `illegal_action`（toCall = 0 で fold） |

### 10.3 レイズと最小レイズ（RAISE）

| ID | アクション列（S100） | 期待 |
|---|---|---|
| RAISE-01 | `UTG r3` | currentBet 3、minRaise 2、HJ raise[5, 100] |
| RAISE-02 | `UTG r3, HJ r9` | minRaise 6、CO raise[15, 100] |
| RAISE-03 | `UTG r2` | 有効（幅 1 = minRaise）。minRaise 1、HJ raise[3, 100] |
| RAISE-04 | `UTG r1.5` | エラー `amount_out_of_range`（min 2 未満でオールインでもない） |
| RAISE-05 | `UTG r100.5` | エラー `amount_out_of_range`（max 100 超） |
| RAISE-06 | UTG **1.8**。`UTG r1.8` | 合法（minTo = min(2, 1.8) = 1.8）。不完全（幅 0.8 < 1）。minRaise 1 のまま。HJ は未アクションなので raise[2.8, 100] |
| RAISE-07 | `BTN r2.5, SB f, BB c`、フロップ `BB b3` | minRaise 3、BTN raise[6, 97.5] |
| RAISE-08 | BB **3.1**。`BTN r2.5, SB f, BB c`、フロップ `BB b0.6`（オールイン） | currentBet 0.6、minRaise **1 のまま**（不完全ベット）、BTN 合法 = fold, call 0.6（他にアクションできる席がないので raise なし。§5・LEGAL-04 と同じ）【Q-24】 |
| RAISE-08b | BB **3.1**。`UTG..HJ f, CO r2.5, BTN c, SB f, BB c`、フロップ `BB b0.6`（オールイン） | minRaise **1 のまま**、CO 合法 = fold, call 0.6, raise[1.6, 97.5] |

### 10.4 不完全レイズ（INC）

| ID | 設定・アクション列 | 期待 |
|---|---|---|
| INC-01 | S100、BB **3.4**。`UTG..CO f, BTN r2.5, SB f, BB r3.4`（オールイン） | BB の r3.4 は合法（minTo = min(4, 3.4)）。不完全（幅 0.9 < 1.5）。currentBet 3.4、minRaise 1.5。**BTN 合法 = fold, call 0.9 のみ（raise なし）**。続けて `BTN c` → `runout` |
| INC-02 | S100、HJ **4**。`UTG r3, HJ r4`（オールイン） | 不完全。currentBet 4、minRaise 2。CO（未アクション）raise[6, 100]。続けて `CO f, BTN f, SB f, BB f` → **UTG 合法 = fold, call 1 のみ** |
| INC-03 | S100、HJ **4**、CO **5**。`UTG r3, HJ r4, CO r5, BTN f, SB f, BB f` | CO の r5 も不完全。UTG 合法 = fold, call 2 のみ（不完全レイズの累積でも再オープンしない）【Q-8】 |
| INC-04 | S100、HJ **4**。`UTG r3, HJ r4, CO r8, BTN f, SB f, BB f` | CO の r8 は有効（幅 4 ≥ 2）→ 再オープン。minRaise 4。UTG 合法 = fold, call 5, raise[12, 100] |

### 10.5 BB オプション（BBOPT）

| ID | 設定・アクション列 | 期待 |
|---|---|---|
| BBOPT-01 | S100。`UTG..BTN f, SB c` | BB 合法 = check, raise[2, 100]。pot_base 2（プリフロップはスポットにしないが、% pot の計算は同じ）。% pot: 33% → 1.66 → **2**（min に丸め）、50% → 2、75% → 2.5、125% → 3.5 |
| BBOPT-02 | S100。`UTG c, HJ c, CO f, BTN f, SB c`（§6.6 例 2） | BB: pot_base 4、currentBet 1、min to 2。50% → **3**、33% → 2.32、125% → 6 |
| BBOPT-03 | BBOPT-01 の局面で BB が `b3` | エラー `illegal_action`（BB オプションは raise） |
| BBOPT-04 | S100、SB **1**。`UTG..BTN f, SB c`（オールイン） | canAct = {BB} で BB の bets 1 = currentBet → **`runout`**（BB はアクションしない） |
| BBOPT-05 | BBOPT-01 の後 `BB x` | `streetEnd` → フロップ。pot 2、次 SB |

### 10.6 アンティでのオールイン（ANTE）

| ID | 設定・アクション列 | 期待 |
|---|---|---|
| ANTE-01 | INIT-03 の設定。`HJ r2.5, CO f, BTN f, SB f, BB f` | UTG（allin）は手番を飛ばされる。BB f の後: active = {UTG, HJ}、canAct = {HJ}、HJ の bets 2.5 ≥ currentBet 2.5 → `runout` |
| ANTE-02 | INIT-04 の設定。`UTG f, HJ f, CO f, BTN f` | active = {SB, BB}、canAct = {BB}、BB の bets 1 = currentBet → `runout`（BB はアクションしない） |
| ANTE-03 | アンティ 0.125、UTG〜SB が各 **0.1**、BB 100 | 5 席が allin、pot 0.625、BB が 1 をポスト。アクション 0 件で `runout` |

### 10.7 ランアウト（RUN）

| ID | 設定・アクション列 | 期待 |
|---|---|---|
| RUN-01 | S100。`UTG r100, HJ..SB f, BB c` | `runout`、必要ボード 5 枚。終了時の回収後ポット 200.5 |
| RUN-02 | S100。`BTN r2.5, SB f, BB c`、フロップ `BB b97.5, BTN c` | `runout`、ボード 3 枚 → 5 枚必要 |
| RUN-03 | S100、UTG **50**。`UTG r50, HJ f, CO f, BTN c, SB f, BB f` | canAct = {BTN}、bets 50 = currentBet → `runout` |
| RUN-04 | S100。`UTG r100, HJ..SB f` | canAct = {BB} だが bets 1 < 100 → `act`（BB）。`BB f` → `over`（勝者 UTG） |
| RUN-05 | S100、UTG **20**。`UTG r20, HJ f, CO f, BTN c, SB f, BB c` | canAct = {BTN, BB} → `streetEnd`。フロップ: pot 60.5、次 BB、BB 合法 = check, bet[1, 80] |
| RUN-06 | RUN-05 の続き。フロップ `BB x, BTN x`、ターン `BB x, BTN x`、リバー `BB x, BTN x` | `showdown`（UTG, BTN, BB の 3 人） |

### 10.8 ストリートとハンドの終了（END）

| ID | 設定・アクション列 | 期待 |
|---|---|---|
| END-01 | S100。`UTG f, HJ f, CO f, BTN f, SB f` | `over`、勝者 BB（BB はアクション 0 件）。ボード 0 枚 |
| END-02 | S100。`BTN r2.5`（UTG〜CO f 済み）`, SB f, BB c` | `streetEnd`。advance 後: pot 5.5、bets 全 0、minRaise 1、次 BB |
| END-03 | END-02 の続き。フロップ `BB x, BTN x`、ターン `BB x, BTN x`、リバー `BB x, BTN x` | `showdown`、ボード 5 枚 |
| END-04 | END-02 の続き。…リバー `BB x, BTN b5, BB f` | `over`、勝者 BTN、ボード 5 枚 |
| END-05 | END-01 の後にさらに `BB x` | エラー `action_after_end` |
| END-06 | END-02 で止める（フロップのアクションなし） | 再生はエラー `hand_incomplete` |
| END-07 | END-04 だがボード 4 枚 | エラー `board_mismatch` |
| END-08 | END-01 だがボード 3 枚 | エラー `board_mismatch`（プリフロップで終了なら 0 枚） |

### 10.9 マルチウェイ（MW）

共通のハンド **H-MW**（S100、Hero = CO）:

```
0 UTG f   1 HJ f   2 CO r2.5   3 BTN c   4 SB f   5 BB c
flop: 6 BB x   7 CO b3   8 BTN c   9 BB r12   10 CO c   11 BTN f
turn: 12 BB x   13 CO x
river: 14 BB x   15 CO x   → showdown（BB, CO）
```

| ID | 対象 | 期待 |
|---|---|---|
| MW-01 | H-MW のフロップ開始 | 次 BB（SB はフォールド済み。順序 SB→BB→UTG→HJ→CO→BTN） |
| MW-02 | 候補 | `7:[BTN, BB]`、`10:[BTN, BB]`、`13:[BB]`。2 はプリフロップ、15 は後続なしで候補外 |
| MW-03 | スポット 7 / Villain BB | stop = 9（間の `8 BTN c` をリプレイに含む）。フロップ、pot 8、bets CO 3 / BTN 3、BB toCall 3。keys `fold, call, s1`、raise、min 6、max 97.5、pot_base 17、実際 = s1（r12） |
| MW-04 | スポット 7 / Villain BTN | stop = 8。pot_base 14、min 6、max 97.5、実際 = call |
| MW-05 | スポット 10 / Villain BTN | stop = 11。currentBet 12、minRaise 9、BTN toCall 9、BTN は再オープン済み（BB の r12 が有効）→ keys `fold, call, s1`、min 21、max 97.5、pot_base 44、実際 = fold |
| MW-06 | スポット 10 / Villain BB | stop = 12（`11 BTN f` を含み、**ターンまで advance**）。pot 35、keys `check, s1`、bet、min 1、max 85.5、pot_base 35、street = **turn**（Hero のアクションはフロップ） |

### 10.10 スポット候補の判定（SPOT）

共通のハンド **H-S1**（S100、Hero = BTN。モックの見本 s1 と同じ）:

```
0 UTG f  1 HJ f  2 CO f  3 BTN r2.5  4 SB f  5 BB c
flop: 6 BB x  7 BTN b1.8  8 BB c
turn: 9 BB x  10 BTN b6.5  11 BB c
river: 12 BB x  13 BTN b15  14 BB c   → showdown
```

| ID | 対象 | 期待 |
|---|---|---|
| SPOT-01 | H-S1 の候補 | `7:[BB]`、`10:[BB]`、`13:[BB]`（3 はプリフロップで候補外） |
| SPOT-02 | H-S1 スポット 10 / BB（§6.6 例 1） | stop 11。ターン、pot 9.1、BTN bets 6.5、BB 残り 95.7。keys `fold, call, s1`、raise、min 13、max 95.7、pot_base 22.1、50% → **17.55**、effective 100 |
| SPOT-03 | H-S1 の `BTN r2.5` の後の SB の局面（アクション 0..3 の後） | SB toCall 2、raise [4, 100]、pot_base 6 |
| SPOT-04 | H-S1 の BB の局面（アクション 0..4 の後。`4 SB f` を含む） | BB toCall 1.5、pot_base 5.5（フォールドした SB の 0.5 を含む） |
| SPOT-05 | H-S1 スポット 13 / BB | リバー、pot 22.1、BTN bets 15、BB 残り 89.2。min 30、max 89.2、pot_base 52.1 |
| SPOT-06 | Hero = SB で `SB f` のみ | 候補なし（フォールドは候補外） |
| SPOT-07 | S100、Hero = BB。`UTG..HJ f, CO r2.5, BTN f, SB f, BB c`、フロップ `BB x, CO b3, BB f` | `BB c`（5）は候補外（直後が Hero 自身の `BB x`）。`BB x`（6）は候補 `[CO]` |
| SPOT-08 | S100、Hero = BTN。`UTG..CO f, BTN r2.5, SB f, BB c`、フロップ `BB x, BTN b97.5`（オールイン）`, BB c` | 候補 `7:[BB]`（区間はハンドの最後まで）。Villain BB: toCall 97.5、stack 97.5 → keys `fold, call`、s1_label null、min / max null、pot_base 200.5 |
| SPOT-09 | MTT の見本（H-S3）: アンティ 0.125、stacks UTG 30 / HJ 22 / CO 45 / BTN 18 / SB 26 / BB 24、Hero = BB。`UTG f, HJ r2.1, CO f, BTN f, SB f, BB c`、フロップ `BB b3, HJ c`、ターン `BB x, HJ x`、リバー `BB x, HJ x` | スポット（BB b3）/ HJ: pot 5.45、HJ toCall 3、残り 19.775。keys `fold, call, s1`、min 6、max 19.775、pot_base 11.45、effective **22**（開始スタックの小さいほう） |
| SPOT-10 | 候補の区間に Villain が 2 回現れるハンド: `UTG..CO f, BTN r2.5, SB c, BB c`、フロップ `SB x, BB x, BTN b3, SB c, BB c`、ターン `SB x, BB x, BTN x` | 候補 `8:[SB, BB]`。stop は最初の 1 回（SB 9、BB 10） |
| SPOT-11 | プリフロップの Hero のアクション（`UTG..CO f, BTN r100, SB f, BB c`、H-S1 のスポット 3） | 候補なし。`spotView` は `invalid_spot` |

### 10.11 % pot の計算（PCT）

| ID | 局面 | 期待 |
|---|---|---|
| PCT-01 | SPOT-02 | 50% → 17.55（6.5 + 22.1 × 0.5） |
| PCT-02 | BBOPT-02 | 50% → 3（1 + 4 × 0.5） |
| PCT-03 | END-02 のフロップで BB がベット（pot 5.5） | 33% → 1.815 → **1.82**、50% → 2.75、75% → 4.125 → **4.13**、125% → 6.875 → **6.88** |
| PCT-04 | 全員 20bb。`BTN r2.5, SB f, BB c`、フロップ `BB x, BTN b5.5, BB c`、ターンで BB がベット（pot 16.5、BB 残り 12） | 33% → 5.445 → **5.45**、50% → 8.25、75% → 12.375 → **12**（max）、125% → 20.625 → **12**（max） |
| PCT-05 | BBOPT-01 | 33% → 1.66 → **2**（min） |
| PCT-06 | S100、BB **7**。`BTN r2.5, SB f, BB c`、フロップ `BB x, BTN b6.5` → Villain BB | call = min(6.5, 4.5) = 4.5（スタック不足で全額）。pot_base = 5.5 + 6.5 + 4.5 = **16.5**。keys `fold, call`。effective 7 |
| PCT-07 | SPOT-02 で to = 13（min） | 逆算 (13 − 6.5) / 22.1 = 29.4% → 表示「29% pot」 |
| PCT-08 | SPOT-02 でオールイン | to = 95.7、表示「オールイン」 |
| PCT-09 | SPOT-09 | 50% → 8.725 → **8.73**、33% → 6.7785 → **6.78**、75% → 11.5875 → **11.59**、125% → 17.3125 → **17.31** |

### 10.12 投稿の検証（VAL。Edge Function `create-post` の拒否）

| ID | 入力 | 期待するエラー |
|---|---|---|
| VAL-01 | 手番でない席のアクション | `not_your_turn` |
| VAL-02 | 合法でない種別（LEGAL-05〜09） | `illegal_action` |
| VAL-03 | bet / raise の額が範囲外（RAISE-04, 05） | `amount_out_of_range` |
| VAL-04 | fold / check / call に `to` がある、bet / raise に `to` がない | `malformed` |
| VAL-05 | `street` のラベルが再生上のストリートと違う | `street_mismatch` |
| VAL-06 | 終了後のアクション（END-05） | `action_after_end` |
| VAL-07 | 最後まで入力されていない（END-06） | `hand_incomplete` |
| VAL-08 | ボード枚数の不一致（END-07, 08） | `board_mismatch` |
| VAL-09 | Hero・known_cards・ボードの間でカードが重複 | `duplicate_card` |
| VAL-10 | Hero のカードが 2 枚でない・形式不正 | `hero_cards_required` |
| VAL-11 | known_cards に Hero の席、存在しない席、2 枚でないカード | `malformed` |
| VAL-12 | spot_index が候補でない（Hero のアクションでない、fold、後続なし） | `invalid_spot` |
| VAL-13 | Villain が候補の席でない | `invalid_villain` |
| VAL-14 | クライアントの派生メタが再計算と一致しない | `derived_mismatch` |
| VAL-15 | スタック ≤ 0、SB ≤ 0、SB > BB、アンティ < 0、MTT でレーキあり、レーキが 0〜100 の外 | `invalid_settings` |
| VAL-16 | 金額の小数が 4 桁以上、上限（9999.999bb）超 | `malformed` |
| VAL-17 | タイトルが空（前後の空白を除く）・40 文字超 | `invalid_title` |
| VAL-18 | その日（UTC）の投稿が上限に達している | `daily_limit`（DB 側で判定） |

### 10.13 ショーダウンのマック補完（SD）

| ID | 入力 | 期待 |
|---|---|---|
| SD-01 | H-S1（BB のカード `Ks Js` を入力） | known_cards = `{BB: [Ks, Js]}` |
| SD-02 | H-S1（BB のカード未入力） | known_cards = `{BB: "muck"}`（サーバーが補完） |
| SD-03 | H-MW で、フォールドした BTN のカードを入力 | known_cards = `{BTN: [...], BB: "muck"}`（フォールド後に見せた席も保存） |
| SD-04 | END-04（ポット獲得で終了）で相手のカード未入力 | known_cards = `{}`（ショーダウンがないので muck は付けない） |
