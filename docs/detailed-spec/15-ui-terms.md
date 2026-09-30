# 15. 画面のポーカー用語（英語の表記。2026-09-29）

さつきの指示で、**画面に出すポーカー用語はすべて英単語**にする（カタカナにしない）。説明の文は日本語のまま、ポーカー用語の単語だけを英語にする。
「Hero」「Villain」「to call」「% pot」「3bet」「combos」など、もともと英語の語はそのまま。

## 1. 用語表

| カタカナ（前の表記） | 画面の表記 |
|---|---|
| アクション | Action |
| フォールド / チェック / コール / ベット / レイズ | Fold / Check / Call / Bet / Raise |
| オールイン | All-in |
| オープン / リンプ | Open / Limp |
| プリフロップ / フロップ / ターン / リバー | Preflop / Flop / Turn / River |
| ストリート | Street |
| ショーダウン / マック | Showdown / Muck |
| ポット / スタック | Pot / Stack |
| レンジ（レンジ外・レンジ内） | Range（Range 外・Range 内） |
| ハンド / ハンドヒストリー / ヒストリー | Hand / Hand History / History |
| スポット | Spot |
| ボード | Board |
| カード / スート | Card / Suit |
| スペード / ハート / ダイヤ / クラブ（読み上げ） | Spade / Heart / Diamond / Club |
| プレイヤー / ポジション | Player / Position |
| テーブル / リプレイ | Table / Replay |
| キャッシュ（キャッシュゲーム） / ゲーム（ゲーム形式） | Cash（Cash Game） / Game（Game 形式） |
| アンティ / レーキ / ブラインド | Ante / Rake / Blind |
| サイズ | Size |
| ポーカー | Poker |
| ヘッズアップ / ランアウト / コンボ / ミックス | Heads-up / Runout / Combo / Mix |

ポーカー用語でない語（ボタン・タブ・キーボード・ログ・マス・ブラシ・スポイト・スライダー・モーダル・ログイン・アカウントなど）はカタカナのまま。

### 1.1 Villain・MTT の情報の用語（2026-09-30。18 章）

訳さずに英語で出す: Villain / All Villains / Reads / VPIP / PFR / Postflop Aggression / Hero Image / Sample / Preset / Spot Read / General Read / Lean /
Over / Under / Value-heavy / Bluff-heavy / Action の語（3-Bet・Fold to Steal・C-Bet・Barrel・Delayed C-Bet・Donk・Probe・Bet vs Check・Check-Raise など。18 章 §2.1.5）/
条件のタグ（A-high・Two-tone・Paired・Straight possible・Flush Complete・Small・Big・Overbet など。18 章 §2.1.3）/
MTT / ICM / ITM / Tournament Type / Deep / Turbo / Avg Stack / Prize Structure / Top-heavy / Standard / Flat / 1st /
表示の形の entries・left（`12/58 ・ ITM 50 ・ 320 entries`、`58 left`。18 章 §2.4。V-017）。
MTT の数の欄の名前は日本語（スポットの順位・残りの人数・エントリー数。2026-09-30 さつき）。MTT のモーダルの見出し（「順位 / 残りの人数」など）はこの欄の名前なので、不変条件 1 の例外（数の欄の名前）に入る。
段階のラベル（Very Tight・Loose・Balanced・First Impression・Long・HUD Stats など）も英語（18 章 §2.1）。Read の 1 行は英語と記号だけ（`River · Barrel (Big) → Value-heavy`）。それ以外の文言（「呼び出す」「保存」「クリア」など）は日本語。

## 2. 書き方

- 英単語と日本語の間は半角スペース（「Hero の Hand」「Flop 以降」）。括弧・句読点の隣には入れない（「（Spot）」「Fold、Check」）。
- 大文字で始める（「Fold」「Range 外」）。ボタンの額は後ろに（「Call 1.9」「3bet 45」）。
- 画面名: 「List」「Post」（2026-09-29）。投稿のボタン: 「＋ Post」。戻るボタン: 「Back」。投稿のステップ: 「基本設定」「Player」「Action」「Spot」。回答のタブ: 「Replay」「Range」。集計のタブ: 「集計」「Hand History」。
- ログ・ハンドヒストリーの 1 行: 「BTN Raise 2.5」「BB Call 1.5」「SB Raise 100 All-in」。終わり: 「BTN Pot 獲得」「Showdown」。
- 札の読み上げ: 「Diamond の A」。
- 利用者が書くタイトルは置き換えない。

## 3. 置き換えのやり方（2026-09-29）

アプリの画面の文字列（`packages/app/src` の .ts / .tsx。コメントは除く）・単体テスト・E2E・09 章を、用語表で機械的に置き換えた。
カタカナの連なりが用語表と残す語だけで区切れるときだけ置き換える（「パターン」の「ターン」などは触らない）。
区切れずに残ったものはテストの名前だけ（ハンドル・ヘルスチェック・ポストフロップ・シングルレイズドポット）。
詳細仕様の他の章の本文はカタカナのまま（開発者向けの説明。画面の表記はこの章が正）。
