/// <reference lib="dom.iterable" />
/**
 * 15 章の用語表（カタカナ → 英語）のカタカナ側。画面の文字にこれが含まれていたら不変条件 2 の違反。
 * 表に無いが同じ種類の語（ヒーロー・ヴィラン・ブラフ・エクイティなど）も足してある。
 * 「ボタン」「タブ」「ブラシ」「ログ」「マス」などポーカー用語でない語は含めない（15 章 §1）。
 */
export const KATAKANA_TERMS: readonly string[] = [
  // 15 章の表
  'アクション', 'フォールド', 'チェック', 'コール', 'ベット', 'レイズ', 'オールイン', 'オープン', 'リンプ',
  'プリフロップ', 'フロップ', 'ターン', 'リバー', 'ストリート', 'ショーダウン', 'マック', 'ポット', 'スタック',
  'レンジ', 'ハンドヒストリー', 'ヒストリー', 'ハンド', 'スポット', 'ボード', 'カード', 'スート',
  'スペード', 'ハート', 'ダイヤ', 'クラブ', 'プレイヤー', 'プレーヤー', 'ポジション', 'テーブル', 'リプレイ',
  'キャッシュ', 'ゲーム', 'アンティ', 'レーキ', 'ブラインド', 'サイズ', 'ポーカー',
  'ヘッズアップ', 'ランアウト', 'コンボ', 'ミックス',
  // 表に無いが同種の語
  'ヒーロー', 'ヒーロ', 'ヴィラン', 'ビラン', 'ブラフ', 'エクイティ', 'ナッツ', 'ドロー', 'ミニマム', 'ミニレイズ',
  'スリーベット', 'ボタン（ポジション）', 'ショウダウン', 'ポットオッズ',
];

/** テキストの中のカタカナの連なり */
export const katakanaRuns = (text: string): string[] => text.match(/[ァ-ヴー]+/g) ?? [];

/** 連なりが、用語表の語だけで区切れるか（「パターン」の「ターン」のような、語の一部に含まれるだけのものは除く。15 章 §3） */
export function segmentable(run: string): boolean {
  const ok: boolean[] = Array(run.length + 1).fill(false);
  ok[0] = true;
  for (let i = 0; i < run.length; i++) {
    if (!ok[i]) continue;
    for (const t of KATAKANA_TERMS) if (run.startsWith(t, i)) ok[i + t.length] = true;
  }
  return ok[run.length] === true;
}

/** 違反する連なり（例: 「フォールド」）を返す */
export const katakanaViolations = (text: string): string[] => katakanaRuns(text).filter(segmentable);
