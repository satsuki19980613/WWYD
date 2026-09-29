import { idxOf, mbbToBb, type Action } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { hmw, hs1 } from '../../../core/src/post/postFixtures.ts';
import { acts } from '../../../core/src/poker/testHelpers.ts';
import { aggregateHex, detailJson, paintHexOf, paintOf, type DetailOpts } from './detailFixtures.ts';
import { parsePostDetail, type PostDetail } from './postDetail.ts';
import {
  actionText,
  actualAction,
  actualCell,
  breakdown,
  cellDiff,
  cellViews,
  emptyLabel,
  initialCell,
  resultFrames,
  resultTabs,
  villainHand,
} from './resultModel.ts';

/** 05 章 PAINT-12 の 2 件（A: AA call 20、B: AA call 10 / s1 10、KK fold 20） */
const PAINT_A = paintOf({ AA: { call: 20 } });
const PAINT_B = paintOf({ AA: { call: 10, s1: 10 }, KK: { fold: 20 } });

function detail(o: Partial<DetailOpts> = {}, raw = hs1()): PostDetail {
  return parsePostDetail(
    detailJson(raw, {
      viewer: 'answered',
      answerCount: 2,
      aggregate: aggregateHex([PAINT_A, PAINT_B]),
      myAnswer: { paint: paintHexOf({ AA: { call: 20 } }), size: null },
      ...o,
    }),
  );
}

describe('タブと初期表示（06 章 §5.2）', () => {
  it('他人の投稿も自分の投稿も 全体（N人）/ 自分（投稿者も回答者の 1 人）', () => {
    expect(resultTabs(detail()).map((t) => t.label)).toEqual(['全体（2人）', '自分', '自分との差']);
    expect(resultTabs(detail({ viewer: 'author' })).map((t) => t.label)).toEqual(['全体（2人）', '自分', '自分との差']);
  });

  it('回答 0 件では「自分との差」を出さない', () => {
    expect(resultTabs(detail({ answerCount: 0, aggregate: undefined })).map((t) => t.value)).toEqual(['all', 'mine']);
  });

  it('初期選択マスは Villain の実際の Hand（白枠）、無ければ AA', () => {
    const d = detail();
    expect(villainHand(d)).toEqual(['Ks', 'Js']);
    expect(actualCell(d)).toBe(idxOf('KJs'));
    expect(initialCell(d)).toBe(idxOf('KJs'));
    const unknown = detail({}, hmw());
    expect(villainHand(unknown)).toBeNull();
    expect(actualCell(unknown)).toBeNull();
    expect(initialCell(unknown)).toBe(idxOf('AA'));
  });

  it('Muck は白枠なし', () => {
    const d = detail({}, { ...hs1(), known_cards: { BB: 'muck' } });
    expect(villainHand(d)).toBe('muck');
    expect(actualCell(d)).toBeNull();
  });
});

describe('マスと内訳（05 章 §4）', () => {
  it('全体: AA は call 75% / s1 25%・濃さ 1、KK は濃さ 0.65、他は無色（PAINT-12）', () => {
    const v = cellViews(detail(), 'all');
    expect(v[idxOf('AA')]).toEqual({ ratio: { fold: 0, check: 0, call: 0.75, s1: 0.25 }, opacity: 1 });
    expect(v[idxOf('KK')]?.opacity).toBeCloseTo(0.65);
    expect(v[idxOf('QQ')]).toEqual({ ratio: null, opacity: 0 });
  });

  it('自分は Mix をそのまま（濃さ 1）', () => {
    const d = detail({ myAnswer: { paint: paintHexOf({ QQ: { fold: 5, call: 15 } }), size: null } });
    expect(cellViews(d, 'mine')[idxOf('QQ')]).toEqual({ ratio: { fold: 0.25, check: 0, call: 0.75, s1: 0 }, opacity: 1 });
    expect(cellViews(d, 'mine')[idxOf('AA')]).toEqual({ ratio: null, opacity: 0 });
  });

  it('全体の内訳: Range 内 n / N、キーごとの平均（小数第 1 位）と重み付けの人数、自分の Mix', () => {
    expect(breakdown(detail(), 'all', idxOf('AA'))).toEqual({
      kind: 'all',
      label: 'AA',
      n: 2,
      total: 2,
      rows: [
        { key: 'fold', name: 'Fold', pct: '0.0', count: 0 },
        { key: 'call', name: 'Call', pct: '75.0', count: 2 },
        { key: 's1', name: 'Raise', pct: '25.0', count: 1 },
      ],
      mine: 'Call 100%',
    });
  });

  it('Range 内 0 人のマスは行なし・自分は Range 外。自分の投稿でも自分の行を出す', () => {
    const b = breakdown(detail(), 'all', idxOf('72o'));
    expect(b).toMatchObject({ n: 0, total: 2, rows: [], mine: 'Range 外' });
    expect(breakdown(detail({ viewer: 'author' }), 'all', idxOf('AA'))).toMatchObject({ mine: 'Call 100%' });
  });

  it('自分の内訳は「{名前} {%} / …」か「Range 外」', () => {
    const d = detail({ myAnswer: { paint: paintHexOf({ QQ: { fold: 5, s1: 15 } }), size: 20 } });
    expect(breakdown(d, 'mine', idxOf('QQ'))).toEqual({ kind: 'single', label: 'QQ', text: 'Fold 25% / Raise 75%' });
    expect(breakdown(d, 'mine', idxOf('AA'))).toEqual({ kind: 'single', label: 'AA', text: 'Range 外' });
  });

  it('自分との差: キーと Range 外の割合の差の絶対値の和の半分（14 章）', () => {
    const d = detail();
    // AA: 全体 call 75% / s1 25%、自分 call 100% → 25%
    expect(cellDiff(d, idxOf('AA'))).toBeCloseTo(0.25);
    // KK: 全体 fold 50% / レンジ外 50%、自分 レンジ外 → 50%
    expect(cellDiff(d, idxOf('KK'))).toBeCloseTo(0.5);
    // 72o: どちらもレンジ外 → 0
    expect(cellDiff(d, idxOf('72o'))).toBe(0);
    expect(breakdown(d, 'diff', idxOf('KK'))).toMatchObject({ kind: 'all', diff: '50', mine: 'Range 外' });
  });

  it('空状態: 回答 0 件は「回答なし」', () => {
    const none = detail({ answerCount: 0, aggregate: undefined });
    expect(emptyLabel(none, 'all')).toBe('回答なし');
    expect(emptyLabel(detail(), 'all')).toBeNull();
    expect(emptyLabel(detail(), 'mine')).toBeNull();
  });
});

describe('実際の Action（06 章 §5.3）', () => {
  it('H-S1 の BB は Call', () => {
    const a = actualAction(detail());
    expect(a).toEqual({ street: 'turn', pos: 'BB', type: 'call' });
    expect(actionText(a as Action)).toBe('Call');
  });

  it('額のある Action は「Raise 12bb」', () => {
    expect(actionText({ street: 'flop', pos: 'BB', type: 'raise', to: 12000 })).toBe('Raise 12bb');
    expect(actionText({ street: 'flop', pos: 'BB', type: 'bet', to: 2750 })).toBe('Bet 2.75bb');
  });
});

describe('Hand History の再生（06 章 §5.4）', () => {
  it('最初は Hero の Hand だけ表向き、終了時は Showdown で判明している Hand を公開・Bet を回収', () => {
    const d = detail();
    const frames = resultFrames(d);
    expect(frames).toHaveLength(d.hand.actions.length + 1);
    expect(frames[0]).toMatchObject({ holes: { BTN: ['Ad', 'Kd'] }, board: [], actor: 'UTG', note: null });
    const end = frames[frames.length - 1];
    expect(end?.note).toBe('Showdown');
    expect(end?.holes).toEqual({ BTN: ['Ad', 'Kd'], BB: ['Ks', 'Js'] });
    expect(end?.board).toEqual(['Kh', '8d', '3c', '2s', '7h']);
    expect(end?.actor).toBeNull();
    expect(Object.values(end?.state.bets ?? {})).toEqual([0, 0, 0, 0, 0, 0]);
    // 2.5 + 0.5（SB）+ 2.5 + 1.8×2 + 6.5×2 + 15×2 = 52.1bb
    expect(end?.state.pot).toBe(52100);
  });

  it('途中の Board は到達した Street の分だけ', () => {
    const frames = resultFrames(detail());
    // 6 手目（プリフロップの最後のコールの後）はまだフロップを出さない、7 手目（フロップの BB チェック後）は 3 枚
    expect(frames[6]?.board).toEqual([]);
    expect(frames[7]?.board).toEqual(['Kh', '8d', '3c']);
  });

  it('Fold で終わった Hand は「{席} Pot 獲得」', () => {
    const actions = acts({
      pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
      flop: 'BB x, BTN b1.8, BB c',
      turn: 'BB x, BTN b6.5, BB r20, BTN f',
    }).map((a) => (a.to === undefined ? { ...a } : { ...a, to: mbbToBb(a.to) }));
    const raw = { ...hs1(), actions, board: ['Kh', '8d', '3c', '2s'], known_cards: {} };
    const frames = resultFrames(detail({}, raw));
    const end = frames[frames.length - 1];
    expect(end?.note).toBe('BB Pot 獲得');
    // Hero はフォールドしていても終了時は公開する。ボードは到達したターンまで
    expect(end?.holes).toEqual({ BTN: ['Ad', 'Kd'] });
    expect(end?.board).toHaveLength(4);
    expect(actionText(actualAction(detail({}, raw)) as Action)).toBe('Raise 20bb');
  });
});
