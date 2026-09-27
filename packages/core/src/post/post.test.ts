/**
 * 投稿の検証（詳細仕様 04 章 §10.12 VAL・§10.13 SD、03 章 §5 の EF-01〜04 の純関数部分）。
 */
import { describe, expect, it } from 'vitest';
import { ValidationError, type ValidationCode } from '../errors.ts';
import { mbbToBb } from '../money.ts';
import type { Action } from '../poker/state.ts';
import { acts } from '../poker/testHelpers.ts';
import { validateInput } from './validateInput.ts';
import { verifyPost } from './verifyPost.ts';

type Raw = Record<string, unknown>;

function rawActions(actions: Action[]): Raw[] {
  return actions.map((a) => (a.to === undefined ? { ...a } : { ...a, to: mbbToBb(a.to) }));
}

const STACKS100 = { UTG: 100, HJ: 100, CO: 100, BTN: 100, SB: 100, BB: 100 };

/** H-S1 スポット 10 / BB の正しい投稿（03 章 §3.1 の例）。 */
function hs1(): Raw {
  return {
    title: 'K83r のターン 2 バレル',
    fmt: 'cash',
    sb: 0.5,
    bb: 1,
    ante: 0,
    rake: 5,
    stacks: { ...STACKS100 },
    hero: 'BTN',
    hero_cards: ['Ad', 'Kd'],
    known_cards: { BB: ['Ks', 'Js'] },
    board: ['Kh', '8d', '3c', '2s', '7h'],
    actions: rawActions(
      acts({
        pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
        flop: 'BB x, BTN b1.8, BB c',
        turn: 'BB x, BTN b6.5, BB c',
        river: 'BB x, BTN b15, BB c',
      }),
    ),
    spot_index: 10,
    villain: 'BB',
    derived: {
      street: 'turn',
      keys: ['fold', 'call', 's1'],
      s1_label: 'raise',
      min_to: 13,
      max_to: 95.7,
      pot_base: 22.1,
      effective_stack: 100,
      stop_index: 11,
    },
  };
}

/** H-MW スポット 7 / BB。 */
function hmw(): Raw {
  return {
    ...hs1(),
    title: 'マルチウェイ',
    hero: 'CO',
    hero_cards: ['Qh', 'Qd'],
    known_cards: {},
    actions: rawActions(
      acts({
        pf: 'UTG f, HJ f, CO r2.5, BTN c, SB f, BB c',
        flop: 'BB x, CO b3, BTN c, BB r12, CO c, BTN f',
        turn: 'BB x, CO x',
        river: 'BB x, CO x',
      }),
    ),
    spot_index: 7,
    villain: 'BB',
    derived: {
      street: 'flop',
      keys: ['fold', 'call', 's1'],
      s1_label: 'raise',
      min_to: 6,
      max_to: 97.5,
      pot_base: 17,
      effective_stack: 100,
      stop_index: 9,
    },
  };
}

/** H-S3（MTT）スポット 6 / HJ。 */
function hs3(): Raw {
  return {
    title: 'MTT の見本',
    fmt: 'mtt',
    sb: 0.5,
    bb: 1,
    ante: 0.125,
    rake: null,
    stacks: { UTG: 30, HJ: 22, CO: 45, BTN: 18, SB: 26, BB: 24 },
    hero: 'BB',
    hero_cards: ['9s', '9c'],
    known_cards: {},
    board: ['Th', '6d', '2c', '3s', 'Jh'],
    actions: rawActions(
      acts({
        pf: 'UTG f, HJ r2.1, CO f, BTN f, SB f, BB c',
        flop: 'BB b3, HJ c',
        turn: 'BB x, HJ x',
        river: 'BB x, HJ x',
      }),
    ),
    spot_index: 6,
    villain: 'HJ',
    derived: {
      street: 'flop',
      keys: ['fold', 'call', 's1'],
      s1_label: 'raise',
      min_to: 6,
      max_to: 19.775,
      pot_base: 11.45,
      effective_stack: 22,
      stop_index: 7,
    },
  };
}

function run(raw: Raw) {
  return verifyPost(validateInput(raw));
}

function codeOf(raw: Raw): ValidationCode | null {
  try {
    run(raw);
    return null;
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    return e.code;
  }
}

function withActions(raw: Raw, edit: (a: Raw[]) => void): Raw {
  const actions = (raw.actions as Raw[]).map((a) => ({ ...a }));
  edit(actions);
  return { ...raw, actions };
}

describe('EF-02 正常系', () => {
  it('H-S1 スポット 10', () => {
    const v = run(hs1());
    expect(v.title).toBe('K83r のターン 2 バレル');
    expect(v.derived).toEqual({
      street: 'turn',
      keys: ['fold', 'call', 's1'],
      s1Label: 'raise',
      minTo: 13000,
      maxTo: 95700,
      potBase: 22100,
      effectiveStack: 100000,
      stopIndex: 11,
    });
    expect(v.result).toEqual({ kind: 'showdown', seats: ['BTN', 'BB'] });
  });

  it('H-MW スポット 7 と H-S3（MTT）', () => {
    expect(run(hmw()).derived.stopIndex).toBe(9);
    const s3 = run(hs3());
    expect(s3.rake).toBeNull();
    expect(s3.derived.effectiveStack).toBe(22000);
  });

  it('タイトルの前後の空白は除く', () => {
    expect(run({ ...hs1(), title: '  見本  ' }).title).toBe('見本');
  });
});

describe('EF-03 / EF-04 派生メタの照合', () => {
  const tamper: [string, unknown][] = [
    ['street', 'river'],
    ['keys', ['fold', 'call']],
    ['s1_label', 'bet'],
    ['min_to', 13.01],
    ['max_to', 95.6],
    ['pot_base', 22],
    ['effective_stack', 99],
    ['stop_index', 12],
  ];
  it.each(tamper)('%s を改ざんすると derived_mismatch', (key, value) => {
    const raw = hs1();
    raw.derived = { ...(raw.derived as Raw), [key]: value };
    expect(codeOf(raw)).toBe('derived_mismatch');
  });

  it('keys の順序違いも不一致', () => {
    const raw = hs1();
    raw.derived = { ...(raw.derived as Raw), keys: ['call', 'fold', 's1'] };
    expect(codeOf(raw)).toBe('derived_mismatch');
  });
});

describe('VAL 投稿の検証', () => {
  it('VAL-01 手番でない席', () => {
    expect(codeOf(withActions(hs1(), (a) => (a[0] = { street: 'pf', pos: 'HJ', type: 'fold' })))).toBe('not_your_turn');
  });

  it('VAL-02 合法でない種別', () => {
    expect(codeOf(withActions(hs1(), (a) => (a[4] = { street: 'pf', pos: 'SB', type: 'check' })))).toBe('illegal_action');
  });

  it('VAL-03 額が範囲外', () => {
    expect(codeOf(withActions(hs1(), (a) => ((a[3] as Raw).to = 1.5)))).toBe('amount_out_of_range');
  });

  it('VAL-04 to の有無', () => {
    expect(codeOf(withActions(hs1(), (a) => ((a[0] as Raw).to = 1)))).toBe('malformed');
    expect(codeOf(withActions(hs1(), (a) => delete (a[3] as Raw).to))).toBe('malformed');
  });

  it('VAL-05 ストリートのラベル違い', () => {
    expect(codeOf(withActions(hs1(), (a) => ((a[6] as Raw).street = 'turn')))).toBe('street_mismatch');
  });

  it('VAL-06 終了後のアクション', () => {
    expect(codeOf(withActions(hs1(), (a) => a.push({ street: 'river', pos: 'BB', type: 'check' })))).toBe(
      'action_after_end',
    );
  });

  it('VAL-07 最後まで入力されていない', () => {
    expect(codeOf(withActions(hs1(), (a) => a.splice(12)))).toBe('hand_incomplete');
  });

  it('VAL-08 ボード枚数の不一致', () => {
    expect(codeOf({ ...hs1(), board: ['Kh', '8d', '3c', '2s'] })).toBe('board_mismatch');
  });

  it('VAL-09 カードの重複', () => {
    expect(codeOf({ ...hs1(), known_cards: { BB: ['Ad', 'Js'] } })).toBe('duplicate_card');
    expect(codeOf({ ...hs1(), board: ['Kd', '8d', '3c', '2s', '7h'] })).toBe('duplicate_card');
    expect(codeOf({ ...hs1(), hero_cards: ['Ad', 'Ad'] })).toBe('duplicate_card');
  });

  it.each([[['Ad']], [['Ad', 'Kd', 'Qd']], [['Ad', '1d']], [null], ['AdKd']])('VAL-10 Hero のカード %o', (cards) => {
    expect(codeOf({ ...hs1(), hero_cards: cards })).toBe('hero_cards_required');
  });

  it.each<[string, unknown]>([
    ['Hero の席', { BTN: ['Qs', 'Qd'] }],
    ['存在しない席', { MP: ['Qs', 'Qd'] }],
    ['2 枚でない', { BB: ['Ks'] }],
    ['形式不正', { BB: ['Ks', 'J'] }],
    ['muck を送る', { BB: 'muck' }],
    ['配列', [['Ks', 'Js']]],
  ])('VAL-11 known_cards: %s', (_name, known) => {
    expect(codeOf({ ...hs1(), known_cards: known })).toBe('malformed');
  });

  it('VAL-12 候補でない spot_index', () => {
    const spot = (i: number, derived: Raw = hs1().derived as Raw): Raw => ({ ...hs1(), spot_index: i, derived });
    expect(codeOf(spot(0))).toBe('invalid_spot'); // Hero のアクションでない
    expect(codeOf({ ...hmw(), spot_index: 15 })).toBe('invalid_spot'); // 後続なし
    const fold = withActions(hs1(), () => undefined);
    expect(codeOf({ ...fold, hero: 'SB', hero_cards: ['2d', '4c'], spot_index: 4 })).toBe('invalid_spot'); // fold
  });

  it('VAL-13 候補でない Villain', () => {
    expect(codeOf({ ...hs1(), villain: 'CO' })).toBe('invalid_villain');
    expect(codeOf({ ...hs1(), villain: 'BTN' })).toBe('invalid_villain');
  });

  it.each<[string, Raw]>([
    ['スタック 0', { stacks: { ...STACKS100, CO: 0 } }],
    ['スタックが負', { stacks: { ...STACKS100, CO: -1 } }],
    ['SB 0', { sb: 0 }],
    ['SB > BB', { sb: 1.5 }],
    ['BB が 1 でない', { bb: 2 }],
    ['アンティが負', { ante: -0.1 }],
    ['MTT でレーキ', { fmt: 'mtt', rake: 5 }],
    ['レーキが 100 超', { rake: 100.5 }],
    ['レーキが負', { rake: -1 }],
  ])('VAL-15 %s', (_name, patch) => {
    expect(codeOf({ ...hs1(), ...patch })).toBe('invalid_settings');
  });

  it.each<[string, Raw]>([
    ['金額の小数 4 桁', { sb: 0.5001 }],
    ['上限超', { stacks: { ...STACKS100, CO: 10000 } }],
    ['金額が文字列', { ante: '0' }],
    ['レーキの小数 3 桁', { rake: 5.001 }],
    ['スタックの席が足りない', { stacks: { UTG: 100 } }],
    ['スタックに知らない席', { stacks: { ...STACKS100, MP: 100 } }],
    ['fmt', { fmt: 'sng' }],
    ['hero', { hero: 'MP' }],
    ['board の形式', { board: ['Kh', '8d', 'XX', '2s', '7h'] }],
    ['board 6 枚', { board: ['Kh', '8d', '3c', '2s', '7h', '6h'] }],
    ['actions が配列でない', { actions: {} }],
    ['spot_index が小数', { spot_index: 1.5 }],
    ['spot_index が負', { spot_index: -1 }],
    ['villain', { villain: 'MP' }],
    ['derived がない', { derived: null }],
    ['title が文字列でない', { title: 1 }],
  ])('VAL-16 形式: %s', (_name, patch) => {
    expect(codeOf({ ...hs1(), ...patch })).toBe('malformed');
  });

  it('VAL-16 アクションの形式', () => {
    expect(codeOf(withActions(hs1(), (a) => ((a[0] as Raw).type = 'shove')))).toBe('malformed');
    expect(codeOf(withActions(hs1(), (a) => ((a[0] as Raw).street = 'preflop')))).toBe('malformed');
    expect(codeOf(withActions(hs1(), (a) => (a[0] = 'fold' as unknown as Raw)))).toBe('malformed');
    expect(codeOf(withActions(hs1(), (a) => ((a[3] as Raw).to = 2.5001)))).toBe('malformed');
  });

  it('VAL-16 派生メタの形式', () => {
    const d = (patch: Raw): Raw => ({ ...hs1(), derived: { ...(hs1().derived as Raw), ...patch } });
    expect(codeOf(d({ street: 'x' }))).toBe('malformed');
    expect(codeOf(d({ keys: ['fold', 'shove'] }))).toBe('malformed');
    expect(codeOf(d({ keys: 'fold' }))).toBe('malformed');
    expect(codeOf(d({ s1_label: 'shove' }))).toBe('malformed');
    expect(codeOf(d({ stop_index: '11' }))).toBe('malformed');
    expect(codeOf(d({ pot_base: 22.1001 }))).toBe('malformed');
  });

  it.each(['', '   ', 'あ'.repeat(41)])('VAL-17 タイトル %j', (title) => {
    expect(codeOf({ ...hs1(), title })).toBe('invalid_title');
  });

  it('VAL-17 40 文字ちょうど（サロゲートペアも 1 文字）は通る', () => {
    expect(codeOf({ ...hs1(), title: 'あ'.repeat(40) })).toBeNull();
    expect(codeOf({ ...hs1(), title: '🂡'.repeat(40) })).toBeNull();
  });

  it('本文がオブジェクトでない', () => {
    expect(codeOf(null as unknown as Raw)).toBe('malformed');
  });

  it('known_cards は省略できる・レーキは省略できる', () => {
    const raw = hs1();
    delete raw.known_cards;
    delete raw.rake;
    const v = run(raw);
    expect(v.rake).toBeNull();
    expect(v.knownCards).toEqual({ BB: 'muck' });
  });
});

describe('SD ショーダウンのマック補完', () => {
  it('SD-01 入力したカードはそのまま', () => {
    expect(run(hs1()).knownCards).toEqual({ BB: ['Ks', 'Js'] });
  });

  it('SD-02 未入力はマック', () => {
    expect(run({ ...hs1(), known_cards: {} }).knownCards).toEqual({ BB: 'muck' });
  });

  it('SD-03 フォールド後に見せた席も保存', () => {
    expect(run({ ...hmw(), known_cards: { BTN: ['7s', '7d'] } }).knownCards).toEqual({ BTN: ['7s', '7d'], BB: 'muck' });
  });

  it('SD-04 ショーダウンがなければマックを付けない', () => {
    const raw = withActions(hs1(), (a) => {
      a.splice(14, 1, { street: 'river', pos: 'BB', type: 'fold' });
    });
    const v = run({ ...raw, known_cards: {} });
    expect(v.result).toEqual({ kind: 'over', winner: 'BTN' });
    expect(v.knownCards).toEqual({});
  });
});
