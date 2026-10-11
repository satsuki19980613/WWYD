import { describe, expect, it } from 'vitest';
import { localId } from './randomId.ts';

describe('localId', () => {
  it('時刻（base36）の後ろに乱数の 6 文字が付く', () => {
    const id = localId(1_700_000_000_000);
    expect(id.startsWith((1_700_000_000_000).toString(36))).toBe(true);
    expect(id).toMatch(/^[0-9a-z]+$/);
    expect(id).toHaveLength((1_700_000_000_000).toString(36).length + 6);
  });

  it('同じ時刻でも毎回ちがう', () => {
    const ids = new Set(Array.from({ length: 50 }, () => localId(0)));
    expect(ids.size).toBeGreaterThan(45);
  });
});
