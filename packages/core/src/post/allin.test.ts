/**
 * オールインを含むハンドのスポット（2026-09-29 さつき「オールインも他のアクションと変わらない」）。
 * Hero の Flop 以降の手番はオールインも含めてすべて候補になり、どれを選んでもサーバーと同じ検証を通る。
 */
import { describe, expect, it } from 'vitest';
import { hasPreflopAllin, spotCandidates } from '../poker/spot.ts';
import { acts } from '../poker/testHelpers.ts';
import { ValidationError } from '../errors.ts';
import { ALLIN_CASES, allinRaw, setupOf } from './allinFixtures.ts';
import { validateInput } from './validateInput.ts';
import { verifyPost } from './verifyPost.ts';

const codeOf = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return e instanceof ValidationError ? e.code : 'other';
  }
};

describe('オールインを含むハンドのスポット', () => {
  it('見本は 20 通り以上', () => {
    expect(ALLIN_CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(ALLIN_CASES.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const actions = acts(c.actions);
    const pfAllin = hasPreflopAllin(setupOf(c), actions);
    const cands = pfAllin ? [] : spotCandidates(actions, c.hero);
    expect(cands).toHaveLength(c.spots.length);
    // Preflop の All-in は、Flop 以降の Hero の手番を選んでもサーバーが断る（サイドポットで続けたハンドも）
    if (pfAllin) {
      for (const { index } of spotCandidates(actions, c.hero)) {
        expect(codeOf(() => verifyPost(validateInput(allinRaw(c, index))))).toBe('preflop_allin');
      }
    }
    cands.forEach(({ index }, i) => {
      // 選んだスポットをそのまま投稿して、サーバーと同じ検証（再生・派生メタの照合）を通る
      const v = verifyPost(validateInput(allinRaw(c, index)));
      expect(v.derived.keys.join(','), c.spots[i]?.[0]).toBe(c.spots[i]?.[1]);
      expect(v.derived.stopIndex).toBe(index);
      if (v.derived.minTo !== null && v.derived.maxTo !== null) expect(v.derived.minTo).toBeLessThanOrEqual(v.derived.maxTo);
    });
  });
});
