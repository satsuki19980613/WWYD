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
