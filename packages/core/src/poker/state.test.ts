/**
 * 詳細仕様 04 章 §10.1〜10.8 のテストケース表（INIT / LEGAL / RAISE / INC / BBOPT / ANTE / RUN / END）。
 * 金額は bb で書き、比較のときに mbb へ変換する。
 */
import { describe, expect, it } from 'vitest';
import type { Pos } from '../constants.ts';
import { ValidationError, type ValidationCode } from '../errors.ts';
import { mbbToBb } from '../money.ts';
import { replay, runActions } from './replay.ts';
import { advance, legal, nextActor, status, totalPot, type Action, type HandSetup, type State } from './state.ts';
import { acts, setup } from './testHelpers.ts';

/** アクションを適用し、ストリートが終わっていれば次のストリートまで進めた状態。 */
function at(su: HandSetup, actions: Action[]): State {
  const states = runActions(su, actions);
  let s = states[states.length - 1] as State;
  while (status(s).kind === 'streetEnd') s = advance(s);
  return s;
}

type LegalBb = {
  fold?: true;
  check?: true;
  call?: number;
  bet?: [number, number];
  raise?: [number, number];
};

function legalBb(s: State, p: Pos): LegalBb {
  const lg = legal(s, p);
  const out: LegalBb = {};
  if (lg.fold) out.fold = true;
  if (lg.check) out.check = true;
  if (lg.call !== null) out.call = mbbToBb(lg.call);
  if (lg.bet) out.bet = [mbbToBb(lg.bet.min), mbbToBb(lg.bet.max)];
  if (lg.raise) out.raise = [mbbToBb(lg.raise.min), mbbToBb(lg.raise.max)];
  return out;
}

function bbRecord(r: Record<Pos, number>): Record<Pos, number> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, mbbToBb(v)])) as Record<Pos, number>;
}

function expectCode(fn: () => unknown, code: ValidationCode): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as ValidationError).code).toBe(code);
    return;
  }
  throw new Error(`${code} が投げられなかった`);
}

const S100 = setup();

describe('INIT 初期状態', () => {
  it('INIT-01 S100', () => {
    const s = at(S100, []);
    expect(mbbToBb(s.pot)).toBe(0);
    expect(bbRecord(s.bets)).toEqual({ UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 1 });
    expect(bbRecord(s.stacks)).toEqual({ UTG: 100, HJ: 100, CO: 100, BTN: 100, SB: 99.5, BB: 99 });
    expect(mbbToBb(s.currentBet)).toBe(1);
    expect(mbbToBb(s.minRaise)).toBe(1);
    expect(nextActor(s)).toBe('UTG');
    expect(legalBb(s, 'UTG')).toEqual({ fold: true, call: 1, raise: [2, 100] });
  });

  it('INIT-02 アンティ 0.125', () => {
    const s = at(setup({}, { ante: 0.125 }), []);
    expect(mbbToBb(s.pot)).toBe(0.75);
    expect(bbRecord(s.stacks)).toEqual({ UTG: 99.875, HJ: 99.875, CO: 99.875, BTN: 99.875, SB: 99.375, BB: 98.875 });
    expect(legalBb(s, 'UTG').raise?.[1]).toBe(99.875);
  });

  it('INIT-03 UTG がアンティでオールイン', () => {
    const s = at(setup({ UTG: 0.1 }, { ante: 0.125 }), []);
    expect(s.allin.has('UTG')).toBe(true);
    expect(s.stacks.UTG).toBe(0);
    expect(mbbToBb(s.pot)).toBe(0.725);
    expect(nextActor(s)).toBe('HJ');
  });

  it('INIT-04 SB がアンティでオールイン', () => {
    const s = at(setup({ SB: 0.125 }, { ante: 0.125 }), []);
    expect(s.allin.has('SB')).toBe(true);
    expect(s.bets.SB).toBe(0);
    expect(mbbToBb(s.pot)).toBe(0.75);
    expect(mbbToBb(s.currentBet)).toBe(1);
    expect(nextActor(s)).toBe('UTG');
  });

  it('INIT-05 SB 0.3', () => {
    const s = at(setup({ SB: 0.3 }), []);
    expect(mbbToBb(s.bets.SB)).toBe(0.3);
    expect(s.allin.has('SB')).toBe(true);
  });

  it('INIT-06 BB 0.6（currentBet は bb のまま）', () => {
    const s = at(setup({ BB: 0.6 }), []);
    expect(mbbToBb(s.bets.BB)).toBe(0.6);
    expect(s.allin.has('BB')).toBe(true);
    expect(mbbToBb(s.currentBet)).toBe(1);
    expect(legalBb(s, 'UTG').call).toBe(1);
  });

  it('INIT-07 BB はアンティ後の残りを全額ポスト', () => {
    const s = at(setup({ BB: 1 }, { ante: 0.125 }), []);
    expect(mbbToBb(s.bets.BB)).toBe(0.875);
    expect(s.allin.has('BB')).toBe(true);
    expect(mbbToBb(s.currentBet)).toBe(1);
  });
});

describe('LEGAL 合法アクション', () => {
  it('LEGAL-01 スタックがコール額以下なら raise なし', () => {
    const s = at(setup({ HJ: 2.5 }), acts({ pf: 'UTG r3' }));
    expect(legalBb(s, 'HJ')).toEqual({ fold: true, call: 2.5 });
  });

  it('LEGAL-02 フロップの先頭', () => {
    const s = at(S100, acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c' }));
    expect(legalBb(s, 'BB')).toEqual({ check: true, bet: [1, 97.5] });
  });

  it('LEGAL-03 最小ベットに満たないスタックは全額', () => {
    const s = at(setup({ BB: 3.1 }), acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c' }));
    expect(legalBb(s, 'BB')).toEqual({ check: true, bet: [0.6, 0.6] });
  });

  it('LEGAL-04 他にアクションできる席がなければ raise なし', () => {
    const s = at(setup({ BB: 150 }), acts({ pf: 'UTG r100, HJ..SB f' }));
    expect(legalBb(s, 'BB')).toEqual({ fold: true, call: 99 });
  });

  it.each<[string, Action[]]>([
    ['LEGAL-05 toCall > 0 で check', acts({ pf: 'UTG r3, HJ x' })],
    ['LEGAL-06 currentBet = 0 で raise', acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB r3' })],
    ['LEGAL-07 プリフロップで bet', acts({ pf: 'UTG b3' })],
    ['LEGAL-08 toCall = 0 で call', acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN c' })],
    ['LEGAL-09 BB オプションで fold', acts({ pf: 'UTG..BTN f, SB c, BB f' })],
  ])('%s → illegal_action', (_name, actions) => {
    expectCode(() => runActions(S100, actions), 'illegal_action');
  });
});

describe('RAISE レイズと最小レイズ', () => {
  it('RAISE-01', () => {
    const s = at(S100, acts({ pf: 'UTG r3' }));
    expect(mbbToBb(s.currentBet)).toBe(3);
    expect(mbbToBb(s.minRaise)).toBe(2);
    expect(legalBb(s, 'HJ').raise).toEqual([5, 100]);
  });

  it('RAISE-02', () => {
    const s = at(S100, acts({ pf: 'UTG r3, HJ r9' }));
    expect(mbbToBb(s.minRaise)).toBe(6);
    expect(legalBb(s, 'CO').raise).toEqual([15, 100]);
  });

  it('RAISE-03 幅 = minRaise は有効', () => {
    const s = at(S100, acts({ pf: 'UTG r2' }));
    expect(mbbToBb(s.minRaise)).toBe(1);
    expect(legalBb(s, 'HJ').raise).toEqual([3, 100]);
  });

  it('RAISE-04 min 未満', () => {
    expectCode(() => runActions(S100, acts({ pf: 'UTG r1.5' })), 'amount_out_of_range');
  });

  it('RAISE-05 max 超', () => {
    expectCode(() => runActions(S100, acts({ pf: 'UTG r100.5' })), 'amount_out_of_range');
  });

  it('RAISE-06 min に届かないオールインは合法で不完全', () => {
    const su = setup({ UTG: 1.8 });
    expect(legalBb(at(su, []), 'UTG').raise).toEqual([1.8, 1.8]);
    const s = at(su, acts({ pf: 'UTG r1.8' }));
    expect(mbbToBb(s.minRaise)).toBe(1);
    expect(legalBb(s, 'HJ').raise).toEqual([2.8, 100]);
  });

  it('RAISE-07 フロップのベット', () => {
    const s = at(S100, acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB b3' }));
    expect(mbbToBb(s.minRaise)).toBe(3);
    expect(legalBb(s, 'BTN').raise).toEqual([6, 97.5]);
  });

  it('RAISE-08 不完全なベット', () => {
    const s = at(setup({ BB: 3.1 }), acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB b0.6' }));
    expect(mbbToBb(s.currentBet)).toBe(0.6);
    expect(mbbToBb(s.minRaise)).toBe(1);
    // 表の期待値は raise[1.6, 97.5] だが、§5 の規則（LEGAL-04 と同じ。他にアクションできる席がない）では raise なし。
    // 食い違いは plan.md の確認待ち Q-24。規則どおりにし、3 人目がいる形（RAISE-08b）で minRaise を確かめる
    expect(legalBb(s, 'BTN')).toEqual({ fold: true, call: 0.6 });
  });

  it('RAISE-08b 不完全なベットの後、他に席が残っていれば raise[1.6, …]', () => {
    const s = at(setup({ BB: 3.1 }), acts({ pf: 'UTG..HJ f, CO r2.5, BTN c, SB f, BB c', flop: 'BB b0.6' }));
    expect(mbbToBb(s.minRaise)).toBe(1);
    expect(legalBb(s, 'CO')).toEqual({ fold: true, call: 0.6, raise: [1.6, 97.5] });
  });
});

describe('INC 不完全レイズ', () => {
  it('INC-01 不完全レイズで再オープンしない → コール後ランアウト', () => {
    const su = setup({ BB: 3.4 });
    const s = at(su, acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB r3.4' }));
    expect(mbbToBb(s.currentBet)).toBe(3.4);
    expect(mbbToBb(s.minRaise)).toBe(1.5);
    expect(legalBb(s, 'BTN')).toEqual({ fold: true, call: 0.9 });
    const s2 = at(su, acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB r3.4, BTN c' }));
    expect(status(s2).kind).toBe('runout');
  });

  it('INC-02 未アクションの席は raise できる、最初のレイザーはできない', () => {
    const su = setup({ HJ: 4 });
    const s = at(su, acts({ pf: 'UTG r3, HJ r4' }));
    expect(mbbToBb(s.currentBet)).toBe(4);
    expect(mbbToBb(s.minRaise)).toBe(2);
    expect(legalBb(s, 'CO').raise).toEqual([6, 100]);
    const s2 = at(su, acts({ pf: 'UTG r3, HJ r4, CO f, BTN f, SB f, BB f' }));
    expect(legalBb(s2, 'UTG')).toEqual({ fold: true, call: 1 });
  });

  it('INC-03 不完全レイズの累積でも再オープンしない', () => {
    const s = at(setup({ HJ: 4, CO: 5 }), acts({ pf: 'UTG r3, HJ r4, CO r5, BTN f, SB f, BB f' }));
    expect(legalBb(s, 'UTG')).toEqual({ fold: true, call: 2 });
  });

  it('INC-04 有効なレイズで再オープン', () => {
    const s = at(setup({ HJ: 4 }), acts({ pf: 'UTG r3, HJ r4, CO r8, BTN f, SB f, BB f' }));
    expect(mbbToBb(s.minRaise)).toBe(4);
    expect(legalBb(s, 'UTG')).toEqual({ fold: true, call: 5, raise: [12, 100] });
  });
});

describe('BBOPT BB オプション', () => {
  it('BBOPT-01', () => {
    const s = at(S100, acts({ pf: 'UTG..BTN f, SB c' }));
    expect(nextActor(s)).toBe('BB');
    expect(legalBb(s, 'BB')).toEqual({ check: true, raise: [2, 100] });
  });

  it('BBOPT-03 BB オプションで bet', () => {
    expectCode(() => runActions(S100, acts({ pf: 'UTG..BTN f, SB c, BB b3' })), 'illegal_action');
  });

  it('BBOPT-04 SB のコールでオールイン → BB はアクションせずランアウト', () => {
    const s = at(setup({ SB: 1 }), acts({ pf: 'UTG..BTN f, SB c' }));
    expect(status(s).kind).toBe('runout');
  });

  it('BBOPT-05 BB チェック → フロップ', () => {
    const states = runActions(S100, acts({ pf: 'UTG..BTN f, SB c, BB x' }));
    const end = states[states.length - 1] as State;
    expect(status(end).kind).toBe('streetEnd');
    const flop = advance(end);
    expect(mbbToBb(flop.pot)).toBe(2);
    expect(nextActor(flop)).toBe('SB');
  });
});

describe('ANTE アンティでのオールイン', () => {
  it('ANTE-01 オールインの席は手番を飛ばす', () => {
    const su = setup({ UTG: 0.1 }, { ante: 0.125 });
    const s = at(su, acts({ pf: 'HJ r2.5, CO f, BTN f, SB f, BB f' }));
    expect(status(s).kind).toBe('runout');
  });

  it('ANTE-02 BB はアクションせずランアウト', () => {
    const s = at(setup({ SB: 0.125 }, { ante: 0.125 }), acts({ pf: 'UTG f, HJ f, CO f, BTN f' }));
    expect(status(s).kind).toBe('runout');
  });

  it('ANTE-03 アクション 0 件でランアウト', () => {
    const s = at(setup({ UTG: 0.1, HJ: 0.1, CO: 0.1, BTN: 0.1, SB: 0.1 }, { ante: 0.125 }), []);
    expect(s.allin.size).toBe(5);
    expect(mbbToBb(s.pot)).toBe(0.625);
    expect(mbbToBb(s.bets.BB)).toBe(1);
    expect(status(s).kind).toBe('runout');
    expect(replay(setup({ UTG: 0.1, HJ: 0.1, CO: 0.1, BTN: 0.1, SB: 0.1 }, { ante: 0.125 }), [], 5).boardCount).toBe(5);
  });
});

describe('RUN ランアウト', () => {
  it('RUN-01 プリフロップのオールインとコール', () => {
    const r = replay(S100, acts({ pf: 'UTG r100, HJ..SB f, BB c' }), 5);
    expect(status(r.final).kind).toBe('runout');
    expect(r.boardCount).toBe(5);
    expect(mbbToBb(totalPot(r.final))).toBe(200.5);
  });

  it('RUN-02 フロップのオールイン', () => {
    const actions = acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB b97.5, BTN c' });
    const s = at(S100, actions);
    expect(status(s).kind).toBe('runout');
    expectCode(() => replay(S100, actions, 3), 'board_mismatch');
    expect(replay(S100, actions, 5).boardCount).toBe(5);
  });

  it('RUN-03 残り 1 人がベット額に達していればランアウト', () => {
    const s = at(setup({ UTG: 50 }), acts({ pf: 'UTG r50, HJ f, CO f, BTN c, SB f, BB f' }));
    expect(status(s).kind).toBe('runout');
  });

  it('RUN-04 残り 1 人でも額に達していなければ手番', () => {
    const s = at(S100, acts({ pf: 'UTG r100, HJ..SB f' }));
    expect(status(s)).toEqual({ kind: 'act', pos: 'BB' });
    const r = replay(S100, acts({ pf: 'UTG r100, HJ..SB f, BB f' }), 0);
    expect(r.result).toEqual({ kind: 'over', winner: 'UTG' });
  });

  it('RUN-05 2 人がアクション可能ならストリート終了', () => {
    const states = runActions(setup({ UTG: 20 }), acts({ pf: 'UTG r20, HJ f, CO f, BTN c, SB f, BB c' }));
    const end = states[states.length - 1] as State;
    expect(status(end).kind).toBe('streetEnd');
    const flop = advance(end);
    expect(mbbToBb(flop.pot)).toBe(60.5);
    expect(nextActor(flop)).toBe('BB');
    expect(legalBb(flop, 'BB')).toEqual({ check: true, bet: [1, 80] });
  });

  it('RUN-06 3 人のショーダウン', () => {
    const r = replay(
      setup({ UTG: 20 }),
      acts({
        pf: 'UTG r20, HJ f, CO f, BTN c, SB f, BB c',
        flop: 'BB x, BTN x',
        turn: 'BB x, BTN x',
        river: 'BB x, BTN x',
      }),
      5,
    );
    expect(status(r.final).kind).toBe('showdown');
    expect(r.result).toEqual({ kind: 'showdown', seats: ['UTG', 'BTN', 'BB'] });
  });
});

describe('END ストリートとハンドの終了', () => {
  const pf02 = 'UTG..CO f, BTN r2.5, SB f, BB c';

  it('END-01 BB の勝ち（アクション 0 件）', () => {
    const r = replay(S100, acts({ pf: 'UTG..SB f' }), 0);
    expect(r.result).toEqual({ kind: 'over', winner: 'BB' });
  });

  it('END-02 ストリート終了と advance', () => {
    const states = runActions(S100, acts({ pf: pf02 }));
    const end = states[states.length - 1] as State;
    expect(status(end).kind).toBe('streetEnd');
    const flop = advance(end);
    expect(mbbToBb(flop.pot)).toBe(5.5);
    expect(Object.values(flop.bets).every((b) => b === 0)).toBe(true);
    expect(mbbToBb(flop.minRaise)).toBe(1);
    expect(nextActor(flop)).toBe('BB');
  });

  it('END-03 ショーダウン', () => {
    const r = replay(S100, acts({ pf: pf02, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB x, BTN x' }), 5);
    expect(r.result).toEqual({ kind: 'showdown', seats: ['BTN', 'BB'] });
  });

  const end04 = acts({ pf: pf02, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB x, BTN b5, BB f' });

  it('END-04 リバーでポット獲得', () => {
    const r = replay(S100, end04, 5);
    expect(r.result).toEqual({ kind: 'over', winner: 'BTN' });
  });

  it('END-05 終了後のアクション', () => {
    expectCode(() => runActions(S100, acts({ pf: 'UTG..SB f, BB x' })), 'action_after_end');
  });

  it('END-06 途中で止まっている', () => {
    expectCode(() => replay(S100, acts({ pf: pf02 }), 3), 'hand_incomplete');
    expectCode(() => replay(S100, acts({ pf: 'UTG r3' }), 0), 'hand_incomplete');
  });

  it('END-07 ボード 4 枚', () => {
    expectCode(() => replay(S100, end04, 4), 'board_mismatch');
  });

  it('END-08 プリフロップで終了ならボード 0 枚', () => {
    expectCode(() => replay(S100, acts({ pf: 'UTG..SB f' }), 3), 'board_mismatch');
  });
});

describe('VAL 再生時の検証', () => {
  it('VAL-01 手番でない席', () => {
    expectCode(() => runActions(S100, acts({ pf: 'HJ f' })), 'not_your_turn');
  });

  it('VAL-04 to の有無', () => {
    expectCode(() => runActions(S100, [{ street: 'pf', pos: 'UTG', type: 'fold', to: 1000 }]), 'malformed');
    expectCode(() => runActions(S100, [{ street: 'pf', pos: 'UTG', type: 'raise' }]), 'malformed');
  });

  it('VAL-05 ストリートのラベル違い', () => {
    expectCode(() => runActions(S100, [{ street: 'flop', pos: 'UTG', type: 'fold' }]), 'street_mismatch');
  });

  it('エラーには添字が付く', () => {
    try {
      runActions(S100, acts({ pf: 'UTG f, HJ f, CO x' }));
      throw new Error('投げられなかった');
    } catch (e) {
      expect((e as ValidationError).index).toBe(2);
    }
  });

  it('リバーの後には advance できない', () => {
    const s = at(S100, acts({ pf: 'UTG..CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN x', turn: 'BB x, BTN x' }));
    expect(s.street).toBe('river');
    expect(() => advance(s)).toThrow();
  });
});
