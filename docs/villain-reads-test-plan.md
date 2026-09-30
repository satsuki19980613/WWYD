# Villain・MTT の情報（P11）のテストとレビューの計画書（2026-09-30 作成）

plan.md の P11（T-1101〜T-1108。詳細仕様 [18 章](detailed-spec/18-villain-reads-mtt.md)）の実施計画。**次のセッションで、この文書に沿って行う**。
さつきの指示（2026-09-30）:

- **リーダー 1 体（Opus 5.5）**が指揮をとり、ほかのエージェントにタスクを指示する。
- **テスト担当 5 体（Sonnet 5.5）**が、機能のテスト・総合テスト・モンキーテストを手分けして行う。
- **レビュー担当 1 体（Opus 5.5）**を別に置く。まずネットで**プロのポーカープレイヤーの知見**を調べて身につけ、**シニアエンジニア兼プロのポーカープレイヤー**としてレビューする。

前回のリリース前テスト（[release-test-plan.md](release-test-plan.md)・[release-test/report.md](release-test/report.md)）の進め方と注意点を引き継ぐ。

---

## 0. 目的と合否の基準

### 0.1 目的

今回（2026-09-30）作ったものを、公開（本番への反映）の前に確かめる。

- 対象の機能:
  - Villain の情報: 全体の傾向、Spot Read・General Read、Preset、表示。
  - MTT の情報。
  - 回答画面・集計画面のヘッダーの投稿のタイトル。
  - 一覧のカード（3 段）と印。
  - スクロールバー。
  - 規約・ⓘ。
- 見ること:
  - 機能の正しさ。
  - ポーカーとしての正しさ（Action の名前の決め方・語彙・目安の値）。
  - サーバーでの強制。
  - 答えの漏れ（不変条件 10）。
  - 前の版との互換。
  - 画面の崩れ。
  - 壊れにくさ。

### 0.2 合格の条件（公開の関門）

1. 重大度（§6）の条件:
   - S1 が 0 件。
   - S2 は 0 件、またはさつきが「残してよい」と決めたものだけ。
2. 自動の試験がすべて通る:
   - 型検査（`npm run typecheck`）
   - 単体（`npm test`）
   - E2E（`npm run e2e`）
   - DB（`npm run test:db`）
   - ビルド（`npm run build`）
   - core のカバレッジ（`npm run test:coverage`。行 90% 以上）
3. モンキーテスト（§3 T5）を決めた量だけ回し、次の 3 つが 0 件:
   - 捕まえていない例外
   - 画面が真っ白
   - 横のはみ出し
4. §5 の対応表（今回の変更に関わる不変条件と 18 章の決定）がすべて、試験かレビューで確かめられている。
5. ポーカーの専門家としてのレビュー（§4）の指摘がすべて、次のどちらかになっている:
   - 「直した」
   - 「さつきが残すと決めた」（仕様の解釈が分かれるものは推測で直さない）
6. 本物の dev（localhost:5173。さつきのログイン）で、次の流れがリーダーの手で通る（§3 L-01）:
   1. Read 付きの投稿
   2. 回答画面の表示
   3. 集計画面の表示

## 1. 前提と準備（セッションの最初にリーダーが行う）

| # | 内容 | 担当 |
|---|---|---|
| 1-1 | CLAUDE.md → この計画書 → plan.md の「現在の状況」「確認待ち」→ 18 章を読む。BATON.md は古い（P9 の時点）ので読み飛ばしてよい | リーダー |
| 1-2 | 対象の版を固定する。ブランチ `feature/villain-reads-mtt` の先頭のコミットを「VR1」としてハッシュを記録する（作成時点は `fc272f1`）。テスト中の修正は VR2、VR3… と数える | リーダー |
| 1-3 | 基準の実行（下のコマンド）。件数と所要時間を記録し、VR1 の時点で緑であることを確かめる | リーダー |
| 1-4 | 結果を置く場所 `docs/villain-reads-test/` を作る: `report.md`・`findings.md`・`monkey-seeds.md`・`poker-review.md`（レビュー担当の調べた知見の要約と出典） | リーダー |
| 1-5 | dev の状態を確かめる（下の 3 つ）。手元の開発サーバー `.claude/launch.json` の `app` を起動する | リーダー |
| 1-6 | 内蔵のブラウザで、さつきが dev（localhost:5173）に Google でログインしているか確かめる。切れていれば、さつきにログインを頼む | さつき |
| 1-7 | worktree の空き容量の確認。前回は 6 つで約 3.9GB だった。今回は 5 つ。OneDrive の中にできるので、容量が心配ならさつきに伝える | リーダー |

**1-3 の基準の実行**

```
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run e2e
npm run test:db
```

- `npm run test:db` は Docker が要る。Git Bash では先に `export PATH="$PATH:/c/Users/sa641.SATSUKIPC/AppData/Local/Programs/DockerDesktop/resources/bin"` を実行する。

作成時点の基準（参考）:

| 試験 | 件数 |
|---|---|
| 単体 | 1043 |
| E2E | 418 passed・1 skipped（約 5 分） |
| pgTAP | 321 |
| core のカバレッジ | 行 95.69%（`readActions.ts` は 90.29%） |

**1-5 の dev の状態の確認**

- マイグレーション `20260930000000_villain_reads_mtt.sql` を dev に適用済みであること（2026-09-30 適用）。
- create-post が dev の版 7 であること: `npx neonctl functions list --project-id patient-leaf-06853495 --branch dev`
- 試験データ: 必要なら `npm run db:seed -- --branch dev`。題名が「試験」の投稿を作り直す。

## 2. 体制

| 役 | モデル | 人数 | 担当 |
|---|---|---|---|
| **リーダー**（このセッション） | Opus 5.5 | 1 | 下の 8 つ |
| **テスト担当 T1〜T5** | Sonnet 5.5 | 5 | §3 の T1〜T5 を 1 体 1 つ。試験を書いて実行し、報告する。**本体のコードは直さない** |
| **レビュー担当 R**（ポーカーの専門家） | Opus 5.5 | 1 | §4。最初にネットで調べ、知見を `poker-review.md` にまとめてからレビューする。**読むだけ（直さない）** |

リーダーの担当:

1. §1 の準備。
2. 6 体の起動と指示。
3. 報告の突き合わせ。
4. **すべての指摘の再現と重大度の決定**。
5. 修正と再試験。
6. リーダーのレビュー L-R（§4.3）。
7. 本物の dev での確認（§3 L）。
8. さつきへの報告。

- サブエージェントは 6 体（Workflow の目安の 10 体未満）。
- Agent ツールでの起動:
  - テスト担当は `model: "sonnet"`、`isolation: "worktree"`。
  - レビュー担当は `model: "opus"`。読むだけなので worktree は要らない。
  - **6 体を同じメッセージで並列に起動する**。
- E2E の開発サーバーの番号: T1〜T5 に `E2E_PORT` を 5211〜5215 で割り当てる。**T5 だけ 2 つ使う**（PC とスマホを並べて回すなら 5215・5216）。
- **worktree の注意**（前回の教訓）:
  - worktree は `main` から作られる。各テスト担当は最初に `git fetch` → `git checkout --detach <VR1 のハッシュ>` で VR1 に合わせ、`git log -1` を報告に含める。
  - node_modules が無ければ `npm install` を行う。依存は追加しない。lock ファイルの版のまま。
- 内蔵のブラウザは 1 つなので、**サブエージェントには使わせない**（Playwright の headless を使う）。さつきのログインが要る確認は、リーダーがまとめて行う。
- DB の試験（`npm run test:db`）は Neon に一時ブランチを作るので、**T4 だけが行う**。ほかの担当は DB の試験を足さない。

### 2.1 サブエージェントへの共通の指示（毎回プロンプトに入れる）

**最初に読むもの**

- CLAUDE.md と、この計画書の §0・§2.1・§6 と自分の担当の節。
- 18 章（特に §2.1・§3・§5・§10・§11）。

**守ること**

- `.env` 系のファイルは読まない・書かない。
- DB の接続文字列を画面・ログ・ファイルに出さない。
- **してはいけないこと**:
  - `git push`
  - 配備（Neon Functions・Cloudflare）
  - dev・本番の DB への接続（T4 の `npm run test:db` の一時ブランチを除く）
  - 依存ライブラリの追加
  - `packages/` の本体のコードの修正（直さずに報告する）
  - `docs/source/` の変更

**書いてよいもの（試験のコードだけ）**

- `e2e/villain/`（Playwright）
- `packages/*/src/**/villain.*.test.ts`（Vitest）
- `db/tests/91_villain_*.test.sql`（pgTAP。T4 だけ）

試験のコードは自分の worktree にコミットし、報告にコミットのハッシュとファイルを書く。残すかはリーダーが決める。

**試験の動かし方**

- Playwright: `E2E_PORT=<割り当て> npx playwright test <ファイル>` で動かす。
  - Neon への通信は `e2e/fakeBackend.ts` の偽の応答（本物にはつながない）。
  - スマホの試験はテスト名に `@sp` を付ける。
  - 使える道具: `e2e/release/taPost.ts`（`openNew`・`playSrpTurn`・`pickSpot`・`setTitle`・`submit` など）、`e2e/release/taKit.ts`（`fakeList`・`row`）、`packages/app/src/answer/detailFixtures.ts`（`detailJson`）、`packages/core/src/poker/testHelpers.ts`（`acts`・`setup`）、`packages/core/src/post/postFixtures.ts`（`hs1`・`hs1bb`・`hmw`・`hs3`）。

**報告の形（最後のメッセージ）**

1. VR1 に合わせたことの確認（`git log -1`）。
2. 行った試験の一覧（ID・件数・結果）。
3. 見つけた不具合（§6 の形。確信度（高・中・低）を付ける）。
4. 試せなかったことと理由。
5. 追加した試験のファイルとコミット。

**推測で「問題なし」と書かない**。確かめたことと、確かめていないことを分ける。

## 3. テストの観点と担当

各担当は、下の「必ず行うこと」を行い、残りの時間で観点の中を自由に探索する（探索的テスト）。ID は報告と指摘で使う。
18 章 §10 の決定（B-1〜B-5・C-1〜C-13）は**確定した仕様**として試験する。決定に疑問があれば、不具合ではなく「仕様への意見」として分けて報告する。

### T1. 判定の中身（core）の機能テスト（Vitest 中心）

対象のファイル:

- `packages/core/src/poker/readActions.ts`（語彙・表・`classifyActions`・`readCandidates`・`villainSeats`・`sizeOf`・`isCheckRaise`）
- `packages/core/src/post/reads.ts`（`validateReads`・`verifyReads`・`validateMtt`）
- `verifyPost.ts`

| ID | 内容 |
|---|---|
| T1-01 | **Action の決め方の全パターン**（18 章 §10.3 の表の各行）: 手で作ったハンドで、各 Action がその名前になること・ならない場合（候補にしない）を試験する。次のものを必ず含める |
| T1-02 | **Size の境目**: Bet・Raise の両方で次の境目を確かめる。「Pot に対して 50% ちょうど」「100% ちょうど」「1mbb 違い」「All-in」「コールの額が残りのスタックより大きい Raise」。Preflop は付かないこと |
| T1-03 | **登録できる席**（§10 B-2）: 2〜6 人のすべての人数で確かめる。空席、ヘッズアップで BTN が SB を払う形、Ante あり。Fold to Steal の Blind は入り、ほかの Preflop Fold は入らないこと。Hero を除くこと |
| T1-04 | **Spot Read の候補は判断地点より前だけ**（不変条件 10）: Spot の添字を動かし、それ以降の Action が候補に入らないこと。Hero 自身の Action が入らないこと。`classifyActions` の添字 i の結果が、i より後の Action を足しても変わらないこと（後を見ていない） |
| T1-05 | **検証の表**: Street × Action の全組、Action × Lean の全組、Size × Street × Action の全組、texture・runout × Street の全組で、`validateReads` が通す・断る（`invalid_reads`）が 18 章 §2.1 と一致すること。形の崩れ（知らないキー・型・重複・空）は `malformed` |
| T1-06 | **`verifyReads`**: 登録できない席、実際の Action と Street・Action・Size のどれかが違う Spot Read、判断地点より後の Action の Spot Read を断ること。合うものは通ること |
| T1-07 | **ランダムなハンド**（種を決めた擬似乱数。依存を足さない。既存の `release.tb.gen.ts` を使ってよい）: 下の 4 つの性質を確かめる。1 万ハンド以上 |
| T1-08 | 旧仕様の値（`memo`・`conf`・`agg` の 0〜100 の値など）を送ると断ること（前の版の画面が残っていた場合の挙動の確認） |
| T1-09 | MTT の検証（`validateMtt`）の境界: 0・1・100・101、人数の大小、Avg Stack の小数、Cash での拒否 |

T1-01 で必ず含める場面:

- Limp のあとの Raise（Steal にならない）
- SB の Complete（Limp）
- Squeeze の Call が複数
- 5-Bet（候補にしない）
- Limp のポットの Flop
- マルチウェイの Donk（Check のあとでも Donk が先）
- Aggressor が Fold したあとの Bet
- Turn・River の Probe
- River の Barrel（Turn が全員 Check）
- Check-Raise と、Check していない Raise
- All-in の Bet・Raise
- 不完全な Raise

T1-07 で確かめる性質:

- 落ちない。
- 候補の Street は Action の Street と同じ。
- 候補の Action は `STREET_ACTIONS` にある。
- 候補から作った Spot Read は `verifyReads` を必ず通る。

### T2. 投稿画面の機能テスト（Playwright。PC とスマホ）

対象のファイル:

- `packages/app/src/reads/VillainSection.tsx`・`PresetDialog.tsx`・`readPresets.ts`・`readsModel.ts`・`MttSection.tsx`
- `packages/app/src/post/draft.ts`（`villainContext`・`buildSubmission`・`submissionBody`）
- `screens/NewPostScreen.tsx`

| ID | 内容 |
|---|---|
| T2-01 | **Villain の欄の出る場所と席**: PC は右の列の Spot の下、スマホはステップ 4。Action を入れ直す・Hero を変える・人数を変える・Spot を変えると、席と Spot Read の候補が正しく変わる。登録できない席の入力は送らない（下書きには残り、戻すと出る） |
| T2-02 | **VPIP・PFR の Slider**: 未入力・最初の矢印で真ん中・× で未入力、PFR ≦ VPIP の追従（両方入力のときだけ）、数の直接入力（範囲の外・小数・空）、なぞる操作、キー（←→・PageUp/Down・Home・End・Delete） |
| T2-03 | **5 分割のボタン**（Postflop Aggression・Hero Image・Sample）: 押すと選ぶ・もう一度で未入力・別のボタン、左右の端の名前、見出しのラベル、要約の 1 行 |
| T2-04 | **Spot Read**: 候補が 1 つ・複数（選ぶ・最初は判断地点にいちばん近いもの）・無い（枠を出さない）、Lean の順（未選択 → 通常 → 強い `++` → 未選択）、Fold 系は Over・Under だけ、Lean を選んだあとに候補を変える（Lean が合わなければ外れる）、注記の文 |
| T2-05 | **General Read**: 下の 5 つを確かめる |
| T2-06 | **Preset**: 下の 5 つを確かめる |
| T2-07 | **下書き**: 下の 3 つを確かめる |
| T2-08 | **送る本文**: 情報の組み合わせを変えて本文を受け取り（`fakeCreatePost`）、次の 3 つを確かめる |
| T2-09 | **MTT の欄**: Game 形式の切り替え（Cash に戻すと送らない）、Tournament Type の Slider（段階なし・Deep・Turbo）、数の欄 5 つの境界と赤い枠、Prize Structure の選択と解除 |
| T2-10 | 画面の大きさ（375×667、390×844、412×915、768×1024、1024×640、1280×800、1440×900、1920×1080）で、Villain の欄を全部開いた状態（General Read 2 件・条件を開く）のはみ出し・重なり・切れ。PC の投稿画面は 1 画面に収まり、列の中でスクロールする（FitStage） |

T2-05 の General Read で確かめること:

- Street → Action → Lean の順。
- 同じ Street・Action を押すと外れる。
- Street を変えると合わない Action・条件・Size・Lean が外れる。
- 「Board · Size」の開閉と各軸（1 つまで）・Runout（複数）・Size（Preflop は Small・Big）。
- 2 件まで・× で消す・途中の General Read のエラーの文言。何も選んでいない General Read はエラーにしない。

T2-06 の Preset で確かめること:

- 保存・呼び出し・上書き・削除。
- 20 件まで・名前 20 文字まで。
- Spot Read を入れない・呼び出しても Spot Read は残る。
- localStorage の `wwyd.readPresets.<uid>` に `{ schema: 2 }`、前の版の鍵 `wwyd.readPresets.v1.<uid>` を読まず書くときに消す。
- アカウント削除で消える。

T2-07 の下書きで確かめること:

- 離れるときの保存 → 開き直すと Villain・MTT が戻る。
- 前の版の下書き（Memo・`conf`・0〜100 の `agg`）を localStorage に入れておいて開いても落ちず、捨てるべき値だけが消える。
- 投稿すると消える。

T2-08 の送る本文で確かめること:

- 画面の本文が core の検証（`validateInput`＋`verifyPost`）を必ず通る。
- 情報が無ければ `villain_reads`・`mtt` のキーを送らない。
- Spot Read の Size は実際の額。

### T3. 表示の機能テストと画面の品質（Playwright。PC とスマホ）

対象のファイル:

- `packages/app/src/reads/ReadsView.tsx`
- `answer/Replay.tsx`（席の印）
- `screens/AnswerScreen.tsx`・`ResultScreen.tsx`・`ListScreen.tsx`
- `components/Marquee.tsx`・`Header.tsx`
- `styles/reads.css`・`scrollbar.css`・`scrollIndicator.ts`
- `info/infoSections.ts`
- `legal/terms.md`・`privacy.md`

| ID | 内容 |
|---|---|
| T3-01 | **席のモーダル**: チップ（VPIP・PFR は数、Aggression・Hero Image の中央は出さない、Sample は中央も出す）、Read の行（Spot Read が先、条件の順、Size、`++` と読み上げ「（強い）」、Check-Raise の表示（Spot Read はその Street で先に Check、General Read は Villain が Hero より先に動く））。表示する情報が無い席（中央だけ）には印を付けない |
| T3-02 | **All Villains**: 参加した席が上・Preflop Fold の折りたたみ・件数、回答画面は停止位置までの Action で並べる、情報の無い席は「—」 |
| T3-03 | **MTT のモーダル**: Tournament Type の Slider そのもの（動かせない。つまみの位置・Deep・Turbo）、人数の 1 行と見出し、Avg Stack、Prize Structure と目安、無い項目は出さない |
| T3-04 | **ボタンの行と印**: History・All Villains・MTT、情報が無いと押せない、席の ◆ を押すとその席、キーボードで押せる、スマホで卓と重ならない。**集計画面**も同じ |
| T3-05 | **ヘッダーのタイトル**: 収まる・収まらない（流れる）・`prefers-reduced-motion`（省略 → 押すと全文）、画面の幅を変えたとき・タイトルが変わったとき、画面名が読み上げ用にだけ残る |
| T3-06 | **一覧のカード**（スマホの 3 段）と PC の表の印: 下の 4 つを確かめる |
| T3-07 | **スクロールバー**: 4px・スクロール中だけ `is-scrolling`・0.9 秒で消える、入れ子のスクロール（投稿の列・モーダル・History） |
| T3-08 | **不変条件 1**: 新しい画面の文字を集め、説明文が次の例外以外に無いこと。例外は「エラー」「プレースホルダー」「Prize Structure の目安」「MTT の数の欄の名前」「Spot Read の注記」 |
| T3-09 | **不変条件 2**: 新しい画面にカタカナのポーカー用語が無い（15 章 §1.1 の用語）。Read の 1 行は英語と記号だけ |
| T3-10 | **UI コンセプトとアクセシビリティ**: 下の 5 つを確かめる |
| T3-11 | **ⓘ と規約**: ⓘ の Villain の文言（09 章と同じ・70 文字以内・7 項目以内）、利用規約から Memo の行が消えている、免責の文、プライバシーポリシーの Preset の文 |

T3-06 の一覧で確かめること:

- `Reads`・`MTT` の印。
- 2 段目が 1 行に収まり Board と印は縮まない。
- 黄は CTA と回答数だけ。
- カード全体を押せる。

T3-10 の UI コンセプトとアクセシビリティで確かめること:

- 黄は選択・主要な操作、シアンは情報、赤は削除・エラーだけ。
- 5 分割のボタン・Lean・条件のボタンに `aria-pressed` と名前。
- Tab の順・フォーカスの見え方・モーダルの閉じ込めと戻り。
- タップの大きさ（スマホ 36〜44px）。
- 文字のコントラスト（4.5:1 の目安）。

### T4. 総合テスト（画面 → サーバー → DB → 画面の一周と、前の版との互換）

対象のファイル:

- `packages/functions/src/createPost/`（handler・payload）
- `db/migrations/20260930000000_villain_reads_mtt.sql`・`db/tests/08_reads.test.sql`
- `answer/postDetail.ts`
- `e2e/fakeBackend.ts`

| ID | 内容 |
|---|---|
| T4-01 | **一周の流れ**（Playwright、偽のバックエンド）: 投稿画面で Villain・MTT を入れて投稿 → 受け取った本文を create-post の `handler`（単体）に通す → `insert_post` に渡る値 → その値から `detailJson` で回答画面・集計画面を開いて、入れたものがそのまま出る。PC・スマホ、Cash・MTT、2〜6 人 |
| T4-02 | **create-post の単体**: Villain・MTT の正しい本文・違反の本文（全部のコード）で 201・422、保存しないこと、`villain_reads`・`mtt` のキーが無い本文（前の版の画面）も通ること、巨大な `villain_reads`（上限の手前・超え） |
| T4-03 | **DB**（pgTAP。`db/tests/91_villain_*.test.sql`、`npm run test:db`）: 下の 4 つを確かめる |
| T4-04 | **前の版との互換**: 下の 4 つを確かめる |
| T4-05 | **不変条件 10 の一周**: 未回答の人に返る `get_post_detail` の応答（偽のバックエンドの形と、T4-03 の pgTAP）に、判断地点より後の Action・Board・Hero のハンドが無いこと。Villain の情報に後の Action の手がかりが入らないこと（Spot Read は判断地点より前だけ。T1-04 と合わせる） |
| T4-06 | **配備の順番の確認**（18 章・plan.md: マイグレーション → create-post → 画面）: 下の 3 つの組み合わせを試験で確かめる |
| T4-07 | **サーバーと画面の一致**（不変条件 7）: T1-07 のランダムなハンドに、ランダムな Read を付けた下書き（`Draft`）を作り、`buildSubmission` が通るなら `validateInput`＋`verifyPost` も通る、逆も同じ。本文を少し壊すとサーバーが必ず断る。1,000 件以上 |

T4-03 の DB で確かめること:

- `villain_reads` の形と 8KB の上限。
- `mtt` の 1KB の上限。
- `insert_post` が両方を保存する。
- `get_post_detail` が回答の前でも両方を返す。`list_posts` の `has_reads`・`has_mtt`。権限（security definer・`search_path`）が前と同じ。

T4-04 の前の版との互換で確かめること:

- 前の版の投稿（キーが無い・`{}`・`null`）が回答画面・集計画面・一覧で落ちずに「情報なし」になる。
- 形の違う `villain_reads`（旧仕様の Memo の形など）が来ても画面を落とさない（`lenientReads`）。
- 前の版の下書き・Preset（T2-07・T2-06 と重ならない範囲で、画面の起動から）。

T4-06 の配備の順番で確かめる組み合わせ:

- 新しい DB＋前の create-post → 情報を捨てて投稿は通る。
- 新しい create-post＋新しい DB → 保存。
- 前の画面＋新しい create-post → 前の画面は情報を送らないので通る。

### T5. モンキーテスト（Playwright）

**でたらめな操作を大量に行い、アプリが壊れないこと**を確かめる。種（seed）を決めた擬似乱数で操作を選び、落ちたら同じ種で再現できるようにする。前回の `docs/release-test/monkey-seeds.md` とブランチ `worktree-agent-*` の T-D の作りを参考にしてよい。

| ID | 内容 |
|---|---|
| T5-01 | **投稿画面の Villain の欄**: 下の操作と点検を行う |
| T5-02 | **合法手のランダムウォーク＋ランダムな Read**: 下の流れを 300 ハンド行う |
| T5-03 | **回答画面・集計画面**: 下の応答と操作で回す |
| T5-04 | **MTT の欄**: 数の欄にでたらめな値（空・空白・全角数字・`1e3`・`-1`・`1.25`・1 万文字・絵文字）、Slider の連打・なぞり・キー、Game 形式の切り替えの連打 |
| T5-05 | **localStorage の壊れた値**: 下書き・Preset の鍵に壊れた JSON・巨大な値・型の違う値を入れて起動し、ランダムに操作する |

T5-01 の投稿画面の Villain の欄:

- 操作:
  - ハンドを入れて Spot を選んだ状態から、Villain の欄の見えていて押せる要素をランダムに押す（連打・ダブルクリックも）。
  - ランダムなキー（矢印・Enter・Esc・Tab・Delete・Backspace・PageUp/Down・Home・End）。
  - 数の欄にでたらめな値。
  - 途中で Action の入れ直し・Hero・人数・Spot の変更。
  - 画面の大きさの変更、再読み込み。
- **毎手の点検**（落ちたら種と手数を記録）:
  - `pageerror` と `console.error` が無い。
  - 画面が真っ白でない。
  - スマホで横にはみ出さない。
  - 「undefined」「NaN」「[object Object]」が画面に出ない。
  - `buildSubmission` が通る状態なら本文が core の検証を通る。
  - 要約の 1 行と中身が合う。

T5-02 の合法手のランダムウォーク:

1. 台のボタンだけをランダムに押してハンドを最後まで入れる。
2. Spot をランダムに選ぶ。
3. 登録できる席にランダムな全体の傾向・Spot Read・General Read を付けて投稿する。
4. 偽のバックエンドで本文を受け取り、core の検証を必ず通ることを確かめる。
5. その本文から `detailJson` で回答画面を開き、席のモーダル・All Villains が落ちないことを確かめる。

T5-03 の回答画面・集計画面:

- 偽のバックエンドの応答をランダムに作る:
  - 正しい Read
  - 表示する情報の無い席
  - 形の違う `villain_reads`・`mtt`
  - 長いタイトル
  - MTT の全項目・一部
- 操作: 席の ◆・All Villains・MTT・History・Replay の操作・Esc・画面の大きさの変更をランダムに行う。

**量**:

- 画面ごとに 1 種 200 手 × 20 種（PC・スマホそれぞれ）。
- T5-02 は 300 ハンド。

落ちた種は `docs/villain-reads-test/monkey-seeds.md` に残し、直したあと同じ種で再実行する。

### L. リーダーが本物の dev で行う確認（内蔵のブラウザ・さつきのログイン）

| ID | 内容 |
|---|---|
| L-01 | 手元の画面（localhost:5173）で Read 付きの投稿を 1 件作る（題名「試験 Villain」）。次の 3 つを入れる。**投稿はさつきの 1 日の投稿枠を 1 つ使う**ので、さつきの承認を得てから行う |
| L-02 | 作った投稿の `get_post_detail` を内蔵のブラウザの JavaScript で読み（`await import('/src/backend/neon.ts')` の `db`）、`hand.villain_reads`・`hand.mtt` が送ったとおりに入っていること。**未回答の状態で**判断地点より後の Action・Board・Hero のハンドが返らないこと |
| L-03 | 一覧で `Reads`・`MTT` の印、回答画面の席の ◆・席のモーダル・All Villains・MTT。回答（さつきの承認。自分の投稿への回答は 1 回だけ）→ 集計画面でも同じ表示 |
| L-04 | Data API で `insert_post` を直接呼べない・`post_hands.villain_reads` を書き換えられないこと（RLS。前回の C-08 と同じやり方。JWT の値は出さない） |
| L-05 | 終わったら、試験の投稿を消すか残すかをさつきに聞く（dev なので残してもよい） |

L-01 で入れるもの:

- MTT の全項目
- 2 席の全体の傾向
- Spot Read・条件付きの General Read

## 4. レビュー（レビュー担当 R：シニアエンジニア兼プロのポーカープレイヤー、Opus 5.5）

### 4.1 最初に行うこと: プロのポーカープレイヤーの知見を身につける（ネットで調べる）

WebSearch・WebFetch で、信頼できる出典（トレーニングサイト・HUD ソフトの公式の説明・プロの記事・ソルバーの解説など）を調べ、次の点について**プロの一般的な理解**をまとめる。結果は `docs/villain-reads-test/poker-review.md` の前半に、**出典の URL を付けて**要約する。長い引用はしない（1 か所 15 語未満）。

1. **HUD の統計**の定義と、6-max のキャッシュでの一般的な値の幅:
   - VPIP・PFR
   - Postflop Aggression（AF と AFq の違い）
   - 3-Bet・Fold to 3-Bet・Fold to Steal
   - C-Bet・Fold to C-Bet
   - サンプル数と信頼度（何ハンドで何が読めるか）
2. **Action の名前の定義**（プロ・HUD ソフトでの一般的な使い方）:
   - Open・Limp・3-Bet・Squeeze・4-Bet・Fold to Steal（Steal の席の範囲）
   - C-Bet・Barrel・Delayed C-Bet・Donk・Probe・Bet vs Check（Float Bet・Stab との違い）
   - Check-Raise
   - マルチウェイと Limp のポットでの扱い
3. **Bet の大きさの区分**（Small・Big・Overbet と Block Bet の、Pot に対する割合の一般的な目安）。Raise の大きさの測り方。
4. **Board のテクスチャの分類**:
   - High Card
   - Rainbow・Two-tone・Monotone
   - Paired
   - Connected・Straight possible の定義
   - Runout の種類（Brick・Overcard・Flush Complete・Straight Complete・Board Pair）
5. **Exploit の読みの表し方**（「やりすぎ・やらなさすぎ」「Value-heavy・Bluff-heavy」など、プロが相手の傾向を記録する習慣）。
6. **MTT**:
   - ICM・ITM・Bubble
   - ストラクチャーの速さ（Deep・Turbo）
   - Avg Stack
   - Prize Structure（Top-heavy・Flat の目安）

### 4.2 レビューの観点（読むだけ。直さない）

| # | 観点 | 主に読むもの |
|---|---|---|
| R-01 | **ポーカーとしての正しさ**: 下の 5 つを 4.1 の知見と照らす。プロが見て違和感のある所、よくある場面で意図と違う名前になる所を、**具体的なハンドの例**で示す | 18 章 §2.1・§10、`readActions.ts`、`readsModel.ts`（ラベル・目安） |
| R-02 | **集合知の道具としての有用性**: 下の 4 つの問いに答える | 18 章、画面（E2E の写真を撮ってよい。`e2e/reads.spec.ts` を参考に Playwright で） |
| R-03 | **答えの漏れと不正な使い方**（不変条件 10 と 6）: 下の 4 つの問いに答える | `reads.ts`・`readActions.ts`・`verifyPost.ts`・マイグレーション・`postDetail.ts` |
| R-04 | **シニアエンジニアとしてのコードレビュー**: 下の 6 つを見る | `packages/core/src/poker/readActions.ts`・`post/reads.ts`、`packages/app/src/reads/`、`post/draft.ts`、`screens/NewPostScreen.tsx`、`functions/src/createPost/`、マイグレーション、試験 |
| R-05 | **資料と実装の一致**: 18 章・15 章・09 章・CLAUDE.md（不変条件 1・2・6 の例外の書き方）・plan.md の決定ログと、実装が食い違っていないか | `docs/`、`CLAUDE.md` |

R-01 で照らすもの:

- Action の語彙
- §10.3 の決め方
- Fold to Steal の席の範囲
- Size の境目（50%・100%）と Raise の測り方
- Texture・Runout の定義、VPIP・PFR の段階の境目、5 分割のラベル

R-02 で答える問い:

- 回答者がこの情報を見て、GTO から exploit に Range を変える判断ができるか。
- 足りない情報・誤解を招く表示は無いか。
- 全体の傾向と Read の組み合わせで矛盾が起きやすい所は無いか。
- 投稿者が入力する手間は妥当か。

R-03 で答える問い:

- Villain の情報から、判断地点より後の Action・Villain の実際のハンド・答え（Hero の実際の Action）が推測できてしまわないか（投稿者が General Read で答えを暗示する余地も含めて）。
- 自由記述が本当にタイトルだけになったか。
- 個人を特定できる情報を構造の中に埋め込めないか。
- `get_post_detail` が回答の前に Villain の情報を返すことの妥当性。

R-04 で見るもの:

- 正しさ・境界・状態の扱い（React の古い値・effect の依存・`useState` の初期値が候補の変化に追従するか）。
- クライアントとサーバーの一致（不変条件 7）。
- エラー処理。
- 性能（`classifyActions` を描画ごとに呼ぶ回数など）。
- 試験の抜け、使っていないコード・CSS。
- 保守性。

- 指摘は §6 の形で出す。**観点（R-01〜R-05）と確信度（高・中・低）**を付ける。
- ポーカーの判断に関わる指摘には、根拠（4.1 の出典）と、**直す案と直さない案の両方**を添える。仕様の変更になるものは、リーダーが plan.md の「確認待ち」に回してさつきに聞く。
- 報告の最後に、読んだファイルの一覧と、調べた出典の一覧を付ける。

### 4.3 リーダーのレビュー（L-R）

テストの結果を待つ間に、リーダーが次を行う。

- 18 章 §11（前の実装との食い違い）の 13 項目が、すべて実装で直っていることを 1 つずつ確かめる。
- 規約・プライバシーポリシー・ⓘ が実際のデータの流れと合っていること:
  - Preset は端末だけ。
  - Villain の情報は回答の前でも見える。
- `git diff 377b1cb..VR1` を読み、今回の変更の範囲に抜けが無いこと。377b1cb は P11 の着手の直前。

## 5. 対応表（全部埋まれば関門 4 を満たす）

| 確かめること | 試験 | レビュー |
|---|---|---|
| 不変条件 1（画面に説明文を出さない。例外は Prize の目安・MTT の数の欄の名前・Spot Read の注記） | T3-08 | R-05 |
| 不変条件 2（ポーカー用語は英語。例外は MTT の数の欄の名前） | T3-09 | R-01・R-05 |
| 不変条件 3（サーバー代ゼロ。`villain_reads` 8KB・`mtt` 1KB の上限） | T4-03 | R-04 |
| 不変条件 4（サーバーで強制） | T1-05・T1-06、T4-02・T4-07 | R-03・R-04 |
| 不変条件 6（名前を保存しない。自由記述はタイトルだけ） | T1-08、T3-11 | R-03 |
| 不変条件 7（ロジックは core に 1 つ） | T1-07、T4-07 | R-04 |
| 不変条件 10（回答まで答えを返さない。Spot Read は判断地点より前だけ） | T1-04、T4-05、L-02 | R-03 |
| 18 章 §10 B-1〜B-5・C-1〜C-13 の決定どおり | T1・T2・T3 の各 ID | R-01・R-05 |
| 前の版との互換（投稿・下書き・Preset・配備の順番） | T2-06・T2-07、T4-04・T4-06 | R-04 |
| 壊れにくさ | T5-01〜T5-05 | — |
| 本物の dev での一周 | L-01〜L-04 | — |

## 6. 指摘の形と重大度

指摘は `docs/villain-reads-test/findings.md` に 1 件 1 行の表でまとめる（リーダー）。各サブエージェントの報告もこの形で出させる。

| 項目 | 内容 |
|---|---|
| ID | `V-001` から通し番号（リーダーが付ける） |
| 出どころ | 試験の ID（T2-04 など）かレビュー（R-01〜R-05・L-R） |
| 重大度 | 下の S1〜S4 |
| 場所 | `ファイル:行` または画面と操作 |
| 再現の手順 | 入力・操作・種（モンキー）→ 起きたこと・期待したこと |
| 確信度 | 高・中・低（サブエージェントが付ける） |
| 状態 | 未確認 → 確認済み → 修正済み（コミット）→ 再試験済み／見送り（さつきの判断）／仕様への意見（確認待ちへ） |

重大度:

| 重大度 | 内容 |
|---|---|
| **S1** | 答えの漏れ・不変条件の違反・主要な流れで落ちる・データが消える・サーバーを通らない本文を画面が送る（またはその逆） |
| **S2** | 機能が正しく動かない（回り道はある）。ポーカーとして明らかに誤った名前が付く |
| **S3** | 軽い不具合・見た目の崩れ・表記のゆれ |
| **S4** | 改善の提案 |

直し方:

- **S1・S2 は直す**（先に再現の試験を書いてから直す。CLAUDE.md §6）。
- S3 はまとめて直すか見送るかをリーダーが案を出し、さつきが決める。
- S4 は plan.md のタスクに回す。
- **仕様の解釈が分かれるもの**（特にレビュー担当のポーカーの指摘で、18 章 §10 の決定を変えるもの）は推測で直さず、plan.md の「確認待ち」に選択肢と推奨を添えて入れ、さつきに聞く。

## 7. 進め方（順番）

| 段 | 内容 | 並列 |
|---|---|---|
| 0 | §1 の準備（VR1 の固定、基準の実行、`docs/villain-reads-test/`、dev の状態、さつきのログイン） | — |
| 1 | T1〜T5（Sonnet × 5）と R（Opus × 1）を**同じメッセージで**起動する（§8 の指示文）。リーダーは L-R と、さつきの承認を得て L-01〜L-04 を行う | 6 体＋リーダー |
| 2 | 報告を集め、重複をまとめ、1 件ずつ再現して重大度を決める（findings.md） | リーダー |
| 3 | S1・S2 を直す（再現の試験 → 修正 → VR2）。直した所に関わる担当に再試験を頼む（**同じエージェントに SendMessage**。新しく起動し直さない）。モンキーは落ちた種で再実行 | 必要なだけ |
| 4 | 全部の自動の試験をもう一度（関門 2・3）。サブエージェントが書いた試験で残すものを `e2e/`・`packages/`・`db/tests/` に移す（残すかの目安: 仕様の判定を確かめる速い試験は残す。数分以上かかるモンキーは worktree のブランチに残す） | リーダー |
| 5 | `docs/villain-reads-test/report.md`（§9 の目次）と plan.md（P11 の状態・決定ログ・セッションログ）を更新し、さつきに報告する。**公開の判断はさつき** | リーダー |
| 6 | さつきの承認 → push → PR → CI → マージ → 本番（§10） | さつき＋リーダー |

- 各サブエージェントの時間の目安は 1 体あたり 1〜2 時間相当。途中で止まったら、リーダーが SendMessage で続きを頼む。
- リーダーは、サブエージェントの報告をそのまま信じない。「通った」「問題なし」は、リーダーが試験の出力か再現で確かめてから記録する。
- 終わったら、worktree（5 つ）の削除をさつきに確かめる。試験のコードを残すブランチ `worktree-agent-*` は残す。

## 8. 起動の指示文（リーダーが Agent ツールに渡す）

各指示文の先頭に **§2.1 の共通の指示をそのまま入れる**。そのあとに、下の担当ごとの部分を足す。

### 8.1 テスト担当 T1〜T5（`model: "sonnet"`・`isolation: "worktree"`）

```
あなたは WWYD の Villain・MTT の情報（P11）のテスト担当 {T1|T2|T3|T4|T5} です。
対象の版は VR1 = {ハッシュ}（ブランチ feature/villain-reads-mtt）。最初に git fetch と git checkout --detach {ハッシュ} で合わせ、
node_modules が無ければ npm install を行ってから始めてください（依存は追加しない）。
E2E_PORT は {5211〜5216 の割り当て} を使ってください。
docs/villain-reads-test-plan.md の §3 の「{担当の節}」の ID をすべて行い、残りの時間でその観点の中を探索してください。
18 章 §10 の決定は確定した仕様として試験し、決定への疑問は「仕様への意見」として分けて報告してください。
本体のコードは直さず、見つけた不具合は §6 の形（確信度付き）で報告してください。
```

### 8.2 レビュー担当 R（`model: "opus"`。worktree なし）

```
あなたは WWYD の Villain・MTT の情報（P11）のレビュー担当です。シニアエンジニアであり、プロのポーカープレイヤーとしてレビューします。
まず docs/villain-reads-test-plan.md の §4.1 のとおり、WebSearch・WebFetch でプロのポーカープレイヤーの知見を調べ、
出典の URL を付けて要約してください（長い引用はしない）。要約は報告の前半に書いてください（ファイルへの保存はリーダーが行う）。
次に §4.2 の R-01〜R-05 の観点でレビューしてください。読むだけで、コードもファイルも変更しないでください。
指摘は §6 の形で、観点・確信度・（ポーカーの判断の指摘は）根拠の出典と「直す案・直さない案」を付けてください。
最後に、読んだファイルの一覧と出典の一覧を付けてください。
```

- レビュー担当はファイルを書かない。調べた知見の要約は報告の中に書かせ、リーダーが `docs/villain-reads-test/poker-review.md` に保存する（worktree なしでリポジトリを直接触らせないため）。

## 9. 報告書（report.md）の目次

1. 対象の版（VR のハッシュ）と環境
2. 自動の試験の件数と結果（基準と最終）
3. T1〜T5・L ごとの結果（行ったこと・件数・合否・試せなかったこと）
4. モンキーテストの量（種の数・手数）と見つけたもの
5. レビュー（R-01〜R-05・L-R）の要約。ポーカーの知見の要約は `poker-review.md` へのリンク
6. 指摘の一覧（重大度別・状態別）
7. 対応表（§5 を埋めたもの）
8. さつきに判断してほしいこと（仕様への意見・S3 の扱い）
9. 見送ったものと理由、残った危険
10. 公開してよいかの判断材料（リーダーの推奨）

## 10. 公開の順番（さつきの承認の後。参考）

18 章・plan.md のとおり、**マイグレーション → create-post → 画面**の順にする。前の create-post は情報を捨てるだけで投稿は通るので、途中の状態でも利用者は困らない。

1. push → PR → CI が通る → さつきがマージを承認。
2. 本番にマイグレーション `20260930000000_villain_reads_mtt.sql`（**さつきが実行**。Claude の本番の操作は安全機能で止められる）。
3. create-post を本番に配備（さつきが実行）。許可するオリジンは `http://localhost:5173,https://wwyd.pages.dev`。
4. マージ → Cloudflare Pages の配備 → 本番のスモーク:
   1. 試験の投稿（Read・MTT 付き）
   2. 回答
   3. 集計
   4. 表示
   5. 削除

## 11. さつきに確認・依頼すること（まとめ）

- dev へのログイン（1-6）。
- L-01・L-03 の dev の投稿と回答（投稿枠を 1 つ使う）の承認。L-05 の試験の投稿の扱い。
- worktree の容量（1-7）と、終わったあとの削除。
- S3 の直す・見送るの判断。仕様への意見（特にポーカーの専門家のレビューで 18 章 §10 の決定を変える提案）の判断。
- 公開（push・マージ・本番のマイグレーションと配備）の承認と実行（§10）。
