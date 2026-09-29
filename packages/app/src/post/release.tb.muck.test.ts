/**
 * リリース前の総合テスト B-02（追加）: サーバーが保存する known_cards（判明したハンド・ショーダウンの Muck の補完）を、
 * core と別実装の Oracle で求めた「最後まで残った席」と突き合わせる。種を決めた擬似乱数（依存なし）。
 */
import { POSITIONS, SEATS_BY_COUNT, type Pos } from '@wwyd/core';
import { describe, expect, it, vi } from 'vitest';
import { createPostHandler, type CreatePostDeps } from '../../../functions/src/createPost/handler.ts';
import type { InsertPayload } from '../../../functions/src/createPost/payload.ts';
import { Oracle, Rng } from '../../../core/src/poker/release.tb.gen.ts';
import { buildSubmission } from './draft.ts';
import { buildDraft } from './release.tb.draftgen.ts';

describe('B-02 known_cards の補完（Muck）', () => {
  it('ショーダウンに残った Hero 以外の席でカードが無ければ Muck、ポット獲得で終わったハンドは補完しない。送ったカードはそのまま', async () => {
    let checked = 0;
    let withMuck = 0;
    for (let i = 0; i < 6000; i++) {
      const seed = 3_000_000 + i;
      const b = buildDraft(new Rng(seed));
      const s = buildSubmission(b.draft);
      if (!s.ok) continue;
      const insertPost = vi.fn<CreatePostDeps['insertPost']>(async () => 'id');
      const handler = createPostHandler({ verifyToken: async () => 'u', insertPost, allowedOrigins: [], logError: () => undefined });
      const res = await handler(new Request('https://x/', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(s.body) }));
      expect(res.status, `seed=${seed}`).toBe(201);
      const p = insertPost.mock.calls[0]?.[1] as InsertPayload;

      // 独立な再生
      const o = new Oracle(b.played.setup);
      for (const a of b.played.actions) {
        while (o.status().kind === 'streetEnd') o.advance();
        o.apply(a);
      }
      const over = o.status().kind === 'over';
      const alive = o.activeList();
      const sent = (s.body as { known_cards: Record<string, string[]> }).known_cards;
      const expected: Record<string, string[] | 'muck'> = { ...sent };
      if (!over) for (const pos of alive) if (pos !== b.hero && !expected[pos]) expected[pos] = 'muck';
      expect(p.known_cards, `seed=${seed} over=${over} alive=${alive.join(',')}`).toEqual(expected);
      // Hero の席は known_cards に入らない・座っていない席も入らない
      expect(Object.keys(p.known_cards)).not.toContain(b.hero);
      for (const k of Object.keys(p.known_cards)) expect(SEATS_BY_COUNT[b.draft.players!] as readonly Pos[]).toContain(k);
      if (Object.values(p.known_cards).includes('muck')) withMuck++;
      // 座っている席の全員のスタックが保存され、空席は無い
      expect(Object.keys(p.stacks).length).toBe(POSITIONS.filter((q) => b.played.setup.stacks[q] > 0).length);
      checked++;
    }
    expect(checked).toBeGreaterThan(400);
    expect(withMuck).toBeGreaterThan(50);
  }, 240_000);
});
