# 03 投稿時のサーバー側の再生と派生メタの再計算

> **2026-09-29: 出題を Hero の手番に変え、Villain の概念をなくした**（[16 章](16-hero-spot.md)）。この章の Villain・停止位置・派生メタの記述より 16 章を優先する。

仕様書 §5.2.8「アクション列が 6 章のロジックで再生可能である（サーバー側は再生して派生メタを再計算し、
クライアントの値と一致しない場合は拒否する）」を、どこで・どう実行するか。

---

## 1. 方式の比較

> 無料枠・提供状況（Edge Functions の呼び出し回数と CPU 時間、plv8 の提供）は変わることがある。基盤フェーズで公式ページを再確認し、決定ログに確認日を残す。

| 観点 | A. Postgres 内（PL/pgSQL で再実装） | **B. Supabase Edge Functions（Deno / TS）** | C. Postgres 内（plv8 で TS を実行） | D. Cloudflare Pages Functions / Workers |
|---|---|---|---|---|
| ポーカーロジックの単一性（不変条件 7） | **×** TS と SQL の二重実装。テストベクタで食い違いを検出はできるが、直すたびに 2 箇所 | **○** `packages/core` をそのまま import | ○ 同じ JS を DB 内で実行 | ○ 同じ TS を import |
| 無料枠 | ○ 追加コストなし | ○ 無料プランで月 50 万回の呼び出し。投稿は 1 人 1 日 5 件まで（100 人でも月 1.5 万回以下） | — | ○ Workers 無料枠（1 日 10 万リクエスト） |
| 実現性 | ○ | ○ 公式機能。service_role キーは実行環境に自動で入る | **×** Supabase は新しい Postgres（17 以降）で plv8 を非推奨・提供終了の方向。新規プロジェクトで使えない前提で考えるべき | ○ ただし service_role キーを Supabase の外（Cloudflare）に置くことになる |
| トランザクション | ○ 1 関数内で完結 | ○ 検証後に `insert_post` RPC（1 トランザクション）を 1 回呼ぶ | ○ | ○（B と同じ） |
| 秘密情報の置き場所 | 不要 | Supabase 内（自動注入） | 不要 | Cloudflare の環境変数（管理対象が増える） |
| 性能 | ○ | △ コールドスタートで数百 ms。投稿は低頻度なので許容 | ○ | ○ |
| 保守 | × SQL でのポーカーロジックは読みにくくテストしにくい | ○ Vitest で同じテストを使える | △ | ○ |

## 2. 推奨: **B. Supabase Edge Functions**

理由:

1. **ポーカーロジックが 1 つで済む**（CLAUDE.md 不変条件 7）。フロントエンドと同じ `packages/core` の関数で再生するので、クライアントとサーバーの判定が構造上食い違わない。
2. **サーバー代ゼロ**を保てる。呼び出し回数は投稿数と同じで、無料枠（月 50 万回）の 3% にも届かない。
3. 秘密情報（service_role キー）が Supabase の外に出ない。
4. 回答の検証（マス合計・合法キー・サイズ）は、派生メタさえ DB にあればポーカーロジック不要で SQL のトリガで書ける（02 章）。**Edge Function が必要なのは投稿の 1 経路だけ**に絞れる。

### 2.1 技術的な確認事項（基盤フェーズのスパイク）

- Edge Function から `packages/core`（`supabase/functions/` の外）を相対 import して配備できるか。
  - 可能なら: `supabase/functions/create-post/index.ts` から `../../../packages/core/src/index.ts` を import。`packages/core` は Deno でも動くよう、拡張子付き import・Node API 不使用・依存ゼロにする。
  - 不可なら: ビルド前に `packages/core/src` を `supabase/functions/_shared/core/` へ複製するスクリプト（`npm run sync:core`）を用意し、CI で「複製が正本と一致すること」を検査する（正本は `packages/core` のまま）。
- 無料プランの Edge Function の CPU 時間制限（1 リクエストあたり 2 秒）に対し、再生は 1 ms 未満の見込み。

#### スパイクの結果（2026-09-27、T-103）

**直接 import で進める。** 複製スクリプト（`sync:core`）は作らない。

| 確認 | 結果 |
|---|---|
| `supabase functions serve`（CLI 2.118.0 / edge-runtime 1.76.2 / Deno 2.1.4） | `../../../packages/core/src/index.ts` を相対 import して動作した |
| 配備用の bundle（edge-runtime の `bundle` を Docker で直接実行） | `packages/core` が取り込まれ、できた eszip を単体の edge-runtime で起動して正しい応答を確認 |
| 注意点 | ルートの `package.json` を見て **node_modules 全体（232MB）まで bundle に入る**（関数サイズの上限 20MB を超える）。**関数ごとに `deno.json` を置き `"nodeModulesDir": "none"` を指定する**と 4.6KB になった |

- 規則: `supabase/functions/<名前>/deno.json` に `{ "nodeModulesDir": "none" }` を必ず置く。`packages/core` は外部依存ゼロ・拡張子付き import を守る。
- 残るリスク: 本番への `supabase functions deploy` そのもの（CLI が bundle 時にどのディレクトリを Docker に渡すか）は、Supabase プロジェクト（M-01）が無いため未確認。**最初の配備（T-501）で確認**し、外部ファイルが取り込めなければ上の「不可なら」の複製方式に切り替える。
- ローカルの Supabase のポート: Windows（Hyper-V）が 54319〜54418 を予約していて既定の 5432x が使えないため、`supabase/config.toml` を **5532x 系**（API 55321、DB 55322 など）に変更した。

## 3. Edge Function `create-post` の仕様

### 3.1 リクエスト

`POST /functions/v1/create-post`、ヘッダー `Authorization: Bearer <ユーザーのアクセストークン>`。

```json
{
  "title": "K83r のターン 2 バレル",
  "fmt": "cash",
  "sb": 0.5, "bb": 1, "ante": 0, "rake": 5,
  "stacks": { "UTG": 100, "HJ": 100, "CO": 100, "BTN": 100, "SB": 100, "BB": 100 },
  "hero": "BTN",
  "hero_cards": ["Ad", "Kd"],
  "known_cards": { "BB": ["Ks", "Js"] },
  "board": ["Kh", "8d", "3c", "2s", "7h"],
  "actions": [ { "street": "pf", "pos": "UTG", "type": "fold" }, "…" ],
  "spot_index": 10,
  "villain": "BB",
  "derived": {
    "street": "turn", "keys": ["fold", "call", "s1"], "s1_label": "raise",
    "min_to": 13, "max_to": 95.7, "pot_base": 22.1, "effective_stack": 100, "stop_index": 11
  }
}
```

- 金額は bb の数値（小数第 3 位まで）。
- `known_cards` にはカードだけを入れる（`"muck"` は送らない。サーバーが補完する）。
- MTT では `rake` は `null`。

### 3.2 処理

1. **認証**: `Authorization` のトークンで `supabase.auth.getUser()` を呼び、UID を得る。失敗は 401 `not_authenticated`。
2. **形の検証**: 型・必須項目・列挙値・小数桁・上限（`packages/core/src/post/validateInput.ts`）。失敗は 422 `malformed` / `invalid_settings` / `invalid_title` / `hero_cards_required`。
3. **カードの検証**: 形式と重複（Hero・known_cards・ボード）。422 `duplicate_card` など。
4. **再生**: `replay(setup, actions, board)`（04 章 §7）。失敗は 422（04 章 §10.12 のコード）。
5. **スポット**: Preflop でだれかが All-in になったハンドは 422 `preflop_allin`（2026-09-29。16 章）。`spot_index` が候補か、`villain` が候補の席か（04 章 §8）。422 `invalid_spot` / `invalid_villain`。
6. **派生メタの再計算と照合**: `street, keys, s1_label, min_to, max_to, pot_base, effective_stack, stop_index` をサーバーで計算し、`derived` と**完全一致**（金額は mbb の整数で比較）しなければ 422 `derived_mismatch`。
7. **known_cards の補完**: ショーダウンに残った Hero 以外の席でカードが無い席に `"muck"` を入れる（04 章 SD）。
8. **保存**: service_role のクライアントで `rpc('insert_post', { p_author: uid, p: {...再計算した値...} })`。保存する派生メタは**サーバーが計算した値**（クライアントの値ではない）。`daily_limit` / `not_allowed` は DB が返す（429 / 403 に写す）。
9. **応答**: 201 `{ "id": "<uuid>" }`。

### 3.3 応答とエラー

| HTTP | 本文 | 例 |
|---|---|---|
| 201 | `{ "id": "…" }` | 成功 |
| 401 | `{ "error": "not_authenticated" }` | トークンなし・無効 |
| 403 | `{ "error": "not_allowed" }` | 許可リスト外 |
| 405 | `{ "error": "method_not_allowed" }` | POST 以外 |
| 422 | `{ "error": "<code>", "detail": { "index": 7 } }` | 検証エラー。`detail.index` は問題のあるアクションの添字（あれば） |
| 429 | `{ "error": "daily_limit" }` | 投稿上限 |
| 500 | `{ "error": "internal" }` | その他（ログに詳細。本文に内部情報を出さない） |

- CORS: 本番のオリジンとローカル開発のオリジンだけを許可する（許可リストは環境変数 `ALLOWED_ORIGINS`）。
- ログに**カードや UID 以外の個人情報は出さない**（そもそも受け取らない）。

## 4. クライアント側の同じ処理

スポット投稿画面は、送信前に同じ `packages/core` で 1〜7 を行い、エラーを一覧表示する（§5.2.8「クライアントとサーバーの両方で行う」）。
サーバーのエラーは本来起きないが、起きた場合は 06 章のエラーコード表で表示する。

## 5. テスト

| ID | 内容 |
|---|---|
| EF-01 | 04 章 §10.12 の VAL-01〜17 を Edge Function のハンドラ（純関数部分）に対して実行し、期待コードを返す |
| EF-02 | 正常系（H-S1 スポット 10、H-MW スポット 7、H-S3）で `insert_post` に渡る値が 04 章の期待値と一致 |
| EF-03 | `derived` を 1 項目ずつ改ざんすると `derived_mismatch` |
| EF-04 | 保存される派生メタがクライアントの値ではなくサーバーの値であること |
| EF-05 | ローカルの Supabase（`supabase functions serve`）で結合テスト: 投稿 → `get_post_detail` で読める |

## 6. 予備: Edge Function `delete-account`（必要な場合のみ）

02 章 §4.6 の RPC から `auth.users` を削除できない場合に限り作る。トークンで UID を確かめ、
`rpc('delete_my_account_data')`（データ削除のみ）→ `auth.admin.deleteUser(uid)` の順に行う。
