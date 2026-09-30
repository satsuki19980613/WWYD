/**
 * T1-05（検証の表の全組）・T1-06（verifyReads）・T1-08（旧仕様の値）・T1-09（MTT の境界）。
 * 期待値は 18 章 §2.1・§2.4・§3 の表から手で決めた（実装の表を写していない）。
 */
import { describe, expect, it } from 'vitest';
import { POSITIONS, PLAYER_COUNTS, SEATS_BY_COUNT, STREETS, type Pos, type Street } from '../constants.ts';
import { ValidationError, type ValidationCode } from '../errors.ts';
import { classifyActions, readCandidates, villainSeats } from '../poker/readActions.ts';
import { spotCandidates } from '../poker/spot.ts';
import { acts, setup } from '../poker/testHelpers.ts';
import { hmw, hs1, hs1bb, hs3, type Raw } from './postFixtures.ts';
import { validateMtt, validateReads, verifyReads, type VillainReads } from './reads.ts';
import { validateInput } from './validateInput.ts';
import { verifyPost } from './verifyPost.ts';

const SEATS = POSITIONS;

function codeOf(f: () => unknown): ValidationCode | null {
  try {
    f();
    return null;
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    return e.code;
  }
}

// ---- 18 章 §2.1.5 の表（手で写した期待） ----
const EXPECT_STREET_ACTIONS: Record<Street, string[]> = {
  pf: ['3bet', 'fold_3bet', '4bet', 'fold_4bet', 'squeeze', 'limp', 'fold_steal'],
  flop: ['cbet', 'fold_cbet', 'donk', 'bet_vs_check', 'raise', 'fold_bet', 'fold_raise'],
  turn: ['barrel', 'fold_barrel', 'delayed_cbet', 'donk', 'probe', 'bet_vs_check', 'raise', 'fold_bet', 'fold_raise'],
  river: ['barrel', 'fold_barrel', 'donk', 'probe', 'bet_vs_check', 'raise', 'fold_bet', 'fold_raise'],
};
const EXPECT_AGGRESSIVE = ['3bet', '4bet', 'squeeze', 'cbet', 'barrel', 'delayed_cbet', 'donk', 'probe', 'bet_vs_check', 'raise'];
const ALL_ACTIONS = [...new Set(Object.values(EXPECT_STREET_ACTIONS).flat())];
const LEANS = ['over', 'under', 'value', 'bluff'];
const SIZES: (string | null)[] = [null, 'small', 'big', 'overbet'];

const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  scope: 'general',
  street: 'turn',
  action: 'barrel',
  texture: null,
  runout: null,
  size: null,
  lean: 'over',
  strong: false,
  ...over,
});
const v = (e: Record<string, unknown>): unknown => validateReads({ SB: { reads: [e] } }, SEATS, 'BTN');

describe('T1-05 検証の表の全組', () => {
  it('Street × Action × Lean × Size の全組（4 × 18 × 4 × 4 = 1152 通り）が 18 章 §2.1 の表と一致（通る or invalid_reads）', () => {
    let pass = 0;
    let fail = 0;
    for (const street of STREETS) {
      for (const action of ALL_ACTIONS) {
        for (const lean of LEANS) {
          for (const size of SIZES) {
            const aggressive = EXPECT_AGGRESSIVE.includes(action);
            const ok =
              EXPECT_STREET_ACTIONS[street].includes(action) &&
              (aggressive || (lean === 'over' || lean === 'under')) &&
              (size === null || (aggressive && (street === 'pf' ? size !== 'overbet' : true)));
            const e = entry({ street, action, lean, size });
            const got = codeOf(() => v(e));
            expect(got, JSON.stringify({ street, action, lean, size })).toBe(ok ? null : 'invalid_reads');
            ok ? pass++ : fail++;
          }
        }
      }
    }
    expect(pass + fail).toBe(4 * 18 * 4 * 4);
    expect(pass).toBeGreaterThan(100);
  });

  it('strong（強い）は Action・Lean に関係なく true / false が通る（型は boolean だけ）', () => {
    for (const strong of [true, false]) expect(codeOf(() => v(entry({ strong })))).toBeNull();
    for (const strong of [1, 0, 'true', null, undefined]) expect(codeOf(() => v(entry({ strong }))), String(strong)).toBe('malformed');
  });

  it('条件: texture（Preflop は断る）・runout（Turn・River だけ）・Spot Read の条件の全組', () => {
    const texts: Record<string, unknown>[] = [
      {},
      { high: 'a' },
      { suit: 'mono' },
      { paired: 'paired' },
      { connect: 'straight' },
      { high: 'low', suit: 'rainbow', paired: 'unpaired', connect: 'none' },
    ];
    const runoutSets: string[][] = [[], ['brick'], ['over', 'flush'], ['over', 'flush', 'straight', 'pair'], ['brick', 'over', 'flush', 'straight', 'pair']];
    for (const street of STREETS) {
      const action = EXPECT_STREET_ACTIONS[street][0] as string; // 各 Street で有効な Action
      for (const scope of ['general', 'spot']) {
        for (const texture of [null, ...texts]) {
          for (const runout of [null, ...runoutSets]) {
            const nonEmptyTexture = texture !== null && Object.keys(texture).length > 0;
            const nonEmptyRunout = runout !== null && runout.length > 0;
            let ok = true;
            if (nonEmptyTexture && street === 'pf') ok = false;
            if (nonEmptyRunout && street !== 'turn' && street !== 'river') ok = false;
            if (scope === 'spot' && (nonEmptyTexture || nonEmptyRunout)) ok = false;
            // Brick とほかの Runout は同時に選べない（V-039）
            if (runout !== null && runout.includes('brick') && runout.length > 1) ok = false;
            const e = entry({ scope, street, action, texture, runout });
            expect(codeOf(() => v(e)), JSON.stringify({ scope, street, texture, runout })).toBe(ok ? null : 'invalid_reads');
          }
        }
      }
    }
  });

  it('条件の値の全部（texture の各軸・Runout の各値）を通す。知らない値は malformed', () => {
    const axes = { high: ['a', 'k', 'qj', 'mid', 'low'], suit: ['rainbow', 'two', 'mono'], paired: ['unpaired', 'paired'], connect: ['straight', 'none'] };
    for (const [k, vals] of Object.entries(axes)) {
      for (const x of vals) expect(codeOf(() => v(entry({ street: 'flop', action: 'cbet', texture: { [k]: x } }))), `${k}=${x}`).toBeNull();
      for (const bad of ['', 'A', 'x', 1, null, true, ['a']]) {
        expect(codeOf(() => v(entry({ street: 'flop', action: 'cbet', texture: { [k]: bad } }))), `${k}=${String(bad)}`).toBe('malformed');
      }
    }
    for (const r of ['brick', 'over', 'flush', 'straight', 'pair']) expect(codeOf(() => v(entry({ runout: [r] }))), r).toBeNull();
    for (const bad of [['x'], [''], ['Brick'], [1], [null], 'brick', {}, [['brick']], ['brick', 'brick']]) {
      expect(codeOf(() => v(entry({ runout: bad }))), JSON.stringify(bad)).toBe('malformed');
    }
  });

  it('Preflop で Runout・texture が空（{}・[]）なら通り、null に正規化される。Runout は決まった順に並ぶ', () => {
    const r = validateReads({ SB: { reads: [entry({ street: 'pf', action: '3bet', texture: {}, runout: [] })] } }, SEATS, 'BTN');
    expect(r.SB?.reads?.[0]).toMatchObject({ texture: null, runout: null });
    const r2 = validateReads({ SB: { reads: [entry({ runout: ['pair', 'over', 'flush'] })] } }, SEATS, 'BTN');
    expect(r2.SB?.reads?.[0]?.runout).toEqual(['over', 'flush', 'pair']);
  });

  it('形の崩れ（知らないキー・型・重複・空・null・配列）は malformed', () => {
    const bad: [string, unknown][] = [
      ['VillainReads が配列', []],
      ['VillainReads が文字列', 'x'],
      ['VillainReads が数', 1],
      ['席が null', { SB: null }],
      ['席が配列', { SB: [] }],
      ['席が文字列', { SB: 'x' }],
      ['席のキーが小文字', { sb: { vpip: 10 } }],
      ['知らない席のキー', { SB2: { vpip: 10 } }],
      ['空の席名', { '': { vpip: 10 } }],
      ['席に知らないキー', { SB: { vpip: 10, foo: 1 } }],
      ['席に memo', { SB: { memo: 'abc' } }],
      ['席に conf', { SB: { conf: 2 } }],
      ['席に __proto__ のキー（JSON から）', JSON.parse('{"SB":{"__proto__":{"x":1}}}')],
      ['reads が null', { SB: { reads: null } }],
      ['reads がオブジェクト', { SB: { reads: {} } }],
      ['reads が文字列', { SB: { reads: 'x' } }],
      ['Read が null', { SB: { reads: [null] } }],
      ['Read が配列', { SB: { reads: [[]] } }],
      ['Read が文字列', { SB: { reads: ['x'] } }],
      ['Read に知らないキー', { SB: { reads: [entry({ index: 1 })] } }],
      ['Read の scope が欠ける', { SB: { reads: [{ ...entry(), scope: undefined }] } }],
      ['Read の street が欠ける', { SB: { reads: [{ ...entry(), street: undefined }] } }],
      ['Read の action が欠ける', { SB: { reads: [{ ...entry(), action: undefined }] } }],
      ['Read の lean が欠ける', { SB: { reads: [{ ...entry(), lean: undefined }] } }],
      ['Read の strong が欠ける', { SB: { reads: [{ ...entry(), strong: undefined }] } }],
      ['texture が配列', { SB: { reads: [entry({ texture: [] })] } }],
      ['texture が文字列', { SB: { reads: [entry({ texture: 'a' })] } }],
      ['texture の軸が null', { SB: { reads: [entry({ street: 'flop', action: 'cbet', texture: { high: null } })] } }],
      ['size が空文字', { SB: { reads: [entry({ size: '' })] } }],
      ['size が大文字', { SB: { reads: [entry({ size: 'Small' })] } }],
      ['street が大文字', { SB: { reads: [entry({ street: 'Turn' })] } }],
      ['Street が preflop（正しくは pf）', { SB: { reads: [entry({ street: 'preflop' })] } }],
      ['scope が general 以外の文字', { SB: { reads: [entry({ scope: 'General' })] } }],
      ['vpip が文字列', { SB: { vpip: '10' } }],
      ['vpip が null', { SB: { vpip: null } }],
      ['vpip が真偽値', { SB: { vpip: true } }],
      ['vpip が小数', { SB: { vpip: 10.5 } }],
      ['vpip が NaN', { SB: { vpip: Number.NaN } }],
      ['vpip が Infinity', { SB: { vpip: Number.POSITIVE_INFINITY } }],
      ['agg が配列', { SB: { agg: [1] } }],
      ['image が小数', { SB: { image: 1.5 } }],
    ];
    for (const [name, raw] of bad) expect(codeOf(() => validateReads(raw, SEATS, 'BTN')), name).toBe('malformed');
  });

  it('全体の傾向の境界: VPIP・PFR は 0〜100、Postflop Aggression・Hero Image は 0〜4。廃止した Sample は値によらず malformed', () => {
    for (const k of ['vpip', 'pfr'] as const) {
      for (const x of [0, 1, 50, 99, 100]) expect(codeOf(() => validateReads({ SB: { [k]: x } }, SEATS, 'BTN')), `${k}=${x}`).toBeNull();
      for (const x of [-1, 101, 1000, 1e21]) expect(codeOf(() => validateReads({ SB: { [k]: x } }, SEATS, 'BTN')), `${k}=${x}`).toBe('invalid_reads');
    }
    for (const k of ['agg', 'image'] as const) {
      for (const x of [0, 1, 2, 3, 4]) expect(codeOf(() => validateReads({ SB: { [k]: x } }, SEATS, 'BTN')), `${k}=${x}`).toBeNull();
      for (const x of [-1, 5, 50, 100]) expect(codeOf(() => validateReads({ SB: { [k]: x } }, SEATS, 'BTN')), `${k}=${x}`).toBe('invalid_reads');
    }
    for (const x of [0, 2, 4, 5, -1]) expect(codeOf(() => validateReads({ SB: { sample: x } }, SEATS, 'BTN')), `sample=${x}`).toBe('malformed');
    // -0 は 0 として通る（JSON にすると 0）
    expect(validateReads({ SB: { vpip: -0 } }, SEATS, 'BTN')).toEqual({ SB: { vpip: -0 } });
  });

  it('PFR ≦ VPIP（両方あるときだけ）。等しいのは通る。片方だけなら比べない', () => {
    for (const [vp, pf, ok] of [
      [0, 0, true],
      [100, 100, true],
      [100, 99, true],
      [30, 30, true],
      [30, 31, false],
      [0, 1, false],
      [99, 100, false],
    ] as const) {
      expect(codeOf(() => validateReads({ SB: { vpip: vp, pfr: pf } }, SEATS, 'BTN')), `${vp}/${pf}`).toBe(ok ? null : 'invalid_reads');
    }
    expect(codeOf(() => validateReads({ SB: { pfr: 100 } }, SEATS, 'BTN'))).toBeNull();
    expect(codeOf(() => validateReads({ SB: { vpip: 0 } }, SEATS, 'BTN'))).toBeNull();
  });

  it('席: 座っている席だけ・Hero は不可。2〜6 人のすべての人数とすべての Hero で確かめる', () => {
    for (const n of PLAYER_COUNTS) {
      const seats = SEATS_BY_COUNT[n];
      for (const hero of seats) {
        for (const p of POSITIONS) {
          const ok = seats.includes(p) && p !== hero;
          expect(codeOf(() => validateReads({ [p]: { vpip: 20 } }, seats, hero)), `${n}人 hero=${hero} seat=${p}`).toBe(ok ? null : 'malformed');
        }
      }
    }
  });

  it('Read の件数: Spot Read 1 件まで、General Read 2 件まで。Spot Read が先に並ぶ。重複はそのまま通る（仕様に規定なし）', () => {
    const spot = entry({ scope: 'spot' });
    const g = (street: string, action: string): Record<string, unknown> => entry({ street, action, lean: 'over' });
    const ok = validateReads({ SB: { reads: [g('river', 'barrel'), g('turn', 'probe'), spot] } }, SEATS, 'BTN');
    expect(ok.SB?.reads?.map((e) => e.scope)).toEqual(['spot', 'general', 'general']);
    expect(codeOf(() => validateReads({ SB: { reads: [spot, spot] } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { reads: [g('river', 'barrel'), g('turn', 'probe'), g('flop', 'cbet'), spot] } }, SEATS, 'BTN'))).toBe('invalid_reads');
    // 席ごとの上限（別の席は別に数える）
    expect(codeOf(() => validateReads({ SB: { reads: [spot] }, BB: { reads: [spot] } }, SEATS, 'BTN'))).toBeNull();
    // 観察: 同じ General Read の重複・Over と Under の矛盾は通る
    expect(codeOf(() => validateReads({ SB: { reads: [g('river', 'barrel'), g('river', 'barrel')] } }, SEATS, 'BTN'))).toBeNull();
    expect(codeOf(() => validateReads({ SB: { reads: [g('river', 'barrel'), entry({ street: 'river', action: 'barrel', lean: 'under' })] } }, SEATS, 'BTN'))).toBeNull();
  });

  it('中身の無い席（{}・reads []）は落とす。何も無ければ {}', () => {
    expect(validateReads({ SB: {}, BB: { reads: [] } }, SEATS, 'BTN')).toEqual({});
    expect(validateReads({}, SEATS, 'BTN')).toEqual({});
  });

  it('最大の Villain の情報（5 席 × 全項目 × 3 Read）の JSON が DB の 8KB の上限（18 章 §4）に収まる', () => {
    const longest = (scope: string): Record<string, unknown> =>
      entry({
        scope,
        street: 'river',
        action: 'fold_raise',
        texture: scope === 'spot' ? null : { high: 'mid', suit: 'rainbow', paired: 'unpaired', connect: 'straight' },
        runout: scope === 'spot' ? null : ['over', 'flush', 'straight', 'pair'], // Brick はほかと同時に選べない（V-039）
        size: null,
        lean: 'under',
        strong: false,
      });
    const richest = { street: 'river', action: 'bet_vs_check', lean: 'bluff', size: 'overbet', strong: false };
    const seat = { vpip: 100, pfr: 100, agg: 4, image: 4, reads: [entry({ scope: 'spot', ...richest }), longest('general'), entry({ ...longest('general'), ...richest })] };
    const raw = { UTG: seat, HJ: seat, CO: seat, SB: seat, BB: seat };
    const r = validateReads(raw, SEATS, 'BTN');
    const bytes = JSON.stringify(r).length // ASCII だけなのでバイト数と同じ;
    expect(bytes).toBeLessThan(8192);
    expect(bytes).toBeGreaterThan(3000);
  });
});

describe('T1-06 verifyReads（ハンドに照らす）', () => {
  // H-S1 を BB の手番で出題（ターンで BTN の b6.5 に向き合う。添字 11）。BTN の候補: Flop の C-Bet（Small）・Turn の Barrel（Big）。SB の Fold to Steal
  const base = (): { setup: ReturnType<typeof validateInput>['setup']; actions: ReturnType<typeof validateInput>['actions'] } => {
    const i = validateInput(hs1bb());
    return { setup: i.setup, actions: i.actions };
  };
  const spotRead = (over: Record<string, unknown>): Record<string, unknown> => entry({ scope: 'spot', ...over });
  const run = (reads: unknown, hero: Pos = 'BB', spot = 11): ValidationCode | null => {
    const { setup: st, actions } = base();
    return codeOf(() => verifyReads(validateReads(reads, SEATS, hero), st, actions, hero, spot));
  };

  it('合う Spot Read（Street・Action・Size が実際どおり）は通る', () => {
    expect(run({ BTN: { reads: [spotRead({ street: 'turn', action: 'barrel', size: 'big' })] } })).toBeNull();
    expect(run({ BTN: { reads: [spotRead({ street: 'flop', action: 'cbet', size: 'small', lean: 'bluff' })] } })).toBeNull();
    expect(run({ SB: { reads: [spotRead({ street: 'pf', action: 'fold_steal', size: null, lean: 'under' })] } })).toBeNull();
  });

  it('Street・Action・Size のどれか 1 つが違えば断る', () => {
    const ok = { street: 'turn', action: 'barrel', size: 'big' };
    for (const bad of [
      { street: 'flop' }, // Flop の Barrel は無い（Street × Action は表で断る）→ invalid_reads
      { street: 'river' }, // Street が違う（River の Barrel は判断地点より後）
      { action: 'probe' },
      { action: 'donk' },
      { action: 'raise' },
      { size: 'small' },
      { size: 'overbet' },
      { size: null },
    ]) {
      expect(run({ BTN: { reads: [spotRead({ ...ok, ...bad })] } }), JSON.stringify(bad)).toBe('invalid_reads');
    }
  });

  it('席が違う（BTN の Barrel を BB・SB の Spot Read にする）は断る。Hero の席は malformed', () => {
    const r = spotRead({ street: 'turn', action: 'barrel', size: 'big' });
    expect(run({ SB: { reads: [r] } })).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ BB: { reads: [r] } }, SEATS, 'BB'))).toBe('malformed');
  });

  it('判断地点より後の Action の Spot Read を断る（River の Barrel。Hero の判断地点を前後に動かす）', () => {
    const river = spotRead({ street: 'river', action: 'barrel', size: 'big' });
    const turn = spotRead({ street: 'turn', action: 'barrel', size: 'big' });
    expect(run({ BTN: { reads: [river] } }, 'BB', 11)).toBe('invalid_reads');
    // 判断地点を River の BB（添字 14）にすると、River の Barrel（添字 13）は判断地点より前になり通る
    expect(run({ BTN: { reads: [river] } }, 'BB', 14)).toBeNull();
    // Turn の Barrel（10）は判断地点 11 では通るが、判断地点 10 では通らない（Hero の Action 添字そのもの・以降は候補外）
    expect(run({ BTN: { reads: [turn] } }, 'BB', 11)).toBeNull();
    expect(run({ BTN: { reads: [turn] } }, 'BB', 10)).toBe('invalid_reads');
  });

  it('登録できない席（Preflop で Fold しただけの UTG・HJ・CO）は、Spot Read が無くても断る。Hero の席は対象外', () => {
    for (const p of ['UTG', 'HJ', 'CO'] as const) expect(run({ [p]: { vpip: 10 } }), p).toBe('invalid_reads');
    expect(run({ SB: { vpip: 10 }, BTN: { vpip: 10 } })).toBeNull();
  });

  it('全体の傾向だけの席・General Read だけの席は、ハンドに照らしても通る（General Read の Street はハンドに縛られない）', () => {
    expect(run({ BTN: { vpip: 30, pfr: 20, agg: 3 } })).toBeNull();
    expect(run({ BTN: { reads: [entry({ street: 'river', action: 'fold_bet', lean: 'under' })] } })).toBeNull();
  });

  it('Spot Read の候補と verifyReads の判定が、すべての組み合わせで一致する（Street × Action × Size × Lean の全部を席ごとに）', () => {
    const { setup: st, actions } = base();
    const cands = readCandidates(st, actions, 'BB', 11);
    const eligible = villainSeats(st, actions, 'BB');
    let accepted = 0;
    for (const seat of SEATS) {
      if (seat === 'BB') continue;
      for (const street of STREETS) {
        for (const action of EXPECT_STREET_ACTIONS[street]) {
          for (const size of SIZES) {
            const aggressive = EXPECT_AGGRESSIVE.includes(action);
            if (size !== null && (!aggressive || (street === 'pf' && size === 'overbet'))) continue; // validateReads が断る組は別の試験
            const lean = 'over';
            const reads = validateReads({ [seat]: { reads: [spotRead({ street, action, size, lean })] } }, SEATS, 'BB');
            const expected = eligible.includes(seat) && cands.some((c) => c.pos === seat && c.street === street && c.action === action && c.size === size);
            const got = codeOf(() => verifyReads(reads, st, actions, 'BB', 11));
            expect(got, JSON.stringify({ seat, street, action, size })).toBe(expected ? null : 'invalid_reads');
            if (expected) accepted++;
          }
        }
      }
    }
    // BTN の Flop C-Bet・Turn Barrel と SB の Fold to Steal の 3 つだけが通る
    expect(accepted).toBe(3);
  });

  it('Bet・Raise 系の Spot Read は Size が必須（null は実際の額に合わない）。Preflop の 3-Bet 等の Spot Read は Size なし', () => {
    const st = setup();
    const actions = acts({
      pf: 'UTG r3, HJ..BTN f, SB r10, BB f, UTG c',
      flop: 'SB b5, UTG c',
      turn: 'SB x, UTG b8, SB f',
    });
    // Hero = UTG、判断地点は Flop の UTG の手番（添字 8。SB の C-Bet 5 に向き合う）
    const r = (e: Record<string, unknown>, spot = 8): ValidationCode | null =>
      codeOf(() => verifyReads(validateReads({ SB: { reads: [spotRead(e)] } }, SEATS, 'UTG'), st, actions, 'UTG', spot));
    expect(r({ street: 'pf', action: '3bet', size: null, lean: 'value' })).toBeNull();
    expect(r({ street: 'pf', action: '3bet', size: 'big', lean: 'value' })).toBe('invalid_reads');
    expect(r({ street: 'pf', action: '3bet', size: 'small', lean: 'value' })).toBe('invalid_reads');
    // Flop の SB の C-Bet 5 は Pot 21 の 24%（Small）。Size が違う・null は断る
    expect(r({ street: 'flop', action: 'cbet', size: 'small', lean: 'value' })).toBeNull();
    expect(r({ street: 'flop', action: 'cbet', size: 'big', lean: 'value' })).toBe('invalid_reads');
    expect(r({ street: 'flop', action: 'cbet', size: null, lean: 'value' })).toBe('invalid_reads');
  });

  it('verifyPost を通した本文: 登録できない席の情報を含めると invalid_reads。derived_mismatch が先に出る', () => {
    const good = { ...hs1bb(), villain_reads: { BTN: { reads: [spotRead({ street: 'turn', action: 'barrel', size: 'big' })] } } };
    expect(codeOf(() => verifyPost(validateInput(good)))).toBeNull();
    const bad = { ...hs1bb(), villain_reads: { UTG: { vpip: 10 } } };
    expect(codeOf(() => verifyPost(validateInput(bad)))).toBe('invalid_reads');
    const both = { ...bad, derived: { ...(hs1bb().derived as Record<string, unknown>), min_to: 14 } };
    expect(codeOf(() => verifyPost(validateInput(both)))).toBe('derived_mismatch');
  });

  it('H-MW・H-S3 でも、候補どおりの Spot Read だけ通る（全ての Hero の手番を判断地点にして）', () => {
    for (const raw of [hmw(), hs3(), hs1()] as Raw[]) {
      const inp = validateInput(raw);
      for (const sc of spotCandidates(inp.actions, inp.hero)) {
        const cands = readCandidates(inp.setup, inp.actions, inp.hero, sc.index);
        for (const c of cands) {
          const e = spotRead({ street: c.street, action: c.action, size: c.size, lean: 'over' });
          const reads = validateReads({ [c.pos]: { reads: [e] } }, SEATS, inp.hero) as VillainReads;
          expect(codeOf(() => verifyReads(reads, inp.setup, inp.actions, inp.hero, sc.index)), JSON.stringify(c)).toBeNull();
        }
        // 判断地点より後の候補は通らない
        const all = classifyActions(inp.setup, inp.actions);
        all.forEach((c, i) => {
          if (!c || c.pos === inp.hero || i < sc.index) return;
          const dup = cands.some((x) => x.pos === c.pos && x.street === c.street && x.action === c.action && x.size === c.size);
          if (dup) return;
          const e = spotRead({ street: c.street, action: c.action, size: c.size, lean: 'over' });
          const reads = validateReads({ [c.pos]: { reads: [e] } }, SEATS, inp.hero);
          expect(codeOf(() => verifyReads(reads, inp.setup, inp.actions, inp.hero, sc.index)), `後の Action ${JSON.stringify(c)}`).toBe('invalid_reads');
        });
      }
    }
  });
});

describe('T1-08 旧仕様の値', () => {
  it('memo・conf は知らない項目として malformed。旧 Postflop Aggression の 0〜100 の値（5 以上）は範囲外', () => {
    expect(codeOf(() => validateReads({ SB: { memo: '' } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { memo: 'タイトなレギュラー' } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { vpip: 30, memo: 'x' } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { conf: 0 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { conf: 100 } }, SEATS, 'BTN'))).toBe('malformed');
    for (const agg of [5, 10, 33, 50, 75, 100]) expect(codeOf(() => validateReads({ SB: { agg } }, SEATS, 'BTN')), `agg=${agg}`).toBe('invalid_reads');
    for (const image of [5, 40, 50, 100]) expect(codeOf(() => validateReads({ SB: { image } }, SEATS, 'BTN')), `image=${image}`).toBe('invalid_reads');
  });

  it('旧仕様の値の 0〜4 と重なる小さい値（agg: 0〜4）は新仕様の 5 分割として通る（見分けられない）', () => {
    // 旧仕様（0〜100%）の画面から agg=3（3%）が来ると、新仕様では「Aggressive（3）」として保存される。前の版の画面は公開前なので実害は無い
    expect(validateReads({ SB: { agg: 3 } }, SEATS, 'BTN')).toEqual({ SB: { agg: 3 } });
  });

  it('旧仕様の Preset の形・席ごとの文字列の情報（旧 Memo）は通らない', () => {
    expect(codeOf(() => validateReads({ SB: 'タイト' }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { vpip: 30, pfr: 20, agg: 3, image: 2, conf: 1, memo: 'x' } }, SEATS, 'BTN'))).toBe('malformed');
  });

  it('validateInput 経由でも（villain_reads）旧仕様の本文を断る', () => {
    expect(codeOf(() => validateInput({ ...hs1(), villain_reads: { SB: { memo: 'x' } } }))).toBe('malformed');
    expect(codeOf(() => validateInput({ ...hs1(), villain_reads: { SB: { agg: 50 } } }))).toBe('invalid_reads');
    // 配列・文字列・数・真偽値
    for (const x of [[], 'x', 1, true]) expect(codeOf(() => validateInput({ ...hs1(), villain_reads: x })), JSON.stringify(x)).toBe('malformed');
    // false・0・空文字は「省略」ではなく形の違い（null・undefined だけが省略）
    for (const x of [false, 0, '']) expect(codeOf(() => validateInput({ ...hs1(), villain_reads: x })), String(x)).toBe('malformed');
  });
});

describe('T1-09 MTT の検証の境界', () => {
  const m = (x: unknown, fmt: 'cash' | 'mtt' = 'mtt'): ValidationCode | null => codeOf(() => validateMtt(x, fmt));

  it('人数の欄（rank・left・paid・entries）: 0 は範囲外、1 は通る、1,000,000 は通る、1,000,001 は範囲外', () => {
    for (const k of ['rank', 'left', 'paid', 'entries']) {
      expect(m({ [k]: 0 }), `${k}=0`).toBe('invalid_mtt');
      expect(m({ [k]: -1 }), `${k}=-1`).toBe('invalid_mtt');
      expect(m({ [k]: 1 }), `${k}=1`).toBeNull();
      expect(m({ [k]: 1_000_000 }), `${k}=1e6`).toBeNull();
      expect(m({ [k]: 1_000_001 }), `${k}=1e6+1`).toBe('invalid_mtt');
      expect(m({ [k]: 1e21 }), `${k}=1e21`).toBe('invalid_mtt');
      for (const bad of [1.5, 0.5, '1', null, true, [], {}, Number.NaN, Number.POSITIVE_INFINITY]) {
        // null は「省略」ではなくキーの値なので形の違い（画面はキーごと送らない）
        expect(m({ [k]: bad }), `${k}=${String(bad)}`).toBe('malformed');
      }
    }
  });

  it('Tournament Type（speed）: 0〜100 の整数。-1・101 は範囲外、小数・文字は malformed', () => {
    for (const x of [0, 1, 50, 99, 100]) expect(m({ speed: x }), `speed=${x}`).toBeNull();
    for (const x of [-1, 101, 1000]) expect(m({ speed: x }), `speed=${x}`).toBe('invalid_mtt');
    for (const x of [0.5, 99.9, '50', null, true, Number.NaN]) expect(m({ speed: x }), `speed=${String(x)}`).toBe('malformed');
  });

  it('Avg Stack: 0 より大きく 99,999 まで、小数第 1 位まで', () => {
    for (const x of [0.1, 0.5, 1, 12.3, 12.5, 99998.9, 99999]) expect(m({ avg: x }), `avg=${x}`).toBeNull();
    for (const x of [0, -0.1, -5, 99999.1, 100000, 1e9, 12.34, 12.05, 0.05, 0.04, 99999.04]) expect(m({ avg: x }), `avg=${x}`).toBe('invalid_mtt');
    for (const x of ['30', null, true, [], Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(m({ avg: x }), `avg=${String(x)}`).toBe('malformed');
    // 浮動小数の誤差（0.1 + 0.2）は許す
    expect(m({ avg: 0.1 + 0.2 })).toBeNull();
    expect(m({ avg: 32.1 })).toBeNull();
    expect(m({ avg: 1234.5 })).toBeNull();
  });

  it('Avg Stack の小数第 1 位でない値（1e-10・12.3 + 1e-11）は invalid_mtt（V-021 で直した）', () => {
    const r1 = codeOf(() => validateMtt({ avg: 1e-10 }, 'mtt'));
    const r2 = codeOf(() => validateMtt({ avg: 12.3 + 1e-11 }, 'mtt'));
    expect([r1, r2]).toEqual(['invalid_mtt', 'invalid_mtt']);
    for (const ok of [0.1, 0.3, 12.3, 35.5, 99999, 99998.9]) expect(codeOf(() => validateMtt({ avg: ok }, 'mtt')), String(ok)).toBeNull();
  });

  it('Prize Structure: top・standard・flat だけ。大文字・空・その他は malformed', () => {
    for (const x of ['top', 'standard', 'flat']) expect(m({ prize: x })).toBeNull();
    for (const x of ['Top', 'Top-heavy', 'Standard', '', 'other', null, 1, true]) expect(m({ prize: x }), String(x)).toBe('malformed');
  });

  it('人数の大小: rank ≦ left ≦ entries、rank ≦ entries、paid ≦ entries。等しいのは通る。paid は left・rank と比べない', () => {
    const cases: [Record<string, number>, boolean][] = [
      [{ rank: 1, left: 1, entries: 1 }, true],
      [{ rank: 58, left: 58, entries: 320 }, true],
      [{ rank: 59, left: 58 }, false],
      [{ left: 321, entries: 320 }, false],
      [{ rank: 321, entries: 320 }, false],
      [{ paid: 321, entries: 320 }, false],
      [{ paid: 320, entries: 320 }, true],
      [{ paid: 50, left: 10 }, true], // ITM は残りの人数を超えてよい
      [{ paid: 50, rank: 100 }, true], // 入賞圏の外の順位
      [{ rank: 100, paid: 50, left: 100, entries: 100 }, true],
      [{ rank: 101, left: 100, entries: 100 }, false],
    ];
    for (const [x, ok] of cases) expect(m(x), JSON.stringify(x)).toBe(ok ? null : 'invalid_mtt');
  });

  it('Cash では MTT の情報を断る（どの項目でも）。空・省略は通る', () => {
    for (const x of [{ speed: 0 }, { rank: 1 }, { left: 1 }, { paid: 1 }, { entries: 1 }, { avg: 1 }, { prize: 'flat' }]) {
      expect(m(x, 'cash'), JSON.stringify(x)).toBe('invalid_mtt');
    }
    expect(m({}, 'cash')).toBeNull();
    expect(m(undefined, 'cash')).toBeNull();
    expect(m(null, 'cash')).toBeNull();
    // 形の違いは Cash でも malformed が先
    expect(m({ foo: 1 }, 'cash')).toBe('malformed');
    expect(m({ rank: 1.5 }, 'cash')).toBe('malformed');
  });

  it('全体の形: オブジェクトでない値・知らないキー・旧仕様のキー（stage・type・paid_places）は malformed', () => {
    for (const x of [[], 'x', 1, 0, false, true]) expect(m(x), JSON.stringify(x)).toBe('malformed');
    for (const k of ['stage', 'type', 'paidPlaces', 'paid_places', 'players', 'Rank', 'kind']) expect(m({ [k]: 1 }), k).toBe('malformed');
    expect(validateMtt({}, 'mtt')).toBeNull();
    expect(validateMtt(undefined, 'mtt')).toBeNull();
    expect(validateMtt(null, 'mtt')).toBeNull();
  });

  it('全項目を入れた値は、入れた順に関係なくそのまま返る。validateInput 経由（Cash は invalid_mtt、MTT は通る）', () => {
    const full = { prize: 'flat', avg: 12.5, entries: 320, paid: 50, left: 58, rank: 12, speed: 100 };
    expect(validateMtt(full, 'mtt')).toEqual(full);
    expect(codeOf(() => validateInput({ ...hs1(), mtt: full }))).toBe('invalid_mtt');
    expect(validateInput({ ...hs3(), mtt: full }).mtt).toEqual(full);
    expect(codeOf(() => validateInput({ ...hs3(), mtt: { rank: 0 } }))).toBe('invalid_mtt');
  });
});
