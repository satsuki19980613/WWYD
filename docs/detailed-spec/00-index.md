# WWYD 詳細仕様 — 索引

- 版: d1.0（2026-09-27 さつき承認。Q-1〜Q-23 は推奨案で決定）
- 作成日: 2026-09-27
- 上位資料: [仕様書 v0.2](../source/spot-crowd-app-spec.md)（以下「仕様書」。§ は仕様書の章番号）

この詳細仕様は、仕様書 v0.2 を実装できる粒度まで具体化したものである。仕様書と食い違う記述を見つけたら
仕様書が正であり、ここを直す。**仕様書の解釈が分かれる点は [11-open-questions.md](11-open-questions.md) に
選択肢と推奨を添えて列挙しており、さつきの回答が出るまで「推奨案（仮）」として扱う。**
本文中で `【Q-n】` と書いた箇所は、その質問の回答によって変わる。
**2026-09-27、Q-1〜Q-23 はすべて推奨案で決定した。本文の推奨案（仮）は確定稿として扱う。**

## 章立て

| 章 | ファイル | 内容 |
|---|---|---|
| 01 | [01-db-schema.md](01-db-schema.md) | DB スキーマ（DDL）、インデックス、外部キーとカスケード |
| 02 | [02-rls-triggers-rpc.md](02-rls-triggers-rpc.md) | RLS ポリシー全文、トリガ、RPC |
| 03 | [03-server-replay.md](03-server-replay.md) | 投稿時のサーバー側の再生と派生メタの再計算（方式比較と推奨） |
| 04 | [04-poker-logic.md](04-poker-logic.md) | ポーカーロジックの状態遷移、判定ごとのテストケース表 |
| 05 | [05-paint-format.md](05-paint-format.md) | paint のバイナリ形式、集計データの形式、エンコード・デコード |
| 06 | [06-screens.md](06-screens.md) | 画面ごとの状態、入力、バリデーション、エラー表示、空状態、エラーコード表 |
| 07 | [07-ocr.md](07-ocr.md) | OCR の組み込み方針 |
| 08 | [08-hosting.md](08-hosting.md) | 静的ホスティング先の比較と推奨 |
| 09 | [09-info-modal.md](09-info-modal.md) | インフォメーションモーダルの文言 |
| 10 | [10-manual-tasks.md](10-manual-tasks.md) | さつきが手作業で行う作業の一覧と手順 |
| 11 | [11-open-questions.md](11-open-questions.md) | 仕様書の曖昧な点・矛盾・判断が必要な点 |

## 共通の表記

| 表記 | 意味 |
|---|---|
| ポジション | `UTG, HJ, CO, BTN, SB, BB`（6max 固定） |
| ストリート | `pf, flop, turn, river` |
| カード | ランク `AKQJT98765432` + スート `s h d c`（例 `Ad`） |
| アクション種別 | `fold, check, call, bet, raise` |
| 回答のキー | `fold, check, call, s1`（`s1` はベットまたはレイズ。表示名は §6.5） |
| 金額 | bb 単位。内部表現は 04 章 §1（ミリ bb の整数）【Q-5】 |
| ミックス | 各キー 0〜20 の整数（1 = 5%）。合計 20 |
| mbb | ミリ bb（1bb = 1000mbb）。内部計算の単位 |

## 実装上の単一の正

| 対象 | 置き場所（予定） | 利用者 |
|---|---|---|
| ポーカーロジック（04 章） | `packages/core/src/poker/` | フロントエンド、Edge Function `create-post` |
| paint / 集計のコーデック（05 章） | `packages/core/src/paint/` | フロントエンド、Edge Function、テスト |
| 回答の検証（マス合計・合法キー・サイズ） | Postgres のトリガ（02 章）＋ `packages/core/src/paint/validate.ts` | 両者のテストで同じテストベクタを使う |

回答の検証だけは、DB が最終防衛線であるため SQL と TS の両方に存在する。ただし**ポーカーのルールは含まない**
（派生メタとして保存済みの合法キー・min / max と照合するだけ）ため、CLAUDE.md の不変条件 7 には抵触しない。
両者の食い違いは共有テストベクタ（`packages/core/test-vectors/paint-validation.json`）で検出する。
