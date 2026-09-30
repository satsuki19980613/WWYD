/**
 * Villain・MTT の情報の検証（詳細仕様 18 章 §2.1・§3。RD-01〜）。
 */
import { describe, expect, it } from 'vitest';
import { ValidationError, type ValidationCode } from '../errors.ts';
import { hs1, hs1bb, type Raw } from './postFixtures.ts';
import { validateMtt, validateReads } from './reads.ts';
import { validateInput } from './validateInput.ts';
import { verifyPost } from './verifyPost.ts';

const SEATS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;

function codeOf(f: () => unknown): ValidationCode | null {
  try {
    f();
    return null;
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    return e.code;
  }
}

/** General Read の見本（Turn の Barrel、Big → Value-heavy） */
const general = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  scope: 'general',
  street: 'turn',
  action: 'barrel',
  texture: null,
  runout: null,
  size: 'big',
  lean: 'value',
  strong: false,
  ...over,
});

describe('RD Reads の検証', () => {
  it('RD-01 省略・null は情報なし', () => {
    expect(validateReads(undefined, SEATS, 'BTN')).toEqual({});
    expect(validateReads(null, SEATS, 'BTN')).toEqual({});
  });

  it('RD-02 全項目を入れた席はそのまま、中身の無い席は落とす。Spot Read を先に、Runout は決まった順、空の texture は null', () => {
    const spot = { scope: 'spot', street: 'flop', action: 'cbet', texture: null, runout: null, size: 'small', lean: 'over', strong: true };
    const g = general({ texture: {}, runout: ['pair', 'over'] });
    const r = validateReads({ SB: { vpip: 30, pfr: 20, agg: 1, image: 3, sample: 4, reads: [g, spot] }, BB: {}, CO: { reads: [] } }, SEATS, 'BTN');
    expect(r).toEqual({
      SB: { vpip: 30, pfr: 20, agg: 1, image: 3, sample: 4, reads: [spot, { ...g, texture: null, runout: ['over', 'pair'] }] },
    });
  });

  it('RD-03 Hero の席・空席・席でないキーは malformed', () => {
    expect(codeOf(() => validateReads({ BTN: { vpip: 20 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ UTG: { vpip: 20 } }, ['BTN', 'SB', 'BB'], 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ XX: { vpip: 20 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads([], SEATS, 'BTN'))).toBe('malformed');
  });

  it('RD-04 知らない項目（旧仕様の memo・conf を含む）・型の違い・選択肢の外は malformed', () => {
    expect(codeOf(() => validateReads({ SB: { memo: 'x' } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { conf: 1 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { vpip: 20.5 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { vpip: '20' } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { reads: {} } }, SEATS, 'BTN'))).toBe('malformed');
    for (const bad of [
      { scope: 'other' },
      { street: 'preflop' },
      { action: 'block_bet' },
      { lean: 'gto' },
      { strong: 1 },
      { size: 'huge' },
      { texture: { high: 'z' } },
      { texture: { foo: 'a' } },
      { runout: ['over', 'over'] },
      { runout: 'over' },
      { memo: 'x' },
    ]) {
      expect(codeOf(() => validateReads({ SB: { reads: [general(bad)] } }, SEATS, 'BTN')), JSON.stringify(bad)).toBe('malformed');
    }
  });

  it('RD-05 範囲の外は invalid_reads（% は 0〜100、5 分割は 0〜4）', () => {
    expect(codeOf(() => validateReads({ SB: { vpip: 101 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { agg: -1 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { agg: 5 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { sample: 5 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { image: 5 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(validateReads({ SB: { vpip: 100, pfr: 0, agg: 0, sample: 0, image: 4 } }, SEATS, 'BTN').SB).toBeDefined();
  });

  it('RD-06 PFR は VPIP を超えない（両方あるときだけ）', () => {
    expect(codeOf(() => validateReads({ SB: { vpip: 20, pfr: 21 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(validateReads({ SB: { vpip: 20, pfr: 20 } }, SEATS, 'BTN')).toEqual({ SB: { vpip: 20, pfr: 20 } });
    expect(validateReads({ SB: { pfr: 40 } }, SEATS, 'BTN')).toEqual({ SB: { pfr: 40 } });
  });

  it('RD-07 Street と Action、Action と Lean、条件の組み合わせの違反は invalid_reads', () => {
    for (const bad of [
      { street: 'flop', action: '3bet' },
      { street: 'turn', action: 'cbet' },
      { street: 'river', action: 'delayed_cbet' },
      { action: 'fold_bet', size: null, lean: 'value' },
      { street: 'pf', action: '3bet', size: null, texture: { high: 'a' } },
      { street: 'flop', action: 'cbet', runout: ['brick'] },
      { action: 'fold_barrel', lean: 'over', size: 'small' },
      { street: 'pf', action: '3bet', size: 'overbet' },
      { scope: 'spot', texture: { suit: 'mono' } },
      { scope: 'spot', runout: ['flush'] },
    ]) {
      expect(codeOf(() => validateReads({ SB: { reads: [general(bad)] } }, SEATS, 'BTN')), JSON.stringify(bad)).toBe('invalid_reads');
    }
    // Spot Read は 1 件、General Read は 2 件まで
    const spot = general({ scope: 'spot' });
    expect(codeOf(() => validateReads({ SB: { reads: [spot, spot] } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { reads: [general(), general(), general()] } }, SEATS, 'BTN'))).toBe('invalid_reads');
    // 通るもの: Preflop の 3-Bet（Big → Value-heavy）、条件つきの Flop の C-Bet
    const ok = [
      general({ street: 'pf', action: '3bet', size: 'big' }),
      general({ street: 'flop', action: 'cbet', size: null, lean: 'over', texture: { high: 'a', suit: 'two', paired: 'unpaired', connect: 'none' } }),
    ];
    expect(validateReads({ SB: { reads: ok } }, SEATS, 'BTN').SB?.reads).toHaveLength(2);
  });
});

describe('RD-08 ハンドに照らした検証（verifyReads）', () => {
  // H-S1 を BB の手番で出題（ターンの BTN b6.5 に向き合う）。BTN の候補は Flop の C-Bet（Small）とターンの Barrel（Big）
  const spot = (over: Record<string, unknown>): Record<string, unknown> => general({ scope: 'spot', ...over });

  it('Spot Read が判断地点より前の実際の Action（Street・Action・Size）に合えば通る', () => {
    const raw: Raw = { ...hs1bb(), villain_reads: { BTN: { vpip: 30, reads: [spot({}), general({ street: 'river' })] }, SB: { reads: [spot({ street: 'pf', action: 'fold_steal', size: null, lean: 'under' })] } } };
    expect(verifyPost(validateInput(raw)).reads.BTN?.reads?.[0]).toMatchObject({ scope: 'spot', action: 'barrel' });
  });

  it('Size が違う・判断地点より後・した事の無い Action の Spot Read は invalid_reads', () => {
    for (const s of [spot({ size: 'small' }), spot({ street: 'river' }), spot({ street: 'flop', action: 'donk', size: 'small' })]) {
      expect(codeOf(() => verifyPost(validateInput({ ...hs1bb(), villain_reads: { BTN: { reads: [s] } } }))), JSON.stringify(s)).toBe('invalid_reads');
    }
  });

  it('登録できない席（Preflop で Fold しただけの UTG）は invalid_reads', () => {
    expect(codeOf(() => verifyPost(validateInput({ ...hs1bb(), villain_reads: { UTG: { vpip: 20 } } })))).toBe('invalid_reads');
  });
});

describe('MT MTT の情報の検証', () => {
  it('MT-01 省略・null・空は null', () => {
    expect(validateMtt(undefined, 'mtt')).toBeNull();
    expect(validateMtt(null, 'cash')).toBeNull();
    expect(validateMtt({}, 'cash')).toBeNull();
  });

  it('MT-02 全項目', () => {
    const m = { speed: 3, rank: 12, left: 58, paid: 50, entries: 320, avg: 32.5, prize: 'standard' };
    expect(validateMtt(m, 'mtt')).toEqual(m);
  });

  it('MT-03 Cash に MTT の情報は invalid_mtt', () => {
    expect(codeOf(() => validateMtt({ speed: 0 }, 'cash'))).toBe('invalid_mtt');
  });

  it('MT-04 選択肢の外・知らない項目・型の違いは malformed', () => {
    expect(codeOf(() => validateMtt({ speed: 1.5 }, 'mtt'))).toBe('malformed');
    expect(codeOf(() => validateMtt({ speed: '2' }, 'mtt'))).toBe('malformed');
    expect(codeOf(() => validateMtt({ prize: 'x' }, 'mtt'))).toBe('malformed');
    expect(codeOf(() => validateMtt({ foo: 1 }, 'mtt'))).toBe('malformed');
    expect(codeOf(() => validateMtt({ rank: 1.5 }, 'mtt'))).toBe('malformed');
    expect(codeOf(() => validateMtt({ avg: '30' }, 'mtt'))).toBe('malformed');
    expect(codeOf(() => validateMtt('bubble', 'mtt'))).toBe('malformed');
  });

  it('MT-05 Tournament Type は 0〜100、人数は 1 以上、Avg Stack は 0 より大きく小数第 1 位まで', () => {
    expect(codeOf(() => validateMtt({ rank: 0 }, 'mtt'))).toBe('invalid_mtt');
    expect(codeOf(() => validateMtt({ speed: 101 }, 'mtt'))).toBe('invalid_mtt');
    expect(validateMtt({ speed: 100 }, 'mtt')).toEqual({ speed: 100 });
    expect(codeOf(() => validateMtt({ speed: -1 }, 'mtt'))).toBe('invalid_mtt');
    expect(validateMtt({ speed: 0 }, 'mtt')).toEqual({ speed: 0 });
    expect(codeOf(() => validateMtt({ entries: 1_000_001 }, 'mtt'))).toBe('invalid_mtt');
    expect(codeOf(() => validateMtt({ avg: 0 }, 'mtt'))).toBe('invalid_mtt');
    expect(codeOf(() => validateMtt({ avg: 12.34 }, 'mtt'))).toBe('invalid_mtt');
    expect(validateMtt({ avg: 12.3 }, 'mtt')).toEqual({ avg: 12.3 });
  });

  it('MT-06 Rank ≦ Players Left ≦ Entries、Paid Places ≦ Entries', () => {
    expect(codeOf(() => validateMtt({ rank: 59, left: 58 }, 'mtt'))).toBe('invalid_mtt');
    expect(codeOf(() => validateMtt({ left: 321, entries: 320 }, 'mtt'))).toBe('invalid_mtt');
    expect(codeOf(() => validateMtt({ rank: 321, entries: 320 }, 'mtt'))).toBe('invalid_mtt');
    expect(codeOf(() => validateMtt({ paid: 321, entries: 320 }, 'mtt'))).toBe('invalid_mtt');
    // 片方だけなら比べない。Paid Places は Players Left を超えてよい（入賞後）
    expect(validateMtt({ rank: 500, paid: 50 }, 'mtt')).toEqual({ rank: 500, paid: 50 });
    expect(validateMtt({ left: 40, paid: 50 }, 'mtt')).toEqual({ left: 40, paid: 50 });
  });
});

describe('RD-10 投稿の本文に入れる', () => {
  it('情報なしの投稿は reads {}・mtt null（前の版の本文も通る）', () => {
    const v = verifyPost(validateInput(hs1()));
    expect(v.reads).toEqual({});
    expect(v.mtt).toBeNull();
  });

  it('Reads を付けた投稿', () => {
    const raw: Raw = { ...hs1(), villain_reads: { BB: { vpip: 25, sample: 3 } } };
    expect(verifyPost(validateInput(raw)).reads).toEqual({ BB: { vpip: 25, sample: 3 } });
  });

  it('Hero（BTN）に Reads は malformed、Cash に MTT は invalid_mtt', () => {
    expect(codeOf(() => validateInput({ ...hs1(), villain_reads: { BTN: { vpip: 25 } } }))).toBe('malformed');
    expect(codeOf(() => validateInput({ ...hs1(), mtt: { speed: 3 } }))).toBe('invalid_mtt');
    expect(validateInput({ ...hs1(), fmt: 'mtt', rake: null, mtt: { speed: 3 } }).mtt).toEqual({ speed: 3 });
  });
});
