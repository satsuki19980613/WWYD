# 16. 出題は Hero の手番（Villain をなくす。2026-09-29）

さつきの決定。このアプリの問いは「**Hero（投稿者の席）の手番で、ほかの人ならどうするか**」に限る。
Villain（Hero のアクションに答える相手の席）の概念をなくし、回答者は Hero の席に座って答える。
仕様書 v0.2 の「Villain の席で Hero のアクションに対するレンジを答える」を改める（仕様書は編集しないので、この章が優先する）。
01〜06・09 章に残る Villain の記述より、この章を優先して読む。

## 1. 決めたこと（AskUserQuestion の回答。すべて推奨案）

| 項目 | 決定 |
|---|---|
| 回答の形 | **Range を塗る**（今と同じ 13×13。Hero の席で、その局面をハンドごとにどう戦うか。塗り・集計・DB の形はそのまま） |
| Hero のハンド | **回答するまで伏せる**（Range の答えがハンドに引っ張られないように）。回答後の集計画面で、Hero の実際のアクションと一緒に見せる |
| 1 投稿のスポット | **1 つ**。Flop 以降の Hero の手番をすべて候補に並べ、投稿者が 1 つを選ぶ（自動では選ばない） |
| 既存の投稿 | **消して作り直す**（今の回答は Villain のレンジなので変換できない）。マイグレーション `20260929000000_hero_spot.sql` が投稿をすべて消す。本番に適用する前にさつきに確認する |

## 2. スポット（04 章 §8 を改める）

- **候補**: Hero の **Flop 以降のアクションすべて**（`spotCandidates`）。Hero のフォールド、ハンドの最後のアクションも候補（後続のアクションは要らない）。プリフロップは出題しない（変わらず）。
- **停止位置 = スポット**（`stop_index = spot_index`）。回答者はそのアクションの直前の局面（Hero の手番）で答える。未回答者に返すアクションは停止位置より前だけ（Hero のアクションそのものは見せない）。
- **派生メタ**は Hero の手番で求める: 合法キー（to call があれば `fold, call(, s1)`、無ければ `check(, s1)`）、`s1_label`・`min_to`・`max_to`、ポットの基準（`potBaseOf(s, hero)`）。
- **実効スタック**: Hero と、その時点でハンドに残っている相手のうち最も深い席の、開始時のスタックの小さい方。
- **答え合わせ**: Hero の実際のアクション（出題のアクション）と Hero のハンド（白枠）。Hero のアクションはいつも分かっているので、どの投稿でも答え合わせができる。
- エラーコード `invalid_villain` はなくした（候補でないスポットは `invalid_spot`）。
- **候補が無いハンド**（Flop 以降に Hero の手番が無い）は投稿できない。Spot の欄は「候補なし」。「投稿する」を押すとエラー（2026-09-29 さつき）:
  Hero が Preflop で All-in になった（All-in に Call した、またはそれ以上 Action できない）ハンドは「Preflop で All-in になった Hand は投稿できません」、
  それ以外（Hero の Preflop の Fold、Preflop で全員が Fold など）は「Flop 以降に Hero の Action が無い Hand は投稿できません」。
- **Preflop で All-in になる Action は入力で受け付けない**（2026-09-29 さつき）。押すとエラー「Preflop で All-in になった Hand は投稿できません」を出し、手番はそのまま（`makesPreflopAllin`）。
  対象は、Hero が Preflop で All-in になる Action（All-in の Raise・All-in の Call）と、Hero が残ったまま誰も Action できなくなる Action（相手の All-in にスタックの多い Hero が Call して終わる、最後の席の Fold でランアウトになる など）。
  相手の Preflop の All-in そのものは受け付ける（Hero と別の席が Flop 以降を続けられる）。OCR で読み込んだハンドなどで入ってしまった場合は、上の投稿時のエラーで止める。
- **T4 の画像の読み込みでは、Preflop でだれかが All-in になったハンドをはじく**（Hero でもほかの席でも。2026-09-29 さつき）。「Preflop で All-in になった Hand は投稿できません」（06 章 §3.9）。
- オールインは他のアクションと同じ扱い（Hero の All-in も、相手の All-in への Call / Fold も、その前の手番も候補）。22 通りの見本 `packages/core/src/post/allinFixtures.ts` で core・下書き・E2E を試験する。

見本（`packages/core/src/post/postFixtures.ts`）:

| 見本 | スポット | キー | min〜max | ポットの基準 | 実際 |
|---|---|---|---|---|---|
| H-S1 | 10（ターンの BTN。BB x の後） | check, s1（bet） | 1〜95.7 | 9.1 | Bet 6.5 |
| H-S1 を BB で（`hs1bb`） | 11（ターンの BB。BTN b6.5 に向き合う） | fold, call, s1（raise） | 13〜95.7 | 22.1 | Call |
| H-MW | 7（フロップの CO。BB x の後） | check, s1 | 1〜97.5 | 8 | Bet 3 |
| H-S3（MTT） | 6（フロップの BB。最初の手番） | check, s1 | 1〜21.775 | 5.45 | Bet 3（実効 22） |

## 3. 画面

- **投稿**: スポットのステップは「Hero の Action」の候補（例「Turn / BTN Bet 6.5」「Flop / BTN Fold」）とタイトルだけ。Villain の欄はない。
- **回答**: 卓は Hero の席を手前に置き、タグ「Hero（あなた）」（シアンの枠）。Hero のハンドは裏向き。停止時のログは「▶ BTN to act」。
  Range のタブの要約は、Hero が向き合っているアクション（このストリートの直前のアクション。無ければ「▶ BTN to act」）とポット。
- **集計**: 答え合わせは「Hero（BTN）実際の Action」と Hero のハンド。白枠は Hero のハンドのマス（初期選択）。ログの出題の行が実際のアクションの強調を兼ねる。
- **一覧**: カードの席の行は「Hero BTN」だけ。
- ⓘ（09 章）とログイン画面の説明の 1 行も「Hero の手番でほかの Player ならどうするか」に改めた。

## 4. DB（01・02 章を改める）

- 停止位置の制約を `stop_index = spot_index` に置き換えた（`20260929000001_stop_is_spot.sql`。以前は `stop_index > spot_index`）。
- `posts.villain` 列と `posts_hero_ne_villain` 制約を外した。`insert_post` は `villain` を受け取らない。`list_posts`・`get_post_detail` は `villain` を返さない。
- 試験データ（`db/seed/*.sql`）: H-S1 の BTN の手番 7 / 10 / 13（キー check / s1）。回答は AA を Bet、22 を Check（大量の試験データは Check と Bet を混ぜる）。
- create-post（Neon Function）も `villain` を送らない・保存しない形に変わったので、**dev・本番に配備し直す**（マイグレーションと同時に）。
