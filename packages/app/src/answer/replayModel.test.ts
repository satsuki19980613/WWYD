import { spotView } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { detailJson } from './detailFixtures.ts';
import { parsePostDetail } from './postDetail.ts';
import { actorAt, answerFrames, boardCountOf, lastActionText, seatOrder, seatViews } from './replayModel.ts';

const d = parsePostDetail(detailJson(undefined, { viewer: 'unanswered' }));
const { setup, actions, stopIndex } = d.hand;

describe('リプレイ（06 章 §4.3）', () => {
  const frames = answerFrames(setup, actions, stopIndex, d.post.street);

  it('0 手目〜停止位置。停止位置は Villain の手番', () => {
    expect(frames).toHaveLength(stopIndex + 1);
    const full = parsePostDetail(detailJson(undefined, { viewer: 'author' }));
    const v = spotView(setup, full.hand.actions, 'BTN', 10, 'BB');
    expect(frames[stopIndex]).toEqual(v.state);
    expect(actorAt(actions, stopIndex, stopIndex, 'BB')).toBe('BB');
    expect(actorAt(actions, 0, stopIndex, 'BB')).toBe('UTG');
  });

  it('ボードは到達したストリートの分', () => {
    expect(boardCountOf(frames[0]!)).toBe(0);
    expect(boardCountOf(frames[stopIndex]!)).toBe(4);
  });

  it('Villain を手前に時計回り', () => {
    expect(seatOrder('BB')).toEqual(['BB', 'UTG', 'HJ', 'CO', 'BTN', 'SB']);
    expect(seatOrder('UTG')).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
  });

  it('席の表示（停止位置: BTN が 6.5 ベット、BB の手番）', () => {
    const seats = seatViews(frames[stopIndex]!, { hero: 'BTN', villain: 'BB', actor: 'BB' });
    const btn = seats.find((s) => s.pos === 'BTN')!;
    const bb = seats.find((s) => s.pos === 'BB')!;
    expect(btn).toMatchObject({ hero: true, bet: 6500, last: 'ベット 6.5', stack: 100000 - 2500 - 1800 - 6500 });
    expect(bb).toMatchObject({ villain: true, acting: true, bet: 0, last: 'チェック' });
    expect(seats.find((s) => s.pos === 'UTG')).toMatchObject({ folded: true, last: 'フォールド' });
  });

  it('オールイン', () => {
    const s = frames[4]!; // 4 手目（BTN のレイズ）の直後
    expect(lastActionText(s, 'BTN')).toBe('レイズ 2.5');
    const allin = { ...s, stacks: { ...s.stacks, BTN: 0 } };
    expect(lastActionText(allin, 'BTN')).toBe('オールイン');
  });
});
