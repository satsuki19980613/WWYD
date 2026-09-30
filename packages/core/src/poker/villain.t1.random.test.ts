/**
 * T1-07 ランダムなハンド（種を決めた擬似乱数。`release.tb.gen.ts` の Rng・playRandomHand を使う）:
 * 落ちない・候補の Street と Action の整合・候補から作った Spot Read が verifyReads を通る・前の Action だけで決まる・
 * 独立に書いた参照（18 章 §10.3 を Street ごとに書き直したもの）と一致する。
 */
import { describe, expect, it, vi } from 'vitest';
import { POSITIONS, type Pos, type Street } from '../constants.ts';
import { validateReads, verifyReads, type ReadEntry } from '../post/reads.ts';
import {
  AGGRESSIVE_ACTIONS,
  classifyActions,
  isCheckRaise,
  leansOf,
  readCandidates,
  sizesOf,
  STREET_ACTIONS,
  villainSeats,
  type ReadCandidate,
} from './readActions.ts';
import { runActions } from './replay.ts';
import { spotCandidates } from './spot.ts';
import { ORDER_POST, type Action, type HandSetup } from './state.ts';
import { Rng, playRandomHand, randomSetup } from './release.tb.gen.ts';

vi.setConfig({ testTimeout: 300_000 });

const HANDS = 12_000;

function hand(seed: number): { setup: HandSetup; actions: Action[] } {
  const rng = new Rng(seed);
  const setup = randomSetup(rng);
  // Preflop の Fold を少なめにして Flop 以降まで進めやすくする
  const h = playRandomHand(rng, setup, { pfFold: 0.04 + rng.next() * 0.12, allinP: rng.chance(0.6) ? 0.02 : 0.15 });
  return { setup: h.setup, actions: h.actions };
}

/** 独立に書いた参照: Street ごとに Action の列を見て決める。戻り値は `action|size|xr` の文字列か null */
function reference(setup: HandSetup, actions: readonly Action[]): (string | null)[] {
  const states = runActions(setup, actions);
  const total0 = POSITIONS.reduce((s, p) => s + setup.stacks[p], 0);
  const out: (string | null)[] = actions.map(() => null);
  const idx = (st: Street): number[] => actions.flatMap((a, i) => (a.street === st ? [i] : []));

  // ---- Preflop ----
  const pf = idx('pf');
  const raiseIdx = pf.filter((i) => actions[i]?.type === 'raise');
  const r1 = raiseIdx[0];
  const r2 = raiseIdx[1];
  const r3 = raiseIdx[2];
  const steal =
    r1 !== undefined && ['CO', 'BTN', 'SB'].includes(actions[r1]?.pos as string) && pf.filter((i) => i < r1).every((i) => actions[i]?.type === 'fold');
  for (const i of pf) {
    const a = actions[i] as Action;
    const nRaisesBefore = raiseIdx.filter((r) => r < i).length;
    if (a.type === 'call' && nRaisesBefore === 0 && a.pos !== 'BB') out[i] = 'limp||0';
    else if (a.type === 'raise') {
      if (i === r2) {
        const callsBetween = pf.some((j) => r1 !== undefined && j > r1 && j < i && actions[j]?.type === 'call');
        out[i] = `${callsBetween ? 'squeeze' : '3bet'}||0`;
      } else if (i === r3) out[i] = '4bet||0';
    } else if (a.type === 'fold') {
      if (nRaisesBefore === 2 && r1 !== undefined && a.pos === actions[r1]?.pos) out[i] = 'fold_3bet||0';
      else if (nRaisesBefore === 3 && r2 !== undefined && a.pos === actions[r2]?.pos) out[i] = 'fold_4bet||0';
      else if (
        nRaisesBefore === 1 &&
        steal &&
        r1 !== undefined &&
        // Steal に Call が入ったら Fold to Steal にしない（V-002）
        !pf.some((j) => j > r1 && j < i && actions[j]?.type === 'call') &&
        (a.pos === 'SB' || a.pos === 'BB') &&
        a.pos !== actions[r1]?.pos
      )
        out[i] = 'fold_steal||0';
    }
  }

  // ---- Postflop ----
  for (const st of ['flop', 'turn', 'river'] as const) {
    const ids = idx(st);
    if (ids.length === 0) continue;
    const first = ids[0] as number;
    const before = actions.slice(0, first);
    // Aggressor: それまでに最後に Bet / Raise した席
    const lastBetIdx = (() => {
      for (let k = before.length - 1; k >= 0; k--) if (before[k]?.type === 'bet' || before[k]?.type === 'raise') return k;
      return -1;
    })();
    const agg = lastBetIdx >= 0 ? (before[lastBetIdx] as Action).pos : null;
    // 前の Street（Flop は Preflop）に Bet / Raise があったか
    const prevSt: Street = st === 'flop' ? 'pf' : st === 'turn' ? 'flop' : 'turn';
    const prevHadBet = actions.some((a) => a.street === prevSt && (a.type === 'bet' || a.type === 'raise'));

    let chips = 0;
    let curBet = 0;
    const own: Partial<Record<Pos, number>> = {};
    const checkedBy = new Set<Pos>();
    const actedBy = new Set<Pos>();
    let lastKind: 'cbet' | 'barrel' | 'bet' | 'raise' | null = null;
    let firstBetDone = false;
    for (const i of ids) {
      const a = actions[i] as Action;
      const s = states[i]!;
      chips = total0 - POSITIONS.reduce((sum, p) => sum + s.stacks[p], 0);
      const size = (to: number): string => {
        const call = curBet - (own[a.pos] ?? 0);
        const base = chips + call;
        const extra = to - curBet;
        return extra * 2 < base ? 'small' : extra <= base ? 'big' : 'overbet';
      };
      if (a.type === 'check') checkedBy.add(a.pos);
      else if (a.type === 'bet') {
        const sz = size(a.to as number);
        let name: string | null = null;
        if (!firstBetDone) {
          if (agg !== null && a.pos === agg) name = st === 'flop' ? 'cbet' : st === 'turn' && !prevHadBet ? 'delayed_cbet' : 'barrel';
          // All-in の Aggressor への Bet は Donk・Probe にしない（V-003）
          else if (agg !== null && s.stacks[agg] !== 0 && !actedBy.has(agg) && ORDER_POST.indexOf(a.pos) < ORDER_POST.indexOf(agg)) name = prevHadBet ? 'donk' : 'probe';
          else if (checkedBy.size > 0) name = 'bet_vs_check';
        }
        firstBetDone = true;
        if (name) out[i] = `${name}|${sz}|0`;
        lastKind = name === 'cbet' ? 'cbet' : name === 'barrel' || name === 'delayed_cbet' ? 'barrel' : 'bet';
        curBet = a.to as number;
        own[a.pos] = curBet;
      } else if (a.type === 'raise') {
        out[i] = `raise|${size(a.to as number)}|${checkedBy.has(a.pos) ? 1 : 0}`;
        lastKind = 'raise';
        curBet = a.to as number;
        own[a.pos] = curBet;
      } else if (a.type === 'call') {
        own[a.pos] = curBet;
      } else if (a.type === 'fold' && lastKind) {
        out[i] = `${{ cbet: 'fold_cbet', barrel: 'fold_barrel', bet: 'fold_bet', raise: 'fold_raise' }[lastKind]}||0`;
      }
      actedBy.add(a.pos);
    }
  }
  return out;
}

const key = (c: ReadCandidate | null): string | null => (c ? `${c.action}|${c.size ?? ''}|${c.checkRaise ? 1 : 0}` : null);

describe('T1-07 ランダムなハンド', () => {
  it(`${HANDS} ハンド: classifyActions・villainSeats・readCandidates が落ちない。候補の整合・参照との一致・前の Action だけで決まる`, () => {
    const stat = { hands: 0, actions: 0, cands: 0, withPostflop: 0, spotReadsBuilt: 0, xr: 0, byAction: {} as Record<string, number>, byCount: {} as Record<number, number> };
    for (let seed = 1; seed <= HANDS; seed++) {
      const { setup, actions } = hand(seed * 7 + 3);
      const tag = `[seed=${seed * 7 + 3}]`;
      stat.hands++;
      stat.actions += actions.length;
      const n = POSITIONS.filter((p) => setup.stacks[p] > 0).length;
      stat.byCount[n] = (stat.byCount[n] ?? 0) + 1;

      const cls = classifyActions(setup, actions);
      expect(cls.length, tag).toBe(actions.length);

      // 整合: 席・Street・Action・Size の形
      cls.forEach((c, i) => {
        if (!c) return;
        const a = actions[i] as Action;
        expect(c.index, tag).toBe(i);
        expect(c.pos, tag).toBe(a.pos);
        expect(c.street, `${tag} i=${i}`).toBe(a.street);
        expect(STREET_ACTIONS[c.street].includes(c.action), `${tag} i=${i} ${c.street} ${c.action}`).toBe(true);
        if (c.street === 'pf') expect(c.size, tag).toBeNull();
        if (c.size !== null) {
          expect(AGGRESSIVE_ACTIONS.includes(c.action), tag).toBe(true);
          expect(sizesOf(c.street).includes(c.size), tag).toBe(true);
          expect(a.type === 'bet' || a.type === 'raise', tag).toBe(true);
        } else if (c.street !== 'pf') {
          expect(AGGRESSIVE_ACTIONS.includes(c.action), `${tag} i=${i} Postflop の Bet / Raise 系は Size が必ず付く`).toBe(false);
        }
        if (c.checkRaise) {
          expect(c.action, tag).toBe('raise');
          stat.xr++;
        }
        stat.cands++;
        stat.byAction[c.action] = (stat.byAction[c.action] ?? 0) + 1;
      });

      // 参照との一致
      expect(cls.map(key), tag).toEqual(reference(setup, actions));

      // 前の Action だけで決まる（ランダムな切れ目で 2 か所）
      const rng = new Rng(seed);
      for (let t = 0; t < 2; t++) {
        const k = rng.int(0, actions.length);
        expect(classifyActions(setup, actions.slice(0, k)).map(key), `${tag} k=${k}`).toEqual(cls.slice(0, k).map(key));
      }

      // 登録できる席が落ちない。Hero は除く。候補の席は必ず登録できる席
      const hasPost = actions.some((a) => a.street !== 'pf');
      if (hasPost) stat.withPostflop++;
      const heroes = [...new Set(actions.filter((a) => a.street !== 'pf').map((a) => a.pos))];
      for (const hero of heroes.slice(0, 2)) {
        const seats = villainSeats(setup, actions, hero);
        expect(seats, tag).not.toContain(hero);
        for (const sc of spotCandidates(actions, hero).slice(0, 3)) {
          const cands = readCandidates(setup, actions, hero, sc.index);
          // 候補は判断地点より前・Hero 以外・classifyActions の先頭部分と同じ
          expect(cands, `${tag} hero=${hero} spot=${sc.index}`).toEqual(cls.slice(0, sc.index).filter((c): c is ReadCandidate => c !== null && c.pos !== hero));
          const readSeats = POSITIONS.filter((p) => setup.stacks[p] > 0);
          // 席ごとに Spot Read を 1 つ作る（候補のうち 1 つ。全 Lean を試す）
          const bySeat = new Map<Pos, ReadCandidate[]>();
          for (const c of cands) bySeat.set(c.pos, [...(bySeat.get(c.pos) ?? []), c]);
          for (const [pos, cs] of bySeat) {
            expect(seats, `${tag} 候補の席 ${pos} は登録できる席`).toContain(pos);
            for (const c of cs) {
              for (const lean of leansOf(c.action)) {
                for (const strong of [false, true]) {
                  const e: ReadEntry = { scope: 'spot', street: c.street, action: c.action, texture: null, runout: null, size: c.size, lean, strong };
                  const reads = validateReads({ [pos]: { reads: [e] } }, readSeats, hero);
                  expect(Object.keys(reads), tag).toEqual([pos]);
                  verifyReads(reads, setup, actions, hero, sc.index);
                  stat.spotReadsBuilt++;
                }
              }
              // check-raise の表示と一致
              if (c.action === 'raise') expect(isCheckRaise('spot', c.street, c.pos, hero, actions.slice(0, sc.index)), `${tag} xr`).toBe(c.checkRaise);
            }
          }
        }
      }
    }
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('T1-07 統計', JSON.stringify(stat));
    expect(stat.hands).toBe(HANDS);
    expect(stat.withPostflop).toBeGreaterThan(3000);
    expect(stat.spotReadsBuilt).toBeGreaterThan(5000);
    for (const n of [2, 3, 4, 5, 6]) expect(stat.byCount[n] ?? 0).toBeGreaterThan(500);
    // どの Action もそれなりの数で出ている（生成の偏りの確認）
    for (const ac of ['limp', '3bet', 'squeeze', '4bet', 'fold_3bet', 'fold_4bet', 'fold_steal', 'cbet', 'fold_cbet', 'barrel', 'fold_barrel', 'delayed_cbet', 'donk', 'probe', 'bet_vs_check', 'raise', 'fold_bet', 'fold_raise']) {
      expect(stat.byAction[ac] ?? 0, ac).toBeGreaterThan(50);
    }
  });
});
