# 08 静的ホスティング先の比較と推奨

仕様書 §8「静的ホスティングは無料枠のあるサービスを使う（候補の選定は実装側）」、§12 未決 2。

> 各社の無料枠の数値は変わることがある。**採用を決める前（基盤フェーズ）に公式の料金ページで再確認し、決定ログに確認日を残す。**

---

## 1. 要件

| 要件 | 理由 |
|---|---|
| 無料で運用できる（商用利用の可否を含めて規約上問題がない） | 不変条件 3 |
| SPA のフォールバック（任意のパスで `index.html` を返す） | History API ルーティング（06 章 §0.1）と OAuth の戻り先 |
| HTTPS・独自ドメイン（任意） | OAuth のリダイレクト先、同意画面のホームページ URL |
| GitHub 連携の自動デプロイ・プレビュー | 開発効率 |
| レスポンスヘッダーの設定（CSP 等） | OCR の外部通信を構造的に禁止（07 章 §5） |
| 1 ファイル 25MB 程度までの静的ファイル | tesseract.js の学習データ（数 MB） |

## 2. 比較

| 観点 | **Cloudflare Pages** | GitHub Pages | Netlify（無料） | Vercel（Hobby） | Firebase Hosting（Spark） |
|---|---|---|---|---|---|
| 料金・帯域 | 無料。静的配信の帯域・リクエストは無制限 | 無料。帯域の目安あり（ソフト上限） | 無料枠あり（帯域・ビルド時間に上限） | 無料枠あり | 無料枠あり（転送量・容量に上限） |
| 商用・規約 | 可 | 可（公開リポジトリ） | 可 | **Hobby は非商用のみ** | 可 |
| SPA フォールバック | ○（404.html が無ければ自動で index.html） | △ 404.html の回避策が必要 | ○（`_redirects`） | ○ | ○（rewrites） |
| ヘッダー設定 | ○（`_headers`） | × | ○ | ○ | ○ |
| GitHub 連携・プレビュー | ○（PR ごとのプレビュー URL） | △（Actions で自作） | ○ | ○ | △（Actions） |
| 1 ファイルの上限 | 25MiB | 100MB | 大きい | 大きい | 大きい |
| 既存の運用実績 | **ICMCLEC で使用中**（さつきがアカウントを保有） | — | — | — | — |

## 3. 推奨: **Cloudflare Pages**

理由:

1. 静的配信の帯域が無制限で、無料のまま利用者が増えても課金の心配がない（不変条件 3）。
2. SPA フォールバックとヘッダー設定（CSP）が設定ファイルだけでできる。
3. ICMCLEC で運用実績があり、さつきのアカウント・手順をそのまま使える。
4. PR ごとのプレビュー URL で、レビューのたびに実機（スマホ）で確認できる。

構成:

- ビルド: `npm run build`（`packages/app`）、出力 `packages/app/dist`。
- 環境変数（Pages のプロジェクト設定）: `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
- `public/_headers`: CSP（`default-src 'self'; connect-src 'self' https://<project>.supabase.co; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'`）ほか。
- メンテナンス表示（§8 休止時）は同じ静的サイト内の画面で出す（06 章 §0.3）。

## 4. Supabase の休止への対応【Q-12】

Supabase の無料プランは一定期間（仕様書では 1 週間）アクセスがないとプロジェクトが一時停止する。仕様書の運用は
「管理者が手動で再開し、停止中はメンテナンス中の静的表示」。

- 既定（仕様書どおり）: 停止を検知したらメンテナンス画面。さつきがダッシュボードで再開（10 章）。
- 選択肢: GitHub Actions の定期実行（無料）で週数回 Supabase に軽いリクエストを送り、停止を防ぐ（ICMCLEC の warm-ping と同じ）。
  仕様書の運用と異なるため、採用はさつきの判断【Q-12】。
