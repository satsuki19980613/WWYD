/**
 * Spot Read の Action の決め方（詳細仕様 18 章 §10.3。RA-01〜）と、情報を登録できる席（§10 B-2）。
 */
import { describe, expect, it } from 'vitest';
import { hmw, hs1 } from '../post/postFixtures.ts';
import { classifyActions, leansOf, readCandidates, sizesOf, STREET_ACTIONS, villainSeats } from './readActions.ts';
import type { Action } from './state.ts';
import { acts, setup } from './testHelpers.ts';

const S = setup();

/** 当たった Action だけを「席 Action（Size）」で並べる */
function named(actions: Action[]): string[] {
  return classifyActions(S, actions)
    .filter((c) => c !== null)
    .map((c) => `${c.pos} ${c.action}${c.size ? ` ${c.size}` : ''}${c.checkRaise ? ' xr' : ''}`);
}

describe('RA Action の決め方', () => {
  it('RA-01 Fold to Steal・C-Bet・Barrel（H-S1）。Call・Check・最初の Raise は候補にしない', () => {
    expect(
      named(
        acts({
          pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
          flop: 'BB x, BTN b1.8, BB c',
          turn: 'BB x, BTN b6.5, BB c',
          river: 'BB x, BTN b15, BB c',
        }),
      ),
    ).toEqual(['SB fold_steal', 'BTN cbet small', 'BTN barrel big', 'BTN barrel big']);
  });

  it('RA-02 Limp・Squeeze・Fold to 3-Bet（Limp があると Steal ではない）', () => {
    expect(named(acts({ pf: 'UTG c, HJ r4, CO c, BTN r15, SB f, BB f, UTG f, HJ f, CO f' }))).toEqual([
      'UTG limp',
      'BTN squeeze',
      'HJ fold_3bet',
    ]);
  });

  it('RA-03 3-Bet・4-Bet・Fold to 4-Bet。3-Bet の後の Blind の Fold は Fold to Steal ではない', () => {
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB r11, BB f, BTN r25, SB f' }))).toEqual(['SB 3bet', 'BTN 4bet', 'SB fold_4bet']);
  });

  it('RA-04 UTG・HJ のオープンへの Blind の Fold は Fold to Steal ではない', () => {
    expect(named(acts({ pf: 'UTG r2.5, HJ..SB f, BB f' }))).toEqual([]);
  });

  it('RA-05 Probe・Bet vs Check・Check-Raise・Fold to Raise', () => {
    expect(
      named(
        acts({
          pf: 'UTG..HJ f, CO r2.5, BTN f, SB f, BB c',
          flop: 'BB x, CO x',
          turn: 'BB b3, CO c',
          river: 'BB x, CO b10, BB r30, CO f',
        }),
      ),
    ).toEqual(['SB fold_steal', 'BB probe big', 'CO bet_vs_check big', 'BB raise big xr', 'CO fold_raise']);
  });

  it('RA-06 Donk と、それへの Raise（Check していないので Check-Raise ではない）', () => {
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB b2, BTN r6, BB f' }))).toEqual([
      'SB fold_steal',
      'BB donk small',
      'BTN raise small',
      'BB fold_raise',
    ]);
  });

  it('RA-07 Delayed C-Bet と Fold to Barrel、Fold to C-Bet', () => {
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN x', turn: 'BB x, BTN b3, BB f' }))).toEqual([
      'SB fold_steal',
      'BTN delayed_cbet big',
      'BB fold_barrel',
    ]);
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN b2, BB f' }))).toEqual([
      'SB fold_steal',
      'BTN cbet small',
      'BB fold_cbet',
    ]);
  });

  it('RA-08 Limp のポットで最初に動く席の Bet は候補にしない。それへの Fold は Fold to Bet', () => {
    expect(named(acts({ pf: 'UTG..BTN f, SB c, BB x', flop: 'SB b1, BB f' }))).toEqual(['SB limp', 'BB fold_bet']);
  });

  it('RA-09 Size の境目（Pot 5.5 に対して 50% 未満 Small・100% まで Big・超えると Overbet）', () => {
    const size = (bet: number): string | null | undefined =>
      classifyActions(S, acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: `BB x, BTN b${bet}` }))[7]?.size;
    expect(size(2.7)).toBe('small');
    expect(size(2.75)).toBe('big');
    expect(size(5.5)).toBe('big');
    expect(size(5.6)).toBe('overbet');
  });

  it('RA-10 Spot Read の候補は判断地点より前の、Hero 以外の Action だけ', () => {
    const a = acts({
      pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
      flop: 'BB x, BTN b1.8, BB c',
      turn: 'BB x, BTN b6.5, BB c',
      river: 'BB x, BTN b15, BB c',
    });
    // Hero = BB、判断地点はターンの BB の手番（BTN b6.5 に向き合う。添字 11）
    expect(readCandidates(S, a, 'BB', 11).map((c) => `${c.index} ${c.pos} ${c.action}`)).toEqual(['4 SB fold_steal', '7 BTN cbet', '10 BTN barrel']);
    // Hero = BTN、判断地点はターンの BTN の手番（添字 10）。BTN 自身の Action は出さない
    expect(readCandidates(S, a, 'BTN', 10).map((c) => c.action)).toEqual(['fold_steal']);
  });
});

describe('RA 表と登録できる席', () => {
  it('RA-11 C-Bet は Flop だけ、Delayed C-Bet は Turn だけ。Fold 系は Over・Under だけ。Preflop の Size に Overbet は無い', () => {
    expect(STREET_ACTIONS.flop).toContain('cbet');
    expect(STREET_ACTIONS.turn).not.toContain('cbet');
    expect(STREET_ACTIONS.turn).toContain('delayed_cbet');
    expect(STREET_ACTIONS.river).not.toContain('delayed_cbet');
    expect(leansOf('fold_bet')).toEqual(['over', 'under']);
    expect(leansOf('3bet')).toEqual(['over', 'under', 'value', 'bluff']);
    expect(sizesOf('pf')).toEqual(['small', 'big']);
  });

  it('RA-12 登録できる席: Preflop で Fold 以外をした席と、Fold to Steal の Blind（Hero は除く）', () => {
    const h1 = hs1();
    const a1 = acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c' });
    expect(villainSeats(S, a1, h1.hero as 'BTN')).toEqual(['SB', 'BB']);
    // Steal に BTN が Call したあとの SB の Fold は Fold to Steal ではないので、SB は登録できない（V-002）
    expect(villainSeats(S, acts({ pf: 'UTG f, HJ f, CO r2.5, BTN c, SB f, BB c' }), hmw().hero as 'CO')).toEqual(['BTN', 'BB']);
    expect(villainSeats(S, acts({ pf: 'UTG r2.5, HJ..SB f, BB c' }), 'BB')).toEqual(['UTG']);
  });
});

describe('RA villain-reads-test の指摘（2026-09-30 さつき）', () => {
  it('RA-13 Steal に Call が入ったら、Blind の Fold は Fold to Steal にしない（PT4 の定義。V-002）', () => {
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB f' }))).toEqual([]);
    expect(named(acts({ pf: 'UTG..HJ f, CO r2.5, BTN c, SB f, BB f' }))).toEqual([]);
    expect(villainSeats(S, acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB f' }), 'BTN')).toEqual(['SB']);
    // Call が無ければ今までどおり
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB f' }))).toEqual(['SB fold_steal', 'BB fold_steal']);
  });

  it('RA-14 前の Street で All-in した Aggressor への Bet は Donk・Probe にしない（V-003）', () => {
    const st = setup({ BTN: 20 });
    const a = acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB c', flop: 'SB x, BB x, BTN b17.5, SB c, BB c', turn: 'SB b10, BB f' });
    const got = classifyActions(st, a)
      .filter((c) => c !== null)
      .map((c) => `${c.pos} ${c.action}`);
    // 最初に動く SB の Bet は Check が先に無いので候補にしない。BB の Fold は Bet への Fold
    expect(got).toEqual(['BTN cbet', 'BB fold_bet']);
    // All-in でない Aggressor なら今までどおり Donk
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB c', flop: 'SB x, BB x, BTN b3, SB c, BB c', turn: 'SB b10, BB f' }))).toContain('SB donk big');
  });
});
