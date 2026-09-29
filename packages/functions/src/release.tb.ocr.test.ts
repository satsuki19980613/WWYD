/**
 * リリース前の総合テスト B-08: OCR の読み取り結果 → 投稿の下書き（ocrDraft）。
 *
 * `sample/pc`・`sample/sp` の正解データ（`*.expected.json`。個人の対戦画像から起こした読み取り結果の正解）を
 * 「読み取り結果」として ocrDraft に通し、次を確かめる。画像は読まない（文字認識の精度は `npm run ocr:accuracy` で測る）。
 *  - 投稿できないハンド（Preflop の All-in・Flop 以降に Hero の Action が無い）は、正しい理由ではじく
 *  - 投稿できるハンドは、反映すると最後まで再生でき、そのまま buildSubmission と create-post（サーバー）を通る
 *  - 判定は、core の Oracle（release.tb.gen.ts）で別に再生した結果と一致する
 *
 * sample のフォルダは環境変数 WWYD_SAMPLE_DIR（無ければカレントの `sample`）。無い環境（CI）では飛ばす。
 * 個人の画像・正解はコピーもコミットもしない（読むだけ）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { POSITIONS, spotCandidates, type Card, type Pos, type Street } from '@wwyd/core';
import type { OcrAction, OcrResult } from '@wwyd/ocr';
import { describe, expect, it, vi } from 'vitest';
import { Oracle } from '../../core/src/poker/release.tb.gen.ts';
import type { HandSetup } from '../../core/src/poker/state.ts';
import { buildSubmission, candidates, emptyDraft, NO_HERO_POSTFLOP, PREFLOP_ALLIN, type Draft } from '../../app/src/post/draft.ts';
import { evaluateReview, ocrPostability, reviewFromOcr } from '../../app/src/post/ocrDraft.ts';
import { createPostHandler, type CreatePostDeps } from './createPost/handler.ts';

const root = process.env.WWYD_SAMPLE_DIR ?? resolve(process.cwd(), 'sample');

type Expected = { hero: string; hands: Record<string, string[]>; board: string[]; actions: { street: string; pos: string; verb: string; amount: number | null }[] };
type Sample = { name: string; r: OcrResult };

function load(): Sample[] {
  const out: Sample[] = [];
  for (const sub of ['pc', 'sp']) {
    const dir = join(root, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.expected.json')).sort()) {
      const e = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Expected;
      const hands: OcrResult['hands'] = {};
      for (const p of POSITIONS) if (e.hands[p]?.length === 2) hands[p] = [e.hands[p]![0] as Card, e.hands[p]![1] as Card];
      out.push({
        name: `${sub}/${f.replace('.expected.json', '')}`,
        r: {
          hero: e.hero as Pos,
          hands,
          board: e.board as Card[],
          actions: e.actions.map((a) => ({ street: a.street as Street, pos: a.pos as Pos, verb: a.verb as OcrAction['verb'], amount: a.amount })),
          problems: [],
        },
      });
    }
  }
  return out;
}

const samples = load();

const SETUP: HandSetup = { sb: 500, bb: 1000, ante: 0, stacks: { UTG: 100_000, HJ: 100_000, CO: 100_000, BTN: 100_000, SB: 100_000, BB: 100_000 } };

type Indep = { replayed: number; pfAllin: boolean; heroPostflop: boolean; complete: boolean; boardCount: number; mismatchRows: number };

/** ocrDraft とは別に、Oracle で正解の Action を再生して判定する（全員 100bb・SB 0.5・BB 1・アンティなし = T4 の既定） */
function independent(r: OcrResult): Indep {
  const o = new Oracle(SETUP);
  let replayed = 0;
  let mismatchRows = 0;
  let pfAllin = false;
  let pfDone = false;
  let heroPostflop = false;
  const checkPf = (): void => {
    if (!pfDone) pfAllin = POSITIONS.some((p) => o.p[p].seated && o.p[p].stack === 0);
  };
  for (const a of r.actions) {
    if (a.street !== 'pf' && !pfDone) {
      checkPf();
      pfDone = true;
    }
    while (o.status().kind === 'streetEnd') o.advance();
    const st = o.status();
    if (st.kind !== 'act') break;
    const pos = st.pos;
    const lg = o.legal(pos);
    const pl = o.p[pos];
    const maxTo = pl.bet + pl.stack;
    if (a.pos !== pos || a.street !== o.street) mismatchRows++;
    const to = a.amount === null ? null : Math.round(a.amount * 1000);
    let action: { type: 'fold' | 'check' | 'call' | 'bet' | 'raise'; to?: number } | null = null;
    const within = (x: number | null, rg: { min: number; max: number } | null): x is number => x !== null && rg !== null && x >= rg.min && x <= rg.max;
    if (a.verb === 'fold' && lg.fold) action = { type: 'fold' };
    else if (a.verb === 'check' && lg.check) action = { type: 'check' };
    else if (a.verb === 'call' && lg.call !== null) action = { type: 'call' };
    else if (a.verb === 'bet' || a.verb === 'raise') {
      if (within(to, lg.bet)) action = { type: 'bet', to };
      else if (within(to, lg.raise)) action = { type: 'raise', to };
      else if (to !== null && lg.call !== null && to <= o.cur) action = { type: 'call' };
    } else if (a.verb === 'allin') {
      const t = to ?? maxTo;
      if (t <= maxTo) {
        if (within(t, lg.bet)) action = { type: 'bet', to: t };
        else if (within(t, lg.raise)) action = { type: 'raise', to: t };
        else if (lg.call !== null) action = { type: 'call' };
      }
    }
    if (!action) break;
    if (pos === r.hero && o.street !== 'pf') heroPostflop = true;
    o.apply({ street: o.street, pos, ...action });
    replayed++;
  }
  if (!pfDone) checkPf();
  const st = o.status();
  const complete = replayed === r.actions.length && (st.kind === 'over' || st.kind === 'showdown' || st.kind === 'runout');
  const boardCount = st.kind === 'over' ? { pf: 0, flop: 3, turn: 4, river: 5 }[o.street] : 5;
  return { replayed, pfAllin, heroPostflop, complete, boardCount, mismatchRows };
}

function makeServer() {
  const insertPost = vi.fn<CreatePostDeps['insertPost']>(async () => 'id');
  const handler = createPostHandler({ verifyToken: async () => 'u', insertPost, allowedOrigins: [], logError: () => undefined });
  return { handler, insertPost };
}

describe.skipIf(samples.length === 0)('B-08 OCR の読み取り結果 → 下書き（sample の正解データ）', () => {
  it('件数の確認（PC と スマホ）', () => {
    // eslint-disable-next-line no-console
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-08 sample', samples.length, samples.filter((s) => s.name.startsWith('pc/')).length, samples.filter((s) => s.name.startsWith('sp/')).length);
    expect(samples.length).toBeGreaterThan(0);
  });

  it('全画像: ocrPostability・evaluateReview・buildSubmission・サーバーの判定が、Oracle の独立な再生と一致する', async () => {
    const tally: Record<string, number> = {};
    const bump = (k: string): void => void (tally[k] = (tally[k] ?? 0) + 1);
    const problems: string[] = [];
    for (const { name, r } of samples) {
      const base = emptyDraft();
      const ind = independent(r);
      const pg = ocrPostability(r, base, 'normal');
      const rv = reviewFromOcr(r, 'normal', 'BTN');
      const ev = evaluateReview(base, rv);
      bump(`postability=${pg}`);

      // 1. Preflop の All-in
      if (ind.pfAllin) {
        if (pg !== 'preflop_allin') problems.push(`${name}: Oracle は Preflop の All-in だが ocrPostability=${pg}`);
        if (ind.replayed === r.actions.length && !ev.issues.includes(PREFLOP_ALLIN)) problems.push(`${name}: evaluateReview の issues に PREFLOP_ALLIN が無い ${JSON.stringify(ev.issues)}`);
        continue;
      }
      if (pg === 'preflop_allin') {
        problems.push(`${name}: Oracle は Preflop の All-in でないが ocrPostability=preflop_allin`);
        continue;
      }

      // 2. Flop 以降に Hero の Action が無い
      const heroCands = spotCandidates(
        ev.draft.actions,
        ev.draft.hero,
      ).length;
      if (!ind.heroPostflop && ind.complete) {
        if (pg !== 'no_spot' && pg !== 'unreadable') problems.push(`${name}: Hero の Flop 以降の Action が無いのに ocrPostability=${pg}`);
        if (ev.issues.length === 0) problems.push(`${name}: Hero の Flop 以降の Action が無いのに issues が空`);
        else if (!ev.issues.includes(NO_HERO_POSTFLOP) && !ev.issues.some((m) => m.includes('Flop 以降'))) bump('no_spot の文言が違う');
        continue;
      }

      // 3. 投稿できる（と Oracle が言う）ハンド
      if (ind.heroPostflop && ind.complete) {
        if (pg !== 'ok') {
          problems.push(`${name}: 投稿できるハンドを ocrPostability=${pg} ではじいた`);
          continue;
        }
        if (ev.issues.length > 0) {
          // 再生で決まる席が画像の読みと違う行があるとき（Oracle の mismatchRows > 0）は「合わない」の指摘が出る
          if (ind.mismatchRows === 0) problems.push(`${name}: 反映の issues が出た ${JSON.stringify(ev.issues)}`);
          else bump('席が合わない行あり（正解データ側の都合）');
          continue;
        }
        // 反映した下書き: 再生でき、Spot の候補があり、そのまま投稿できる
        const cands = candidates(ev.draft);
        if (cands.length !== heroCands) problems.push(`${name}: 候補の数が違う`);
        if (cands.length === 0) {
          problems.push(`${name}: 候補が無い`);
          continue;
        }
        const d: Draft = { ...ev.draft, title: '試験', spotIndex: cands[cands.length - 1]!.index };
        const sub = buildSubmission(d);
        const { handler, insertPost } = makeServer();
        if (!sub.ok) {
          problems.push(`${name}: 反映した下書きが投稿できない ${sub.errors.join(' / ')}`);
          continue;
        }
        const res = await handler(new Request('https://x/', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(sub.body) }));
        if (res.status !== 201) problems.push(`${name}: 画面が通した本文をサーバーが ${res.status} で断った ${await res.text()}`);
        else {
          bump('投稿できる（画面・サーバーとも通る）');
          expect(insertPost).toHaveBeenCalledTimes(1);
          // 全員のハンドが正解データのとおり入っている
          for (const p of POSITIONS) expect(d.hands[p], `${name} ${p}`).toBe(r.hands[p]?.join('') ?? '');
          expect(d.hero).toBe(r.hero);
          expect(d.board).toEqual(r.board.slice(0, ind.boardCount));
        }
        continue;
      }
      // 4. Oracle が最後まで再生できない（正解データの額が 100bb の既定と合わない、ボードが足りないなど）
      bump(`Oracle で完結しない（replayed=${ind.replayed}/${r.actions.length}）`);
      if (pg === 'ok' && ev.issues.length === 0) problems.push(`${name}: Oracle は完結しないと言うが evaluateReview は issues なし`);
    }
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-08 統計', JSON.stringify(tally), `問題 ${problems.length} 件`, JSON.stringify(problems.slice(0, 10)));
    expect(problems).toEqual([]);
  }, 300_000);
});
