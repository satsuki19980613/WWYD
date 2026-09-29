/**
 * リリース前の総合テスト B-01b: 小さなスタックの全探索（深さ優先）。
 * 各ノードで、core（state.ts）と別実装の Oracle（release.tb.gen.ts）の状態・合法手・手番・終了の判定を突き合わせる。
 * 額は「最小・最小+1mbb・最小+0.5bb・最大（All-in）」の 4 通りで枝分かれさせる。
 */
import { describe, expect, it } from 'vitest';
import { POSITIONS } from '../constants.ts';
import { Oracle, diffState } from './release.tb.gen.ts';
import { advance, apply, initialState, legal, status, type HandSetup, type State } from './state.ts';
import { setup } from './testHelpers.ts';

/** Oracle の複製（深さ優先の分岐用） */
function clone(o: Oracle): Oracle {
  const c = Object.create(Oracle.prototype) as Oracle;
  const p = {} as Oracle['p'];
  for (const pos of POSITIONS) p[pos] = { ...o.p[pos] };
  Object.assign(c, { p, street: o.street, pot: o.pot, cur: o.cur, minRaise: o.minRaise, fullRaises: o.fullRaises, pending: [...o.pending], bb: o.bb });
  return c;
}

type Cfg = { name: string; setup: HandSetup; cap: number };
const cfgs: Cfg[] = [
  { name: '2 人 3bb/2bb', setup: setup({ BTN: 3, BB: 2, UTG: 0, HJ: 0, CO: 0, SB: 0 }), cap: 60_000 },
  { name: '3 人 4/3/2bb ante 0.25', setup: setup({ BTN: 4, SB: 3, BB: 2, UTG: 0, HJ: 0, CO: 0 }, { ante: 0.25 }), cap: 80_000 },
  { name: '3 人 5/5/5bb', setup: setup({ BTN: 5, SB: 5, BB: 5, UTG: 0, HJ: 0, CO: 0 }), cap: 80_000 },
  { name: '4 人 3/2.5/2/1.5bb', setup: setup({ CO: 3, BTN: 2.5, SB: 2, BB: 1.5, UTG: 0, HJ: 0 }), cap: 80_000 },
  { name: '3 人 SB 0.3・BB 短い', setup: setup({ BTN: 3, SB: 3, BB: 0.6, UTG: 0, HJ: 0, CO: 0 }, { sb: 0.3 }), cap: 40_000 },
  { name: '2 人 6bb/6bb（深め）', setup: setup({ BTN: 6, BB: 6, UTG: 0, HJ: 0, CO: 0, SB: 0 }), cap: 100_000 },
  { name: '5 人 2〜4bb', setup: setup({ HJ: 4, CO: 3, BTN: 2, SB: 3, BB: 2, UTG: 0 }), cap: 80_000 },
];

describe('B-01b 小さなスタックの全探索（core と Oracle を全ノードで突き合わせる）', () => {
  for (const cfg of cfgs) {
    it(`${cfg.name}: 到達できる全局面（上限 ${cfg.cap} ノード）で状態・合法手が一致する`, () => {
      let nodes = 0;
      const terminals = { over: 0, showdown: 0, runout: 0 };
      const visit = (s: State, o: Oracle, depth: number): void => {
        if (nodes >= cfg.cap) return;
        nodes++;
        const st = status(s);
        const ost = o.status();
        if (st.kind !== ost.kind) throw new Error(`${cfg.name}: status ${st.kind} != ${ost.kind} @${depth}`);
        if (st.kind === 'over' || st.kind === 'runout' || st.kind === 'showdown') {
          terminals[st.kind]++;
          return;
        }
        if (st.kind === 'streetEnd') {
          const s2 = advance(s);
          const o2 = clone(o);
          o2.advance();
          const d = diffState(s2, o2);
          if (d) throw new Error(`${cfg.name}: advance ${d}`);
          visit(s2, o2, depth);
          return;
        }
        if (ost.kind !== 'act' || ost.pos !== st.pos) throw new Error(`${cfg.name}: 手番 ${st.pos}`);
        const lg = legal(s, st.pos);
        const olg = o.legal(st.pos);
        const a = JSON.stringify(lg);
        const b = JSON.stringify(olg);
        if (a !== b) throw new Error(`${cfg.name}: legal ${a} != ${b} @${depth}`);
        const opts: { type: 'fold' | 'check' | 'call' | 'bet' | 'raise'; to?: number }[] = [];
        if (olg.fold) opts.push({ type: 'fold' });
        if (olg.check) opts.push({ type: 'check' });
        if (olg.call !== null) opts.push({ type: 'call' });
        for (const [t, r] of [['bet', olg.bet], ['raise', olg.raise]] as const) {
          if (!r) continue;
          const tos = new Set([r.min, r.max, Math.min(r.max, r.min + 500), Math.min(r.max, r.min + 1)]);
          for (const to of tos) opts.push({ type: t, to });
        }
        for (const op of opts) {
          const action = { street: s.street, pos: st.pos, ...op };
          const s2 = apply(s, action, depth);
          const o2 = clone(o);
          o2.apply(action);
          const d = diffState(s2, o2);
          if (d) throw new Error(`${cfg.name}: apply ${JSON.stringify(action)} ${d}`);
          visit(s2, o2, depth + 1);
        }
      };
      visit(initialState(cfg.setup), new Oracle(cfg.setup), 0);
      expect(nodes).toBeGreaterThan(50);
      expect(terminals.over + terminals.showdown + terminals.runout).toBeGreaterThan(10);
    }, 120_000);
  }
});
