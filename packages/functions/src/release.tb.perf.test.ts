/**
 * リリース前の総合テスト B（探索）: 本文の上限（64KB）いっぱいの長いハンドでも、サーバーの検証（validateInput + verifyPost）と
 * 画面の再生（phaseOf を描画のたびに呼ぶ）が現実的な時間で終わること。
 * 2 人・Stack の上限 1000bb（F-037）で 1bb ずつレイズし合うハンド（Action が最も多くなる形。レイズは 998 回まで）。
 */
import { spotView, validateInput, verifyPost } from '@wwyd/core';
import { describe, expect, it, vi } from 'vitest';
import { MAX_BODY_BYTES } from './createPost/handler.ts';
import { parseSettings, phaseOf, emptyDraft, type Draft } from '../../app/src/post/draft.ts';

// 乱数で多くのハンドを回す試験がある。CI の遅い環境でも既定の 5 秒で打ち切らない（2026-09-30 CI で 5.09 秒かかり落ちた）
vi.setConfig({ testTimeout: 60_000 });

/** BTN と BB が 1bb ずつ上げ合い、`n` 手で Preflop が終わらない形の本文（Flop まで行かない。Hero の Flop 以降の手番は無いので no_spot で断られる） */
function longHand(n: number): Record<string, unknown> {
  const actions: Record<string, unknown>[] = [];
  let to = 2;
  const seats = ['BTN', 'BB'] as const;
  for (let i = 0; i < n; i++) {
    actions.push({ street: 'pf', pos: seats[i % 2], type: 'raise', to });
    to += 1;
  }
  actions.push({ street: 'pf', pos: seats[n % 2], type: 'call' });
  return {
    title: 'long',
    fmt: 'cash',
    sb: 0.5,
    bb: 1,
    ante: 0,
    rake: null,
    stacks: { BTN: 1000, BB: 1000 },
    hero: 'BTN',
    hero_cards: ['As', 'Ks'],
    known_cards: {},
    board: ['2c', '7d', '9h', 'Ts', 'Jc'],
    actions,
    spot_index: 0,
    derived: { street: 'pf', keys: ['fold', 'call', 's1'], s1_label: 'raise', min_to: 1, max_to: 1, pot_base: 1, effective_stack: 1, stop_index: 0 },
  };
}

describe('B 長いハンドの処理時間', () => {
  it('本文の上限（64KB）に収まる最長のハンド: サーバーの検証は 1 秒以内に（断るにしても通すにしても）終わる', () => {
    // 上限に近い Action 数を探す
    let n = 100;
    while (new TextEncoder().encode(JSON.stringify(longHand(n * 2))).length < MAX_BODY_BYTES) n *= 2;
    // 1000bb では 1bb ずつのレイズは 998 回まで（それより長い本文は Stack を超えて断られるだけ）
    const body = longHand(Math.min(n, 998));
    const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
    const t0 = Date.now();
    let code = 'ok';
    try {
      verifyPost(validateInput(JSON.parse(JSON.stringify(body))));
    } catch (e) {
      code = e instanceof Error ? e.message : String(e);
    }
    const ms = Date.now() - t0;
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-perf', { n, bytes, ms, code });
    expect(ms).toBeLessThan(1000);
  });

  it('画面の再生（phaseOf）は、1000bb で最も長い Action 数（999 手）でも 1 回 100ms 以内', () => {
    const d: Draft = { ...emptyDraft(), players: 2, stacks: { ...emptyDraft().stacks, BTN: '1000', BB: '1000' } };
    const b = longHand(998);
    d.actions = (b.actions as { street: 'pf'; pos: 'BTN' | 'BB'; type: 'raise' | 'call'; to?: number }[]).map((a) =>
      a.to === undefined ? { street: a.street, pos: a.pos, type: a.type } : { street: a.street, pos: a.pos, type: a.type, to: Math.round(a.to * 1000) },
    );
    const { setup } = parseSettings(d);
    expect(setup).not.toBeNull();
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) phaseOf(setup, d.actions, []);
    const per = (Date.now() - t0) / 5;
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-perf phaseOf', { actions: d.actions.length, perMs: per });
    expect(per).toBeLessThan(100);
    // spotView も同じくらいの時間
    const t1 = Date.now();
    try {
      spotView(setup!, d.actions, 'BTN', 0);
    } catch {
      // 候補でない（Preflop）
    }
    expect(Date.now() - t1).toBeLessThan(500);
  });
});
