import { describe, expect, it } from 'vitest';
import { playerCountOf, SEATS_BY_COUNT } from '../constants.ts';
import { ValidationError } from '../errors.ts';
import { mbbToBb } from '../money.ts';
import { validateInput } from '../post/validateInput.ts';
import { verifyPost } from '../post/verifyPost.ts';
import { hs1 } from '../post/postFixtures.ts';
import { replay, runActions } from './replay.ts';
import { spotCandidates, spotView } from './spot.ts';
import { advance, initialState, seatedOf, status, type Action, type State } from './state.ts';
import { acts, mbb, setup } from './testHelpers.ts';

/** 空席をスタック 0 にした設定（金額は bb） */
const seatsSetup = (n: 2 | 3 | 4 | 5, opts: { ante?: number } = {}) => {
  const stacks: Record<string, number> = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 };
  for (const p of SEATS_BY_COUNT[n]) stacks[p] = 100;
  return setup(stacks, opts);
};
const last = (xs: State[]): State => xs[xs.length - 1] as State;

describe('人数ごとの席（04 章 §2.1）', () => {
  it('早い席から削る。2 人は BTN と BB', () => {
    expect(SEATS_BY_COUNT[5]).toEqual(['HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(SEATS_BY_COUNT[4]).toEqual(['CO', 'BTN', 'SB', 'BB']);
    expect(SEATS_BY_COUNT[3]).toEqual(['BTN', 'SB', 'BB']);
    expect(SEATS_BY_COUNT[2]).toEqual(['BTN', 'BB']);
  });
  it('席の並びから人数（順番は問わない。どれとも一致しなければ null）', () => {
    expect(playerCountOf(['BB', 'BTN'])).toBe(2);
    expect(playerCountOf(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'])).toBe(6);
    expect(playerCountOf(['SB', 'BB'])).toBeNull();
    expect(playerCountOf(['UTG', 'BTN', 'SB', 'BB'])).toBeNull();
    expect(playerCountOf([])).toBeNull();
  });
});

describe('空席', () => {
  it('空席は最初からフォールド扱いで、アンティを払わない', () => {
    const s = initialState(seatsSetup(4, { ante: 0.1 }));
    expect(s.seated).toEqual(['CO', 'BTN', 'SB', 'BB']);
    expect([...s.folded].sort()).toEqual(['HJ', 'UTG']);
    expect(s.pot).toBe(mbb(0.4));
    expect(s.allin.size).toBe(0);
  });
  it('5 人はプリフロップを HJ から', () => {
    expect(status(initialState(seatsSetup(5)))).toEqual({ kind: 'act', pos: 'HJ' });
  });
  it('3 人はプリフロップ BTN → SB → BB、フロップ SB → BB → BTN', () => {
    const su = seatsSetup(3);
    const states = runActions(su, acts({ pf: 'BTN c, SB c' }));
    expect(status(last(states))).toEqual({ kind: 'act', pos: 'BB' });
    const flop = advance(last(runActions(su, acts({ pf: 'BTN c, SB c, BB x' }))));
    expect(status(flop)).toEqual({ kind: 'act', pos: 'SB' });
  });
});

describe('ヘッズアップ（2 人。BTN が SB を払う）', () => {
  const su = seatsSetup(2);
  it('BTN が SB、BB が BB を払い、プリフロップは BTN から', () => {
    const s = initialState(su);
    expect(seatedOf(su)).toEqual(['BTN', 'BB']);
    expect(s.bets.BTN).toBe(mbb(0.5));
    expect(s.bets.BB).toBe(mbb(1));
    expect(s.bets.SB).toBe(0);
    expect(status(s)).toEqual({ kind: 'act', pos: 'BTN' });
  });
  it('BTN のリンプに BB はチェックできる（オプション）', () => {
    const s = last(runActions(su, acts({ pf: 'BTN c' })));
    expect(status(s)).toEqual({ kind: 'act', pos: 'BB' });
    expect(status(last(runActions(su, acts({ pf: 'BTN c, BB x' }))))).toEqual({ kind: 'streetEnd' });
  });
  it('フロップ以降は BB から', () => {
    const flop = advance(last(runActions(su, acts({ pf: 'BTN r2.5, BB c' }))));
    expect(status(flop)).toEqual({ kind: 'act', pos: 'BB' });
    const turn = advance(last(runActions(su, acts({ pf: 'BTN r2.5, BB c', flop: 'BB x, BTN x' }))));
    expect(status(turn)).toEqual({ kind: 'act', pos: 'BB' });
  });
  it('BTN がフォールドすると BB の勝ち', () => {
    expect(replay(su, acts({ pf: 'BTN f' }), 0).result).toEqual({ kind: 'over', winner: 'BB' });
  });
  it('BTN のフロップ以降のアクションが出題の候補になる', () => {
    const a = acts({ pf: 'BTN r2.5, BB c', flop: 'BB x, BTN b1.8, BB c' });
    expect(spotCandidates(a, 'BTN')).toEqual([{ index: 3 }]);
  });
});

/** hs1 の形で、席と行動だけを差し替えた投稿（派生メタは spotView で作る） */
function rawPost(stacks: Record<string, number>, actions: Action[], hero: string, spotIndex: number) {
  const full: Record<string, number> = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0, ...stacks };
  const su = setup(full);
  const v = spotView(su, actions, hero as 'BTN', spotIndex);
  const bb = (m: number | null) => (m === null ? null : mbbToBb(m));
  return {
    ...hs1(),
    stacks,
    hero,
    known_cards: {},
    board: ['Kh', '8d', '3c'],
    actions: actions.map((x) => (x.to === undefined ? { ...x } : { ...x, to: mbbToBb(x.to) })),
    spot_index: spotIndex,
    derived: {
      street: v.derived.street,
      keys: v.derived.keys,
      s1_label: v.derived.s1Label,
      min_to: bb(v.derived.minTo),
      max_to: bb(v.derived.maxTo),
      pot_base: mbbToBb(v.derived.potBase),
      effective_stack: mbbToBb(v.derived.effectiveStack),
      stop_index: v.derived.stopIndex,
    },
  };
}

const codeOf = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return e instanceof ValidationError ? e.code : 'other';
  }
};

describe('投稿の検証（2〜6 人）', () => {
  const hu = acts({ pf: 'BTN r2.5, BB c', flop: 'BB x, BTN b1.8, BB f' });
  it('ヘッズアップの投稿が通り、空席のスタックは 0', () => {
    const p = validateInput(rawPost({ BTN: 100, BB: 100 }, hu, 'BTN', 3));
    expect(p.setup.stacks.UTG).toBe(0);
    expect(p.setup.stacks.BTN).toBe(mbb(100));
    expect(() => verifyPost(p)).not.toThrow();
  });
  it('人数ごとの席と一致しない席の組み合わせは invalid_settings', () => {
    expect(codeOf(() => validateInput(rawPost({ BTN: 100, BB: 100 }, hu, 'BTN', 3)))).toBeNull();
    const bad = { ...rawPost({ BTN: 100, BB: 100 }, hu, 'BTN', 3), stacks: { SB: 100, BB: 100 } };
    expect(codeOf(() => validateInput(bad))).toBe('invalid_settings');
  });
  it('座っていない Hero は invalid_settings、座っていない席のハンドは malformed', () => {
    const base = rawPost({ BTN: 100, BB: 100 }, hu, 'BTN', 3);
    expect(codeOf(() => validateInput({ ...base, hero: 'CO' }))).toBe('invalid_settings');
    expect(codeOf(() => validateInput({ ...base, known_cards: { SB: ['2c', '2d'] } }))).toBe('malformed');
  });
});
