/**
 * 検証エラー（詳細仕様 03 章 §3.3、04 章 §10.12）。コードはサーバーの応答と画面の文言（06 章 §7）に対応する。
 */

export type ValidationCode =
  | 'malformed'
  | 'invalid_settings'
  | 'invalid_title'
  | 'hero_cards_required'
  | 'duplicate_card'
  | 'illegal_action'
  | 'not_your_turn'
  | 'amount_out_of_range'
  | 'street_mismatch'
  | 'action_after_end'
  | 'hand_incomplete'
  | 'board_mismatch'
  | 'invalid_spot'
  | 'invalid_villain'
  | 'derived_mismatch';

export class ValidationError extends Error {
  readonly code: ValidationCode;
  /** 問題のあるアクションの添字（あれば）。 */
  readonly index: number | undefined;

  constructor(code: ValidationCode, index?: number, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ValidationError';
    this.code = code;
    this.index = index;
  }
}

export function fail(code: ValidationCode, index?: number, detail?: string): never {
  throw new ValidationError(code, index, detail);
}
