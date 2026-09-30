/**
 * T1 の探索: Check-Raise の表示の判定（§10 C-7）、Size の Raise と Bet の測り方の対称性、
 * ポーカーとして不自然に見える名前の観察（実際の挙動を記録する。仕様どおりの挙動であり、意見として報告する）。
 */
import { describe, expect, it } from 'vitest';
import { POSITIONS, type Pos } from '../constants.ts';
import { hasReads } from '../post/reads.ts';
import { actsBefore, classifyActions, isCheckRaise, type ReadCandidate } from './readActions.ts';
import type { Action, HandSetup } from './state.ts';
import { acts, setup } from './testHelpers.ts';

const S = setup();
const names = (a: Action[], st: HandSetup = S): string[] =>
  classifyActions(st, a)
    .filter((c): c is ReadCandidate => c !== null)
    .map((c) => `${c.pos} ${c.action}${c.size ? ` ${c.size}` : ''}${c.checkRaise ? ' xr' : ''}`);

describe('T1 isCheckRaise・actsBefore', () => {
  it('actsBefore: Postflop は SB・BB・UTG・HJ・CO・BTN の順（ヘッズアップは BB が先、BTN が後）', () => {
    const order: Pos[] = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) expect(actsBefore(order[i] as Pos, order[j] as Pos), `${order[i]} < ${order[j]}`).toBe(i < j);
    }
  });

  it('General Read: Villain が Hero より先に動く席なら Check-Raise。Preflop は常に false', () => {
    const none: Action[] = [];
    expect(isCheckRaise('general', 'flop', 'BB', 'BTN', none)).toBe(true);
    expect(isCheckRaise('general', 'flop', 'BTN', 'BB', none)).toBe(false);
    expect(isCheckRaise('general', 'river', 'UTG', 'BTN', none)).toBe(true);
    expect(isCheckRaise('general', 'turn', 'CO', 'HJ', none)).toBe(false);
    for (const v of POSITIONS) for (const h of POSITIONS) expect(isCheckRaise('general', 'pf', v, h, none)).toBe(false);
  });

  it('Spot Read: その Street で先に Check していれば Check-Raise。Check せずに Raise、別の Street の Check は数えない', () => {
    const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
    const a = acts({ pf, flop: 'BB x, BTN b3, BB r10, BTN c', turn: 'BB b4, BTN r12' });
    expect(isCheckRaise('spot', 'flop', 'BB', 'BTN', a)).toBe(true);
    expect(isCheckRaise('spot', 'turn', 'BB', 'BTN', a)).toBe(false); // Turn は Bet してから Raise されただけ（BB の Raise は無い）
    expect(isCheckRaise('spot', 'turn', 'BTN', 'BB', a)).toBe(false);
    // Flop で Check し Turn で Check せずに Raise: Turn は Check-Raise ではない
    const b = acts({ pf, flop: 'BB x, BTN b3, BB r10, BTN c', turn: 'BB b4, BTN r12, BB r40' });
    expect(isCheckRaise('spot', 'turn', 'BB', 'BTN', b)).toBe(false);
  });
});

describe('T1 観察: 仕様どおりだが、ポーカーとして不自然に見える名前', () => {
  const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';

  it('[O-1] Flop・Turn とも全員 Check の River で Aggressor が打つと Barrel（Barrel と呼ぶには前の Bet が無い）', () => {
    expect(names(acts({ pf, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB x, BTN b4, BB f' }))).toEqual(['SB fold_steal', 'BTN barrel big', 'BB fold_barrel']);
  });

  it('[O-2] BB が Flop で Donk → BTN が Raise → BB が Call → Turn で BB がまた打つと Donk（実質は同じ人の 2 発目）', () => {
    expect(names(acts({ pf, flop: 'BB b2, BTN r6, BB c', turn: 'BB b8, BTN f' }))).toEqual(['SB fold_steal', 'BB donk small', 'BTN raise small', 'BB donk small', 'BTN fold_bet']);
  });

  it('[O-3] Turn で BB が Donk（Flop は BTN の C-Bet に Call）した次の River の BB の Bet は Barrel（Donk → Barrel）', () => {
    expect(names(acts({ pf, flop: 'BB x, BTN b2, BB c', turn: 'BB b4, BTN c', river: 'BB b10, BTN f' }))).toEqual([
      'SB fold_steal',
      'BTN cbet small',
      'BB donk small',
      'BB barrel big',
      'BTN fold_barrel',
    ]);
  });

  it('[O-4] Limp した席が Raise に Call したあとの 3-Bet は Squeeze（Limp-Call も Squeeze の Call に数える）', () => {
    expect(names(acts({ pf: 'UTG c, HJ r4, CO f, BTN r14, SB f, BB f, UTG f, HJ f' }))).toEqual(['UTG limp', 'BTN 3bet', 'HJ fold_3bet']);
    // Limp → Iso Raise → BTN の Call → SB の 3-Bet は Squeeze（BTN の Call がある）
    expect(names(acts({ pf: 'UTG f, HJ c, CO r4, BTN c, SB r16, BB f, HJ f, CO f, BTN f' }))).toEqual(['HJ limp', 'SB squeeze', 'CO fold_3bet']);
  });

  it('[O-5] ヘッズアップ（2 人）の BTN のオープンへの BB の Fold は Fold to Steal（ヘッズアップでは毎回の Open が Steal になる）', () => {
    const hu = setup({ UTG: 0, HJ: 0, CO: 0, SB: 0 });
    expect(names(acts({ pf: 'BTN r2.5, BB f' }), hu)).toEqual(['BB fold_steal']);
  });

  it('[O-6] 4 人の最初の席（CO）の Open は Steal 扱い（席の名前だけで決まる）。5 人の最初の席（HJ）は違う', () => {
    const four = setup({ UTG: 0, HJ: 0 });
    expect(names(acts({ pf: 'CO r2.5, BTN f, SB f, BB f' }), four)).toEqual(['SB fold_steal', 'BB fold_steal']);
    const five = setup({ UTG: 0 });
    expect(names(acts({ pf: 'HJ r2.5, CO f, BTN f, SB f, BB f' }), five)).toEqual([]);
  });

  it('[O-7] BTN の Open に SB が Call してから BB が Fold しても BB の Fold は Fold to Steal', () => {
    expect(names(acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB f' }))).toEqual(['BB fold_steal']);
  });

  it('[O-8] 50〜75% の Bet も 75〜100% の Bet も Big（2 段階のため Medium が無い）。33% も 49% も Small', () => {
    const a = (to: number): Action[] => acts({ pf, flop: `BB x, BTN b${to}` });
    const size = (to: number): string | null => classifyActions(S, a(to)).slice(-1)[0]?.size ?? null;
    expect([size(1.8), size(2.7), size(2.75), size(4.1), size(5.5)]).toEqual(['small', 'small', 'big', 'big', 'big']);
  });

  it('[O-9] All-in の Bet は額だけで Size が決まる（All-in かどうかは分からない）', () => {
    const st = setup({ BTN: 8.5 });
    // 残り 6bb の All-in。Pot 5.5 に対して 6（Overbet）と、Pot 5.5 に対する 2.6（Small）の All-in
    expect(names(acts({ pf, flop: 'BB x, BTN b6, BB c' }), st)).toEqual(['SB fold_steal', 'BTN cbet overbet']);
    const st2 = setup({ BTN: 5.1 });
    expect(names(acts({ pf, flop: 'BB x, BTN b2.6, BB c' }), st2)).toEqual(['SB fold_steal', 'BTN cbet small']);
  });
});

describe('T1 hasReads', () => {
  it('情報のある席があるか', () => {
    expect(hasReads({})).toBe(false);
    expect(hasReads({ SB: { vpip: 10 } })).toBe(true);
  });
});
