/**
 * テスト用の記法（詳細仕様 04 章 §10 の表記をそのまま書けるようにする）。本番コードからは使わない。
 * - 設定: `setup({ BB: 3.1 }, { ante: 0.125 })`（既定 S100 = SB 0.5 / BB 1 / アンティ 0 / 全員 100bb。金額は bb）
 * - アクション: `acts({ pf: 'UTG f, HJ f, BTN r2.5', flop: 'BB x, BTN b3' })`（f/x/c/b/r、数字は to の bb）
 *   `UTG..CO f` は UTG〜CO の全員が f（プリフロップの順）。
 */
import { POSITIONS, type Pos, type Street } from '../constants.ts';
import { bbToMbb, type Mbb } from '../money.ts';
import { ORDER_POST, type Action, type ActionType, type HandSetup } from './state.ts';

export function mbb(bb: number): Mbb {
  const v = bbToMbb(bb);
  if (v === null) throw new Error(`金額が不正: ${bb}`);
  return v;
}

export function setup(
  stacks: Partial<Record<Pos, number>> = {},
  opts: { sb?: number; bb?: number; ante?: number; all?: number } = {},
): HandSetup {
  const all = opts.all ?? 100;
  const s = {} as Record<Pos, Mbb>;
  for (const p of POSITIONS) s[p] = mbb(stacks[p] ?? all);
  return { sb: mbb(opts.sb ?? 0.5), bb: mbb(opts.bb ?? 1), ante: mbb(opts.ante ?? 0), stacks: s };
}

const TYPE: Record<string, ActionType> = { f: 'fold', x: 'check', c: 'call', b: 'bet', r: 'raise' };

function expand(from: Pos, to: Pos, street: Street): Pos[] {
  const order = street === 'pf' ? POSITIONS : ORDER_POST;
  const i = order.indexOf(from);
  const j = order.indexOf(to);
  return order.slice(i, j + 1) as Pos[];
}

export function acts(spec: Partial<Record<Street, string>>): Action[] {
  const out: Action[] = [];
  for (const street of ['pf', 'flop', 'turn', 'river'] as const) {
    const line = spec[street];
    if (!line) continue;
    for (const tok of line.split(',').map((t) => t.trim()).filter(Boolean)) {
      const m = /^([A-Z]+)(?:\.\.([A-Z]+))? ([fxcbr])([\d.]+)?$/.exec(tok);
      if (!m) throw new Error(`記法が不正: ${tok}`);
      const seats = m[2] ? expand(m[1] as Pos, m[2] as Pos, street) : [m[1] as Pos];
      for (const pos of seats) {
        const a: Action = { street, pos, type: TYPE[m[3] as string] as ActionType };
        if (m[4] !== undefined) a.to = mbb(Number(m[4]));
        out.push(a);
      }
    }
  }
  return out;
}
