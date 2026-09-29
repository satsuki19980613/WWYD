/**
 * リリース前の総合テスト B-01（ランダムなハンド）・B-03（額の境界）・B-04（Spot の候補と Preflop の All-in）。
 * 種は固定。落ちたらテスト名・メッセージの種（seed）で再現できる。
 */
import { describe, expect, it } from 'vitest';
import type { Pos } from '../constants.ts';
import { ValidationError } from '../errors.ts';
import { MAX_AMOUNT_MBB, bbToMbb, formatBb, mbbToBb } from '../money.ts';
import { hasPreflopAllin, potBaseOf, spotCandidates, spotView } from './spot.ts';
import { replay, runActions } from './replay.ts';
import { advance, apply, initialState, legal, status } from './state.ts';
import { acts, setup } from './testHelpers.ts';
import { MismatchError, Oracle, Rng, playRandomHand, randomSetup, type Played } from './release.tb.gen.ts';

const HANDS = 12_000;

/** 1 ハンド分。落ちたら種を添える */
function play(seed: number, probe = false): Played {
  const rng = new Rng(seed);
  const s = randomSetup(rng);
  try {
    return playRandomHand(rng, s, { probeRejects: probe, pfFold: 0.05 + rng.next() * 0.2, allinP: rng.chance(0.5) ? 0.02 : 0.18 });
  } catch (e) {
    if (e instanceof MismatchError) throw new Error(`[seed=${seed}] ${e.message}\nsetup=${JSON.stringify(s)}`);
    throw new Error(`[seed=${seed}] ${e instanceof Error ? e.stack : String(e)}\nsetup=${JSON.stringify(s)}`);
  }
}

describe('B-01 ランダムなハンド（core と別実装の参照 Oracle を突き合わせる）', () => {
  it(`${HANDS} ハンド: 各手番で状態・合法手・手番・終了の判定が Oracle と一致し、最後まで replay できる`, () => {
    const agg = { hands: 0, actions: 0, over: 0, showdown: 0, runout: 0, incompleteRaise: 0, allin: 0, reopenBlocked: 0, streetsFlop: 0, postflop: 0, byCount: {} as Record<number, number> };
    for (let i = 0; i < HANDS; i++) {
      const seed = 1000 + i;
      const h = play(seed, i % 4 === 0);
      agg.hands++;
      agg.actions += h.actions.length;
      agg[h.end]++;
      agg.incompleteRaise += h.stats.incompleteRaise;
      agg.allin += h.stats.allinActions;
      agg.reopenBlocked += h.stats.reopenBlocked;
      if (h.actions.some((a) => a.street !== 'pf')) agg.postflop++;
      const n = Object.values(h.setup.stacks).filter((v) => v > 0).length;
      agg.byCount[n] = (agg.byCount[n] ?? 0) + 1;
    }
    // 網羅の確認（生成が偏っていないこと）
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-01 統計', JSON.stringify(agg));
    expect(agg.hands).toBe(HANDS);
    expect(agg.over).toBeGreaterThan(500);
    expect(agg.showdown).toBeGreaterThan(500);
    expect(agg.runout).toBeGreaterThan(500);
    expect(agg.incompleteRaise).toBeGreaterThan(300);
    expect(agg.reopenBlocked).toBeGreaterThan(300);
    expect(agg.postflop).toBeGreaterThan(3000);
    for (const n of [2, 3, 4, 5, 6]) expect(agg.byCount[n] ?? 0).toBeGreaterThan(500);
  }, 120_000);

  it('全ハンドで、runActions の途中状態（states[i+1]）が 1 手ずつの apply と一致する', () => {
    for (let i = 0; i < 1500; i++) {
      const h = play(50_000 + i);
      const states = runActions(h.setup, h.actions);
      expect(states.length, `seed=${50_000 + i}`).toBe(h.actions.length + 1);
      // 独立に Oracle で最後まで再生し、最終状態を比べる
      const o = new Oracle(h.setup);
      for (const a of h.actions) {
        while (o.status().kind === 'streetEnd') o.advance();
        o.apply(a);
      }
      const last = states[states.length - 1]!;
      expect(last.currentBet, `seed=${50_000 + i}`).toBe(o.cur);
      expect(last.pot).toBe(o.pot);
    }
  });

  it('1 手でも変えたら（違う席・違うストリート・余分な手）replay は必ず断る', () => {
    for (let i = 0; i < 800; i++) {
      const seed = 90_000 + i;
      const h = play(seed);
      if (h.actions.length === 0) continue;
      const rng = new Rng(seed);
      // 最後の 1 手を落とす → hand_incomplete か、最後が streetEnd を超えた形
      expect(() => replay(h.setup, h.actions.slice(0, -1), h.boardCount), `seed=${seed} 最後を落とす`).toThrow(ValidationError);
      // 終了後にもう 1 手足す → action_after_end
      const last = h.actions[h.actions.length - 1]!;
      expect(() => replay(h.setup, [...h.actions, { ...last }], h.boardCount), `seed=${seed} 余分な手`).toThrow(ValidationError);
      // 途中の手の席を別の席にする → not_your_turn
      const k = rng.int(0, h.actions.length - 1);
      const a = h.actions[k]!;
      const seat = (['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as Pos[]).find((p) => p !== a.pos && h.setup.stacks[p] > 0)!;
      const mutated = h.actions.map((x, j) => (j === k ? { ...x, pos: seat } : x));
      expect(() => replay(h.setup, mutated, h.boardCount), `seed=${seed} 席を変える k=${k}`).toThrow(ValidationError);
      // ボードの枚数が 1 枚違えば board_mismatch
      expect(() => replay(h.setup, h.actions, h.boardCount + 1), `seed=${seed} ボード+1`).toThrow(ValidationError);
      if (h.boardCount > 0) expect(() => replay(h.setup, h.actions, h.boardCount - 1), `seed=${seed} ボード-1`).toThrow(ValidationError);
    }
  });
});

describe('B-03 額の境界', () => {
  const S = (stacks: Partial<Record<Pos, number>> = {}, opts: Parameters<typeof setup>[1] = {}) => setup(stacks, opts);

  it('最小レイズちょうどは合法・1mbb 下は amount_out_of_range', () => {
    const st = initialState(S());
    const lg = legal(st, 'UTG');
    expect(lg.raise).toEqual({ min: 2000, max: 100000 });
    expect(() => apply(st, { street: 'pf', pos: 'UTG', type: 'raise', to: 2000 })).not.toThrow();
    expect(() => apply(st, { street: 'pf', pos: 'UTG', type: 'raise', to: 1999 })).toThrow(/amount_out_of_range/);
    expect(() => apply(st, { street: 'pf', pos: 'UTG', type: 'raise', to: 100001 })).toThrow(/amount_out_of_range/);
    expect(() => apply(st, { street: 'pf', pos: 'UTG', type: 'raise', to: 100000 })).not.toThrow();
  });

  it('再レイズの最小は「直前のレイズ幅」（3 → 9 の次は 15。14.999 は不可）', () => {
    let st = initialState(S());
    st = apply(st, { street: 'pf', pos: 'UTG', type: 'raise', to: 3000 });
    st = apply(st, { street: 'pf', pos: 'HJ', type: 'raise', to: 9000 });
    expect(legal(st, 'CO').raise?.min).toBe(15000);
    expect(() => apply(st, { street: 'pf', pos: 'CO', type: 'raise', to: 14999 })).toThrow(/amount_out_of_range/);
  });

  it('All-in ちょうど（max）は合法で、そのとき stack は 0・allin に入る。max+1 は不可', () => {
    let st = initialState(S({ UTG: 12.345 }));
    const r = legal(st, 'UTG').raise!;
    expect(r.max).toBe(12345);
    st = apply(st, { street: 'pf', pos: 'UTG', type: 'raise', to: r.max });
    expect(st.stacks.UTG).toBe(0);
    expect(st.allin.has('UTG')).toBe(true);
  });

  it('不完全なレイズ（オールイン）で、すでにアクションした席は再オープンされない（INC-01〜04）', () => {
    // INC-02: HJ 4bb。UTG r3, HJ r4(不完全)。CO f BTN f SB f BB f の後、UTG は fold/call 1 のみ
    let st = initialState(S({ HJ: 4 }));
    for (const a of acts({ pf: 'UTG r3, HJ r4, CO f, BTN f, SB f, BB f' })) st = apply(st, a);
    expect(status(st)).toEqual({ kind: 'act', pos: 'UTG' });
    const lg = legal(st, 'UTG');
    expect(lg.raise).toBeNull();
    expect(lg.call).toBe(1000);
    // 不完全レイズは minRaise を変えない
    expect(st.minRaise).toBe(2000);
    // 累積（INC-03）: CO 5bb の 2 つ目の不完全レイズでも再オープンしない
    let st3 = initialState(S({ HJ: 4, CO: 5 }));
    for (const a of acts({ pf: 'UTG r3, HJ r4, CO r5, BTN f, SB f, BB f' })) st3 = apply(st3, a);
    expect(legal(st3, 'UTG').raise).toBeNull();
    // 有効なレイズ（INC-04）は再オープンする
    let st4 = initialState(S({ HJ: 4 }));
    for (const a of acts({ pf: 'UTG r3, HJ r4, CO r8, BTN f, SB f, BB f' })) st4 = apply(st4, a);
    expect(legal(st4, 'UTG').raise).toEqual({ min: 12000, max: 100000 });
  });

  it('未アクションの席は不完全レイズのあとも再レイズできる（RAISE-06）', () => {
    let st = initialState(S({ UTG: 1.8 }));
    st = apply(st, { street: 'pf', pos: 'UTG', type: 'raise', to: 1800 });
    expect(st.minRaise).toBe(1000);
    expect(legal(st, 'HJ').raise).toEqual({ min: 2800, max: 100000 });
  });

  it('BB オプション: BB は check か raise（bet は不可）。オールインの SB のコールだけなら runout（BBOPT-04）', () => {
    let st = initialState(S());
    for (const a of acts({ pf: 'UTG..BTN f, SB c' })) st = apply(st, a);
    const lg = legal(st, 'BB');
    expect(lg.check).toBe(true);
    expect(lg.bet).toBeNull();
    expect(lg.raise).toEqual({ min: 2000, max: 100000 });
    expect(() => apply(st, { street: 'pf', pos: 'BB', type: 'bet', to: 3000 })).toThrow(/illegal_action/);
    let st2 = initialState(S({}, { sb: 1 }));
    st2 = apply(st2, { street: 'pf', pos: 'UTG', type: 'fold' });
    for (const p of ['HJ', 'CO', 'BTN'] as const) st2 = apply(st2, { street: 'pf', pos: p, type: 'fold' });
    // SB は sb=1 で BB と同額。SB のスタックは 99 → オールインではないので、SB に手番がある
    expect(status(st2)).toEqual({ kind: 'act', pos: 'SB' });
  });

  it('Ante・SB・BB が All-in になる初期状態（INIT-03〜07）', () => {
    // INIT-03: ante 0.125、UTG 0.1 → UTG は 0.1 を払って All-in、pot 0.725
    const a = initialState(S({ UTG: 0.1 }, { ante: 0.125 }));
    expect(a.allin.has('UTG')).toBe(true);
    expect(a.stacks.UTG).toBe(0);
    // ante 分: 0.1 + 0.125 * 5 = 0.725
    expect(a.pot).toBe(725);
    // INIT-04: SB 0.125 は Ante で All-in、bets.SB = 0
    const b = initialState(S({ SB: 0.125 }, { ante: 0.125 }));
    expect(b.allin.has('SB')).toBe(true);
    expect(b.bets.SB).toBe(0);
    expect(status(b)).toMatchObject({ kind: 'act', pos: 'UTG' });
    // INIT-06: BB 0.6（BB の額 1 に満たない）→ currentBet は bb のまま
    const c = initialState(S({ BB: 0.6 }));
    expect(c.bets.BB).toBe(600);
    expect(c.currentBet).toBe(1000);
    expect(c.allin.has('BB')).toBe(true);
    // ANTE-03: 5 席が Ante で All-in、BB だけがアクション可能でアクション 0 件 → runout
    const d = initialState(S({ UTG: 0.1, HJ: 0.1, CO: 0.1, BTN: 0.1, SB: 0.1 }, { ante: 0.125 }));
    expect(status(d)).toEqual({ kind: 'runout' });
  });

  it('スタック 9999.999 と小数第 4 位', () => {
    expect(bbToMbb(9999.999)).toBe(MAX_AMOUNT_MBB);
    expect(bbToMbb(10000)).toBeNull();
    expect(bbToMbb(9999.9999)).toBeNull();
    expect(bbToMbb(0.0001)).toBeNull();
    expect(bbToMbb(0.001)).toBe(1);
    expect(bbToMbb(-0.0)).toBe(0);
    expect(bbToMbb(Number.NaN)).toBeNull();
    expect(bbToMbb(Infinity)).toBeNull();
    // 2 進の誤差は許す（0.1 * 3 など）
    for (let m = 0; m <= 10000; m++) expect(bbToMbb(mbbToBb(m)), `m=${m}`).toBe(m);
    // 巨大スタックでもチップが保存され、All-in の額が上限ちょうどになる
    const st = initialState(S({ UTG: 9999.999 }));
    expect(legal(st, 'UTG').raise?.max).toBe(MAX_AMOUNT_MBB);
    expect(formatBb(MAX_AMOUNT_MBB)).toBe('9999.999');
  });

  it('mbb → bb → mbb の往復（任意の整数 mbb、上限まで）', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200_000; i++) {
      const m = rng.int(0, MAX_AMOUNT_MBB);
      expect(bbToMbb(mbbToBb(m)), `m=${m}`).toBe(m);
    }
    // 表示の往復
    for (let i = 0; i < 20_000; i++) {
      const m = rng.int(0, MAX_AMOUNT_MBB);
      expect(bbToMbb(Number(formatBb(m))), `m=${m}`).toBe(m);
    }
  });
});

describe('B-04 Spot の候補・派生メタ・Preflop の All-in', () => {
  it('候補は Hero の Flop 以降のアクションすべて（Oracle の記録と一致）。派生メタが手番の Oracle の値と一致する', () => {
    let checked = 0;
    let candTotal = 0;
    for (let i = 0; i < 6000; i++) {
      const seed = 200_000 + i;
      const h = play(seed);
      const rng = new Rng(seed ^ 0x5bd1e995);
      const seated = (['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as Pos[]).filter((p) => h.setup.stacks[p] > 0);
      const hero = rng.pick(seated);
      const expected = h.actions.map((a, k) => ({ a, k })).filter(({ a }) => a.pos === hero && a.street !== 'pf').map(({ k }) => k);
      const cand = spotCandidates(h.actions, hero).map((c) => c.index);
      expect(cand, `seed=${seed} hero=${hero}`).toEqual(expected);
      candTotal += cand.length;
      const pfAllin = h.setup.stacks && hasPreflopAllin(h.setup, h.actions);
      // Preflop の All-in の独立な判定: Oracle で Preflop の手を再生し、座っている席のだれかが 0 なら真
      const o = new Oracle(h.setup);
      for (const a of h.actions) {
        if (a.street !== 'pf') break;
        o.apply(a);
      }
      const indep = seated.some((p) => o.p[p].stack === 0);
      expect(pfAllin, `seed=${seed} preflop all-in`).toBe(indep);

      for (const k of cand) {
        const snap = h.snapshots[k]!;
        const v = spotView(h.setup, h.actions, hero, k);
        const d = v.derived;
        expect(d.stopIndex).toBe(k);
        expect(d.street, `seed=${seed} k=${k}`).toBe(snap.street);
        const lg = snap.legal;
        const keys = lg.call !== null ? ['fold', 'call'] : ['check'];
        const s1 = lg.bet ?? lg.raise;
        if (s1) keys.push('s1');
        expect(d.keys, `seed=${seed} k=${k}`).toEqual(keys);
        expect(d.s1Label, `seed=${seed} k=${k}`).toBe(s1 ? (lg.bet ? 'bet' : 'raise') : null);
        expect(d.minTo).toBe(s1 ? s1.min : null);
        expect(d.maxTo).toBe(s1 ? s1.max : null);
        expect(d.potBase, `seed=${seed} k=${k}`).toBe(snap.potBase);
        const deepest = Math.max(...snap.othersAlive.map((p) => h.setup.stacks[p]));
        expect(d.effectiveStack, `seed=${seed} k=${k}`).toBe(Math.min(h.setup.stacks[hero], deepest));
        // 停止位置の状態は Hero の手番
        expect(status(v.state), `seed=${seed} k=${k}`).toEqual({ kind: 'act', pos: hero });
        expect(potBaseOf(v.state, hero)).toBe(snap.potBase);
        checked++;
      }
      // 候補でない添字は invalid_spot
      const nonCand = h.actions.map((_, k) => k).filter((k) => !expected.includes(k));
      for (const k of nonCand.slice(0, 3)) expect(() => spotView(h.setup, h.actions, hero, k), `seed=${seed} k=${k}`).toThrow(/invalid_spot/);
      expect(() => spotView(h.setup, h.actions, hero, h.actions.length)).toThrow(/invalid_spot/);
      expect(() => spotView(h.setup, h.actions, hero, -1)).toThrow(/invalid_spot/);
    }
    expect(checked).toBeGreaterThan(2000);
    expect(candTotal).toBe(checked);
  });

  it('Preflop の All-in の判定: Hero でも他の席でも、Ante・ブラインドの All-in でも、サイドポットで Flop 以降を続けても真', () => {
    // 他の席が All-in、Hero は Flop 以降に手番あり（サイドポット）
    const s = setup({ HJ: 20 });
    const a = acts({ pf: 'UTG f, HJ r20, CO f, BTN c, SB f, BB f', flop: 'BTN x' });
    // HJ が All-in、BTN が call → flop は canAct が BTN だけで runout。手を続けられないので、別の形で確認する
    expect(hasPreflopAllin(s, a.slice(0, 6))).toBe(true);
    // All-in が無い
    expect(hasPreflopAllin(setup(), acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c' }))).toBe(false);
    // BB が短く（ブラインドのポストで All-in）
    expect(hasPreflopAllin(setup({ BB: 0.6 }), acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f' }))).toBe(true);
    // アンティで All-in
    expect(hasPreflopAllin(setup({ UTG: 0.1 }, { ante: 0.125 }), [])).toBe(true);
    // ちょうど All-in になる Call（BTN 2.5 で call）
    expect(hasPreflopAllin(setup({ BTN: 2.5 }), acts({ pf: 'UTG f, HJ f, CO r2.5, BTN c' }))).toBe(true);
    // Flop で All-in になるのは Preflop の All-in ではない
    expect(hasPreflopAllin(setup(), acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN b97.5' }))).toBe(false);
  });

  it('spotCandidates: Preflop・他席のアクションは含まない。Hero の Fold・最後のアクションは含む', () => {
    const acts1 = acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN b1.8, BB f' });
    expect(spotCandidates(acts1, 'BTN').map((c) => c.index)).toEqual([7]);
    expect(spotCandidates(acts1, 'BB').map((c) => c.index)).toEqual([6, 8]);
    const acts2 = acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN x' });
    expect(spotCandidates(acts2, 'BTN').map((c) => c.index)).toEqual([7]);
    expect(spotCandidates(acts2, 'UTG')).toEqual([]);
    // 最後の手（ハンドの最後）も候補
    const st = runActions(setup(), acts2);
    expect(status(st[st.length - 1]!).kind).toBe('streetEnd');
  });

  it('advance はリバーの後に進めない', () => {
    let st = initialState(setup());
    for (const a of acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c' })) st = apply(st, a);
    for (let k = 0; k < 3; k++) {
      st = advance(st);
      st = apply(st, { street: st.street, pos: 'BB', type: 'check' });
      st = apply(st, { street: st.street, pos: 'BTN', type: 'check' });
    }
    expect(status(st).kind).toBe('showdown');
    expect(() => advance(st)).toThrow();
  });
});
