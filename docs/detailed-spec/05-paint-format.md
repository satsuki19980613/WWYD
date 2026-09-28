# 05 paint のバイナリ形式と集計データ

仕様書 §7.3・§7.4・§5.3.7・§5.4.2 の具体化。実装は `packages/core/src/paint/` に置く。

---

## 1. マスの順序（169 ラベル）

`RANKS = "AKQJT98765432"`（添字 0〜12）。行 `i`、列 `j`（0〜12）のマスの添字は **`idx = i × 13 + j`（行優先）**。

| 条件 | ラベル | 例 |
|---|---|---|
| `i = j` | `RANKS[i] + RANKS[j]` | `AA`（idx 0）、`KK`（idx 14） |
| `i < j`（右上） | `RANKS[i] + RANKS[j] + "s"` | `AKs`（idx 1）、`A2s`（idx 12） |
| `i > j`（左下） | `RANKS[j] + RANKS[i] + "o"` | `AKo`（idx 13）、`32o`（idx 167） |

- 最後のマス（idx 168）は `22`。
- コンボ数: ペア 6、スーテッド 4、オフスート 12。合計 1326。ボードとのカード除外は行わない（§5.3.7）。
- 実カード 2 枚 → ラベル: 高いランクを先に、同スートなら `s`、違えば `o`、同ランクならペア。

## 2. 回答の paint（676 バイト）

- 169 マス × 4 バイト。マス `idx` の 4 バイトは `offset = idx × 4` から **`fold, check, call, s1` の順**。
- 各バイトは 0〜20 の整数（1 = 5%）。
- マスの 4 バイトの合計は **0（レンジ外）または 20（レンジ内）**。
- そのスポットで合法でないキーの位置は必ず 0。
- 少なくとも 1 マスは合計 20（§5.3.8「少なくとも 1 マス塗っている」）。
- 保存: `answers.paint` / `host_answers.paint`（`bytea`、長さ 676）。

### 2.1 転送形式

PostgREST（supabase-js）は `bytea` を **16 進文字列 `\x` + 小文字 hex** で受け渡す。

- 送信: `'\\x' + hex(bytes)`（JS の文字列リテラル上は `\\x`、実際の値は `\x0000…`）。長さ 2 + 1352 文字。
- 受信: 同じ形式の文字列が返る。`fromHex` で `Uint8Array(676)` に戻す。

### 2.2 API（`packages/core/src/paint/`）

```ts
type Key = 'fold' | 'check' | 'call' | 's1';
type Mix = { fold: number; check: number; call: number; s1: number }; // 各 0〜20、合計 20
type Paint = (Mix | null)[];   // 長さ 169。null はレンジ外

encodePaint(paint: Paint): Uint8Array            // 676 バイト
decodePaint(bytes: Uint8Array): Paint            // 長さ・値域の検査つき（違反で例外）
toHex(bytes: Uint8Array): string                 // '\x…'
fromHex(s: string): Uint8Array
validatePaint(paint: Paint, keys: Key[], size: Mbb | null, minTo: Mbb | null, maxTo: Mbb | null): PaintError | null
labelOf(idx: number): string;  idxOf(label: string): number;  combos(idx: number): 6 | 4 | 12
labelOfCards(c1: Card, c2: Card): string
```

### 2.3 検証（`validatePaint` と DB トリガで同じ規則）

| 順 | 規則 | エラーコード |
|---|---|---|
| 1 | 長さが 676 | `paint_length` |
| 2 | 各バイトが 0〜20 | `paint_value` |
| 3 | 合法でないキーの位置が 0 | `paint_illegal_key` |
| 4 | 各マスの合計が 0 または 20 | `paint_sum` |
| 5 | 合計 20 のマスが 1 つ以上 | `paint_empty` |
| 6 | s1 > 0 のマスがあるなら、size が `min_to ≤ size ≤ max_to` かつ小数第 3 位まで | `size_out_of_range` |
| 7 | s1 > 0 のマスが無いなら size は null | `size_not_allowed` |

共有テストベクタ `packages/core/test-vectors/paint-validation.json`（入力 hex・keys・size・min / max・期待コード）を
Vitest と pgTAP の両方で読み、TS と SQL の判定が一致することを確かめる。

## 3. 集計データ（1690 バイト）

- 169 マス × 10 バイト。マス `idx` の 10 バイトは `offset = idx × 10` から:

| バイト | 内容 | 型 |
|---|---|---|
| 0–1 | レンジ内人数 `n_cell` | uint16 ビッグエンディアン |
| 2–3 | fold の合計頻度 `sum_fold` | uint16 BE |
| 4–5 | check の合計頻度 `sum_check` | uint16 BE |
| 6–7 | call の合計頻度 `sum_call` | uint16 BE |
| 8–9 | s1 の合計頻度 `sum_s1` | uint16 BE |

- 合計頻度は 0〜20 の整数の和（20 = 1 人が 100%）。
- 表全体の回答者数 `N` は `post_aggregates.n`（別列）。
- 上限: `sum_k ≤ 20 × n_cell ≤ 65535` → 1 スポットあたり 3276 回答まで。超える挿入はトリガが `aggregate_overflow` で拒否する（想定規模 100 人では到達しない）。
- ビッグエンディアンにした理由: SQL で `get_byte(b, o) * 256 + get_byte(b, o + 1)` と素直に書けるため。
- 保存: `post_aggregates.cells`（`bytea`、長さ 1690、初期値はすべて 0）。

### 3.1 差分更新（02 章のトリガ）

回答 1 件の挿入で、合計が 20 のマスごとに `n_cell += 1`、各キー `sum_k += paint[k]`、`N += 1`。
アカウント削除で回答が消えるときは同じ値を引く（`N −= 1`）。投稿削除では集計行ごと消えるので減算しない。

### 3.2 API

```ts
type AggCell = { n: number; sum: Mix };  // sum は各キーの合計頻度
decodeAggregate(bytes: Uint8Array): AggCell[]   // 長さ 169
addAnswer(agg: AggCell[], paint: Paint): AggCell[]   // テスト用（SQL と同じ結果になることを確認）
```

## 4. 表示の計算（§5.4.2・§5.3.7）

`c(idx)` = コンボ数、`N` = 回答者数。

### 4.1 全体表示

| 表示 | 計算 |
|---|---|
| マスの色の割合（キー k） | `avg_k = sum_k / (n_cell × 20)`（`n_cell = 0` なら無色） |
| マスの濃さ（不透明度） | `n_cell = 0` → 0（無色）、それ以外 → `0.3 + 0.7 × n_cell / N` |
| 上部バー: キー k の比率 | `Σ c(idx) × (n_cell / N) × avg_k ÷ 1326` = `Σ c(idx) × sum_k ÷ (20 × N × 1326)` |
| 上部バー: レンジ外の比率 | `Σ c(idx) × (1 − n_cell / N) ÷ 1326` |
| 内訳（選んだマス） | 「レンジ内 n_cell / N 人」、キーごとに `avg_k`（%）と人数 |

内訳の「人数」は、そのキーを 1% 以上含めた人数ではなく、**頻度で重み付けした人数** `sum_k / 20`（小数は四捨五入して整数表示）とする
（モックと同じ。個々の回答を持たない集計形式でも計算できる）。

### 4.2 自分 / Hero の想定レンジの表示

| 表示 | 計算 |
|---|---|
| マスの色の割合 | `paint[k] / 20` |
| マスの濃さ | レンジ内は 1、レンジ外は無色 |
| 上部バー: キー k | `Σ_{レンジ内} c(idx) × paint[k] / 20 ÷ 1326` |
| 上部バー: レンジ外 | `Σ_{レンジ外} c(idx) ÷ 1326` |

回答画面の集計バー（§5.3.7）も同じ式で、描画中の paint から毎回計算する。

### 4.3 丸めと並び

- 比率の数値表示は小数第 1 位（`toFixed(1)` 相当、四捨五入）。表示上の合計が 100.0 にならなくても補正しない。
- マス内の色は左から **fold → check → call → s1** の順に、割合の幅で並べる（§5.3.4）。
- 白枠（Villain の実際のハンド）は `known_cards[villain]` がカードのときだけ、そのラベルのマスに付ける。

## 5. テストケース（PAINT）

| ID | 入力 | 期待 |
|---|---|---|
| PAINT-01 | ラベル ↔ 添字 | `idxOf('AA')=0`、`'AKs'=1`、`'A2s'=12`、`'AKo'=13`、`'KK'=14`、`'32o'=167`、`'22'=168`。169 ラベルが重複なく往復する |
| PAINT-02 | コンボ数の合計 | Σ c = 1326 |
| PAINT-03 | 実カード → ラベル | `Ks Js` → `KJs`、`Jh Kd` → `KJo`、`7c 7d` → `77` |
| PAINT-04 | 全マス null を encode | 676 バイトすべて 0。`validatePaint` は `paint_empty` |
| PAINT-05 | AA に call 20 | バイト 0〜3 = `00 00 14 00`。hex = `\x0000140000…` |
| PAINT-06 | encode → toHex → fromHex → decode | 元と一致（ランダム 1000 件のプロパティテスト） |
| PAINT-07 | keys `check, s1` で fold に値 | `paint_illegal_key` |
| PAINT-08 | あるマスの合計 15 | `paint_sum` |
| PAINT-09 | バイト値 21 | `paint_value` |
| PAINT-10 | s1 を含むが size が min 未満 | `size_out_of_range` |
| PAINT-11 | s1 を含まないが size あり | `size_not_allowed` |
| PAINT-12 | 回答 2 件（A: AA call 20、B: AA call 10 / s1 10、KK fold 20）を集計 | AA: n 2、sum call 30 / s1 10、N 2。表示: AA の call 75% / s1 25%、濃さ 1.0。KK: n 1、濃さ 0.65 |
| PAINT-13 | PAINT-12 の上部バー | call = 6 × 30 / (20 × 2 × 1326)、fold = 6 × 20 / (20 × 2 × 1326)、レンジ外 = (1326 − 6 − 6 × 0.5) / 1326 |
| PAINT-14 | 集計のエンコード | `n_cell = 300` → `01 2C`（BE） |
