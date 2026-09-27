---
name: wwyd-ui-concept
description: WWYD の UI を作る・直す・レビューするときに必ず使う。姉妹プロジェクト ICMCLEC の UI コンセプト（Cyberpunk 2077 調ダーク HUD、黄60/赤20/シアン20、面取りプレート、コーナーブラケット、ハザードティック、Rajdhani / Zen Kaku Gothic New / Share Tech Mono）を完全に踏襲するための規約とトークン。frontend-design-principles（app.md）と併用する。
---

# WWYD UI コンセプト（ICMCLEC 踏襲）

WWYD の UI は、ICMCLEC（`C:\Users\sa641.SATSUKIPC\OneDrive\ドキュメント\一時ツール\ICMCLEC`）で確立した
デザイン言語を**そのまま**使う。新しい世界観を作らない。方向性の提案・確認（frontend-design-principles の
「Before Generating」の 3.）は、このファイルが既に確定した答えなので**やり直さない**。
ただし「Before Showing」の 4 つの自己レビュー（swap / squint / signature / token）は毎回行う。

## 正となる参照

| 参照 | 役割 |
|---|---|
| `references/icmclec-tokens.css` | ICMCLEC `packages/app/src/styles.css` 冒頭のトークン定義（commit `c5ed890` 時点の写し）。WWYD の `:root` はこれを起点にする |
| `references/icmclec-production-mock.html` | ICMCLEC のデザインの正（本番モック）。部品の形・余白・階層の参照。**中身（ICM の文言・数値）は流用しない** |
| `../frontend-design-principles/` | 汎用の設計原則（app.md 系＝データUI）。本ファイルと食い違う場合は本ファイルが優先 |

ICMCLEC 側が更新されたら、上の 2 ファイルを取り直し、commit を書き換える（勝手に取り直さず、さつきに確認）。

## 世界観

- **Cyberpunk 2077 ブラックオプス HUD**。完全な黒の下地（`--bg2: #000`）に、近黒グラファイトの面。**ダーク固定**（ライトモードを作らない）。
- 深度は**境界線ベース**＋アクティブ要素だけの控えめなグロー。装飾の影は使わない。
- ごく薄い CRT スキャンライン（`body::before`）を前景に常時敷く。

## 配色（黄60 / 赤20 / シアン20）

| 色 | トークン | 意味（これ以外に使わない） |
|---|---|---|
| ハザードイエロー | `--yellow #fcee0a`（上の文字 `--yellow-ink`） | ブランド / 主要 CTA / アクティブ・選択 / アグレッシブなアクション |
| サムライレッド | `--red #ff3b3b` | FOLD / 損失 / 削除 / エラー。**装飾に使わない** |
| グリッチシアン | `--cyan #3ae6ff`（上の文字 `--cyan-ink`） | 情報 / リンク / 操作系 / パッシブなアクション / 公開タグ |
| スチール | `--steel` | 中立・非活性 |

- ポジション 6 色（`--utg --hj --co --bu --sb --bb-c`）は席の識別にだけ使う。
- 4 色デッキ（♠黒 ♥赤 ♦青 ♣緑）は札の実色として温存する（赤＝エラーの規則の例外）。
- レンジ表（13×13）: レンジ外セルは `--cell-off`。アクション別の塗り色の割り当ては、仕様書 v0.2 のアクション定義を読んでから詳細仕様で決め、さつきの確認を取る（ICMCLEC では「取る＝黄 / FOLD＝赤」）。

## タイポグラフィ

- 見出し・ラベルの英字: `--disp` = Rajdhani（uppercase、字間 0.03〜0.05em）
- 本文: `--body` = Zen Kaku Gothic New（`font-feature-settings: 'palt' 1`）
- 数値・チップ量・% ・ID: `--mono` = Share Tech Mono（`tabular-nums`）
- Google Fonts: `Rajdhani:wght@500;600;700` / `Zen+Kaku+Gothic+New:wght@400;500;700;900` / `Share+Tech+Mono`

## シグネチャー要素（必ずどこかに出す）

1. **面取りプレート**: `clip-path: var(--chamfer | --chamfer-sm | --chamfer-xs)`。主要 CTA は黄の面取りソリッド（画面で唯一の実面）。
2. **コーナーブラケット**: 結果・判定のヒーローに、左上と右下だけの非対称ブラケット（2px、意味の色）。
3. **ハザードティック**: セクション見出しの前に 16×11px の斜めストライプ（黄と地色、-45deg）。
4. **ヘッダーのアンダーライン**: 1px の境界＋左から減衰する黄のライン。
5. **mono の小ラベル**: 10〜11px、uppercase、字間 0.12〜0.16em、`--dim2`。

## 寸法・動き

- スペーシング 4px 基準（`--s1`〜`--s6` = 4/8/12/16/24/32）。
- 半径はシャープ（3/4/6px）。面取りを使う要素には半径を付けない。
- アプリ面は中央寄せの縦長カラム（`--app-w: 420px`）。安全領域（`--sat` など）を ICMCLEC と同じ方式で避ける。
- 動きは 150ms（マイクロ）/ 200ms（遷移）、`--ease: cubic-bezier(0.25, 1, 0.5, 1)`。`prefers-reduced-motion` で全停止。

## WWYD 固有の不変条件との接続

- **画面に説明文を出さない**。説明は ⓘ のインフォメーションモーダルに集約する（例外：プレースホルダー、エラー表示）。ⓘ ボタンはシアン（情報）で、モーダルは面取りプレート。
- ポーカー用語は専門用語で統一（英字の用語は Rajdhani / mono で表記ゆれなく）。
- ネイティブの `<select>` や日付入力は使わず、同じ言語のカスタム部品を作る。

## 自己レビュー（見せる前に必ず）

- [ ] 黄・赤・シアンの使い方が上の表の意味どおりか（赤を装飾に使っていないか）
- [ ] 比率がおおむね黄60/赤20/シアン20 に見えるか（squint）
- [ ] シグネチャー 5 要素のうち、その画面に該当するものが出ているか（どの部品か指させること）
- [ ] トークン名が ICMCLEC と同じか（新しい色を発明していないか）
- [ ] 画面に説明文を置いていないか
