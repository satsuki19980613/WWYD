import { spotView } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { detailJson } from './detailFixtures.ts';
import { parsePostDetail } from './postDetail.ts';
import { actorAt, answerFrames, boardCountOf, lastActionText, seatOrder, seatViews } from './replayModel.ts';

const d = parsePostDetail(detailJson(undefined, { viewer: 'unanswered' }));
const { setup, actions, stopIndex } = d.hand;

describe('Replay（06 章 §4.3）', () => {
  const frames = answerFrames(setup, actions, stopIndex, d.post.street);

  it('0 手目〜停止位置。停止位置は Hero の手番', () => {
    expect(frames).toHaveLength(stopIndex + 1);
    const full = parsePostDetail(detailJson(undefined, { viewer: 'author' }));
    const v = spotView(setup, full.hand.actions, 'BTN', 10);
    expect(frames[stopIndex]).toEqual(v.state);
    expect(actorAt(actions, stopIndex, stopIndex, 'BTN')).toBe('BTN');
    expect(actorAt(actions, 0, stopIndex, 'BTN')).toBe('UTG');
  });

  it('Board は到達した Street の分', () => {
    expect(boardCountOf(frames[0]!)).toBe(0);
    expect(boardCountOf(frames[stopIndex]!)).toBe(4);
  });

  it('手前の席から時計回り', () => {
    expect(seatOrder('BB')).toEqual(['BB', 'UTG', 'HJ', 'CO', 'BTN', 'SB']);
    expect(seatOrder('UTG')).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
  });

  it('席の表示（停止位置: ターンで BB が Check、Hero = BTN の手番。回答者は Hero の席）', () => {
    const seats = seatViews(frames[stopIndex]!, { hero: 'BTN', actor: 'BTN', you: true });
    expect(seats[0]?.pos).toBe('BTN');
    const btn = seats.find((s) => s.pos === 'BTN')!;
    const bb = seats.find((s) => s.pos === 'BB')!;
    expect(btn).toMatchObject({ hero: true, you: true, acting: true, bet: 0, stack: 100000 - 2500 - 1800 });
    expect(bb).toMatchObject({ hero: false, you: false, acting: false, bet: 0, last: 'Check' });
    expect(seats.find((s) => s.pos === 'UTG')).toMatchObject({ folded: true, last: 'Fold' });
  });

  it('All-in', () => {
    const s = frames[4]!; // 4 手目（BTN のレイズ）の直後
    expect(lastActionText(s, 'BTN')).toBe('Raise 2.5');
    const allin = { ...s, stacks: { ...s.stacks, BTN: 0 } };
    expect(lastActionText(allin, 'BTN')).toBe('All-in');
  });
});
