import { bbToMbb, playerCountOf, type Action, type HandSetup, type Pos } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { hmw, hs1, hs3, type Raw } from '../../../core/src/post/postFixtures.ts';
import {
  actionLog,
  addAction,
  addBoardCard,
  buildSubmission,
  candidates,
  clearActions,
  defaultAmount,
  emptyDraft,
  isDirty,
  isLocked,
  neighborSeat,
  parseSettings,
  PLAYERS_REQUIRED,
  setPlayers,
  parseSize,
  phaseOf,
  removeBoardFrom,
  selectSpot,
  statusLine,
  undoAction,
  usedCards,
  type Draft,
} from './draft.ts';
import { messageForCode } from './errorMessages.ts';

/** 6 人を選んだ下書き */
const six = (): Draft => ({ ...emptyDraft(), players: 6 });

/** 見本（03 章 §3.1 の形）を画面の操作どおりに入力した下書き。ボードはストリートが進むたびに足す。 */
function enter(raw: Raw): Draft {
  let d: Draft = six();
  const stacks = raw.stacks as Record<Pos, number>;
  d = {
    ...d,
    players: playerCountOf(Object.keys(stacks) as Pos[]),
    fmt: raw.fmt as Draft['fmt'],
    sb: String(raw.sb),
    ante: String(raw.ante),
    rake: raw.rake === null || raw.rake === undefined ? '' : String(raw.rake),
    stacks: Object.fromEntries(Object.entries(stacks).map(([p, v]) => [p, String(v)])) as Record<Pos, string>,
    hero: raw.hero as Pos,
  };
  d.hands = { ...d.hands, [d.hero]: (raw.hero_cards as string[]).join('') };
  for (const [p, cards] of Object.entries((raw.known_cards ?? {}) as Record<string, string[]>)) {
    d.hands = { ...d.hands, [p]: cards.join('') };
  }
  const board = raw.board as string[];
  const setup = parseSettings(d).setup;
  for (const a of raw.actions as Raw[]) {
    // 必要ならボードを足してから入力する
    let ph = phaseOf(setup, d.actions, d.board);
    while (ph.kind === 'board') {
      d = addBoardCard(d, board[d.board.length] as string);
      ph = phaseOf(setup, d.actions, d.board);
    }
    expect(ph.kind).toBe('act');
    const action: Action = { street: a.street as Action['street'], pos: a.pos as Pos, type: a.type as Action['type'] };
    if (typeof a.to === 'number') action.to = bbToMbb(a.to) as number;
    d = addAction(d, action);
  }
  let ph = phaseOf(setup, d.actions, d.board);
  while (ph.kind === 'board') {
    d = addBoardCard(d, board[d.board.length] as string);
    ph = phaseOf(setup, d.actions, d.board);
  }
  d = selectSpot(d, raw.spot_index as number);
  return { ...d, villain: raw.villain as Pos, title: raw.title as string };
}

describe('基本設定（06 章 §3.3）', () => {
  it('既定値は有効', () => {
    const p = parseSettings(six());
    expect(p.invalid).toEqual([]);
    expect(p.setup).toEqual({ sb: 500, bb: 1000, ante: 0, stacks: { UTG: 100000, HJ: 100000, CO: 100000, BTN: 100000, SB: 100000, BB: 100000 } });
    expect(p.rake).toBeNull();
  });
  it.each<[Partial<Draft>, string]>([
    [{ sb: '0' }, 'sb'],
    [{ sb: '1.5' }, 'sb'],
    [{ sb: '0.0001' }, 'sb'],
    [{ sb: 'abc' }, 'sb'],
    [{ ante: '-1' }, 'ante'],
    [{ rake: '5.001' }, 'rake'],
    [{ rake: '101' }, 'rake'],
  ])('%o は %s が不正', (patch, field) => {
    expect(parseSettings({ ...six(), ...patch }).invalid).toEqual([field]);
  });
  it('アンティの空は 0、MTT のレーキは使わない', () => {
    expect(parseSettings({ ...six(), ante: '' }).setup?.ante).toBe(0);
    expect(parseSettings({ ...six(), fmt: 'mtt', rake: '999' }).invalid).toEqual([]);
  });
  it('スタックの不正', () => {
    const d = six();
    expect(parseSettings({ ...d, stacks: { ...d.stacks, CO: '0' } }).invalid).toEqual(['CO']);
    expect(parseSettings({ ...d, stacks: { ...d.stacks, CO: '10000' } }).invalid).toEqual(['CO']);
  });
});

describe('人数（06 章 §3.4。2026-09-29）', () => {
  it('選ぶまでは進められず、投稿すると「人数を選択」', () => {
    const d = emptyDraft();
    expect(d.players).toBeNull();
    expect(parseSettings(d).setup).toBeNull();
    const s = buildSubmission(d);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.errors).toContain(PLAYERS_REQUIRED);
  });
  it('人数を選ぶと早い席から空き、空席のスタックは 0・ハンドは消える', () => {
    const d = setPlayers({ ...emptyDraft(), hands: { ...emptyDraft().hands, UTG: 'AsKs', BTN: 'QhQd' } }, 4);
    expect(d.hands.UTG).toBe('');
    expect(d.hands.BTN).toBe('QhQd');
    expect(parseSettings(d).setup?.stacks).toEqual({ UTG: 0, HJ: 0, CO: 100000, BTN: 100000, SB: 100000, BB: 100000 });
  });
  it('Hero が空席になったら BTN', () => {
    expect(setPlayers({ ...emptyDraft(), hero: 'UTG' }, 3).hero).toBe('BTN');
    expect(setPlayers({ ...emptyDraft(), hero: 'SB' }, 3).hero).toBe('SB');
    expect(setPlayers({ ...emptyDraft(), hero: 'SB' }, 2).hero).toBe('BTN');
  });
  it('2 人（BTN・BB）はプリフロップ BTN から', () => {
    const d = setPlayers(emptyDraft(), 2);
    const ph = phaseOf(parseSettings(d).setup, d.actions, d.board);
    expect(ph.kind === 'act' && ph.pos).toBe('BTN');
  });
  it('← → は座っている席を巡る（UTG の前は BB、BB の次は UTG）', () => {
    const six6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;
    expect(neighborSeat(six6, 'UTG', -1)).toBe('BB');
    expect(neighborSeat(six6, 'BB', 1)).toBe('UTG');
    expect(neighborSeat(six6, 'CO', 1)).toBe('BTN');
    expect(neighborSeat(['BTN', 'BB'], 'BB', 1)).toBe('BTN');
    expect(neighborSeat(['BTN', 'BB'], 'BTN', -1)).toBe('BB');
  });
  it('ヘッズアップの投稿の本文は座っている席だけ', () => {
    let d = setPlayers(emptyDraft(), 2);
    d = { ...d, hands: { ...d.hands, BTN: 'AdKd', BB: 'QsQc' } };
    for (const a of [
      { street: 'pf', pos: 'BTN', type: 'raise', to: 2500 },
      { street: 'pf', pos: 'BB', type: 'call' },
    ] as Action[]) d = addAction(d, a);
    for (const c of ['Kh', '8d', '3c']) d = addBoardCard(d, c);
    for (const a of [
      { street: 'flop', pos: 'BB', type: 'check' },
      { street: 'flop', pos: 'BTN', type: 'bet', to: 1800 },
      { street: 'flop', pos: 'BB', type: 'fold' },
    ] as Action[]) d = addAction(d, a);
    d = { ...selectSpot(d, 3), title: 'HU' };
    const s = buildSubmission(d);
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.body.stacks).toEqual({ BTN: 100, BB: 100 });
      expect(s.body.known_cards).toEqual({ BB: ['Qs', 'Qc'] });
    }
  });
});

describe('ハンドの進行（06 章 §3.6）', () => {
  it('最初は UTG の手番。状況行とロック', () => {
    const d = six();
    const ph = phaseOf(parseSettings(d).setup, d.actions, d.board);
    expect(ph.kind).toBe('act');
    if (ph.kind !== 'act') return;
    expect(ph.pos).toBe('UTG');
    expect(statusLine(ph.state, ph.pos)).toBe('UTG to act · プリフロップ · to call 1 · スタック 100bb');
    expect(isLocked(d)).toBe(false);
    expect(isLocked(addAction(d, { street: 'pf', pos: 'UTG', type: 'fold' }))).toBe(true);
  });

  it('ストリートが終わるとボード待ち（フロップは 3 枚）', () => {
    const d = enter(hs1());
    const setup = parseSettings(d).setup;
    const pf = d.actions.slice(0, 6);
    expect(phaseOf(setup, pf, [])).toMatchObject({ kind: 'board', need: 3 });
    expect(phaseOf(setup, pf, ['Kh', '8d'])).toMatchObject({ kind: 'board', need: 3 });
    const ph = phaseOf(setup, pf, ['Kh', '8d', '3c']);
    expect(ph).toMatchObject({ kind: 'act', pos: 'BB' });
    if (ph.kind === 'act') expect(ph.state.street).toBe('flop');
  });

  it('RUN: プリフロップのオールインとコールの後はボード 5 枚を続けて求め、揃うとショーダウン', () => {
    let d = six();
    for (const pos of ['UTG', 'HJ', 'CO'] as const) d = addAction(d, { street: 'pf', pos, type: 'fold' });
    d = addAction(d, { street: 'pf', pos: 'BTN', type: 'raise', to: 100000 });
    d = addAction(d, { street: 'pf', pos: 'SB', type: 'fold' });
    d = addAction(d, { street: 'pf', pos: 'BB', type: 'call' });
    const setup = parseSettings(d).setup;
    expect(phaseOf(setup, d.actions, [])).toMatchObject({ kind: 'board', need: 5 });
    expect(phaseOf(setup, d.actions, ['Kh', '8d', '3c', '2s'])).toMatchObject({ kind: 'board', need: 5 });
    expect(phaseOf(setup, d.actions, ['Kh', '8d', '3c', '2s', '7h'])).toMatchObject({
      kind: 'done',
      result: { kind: 'showdown', seats: ['BTN', 'BB'] },
      boardCount: 5,
    });
  });

  it('H-S1 を入力し終えるとショーダウン', () => {
    const d = enter(hs1());
    const ph = phaseOf(parseSettings(d).setup, d.actions, d.board);
    expect(ph).toMatchObject({ kind: 'done', result: { kind: 'showdown', seats: ['BTN', 'BB'] }, boardCount: 5 });
  });

  it('額の初期値: ベットはポットの 50%、レイズは最小レイズ to', () => {
    const d = enter(hs1());
    const setup = parseSettings(d).setup;
    // フロップ BTN（ポット 5.5 → 2.75）
    const bet = phaseOf(setup, d.actions.slice(0, 7), d.board);
    expect(bet.kind).toBe('act');
    if (bet.kind === 'act' && bet.legal.bet) expect(defaultAmount(bet.state, bet.pos, bet.legal.bet)).toBe(2750);
    // プリフロップ BTN（to call 1 → 最小レイズ to 2）
    const raise = phaseOf(setup, d.actions.slice(0, 3), []);
    if (raise.kind === 'act' && raise.legal.raise) expect(defaultAmount(raise.state, raise.pos, raise.legal.raise)).toBe(2000);
    expect(raise.kind).toBe('act');
  });

  it('額の入力の検査', () => {
    const r = { min: 2000, max: 100000 };
    expect(parseSize('2.5', r)).toBe(2500);
    expect(parseSize('1.9', r)).toBeNull();
    expect(parseSize('100.001', r)).toBeNull();
    expect(parseSize('2.0001', r)).toBeNull();
    expect(parseSize('', r)).toBeNull();
  });

  it('1つ戻す: 最後のアクションだけ取り消し、ボードは残す', () => {
    const d = enter(hs1());
    const u = undoAction(d);
    expect(u.actions).toHaveLength(14);
    expect(u.board).toHaveLength(5);
  });

  it('ボードの i 枚目を押すと、そのカード以降とそのストリート以降のアクションを消す', () => {
    const d = enter(hs1());
    const t = removeBoardFrom(d, 3); // ターンのカード
    expect(t.board).toEqual(['Kh', '8d', '3c']);
    expect(t.actions).toHaveLength(9);
    const f = removeBoardFrom(d, 1);
    expect(f.board).toEqual(['Kh']);
    expect(f.actions).toHaveLength(6);
  });

  it('すべて消す: アクション・ボード・スポットを消す', () => {
    const c = clearActions(enter(hs1()));
    expect(c).toMatchObject({ actions: [], board: [], spotIndex: null, villain: null });
    expect(c.hands.BTN).toBe('AdKd');
  });

  it('使用済みのカードは入力中の席を除く', () => {
    const d = enter(hs1());
    expect([...usedCards(d)].sort()).toEqual(['2s', '3c', '7h', '8d', 'Ad', 'Js', 'Kd', 'Kh', 'Ks'].sort());
    expect(usedCards(d, 'BTN').has('Ad')).toBe(false);
  });
});

describe('ログ', () => {
  it('コールは払った額、ベット・レイズは to、オールインを添える', () => {
    const d = enter(hs1());
    const log = actionLog(parseSettings(d).setup as HandSetup, d.actions);
    expect(log.slice(3, 9).map((l) => l.text)).toEqual(['BTN レイズ 2.5', 'SB フォールド', 'BB コール 1.5', 'BB チェック', 'BTN ベット 1.8', 'BB コール 1.8']);
    expect(log[6]?.street).toBe('flop');
    const shove = addAction(six(), { street: 'pf', pos: 'UTG', type: 'raise', to: 100000 });
    expect(actionLog(parseSettings(shove).setup as HandSetup, shove.actions)[0]?.text).toBe('UTG レイズ 100 オールイン');
  });
});

describe('スポット（06 章 §3.7）', () => {
  it('候補の表示', () => {
    const d = enter(hs1());
    // プリフロップ（BTN レイズ 2.5）は出題しない
    expect(candidates(d).map((c) => c.label)).toEqual([
      'フロップ / BTN ベット 1.8',
      'ターン / BTN ベット 6.5',
      'リバー / BTN ベット 15',
    ]);
  });

  it('Villain が 1 席なら自動で選ぶ。複数なら未選択', () => {
    const d = { ...enter(hs1()), spotIndex: null, villain: null };
    expect(selectSpot(d, 10).villain).toBe('BB');
    const mw = { ...enter(hmw()), spotIndex: null, villain: null }; // CO b3 の区間は BTN・BB
    expect(selectSpot(mw, 7)).toMatchObject({ spotIndex: 7, villain: null });
  });

  it('アクションを戻して候補が消えたら選択を解除', () => {
    const d = enter(hs1()); // スポット 10 / BB
    let u = d;
    for (let i = 0; i < 4; i++) u = undoAction(u); // 11 番目（BB コール）まで消す
    expect(u).toMatchObject({ spotIndex: null, villain: null });
  });
});

describe('投稿（06 章 §3.8）', () => {
  it.each([
    ['H-S1', hs1()],
    ['H-MW', hmw()],
    ['H-S3', hs3()],
  ])('%s: 送る本文は 03 章 §3.1 の形と一致', (_n, raw) => {
    const s = buildSubmission(enter(raw));
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const expected: Raw = { ...raw, known_cards: raw.known_cards ?? {} };
    if (expected.rake === undefined) expected.rake = null;
    expect(s.body).toEqual(expected);
  });

  it('「1つ戻す」で残った先のボードは送らない', () => {
    const d = enter(hs1());
    // リバーのアクションを消してターンで終わるハンドにする（ターンで BB フォールド）
    let u = d;
    for (let i = 0; i < 4; i++) u = undoAction(u);
    u = addAction(u, { street: 'turn', pos: 'BB', type: 'fold' });
    u = { ...selectSpot(u, 10), title: '見本' };
    const s = buildSubmission(u);
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.body.board).toEqual(['Kh', '8d', '3c', '2s']);
  });

  it('エラーの一覧', () => {
    const d = six();
    const s = buildSubmission({ ...d, sb: '2', hands: { ...d.hands, CO: 'Ah' } });
    expect(s).toEqual({
      ok: false,
      errors: ['SB の値が正しくありません', 'Hero（BTN）のハンドを入力してください', 'CO のハンドが途中です', 'スポットを選択してください', 'タイトルを入力してください'],
    });
  });

  it('ハンドが途中・Villain 未選択', () => {
    const d = enter(hs1());
    const s = buildSubmission({ ...undoAction(d), spotIndex: 3, villain: null });
    expect(s).toEqual({ ok: false, errors: ['ハンドを最後まで入力してください', 'Villain を選択してください'] });
  });

  it('タイトルの前後の空白は除いて送る', () => {
    const s = buildSubmission({ ...enter(hs1()), title: '  見本  ' });
    expect(s.ok && s.body.title).toBe('見本');
  });

  it('何か入力したら下書きあり', () => {
    expect(isDirty(emptyDraft())).toBe(false);
    expect(isDirty({ ...emptyDraft(), title: 'x' })).toBe(true);
  });
});

describe('エラーコードの文言（06 章 §7）', () => {
  it.each<[string, number | undefined, string]>([
    ['illegal_action', 6, 'アクションの内容を確認してください（7手目）'],
    ['hand_incomplete', undefined, 'アクションの内容を確認してください'],
    ['duplicate_card', undefined, '入力内容を確認してください'],
    ['daily_limit', undefined, '本日の投稿上限（5件）に達しました'],
    ['invalid_villain', undefined, 'スポットを選び直してください'],
    ['derived_mismatch', undefined, '投稿できませんでした。再読み込みしてやり直してください'],
    ['network', undefined, '通信に失敗しました'],
    ['internal', undefined, 'エラーが発生しました'],
  ])('%s → %s', (code, index, msg) => {
    expect(messageForCode(code, index)).toBe(msg);
  });
});
