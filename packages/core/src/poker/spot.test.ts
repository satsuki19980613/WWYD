/**
 * 詳細仕様 04 章 §10.5（スポット部分）・10.9〜10.11 のテストケース表（BBOPT / MW / SPOT / PCT）。
 */
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors.ts';
import { mbbToBb } from '../money.ts';
import { runActions } from './replay.ts';
import { pctFromSize, potBaseOf, sizeFromPct, spotCandidates, spotView, stopState, type SpotView } from './spot.ts';
import { advance, legal, nextActor, status, type Action, type State } from './state.ts';
import { acts, mbb, setup } from './testHelpers.ts';

const S100 = setup();

/** アクション `0..n-1` を適用した状態。 */
function stateAt(su: typeof S100, actions: readonly Action[], n: number): State {
  const states = runActions(su, actions.slice(0, n));
  return states[states.length - 1] as State;
}

/** 派生メタを bb で比較しやすい形にする。 */
function derivedBb(v: SpotView) {
  const d = v.derived;
  return {
    street: d.street,
    keys: d.keys,
    s1Label: d.s1Label,
    minTo: d.minTo === null ? null : mbbToBb(d.minTo),
    maxTo: d.maxTo === null ? null : mbbToBb(d.maxTo),
    potBase: mbbToBb(d.potBase),
    effectiveStack: mbbToBb(d.effectiveStack),
    stopIndex: d.stopIndex,
  };
}

/** 停止位置の局面で % pot から to（bb）を求める。 */
function sizeAt(v: SpotView, pct: number): number {
  const d = v.derived;
  if (d.minTo === null || d.maxTo === null) throw new Error('s1 がない');
  return mbbToBb(sizeFromPct(v.state.currentBet, d.potBase, pct, d.minTo, d.maxTo));
}

// ---- H-MW（Hero = CO） ----
const H_MW = acts({
  pf: 'UTG f, HJ f, CO r2.5, BTN c, SB f, BB c',
  flop: 'BB x, CO b3, BTN c, BB r12, CO c, BTN f',
  turn: 'BB x, CO x',
  river: 'BB x, CO x',
});

describe('MW マルチウェイ', () => {
  it('MW-01 フロップは BB から（SB はフォールド済み）', () => {
    const states = runActions(S100, H_MW.slice(0, 6));
    const flop = advance(states[states.length - 1] as State);
    expect(nextActor(flop)).toBe('BB');
  });

  it('MW-02 候補（CO のフロップ以降のアクションすべて）', () => {
    expect(spotCandidates(H_MW, 'CO')).toEqual([{ index: 7 }, { index: 10 }, { index: 13 }, { index: 15 }]);
  });

  it('MW-03 スポット 7（BB x の後の CO の手番）', () => {
    const v = spotView(S100, H_MW, 'CO', 7);
    expect(mbbToBb(v.state.pot)).toBe(8);
    expect(derivedBb(v)).toEqual({
      street: 'flop',
      keys: ['check', 's1'],
      s1Label: 'bet',
      minTo: 1,
      maxTo: 97.5,
      potBase: 8,
      effectiveStack: 100,
      stopIndex: 7,
    });
    expect(v.actual).toBe('s1');
  });

  it('MW-04 スポット 10（BB r12 に向き合う CO。間の BTN c を含む）', () => {
    const v = spotView(S100, H_MW, 'CO', 10);
    expect(mbbToBb(v.state.currentBet)).toBe(12);
    expect(mbbToBb(v.state.minRaise)).toBe(9);
    expect(derivedBb(v)).toMatchObject({
      stopIndex: 10,
      keys: ['fold', 'call', 's1'],
      s1Label: 'raise',
      minTo: 21,
      maxTo: 97.5,
      potBase: 35,
    });
    expect(v.actual).toBe('call');
  });

  it('MW-05 スポット 13（ターンまで advance。BTN はフォールド済み）', () => {
    const v = spotView(S100, H_MW, 'CO', 13);
    expect(mbbToBb(v.state.pot)).toBe(35);
    expect(derivedBb(v)).toEqual({
      street: 'turn',
      keys: ['check', 's1'],
      s1Label: 'bet',
      minTo: 1,
      maxTo: 85.5,
      potBase: 35,
      effectiveStack: 100,
      stopIndex: 13,
    });
    expect(v.actual).toBe('check');
  });
});

// ---- H-S1（Hero = BTN） ----
const H_S1 = acts({
  pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
  flop: 'BB x, BTN b1.8, BB c',
  turn: 'BB x, BTN b6.5, BB c',
  river: 'BB x, BTN b15, BB c',
});

describe('SPOT スポット候補（Hero の手番。2026-09-29）', () => {
  it('SPOT-01 候補', () => {
    expect(spotCandidates(H_S1, 'BTN')).toEqual([{ index: 7 }, { index: 10 }, { index: 13 }]);
  });

  it('SPOT-02 スポット 10（ターンの BTN の手番）', () => {
    const v = spotView(S100, H_S1, 'BTN', 10);
    expect(mbbToBb(v.state.pot)).toBe(9.1);
    expect(mbbToBb(v.state.stacks.BTN)).toBe(95.7);
    expect(derivedBb(v)).toEqual({
      street: 'turn',
      keys: ['check', 's1'],
      s1Label: 'bet',
      minTo: 1,
      maxTo: 95.7,
      potBase: 9.1,
      effectiveStack: 100,
      stopIndex: 10,
    });
    expect(sizeAt(v, 50)).toBe(4.55);
    expect(v.actual).toBe('s1');
  });

  it('SPOT-03 H-S1 の BTN r2.5 の後の SB の局面（ポット基準）', () => {
    const s = stateAt(S100, H_S1, 4);
    expect(mbbToBb(s.currentBet - s.bets.SB)).toBe(2);
    expect(mbbToBb(potBaseOf(s, 'SB'))).toBe(6);
    expect(legal(s, 'SB').raise).toEqual({ min: mbb(4), max: mbb(100) });
  });

  it('SPOT-04 H-S1 の BB の局面（フォールドした SB の 0.5 を含む）', () => {
    const s = stateAt(S100, H_S1, 5);
    expect(mbbToBb(s.currentBet - s.bets.BB)).toBe(1.5);
    expect(mbbToBb(potBaseOf(s, 'BB'))).toBe(5.5);
  });

  it('SPOT-05 ベットに向き合う Hero（BB が Hero のとき、スポット 11）', () => {
    const v = spotView(S100, H_S1, 'BB', 11);
    expect(mbbToBb(v.state.bets.BTN)).toBe(6.5);
    expect(derivedBb(v)).toMatchObject({
      street: 'turn',
      keys: ['fold', 'call', 's1'],
      s1Label: 'raise',
      minTo: 13,
      maxTo: 95.7,
      potBase: 22.1,
    });
    expect(sizeAt(v, 50)).toBe(17.55);
    expect(v.actual).toBe('call');
  });

  it('SPOT-06 プリフロップだけのフォールドは候補外。フロップ以降のフォールドは候補', () => {
    expect(spotCandidates(acts({ pf: 'UTG..SB f' }), 'SB')).toEqual([]);
    const actions = acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB b3, BTN f' });
    expect(spotCandidates(actions, 'BTN')).toEqual([{ index: 7 }]);
    const v = spotView(S100, actions, 'BTN', 7);
    expect(derivedBb(v)).toMatchObject({ keys: ['fold', 'call', 's1'], potBase: 11.5 });
    expect(v.actual).toBe('fold');
  });

  it('SPOT-07 ハンドの最後の Hero のアクションも候補（後続のアクションは要らない）', () => {
    const actions = acts({ pf: 'UTG..HJ f, CO r2.5, BTN f, SB f, BB c', flop: 'BB b3, CO c' });
    expect(spotCandidates(actions, 'CO')).toEqual([{ index: 7 }]);
  });

  it('SPOT-08 Hero のオールイン', () => {
    const actions = acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN b97.5, BB c' });
    expect(spotCandidates(actions, 'BTN')).toEqual([{ index: 7 }]);
    const v = spotView(S100, actions, 'BTN', 7);
    expect(derivedBb(v)).toMatchObject({ keys: ['check', 's1'], s1Label: 'bet', maxTo: 97.5, potBase: 5.5 });
    expect(v.actual).toBe('s1');
  });

  const H_S3_SETUP = setup({ UTG: 30, HJ: 22, CO: 45, BTN: 18, SB: 26, BB: 24 }, { ante: 0.125 });
  const H_S3 = acts({
    pf: 'UTG f, HJ r2.1, CO f, BTN f, SB f, BB c',
    flop: 'BB b3, HJ c',
    turn: 'BB x, HJ x',
    river: 'BB x, HJ x',
  });

  it('SPOT-09 MTT の見本（H-S3。実効スタックは Hero と残った相手の小さい方）', () => {
    const v = spotView(H_S3_SETUP, H_S3, 'BB', 6);
    expect(mbbToBb(v.state.pot)).toBe(5.45);
    expect(derivedBb(v)).toMatchObject({
      keys: ['check', 's1'],
      minTo: 1,
      maxTo: 21.775,
      potBase: 5.45,
      effectiveStack: 22,
    });
  });

  it('SPOT-10 実効スタックは残った相手のうち最も深い席で決める（フォールドした席は見ない）', () => {
    const su = setup({ UTG: 30, HJ: 80, CO: 45, BTN: 100, SB: 26, BB: 60 });
    const actions = acts({ pf: 'UTG f, HJ c, CO f, BTN r3, SB f, BB c, HJ c', flop: 'BB x, HJ x, BTN b5, BB f, HJ c' });
    // フロップの BTN の手番: 残りは BB 60・HJ 80 → min(100, 80)
    expect(spotView(su, actions, 'BTN', 9).derived.effectiveStack).toBe(mbb(80));
  });

  it('SPOT-11 プリフロップの Hero のアクションは候補外（フロップ以降だけを出題する）', () => {
    expect(spotCandidates(acts({ pf: 'UTG..CO f, BTN r100, SB f, BB c' }), 'BTN')).toEqual([]);
    expect(() => spotView(S100, H_S1, 'BTN', 3)).toThrow(ValidationError);
  });

  it('候補でないスポット', () => {
    const code = (fn: () => unknown): string | undefined => {
      try {
        fn();
      } catch (e) {
        return (e as ValidationError).code;
      }
      return undefined;
    };
    expect(code(() => spotView(S100, H_MW, 'CO', 16))).toBe('invalid_spot');
    expect(code(() => spotView(S100, H_MW, 'CO', 0))).toBe('invalid_spot');
    expect(code(() => spotView(S100, H_MW, 'CO', 8))).toBe('invalid_spot');
  });

  it('PCT-09 H-S3 の % pot（HJ が BB b3 に向き合う局面）', () => {
    const s = stateAt(H_S3_SETUP, H_S3, 7);
    const base = potBaseOf(s, 'HJ');
    const raise = legal(s, 'HJ').raise;
    if (!raise) throw new Error('raise が無い');
    expect(mbbToBb(base)).toBe(11.45);
    const sizes = [50, 33, 75, 125].map((p) => mbbToBb(sizeFromPct(s.currentBet, base, p, raise.min, raise.max)));
    expect(sizes).toEqual([8.73, 6.78, 11.59, 17.31]);
  });
});

describe('BBOPT のスポットと PCT', () => {
  /** BB オプションの局面で % pot から to（bb）を求める（プリフロップは出題しないが、% pot の計算は同じ）。 */
  const bbOption = (pf: string) => {
    const s = stateAt(S100, acts({ pf }), acts({ pf }).length);
    const raise = legal(s, 'BB').raise;
    if (!raise) throw new Error('raise が無い');
    const base = potBaseOf(s, 'BB');
    return { s, base, raise, size: (p: number) => mbbToBb(sizeFromPct(s.currentBet, base, p, raise.min, raise.max)) };
  };

  it('BBOPT-01 / PCT-05', () => {
    const o = bbOption('UTG..BTN f, SB c');
    expect(legal(o.s, 'BB').check).toBe(true);
    expect(mbbToBb(o.base)).toBe(2);
    expect(mbbToBb(o.raise.min)).toBe(2);
    expect([33, 50, 75, 125].map(o.size)).toEqual([2, 2, 2.5, 3.5]);
  });

  it('BBOPT-02 / PCT-02（§6.6 例 2）', () => {
    const o = bbOption('UTG c, HJ c, CO f, BTN f, SB c');
    expect(mbbToBb(o.s.currentBet)).toBe(1);
    expect(mbbToBb(o.base)).toBe(4);
    expect(mbbToBb(o.raise.min)).toBe(2);
    expect(o.size(50)).toBe(3);
    expect(o.size(33)).toBe(2.32);
    expect(o.size(125)).toBe(6);
  });
});

describe('PCT % pot', () => {
  it('PCT-01 SPOT-05 の 50%', () => {
    expect(sizeAt(spotView(S100, H_S1, 'BB', 11), 50)).toBe(17.55);
  });

  it('PCT-03 フロップのベット（pot 5.5）', () => {
    const states = runActions(S100, acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c' }));
    const flop = advance(states[states.length - 1] as State);
    const base = potBaseOf(flop, 'BB');
    expect(mbbToBb(base)).toBe(5.5);
    const bet = legal(flop, 'BB').bet;
    if (!bet) throw new Error('bet が無い');
    expect([33, 50, 75, 125].map((p) => mbbToBb(sizeFromPct(0, base, p, bet.min, bet.max)))).toEqual([1.82, 2.75, 4.13, 6.88]);
  });

  it('PCT-04 最大額に収める', () => {
    const su = setup({}, { all: 20 });
    const states = runActions(su, acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN b5.5, BB c' }));
    const turn = advance(states[states.length - 1] as State);
    expect(status(turn)).toEqual({ kind: 'act', pos: 'BB' });
    expect(mbbToBb(turn.pot)).toBe(16.5);
    expect(mbbToBb(turn.stacks.BB)).toBe(12);
    const bet = legal(turn, 'BB').bet;
    if (!bet) throw new Error('bet が無い');
    const base = potBaseOf(turn, 'BB');
    expect([33, 50, 75, 125].map((p) => mbbToBb(sizeFromPct(0, base, p, bet.min, bet.max)))).toEqual([5.45, 8.25, 12, 12]);
  });

  it('PCT-06 スタック不足のコールはスタック全額でポット基準を作る', () => {
    const actions = acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN b6.5, BB c' });
    // Hero（BB。残り 4.5）が BTN b6.5 に向き合う
    const v = spotView(setup({ BB: 7 }), actions, 'BB', 8);
    expect(derivedBb(v)).toMatchObject({ potBase: 16.5, keys: ['fold', 'call'], effectiveStack: 7 });
  });

  it('PCT-07 / PCT-08 逆算', () => {
    const v = spotView(S100, H_S1, 'BB', 11);
    const d = v.derived;
    expect(pctFromSize(v.state.currentBet, d.potBase, mbb(13), mbb(95.7))).toBe(29);
    expect(pctFromSize(v.state.currentBet, d.potBase, mbb(95.7), mbb(95.7))).toBe('allin');
  });
});

describe('stopState 切り詰めたアクション列から停止位置の状態', () => {
  it('ストリートをまたぐスポット（フロップの BTN c でストリートが終わり、ターンの Hero = BB の手番）', () => {
    const actions = acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB b3, BTN c', turn: 'BB x, BTN x' });
    const v = spotView(S100, actions, 'BB', 8);
    expect(v.derived.stopIndex).toBe(8);
    // 未回答者に返る形（停止位置より後を除いた列）でも同じ状態になる
    const s = stopState(S100, actions.slice(0, v.derived.stopIndex), v.derived.stopIndex, v.derived.street);
    expect(s).toEqual(v.state);
    expect(s.street).toBe('turn');
    expect(status(s)).toEqual({ kind: 'act', pos: 'BB' });
  });

  it('同じストリートのスポット（H-S1）', () => {
    const v = spotView(S100, H_S1, 'BTN', 10);
    expect(stopState(S100, H_S1.slice(0, 10), 10, 'turn')).toEqual(v.state);
  });
});
