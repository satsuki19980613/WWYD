import { describe, expect, it } from 'vitest';
import { emptyDraft } from './draft.ts';
import { applyT4Game, T4_GAMES } from './t4Games.ts';

describe('T4 のゲームの種類', () => {
  it('通常・エキスパートともキャッシュ・SB 0.5・アンティなし・レーキ 5%（cap は 4bb / 0.6bb）', () => {
    expect(T4_GAMES.normal).toEqual({ label: '通常', rakePct: 5, capBb: 4 });
    expect(T4_GAMES.expert).toEqual({ label: 'エキスパート', rakePct: 5, capBb: 0.6 });
    const base = { ...emptyDraft(), fmt: 'mtt' as const, sb: '0.4', ante: '0.2', rake: '', title: '残る' };
    for (const g of ['normal', 'expert'] as const) {
      const d = applyT4Game(base, g);
      expect([d.fmt, d.sb, d.ante, d.rake, d.title, d.stacks, d.players]).toEqual(['cash', '0.5', '0', '5', '残る', base.stacks, 6]);
    }
  });
});
