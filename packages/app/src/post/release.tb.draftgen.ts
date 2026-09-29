/**
 * リリース前の総合テスト（観点 B）の試験用の部品: ランダムなハンドから投稿の下書き（Draft）を作る。本番のコードからは使わない。
 */
import { POSITIONS, formatBb, spotCandidates, type PlayerCount, type Pos } from '@wwyd/core';
import { Rng, playRandomHand, randomCards, randomSetup, type Played } from '../../../core/src/poker/release.tb.gen.ts';
import { emptyDraft, type Draft } from './draft.ts';

export function postableSetup(rng: Rng) {
  const s = randomSetup(rng);
  if (rng.chance(0.75)) {
    // 深いスタックが中心（Preflop の All-in になりにくい）。ミリ単位の端数も混ぜる
    for (const p of POSITIONS) if (s.stacks[p] > 0) s.stacks[p] = rng.int(8, 250) * 1000 + (rng.chance(0.3) ? rng.int(0, 999) : 0);
    s.ante = rng.chance(0.6) ? 0 : rng.pick([125, 100, 500, 1]);
  }
  return s;
}

export function cardsStr(cs: readonly string[]): string {
  return cs.join('');
}

export type Built = { draft: Draft; played: Played; hero: Pos };

export function buildDraft(rng: Rng): Built {
  const setup = postableSetup(rng);
  const played = playRandomHand(rng, setup, { pfFold: 0.05 + rng.next() * 0.25, allinP: rng.chance(0.85) ? 0.01 : 0.18 });
  const seats = POSITIONS.filter((p) => setup.stacks[p] > 0);
  // Flop 以降に動いた席を Hero に選びやすくする
  const postflopActors = [...new Set(played.actions.filter((a) => a.street !== 'pf').map((a) => a.pos))];
  const hero = postflopActors.length > 0 && rng.chance(0.8) ? rng.pick(postflopActors) : rng.pick(seats);
  const board = randomCards(rng, 5);
  const boardN = played.boardCount;
  const used = new Set<string>(board.slice(0, boardN));
  const draft = emptyDraft();
  draft.fmt = rng.chance(0.75) ? 'cash' : 'mtt';
  draft.sb = formatBb(setup.sb);
  draft.ante = formatBb(setup.ante);
  draft.rake = draft.fmt === 'cash' && rng.chance(0.5) ? String(rng.int(0, 10000) / 100) : '';
  draft.players = seats.length as PlayerCount;
  for (const p of POSITIONS) draft.stacks[p] = setup.stacks[p] > 0 ? formatBb(setup.stacks[p]) : '100';
  draft.hero = hero;
  for (const p of seats) {
    if (p !== hero && !rng.chance(0.4)) continue;
    const cs = randomCards(rng, 2, [...used]);
    for (const c of cs) used.add(c);
    draft.hands[p] = cardsStr(cs);
  }
  draft.actions = played.actions.map((a) => ({ ...a }));
  draft.board = board.slice(0, boardN);
  const cand = spotCandidates(played.actions, hero).map((c) => c.index);
  draft.spotIndex = cand.length > 0 && rng.chance(0.93) ? rng.pick(cand) : rng.chance(0.5) ? null : rng.int(0, Math.max(0, played.actions.length));
  draft.title = rng.chance(0.9) ? `試験 ${rng.int(0, 99999)}` : ' t ';
  return { draft, played, hero };
}

