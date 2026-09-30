/**
 * Villain・MTT の情報の検証（詳細仕様 18 章 §3。RD-01〜）。
 */
import { describe, expect, it } from 'vitest';
import { ValidationError, type ValidationCode } from '../errors.ts';
import { hs1, type Raw } from './postFixtures.ts';
import { MEMO_MAX, validateMtt, validateReads } from './reads.ts';
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

describe('RD Reads の検証', () => {
  it('RD-01 省略・null は情報なし', () => {
    expect(validateReads(undefined, SEATS, 'BTN')).toEqual({});
    expect(validateReads(null, SEATS, 'BTN')).toEqual({});
  });

  it('RD-02 全項目を入れた席はそのまま、中身の無い席は落とす', () => {
    const r = validateReads(
      { SB: { vpip: 30, pfr: 20, agg: 55, conf: 3, image: 1, memo: '  3bet 多め  ' }, BB: {}, CO: { memo: '  ' } },
      SEATS,
      'BTN',
    );
    expect(r).toEqual({ SB: { vpip: 30, pfr: 20, agg: 55, conf: 3, image: 1, memo: '3bet 多め' } });
  });

  it('RD-03 Hero の席・空席・席でないキーは malformed', () => {
    expect(codeOf(() => validateReads({ BTN: { vpip: 20 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ UTG: { vpip: 20 } }, ['BTN', 'SB', 'BB'], 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ XX: { vpip: 20 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads([], SEATS, 'BTN'))).toBe('malformed');
  });

  it('RD-04 知らない項目・整数でない値・文字列の数は malformed', () => {
    expect(codeOf(() => validateReads({ SB: { foo: 1 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { vpip: 20.5 } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { vpip: '20' } }, SEATS, 'BTN'))).toBe('malformed');
    expect(codeOf(() => validateReads({ SB: { memo: 1 } }, SEATS, 'BTN'))).toBe('malformed');
  });

  it('RD-05 範囲の外は invalid_reads（% は 0〜100、段階は 0〜4）', () => {
    expect(codeOf(() => validateReads({ SB: { vpip: 101 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { agg: -1 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { conf: 5 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { image: 5 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(validateReads({ SB: { vpip: 100, pfr: 0, agg: 0, conf: 0, image: 4 } }, SEATS, 'BTN').SB).toBeDefined();
  });

  it('RD-06 PFR は VPIP を超えない（両方あるときだけ）', () => {
    expect(codeOf(() => validateReads({ SB: { vpip: 20, pfr: 21 } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(validateReads({ SB: { vpip: 20, pfr: 20 } }, SEATS, 'BTN')).toEqual({ SB: { vpip: 20, pfr: 20 } });
    expect(validateReads({ SB: { pfr: 40 } }, SEATS, 'BTN')).toEqual({ SB: { pfr: 40 } });
  });

  it('RD-07 Memo は 30 文字まで（コードポイント数）。改行・NUL・対のないサロゲートは断る', () => {
    expect(validateReads({ SB: { memo: 'あ'.repeat(MEMO_MAX) } }, SEATS, 'BTN').SB?.memo).toHaveLength(MEMO_MAX);
    expect(validateReads({ SB: { memo: '🂡'.repeat(MEMO_MAX) } }, SEATS, 'BTN').SB?.memo).toBeDefined();
    expect(codeOf(() => validateReads({ SB: { memo: 'あ'.repeat(MEMO_MAX + 1) } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { memo: 'a\nb' } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { memo: 'a\u0000b' } }, SEATS, 'BTN'))).toBe('invalid_reads');
    expect(codeOf(() => validateReads({ SB: { memo: 'a\uD800b' } }, SEATS, 'BTN'))).toBe('invalid_reads');
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
    const raw: Raw = { ...hs1(), villain_reads: { BB: { vpip: 25, memo: 'sticky' } } };
    expect(verifyPost(validateInput(raw)).reads).toEqual({ BB: { vpip: 25, memo: 'sticky' } });
  });

  it('Hero（BTN）に Reads は malformed、Cash に MTT は invalid_mtt', () => {
    expect(codeOf(() => validateInput({ ...hs1(), villain_reads: { BTN: { vpip: 25 } } }))).toBe('malformed');
    expect(codeOf(() => validateInput({ ...hs1(), mtt: { speed: 3 } }))).toBe('invalid_mtt');
    expect(validateInput({ ...hs1(), fmt: 'mtt', rake: null, mtt: { speed: 3 } }).mtt).toEqual({ speed: 3 });
  });
});
