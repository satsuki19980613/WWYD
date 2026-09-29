/**
 * オールインを含むハンドの見本（2026-09-29 さつき「オールインも他のアクションと変わらない」）。テスト専用。
 * Hero の Flop 以降の手番は、オールイン（Bet / Raise / Call）もその前の手番も、すべてスポットの候補になる。
 * ただし Preflop でだれかが All-in になったハンドは、Hero でもほかの席でも候補なし（投稿できない）。
 * core（検証）・投稿画面の下書き・E2E（画面の操作）で同じ表を使う。
 *
 * - `actions` は testHelpers の記法（額は bb の to）。ボードは `BOARD` の先頭から、到達したストリート
 *   （ランアウトなら 5 枚）まで使う。
 * - `spots` は候補の表示（投稿画面の「Hero の Action」）と、そのスポットで回答者が塗るキー。
 */
import type { Pos, Street } from '../constants.ts';
import { ValidationError } from '../errors.ts';
import { mbbToBb } from '../money.ts';
import { replay } from '../poker/replay.ts';
import { spotView } from '../poker/spot.ts';
import type { HandSetup } from '../poker/state.ts';
import { acts, mbb } from '../poker/testHelpers.ts';
import type { Raw } from './postFixtures.ts';

export const BOARD = ['Kh', '8d', '3c', '2s', '9h'] as const;
export const HERO_CARDS = ['Ad', 'Kd'] as const;

export type AllinCase = {
  name: string;
  /** 座っている席のスタック（bb）。省略は 6 人・全員 100bb */
  stacks?: Partial<Record<Pos, number>>;
  hero: Pos;
  fmt?: 'cash' | 'mtt';
  ante?: number;
  actions: Partial<Record<Street, string>>;
  /** 候補の表示とキー（`fold,call,s1` など） */
  spots: [label: string, keys: string][];
  /** 投稿画面が受け付けない Action の添字（Preflop で All-in になる。E2E はここで止まることを確かめる） */
  refusedAt?: number;
};

const SIX: Record<string, number> = { UTG: 100, HJ: 100, CO: 100, BTN: 100, SB: 100, BB: 100 };
/** BTN のオープンに BB がコール（ポット 5.5、両者 97.5 残り） */
const SRP = 'UTG..CO f, BTN r2.5, SB f, BB c';
/** CO のオープンに BTN と BB がコール（ポット 8） */
const MW = 'UTG f, HJ f, CO r2.5, BTN c, SB f, BB c';

export const ALLIN_CASES: AllinCase[] = [
  {
    name: 'River で Hero が All-in、Call される',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB x, BTN b97.5, BB c' },
    spots: [['Flop / BTN Check', 'check,s1'], ['Turn / BTN Check', 'check,s1'], ['River / BTN Bet 97.5', 'check,s1']],
  },
  {
    name: 'River で Hero が All-in、Fold される',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB x, BTN b97.5, BB f' },
    spots: [['Flop / BTN Check', 'check,s1'], ['Turn / BTN Check', 'check,s1'], ['River / BTN Bet 97.5', 'check,s1']],
  },
  {
    name: 'River で相手の All-in に Hero が Call',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB b97.5, BTN c' },
    spots: [['Flop / BTN Check', 'check,s1'], ['Turn / BTN Check', 'check,s1'], ['River / BTN Call', 'fold,call']],
  },
  {
    name: 'River で相手の All-in に Hero が Fold',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB b97.5, BTN f' },
    spots: [['Flop / BTN Check', 'check,s1'], ['Turn / BTN Check', 'check,s1'], ['River / BTN Fold', 'fold,call']],
  },
  {
    name: 'Turn で相手の All-in に Hero が Call（River はランアウト）',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN x', turn: 'BB b97.5, BTN c' },
    spots: [['Flop / BTN Check', 'check,s1'], ['Turn / BTN Call', 'fold,call']],
  },
  {
    name: 'Turn で Hero が All-in',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN b1.8, BB c', turn: 'BB x, BTN b95.7, BB c' },
    spots: [['Flop / BTN Bet 1.8', 'check,s1'], ['Turn / BTN Bet 95.7', 'check,s1']],
  },
  {
    name: 'Flop で Hero が All-in',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN b97.5, BB c' },
    spots: [['Flop / BTN Bet 97.5', 'check,s1']],
  },
  {
    name: 'Flop で相手が Check-raise の All-in、Hero が Call',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN b3, BB r97.5, BTN c' },
    spots: [['Flop / BTN Bet 3', 'check,s1'], ['Flop / BTN Call', 'fold,call']],
  },
  {
    name: 'Flop で相手の Raise に Hero が All-in の Raise',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN b3, BB r10, BTN r97.5, BB c' },
    spots: [['Flop / BTN Bet 3', 'check,s1'], ['Flop / BTN Raise 97.5', 'fold,call,s1']],
  },
  {
    name: 'Preflop の All-in（Flop 以降に Hero の手番が無いので候補なし）',
    hero: 'BTN',
    actions: { pf: 'UTG..CO f, BTN r2.5, SB f, BB r11, BTN r100, BB c' },
    spots: [],
    refusedAt: 6,
  },
  {
    name: '短い UTG（10bb）の Preflop の All-in に Hero と BB が Call、Flop 以降を続ける（相手の Preflop の All-in も候補なし）',
    hero: 'BTN',
    stacks: { ...SIX, UTG: 10 },
    actions: { pf: 'UTG r10, HJ..CO f, BTN c, SB f, BB c', flop: 'BB x, BTN b5, BB f' },
    spots: [],
    refusedAt: 0,
  },
  {
    name: '短い相手（30bb）が Turn で All-in、Hero が Call（実効 30）',
    hero: 'BTN',
    stacks: { ...SIX, BB: 30 },
    actions: { pf: SRP, flop: 'BB x, BTN b1.8, BB c', turn: 'BB b25.7, BTN c' },
    spots: [['Flop / BTN Bet 1.8', 'check,s1'], ['Turn / BTN Call', 'fold,call']],
  },
  {
    name: '短い Hero（25bb）が Flop のベットに All-in の Raise',
    hero: 'BTN',
    stacks: { ...SIX, BTN: 25 },
    actions: { pf: SRP, flop: 'BB b4, BTN r22.5, BB c' },
    spots: [['Flop / BTN Raise 22.5', 'fold,call,s1']],
  },
  {
    name: '短い Hero（40bb）が相手の大きい All-in に足りない額で Call',
    hero: 'BTN',
    stacks: { ...SIX, BTN: 40 },
    actions: { pf: SRP, flop: 'BB b97.5, BTN c' },
    spots: [['Flop / BTN Call', 'fold,call']],
  },
  {
    name: '3 人: CO の All-in に Hero が Call、BB は Fold',
    hero: 'BTN',
    actions: { pf: MW, flop: 'BB x, CO b97.5, BTN c, BB f' },
    spots: [['Flop / BTN Call', 'fold,call']],
  },
  {
    name: '3 人: 短い CO の All-in の後も Hero と BB が続ける（サイドポット）',
    hero: 'BTN',
    stacks: { ...SIX, CO: 20 },
    actions: { pf: MW, flop: 'BB x, CO b17.5, BTN c, BB c', turn: 'BB x, BTN b20, BB c', river: 'BB x, BTN b60, BB f' },
    spots: [['Flop / BTN Call', 'fold,call,s1'], ['Turn / BTN Bet 20', 'check,s1'], ['River / BTN Bet 60', 'check,s1']],
  },
  {
    name: '3 人: 短い BB の All-in に CO と Hero が Call、Turn で Hero が Bet',
    hero: 'BTN',
    stacks: { ...SIX, BB: 12 },
    actions: { pf: MW, flop: 'BB b9.5, CO c, BTN c', turn: 'CO x, BTN b10, CO f' },
    spots: [['Flop / BTN Call', 'fold,call,s1'], ['Turn / BTN Bet 10', 'check,s1']],
  },
  {
    name: 'Hero が BB: River の All-in に Call',
    hero: 'BB',
    actions: { pf: SRP, flop: 'BB x, BTN b1.8, BB c', turn: 'BB x, BTN x', river: 'BB x, BTN b95.7, BB c' },
    spots: [
      ['Flop / BB Check', 'check,s1'],
      ['Flop / BB Call', 'fold,call,s1'],
      ['Turn / BB Check', 'check,s1'],
      ['River / BB Check', 'check,s1'],
      ['River / BB Call', 'fold,call'],
    ],
  },
  {
    name: 'Hero が BB: River で Check-raise の All-in',
    hero: 'BB',
    actions: { pf: SRP, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB x, BTN b5, BB r97.5, BTN f' },
    spots: [
      ['Flop / BB Check', 'check,s1'],
      ['Turn / BB Check', 'check,s1'],
      ['River / BB Check', 'check,s1'],
      ['River / BB Raise 97.5', 'fold,call,s1'],
    ],
  },
  {
    name: 'River で Hero の Bet に Check-raise の All-in、Hero が Call',
    hero: 'BTN',
    actions: { pf: SRP, flop: 'BB x, BTN x', turn: 'BB x, BTN x', river: 'BB x, BTN b5, BB r97.5, BTN c' },
    spots: [
      ['Flop / BTN Check', 'check,s1'],
      ['Turn / BTN Check', 'check,s1'],
      ['River / BTN Bet 5', 'check,s1'],
      ['River / BTN Call', 'fold,call'],
    ],
  },
  {
    name: 'Heads-up: Turn で Hero が All-in',
    hero: 'BTN',
    stacks: { BTN: 100, BB: 100 },
    actions: { pf: 'BTN r2.5, BB c', flop: 'BB x, BTN b2, BB c', turn: 'BB x, BTN b95.5, BB c' },
    spots: [['Flop / BTN Bet 2', 'check,s1'], ['Turn / BTN Bet 95.5', 'check,s1']],
  },
  {
    name: 'MTT（Ante 0.1、全員 30bb）: SB の Hero が Flop で All-in',
    hero: 'SB',
    fmt: 'mtt',
    ante: 0.1,
    stacks: { UTG: 30, HJ: 30, CO: 30, BTN: 30, SB: 30, BB: 30 },
    actions: { pf: 'UTG..BTN f, SB r3, BB c', flop: 'SB b26.9, BB c' },
    spots: [['Flop / SB Bet 26.9', 'check,s1']],
  },
  {
    name: '3 人: 短い Hero（30bb）が Flop で All-in、残る 2 人が River まで続ける',
    hero: 'BTN',
    stacks: { ...SIX, BTN: 30 },
    actions: { pf: MW, flop: 'BB x, CO x, BTN b27.5, BB c, CO c', turn: 'BB x, CO x', river: 'BB x, CO x' },
    spots: [['Flop / BTN Bet 27.5', 'check,s1']],
  },
];

/** 見本の設定（HandSetup。額は mbb）。 */
export function setupOf(c: AllinCase): HandSetup {
  const stacks = c.stacks ?? SIX;
  const s = {} as HandSetup['stacks'];
  for (const p of ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const) s[p] = stacks[p] === undefined ? 0 : mbb(stacks[p]);
  return { sb: mbb(0.5), bb: mbb(1), ante: mbb(c.ante ?? 0), stacks: s };
}

/** 見本のボード（到達したストリートまで。ランアウトなら 5 枚）。 */
export function boardOf(c: AllinCase): string[] {
  const setup = setupOf(c);
  const actions = acts(c.actions);
  for (const n of [0, 3, 4, 5]) {
    try {
      replay(setup, actions, n);
      return BOARD.slice(0, n);
    } catch (e) {
      if (!(e instanceof ValidationError) || e.code !== 'board_mismatch') throw e;
    }
  }
  throw new Error(`ボードの枚数が決まらない: ${c.name}`);
}

/** 投稿のタイトル（見本の名前の先頭 40 文字） */
export function allinTitle(c: AllinCase): string {
  return [...c.name].slice(0, 40).join('').trim();
}

/** ハンドだけの本文（スポット・派生メタなし。03 章 §3.1 の形） */
export function allinHand(c: AllinCase): Raw {
  return {
    title: allinTitle(c),
    fmt: c.fmt ?? 'cash',
    sb: 0.5,
    bb: 1,
    ante: c.ante ?? 0,
    rake: (c.fmt ?? 'cash') === 'cash' ? 5 : null,
    stacks: c.stacks ?? SIX,
    hero: c.hero,
    hero_cards: [...HERO_CARDS],
    known_cards: {},
    board: boardOf(c),
    actions: acts(c.actions).map((a) => (a.to === undefined ? { ...a } : { ...a, to: mbbToBb(a.to) })),
  };
}

/** スポット `spotIndex` の投稿の本文（派生メタはクライアントと同じく spotView で求める）。 */
export function allinRaw(c: AllinCase, spotIndex: number): Raw {
  const d = spotView(setupOf(c), acts(c.actions), c.hero, spotIndex).derived;
  const bb = (v: number | null): number | null => (v === null ? null : mbbToBb(v));
  return {
    ...allinHand(c),
    spot_index: spotIndex,
    derived: {
      street: d.street,
      keys: d.keys,
      s1_label: d.s1Label,
      min_to: bb(d.minTo),
      max_to: bb(d.maxTo),
      pot_base: mbbToBb(d.potBase),
      effective_stack: mbbToBb(d.effectiveStack),
      stop_index: d.stopIndex,
    },
  };
}
