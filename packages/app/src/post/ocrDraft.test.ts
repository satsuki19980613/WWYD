import type { OcrAction, OcrResult } from '@wwyd/ocr';
import { describe, expect, it } from 'vitest';
import { emptyDraft, parseSettings, phaseOf, PREFLOP_ALLIN, type Draft } from './draft.ts';
import { evaluateReview, ocrPostability, reviewFromOcr, type Review, type ReviewRow } from './ocrDraft.ts';

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

/** Hero = BTN がフロップでベットし、BB がフォールドして終わる */
const hs1: OcrResult = {
  hero: 'BTN',
  hands: {},
  board: ['Qh', '8c', '2h'],
  actions: [
    act('pf', 'UTG', 'fold'),
    act('pf', 'HJ', 'fold'),
    act('pf', 'CO', 'fold'),
    act('pf', 'BTN', 'raise', 2.5),
    act('pf', 'SB', 'fold'),
    act('pf', 'BB', 'call'),
    act('flop', 'BB', 'check'),
    act('flop', 'BTN', 'bet', 1.8),
    act('flop', 'BB', 'fold'),
  ],
  problems: [],
};

const done = (d: Draft): boolean => phaseOf(parseSettings(d).setup, d.actions, d.board).kind === 'done';
const row = (verb: ReviewRow['verb'], amount: number | null = null): ReviewRow => ({ verb, amount, readPos: null, readStreet: null });
const summary = (d: Draft): string[] => d.actions.map((a) => `${a.street} ${a.pos} ${a.type} ${a.to ?? ''}`.trim());

describe('ocrPostability（読み込みの時点ではじく）', () => {
  const postable = (r: OcrResult, base: Draft = emptyDraft()): ReturnType<typeof ocrPostability> => ocrPostability(r, base, 'normal');

  it('Hero の Flop 以降の Action に出題できるものがあれば読み込む', () => {
    expect(postable(hs1)).toBe('ok');
    // フロップの Hero のベットが最後のアクションでも出題できる（2026-09-29。Hero の手番そのものを出題する）
    expect(postable({ ...hs1, actions: hs1.actions.slice(0, 8) })).toBe('ok');
  });

  it('Preflop で終わった Hand・Hero が Flop 以降に Action していない Hand ははじく', () => {
    const pfOnly: OcrResult = { ...hs1, board: [], actions: hs1.actions.slice(0, 5).concat(act('pf', 'BB', 'fold')) };
    expect(postable(pfOnly)).toBe('no_spot');
    // Hero が先にフォールドし、他の席でフロップ以降が続いた
    expect(postable({ ...hs1, hero: 'UTG' })).toBe('no_spot');

  });

  it('Flop 以降の Action があるのに Flop が読めなければ、読み取れない', () => {
    expect(postable({ ...hs1, board: [] })).toBe('unreadable');
    expect(postable({ ...hs1, board: ['Qh', '8c'] })).toBe('unreadable');
  });

  it('Hero やどこかの席が読めなければ、はじかずに確認画面で直してもらう', () => {
    expect(postable({ ...hs1, hero: null })).toBe('ok');
    expect(postable({ ...hs1, hero: 'UTG', actions: [act('pf', null, 'fold'), ...hs1.actions.slice(1)] })).toBe('ok');
  });
});

describe('ocrPostability: Preflop の All-in ははじく（Hero でもほかの席でも。2026-09-29 さつき）', () => {
  const postable = (r: OcrResult, base: Draft = emptyDraft()): ReturnType<typeof ocrPostability> => ocrPostability(r, base, 'normal');
  const pf = (hero: OcrResult['hero'], lines: [OcrAction['pos'], OcrAction['verb'], number?][], rest: OcrAction[] = []): OcrResult => ({
    hero,
    hands: {},
    board: ['Qh', '8c', '2h', '7s', '3d'],
    actions: [...lines.map(([pos, verb, amount]) => act('pf', pos, verb, amount ?? null)), ...rest],
    problems: [],
  });

  it('Hero の All-in（T4 は 100bb の All-in を「Raise 100bb」と書く）', () => {
    expect(postable(allin)).toBe('preflop_allin');
  });
  it('Hero が Fold したあと、ほかの席が All-in と Call', () => {
    const r = pf('BB', [['UTG', 'raise', 2], ['HJ', 'raise', 6.5], ['CO', 'raise', 16.25], ['BTN', 'raise', 100], ['SB', 'fold'], ['BB', 'fold'], ['UTG', 'fold'], ['HJ', 'fold'], ['CO', 'call', 100]]);
    expect(postable(r)).toBe('preflop_allin');
  });
  it('All-in と書かれた行', () => {
    expect(postable(pf('BTN', [['UTG', 'allin', 100], ['HJ', 'fold'], ['CO', 'fold'], ['BTN', 'fold'], ['SB', 'fold'], ['BB', 'fold']]))).toBe('preflop_allin');
  });
  it('短いスタックの All-in に Hero が Call し、Flop 以降を別の席と続けた（サイドポット）', () => {
    const base: Draft = { ...emptyDraft(), stacks: { ...emptyDraft().stacks, UTG: '10' } };
    const r = pf('BTN', [['UTG', 'raise', 10], ['HJ', 'fold'], ['CO', 'fold'], ['BTN', 'call', 10], ['SB', 'fold'], ['BB', 'call', 10]], [
      act('flop', 'BB', 'check'),
      act('flop', 'BTN', 'bet', 5),
      act('flop', 'BB', 'fold'),
    ]);
    expect(postable(r, base)).toBe('preflop_allin');
    // スタックが画像と合わなければ（全員 100bb）All-in ではない
    expect(postable(r)).toBe('ok');
  });
  it('Flop 以降の All-in ははじかない', () => {
    const r = pf('BTN', [['UTG', 'fold'], ['HJ', 'fold'], ['CO', 'fold'], ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'call']], [
      act('flop', 'BB', 'check'),
      act('flop', 'BTN', 'raise', 97.5),
      act('flop', 'BB', 'call'),
    ]);
    expect(postable(r)).toBe('ok');
  });
});

describe('reviewFromOcr', () => {
  it('読み取り結果を確認画面の状態にする（Hero が読めなければ下書きの Hero）', () => {
    const rv = reviewFromOcr(allin, 'expert', 'BTN');
    expect(rv.game).toBe('expert');
    expect(rv.hero).toBe('SB');
    expect(rv.hands).toEqual({ UTG: 'AhAd', HJ: 'JsTd', CO: '9d4h', BTN: 'Jc3s', SB: 'AsKs', BB: '7d2c' });
    expect(rv.rows[0]).toEqual({ verb: 'raise', amount: 2, readPos: 'UTG', readStreet: 'pf' });
    expect(reviewFromOcr({ ...allin, hero: null, hands: {} }, 'normal', 'BTN')).toMatchObject({ hero: 'BTN', hands: { UTG: '', BB: '' } });
  });
});

describe('evaluateReview', () => {
  it('そのまま反映すると、Hero・全席の Hand・Board・Action と T4 の Game の設定が入り、最後まで再生できる', () => {
    const base: Draft = { ...emptyDraft(), fmt: 'mtt', sb: '0.4', ante: '0.2', title: '残る', spotIndex: 3 };
    const ev = evaluateReview(base, reviewFromOcr(allin, 'normal', 'BTN'));
    // プリフロップのオールインで終わった（読み込みの時点ではじく種類）
    expect(ev.issues).toEqual([PREFLOP_ALLIN]);
    expect(ev.rows.every((r) => r.ok && !r.mismatch)).toBe(true);
    const d = ev.draft;
    expect([d.fmt, d.sb, d.ante, d.rake, d.title, d.spotIndex, d.hero]).toEqual(['cash', '0.5', '0', '5', '残る', null, 'SB']);
    expect(d.hands).toEqual({ UTG: 'AhAd', HJ: 'JsTd', CO: '9d4h', BTN: 'Jc3s', SB: 'AsKs', BB: '7d2c' });
    expect(d.board).toEqual(allin.board);
    expect(summary(d)).toEqual([
      'pf UTG raise 2000',
      'pf HJ call',
      'pf CO fold',
      'pf BTN fold',
      'pf SB raise 10000',
      'pf BB fold',
      'pf UTG raise 19000',
      'pf HJ fold',
      'pf SB raise 100000',
      'pf UTG call',
    ]);
    expect(done(d)).toBe(true);
  });

  it('席と Street は再生で決まる。ポストフロップの Bet・All-in も直す', () => {
    const rv: Review = {
      ...reviewFromOcr(allin, 'normal', 'BTN'),
      hero: 'BB',
      rows: [row('raise', 2.5), row('fold'), row('fold'), row('fold'), row('fold'), row('call'), row('check'), row('bet', 3), row('allin', 97.5), row('allin')],
    };
    const ev = evaluateReview(emptyDraft(), rv);
    expect(ev.issues).toEqual([]);
    expect(ev.rows.map((r) => `${r.street} ${r.pos}`)).toEqual([
      'pf UTG',
      'pf HJ',
      'pf CO',
      'pf BTN',
      'pf SB',
      'pf BB',
      'flop BB',
      'flop UTG',
      'flop BB',
      'flop UTG',
    ]);
    expect(summary(ev.draft).slice(6)).toEqual(['flop BB check', 'flop UTG bet 3000', 'flop BB raise 97500', 'flop UTG call']);
    expect(done(ev.draft)).toBe(true);
  });

  it('画像で読んだ席と再生の席が違う行は「合わない」として示す（行の読み落としの目印）', () => {
    // HJ の Call の行が読み落とされた
    const rv = reviewFromOcr({ ...allin, actions: allin.actions.filter((_, i) => i !== 1) }, 'normal', 'BTN');
    const ev = evaluateReview(emptyDraft(), rv);
    expect(ev.rows[1]).toMatchObject({ pos: 'HJ', ok: true, mismatch: true });
    expect(ev.issues[0]).toBe('2手目から席が画像の読み取りと合いません');
    expect(ev.issues.filter((m) => m.includes('合いません'))).toHaveLength(1);
  });

  it('合法でない行で止め、そこまでを反映する。最後まで無ければ続きを知らせる', () => {
    const bad = evaluateReview(emptyDraft(), { ...reviewFromOcr(allin, 'normal', 'BTN'), rows: [row('fold'), row('raise', 1.5), row('fold')] });
    expect(bad.draft.actions).toHaveLength(1);
    expect(bad.rows.map((r) => r.ok)).toEqual([true, false, false]);
    expect(bad.issues).toEqual(['2手目の Action が正しくありません']);

    const tooDeep = evaluateReview(emptyDraft(), { ...reviewFromOcr(allin, 'normal', 'BTN'), rows: [row('allin', 150)] });
    expect(tooDeep.issues).toEqual(['1手目の Action が正しくありません']);

    const short = evaluateReview(emptyDraft(), { ...reviewFromOcr(allin, 'normal', 'BTN'), rows: [row('fold'), row('fold')] });
    expect(short.issues).toEqual(['3手目以降の Action が足りません']);
  });

  it('最後まで再生できて、Hero の Flop 以降の Action に出題できるものがあれば問題なし', () => {
    const ev = evaluateReview(emptyDraft(), reviewFromOcr({ ...hs1, hands: allin.hands }, 'normal', 'BTN'));
    expect(ev.issues).toEqual([]);
    expect(done(ev.draft)).toBe(true);
  });

  it('無い Hand・途中の Hand・重複した Card・欠けた Flop を知らせ、使わない', () => {
    const rv: Review = {
      ...reviewFromOcr(allin, 'normal', 'BTN'),
      hands: { UTG: 'AhAd', HJ: 'AhKd', CO: 'Kc', BTN: '', SB: 'AsKs', BB: '7d2c' },
      board: ['Qc', 'Jc'],
      rows: [],
    };
    const ev = evaluateReview(emptyDraft(), rv);
    expect(ev.draft.hands).toEqual({ UTG: 'AhAd', HJ: '', CO: '', BTN: '', SB: 'AsKs', BB: '7d2c' });
    expect(ev.draft.board).toEqual([]);
    expect(ev.issues).toEqual([
      'HJ の Hand が正しくありません',
      'CO の Hand が正しくありません',
      'BTN の Hand がありません',
      'Board が正しくありません',
      '1手目以降の Action が足りません',
    ]);
  });
});
