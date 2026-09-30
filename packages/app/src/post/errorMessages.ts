/**
 * サーバー（と core の検証）のエラーコード → 画面の文言（詳細仕様 06 章 §7）。投稿に関わる分。
 */

const ACTION_CODES = new Set([
  'illegal_action',
  'not_your_turn',
  'amount_out_of_range',
  'street_mismatch',
  'action_after_end',
  'hand_incomplete',
  'board_mismatch',
]);

const INPUT_CODES = new Set(['malformed', 'invalid_settings', 'invalid_title', 'hero_cards_required', 'duplicate_card']);

/** `index` はアクションの添字（0 始まり）。画面では「n手目」（1 始まり）にする。 */
export function messageForCode(code: string, index?: number): string {
  if (ACTION_CODES.has(code)) {
    return index === undefined ? 'Action の内容を確認してください' : `Action の内容を確認してください（${index + 1}手目）`;
  }
  if (INPUT_CODES.has(code)) return '入力内容を確認してください';
  switch (code) {
    case 'daily_limit':
      return '本日の投稿上限（5件）に達しました';
    case 'invalid_reads':
      return 'Villain の情報を確認してください';
    case 'invalid_mtt':
      return 'MTT の情報を確認してください';
    case 'invalid_spot':
      return 'Spot を選び直してください';
    case 'preflop_allin':
      return 'Preflop で All-in になった Hand は投稿できません';
    case 'no_spot':
      return 'Flop 以降に Hero の Action が無い Hand は投稿できません';
    case 'derived_mismatch':
      return '投稿できませんでした。再読み込みしてやり直してください';
    case 'not_authenticated':
      return 'ログインし直してください';
    case 'not_allowed':
      return 'このアカウントは利用できません';
    case 'network':
      return '通信に失敗しました';
    default:
      return 'エラーが発生しました';
  }
}
