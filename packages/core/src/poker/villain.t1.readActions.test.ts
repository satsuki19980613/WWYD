/**
 * T1（判定の中身）: Action の決め方の全パターン・Size の境目・登録できる席・判断地点より前だけの性質
 * （docs/villain-reads-test-plan.md §3 T1-01〜T1-04。18 章 §10.3・§10 B-2・C-5・不変条件 10）。
 * 期待値は 18 章の表から手で決めた（実装を写していない）。
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COUNTS, POSITIONS, SEATS_BY_COUNT, type Pos } from '../constants.ts';
import { ValidationError } from '../errors.ts';
import { classifyActions, readCandidates, villainSeats, type ReadCandidate } from './readActions.ts';
import { spotCandidates } from './spot.ts';
import type { Action, HandSetup } from './state.ts';
import { acts, setup } from './testHelpers.ts';

const S = setup();

function render(c: ReadCandidate | null): string | null {
  return c ? `${c.pos} ${c.action}${c.size ? ` ${c.size}` : ''}${c.checkRaise ? ' xr' : ''}` : null;
}
/** 当たった Action だけを「席 Action（Size）」で並べる */
function named(actions: Action[], st: HandSetup = S): string[] {
  return classifyActions(st, actions)
    .map(render)
    .filter((x): x is string => x !== null);
}
/** 添字ごとの結果（null を含む） */
const each = (actions: Action[], st: HandSetup = S): (string | null)[] => classifyActions(st, actions).map(render);

describe('T1-01 Action の決め方（手で作ったハンド）', () => {
  it('Limp のあとの Raise は Steal ではない（Blind の Fold は Fold to Steal にならない）', () => {
    // UTG が Limp、BTN が Raise。SB・BB の Fold は Steal への Fold ではない
    expect(named(acts({ pf: 'UTG c, HJ f, CO f, BTN r5, SB f, BB f, UTG f' }))).toEqual(['UTG limp']);
    // CO の Limp のあとの BTN の Raise でも同じ
    expect(named(acts({ pf: 'UTG f, HJ f, CO c, BTN r4, SB f, BB c, CO c' }))).toEqual(['CO limp']);
    // 対比: Limp が無ければ BTN の Raise は Steal（SB・BB の Fold が Fold to Steal）
    expect(named(acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB f' }))).toEqual(['SB fold_steal', 'BB fold_steal']);
  });

  it('SB の Complete は Limp。BB の Check は候補にしない。SB Complete のあとの BB の Raise は候補にしない', () => {
    expect(named(acts({ pf: 'UTG..BTN f, SB c, BB x' }))).toEqual(['SB limp']);
    // BB の Raise（Iso）は最初の Raise なので候補にしない
    expect(named(acts({ pf: 'UTG..BTN f, SB c, BB r4, SB c' }))).toEqual(['SB limp']);
    // ヘッズアップ（BTN が SB を払う）: BTN の Complete も Limp
    const hu = setup({ UTG: 0, HJ: 0, CO: 0, SB: 0 });
    expect(named(acts({ pf: 'BTN c, BB x' }), hu)).toEqual(['BTN limp']);
  });

  it('Squeeze の Call が 1 人でも複数でも Squeeze。Call の前の 3-Bet は 3-Bet', () => {
    expect(named(acts({ pf: 'UTG r3, HJ c, CO c, BTN c, SB r14, BB f, UTG f, HJ f, CO f, BTN f' }))).toEqual(['SB squeeze', 'UTG fold_3bet']);
    expect(named(acts({ pf: 'UTG r3, HJ c, CO f, BTN f, SB r14, BB f, UTG f, HJ f' }))).toEqual(['SB squeeze', 'UTG fold_3bet']);
    // Call が無ければ 3-Bet
    expect(named(acts({ pf: 'UTG r3, HJ r10, CO f, BTN f, SB f, BB f, UTG f' }))).toEqual(['HJ 3bet', 'UTG fold_3bet']);
    // BB の Call も Squeeze の Call に数える（SB が Call → BB が Raise）
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB r12, BTN f, SB f' }))).toEqual(['BB squeeze', 'BTN fold_3bet']);
  });

  it('5-Bet 以降は候補にしない。5-Bet のあとの Fold も候補にしない', () => {
    const r = each(acts({ pf: 'UTG r3, HJ..BTN f, SB r10, BB r30, UTG r80, SB f, BB c' }));
    // 添字: 0 UTG r, 1 HJ, 2 CO, 3 BTN, 4 SB 3bet, 5 BB 4bet, 6 UTG 5bet, 7 SB f, 8 BB c
    expect(r).toEqual([null, null, null, null, 'SB 3bet', 'BB 4bet', null, null, null]);
    // 6-Bet も同じ
    const r6 = each(acts({ pf: 'UTG r3, HJ..BTN f, SB r10, BB r30, UTG r80, SB r100' }));
    expect(r6.slice(6)).toEqual([null, null]);
  });

  it('4-Bet の Fold: 3-Bet をした席の Fold は Fold to 4-Bet、オープンした席の Fold は候補にしない', () => {
    expect(named(acts({ pf: 'UTG r3, HJ..BTN f, SB r10, BB r30, UTG f, SB f' }))).toEqual(['SB 3bet', 'BB 4bet', 'SB fold_4bet']);
    // オープンした席が 4-Bet し、3-Bet の席が Fold
    expect(named(acts({ pf: 'UTG r3, HJ..BTN f, SB r10, BB f, UTG r25, SB f' }))).toEqual(['SB 3bet', 'UTG 4bet', 'SB fold_4bet']);
  });

  it('Limp のポットの Flop: 最初に動く席の Bet は候補にしない。Check のあとの Bet は Bet vs Check', () => {
    // UTG Limp、BTN Limp、SB Complete、BB Check。Flop: SB x, BB x, UTG b, BTN f, SB f, BB c（Donk でも C-Bet でもない）
    const pf = 'UTG c, HJ f, CO f, BTN c, SB c, BB x';
    expect(named(acts({ pf, flop: 'SB x, BB x, UTG b1.5, BTN f, SB f, BB c' }))).toEqual(['UTG limp', 'BTN limp', 'SB limp', 'UTG bet_vs_check small', 'BTN fold_bet', 'SB fold_bet']);
    // 最初に動く SB の Bet（Check が先に無い）は候補にしない。それへの Fold は Fold to Bet
    expect(named(acts({ pf, flop: 'SB b2, BB f, UTG c, BTN f, SB x' }).slice(0, 10))).toEqual(['UTG limp', 'BTN limp', 'SB limp', 'BB fold_bet', 'BTN fold_bet']);
  });

  it('マルチウェイの Donk: Check のあとでも Aggressor より先なら Donk。Aggressor が動いたあとなら Bet vs Check', () => {
    const pf = 'UTG..CO f, BTN r2.5, SB c, BB c';
    // SB x, BB b2（BTN はまだ動いていない）→ Donk
    expect(named(acts({ pf, flop: 'SB x, BB b2, BTN f, SB c' }))).toEqual(['BB donk small', 'BTN fold_bet']);
    // SB が先に Donk
    expect(named(acts({ pf, flop: 'SB b2, BB c, BTN f' }))).toEqual(['SB donk small', 'BTN fold_bet']);
    // Aggressor（BTN）が Check してから後ろの席が Bet する場面（CO が Aggressor、BTN が後ろ）
    // BTN が Call したので SB の Fold は Fold to Steal ではない（V-002）
    const pf2 = 'UTG..HJ f, CO r2.5, BTN c, SB f, BB c';
    expect(named(acts({ pf: pf2, flop: 'BB x, CO x, BTN b2' }))).toEqual(['BTN bet_vs_check small']);
    // Aggressor が Bet したあとの Raise は Donk でも Bet vs Check でもなく Raise
    expect(named(acts({ pf: pf2, flop: 'BB x, CO b3, BTN r10' }))).toEqual(['CO cbet small', 'BTN raise big']);
  });

  it('Aggressor が Fold したあとの Bet: 新しい Aggressor を基準に名前が決まる', () => {
    const pf = 'UTG..CO f, BTN r2.5, SB c, BB c';
    // Flop: SB が Donk、BB Call、BTN（元の Aggressor）Fold。Turn: SB x のあとの BB の Bet は Bet vs Check（SB が Aggressor で動いたあと）
    expect(named(acts({ pf, flop: 'SB b2, BB c, BTN f', turn: 'SB x, BB b3' }))).toEqual(['SB donk small', 'BTN fold_bet', 'BB bet_vs_check small']);
    // Turn: 新しい Aggressor（SB）の Bet は Barrel
    expect(named(acts({ pf, flop: 'SB b2, BB c, BTN f', turn: 'SB b6, BB f' }))).toEqual(['SB donk small', 'BTN fold_bet', 'SB barrel big', 'BB fold_barrel']);
  });

  it('Turn・River の Probe（前の Street が全員 Check）と Donk（前の Street に Bet がある）', () => {
    const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
    // Flop x/x → Turn の BB の Bet は Probe
    expect(named(acts({ pf, flop: 'BB x, BTN x', turn: 'BB b3, BTN f' }))).toEqual(['SB fold_steal', 'BB probe big', 'BTN fold_bet']);
    // Flop Bet/Call、Turn x/x → River の BB の Bet は Probe
    expect(named(acts({ pf, flop: 'BB x, BTN b2, BB c', turn: 'BB x, BTN x', river: 'BB b5, BTN f' }))).toEqual([
      'SB fold_steal',
      'BTN cbet small',
      'BB probe big',
      'BTN fold_bet',
    ]);
    // Flop Bet/Call → Turn の BB の先手の Bet は Donk
    expect(named(acts({ pf, flop: 'BB x, BTN b2, BB c', turn: 'BB b4, BTN c', river: 'BB b10, BTN f' }))).toEqual([
      'SB fold_steal',
      'BTN cbet small',
      'BB donk small',
      'BB barrel big', // River は Turn の Donk をした BB が Aggressor になる
      'BTN fold_barrel',
    ]);
  });

  it('River の Barrel（Turn が全員 Check）は Barrel（18 章 §10.3: Turn・River で Aggressor がする最初の Bet）', () => {
    const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
    expect(named(acts({ pf, flop: 'BB x, BTN b2, BB c', turn: 'BB x, BTN x', river: 'BB x, BTN b6, BB f' }))).toEqual([
      'SB fold_steal',
      'BTN cbet small',
      'BTN barrel big',
      'BB fold_barrel',
    ]);
    // Flop も Turn も全員 Check の River の Bet は Barrel（Delayed C-Bet は Turn だけ）
    expect(named(acts({ pf, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB x, BTN b4, BB f' }))).toEqual([
      'SB fold_steal',
      'BTN barrel big',
      'BB fold_barrel',
    ]);
  });

  it('Delayed C-Bet は Turn だけ。Limp のポットの Turn の Bet は Delayed C-Bet にならない', () => {
    const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
    expect(named(acts({ pf, flop: 'BB x, BTN x', turn: 'BB x, BTN b3' }))).toEqual(['SB fold_steal', 'BTN delayed_cbet big']);
    expect(named(acts({ pf: 'UTG..BTN f, SB c, BB x', flop: 'SB x, BB x', turn: 'SB x, BB b1' }))).toEqual(['SB limp', 'BB bet_vs_check big']);
  });

  it('Check-Raise（Check してからの Raise）と、Check していない Raise', () => {
    const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
    expect(named(acts({ pf, flop: 'BB x, BTN b3, BB r10, BTN f' }))).toEqual(['SB fold_steal', 'BTN cbet big', 'BB raise big xr', 'BTN fold_raise']);
    expect(named(acts({ pf, flop: 'BB b3, BTN r10, BB f' }))).toEqual(['SB fold_steal', 'BB donk big', 'BTN raise big', 'BB fold_raise']);
    // 3 人: Check した SB の Raise は Check-Raise、Check していない BB の Raise は違う
    const pf3 = 'UTG..CO f, BTN r2.5, SB c, BB c';
    expect(named(acts({ pf: pf3, flop: 'SB x, BB b2, BTN c, SB r8' }))).toEqual(['BB donk small', 'SB raise small xr']);
    expect(named(acts({ pf: pf3, flop: 'SB x, BB b2, BTN r8' }))).toEqual(['BB donk small', 'BTN raise big']);
  });

  it('All-in の Bet・Raise も額で Size が決まる（All-in 専用の名前は無い）', () => {
    const st = setup({}, { all: 12 }); // 12bb。BTN は Preflop 後 9.5bb
    const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
    // Pot 5.5 に 9.5 の All-in → Overbet
    expect(named(acts({ pf, flop: 'BB x, BTN b9.5, BB f' }), st)).toEqual(['SB fold_steal', 'BTN cbet overbet', 'BB fold_cbet']);
    // Donk 2 に対する All-in Raise 9.5: 上乗せ 7.5、Call 後の Pot 9.5 → Big
    expect(named(acts({ pf, flop: 'BB b2, BTN r9.5, BB f' }), st)).toEqual(['SB fold_steal', 'BB donk small', 'BTN raise big', 'BB fold_raise']);
    // 短いスタック（残り 2.5）の All-in Bet は Small
    const short = setup({ BTN: 5 });
    expect(named(acts({ pf, flop: 'BB x, BTN b2.5, BB c' }), short)).toEqual(['SB fold_steal', 'BTN cbet small']);
  });

  it('不完全な Raise（All-in が最小 Raise に満たない）も Raise。再オープンされない相手の Fold は Fold to Raise', () => {
    const st = setup({ BTN: 8.5 }); // Preflop 後の BTN の残りは 6bb
    const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
    // BB が 4 を Bet、BTN が 6 に All-in（上乗せ 2 < 最小 Raise 幅 4）。Pot 5.5+4 = 9.5、Call 後 13.5 に対して 2 → Small
    expect(named(acts({ pf, flop: 'BB b4, BTN r6, BB f' }), st)).toEqual(['SB fold_steal', 'BB donk big', 'BTN raise small', 'BB fold_raise']);
  });

  it('コールの額が残りのスタック以上なら Raise できない（再生が断る）。Raise になる最小の場面は通る', () => {
    const st = setup({ BTN: 8.5 });
    const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
    // BTN の残り 6bb に対して 7 の Bet を受けて Raise はできない
    expect(() => classifyActions(st, acts({ pf, flop: 'BB b7, BTN r20' }))).toThrow(ValidationError);
    // Call の額と残りが等しい（ちょうど All-in の Call）場合も Raise はできない
    expect(() => classifyActions(st, acts({ pf, flop: 'BB b6, BTN r20' }))).toThrow(ValidationError);
    // 1mbb 余る Raise（5.999 → 6 の All-in）は通る
    expect(classifyActions(st, acts({ pf, flop: 'BB b5.999, BTN r6' })).map(render).slice(-1)).toEqual(['BTN raise small']);
  });

  it('Preflop の Call（Limp 以外）・Check・最初の Raise は候補にしない', () => {
    // BTN Open、SB Call、BB Call
    expect(named(acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB c' }))).toEqual([]);
    // 4 人: CO が最初の Raise → BTN・SB・BB の Fold（SB・BB だけが Fold to Steal）
    const four = setup({ UTG: 0, HJ: 0 });
    expect(named(acts({ pf: 'CO r2.5, BTN f, SB f, BB f' }), four)).toEqual(['SB fold_steal', 'BB fold_steal']);
  });
});

describe('T1-02 Size の境目（Pot に対する上乗せの割合。50% 未満 Small・100% まで Big・超えると Overbet）', () => {
  // 以降の Pot: Preflop 後 5.5bb（SB の Dead 0.5 + 2.5 × 2）
  const pf = 'UTG..CO f, BTN r2.5, SB f, BB c';
  const last = (actions: Action[], st: HandSetup = S): ReadCandidate | null => classifyActions(st, actions).slice(-1)[0] ?? null;

  it('Bet: 50% ちょうど（2.75）は Big、1mbb 下（2.749）は Small', () => {
    expect(last(acts({ pf, flop: 'BB x, BTN b2.749' }))?.size).toBe('small');
    expect(last(acts({ pf, flop: 'BB x, BTN b2.75' }))?.size).toBe('big');
    expect(last(acts({ pf, flop: 'BB x, BTN b2.751' }))?.size).toBe('big');
  });

  it('Bet: 100% ちょうど（5.5）は Big、1mbb 上（5.501）は Overbet', () => {
    expect(last(acts({ pf, flop: 'BB x, BTN b5.499' }))?.size).toBe('big');
    expect(last(acts({ pf, flop: 'BB x, BTN b5.5' }))?.size).toBe('big');
    expect(last(acts({ pf, flop: 'BB x, BTN b5.501' }))?.size).toBe('overbet');
  });

  it('Raise: 上乗せ ÷（Call 後の Pot）で測る。Donk 2 に対して Pot 7.5 + Call 2 = 9.5。50% = 上乗せ 4.75（to 6.75）、100% = 上乗せ 9.5（to 11.5）', () => {
    const a = (to: number): Action[] => acts({ pf, flop: `BB b2, BTN r${to}` });
    expect(last(a(6.749))?.size).toBe('small');
    expect(last(a(6.75))?.size).toBe('big');
    expect(last(a(11.5))?.size).toBe('big');
    expect(last(a(11.501))?.size).toBe('overbet');
    expect(last(a(6.75))?.action).toBe('raise');
  });

  it('Re-raise（自分の Bet が残っている）: BB b2, BTN r6, BB r<to>。Pot 13.5 + Call 4 = 17.5。50% = to 14.75、100% = to 23.5', () => {
    const a = (to: number): Action[] => acts({ pf, flop: `BB b2, BTN r6, BB r${to}` });
    expect(last(a(14.749))?.size).toBe('small');
    expect(last(a(14.75))?.size).toBe('big');
    expect(last(a(23.5))?.size).toBe('big');
    expect(last(a(23.501))?.size).toBe('overbet');
  });

  it('Turn・River の Bet・Raise も同じ測り方（前の Street のベットが Pot に入る）', () => {
    // Flop BB x, BTN b2, BB c → Pot 9.5。Turn の 50% = 4.75
    const t = (to: number): Action[] => acts({ pf, flop: 'BB x, BTN b2, BB c', turn: `BB b${to}` });
    expect(last(t(4.749))?.size).toBe('small');
    expect(last(t(4.75))?.size).toBe('big');
    expect(last(t(9.5))?.size).toBe('big');
    expect(last(t(9.501))?.size).toBe('overbet');
    // River: Turn BB x, BTN x → Pot 9.5、River の BB の Bet も同じ
    const r = (to: number): Action[] => acts({ pf, flop: 'BB x, BTN b2, BB c', turn: 'BB x, BTN x', river: `BB b${to}` });
    expect(last(r(4.75))?.size).toBe('big');
    expect(last(r(4.749))?.size).toBe('small');
  });

  it('アンティ・Dead Money（Fold した席のベット）は Pot に入る', () => {
    // アンティ 1 × 6 人 = 6。Pot = 6 + 0.5 + 2.5 + 2.5 = 11.5。50% = 5.75
    const ante = setup({}, { ante: 1 });
    const a = (to: number): Action[] => acts({ pf, flop: `BB x, BTN b${to}` });
    expect(last(a(5.749), ante)?.size).toBe('small');
    expect(last(a(5.75), ante)?.size).toBe('big');
    expect(last(a(11.5), ante)?.size).toBe('big');
    expect(last(a(11.501), ante)?.size).toBe('overbet');
    // SB の Fold（0.5 の Dead）は Pot 5.5 に含まれている: 2.75 が 50%
    expect(last(acts({ pf, flop: 'BB x, BTN b2.75' }))?.size).toBe('big');
  });

  it('Preflop の候補に Size は付かない（Raise も Fold も Call も）', () => {
    const c = classifyActions(S, acts({ pf: 'UTG r3, HJ c, CO f, BTN f, SB r14, BB f, UTG r40, HJ f, SB r100, UTG f' }));
    for (const x of c) if (x) expect(x.size, JSON.stringify(x)).toBeNull();
    expect(c.filter((x) => x).length).toBeGreaterThanOrEqual(2);
  });

  it('Bet・Raise 以外（Fold to …）の候補に Size は付かない', () => {
    const c = classifyActions(S, acts({ pf, flop: 'BB x, BTN b3, BB r10, BTN f' }));
    expect(c.map((x) => x?.size ?? null).slice(-1)).toEqual([null]);
  });
});

describe('T1-03 登録できる席（villainSeats。18 章 §10 B-2）', () => {
  it('6 人: Fold to Steal の Blind は入り、ほかの Preflop Fold は入らない（Hero は除く）', () => {
    const a = acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c' });
    expect(villainSeats(S, a, 'BTN')).toEqual(['SB', 'BB']);
    expect(villainSeats(S, a, 'BB')).toEqual(['BTN', 'SB']);
    // UTG のオープンへの Blind の Fold は Steal ではない → Blind は入らない
    expect(villainSeats(S, acts({ pf: 'UTG r2.5, HJ..SB f, BB c' }), 'BB')).toEqual(['UTG']);
    expect(villainSeats(S, acts({ pf: 'UTG r2.5, HJ..SB f, BB c' }), 'UTG')).toEqual(['BB']);
    // CO のオープン → SB・BB の Fold は Fold to Steal、UTG・HJ・BTN の Fold は入らない
    expect(villainSeats(S, acts({ pf: 'UTG f, HJ f, CO r2.5, BTN f, SB f, BB f' }), 'CO')).toEqual(['SB', 'BB']);
    // BB の Check（Limp のポット）は入る。Fold した UTG は入らない
    expect(villainSeats(S, acts({ pf: 'UTG f, HJ f, CO c, BTN f, SB c, BB x' }), 'CO')).toEqual(['SB', 'BB']);
  });

  it('Limp のあとの Raise では Blind の Fold は入らない', () => {
    expect(villainSeats(S, acts({ pf: 'UTG c, HJ f, CO f, BTN r5, SB f, BB f, UTG f' }), 'BTN')).toEqual(['UTG']);
  });

  it('3-Bet 以降の Fold（オープンした席・3-Bet の席）は、Raise しているので入る', () => {
    const a = acts({ pf: 'UTG r3, HJ..BTN f, SB r10, BB f, UTG f' });
    expect(villainSeats(S, a, 'SB')).toEqual(['UTG']);
    expect(villainSeats(S, a, 'UTG')).toEqual(['SB']);
  });

  it('Hero の Preflop の Fold to Steal は除く（Hero は常に除く）', () => {
    const a = acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB f' });
    expect(villainSeats(S, a, 'BB')).toEqual(['BTN', 'SB']);
    // SB が Call したので BB の Fold は Fold to Steal ではなく、BB は登録できない（V-002）
    expect(villainSeats(S, a, 'SB')).toEqual(['BTN']);
  });

  it('2〜6 人のすべての人数: 空席は入らない。Ante ありでも同じ', () => {
    for (const n of PLAYER_COUNTS) {
      const seats = SEATS_BY_COUNT[n];
      for (const ante of [0, 0.125, 1]) {
        const stacks = Object.fromEntries(POSITIONS.filter((p) => !seats.includes(p)).map((p) => [p, 0]));
        const st = setup(stacks, { ante });
        // 全員 Call/Check（最初の席 Limp、BB Check）にすると、座っている Hero 以外の全員が入る
        const first = seats.slice(0, -1);
        const pf = [...first.map((p) => `${p} c`), 'BB x'].join(', ');
        for (const hero of seats) {
          const expected = seats.filter((p) => p !== hero);
          expect(villainSeats(st, acts({ pf }), hero), `${n}人 ante=${ante} hero=${hero}`).toEqual(expected);
        }
        // 空席は絶対に入らない
        for (const p of POSITIONS) if (!seats.includes(p)) expect(villainSeats(st, acts({ pf }), seats[0] as Pos)).not.toContain(p);
      }
    }
  });

  it('ヘッズアップ: BTN が SB を払う。BTN のオープン → BB の Fold は Fold to Steal（BB が入る）', () => {
    const hu = setup({ UTG: 0, HJ: 0, CO: 0, SB: 0 }, { ante: 0.125 });
    expect(villainSeats(hu, acts({ pf: 'BTN r2.5, BB f' }), 'BTN')).toEqual(['BB']);
    expect(villainSeats(hu, acts({ pf: 'BTN r2.5, BB f' }), 'BB')).toEqual(['BTN']);
    expect(named(acts({ pf: 'BTN r2.5, BB f' }), hu)).toEqual(['BB fold_steal']);
    // BTN の Limp → BB の Check
    expect(villainSeats(hu, acts({ pf: 'BTN c, BB x' }), 'BTN')).toEqual(['BB']);
  });

  it('3・4・5 人の Steal の席（CO・BTN・SB）', () => {
    // 4 人: CO のオープン（最初の席）→ Blind の Fold
    const four = setup({ UTG: 0, HJ: 0 });
    expect(villainSeats(four, acts({ pf: 'CO r2.5, BTN f, SB f, BB f' }), 'CO')).toEqual(['SB', 'BB']);
    // 5 人: HJ のオープン → Steal ではない
    const five = setup({ UTG: 0 });
    expect(villainSeats(five, acts({ pf: 'HJ r2.5, CO f, BTN f, SB f, BB f' }), 'HJ')).toEqual([]);
    expect(villainSeats(five, acts({ pf: 'HJ r2.5, CO f, BTN f, SB f, BB c' }), 'BB')).toEqual(['HJ']);
    // 3 人: BTN のオープン → SB・BB の Fold
    const three = setup({ UTG: 0, HJ: 0, CO: 0 });
    expect(villainSeats(three, acts({ pf: 'BTN r2.5, SB f, BB c' }), 'BTN')).toEqual(['SB', 'BB']);
    // SB のオープン（BTN は Fold）→ BB の Fold
    expect(villainSeats(three, acts({ pf: 'BTN f, SB r3, BB f' }), 'SB')).toEqual(['BB']);
  });

  it('ランダムな Preflop（2〜6 人、3000 通り）で、独立に書いた参照と一致する', () => {
    // 参照: 「最初の Raise より前が全員 Fold で、その Raise が CO・BTN・SB」なら Steal。Steal に対する SB・BB の Fold（2 回目の Raise の前）だけが Fold to Steal
    let seed = 12345;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let checked = 0;
    for (let k = 0; k < 3000; k++) {
      const n = PLAYER_COUNTS[Math.floor(rnd() * 5)] as (typeof PLAYER_COUNTS)[number];
      const seats = SEATS_BY_COUNT[n];
      const st = setup(Object.fromEntries(POSITIONS.filter((p) => !seats.includes(p)).map((p) => [p, 0])));
      // 合法な Preflop をランダムに作る（Fold・Call・Raise を選び、全員の Call / Fold が済むまで）
      const order: readonly string[] = seats;
      const tokens: string[] = [];
      let cur = 1;
      let minRaise = 1;
      let raises = 0;
      const committed: Record<string, number> = {};
      for (const p of order) committed[p] = p === 'BB' ? 1 : p === 'SB' || (n === 2 && p === 'BTN') ? 0.5 : 0;
      const alive = new Set<string>(order);
      const pending = [...order];
      let guard = 0;
      while (pending.length > 0 && guard++ < 60) {
        const p = pending.shift() as string;
        if (!alive.has(p)) continue;
        const r = rnd();
        const canCheck = committed[p] === cur;
        const canRaise = raises < 4 && cur + minRaise <= 60;
        if (r < 0.3 && !canCheck) {
          alive.delete(p);
          tokens.push(`${p} f`);
        } else if (r < 0.62 || !canRaise) {
          if (canCheck) tokens.push(`${p} x`);
          else {
            committed[p] = cur;
            tokens.push(`${p} c`);
          }
        } else {
          const to = cur + minRaise * (1 + Math.floor(rnd() * 3));
          minRaise = to - cur;
          cur = to;
          committed[p] = to;
          raises++;
          tokens.push(`${p} r${to}`);
          pending.length = 0;
          const i0 = order.indexOf(p);
          for (let k = 1; k < order.length; k++) pending.push(order[(i0 + k) % order.length] as string);
        }
        if (alive.size === 1) break;
      }
      const actions = acts({ pf: tokens.join(', ') });
      if (actions.length === 0) continue;
      for (const hero of seats) {
        // 参照
        const firstRaise = actions.findIndex((a) => a.type === 'raise');
        const steal =
          firstRaise >= 0 &&
          ['CO', 'BTN', 'SB'].includes(actions[firstRaise]?.pos as string) &&
          actions.slice(0, firstRaise).every((a) => a.type === 'fold');
        const secondRaise = actions.findIndex((a, j) => j > firstRaise && a.type === 'raise');
        const ok = new Set<string>();
        actions.forEach((a, j) => {
          if (a.type !== 'fold') ok.add(a.pos);
          else if (
            steal &&
            (a.pos === 'SB' || a.pos === 'BB') &&
            j > firstRaise &&
            (secondRaise < 0 || j < secondRaise) &&
            // Steal に Call が入ったら Fold to Steal にしない（V-002）
            !actions.slice(firstRaise + 1, j).some((b) => b.type === 'call')
          )
            ok.add(a.pos);
        });
        // 3-Bet に Fold した席は Steal の Fold ではなく、Raise 済みか
        const expected = POSITIONS.filter((p) => p !== hero && ok.has(p));
        // 席が 3-Bet 後に初めて Fold する Blind（Raise も Call もしていない）は入らない
        expect(villainSeats(st, actions, hero), `${tokens.join(',')} hero=${hero}`).toEqual(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });
});

describe('T1-04 Spot Read の候補は判断地点より前だけ（不変条件 10）', () => {
  // H-S1: 6 人、BTN オープン、BB Call、Flop・Turn・River
  const a = acts({
    pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
    flop: 'BB x, BTN b1.8, BB c',
    turn: 'BB x, BTN b6.5, BB c',
    river: 'BB x, BTN b15, BB c',
  });

  it('Spot の添字を動かすと、候補は添字より前だけ・Hero 以外だけ・classifyActions の先頭部分と同じ', () => {
    const full = classifyActions(S, a);
    for (const hero of ['BTN', 'BB'] as const) {
      for (let spot = 0; spot <= a.length; spot++) {
        const cands = readCandidates(S, a, hero, spot);
        for (const c of cands) {
          expect(c.index, `hero=${hero} spot=${spot}`).toBeLessThan(spot);
          expect(c.pos).not.toBe(hero);
        }
        const expected = full.slice(0, spot).filter((c): c is ReadCandidate => c !== null && c.pos !== hero);
        expect(cands).toEqual(expected);
      }
    }
  });

  it('判断地点そのもの（添字）の Action と、それ以降の Action は候補に入らない', () => {
    // Hero = BB、Turn の BB の手番（添字 11）。BTN の Turn の Barrel（10）は候補、River の BTN の Barrel（13）は候補でない
    const c11 = readCandidates(S, a, 'BB', 11);
    expect(c11.map((c) => c.index)).toEqual([4, 7, 10]);
    const c10 = readCandidates(S, a, 'BB', 10);
    expect(c10.map((c) => c.index)).toEqual([4, 7]); // Turn の Barrel（10）は「判断地点そのもの」の添字以降
    // 後ろに足した Action は変えない
    const c7 = readCandidates(S, a, 'BB', 7);
    expect(c7.map((c) => c.index)).toEqual([4]);
  });

  it('Hero 自身の Action（Preflop の Open・Flop の C-Bet など）は Hero のときは入らない', () => {
    const cBTN = readCandidates(S, a, 'BTN', 10);
    expect(cBTN.every((c) => c.pos !== 'BTN')).toBe(true);
    expect(cBTN.map((c) => c.action)).toEqual(['fold_steal']);
  });

  it('classifyActions の添字 i の結果は、i より後の Action を足しても（削っても）変わらない（手で作った 4 つのハンド）', () => {
    const hands = [
      a,
      acts({ pf: 'UTG r3, HJ c, CO c, BTN c, SB r14, BB f, UTG f, HJ c, CO f, BTN f', flop: 'SB b5, HJ r15, SB r40, HJ c', turn: 'SB x, HJ b20, SB f' }),
      acts({ pf: 'UTG c, HJ f, CO f, BTN c, SB c, BB x', flop: 'SB x, BB x, UTG b2, BTN r8, SB f, BB f, UTG c', turn: 'UTG x, BTN b12, UTG c', river: 'UTG b30' }),
      acts({ pf: 'UTG..CO f, BTN r2.5, SB c, BB c', flop: 'SB x, BB b2, BTN f, SB c', turn: 'SB b4, BB r20, SB r60, BB c', river: 'SB x, BB x' }),
    ];
    for (const h of hands) {
      const full = classifyActions(S, h);
      for (let k = 0; k <= h.length; k++) {
        const prefix = classifyActions(S, h.slice(0, k));
        expect(prefix, `k=${k}`).toEqual(full.slice(0, k));
      }
    }
  });

  it('Hero の判断地点以降に起きること（後の Bet・Fold の名前）が、前の候補の名前を変えない', () => {
    // Turn の判断地点（Hero = BB。添字 11）の候補は、River の展開が違っても同じ
    const alt = acts({
      pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
      flop: 'BB x, BTN b1.8, BB c',
      turn: 'BB x, BTN b6.5, BB r30, BTN f',
    });
    expect(readCandidates(S, alt, 'BB', 11)).toEqual(readCandidates(S, a, 'BB', 11));
  });

  it('spotCandidates の各添字で、候補が判断地点より前に収まる（Flop 以降のすべての Hero の手番）', () => {
    for (const hero of POSITIONS) {
      for (const sc of spotCandidates(a, hero)) {
        for (const c of readCandidates(S, a, hero, sc.index)) expect(c.index).toBeLessThan(sc.index);
      }
    }
  });
});
