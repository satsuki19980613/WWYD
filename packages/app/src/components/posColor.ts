import type { Pos } from '@wwyd/core';

/** 席の識別色（ポジション 6 色のトークン。wwyd-ui-concept） */
export const POS_VAR: Record<Pos, string> = {
  UTG: 'var(--utg)',
  HJ: 'var(--hj)',
  CO: 'var(--co)',
  BTN: 'var(--bu)',
  SB: 'var(--sb)',
  BB: 'var(--bb-c)',
};
