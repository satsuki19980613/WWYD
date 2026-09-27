/**
 * 詳細仕様 04 章 §10.5（スポット部分）・10.9〜10.11 のテストケース表（BBOPT / MW / SPOT / PCT）。
 */
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors.ts';
import { mbbToBb } from '../money.ts';
import { runActions } from './replay.ts';
import { pctFromSize, potBaseOf, sizeFromPct, spotCandidates, spotView, type SpotView } from './spot.ts';
import { advance, legal, nextActor, status, type State } from './state.ts';
import { acts, mbb, setup } from './testHelpers.ts';

const S100 = setup();

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

  it('MW-02 候補', () => {
    expect(spotCandidates(H_MW, 'CO')).toEqual([
      { index: 2, villains: ['BTN', 'SB', 'BB'] },
      { index: 7, villains: ['BTN', 'BB'] },
      { index: 10, villains: ['BTN', 'BB'] },
      { index: 13, villains: ['BB'] },
    ]);
  });

  it('MW-03 スポット 7 / BB（間の BTN c を含む）', () => {
    const v = spotView(S100, H_MW, 'CO', 7, 'BB');
    expect(mbbToBb(v.state.pot)).toBe(8);
    expect(mbbToBb(v.state.bets.CO)).toBe(3);
    expect(mbbToBb(v.state.bets.BTN)).toBe(3);
    expect(derivedBb(v)).toEqual({
      street: 'flop',
      keys: ['fold', 'call', 's1'],
      s1Label: 'raise',
      minTo: 6,
      maxTo: 97.5,
      potBase: 17,
      effectiveStack: 100,
      stopIndex: 9,
    });
    expect(v.actual).toBe('s1');
  });

  it('MW-04 スポット 7 / BTN', () => {
    const v = spotView(S100, H_MW, 'CO', 7, 'BTN');
    expect(derivedBb(v)).toMatchObject({ stopIndex: 8, potBase: 14, minTo: 6, maxTo: 97.5 });
    expect(v.actual).toBe('call');
  });

  it('MW-05 スポット 10 / BTN（有効なレイズで再オープン済み）', () => {
    const v = spotView(S100, H_MW, 'CO', 10, 'BTN');
    expect(mbbToBb(v.state.currentBet)).toBe(12);
    expect(mbbToBb(v.state.minRaise)).toBe(9);
    expect(derivedBb(v)).toMatchObject({ stopIndex: 11, keys: ['fold', 'call', 's1'], minTo: 21, maxTo: 97.5, potBase: 44 });
    expect(v.actual).toBe('fold');
  });

  it('MW-06 スポット 10 / BB（ターンまで advance）', () => {
    const v = spotView(S100, H_MW, 'CO', 10, 'BB');
    expect(mbbToBb(v.state.pot)).toBe(35);
    expect(derivedBb(v)).toEqual({
      street: 'turn',
      keys: ['check', 's1'],
      s1Label: 'bet',
      minTo: 1,
      maxTo: 85.5,
      potBase: 35,
      effectiveStack: 100,
      stopIndex: 12,
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

describe('SPOT スポット候補', () => {
  it('SPOT-01 候補', () => {
    expect(spotCandidates(H_S1, 'BTN')).toEqual([
      { index: 3, villains: ['SB', 'BB'] },
      { index: 7, villains: ['BB'] },
      { index: 10, villains: ['BB'] },
      { index: 13, villains: ['BB'] },
    ]);
  });

  it('SPOT-02 スポット 10 / BB（§6.6 例 1）', () => {
    const v = spotView(S100, H_S1, 'BTN', 10, 'BB');
    expect(mbbToBb(v.state.pot)).toBe(9.1);
    expect(mbbToBb(v.state.bets.BTN)).toBe(6.5);
    expect(mbbToBb(v.state.stacks.BB)).toBe(95.7);
    expect(derivedBb(v)).toEqual({
      street: 'turn',
      keys: ['fold', 'call', 's1'],
      s1Label: 'raise',
      minTo: 13,
      maxTo: 95.7,
      potBase: 22.1,
      effectiveStack: 100,
      stopIndex: 11,
    });
    expect(sizeAt(v, 50)).toBe(17.55);
  });

  it('SPOT-03 スポット 3 / SB', () => {
    const v = spotView(S100, H_S1, 'BTN', 3, 'SB');
    expect(mbbToBb(v.state.currentBet - v.state.bets.SB)).toBe(2);
    expect(derivedBb(v)).toMatchObject({ stopIndex: 4, minTo: 4, maxTo: 100, potBase: 6 });
  });

  it('SPOT-04 スポット 3 / BB（フォールドした SB の 0.5 を含む）', () => {
    const v = spotView(S100, H_S1, 'BTN', 3, 'BB');
    expect(mbbToBb(v.state.currentBet - v.state.bets.BB)).toBe(1.5);
    expect(derivedBb(v)).toMatchObject({ stopIndex: 5, minTo: 4, maxTo: 100, potBase: 5.5 });
  });

  it('SPOT-05 スポット 13 / BB', () => {
    const v = spotView(S100, H_S1, 'BTN', 13, 'BB');
    expect(mbbToBb(v.state.pot)).toBe(22.1);
    expect(mbbToBb(v.state.bets.BTN)).toBe(15);
    expect(mbbToBb(v.state.stacks.BB)).toBe(89.2);
    expect(derivedBb(v)).toMatchObject({ street: 'river', minTo: 30, maxTo: 89.2, potBase: 52.1 });
  });

  it('SPOT-06 フォールドは候補外', () => {
    expect(spotCandidates(acts({ pf: 'UTG..SB f' }), 'SB')).toEqual([]);
  });

  it('SPOT-07 直後が Hero 自身のアクションなら候補外', () => {
    const actions = acts({ pf: 'UTG..HJ f, CO r2.5, BTN f, SB f, BB c', flop: 'BB x, CO b3, BB f' });
    expect(spotCandidates(actions, 'BB')).toEqual([{ index: 6, villains: ['CO'] }]);
  });

  it('SPOT-08 Hero のオールイン（区間はハンドの最後まで）', () => {
    const actions = acts({ pf: 'UTG..CO f, BTN r100, SB f, BB c' });
    expect(spotCandidates(actions, 'BTN')).toEqual([{ index: 3, villains: ['SB', 'BB'] }]);
    const v = spotView(S100, actions, 'BTN', 3, 'BB');
    expect(derivedBb(v)).toMatchObject({ keys: ['fold', 'call'], s1Label: null, minTo: null, maxTo: null, potBase: 200.5 });
  });

  const H_S3_SETUP = setup({ UTG: 30, HJ: 22, CO: 45, BTN: 18, SB: 26, BB: 24 }, { ante: 0.125 });
  const H_S3 = acts({
    pf: 'UTG f, HJ r2.1, CO f, BTN f, SB f, BB c',
    flop: 'BB b3, HJ c',
    turn: 'BB x, HJ x',
    river: 'BB x, HJ x',
  });

  it('SPOT-09 MTT の見本（H-S3）', () => {
    const v = spotView(H_S3_SETUP, H_S3, 'BB', 6, 'HJ');
    expect(mbbToBb(v.state.pot)).toBe(5.45);
    expect(mbbToBb(v.state.stacks.HJ)).toBe(19.775);
    expect(derivedBb(v)).toMatchObject({
      keys: ['fold', 'call', 's1'],
      minTo: 6,
      maxTo: 19.775,
      potBase: 11.45,
      effectiveStack: 22,
    });
  });

  it('SPOT-10 区間に 2 回現れる Villain は最初の 1 回で止める', () => {
    // H-S1 スポット 3 の区間は `SB f, BB c, BB x`（BB が 2 回）
    expect(spotView(S100, H_S1, 'BTN', 3, 'BB').derived.stopIndex).toBe(5);
  });

  it('候補でないスポット・席', () => {
    const code = (fn: () => unknown): string | undefined => {
      try {
        fn();
      } catch (e) {
        return (e as ValidationError).code;
      }
      return undefined;
    };
    expect(code(() => spotView(S100, H_MW, 'CO', 15, 'BB'))).toBe('invalid_spot');
    expect(code(() => spotView(S100, H_MW, 'CO', 0, 'BB'))).toBe('invalid_spot');
    expect(code(() => spotView(S100, H_MW, 'CO', 13, 'BTN'))).toBe('invalid_villain');
  });

  it('PCT-09 H-S3 の % pot', () => {
    const v = spotView(H_S3_SETUP, H_S3, 'BB', 6, 'HJ');
    expect([50, 33, 75, 125].map((p) => sizeAt(v, p))).toEqual([8.73, 6.78, 11.59, 17.31]);
  });
});

describe('BBOPT のスポットと PCT', () => {
  it('BBOPT-01 / PCT-05', () => {
    const v = spotView(S100, acts({ pf: 'UTG..BTN f, SB c, BB x' }), 'SB', 4, 'BB');
    expect(derivedBb(v)).toMatchObject({ keys: ['check', 's1'], s1Label: 'raise', potBase: 2, minTo: 2 });
    expect([33, 50, 75, 125].map((p) => sizeAt(v, p))).toEqual([2, 2, 2.5, 3.5]);
  });

  it('BBOPT-02 / PCT-02（§6.6 例 2）', () => {
    const v = spotView(S100, acts({ pf: 'UTG c, HJ c, CO f, BTN f, SB c, BB x' }), 'SB', 4, 'BB');
    expect(mbbToBb(v.state.currentBet)).toBe(1);
    expect(derivedBb(v)).toMatchObject({ potBase: 4, minTo: 2 });
    expect(sizeAt(v, 50)).toBe(3);
    expect(sizeAt(v, 33)).toBe(2.32);
    expect(sizeAt(v, 125)).toBe(6);
  });
});

describe('PCT % pot', () => {
  it('PCT-01 SPOT-02 の 50%', () => {
    expect(sizeAt(spotView(S100, H_S1, 'BTN', 10, 'BB'), 50)).toBe(17.55);
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
    const v = spotView(setup({ BB: 7 }), actions, 'BTN', 7, 'BB');
    expect(derivedBb(v)).toMatchObject({ potBase: 16.5, keys: ['fold', 'call'], effectiveStack: 7 });
  });

  it('PCT-07 / PCT-08 逆算', () => {
    const v = spotView(S100, H_S1, 'BTN', 10, 'BB');
    const d = v.derived;
    expect(pctFromSize(v.state.currentBet, d.potBase, mbb(13), mbb(95.7))).toBe(29);
    expect(pctFromSize(v.state.currentBet, d.potBase, mbb(95.7), mbb(95.7))).toBe('allin');
  });
});
