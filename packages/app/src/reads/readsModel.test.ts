/**
 * Villain・MTT の情報の画面での扱い（詳細仕様 18 章）。
 */
import { validateInput, verifyPost, type Action } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { emptyDraft, submissionBody } from '../post/draft.ts';
import { sanitizeDraft, type KeyValue } from '../post/savedDrafts.ts';
import { deletePreset, MAX_PRESETS, readPresets, savePreset } from './readPresets.ts';
import {
  clearRead,
  emptyMtt,
  isEmptyRead,
  labelOf,
  levelOf,
  mttCountsLine,
  parseMtt,
  readsForSubmit,
  readSummary,
  sanitizeRead,
  setRead,
  villainOrder,
} from './readsModel.ts';

describe('段階のラベル（18 章 §2.1）', () => {
  it('VPIP の境目', () => {
    expect([0, 14, 15, 21, 22, 29, 30, 39, 40, 100].map((v) => labelOf('vpip', v))).toEqual([
      'Very Tight',
      'Very Tight',
      'Tight',
      'Tight',
      'Standard',
      'Standard',
      'Loose',
      'Loose',
      'Very Loose',
      'Very Loose',
    ]);
  });

  it('PFR・Postflop Aggression の境目', () => {
    expect([7, 8, 13, 14, 19, 20, 25, 26].map((v) => levelOf('pfr', v))).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect([24, 25, 39, 40, 54, 55, 69, 70].map((v) => levelOf('agg', v))).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });

  it('段階だけの項目は値がそのまま段階', () => {
    expect(labelOf('conf', 0)).toBe('First Impression');
    expect(labelOf('conf', 4)).toBe('HUD Stats');
    expect(labelOf('image', 2)).toBe('Standard');
  });
});

describe('PFR ≦ VPIP の追従（18 章 §2.2）', () => {
  it('PFR を VPIP より上げると VPIP も上がる', () => {
    expect(setRead({ vpip: 20, pfr: 10 }, 'pfr', 30)).toEqual({ vpip: 30, pfr: 30 });
  });
  it('VPIP を PFR より下げると PFR も下がる', () => {
    expect(setRead({ vpip: 30, pfr: 25 }, 'vpip', 18)).toEqual({ vpip: 18, pfr: 18 });
  });
  it('片方が未入力なら追従しない（未入力のまま）', () => {
    expect(setRead({}, 'pfr', 30)).toEqual({ pfr: 30 });
    expect(setRead({ pfr: 30 }, 'vpip', 10)).toEqual({ pfr: 10, vpip: 10 });
    expect(setRead({ vpip: 10 }, 'agg', 60)).toEqual({ vpip: 10, agg: 60 });
  });
  it('範囲に丸める', () => {
    expect(setRead({}, 'vpip', 120)).toEqual({ vpip: 100 });
    expect(setRead({}, 'conf', 7)).toEqual({ conf: 4 });
    expect(setRead({}, 'agg', -3)).toEqual({ agg: 0 });
  });
  it('リセットで未入力に戻る（中央値とは別）', () => {
    const r = setRead({}, 'agg', 50);
    expect(clearRead(r, 'agg')).toEqual({});
    expect(isEmptyRead(clearRead(r, 'agg'))).toBe(true);
    expect(isEmptyRead(r)).toBe(false);
  });
});

describe('送る形と 1 行の要約', () => {
  it('Hero・空席・空の席は送らない。Memo は前後の空白を除く', () => {
    const reads = { SB: { vpip: 30, memo: '  loose  ' }, BB: { memo: '   ' }, BTN: { vpip: 10 }, UTG: { agg: 40 } };
    expect(readsForSubmit(reads, ['SB', 'BB'])).toEqual({ SB: { vpip: 30, memo: 'loose' } });
  });
  it('折りたたんだ席の 1 行', () => {
    expect(readSummary({ vpip: 30, pfr: 22, agg: 60, memo: 'x' })).toBe('30/22 · Aggressive · “x”');
    expect(readSummary({ vpip: 45 })).toBe('Very Loose');
    expect(readSummary(undefined)).toBe('');
  });
});

describe('MTT の欄（18 章 §2.3・§2.4）', () => {
  it('空は null、数は整数、Avg Stack は小数第 1 位まで', () => {
    expect(parseMtt(emptyMtt())).toEqual({ info: null, invalid: [] });
    const m = { ...emptyMtt(), stage: 'bubble' as const, rank: '12', left: '58', paid: '50', entries: '320', avg: '32.5' };
    expect(parseMtt(m)).toEqual({ info: { stage: 'bubble', rank: 12, left: 58, paid: 50, entries: 320, avg: 32.5 }, invalid: [] });
    expect(parseMtt({ ...emptyMtt(), rank: '1.5', avg: '3.25', entries: '0' }).invalid).toEqual(['rank', 'entries', 'avg']);
  });
  it('Final Table では Avg Stack を送らない', () => {
    expect(parseMtt({ ...emptyMtt(), stage: 'ft', avg: 'x' })).toEqual({ info: { stage: 'ft' }, invalid: [] });
  });
  it('「12/58 ・ ITM 50 ・ 320 entries」', () => {
    expect(mttCountsLine({ rank: 12, left: 58, paid: 50, entries: 320 })).toBe('12/58 ・ ITM 50 ・ 320 entries');
    expect(mttCountsLine({ paid: 50 })).toBe('ITM 50');
    expect(mttCountsLine({ rank: 3 })).toBe('#3');
    expect(mttCountsLine({})).toBe('');
  });
});

describe('All Villains の並び', () => {
  it('Preflop で Fold した席を下に（Hero は除く）', () => {
    const actions: Action[] = [
      { street: 'pf', pos: 'UTG', type: 'fold' },
      { street: 'pf', pos: 'HJ', type: 'call' },
      { street: 'pf', pos: 'CO', type: 'fold' },
      { street: 'pf', pos: 'BTN', type: 'raise', to: 2500 },
      { street: 'flop', pos: 'HJ', type: 'fold' },
    ];
    expect(villainOrder(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], 'BTN', actions)).toEqual({
      active: ['HJ', 'SB', 'BB'],
      folded: ['UTG', 'CO'],
    });
  });
});

describe('投稿の本文（画面とサーバーの一致）', () => {
  it('情報なしならキーを送らない。情報ありはサーバーの検証を通る', () => {
    const d = emptyDraft();
    expect(submissionBody(d)).not.toHaveProperty('villain_reads');
    expect(submissionBody(d)).not.toHaveProperty('mtt');
    const body = submissionBody({ ...d, players: 6, reads: { BB: { vpip: 20 }, BTN: { vpip: 5 } } });
    expect(body.villain_reads).toEqual({ BB: { vpip: 20 } });
    expect(submissionBody({ ...d, mtt: { ...emptyMtt(), stage: 'itm' } })).not.toHaveProperty('mtt');
    expect(submissionBody({ ...d, fmt: 'mtt', mtt: { ...emptyMtt(), stage: 'itm' } }).mtt).toEqual({ stage: 'itm' });
  });

  it('送る本文は core の検証（サーバーと同じ）を通る', async () => {
    const { hs1 } = await import('../../../core/src/post/postFixtures.ts');
    const raw = { ...hs1(), villain_reads: { BB: { vpip: 20, pfr: 20, memo: 'x' } } };
    expect(verifyPost(validateInput(raw)).reads).toEqual({ BB: { vpip: 20, pfr: 20, memo: 'x' } });
  });
});

describe('下書きの読み直し（前の版の下書き・壊れた値）', () => {
  it('項目の無い下書きは情報なし', () => {
    const d = sanitizeDraft({ title: 'x' });
    expect(d.reads).toEqual({});
    expect(d.mtt).toEqual(emptyMtt());
  });
  it('範囲の外・型の違う値は捨て、PFR が VPIP を超えていれば PFR を捨てる', () => {
    const d = sanitizeDraft({
      reads: { SB: { vpip: 20, pfr: 30, agg: 101, conf: 2 }, XX: { vpip: 1 }, BB: 'x' },
      mtt: { stage: 'late', type: 'pko', rank: 3 },
    });
    expect(d.reads).toEqual({ SB: { vpip: 20, conf: 2 } });
    expect(d.mtt).toEqual({ ...emptyMtt(), type: 'pko' });
  });
  it('長すぎる Memo は切る', () => {
    expect(sanitizeRead({ memo: 'x'.repeat(40) }).memo).toHaveLength(30);
  });
});

function memoryStore(): KeyValue {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('Preset（18 章 §2.5。端末だけに保存）', () => {
  it('保存・呼び出し・同じ名前は上書き・削除', () => {
    const s = memoryStore();
    expect(savePreset('u1', ' Reg ', { vpip: 22, pfr: 18 }, s)).toEqual({ ok: true });
    expect(savePreset('u1', 'Fish', { vpip: 50 }, s)).toEqual({ ok: true });
    expect(savePreset('u1', 'Reg', { vpip: 25, pfr: 20 }, s)).toEqual({ ok: true });
    const list = readPresets('u1', s);
    expect(list.map((p) => [p.name, p.read])).toEqual([
      ['Reg', { vpip: 25, pfr: 20 }],
      ['Fish', { vpip: 50 }],
    ]);
    expect(readPresets('u2', s)).toEqual([]);
    deletePreset('u1', list[0]?.id ?? '', s);
    expect(readPresets('u1', s).map((p) => p.name)).toEqual(['Fish']);
  });

  it('名前が空・長すぎる、中身が空、上限、保存できない端末', () => {
    const s = memoryStore();
    expect(savePreset('u', '  ', { vpip: 1 }, s)).toEqual({ ok: false, reason: 'name' });
    expect(savePreset('u', 'x'.repeat(21), { vpip: 1 }, s)).toEqual({ ok: false, reason: 'name' });
    expect(savePreset('u', 'a', {}, s)).toEqual({ ok: false, reason: 'empty' });
    for (let i = 0; i < MAX_PRESETS; i++) savePreset('u', `p${i}`, { vpip: i }, s);
    expect(savePreset('u', 'over', { vpip: 1 }, s)).toEqual({ ok: false, reason: 'full' });
    expect(savePreset('u', 'p0', { vpip: 2 }, s)).toEqual({ ok: true });
    expect(savePreset('u', 'a', { vpip: 1 }, null)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('壊れた保存内容は読み飛ばす', () => {
    const s = memoryStore();
    s.setItem('wwyd.readPresets.v1.u', '{bad');
    expect(readPresets('u', s)).toEqual([]);
    s.setItem('wwyd.readPresets.v1.u', JSON.stringify([{ id: 'a', name: '', read: {} }, { id: 'b', name: 'ok', read: { vpip: 500 } }, 3]));
    expect(readPresets('u', s)).toEqual([{ id: 'b', name: 'ok', read: {} }]);
  });
});
