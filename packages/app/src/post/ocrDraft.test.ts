import type { OcrAction, OcrResult } from '@wwyd/ocr';
import { describe, expect, it } from 'vitest';
import { emptyDraft, phaseOf, parseSettings, type Draft } from './draft.ts';
import { applyOcr } from './ocrDraft.ts';

const act = (street: OcrAction['street'], pos: OcrAction['pos'], verb: OcrAction['verb'], amount: number | null = null): OcrAction => ({
  street,
  pos,
  verb,
  amount,
});

/** 実画像（6max_allin）と同じ流れ: UTG オープン → SB 3bet → UTG 4bet → SB オールイン（Raise 100bb と書かれる）→ UTG コール */
const allin: OcrResult = {
  hero: 'SB',
  hands: { UTG: ['Ah', 'Ad'], HJ: ['Js', 'Td'], CO: ['9d', '4h'], BTN: ['Jc', '3s'], SB: ['As', 'Ks'], BB: ['7d', '2c'] },
  board: ['6d', '5d', '4s', '4c', '5s'],
  actions: [
    act('pf', 'UTG', 'raise', 2),
    act('pf', 'HJ', 'call', 2),
    act('pf', 'CO', 'fold'),
    act('pf', 'BTN', 'fold'),
    act('pf', 'SB', 'raise', 10),
    act('pf', 'BB', 'fold'),
    act('pf', 'UTG', 'raise', 19),
    act('pf', 'HJ', 'fold'),
    act('pf', 'SB', 'raise', 100),
    act('pf', 'UTG', 'call', 100),
  ],
  problems: [],
};

const done = (d: Draft): boolean => phaseOf(parseSettings(d).setup, d.actions, d.board).kind === 'done';

describe('applyOcr', () => {
  it('Hero・全席のハンド・ボード・アクションを反映し、最後まで再生できる', () => {
    const r = applyOcr(emptyDraft(), allin);
    if (!r.ok) throw new Error('反映できない');
    expect(r.issues).toEqual([]);
    expect(r.draft.hero).toBe('SB');
    expect(r.draft.hands).toEqual({ UTG: 'AhAd', HJ: 'JsTd', CO: '9d4h', BTN: 'Jc3s', SB: 'AsKs', BB: '7d2c' });
    expect(r.draft.board).toEqual(allin.board);
    expect(r.draft.actions.map((a) => `${a.pos} ${a.type} ${a.to ?? ''}`.trim())).toEqual([
      'UTG raise 2000',
      'HJ call',
      'CO fold',
      'BTN fold',
      'SB raise 10000',
      'BB fold',
      'UTG raise 19000',
      'HJ fold',
      'SB raise 100000',
      'UTG call',
    ]);
    expect(done(r.draft)).toBe(true);
  });

  it('画像に無い基本設定・スタック・タイトルは利用者の入力のまま。スポットの選択は解除する', () => {
    const base: Draft = { ...emptyDraft(), fmt: 'mtt', sb: '0.4', ante: '0.1', title: 'そのまま', spotIndex: 3, villain: 'BB' };
    const r = applyOcr(base, { ...allin, actions: [act('pf', 'UTG', 'fold')] });
    if (!r.ok) throw new Error('反映できない');
    expect([r.draft.fmt, r.draft.sb, r.draft.ante, r.draft.title, r.draft.spotIndex, r.draft.villain]).toEqual([
      'mtt',
      '0.4',
      '0.1',
      'そのまま',
      null,
      null,
    ]);
  });

  it('ポストフロップの Bet・All-in・席の読めない行を、その時点の状態で直す', () => {
    const r = applyOcr(emptyDraft(), {
      ...allin,
      hero: 'BB',
      actions: [
        act('pf', 'UTG', 'raise', 2.5),
        act('pf', 'HJ', 'fold'),
        act('pf', 'CO', 'fold'),
        act('pf', null, 'fold'), // BTN のバッジが読めなかった
        act('pf', 'SB', 'fold'),
        act('pf', 'BB', 'call', 2.5),
        act('flop', 'BB', 'check'),
        act('flop', 'UTG', 'bet', 3),
        act('flop', 'BB', 'allin', 97.5),
        act('flop', 'UTG', 'allin'),
      ],
    });
    if (!r.ok) throw new Error('反映できない');
    expect(r.issues).toEqual([]);
    expect(r.draft.actions.slice(3).map((a) => `${a.street} ${a.pos} ${a.type} ${a.to ?? ''}`.trim())).toEqual([
      'pf BTN fold',
      'pf SB fold',
      'pf BB call',
      'flop BB check',
      'flop UTG bet 3000',
      'flop BB raise 97500',
      'flop UTG call',
    ]);
    expect(done(r.draft)).toBe(true);
  });

  it('手番と違う席・合わない額・スタックを超えるオールインで止め、読めたところまで反映する', () => {
    const wrongSeat = applyOcr(emptyDraft(), { ...allin, actions: [act('pf', 'UTG', 'fold'), act('pf', 'CO', 'fold')] });
    expect(wrongSeat.ok && wrongSeat.draft.actions).toHaveLength(1);
    expect(wrongSeat.ok && wrongSeat.issues).toEqual(['2手目のアクションを読み取れませんでした']);

    const badAmount = applyOcr(emptyDraft(), { ...allin, actions: [act('pf', 'UTG', 'raise', 1.5)] });
    expect(badAmount.ok && badAmount.issues).toEqual(['1手目のアクションを読み取れませんでした']);

    const tooDeep = applyOcr(emptyDraft(), { ...allin, actions: [act('pf', 'UTG', 'allin', 150)] });
    expect(tooDeep.ok && tooDeep.issues).toEqual(['1手目のアクションを読み取れませんでした']);
  });

  it('最後まで読めなかったハンドは、続きの手目を知らせる', () => {
    const r = applyOcr(emptyDraft(), { ...allin, actions: allin.actions.slice(0, 4) });
    expect(r.ok && r.issues).toEqual(['5手目以降のアクションを読み取れませんでした']);
  });

  it('読めなかったハンド・重複したカード・欠けたフロップ・Hero の席', () => {
    const r = applyOcr(emptyDraft(), {
      hero: null,
      hands: { UTG: ['Ah', 'Ad'], HJ: ['Ah', 'Kd'], SB: ['As', 'Ks'] },
      board: ['Qc', 'Jc'],
      actions: [],
      problems: [{ code: 'hero_unknown' }, { code: 'board_unread', street: 'flop' }],
    });
    if (!r.ok) throw new Error('反映できない');
    expect(r.draft.hero).toBe('BTN'); // 読めなければ利用者の選択のまま
    expect(r.draft.hands).toEqual({ UTG: 'AhAd', HJ: '', CO: '', BTN: '', SB: 'AsKs', BB: '' });
    expect(r.draft.board).toEqual([]);
    expect(r.issues).toEqual([
      'Hero の席を読み取れませんでした',
      'HJ のハンドを読み取れませんでした',
      'CO のハンドを読み取れませんでした',
      'BTN のハンドを読み取れませんでした',
      'BB のハンドを読み取れませんでした',
      'ボードを読み取れませんでした',
      '1手目以降のアクションを読み取れませんでした',
    ]);
  });

  it('6 人の卓として読めなければ何も反映しない', () => {
    expect(applyOcr(emptyDraft(), { hero: null, hands: {}, board: [], actions: [], problems: [{ code: 'not_six_players', rows: 3 }] })).toEqual({
      ok: false,
    });
  });
});
