import type { Pos } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { fuzzyPosition, leadingPosition, parseBody, similarity, splitHeading } from './bodyText.ts';

// 本文の例は、実画像を tesseract.js で読んだときの出方（バッジの括弧・誤読・名前と動詞のくっつき）に合わせた架空のもの
describe('fuzzyPosition / leadingPosition', () => {
  it('正しいバッジと定番の誤読を席にする', () => {
    expect(fuzzyPosition('UTG')).toBe('UTG');
    expect(fuzzyPosition('bin')).toBe('BTN');
    expect(fuzzyPosition('EIN')).toBe('BTN');
    expect(fuzzyPosition('88')).toBe('BB');
    expect(fuzzyPosition('co')).toBe('CO');
    expect(fuzzyPosition('XYZW')).toBeNull();
  });
  it('行頭の語の括弧を外して読む。長い語はバッジとみなさない', () => {
    expect(leadingPosition('(UTG Alice Fold')).toBe('UTG');
    expect(leadingPosition('HJ) Bob Raise 2bb')).toBe('HJ');
    expect(leadingPosition('{BB Carol won 4.5bb')).toBe('BB');
    expect(leadingPosition('Somebody Fold')).toBeNull();
  });
  it('類似度は difflib と同じ考え方', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abcd', 'abxd')).toBeCloseTo(0.75);
    expect(similarity('', '')).toBe(1);
  });
});

describe('splitHeading', () => {
  it('見出しとポットの額を外す', () => {
    expect(splitHeading('Flop 6bb SB) Alice Check')).toEqual({ heading: 'flop', rest: 'SB) Alice Check' });
    expect(splitHeading('Preflop (UTG Alice Fold')).toEqual({ heading: 'pf', rest: '(UTG Alice Fold' });
    expect(splitHeading('SD 203bb')).toEqual({ heading: 'showdown', rest: '' });
  });
  it('英字が続く語は見出しではない（flopsy という名前の行）', () => {
    expect(splitHeading('flopsy Fold').heading).toBeNull();
    expect(splitHeading('Rivera Call 2bb').heading).toBeNull();
  });
});

describe('parseBody', () => {
  const names = new Map<Pos, string>([
    ['UTG', 'Alice'],
    ['HJ', 'Bob2bb'],
    ['CO', 'Callista'],
    ['BTN', 'Dan'],
    ['SB', 'Eve'],
    ['BB', 'Frank'],
  ]);

  it('ストリート・席・動詞・額を読む。SD 以降は読まない', () => {
    const text = [
      'Preflop (UTG Alice Raise 2.5bb',
      'HJ) Bob2bb Fold',
      'co} Callista Call 2.5bb',
      'BIN) DanFold',
      'SB Eve Fold',
      '88) Frank Call 2.5bb',
      'Flop 8.5bb BB) Frank Check',
      'UTG) Alice Bet 4.25bb',
      'CO) Callista All-in 97.5bb',
      'BB) FrankFold',
      'UTG) Alice Call 97.5bb',
      'SD 203bb UTG) Alice: Two Pair',
      'Result {CO Callista won 199bb',
      'Rake: 4bb',
    ].join('\n');
    const r = parseBody(text, names);
    expect(r.boardStreets).toEqual(['flop']);
    expect(r.actions).toEqual([
      { street: 'pf', pos: 'UTG', verb: 'raise', amount: 2.5 },
      { street: 'pf', pos: 'HJ', verb: 'fold', amount: null },
      { street: 'pf', pos: 'CO', verb: 'call', amount: 2.5 },
      { street: 'pf', pos: 'BTN', verb: 'fold', amount: null },
      { street: 'pf', pos: 'SB', verb: 'fold', amount: null },
      { street: 'pf', pos: 'BB', verb: 'call', amount: 2.5 },
      { street: 'flop', pos: 'BB', verb: 'check', amount: null },
      { street: 'flop', pos: 'UTG', verb: 'bet', amount: 4.25 },
      { street: 'flop', pos: 'CO', verb: 'allin', amount: 97.5 },
      { street: 'flop', pos: 'BB', verb: 'fold', amount: null },
      { street: 'flop', pos: 'UTG', verb: 'call', amount: 97.5 },
    ]);
  });

  it('名前に含まれる動詞や数字を拾わない（動詞は行でいちばん右、額は動詞の後ろ）', () => {
    const r = parseBody('HJ) Bob2bb Raise 7bb\nCO) Callista Fold', names);
    expect(r.actions).toEqual([
      { street: 'pf', pos: 'HJ', verb: 'raise', amount: 7 },
      { street: 'pf', pos: 'CO', verb: 'fold', amount: null },
    ]);
  });

  it('バッジが読めない行は名前で席を探す。先頭が名前そのものならバッジとして読まない', () => {
    const r = parseBody('~~ Alicc Fold\nDan Call 1bb\nBob Raise 3bb', new Map<Pos, string>([...names, ['BB', 'Bob']]));
    expect(r.actions.map((a) => a.pos)).toEqual(['UTG', 'BTN', 'BB']);
  });

  it('席が分からない行は pos を null にして残す（再生の手番で補う）', () => {
    expect(parseBody('?? zzz Check').actions).toEqual([{ street: 'pf', pos: null, verb: 'check', amount: null }]);
  });
});
