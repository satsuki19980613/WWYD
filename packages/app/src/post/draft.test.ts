import { bbToMbb, playerCountOf, validateInput, ValidationError, verifyPost, type Action, type HandSetup, type Pos } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { ALLIN_CASES, allinHand, allinRaw, allinTitle } from '../../../core/src/post/allinFixtures.ts';
import { hmw, hs1, hs3, type Raw } from '../../../core/src/post/postFixtures.ts';
import { acts } from '../../../core/src/poker/testHelpers.ts';
import {
  actionLog,
  addAction,
  addBoardCard,
  aggressiveName,
  buildSubmission,
  callName,
  canReplay,
  candidates,
  clearActions,
  defaultAmount,
  defaultPreset,
  emptyDraft,
  isDirty,
  isLocked,
  makesPreflopAllin,
  neighborSeat,
  nextOpenSeat,
  parseSettings,
  NO_HERO_POSTFLOP,
  PLAYERS_REQUIRED,
  PREFLOP_ALLIN,
  setPlayers,
  parseSize,
  phaseOf,
  removeBoardFrom,
  selectSpot,
  submissionBody,
  sizeNote,
  sizePresets,
  sliderStep,
  sliderValue,
  skipTargets,
  statusLine,
  truncateActions,
  turnInfo,
  undoAction,
  usedCards,
  type Draft,
} from './draft.ts';
import { messageForCode } from './errorMessages.ts';

/** 見本のプリフロップのまま、フロップのアクションを差し替える（額は bb。見本の JSON の形） */
function rawActs(base: Raw, flop: string): Raw[] {
  const pf = (base.actions as Raw[]).filter((a) => a.street === 'pf');
  const f = acts({ flop }).map((a) => (a.to === undefined ? { ...a } : { ...a, to: a.to / 1000 }));
  return [...pf, ...f];
}

/** 6 人を選んだ下書き */
const six = (): Draft => ({ ...emptyDraft(), players: 6 });

/** 見本（03 章 §3.1 の形）を画面の操作どおりに入力した下書き。ボードはストリートが進むたびに足す。 */
function enter(raw: Raw): Draft {
  const d = selectSpot(play(raw), raw.spot_index as number);
  return { ...d, title: raw.title as string };
}

/** 見本のアクションとボードを入れるだけ（スポットは選ばない） */
function play(raw: Raw): Draft {
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
  return d;
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
  it('Ante の空は 0、MTT の Rake は使わない', () => {
    expect(parseSettings({ ...six(), ante: '' }).setup?.ante).toBe(0);
    expect(parseSettings({ ...six(), fmt: 'mtt', rake: '999' }).invalid).toEqual([]);
  });
  it('Stack の不正', () => {
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
  it('人数を選ぶと早い席から空き、空席の Stack は 0・Hand は消える', () => {
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
  it('2 人（BTN・BB）は Preflop BTN から', () => {
    const d = setPlayers(emptyDraft(), 2);
    const ph = phaseOf(parseSettings(d).setup, d.actions, d.board);
    expect(ph.kind === 'act' && ph.pos).toBe('BTN');
  });
  it('← → は座っている席を巡る（UTG の前は BB、BB の次は UTG）', () => {
    const six6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;
    expect(neighborSeat(six6, 'UTG', -1)).toBe('BB');
    expect(neighborSeat(six6, 'BB', 1)).toBe('UTG');
    // 次の空の席（PC のカード選択ボード。17 章）
    const hands = { ...emptyDraft().hands, UTG: 'AsKd', HJ: '', CO: 'QhQd', BTN: '', SB: '', BB: '' };
    expect(nextOpenSeat(six6, hands, 'UTG')).toBe('HJ');
    expect(nextOpenSeat(six6, hands, 'HJ')).toBe('BTN');
    expect(nextOpenSeat(six6, { ...hands, BTN: '2c2d', SB: '3c3d', BB: '4c4d' }, 'HJ')).toBeNull();
    expect(neighborSeat(six6, 'CO', 1)).toBe('BTN');
    expect(neighborSeat(['BTN', 'BB'], 'BB', 1)).toBe('BTN');
    expect(neighborSeat(['BTN', 'BB'], 'BTN', -1)).toBe('BB');
  });
  it('Heads-up の投稿の本文は座っている席だけ', () => {
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

describe('Action 入力の補助（13 章）', () => {
  /** 6 人の下書きにアクションを入れて、手番の状態を取る */
  const actAt = (acts: Action[], board: string[] = []) => {
    const d = { ...six(), actions: acts, board };
    const ph = phaseOf(parseSettings(d).setup, d.actions, d.board);
    if (ph.kind !== 'act') throw new Error(`act でない: ${ph.kind}`);
    return ph;
  };
  const labels = (ph: ReturnType<typeof actAt>) => sizePresets(ph.state, ph.legal).map((p) => `${p.label}:${p.sub}`);
  const pf = (pos: Pos, type: Action['type'], to?: number): Action =>
    to === undefined ? { street: 'pf', pos, type } : { street: 'pf', pos, type, to: to * 1000 };
  const fl = (pos: Pos, type: Action['type'], to?: number): Action =>
    to === undefined ? { street: 'flop', pos, type } : { street: 'flop', pos, type, to: to * 1000 };

  it('Open は 2 / 2.2 / 2.5 / 3bb と All-in。最初は 2.5', () => {
    const ph = actAt([]);
    expect(labels(ph)).toEqual(['2:2', '2.2:2.2', '2.5:2.5', '3:3', 'All-in:100']);
    expect(defaultPreset(ph.state, ph.legal)).toBe(2500);
  });
  it('Limp が 1 人いれば Isolate は 4 / 5 / 6bb', () => {
    const ph = actAt([pf('UTG', 'call')]);
    expect(labels(ph)).toEqual(['4:4', '5:5', '6:6', 'All-in:100']);
  });
  it('3bet は直前の Raise の倍率。最初は ×3', () => {
    const ph = actAt([pf('UTG', 'fold'), pf('HJ', 'fold'), pf('CO', 'raise', 2.5)]);
    expect(labels(ph)).toEqual(['×2.2:5.5', '×2.5:6.25', '×3:7.5', '×4:10', 'All-in:100']);
    expect(defaultPreset(ph.state, ph.legal)).toBe(7500);
  });
  it('Flop の Bet は % pot（Pot 5.5）。最初は 33%', () => {
    const base = [pf('UTG', 'fold'), pf('HJ', 'fold'), pf('CO', 'fold'), pf('BTN', 'raise', 2.5), pf('SB', 'fold'), pf('BB', 'call')];
    const ph = actAt([...base, fl('BB', 'check')], ['Kh', '8d', '3c']);
    // % pot は 0.1bb に丸める
    expect(labels(ph)).toEqual(['25%:1.4', '33%:1.8', '50%:2.8', '75%:4.1', '100%:5.5', '150%:8.3', 'All-in:97.5']);
    expect(defaultPreset(ph.state, ph.legal)).toBe(1800);
    expect(turnInfo(ph.state, ph.pos)).toEqual({ pot: 5500, toCall: 0, stack: 97500 });
  });
  it('Flop の Raise は直前の Bet の倍率。最小に満たない額は出さない', () => {
    const base = [pf('UTG', 'fold'), pf('HJ', 'fold'), pf('CO', 'fold'), pf('BTN', 'raise', 2.5), pf('SB', 'fold'), pf('BB', 'call')];
    const ph = actAt([...base, fl('BB', 'check'), fl('BTN', 'bet', 2)], ['Kh', '8d', '3c']);
    expect(labels(ph)).toEqual(['×2.5:5', '×3:6', '×4:8', 'All-in:97.5']);
    expect(turnInfo(ph.state, ph.pos)).toEqual({ pot: 7500, toCall: 2000, stack: 97500 });
  });
  it('Fold to: UTG から、Fold で回る席（BB は回らない。SB までで終わる）', () => {
    const ph = actAt([]);
    const sk = skipTargets(ph.state, ph.pos, ph.legal);
    expect(sk.kind).toBe('fold');
    expect(sk.targets.map((t) => t.pos)).toEqual(['HJ', 'CO', 'BTN', 'SB']);
    expect(sk.targets[2]?.actions.map((a) => `${a.pos} ${a.type}`)).toEqual(['UTG fold', 'HJ fold', 'CO fold']);
  });
  it('ボタンの名前: Open → 3bet → 4bet、Limp があれば Raise', () => {
    const name = (acts: Action[]) => {
      const ph = actAt(acts);
      return `${aggressiveName(ph.state, acts)} / ${callName(ph.state, ph.pos)}`;
    };
    expect(name([])).toBe('Open / Limp');
    expect(name([pf('UTG', 'call')])).toBe('Raise / Limp');
    expect(name([pf('UTG', 'raise', 2.5)])).toBe('3bet / Call');
    expect(name([pf('UTG', 'raise', 2.5), pf('HJ', 'raise', 7.5)])).toBe('4bet / Call');
    // SB のリンプ（コンプリート）の後の BB はチェックかレイズ
    expect(name([pf('UTG', 'fold'), pf('HJ', 'fold'), pf('CO', 'fold'), pf('BTN', 'fold'), pf('SB', 'call')])).toBe('Raise / Call');
  });
  it('ボタンの名前: Flop 以降は Bet → Raise → 3bet', () => {
    const base = [pf('UTG', 'fold'), pf('HJ', 'fold'), pf('CO', 'fold'), pf('BTN', 'raise', 2.5), pf('SB', 'fold'), pf('BB', 'call')];
    const board = ['Kh', '8d', '3c'];
    const name = (acts: Action[]) => aggressiveName(actAt([...base, ...acts], board).state, [...base, ...acts]);
    expect(name([])).toBe('Bet');
    expect(name([fl('BB', 'bet', 2)])).toBe('Raise');
    expect(name([fl('BB', 'bet', 2), fl('BTN', 'raise', 6)])).toBe('3bet');
  });
  it('額のスライダー: 刻みは幅で変わり、端は最小・最大ちょうど', () => {
    expect(sliderStep({ min: 2000, max: 10000 })).toBe(100);
    expect(sliderStep({ min: 5000, max: 45000 })).toBe(500);
    expect(sliderStep({ min: 2000, max: 100000 })).toBe(1000);
    const r = { min: 2000, max: 100000 };
    expect(sliderValue(0, r)).toBe(2000);
    expect(sliderValue(1, r)).toBe(100000);
    expect(sliderValue(0.5, r)).toBe(51000);
    // 丸めても最小を下回らない
    expect(sliderValue(0.006, { min: 2500, max: 100000 })).toBe(3000);
  });
  it('額の添え書き: Bet は % pot、Raise は ×倍率、Open は無し', () => {
    const base = [pf('UTG', 'fold'), pf('HJ', 'fold'), pf('CO', 'fold'), pf('BTN', 'raise', 2.5), pf('SB', 'fold'), pf('BB', 'call')];
    const bet = actAt([...base, fl('BB', 'check')], ['Kh', '8d', '3c']);
    expect(sizeNote(bet.state, 2750)).toBe('50% pot');
    const raise = actAt([...base, fl('BB', 'bet', 2)], ['Kh', '8d', '3c']);
    expect(sizeNote(raise.state, 6000)).toBe('×3');
    expect(sizeNote(actAt([]).state, 2500)).toBeNull();
    expect(sizeNote(actAt([pf('UTG', 'raise', 2.5)]).state, 7500)).toBe('×3');
  });
  it('1つ進む: 取り消した Action は同じ手番で合法なら入れ直せる', () => {
    const ph = actAt([pf('UTG', 'fold')]);
    expect(canReplay(ph, pf('HJ', 'raise', 2.5))).toBe(true);
    expect(canReplay(ph, pf('CO', 'fold'))).toBe(false);
    expect(canReplay(ph, pf('HJ', 'check'))).toBe(false);
    expect(canReplay(ph, pf('HJ', 'raise', 200))).toBe(false);
    expect(canReplay(ph, undefined)).toBe(false);
  });
  it('ログの 1 手から入れ直す: その手以降を消し、Board は残す', () => {
    const acts = [pf('UTG', 'fold'), pf('HJ', 'fold'), pf('CO', 'fold'), pf('BTN', 'raise', 2.5), pf('SB', 'fold'), pf('BB', 'call'), fl('BB', 'check')];
    const d = truncateActions({ ...six(), actions: acts, board: ['Kh', '8d', '3c'] }, 3);
    expect(d.actions).toEqual(acts.slice(0, 3));
    expect(d.board).toEqual(['Kh', '8d', '3c']);
  });
  it('Check to: Flop のマルチウェイ。最後の席の Check で終わる席は出さない', () => {
    const base = [pf('UTG', 'fold'), pf('HJ', 'call'), pf('CO', 'fold'), pf('BTN', 'call'), pf('SB', 'call'), pf('BB', 'check')];
    const ph = actAt(base, ['Kh', '8d', '3c']);
    const sk = skipTargets(ph.state, ph.pos, ph.legal);
    expect(ph.pos).toBe('SB');
    expect(sk.kind).toBe('check');
    expect(sk.targets.map((t) => t.pos)).toEqual(['BB', 'HJ', 'BTN']);
  });
});

describe('Hand の進行（06 章 §3.6）', () => {
  it('最初は UTG の手番。状況行とロック', () => {
    const d = six();
    const ph = phaseOf(parseSettings(d).setup, d.actions, d.board);
    expect(ph.kind).toBe('act');
    if (ph.kind !== 'act') return;
    expect(ph.pos).toBe('UTG');
    expect(statusLine(ph.state, ph.pos)).toBe('UTG to act · Preflop · to call 1 · Stack 100bb');
    expect(isLocked(d)).toBe(false);
    expect(isLocked(addAction(d, { street: 'pf', pos: 'UTG', type: 'fold' }))).toBe(true);
  });

  it('Street が終わると Board 待ち（Flop は 3 枚）', () => {
    const d = enter(hs1());
    const setup = parseSettings(d).setup;
    const pf = d.actions.slice(0, 6);
    expect(phaseOf(setup, pf, [])).toMatchObject({ kind: 'board', need: 3 });
    expect(phaseOf(setup, pf, ['Kh', '8d'])).toMatchObject({ kind: 'board', need: 3 });
    const ph = phaseOf(setup, pf, ['Kh', '8d', '3c']);
    expect(ph).toMatchObject({ kind: 'act', pos: 'BB' });
    if (ph.kind === 'act') expect(ph.state.street).toBe('flop');
  });

  it('RUN: Preflop の All-in と Call の後は Board 5 枚を続けて求め、揃うと Showdown', () => {
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

  it('H-S1 を入力し終えると Showdown', () => {
    const d = enter(hs1());
    const ph = phaseOf(parseSettings(d).setup, d.actions, d.board);
    expect(ph).toMatchObject({ kind: 'done', result: { kind: 'showdown', seats: ['BTN', 'BB'] }, boardCount: 5 });
  });

  it('額の初期値: Bet は Pot の 50%、Raise は最小 Raise to', () => {
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

  it('1つ戻す: 最後の Action だけ取り消し、Board は残す', () => {
    const d = enter(hs1());
    const u = undoAction(d);
    expect(u.actions).toHaveLength(14);
    expect(u.board).toHaveLength(5);
  });

  it('Board の i 枚目を押すと、その Card 以降とその Street 以降の Action を消す', () => {
    const d = enter(hs1());
    const t = removeBoardFrom(d, 3); // ターンのカード
    expect(t.board).toEqual(['Kh', '8d', '3c']);
    expect(t.actions).toHaveLength(9);
    const f = removeBoardFrom(d, 1);
    expect(f.board).toEqual(['Kh']);
    expect(f.actions).toHaveLength(6);
  });

  it('すべて消す: Action・Board・Spot を消す', () => {
    const c = clearActions(enter(hs1()));
    expect(c).toMatchObject({ actions: [], board: [], spotIndex: null });
    expect(c.hands.BTN).toBe('AdKd');
  });

  it('使用済みの Card は入力中の席を除く', () => {
    const d = enter(hs1());
    expect([...usedCards(d)].sort()).toEqual(['2s', '3c', '7h', '8d', 'Ad', 'Js', 'Kd', 'Kh', 'Ks'].sort());
    expect(usedCards(d, 'BTN').has('Ad')).toBe(false);
  });
});

describe('ログ', () => {
  it('Call は払った額、Bet・Raise は to、All-in を添える', () => {
    const d = enter(hs1());
    const log = actionLog(parseSettings(d).setup as HandSetup, d.actions);
    expect(log.slice(3, 9).map((l) => l.text)).toEqual(['BTN Raise 2.5', 'SB Fold', 'BB Call 1.5', 'BB Check', 'BTN Bet 1.8', 'BB Call 1.8']);
    expect(log[6]?.street).toBe('flop');
    const shove = addAction(six(), { street: 'pf', pos: 'UTG', type: 'raise', to: 100000 });
    expect(actionLog(parseSettings(shove).setup as HandSetup, shove.actions)[0]?.text).toBe('UTG Raise 100 All-in');
  });
});

describe('Spot（06 章 §3.7）', () => {
  it('候補の表示', () => {
    const d = enter(hs1());
    // プリフロップ（BTN レイズ 2.5）は出題しない
    expect(candidates(d).map((c) => c.label)).toEqual([
      'Flop / BTN Bet 1.8',
      'Turn / BTN Bet 6.5',
      'River / BTN Bet 15',
    ]);
  });

  it('候補は Flop 以降の Hero のアクションすべて（Fold・ハンドの最後のアクションも。2026-09-29）', () => {
    const fold = play({ ...hs1(), actions: rawActs(hs1(), 'BB b3, BTN f'), board: ['Kh', '8d', '3c'] });
    expect(candidates(fold).map((c) => c.label)).toEqual(['Flop / BTN Fold']);
    const mw = play(hmw());
    expect(candidates(mw).map((c) => c.index)).toEqual([7, 10, 13, 15]);
  });

  it('スポットは自動では選ばない（Hero のオールインでも。投稿者が選ぶ）', () => {
    const shove = play({ ...hs1(), actions: rawActs(hs1(), 'BB x, BTN b97.5, BB c') });
    expect(shove.spotIndex).toBeNull();
    expect(candidates(shove).map((c) => c.label)).toEqual(['Flop / BTN Bet 97.5']);
    expect(selectSpot(shove, 7).spotIndex).toBe(7);
  });

  it('Action を戻して候補が消えたら選択を解除', () => {
    const d = enter(hs1()); // スポット 10（ターンの BTN b6.5）
    let u = d;
    for (let i = 0; i < 4; i++) u = undoAction(u); // 11 番目（BB コール）まで消す: スポット 10 は残る
    expect(u.spotIndex).toBe(10);
    u = undoAction(u); // 10 番目（BTN b6.5）を消す
    expect(u.spotIndex).toBeNull();
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

  it('「1つ戻す」で残った先の Board は送らない', () => {
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
      errors: ['SB の値が正しくありません', 'Hero（BTN）の Hand を入力してください', 'CO の Hand が途中です', 'Spot を選択してください', 'タイトルを入力してください'],
    });
  });

  it('Hand が途中', () => {
    const d = enter(hs1());
    const s = buildSubmission(undoAction(d));
    expect(s).toEqual({ ok: false, errors: ['Hand を最後まで入力してください'] });
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

describe('オールインを含むハンドの Spot（2026-09-29「オールインも他のアクションと変わらない」）', () => {
  it.each(ALLIN_CASES.map((c) => [c.name, c] as const))('%s', (_, c) => {
    // 画面と同じ操作で入れ、候補は Flop 以降の Hero の手番すべて（オールインも、その前の手番も）
    const d = play(allinHand(c));
    expect(phaseOf(parseSettings(d).setup, d.actions, d.board).kind).toBe('done');
    const list = candidates(d);
    expect(list.map((x) => x.label)).toEqual(c.spots.map(([label]) => label));
    // 候補が無い（Preflop の All-in）ハンドは投稿できないと伝える
    if (list.length === 0) {
      expect(buildSubmission({ ...d, title: allinTitle(c) })).toEqual({ ok: false, errors: [PREFLOP_ALLIN] });
    }
    // どの候補を選んでも投稿でき、送る本文は core の見本と一致する（サーバーと同じ検証も通る）
    for (const { index } of list) {
      const s = buildSubmission({ ...selectSpot(d, index), title: allinTitle(c) });
      expect(s.ok ? null : s.errors).toBeNull();
      if (s.ok) expect(s.body).toEqual(allinRaw(c, index));
    }
  });
});

describe('Spot の候補が無いハンドの投稿のエラー', () => {
  const pf = (line: string, stacks?: Record<string, number>): Draft => {
    const raw = { ...hs1(), actions: acts({ pf: line }).map((a) => (a.to === undefined ? { ...a } : { ...a, to: a.to / 1000 })) };
    return { ...play(stacks ? { ...raw, stacks } : raw), title: '見本' };
  };
  it('Hero が Preflop で All-in（Call 側でも）', () => {
    expect(buildSubmission(pf('UTG..CO f, BTN r100, SB f, BB c'))).toEqual({ ok: false, errors: [PREFLOP_ALLIN] });
    expect(buildSubmission(pf('UTG..CO f, BTN r2.5, SB f, BB r100, BTN c'))).toEqual({ ok: false, errors: [PREFLOP_ALLIN] });
  });
  it('相手の Preflop の All-in に、スタックの多い Hero が Call（それ以上 Action できない）', () => {
    const d = pf('UTG..CO f, BTN r2.5, SB f, BB r30, BTN c', { ...hs1().stacks as Record<string, number>, BB: 30 });
    expect(buildSubmission(d)).toEqual({ ok: false, errors: [PREFLOP_ALLIN] });
  });
  it('Hero が Preflop で Fold、または Preflop で全員が Fold', () => {
    expect(buildSubmission(pf('UTG r2.5, HJ..CO f, BTN f, SB f, BB f'))).toEqual({ ok: false, errors: [NO_HERO_POSTFLOP] });
    expect(buildSubmission(pf('UTG..CO f, BTN r2.5, SB f, BB f'))).toEqual({ ok: false, errors: [NO_HERO_POSTFLOP] });
  });
  it('Hero が Preflop で Fold したあと、ほかの席が All-in（2026-09-29 さつき: Hero でもほかの席でも）', () => {
    expect(buildSubmission(pf('UTG..CO f, BTN f, SB r100, BB c'))).toEqual({ ok: false, errors: [PREFLOP_ALLIN] });
    expect(buildSubmission(pf('UTG r2.5, HJ..CO f, BTN f, SB f, BB r100, UTG c'))).toEqual({ ok: false, errors: [PREFLOP_ALLIN] });
  });
  it('短い UTG の Preflop の All-in のあと、Hero が Flop 以降を続けた（サイドポット）も候補なし', () => {
    const raw = {
      ...hs1(),
      stacks: { ...(hs1().stacks as Record<string, number>), UTG: 10 },
      actions: acts({ pf: 'UTG r10, HJ..CO f, BTN c, SB f, BB c', flop: 'BB x, BTN b5, BB f' }).map((a) =>
        a.to === undefined ? { ...a } : { ...a, to: a.to / 1000 },
      ),
    };
    const d = { ...play(raw), title: '見本' };
    expect(candidates(d)).toEqual([]);
    expect(buildSubmission(d)).toEqual({ ok: false, errors: [PREFLOP_ALLIN] });
  });
});

describe('Preflop で All-in になる Action は受け付けない（2026-09-29。Hero でもほかの席でも）', () => {
  const at = (line: string, stacks?: Record<string, number>): { d: Draft; last: Action } => {
    const all = acts({ pf: line });
    const raw = { ...hs1(), actions: [], board: [], ...(stacks ? { stacks } : {}) };
    let d = play(raw);
    for (const a of all.slice(0, -1)) d = addAction(d, a);
    return { d, last: all[all.length - 1] as Action };
  };
  const refused = (line: string, stacks?: Record<string, number>): boolean => {
    const { d, last } = at(line, stacks);
    return makesPreflopAllin(d, [last]);
  };
  const S = { ...(hs1().stacks as Record<string, number>) };

  it('Hero の All-in の Raise', () => {
    expect(refused('UTG..CO f, BTN r100')).toBe(true);
    expect(refused('UTG..CO f, BTN r2.5, SB f, BB r10, BTN r100')).toBe(true);
  });
  it('相手の All-in の Raise（100bb でも、短いスタックでも）', () => {
    expect(refused('UTG..CO f, BTN r2.5, SB f, BB r100')).toBe(true);
    expect(refused('UTG..CO f, BTN r2.5, SB f, BB r30', { ...S, BB: 30 })).toBe(true);
    expect(refused('UTG r10', { ...S, UTG: 10 })).toBe(true);
  });
  it('短いスタックの Call で All-in になる', () => {
    expect(refused('UTG..CO f, BTN r20, SB f, BB c', { ...S, BB: 15 })).toBe(true);
  });
  it('Hero の Fold・All-in にならない Action・Flop 以降の All-in は受け付ける', () => {
    expect(refused('UTG..CO f, BTN r2.5, SB f, BB f')).toBe(false);
    expect(refused('UTG..CO f, BTN r2.5, SB f, BB c')).toBe(false);
    const d = play({ ...hs1(), actions: rawActs(hs1(), 'BB x') });
    expect(makesPreflopAllin(d, [{ street: 'flop', pos: 'BTN', type: 'bet', to: 97500 }])).toBe(false);
  });
  it('すでに Preflop の All-in があるハンド（前の版の下書きなど）は、続きの Action を止めない', () => {
    expect(refused('UTG..CO f, BTN r2.5, SB f, BB r100, BTN f')).toBe(false);
  });
});

describe('画面のエラーはすべてサーバーも返す（2026-09-29 さつき）', () => {
  /** 本文をサーバー（create-post）と同じ検証にかけたエラーコード。通れば null */
  const serverCode = (body: Record<string, unknown>): string | null => {
    try {
      verifyPost(validateInput(body));
      return null;
    } catch (e) {
      if (e instanceof ValidationError) return e.code;
      throw e;
    }
  };
  const ok = (): Draft => enter(hs1());
  /** 画面が Spot の選択を許さないハンドに、画面を通さずスポットを付けて送った本文（派生メタは形だけ整える） */
  const forced = (d: Draft, spotIndex: number): Record<string, unknown> => ({ ...submissionBody({ ...d, spotIndex }), derived: hs1().derived });
  const pfAllin = ALLIN_CASES.find((c) => c.refusedAt === 0) as (typeof ALLIN_CASES)[number];

  it('正しい下書きは画面もサーバーも通る', () => {
    expect(buildSubmission(ok()).ok).toBe(true);
    expect(serverCode(submissionBody(ok()))).toBeNull();
  });

  it.each<[string, () => Draft, string, string]>([
    ['人数を選んでいない', () => ({ ...ok(), players: null }), PLAYERS_REQUIRED, 'invalid_settings'],
    ['SB が BB より大きい', () => ({ ...ok(), sb: '2' }), 'SB の値が正しくありません', 'invalid_settings'],
    ['SB が数でない', () => ({ ...ok(), sb: 'abc' }), 'SB の値が正しくありません', 'malformed'],
    ['Ante が負', () => ({ ...ok(), ante: '-1' }), 'Ante の値が正しくありません', 'invalid_settings'],
    ['Rake が 100 を超える', () => ({ ...ok(), rake: '101' }), 'Rake の値が正しくありません', 'invalid_settings'],
    ['Rake の小数が 3 桁', () => ({ ...ok(), rake: '1.234' }), 'Rake の値が正しくありません', 'malformed'],
    ['Stack が 0', () => ({ ...ok(), stacks: { ...ok().stacks, CO: '0' } }), 'CO の Stack の値が正しくありません', 'invalid_settings'],
    ['Hero の Hand が無い', () => ({ ...ok(), hands: { ...ok().hands, BTN: '' } }), 'Hero（BTN）の Hand を入力してください', 'hero_cards_required'],
    ['ほかの席の Hand が途中', () => ({ ...ok(), hands: { ...ok().hands, CO: 'Ah' } }), 'CO の Hand が途中です', 'malformed'],
    ['同じカードを 2 度使う', () => ({ ...ok(), hands: { ...ok().hands, CO: 'AdQs' } }), '入力内容を確認してください', 'duplicate_card'],
    ['Hand が最後まで無い', () => undoAction(ok()), 'Hand を最後まで入力してください', 'hand_incomplete'],
    ['Spot を選んでいない', () => ({ ...ok(), spotIndex: null }), 'Spot を選択してください', 'malformed'],
    ['タイトルが無い', () => ({ ...ok(), title: '  ' }), 'タイトルを入力してください', 'invalid_title'],
    ['タイトルが 41 文字', () => ({ ...ok(), title: 'あ'.repeat(41) }), messageForCode('invalid_title'), 'invalid_title'],
  ])('%s', (_, make, message, code) => {
    const d = make();
    const s = buildSubmission(d);
    expect(s.ok ? [] : s.errors).toContain(message);
    expect(serverCode(submissionBody(d))).toBe(code);
  });

  it('Flop 以降に Hero の Action が無い: 画面と同じ文言をサーバーも返す（no_spot）', () => {
    const d = { ...play({ ...hs1(), hero: 'UTG', hero_cards: ['Qs', 'Qd'] }), title: '見本' };
    expect(buildSubmission(d)).toEqual({ ok: false, errors: [NO_HERO_POSTFLOP] });
    expect(serverCode(forced(d, 0))).toBe('no_spot');
    expect(messageForCode('no_spot')).toBe(NO_HERO_POSTFLOP);
  });

  it('Preflop で All-in: 画面と同じ文言をサーバーも返す（Hero が Flop 以降を続けても。preflop_allin）', () => {
    const d = { ...play(allinHand(pfAllin)), title: '見本' };
    expect(buildSubmission(d)).toEqual({ ok: false, errors: [PREFLOP_ALLIN] });
    const heroFlop = d.actions.findIndex((a) => a.pos === d.hero && a.street !== 'pf');
    expect(serverCode(forced(d, heroFlop))).toBe('preflop_allin');
    expect(messageForCode('preflop_allin')).toBe(PREFLOP_ALLIN);
  });

  it('入力で受け付けない額（画面はトースト）もサーバーが断る', () => {
    const d = ok();
    const actions = d.actions.map((a, i) => (i === 3 ? { ...a, to: 1500 } : a)); // BTN の Raise を最小額 2bb より小さく
    const body = { ...submissionBody(d), actions: actions.map((a) => (a.to === undefined ? { ...a } : { ...a, to: a.to / 1000 })) };
    expect(serverCode(body)).toBe('amount_out_of_range');
  });
});

describe('エラーコードの文言（06 章 §7）', () => {
  it.each<[string, number | undefined, string]>([
    ['illegal_action', 6, 'Action の内容を確認してください（7手目）'],
    ['hand_incomplete', undefined, 'Action の内容を確認してください'],
    ['duplicate_card', undefined, '入力内容を確認してください'],
    ['daily_limit', undefined, '本日の投稿上限（5件）に達しました'],
    ['invalid_spot', undefined, 'Spot を選び直してください'],
    ['derived_mismatch', undefined, '投稿できませんでした。再読み込みしてやり直してください'],
    ['network', undefined, '通信に失敗しました'],
    ['internal', undefined, 'エラーが発生しました'],
  ])('%s → %s', (code, index, msg) => {
    expect(messageForCode(code, index)).toBe(msg);
  });
});
