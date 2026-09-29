# リリース前テストの指摘一覧

[release-test-plan.md](../release-test-plan.md) §6 の形。指摘の ID・重大度は指揮役が付ける。サブエージェントやレビューの指摘は、指揮役が再現・確認してからここに載せる（確認できないものは「未確認」）。

重大度: **S1** 情報の漏れ・不変条件の違反・主要な流れで落ちる・データが消える／**S2** 機能が正しく動かない（回り道はある）／**S3** 軽い不具合・見た目の崩れ／**S4** 改善の提案

対象の版: RC1 = `2aa3f8a`（アプリのコードは `1f99a8d` と同じ）。

| ID | 出どころ | 重大度 | 場所 | 再現の手順（操作 → 起きたこと・期待したこと） | 状態 |
|---|---|---|---|---|---|
| F-001 | R2 | S2 | `db/migrations/20260929000002_list_board.sql`（list_posts） | 許可リストを有効にし、リスト外の利用者で `list_posts()` → 投稿が返る（期待: posts の直接の select と同じく 0 行）。security definer にしたため posts の RLS が効かない。本番は許可リストが無効なので今の実害は無い | 確認済み（pgTAP DB-02 に再現の試験を足し、NG を確認）→ 修正 `20260929000003_list_posts_allowlist.sql` |
| F-002 | R1 | S2 | `packages/app/src/info/infoSections.ts`（login）・09 章 §0 | ログイン画面の ⓘ が「表示名とメールアドレスは保存しない」。実際は Neon Auth（`neon_auth.user`）が保存しており（Q-26 で許容）、プライバシーポリシー 1 とも食い違う。2026-09-28 に「投稿や回答と一緒には保存されない」に直したが、2026-09-29 の ⓘ の簡素化で戻っていた | 確認済み（文言はさつきの判断） |
| F-003 | R3 | S2 | `packages/app/src/post/savedDrafts.ts`（sanitizeDraft） | H-S1 を Flop まで入れ、BTN の Stack を 1 にする（画面の Action は 3 手）→ 下書きに保存して開き直すと Action 0 手・Board 0 枚（期待: 画面に出ていた 3 手と Board が残る） | 確認済み（`draft.test.ts` に再現の試験）→ 修正（開き直すときも settleActions で外す） |
| F-004 | R3 | S3 | `savedDrafts.ts`（sanitizeDraft）、アプリ全体（ErrorBoundary が無い） | localStorage の下書きに `players: null, actions: [null]` → 下書きから開くと TypeError で画面が真っ白。経路は改ざん・古い形式の localStorage だけ | 確認済み（`savedDrafts.test.ts`）→ Action の形の検査を修正。ErrorBoundary は未対応 |
| F-005 | R3 | S3 | `packages/app/src/post/OcrImport.tsx` | 読み取り中・確認画面のまま画面を離れる → OCR が動き続け、画像の Object URL が破棄されない（不変条件 5「読み取り後ただちに破棄」に関わる） | コードで確認 → 修正（アンマウントで中止・破棄）。画面での再試験は未 |
| F-006 | R2 | S3 | `db/migrations/20260927000007_rls.sql:26` | ログインした人は Data API の `posts?select=author_uid` で全投稿の投稿者 UID を読める（C-08 で dev でも確認）。02 章は「list_posts は author_uid を返さない（結び付けを避ける）」。不変条件 6（UID 以外を見せない）の違反ではない | 確認済み（直すかはさつきの判断） |
| F-007 | R1 | S4 | `package.json` の description | 「Villain のレンジ」が残っている（16 章で Villain の概念は無くなった） | 確認済み |
| F-008 | R2 | S4 | `helpers.sql`（is_allowed_uid）ほか | R2 の指摘 3〜9（削除後の JWT、中継の X-Forwarded-For、`/api/auth` の nosniff、connect-src の Neon Auth の住所、`.env.*` の検査、JWT の algorithms、neon_auth の権限の試験） | 未確認（S4。plan.md のタスクに回す案） |
| F-009 | R3 | S4 | R3 の指摘 4〜10 | RangeGrid の memo、送信中に離れた後の画面移動、使っていないコード、SQL の Board 枚数の表（River の試験）、Check 済みの席と不足の All-in Bet（仕様の確認）、設定だけで Preflop All-in、getToken の同時呼び出し | 未確認（S4） |
| F-010 | T-B（TB-2）・T-C（F-C2） | S3 | `packages/core/src/post/validateInput.ts` | 題名に NUL・対のないサロゲートを入れた本文を create-post へ → 検証を通り、jsonb への変換で落ちて 500 `internal`（期待: 422 `invalid_title`）。画面の入力では起きない | 確認済み（`post.test.ts` VAL-17 に再現の試験）→ 修正 `ba5bdf1`。**create-post の配備し直しで反映** |
| F-011 | T-B（TB-3） | S4 | `savedDrafts.ts` | 開き直した下書きに、札でない Board（`zz` 等）と、整数でない・候補に無い Spot の番号が残る | 確認済み → 修正 `ad49e7c` |
| F-012 | T-C（観察 7） | S3 | `.github/workflows/ci.yml` の db ジョブ | PR でも `NEON_API_KEY` を渡す。同じリポジトリのブランチの PR なら、スクリプトの書き換えで鍵を使える | 未確認（直すかはさつきの判断。鍵の権限を絞る・main への push だけにする案） |
| F-013 | T-C（観察 4） | S4 | create-post | Neon の URL に直接公開され、回数の制限が無い（無料枠を使い切る攻撃への備えが無い。不変条件 3） | 未確認（S4） |
| F-014 | T-C（観察 6・10） | S4 | `.gitignore`・`_headers` | `.gitignore` に `.dev.vars`・`.wrangler/`・`*.pem` が無い。`_headers` に HSTS・Permissions-Policy・COOP が無い | 未確認（S4） |
| — | G（指揮役） | — | E2E（WebKit・Firefox） | Firefox（PC）105 件すべて成功。WebKit は 1 件ずつ・上限 120 秒にすると 104/105。残る 1 件（Mix バーのドラッグで 70% のはずが 75%）は、Playwright の WebKit が送るマウスの座標が指定より 6.5px ずれる（受け取ったイベントを記録して確認。アプリはその座標から正しく計算）ため、アプリの不具合ではない。`指でなぞる・長押し @sp` は CDP（Chromium 専用）を使う試験で WebKit では実行できない | 記録のみ |
| F-015 | T-F（F-05-1・1b） | S3 | `packages/app/src/auth/useAuth.ts`（hasSession） | `/api/auth/get-session` が 502・429 → ログイン済みの利用者にログイン画面が出る（期待: メンテナンス中か再試行）。5xx・通信エラーを未ログインと同じに扱っている | 偽の応答で確認（T-F の試験）。直すかはさつきの判断 |
| F-016 | T-F（F-05-2） | S3 | `neon.ts`・`useAuth.ts` | get-session・whoami・token・Data API に打ち切り時間が無い（health だけ 10 秒）。get-session が応答しないと起動画面のまま待ち続ける | 偽の応答で確認 |
| F-017 | T-F（F-05-3） | S3 | `neon.ts`（getToken）・各画面 | 開いている間にセッションが切れる（7 日超・他の端末でログアウト）→ 各画面は「読み込みに失敗しました」のままで、ログイン画面に戻らない（再読み込みすれば戻る） | 偽の応答で確認 |
| F-018 | T-F（F-04-1） | S4 | `packages/app/src/ocr/runOcr.ts` | OCR の取り消しの直後に、tesseract.js の内部で捕まえていない例外（画面には出ない）。取り消し後の Promise が解決せず、画像の画素がページを閉じるまで残るおそれ（コードから推測） | 負荷の高いときだけ再現（T-F） |
| F-019 | T-F（F-01-1） | S4 | `packages/app/src/main.tsx` | 使っていない Zen Kaku Gothic New の 900 を読み込み、CSS が 138KB 大きい | 確認済み（`font-weight: 900` の使用 0 件）→ 修正（CSS 627KB → 489KB） |
| F-020 | T-F（F-01-2・F-02-1） | S4 | `_headers`・起動の順番 | `/assets/*` にキャッシュの設定が無い。起動が ok → get-session → token → whoami → list_posts の直列 5 往復 | 未対応（S4） |
| F-021 | T-F（F-02-2・F-02-3） | S3 | 運用 | ① `/api/auth/*` は誰でも呼べ、外から大量に呼ばれて 1 日 10 万回を使い切られると全員のログインが止まる ② 無料枠の律速は Neon の compute（月 100 CU 時間）。1 日 45〜275 セッション（滞在時間と集中の仮定による）を超えると月の途中で DB が止まる見積もり。毎週使用量を見る手順が要る | 見積もり（実測ではない）。運用の手順（M-12）に入れる案 |
