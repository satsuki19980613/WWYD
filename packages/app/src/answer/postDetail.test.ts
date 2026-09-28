import { emptyPaint, encodePaint, toHex } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { detailJson } from './detailFixtures.ts';
import { answerErrorMessage, errorCode, parsePostDetail } from './postDetail.ts';

describe('get_post_detail の読み取り', () => {
  it('未回答者（アクションとボードは停止位置まで。secrets・集計なし）', () => {
    const d = parsePostDetail(detailJson(undefined, { viewer: 'unanswered' }));
    expect(d.viewer).toBe('unanswered');
    expect(d.post).toMatchObject({
      hero: 'BTN',
      villain: 'BB',
      street: 'turn',
      keys: ['fold', 'call', 's1'],
      s1Label: 'raise',
      minTo: 13000,
      maxTo: 95700,
      potBase: 22100,
      effectiveStack: 100000,
    });
    expect(d.hand.setup).toMatchObject({ sb: 500, bb: 1000, ante: 0 });
    expect(d.hand.setup.stacks.BTN).toBe(100000);
    expect(d.hand.actions).toHaveLength(11);
    expect(d.hand.actions[3]).toEqual({ street: 'pf', pos: 'BTN', type: 'raise', to: 2500 });
    expect(d.hand.board).toEqual(['Kh', '8d', '3c', '2s']);
    expect(d.hand.truncated).toBe(true);
    expect(d.secrets).toBeNull();
    expect(d.aggregate).toBeNull();
    expect(d.myAnswer).toBeNull();
  });

  it('投稿者（Hero のハンド・想定レンジ・集計を含む）', () => {
    const p = emptyPaint();
    p[0] = { fold: 0, check: 0, call: 10, s1: 10 };
    const d = parsePostDetail(
      detailJson(undefined, { viewer: 'author', hostAnswer: { paint: toHex(encodePaint(p)), size: 30 } }),
    );
    expect(d.secrets).toEqual({ heroCards: ['Ad', 'Kd'], knownCards: { BB: ['Ks', 'Js'] } });
    expect(d.hostAnswer?.paint[0]).toEqual({ fold: 0, check: 0, call: 10, s1: 10 });
    expect(d.hostAnswer?.size).toBe(30000);
    expect(d.aggregate?.n).toBe(0);
    expect(d.aggregate?.cells).toHaveLength(169);
    expect(d.hand.actions).toHaveLength(15);
    expect(d.post.isMine).toBe(true);
  });

  it('マック', () => {
    const raw = detailJson(undefined, { viewer: 'answered' });
    (raw.secrets as Record<string, unknown>).known_cards = { BB: 'muck' };
    expect(parsePostDetail(raw).secrets?.knownCards).toEqual({ BB: 'muck' });
  });

  it('形が違えば例外', () => {
    const raw = detailJson(undefined, { viewer: 'unanswered' });
    expect(() => parsePostDetail({ ...raw, viewer: 'someone' })).toThrow();
    expect(() => parsePostDetail({ ...raw, post: null })).toThrow();
    const badPaint = detailJson(undefined, { viewer: 'author', hostAnswer: { paint: '\\x00', size: null } });
    expect(() => parsePostDetail(badPaint)).toThrow();
  });
});

describe('エラー（06 章 §7）', () => {
  it('コードの取り出し', () => {
    expect(errorCode({ code: 'P0001', message: 'post_not_found' })).toBe('post_not_found');
    expect(errorCode({ code: '23505', message: 'duplicate key' })).toBe('already_answered');
    expect(errorCode({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe('post_not_found');
    expect(errorCode({ code: '42501', message: 'new row violates row-level security policy' })).toBe('own_post');
    expect(errorCode({ code: 'XX000' })).toBe('internal');
    expect(errorCode({ code: '', message: 'TypeError: Failed to fetch' })).toBe('network');
    expect(errorCode(null)).toBe('internal');
  });

  it('文言', () => {
    expect(answerErrorMessage('own_post')).toBe('この操作はできません');
    expect(answerErrorMessage('not_author')).toBe('この操作はできません');
    expect(answerErrorMessage('paint_sum')).toBe('回答の内容が正しくありません');
    expect(answerErrorMessage('size_out_of_range')).toBe('回答の内容が正しくありません');
    expect(answerErrorMessage('network')).toBe('通信に失敗しました');
    expect(answerErrorMessage('aggregate_overflow')).toBe('エラーが発生しました');
  });
});
