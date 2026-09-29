/**
 * リリース前の総合テスト B-06c: 投稿画面の下書きの操作（NewPostScreen が呼ぶ draft.ts の関数）を、
 * ランダムな順番で何百回も当てる。どの状態でも、画面が出す下書き（settleActions を通したもの）は再生でき、
 * Spot の選択は候補にあり、投稿の検査（buildSubmission）は例外を出さず、通った本文はサーバーの判定も通る。
 * 種を決めた擬似乱数（依存なし）。
 */
import { PLAYER_COUNTS, POSITIONS, SEATS_BY_COUNT, validateInput, verifyPost, type Action, type Card, type PlayerCount } from '@wwyd/core';
import { describe, expect, it, vi } from 'vitest';
import { Rng, randomCards } from '../../../core/src/poker/release.tb.gen.ts';
import {
  addAction,
  addActions,
  addBoardCard,
  buildSubmission,
  candidates,
  clearActions,
  emptyDraft,
  makesPreflopAllin,
  normalizeSpot,
  parseSettings,
  phaseOf,
  removeBoardFrom,
  selectSpot,
  setPlayers,
  settleActions,
  skipTargets,
  truncateActions,
  undoAction,
  usedCards,
  type Draft,
} from './draft.ts';

// 乱数で多くのハンドを回す試験がある。CI の遅い環境でも既定の 5 秒で打ち切らない（2026-09-30 CI で 5.09 秒かかり落ちた）
vi.setConfig({ testTimeout: 60_000 });

/** 画面と同じ順序の操作。返り値が null なら「その操作は今はできない」 */
function step(raw: Draft, rng: Rng): { name: string; next: Draft } | null {
  const d = settleActions(raw);
  const { setup } = parseSettings(d);
  const update = (f: (x: Draft) => Draft): Draft => f(settleActions(raw));
  const ph = phaseOf(setup, d.actions, d.board);
  // 入力の進行（Action・ボード）を多めに、取り消しや設定の変更を少なめに
  const choice = rng.chance(0.8) ? rng.pick([0, 1, 2, 3, 4, 7]) : rng.int(5, 13);
  switch (choice) {
    case 0:
    case 1:
    case 2:
    case 3: {
      if (ph.kind !== 'act') return null;
      const lg = ph.legal;
      const types: Action['type'][] = [];
      if (lg.fold) types.push('fold');
      if (lg.check) types.push('check');
      if (lg.call !== null) types.push('call');
      if (lg.bet) types.push('bet');
      if (lg.raise) types.push('raise');
      // Fold は少なめに（Flop 以降まで進みやすくする）
      const noFold = types.filter((t) => t !== 'fold');
      const type = rng.pick(rng.chance(0.85) && noFold.length > 0 ? noFold : types);
      const a: Action = { street: ph.state.street, pos: ph.pos, type };
      if (type === 'bet' || type === 'raise') {
        const r = (type === 'bet' ? lg.bet : lg.raise) as { min: number; max: number };
        a.to = rng.chance(0.03) ? r.max : Math.min(r.max, r.min + rng.int(0, 3 * r.min));
      }
      if (makesPreflopAllin(d, [a])) return null; // 画面は受け付けない
      return { name: `add ${type}`, next: update((x) => addAction(x, a)) };
    }
    case 4: {
      if (ph.kind !== 'act') return null;
      const sk = skipTargets(ph.state, ph.pos, ph.legal);
      if (sk.targets.length === 0) return null;
      const t = rng.pick(sk.targets);
      if (makesPreflopAllin(d, t.actions)) return null;
      return { name: 'skip', next: update((x) => addActions(x, t.actions)) };
    }
    case 5:
      return { name: 'undo', next: update(undoAction) };
    case 6:
      return { name: 'truncate', next: update((x) => truncateActions(x, rng.int(0, Math.max(0, x.actions.length)))) };
    case 7: {
      if (ph.kind !== 'board') return null;
      let x = d;
      for (const c of randomCards(rng, ph.need - d.board.length, [...usedCards(d)])) x = addBoardCard(x, c as Card);
      return { name: 'board+', next: update(() => x) };
    }
    case 8:
      return d.board.length === 0 ? null : { name: 'board-', next: update((x) => removeBoardFrom(x, rng.int(0, x.board.length - 1))) };
    case 9:
      return { name: 'clear', next: update(clearActions) };
    case 10: {
      const cs = candidates(d);
      return cs.length === 0 ? null : { name: 'spot', next: update((x) => selectSpot(x, rng.pick(cs).index)) };
    }
    case 11: {
      const n = rng.pick(PLAYER_COUNTS) as PlayerCount;
      return { name: 'players', next: update((x) => setPlayers(x, n)) };
    }
    case 12: {
      const seats = d.players === null ? [] : SEATS_BY_COUNT[d.players];
      if (seats.length === 0) return null;
      const p = rng.pick(seats);
      const v = rng.pick(['1', '2', '3', '5', '20', '100', '250.5', '9999.999', '0.5', '']);
      // 入力欄の書き換えは patch（settleActions を通さない）
      return { name: `stack ${p}=${v}`, next: normalizeSpot({ ...raw, stacks: { ...raw.stacks, [p]: v } }) };
    }
    default: {
      const seats = d.players === null ? [] : SEATS_BY_COUNT[d.players];
      if (seats.length === 0) return null;
      return { name: 'hero', next: normalizeSpot({ ...raw, hero: rng.pick(seats) }) };
    }
  }
}

describe('B-06c 投稿画面の操作のランダムな列', () => {
  it('600 セッション × 60 操作: どの状態でも再生でき、Spot は候補にあり、投稿の検査が落ちず、通った本文はサーバーも通す', () => {
    const errs: Record<string, number> = {};
    const stat = { sessions: 0, ops: 0, done: 0, submittable: 0 };
    for (let i = 0; i < 600; i++) {
      const seed = 1_800_000 + i;
      const rng = new Rng(seed);
      let raw: Draft = { ...emptyDraft(), players: rng.pick(PLAYER_COUNTS) as PlayerCount, title: '試験' };
      // ハンドを入れる（Hero の 2 枚と、全員のカード）
      const seats = SEATS_BY_COUNT[raw.players as PlayerCount];
      raw = { ...raw, hero: rng.pick(seats) };
      const cards = randomCards(rng, 12);
      const hands = { ...raw.hands };
      seats.forEach((p, k) => {
        hands[p] = `${cards[k * 2]}${cards[k * 2 + 1]}`;
      });
      raw = { ...raw, hands };
      // 残りのカードはボードに使わせない（ボードは used を避けて入れる）
      const trace: string[] = [];
      for (let k = 0; k < 60; k++) {
        const r = step(raw, rng);
        if (!r) continue;
        trace.push(r.name);
        raw = r.next;
        stat.ops++;
        const label = `seed=${seed} 操作=${trace.slice(-6).join(' > ')}`;
        const d = settleActions(raw);
        const { setup } = parseSettings(d);
        // 再生できる（画面が出す下書き）
        let ph;
        try {
          ph = phaseOf(setup, d.actions, d.board);
        } catch (e) {
          throw new Error(`${label}: phaseOf が例外 ${e instanceof Error ? e.message : String(e)}`);
        }
        expect(d.board.length, label).toBeLessThanOrEqual(5);
        // Spot は候補にあるか null
        if (d.spotIndex !== null) expect(candidates(d).some((c) => c.index === d.spotIndex), `${label} spot=${d.spotIndex}`).toBe(true);
        // 生の下書きの Spot も、外れた Action を指さない（保存・確定のときに困らない）
        if (raw.spotIndex !== null) expect(raw.spotIndex, `${label} raw spot`).toBeLessThan(Math.max(raw.actions.length, 1));
        if (ph.kind === 'done') {
          stat.done++;
          // 最後まで入れたら Spot を選ぶ（画面と同じ順序: settleActions を通してから選択）
          const cs = candidates(d);
          if (d.spotIndex === null && cs.length > 0 && rng.chance(0.7)) raw = selectSpot(settleActions(raw), rng.pick(cs).index);
        }
        const dd = settleActions(raw);
        // 投稿の検査は落ちない。通った本文はサーバーの判定も通る
        let s;
        try {
          s = buildSubmission(dd);
        } catch (e) {
          throw new Error(`${label}: buildSubmission が例外 ${e instanceof Error ? e.stack : String(e)}`);
        }
        if (!s.ok && ph.kind === 'done') for (const e of s.errors) errs[e] = (errs[e] ?? 0) + 1;
        if (s.ok) {
          stat.submittable++;
          expect(() => verifyPost(validateInput(JSON.parse(JSON.stringify(s.body)))), label).not.toThrow();
        }
        // 全席のカードは重複していない（入力の操作が重複を作らない）
        const all = POSITIONS.flatMap((p) => (d.hands[p].length === 4 ? [d.hands[p].slice(0, 2), d.hands[p].slice(2)] : [])).concat(d.board);
        expect(new Set(all).size, `${label} 重複`).toBe(all.length);
      }
      stat.sessions++;
    }
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-06c 統計', JSON.stringify(stat), JSON.stringify(errs));
    expect(stat.ops).toBeGreaterThan(10_000);
    expect(stat.done).toBeGreaterThan(300);
    expect(stat.submittable).toBeGreaterThan(100);
  }, 240_000);
});
