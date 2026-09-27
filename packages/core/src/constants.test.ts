import { describe, expect, it } from 'vitest';
import { MIX_TOTAL, POSITIONS, mixUnitsToPercent } from './index.ts';

describe('constants', () => {
  it('6max のポジションはプリフロップの順で 6 席', () => {
    expect(POSITIONS).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
  });

  it('ミックスの単位は 5% 刻み', () => {
    expect(mixUnitsToPercent(1)).toBe(5);
    expect(mixUnitsToPercent(MIX_TOTAL)).toBe(100);
    expect(mixUnitsToPercent(0)).toBe(0);
  });
});
