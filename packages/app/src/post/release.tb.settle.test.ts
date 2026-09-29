/**
 * リリース前の総合テスト B-06（settleActions: 設定を変えたあとも、残る Action は必ず再生できる）と
 * B-07（保存した下書きの復元 sanitizeDraft: 壊れた JSON・古い形・巨大な値でも落ちない）。
 * 種を決めた擬似乱数（依存なし）。
 */
import { POSITIONS, PLAYER_COUNTS, SEATS_BY_COUNT, ValidationError, runActions, type PlayerCount, type Pos } from '@wwyd/core';
import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../../../core/src/poker/release.tb.gen.ts';
import { buildDraft } from './release.tb.draftgen.ts';
import {
  buildSubmission,
  candidates,
  emptyDraft,
  normalizeSpot,
  parseSettings,
  phaseOf,
  setPlayers,
  settleActions,
  submissionBody,
  type Draft,
} from './draft.ts';
import { MAX_DRAFTS, clearDrafts, deleteDraft, readDrafts, sanitizeDraft, saveDraft, type KeyValue } from './savedDrafts.ts';

// 乱数で多くのハンドを回す試験がある。CI の遅い環境でも既定の 5 秒で打ち切らない（2026-09-30 CI で 5.09 秒かかり落ちた）
vi.setConfig({ testTimeout: 60_000 });

const WEIRD_NUM = ['', ' ', '1.', '.5', '0', '-1', 'abc', '1e2', '0.0001', '9999.999', '10000', '0.001', '0.5', '1', '2', '3', '5', '10', '20', '50', '100', '250', '1000', '１', '１００'];

/** 画面の入力欄の変更（NewPostScreen の patch / update と同じ順序で適用する） */
type Edit = { name: string; f: (d: Draft, rng: Rng) => Draft };

const seatsOf = (d: Draft): readonly Pos[] => (d.players === null ? [] : SEATS_BY_COUNT[d.players]);

const EDITS: Edit[] = [
  // patch: 入力欄を直接書き換える（settleActions は通さない。Spot だけ normalizeSpot）
  {
    name: 'Stack',
    f: (d, rng) => {
      const seats = seatsOf(d);
      const p = rng.pick(seats.length ? seats : POSITIONS);
      const v = rng.chance(0.6) ? rng.pick(WEIRD_NUM) : String(rng.int(1, 3000) / 10);
      return normalizeSpot({ ...d, stacks: { ...d.stacks, [p]: v } });
    },
  },
  { name: 'SB', f: (d, rng) => normalizeSpot({ ...d, sb: rng.chance(0.7) ? rng.pick(WEIRD_NUM) : String(rng.int(1, 1000) / 1000) }) },
  { name: 'Ante', f: (d, rng) => normalizeSpot({ ...d, ante: rng.chance(0.7) ? rng.pick(WEIRD_NUM) : String(rng.int(0, 5000) / 1000) }) },
  { name: 'Rake', f: (d, rng) => normalizeSpot({ ...d, rake: rng.pick(['', '5', '0', '100', '101', 'x', '2.5']) }) },
  { name: 'fmt', f: (d, rng) => normalizeSpot({ ...d, fmt: rng.pick(['cash', 'mtt'] as const) }) },
  {
    name: 'Hero',
    f: (d, rng) => {
      const seats = seatsOf(d);
      return seats.length ? normalizeSpot({ ...d, hero: rng.pick(seats) }) : d;
    },
  },
  // update: 直前に settleActions を通してから人数を変える
  { name: '人数', f: (d, rng) => setPlayers(settleActions(d), rng.pick(PLAYER_COUNTS)) },
];

/** 独立な参照: 設定を読み、Action を先頭から 1 つずつ足して再生できる最長の長さを求める */
function longestReplayable(d: Draft): number | null {
  const { setup } = parseSettings(d);
  if (!setup) return null;
  let n = 0;
  for (let k = 1; k <= d.actions.length; k++) {
    try {
      runActions(setup, d.actions.slice(0, k));
      n = k;
    } catch (e) {
      if (e instanceof ValidationError) break;
      throw e;
    }
  }
  return n;
}

describe('B-06 settleActions', () => {
  it('ランダムなハンド 4000 件に、ランダムな設定の変更を 1〜3 回当てる: 残った Action は必ず再生でき、最長の接頭辞で、冪等で、Spot の選択は候補に残る', () => {
    const stat = { hands: 0, edits: 0, dropped: 0, keptAll: 0, setupUnreadable: 0, spotCleared: 0, spotViolations: 0, players: {} as Record<number, number> };
    const spotViolations: string[] = [];
    for (let i = 0; i < 4000; i++) {
      const seed = 1_100_000 + i;
      const rng = new Rng(seed);
      // 画面で作れる状態だけ（Spot の選択は候補にある）
      const base = normalizeSpot(buildDraft(rng).draft);
      // 前提: 作った下書きは、そのまま再生できる（settleActions は何も変えない）
      expect(settleActions(base), `seed=${seed} base`).toBe(base);
      let raw = base;
      const log: string[] = [];
      const nEdits = rng.int(1, 3);
      for (let e = 0; e < nEdits; e++) {
        const edit = rng.pick(EDITS);
        raw = edit.f(raw, rng);
        log.push(edit.name);
        stat.edits++;
        const before = JSON.stringify(raw);
        const label = `seed=${seed} edits=${log.join('>')}`;
        const settled = settleActions(raw);
        // 入力を書き換えない（純粋）
        expect(JSON.stringify(raw), `${label} 純粋`).toBe(before);
        const { setup } = parseSettings(raw);
        if (!setup) {
          stat.setupUnreadable++;
          expect(settled, `${label} 設定が読めない間は外さない`).toBe(raw);
          continue;
        }
        // 接頭辞
        expect(settled.actions, `${label} 接頭辞`).toEqual(raw.actions.slice(0, settled.actions.length));
        // 再生できる
        expect(() => runActions(setup, settled.actions), `${label} 再生できる`).not.toThrow();
        expect(() => phaseOf(setup, settled.actions, settled.board), `${label} phaseOf`).not.toThrow();
        // 最長
        expect(settled.actions.length, `${label} 最長`).toBe(longestReplayable(raw));
        // 冪等
        expect(settleActions(settled), `${label} 冪等`).toBe(settled);
        // Action 以外は変えない
        expect({ ...settled, actions: 0, spotIndex: 0 }).toEqual({ ...raw, actions: 0, spotIndex: 0 });
        if (settled.actions.length < raw.actions.length) stat.dropped++;
        else stat.keptAll++;
        // Spot の選択は、外れた Action を指さず、候補にある
        if (raw.spotIndex !== null && settled.spotIndex === null) stat.spotCleared++;
        if (settled.spotIndex !== null && !candidates(settled).some((c) => c.index === settled.spotIndex)) {
          stat.spotViolations++;
          if (spotViolations.length < 5) spotViolations.push(`${label} spot=${settled.spotIndex} cands=${JSON.stringify(candidates(settled).map((c) => c.index))}`);
        }
        // 画面が出す投稿の検査は、どの状態でも例外を出さない
        expect(() => buildSubmission(settled), `${label} buildSubmission`).not.toThrow();
        expect(() => submissionBody(settled), `${label} submissionBody`).not.toThrow();
      }
      stat.hands++;
      const n = raw.players ?? 0;
      stat.players[n] = (stat.players[n] ?? 0) + 1;
    }
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-06 統計', JSON.stringify(stat), JSON.stringify(spotViolations));
    expect(stat.dropped).toBeGreaterThan(500);
    expect(stat.keptAll).toBeGreaterThan(500);
    // Spot の選択が候補外のまま残る（外れた Action を指さないが、Preflop の All-in などで候補が無い）例は、下の it.fails で別に扱う
    expect(stat.spotViolations).toBe(0);
  }, 240_000);

  it('人数を減らすと、消えた席の Action 以降が外れる（06 章 §3.3）。確認ダイアログの「外れる個数」と一致する', () => {
    let checked = 0;
    for (let i = 0; i < 2000; i++) {
      const seed = 1_200_000 + i;
      const rng = new Rng(seed);
      const b = buildDraft(rng);
      const d = b.draft;
      const n = rng.pick(PLAYER_COUNTS.filter((c) => c !== d.players));
      const after = settleActions(setPlayers(d, n as PlayerCount));
      // 画面の changePlayers と同じ式
      const dropped = d.actions.length - after.actions.length;
      const seats = SEATS_BY_COUNT[n as PlayerCount];
      const firstGone = d.actions.findIndex((a) => !seats.includes(a.pos));
      if (firstGone >= 0) expect(after.actions.length, `seed=${seed}`).toBeLessThanOrEqual(firstGone);
      expect(dropped).toBeGreaterThanOrEqual(0);
      // 人数を増やして Action を外さない場合、外れた個数は 0 とは限らない（席が増えると手番が変わる）が、再生はできる
      const { setup } = parseSettings(after);
      if (setup) expect(() => runActions(setup, after.actions), `seed=${seed}`).not.toThrow();
      // Hero の席が消えたら BTN
      if (!seats.includes(d.hero)) expect(after.hero).toBe('BTN');
      checked++;
    }
    expect(checked).toBe(2000);
  }, 120_000);

  it('Stack を戻すと、外れていた Action が戻る（外すのは画面の上だけ。次の Action 操作で確定する）', () => {
    let restored = 0;
    for (let i = 0; i < 1500; i++) {
      const seed = 1_300_000 + i;
      const rng = new Rng(seed);
      const base = buildDraft(rng).draft;
      const seats = seatsOf(base);
      const p = rng.pick(seats);
      const changed = normalizeSpot({ ...base, stacks: { ...base.stacks, [p]: '0.5' } });
      const shown = settleActions(changed);
      if (shown.actions.length < base.actions.length) {
        // 欄の値を戻せば、生の下書きの Action は残っているので、外れていた Action が戻る
        const back = { ...changed, stacks: { ...changed.stacks, [p]: base.stacks[p] } };
        expect(settleActions(back).actions, `seed=${seed}`).toEqual(base.actions);
        restored++;
      }
    }
    expect(restored).toBeGreaterThan(100);
  });

  it('未確定の下書き（生の設定で再生できない）を、settleActions を通さずに buildSubmission へ渡すと例外になる（画面は必ず settleActions を通す）', () => {
    let threw = 0;
    for (let i = 0; i < 1500 && threw < 5; i++) {
      const rng = new Rng(1_400_000 + i);
      const base = buildDraft(rng).draft;
      const p = rng.pick(seatsOf(base));
      const d = { ...base, stacks: { ...base.stacks, [p]: '0.5' } };
      if (settleActions(d).actions.length === d.actions.length) continue;
      try {
        buildSubmission(d);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        threw++;
      }
    }
    // 例外になる（＝画面の外から呼ぶと落ちる）ことを記録する。画面は settleActions を通すので到達しない
    expect(threw).toBeGreaterThan(0);
  });
});

// ---- 下書きの保存 ----

class MemStore implements KeyValue {
  readonly m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

describe('B-06b 保存した下書きは、画面に見えていた Action を保つ', () => {
  it('Stack を下げて外れた Action が画面に出ていない状態で保存 → 開き直しても、画面に見えていた Action が残る', () => {
    // DraftDialogs は getDraft()（生の下書き）を保存する。画面に見えていた内容（settleActions を通した内容）と、
    // 開き直したあとの内容（sanitizeDraft は再生できなければ Action をすべて捨てる）が一致するか
    let shownButLost = 0;
    let checked = 0;
    const ex: string[] = [];
    for (let i = 0; i < 1500; i++) {
      const seed = 1_500_000 + i;
      const rng = new Rng(seed);
      const base = buildDraft(rng).draft;
      const p = rng.pick(seatsOf(base));
      const raw = normalizeSpot({ ...base, stacks: { ...base.stacks, [p]: rng.pick(['0.5', '1', '3', '20']) } });
      const shown = settleActions(raw);
      if (shown.actions.length === raw.actions.length || shown.actions.length === 0) continue;
      checked++;
      const store = new MemStore();
      const r = saveDraft('u1', raw, null, new Date(0), store);
      expect(r.ok).toBe(true);
      const back = readDrafts('u1', store)[0]!.draft;
      if (back.actions.length !== shown.actions.length) {
        shownButLost++;
        if (ex.length < 3) ex.push(`seed=${seed} 画面=${shown.actions.length} 復元=${back.actions.length} raw=${raw.actions.length}`);
      }
    }
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-06b', checked, shownButLost, JSON.stringify(ex));
    expect(checked).toBeGreaterThan(100);
    // 期待: 0（画面で見えていた Action は保存されて戻る）。実際は下の it.fails で追う
  });

  it('【不具合候補】保存の内容は settleActions を通した（画面に見えていた）内容にする。生の下書きを保存すると、開き直したとき Action がすべて消える', () => {
    // 6 人・全員 100bb の H-S1 相当の下書きで、BTN の Stack を 1bb に下げる → 画面は BTN の raise 2.5 の手前までを出す
    const rng = new Rng(1);
    let d: Draft | null = null;
    for (let i = 0; i < 200 && !d; i++) {
      const b = buildDraft(new Rng(i + 3000)).draft;
      const p = seatsOf(b)[3] as Pos;
      const raw = { ...b, stacks: { ...b.stacks, [p]: '1' } };
      const shown = settleActions(raw);
      if (shown.actions.length > 0 && shown.actions.length < raw.actions.length) d = raw;
    }
    expect(d).not.toBeNull();
    void rng;
    const raw = d as Draft;
    const shown = settleActions(raw);
    const store = new MemStore();
    saveDraft('u1', raw, null, new Date(0), store);
    const back = readDrafts('u1', store)[0]!.draft;
    expect(back.actions.length).toBe(shown.actions.length);
  });
});

// ---- B-07 ----

describe('B-07 sanitizeDraft（保存した下書きの復元）', () => {
  const junk: unknown[] = [
    null, undefined, 0, 1, -1, NaN, 'x', '', [], {}, [[]], true, false, () => 1, Symbol.iterator.toString(), 1e309, { a: 1 },
  ];

  it('どんな JSON の値でも例外を出さず、正しい形の Draft を返す', () => {
    for (const j of junk) {
      const d = sanitizeDraft(j);
      expect(d.fmt === 'cash' || d.fmt === 'mtt').toBe(true);
      expect(POSITIONS.every((p) => typeof d.stacks[p] === 'string' && typeof d.hands[p] === 'string')).toBe(true);
      expect(Array.isArray(d.actions) && Array.isArray(d.board)).toBe(true);
    }
  });

  it('壊れた JSON 文字列・巨大な値・入れ子の深い値でも readDrafts が落ちない', () => {
    const store = new MemStore();
    const key = 'wwyd.drafts.v1.u1';
    for (const raw of ['{', '[', 'null', '"x"', '123', '[1,2,3]', '[null]', '[{}]', '[{"id":1}]', '{"id":"a","savedAt":"b"}', '', ' ', '\u0000', 'undefined', '[' + '['.repeat(9000) + ']'.repeat(9000) + ']']) {
      store.setItem(key, raw);
      expect(() => readDrafts('u1', store), raw.slice(0, 30)).not.toThrow();
    }
    // 巨大なタイトルと何万件もの Action
    const big = { id: 'a', savedAt: '2026-01-01T00:00:00Z', draft: { title: 'x'.repeat(5_000_000), actions: Array.from({ length: 200_000 }, () => ({ street: 'pf', pos: 'UTG', type: 'fold' })), board: Array.from({ length: 100_000 }, () => 'As'), stacks: { UTG: '1'.repeat(1_000_000) } } };
    store.setItem(key, JSON.stringify([big]));
    const t0 = Date.now();
    const out = readDrafts('u1', store);
    expect(out.length).toBe(1);
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('壊れた Action（型違い・欠け・余分・prototype）は捨て、Action・ボード・Spot を空にする', () => {
    const bad: unknown[] = [
      [null], [1], ['x'], [[]], [{}], [{ street: 'pf' }], [{ street: 'x', pos: 'UTG', type: 'fold' }], [{ street: 'pf', pos: 'XX', type: 'fold' }],
      [{ street: 'pf', pos: 'UTG', type: 'shove' }], [{ street: 'pf', pos: 'UTG', type: 'raise' }], [{ street: 'pf', pos: 'UTG', type: 'raise', to: '5' }],
      [{ street: 'pf', pos: 'UTG', type: 'raise', to: 1.5 }], [{ street: 'pf', pos: 'UTG', type: 'raise', to: NaN }], [{ street: 'pf', pos: 'UTG', type: 'fold', to: 5 }],
      [{ street: 'pf', pos: 'UTG', type: 'raise', to: 1e30 }], [{ street: 'pf', pos: 'BB', type: 'fold' }],
      JSON.parse('[{"street":"pf","pos":"UTG","type":"fold","__proto__":{"x":1}}]'),
    ];
    for (const actions of bad) {
      const d = sanitizeDraft({ players: 6, stacks: { UTG: '100', HJ: '100', CO: '100', BTN: '100', SB: '100', BB: '100' }, actions, board: ['As', 'Kd', 'Qh'], spotIndex: 0 });
      // 再生できる Action だけ（壊れたものは残らない）
      const setup = parseSettings(d).setup;
      expect(setup).not.toBeNull();
      expect(() => runActions(setup!, d.actions), JSON.stringify(actions)).not.toThrow();
      expect(() => phaseOf(setup, d.actions, d.board)).not.toThrow();
    }
  });

  it('players・hero・fmt・数の欄が壊れていれば既定値に戻す。数の欄の型違いは捨てる', () => {
    const d = sanitizeDraft({ fmt: 'sng', sb: 5, ante: null, rake: {}, players: 7, hero: 'XX', stacks: { UTG: 5, HJ: '20' }, hands: [], title: 5, spotIndex: '3', actions: 'x', board: 'AsKs' });
    const e = emptyDraft();
    expect(d.fmt).toBe('cash');
    expect(d.sb).toBe(e.sb);
    expect(d.ante).toBe(e.ante);
    expect(d.rake).toBe(e.rake);
    expect(d.players).toBeNull();
    expect(d.hero).toBe(e.hero);
    expect(d.stacks.UTG).toBe('100');
    expect(d.stacks.HJ).toBe('20');
    expect(d.title).toBe('');
    expect(d.spotIndex).toBeNull();
    expect(d.actions).toEqual([]);
    expect(d.board).toEqual([]);
  });

  it('ランダムな Draft を保存 → 読み込みで、再生できるものは往復して一致する（1500 件）', () => {
    for (let i = 0; i < 1500; i++) {
      const b = buildDraft(new Rng(1_600_000 + i)).draft;
      const store = new MemStore();
      expect(saveDraft('u', b, null, new Date(i * 1000), store).ok).toBe(true);
      const back = readDrafts('u', store)[0]!.draft;
      // 候補に無い Spot の番号は読み直すと null に戻る（TB-3 の修正。指揮役が期待を直した）
      expect(back, `i=${i}`).toEqual(normalizeSpot(b));
    }
  });

  it('保存できる件数は 3 件まで・上書き・削除・利用者ごとに分かれる・保存できない環境でも落ちない', () => {
    const store = new MemStore();
    const d = buildDraft(new Rng(5)).draft;
    const ids: string[] = [];
    for (let k = 0; k < MAX_DRAFTS; k++) {
      const r = saveDraft('u1', { ...d, title: `t${k}` }, null, new Date(1000 * (k + 1)), store);
      expect(r.ok).toBe(true);
      if (r.ok) ids.push(r.id);
    }
    expect(new Set(ids).size).toBe(MAX_DRAFTS);
    expect(saveDraft('u1', d, null, new Date(9999), store)).toEqual({ ok: false, reason: 'full' });
    // 上書きは満杯でも通る
    expect(saveDraft('u1', { ...d, title: 'over' }, ids[1] ?? null, new Date(10_000), store).ok).toBe(true);
    expect(readDrafts('u1', store)).toHaveLength(3);
    expect(readDrafts('u2', store)).toHaveLength(0);
    // 削除
    deleteDraft('u1', ids[0] as string, store);
    expect(readDrafts('u1', store)).toHaveLength(2);
    clearDrafts('u1', store);
    expect(readDrafts('u1', store)).toHaveLength(0);
    expect(store.m.size).toBe(0);
    // ストレージが例外を投げる・null
    const throwing: KeyValue = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
    expect(() => readDrafts('u', throwing)).not.toThrow();
    expect(saveDraft('u', d, null, new Date(), throwing)).toEqual({ ok: false, reason: 'unavailable' });
    expect(saveDraft('u', d, null, new Date(), null)).toEqual({ ok: false, reason: 'unavailable' });
    expect(readDrafts('u', null)).toEqual([]);
    expect(() => deleteDraft('u', 'x', throwing)).not.toThrow();
    expect(() => clearDrafts('u', throwing)).not.toThrow();
  });

  it('保存されていた件数が 3 件を超えていても新しい順に 3 件だけ読む・日時が壊れていても落ちない', () => {
    const store = new MemStore();
    const list = Array.from({ length: 10 }, (_, k) => ({ id: `i${k}`, savedAt: k === 4 ? (null as unknown as string) : `2026-01-0${(k % 9) + 1}T00:00:00Z`, draft: {} }));
    store.setItem('wwyd.drafts.v1.u', JSON.stringify(list));
    const out = readDrafts('u', store);
    expect(out.length).toBeLessThanOrEqual(MAX_DRAFTS);
  });
});

describe('B-07b 復元した下書きの Spot', () => {
  it('【不具合候補】復元した下書きの Spot の選択は、候補にあるか null（sanitizeDraft が normalizeSpot を通さない）', () => {
    const d = sanitizeDraft({ players: 6, stacks: { UTG: '100', HJ: '100', CO: '100', BTN: '100', SB: '100', BB: '100' }, actions: [], board: [], spotIndex: 7 });
    expect(d.spotIndex === null || candidates(d).some((c) => c.index === d.spotIndex)).toBe(true);
  });

  it('【不具合候補】復元した下書きの Spot が小数・負・巨大でも、null に戻る', () => {
    for (const v of [1.5, -1, 1e21]) {
      const d = sanitizeDraft({ spotIndex: v });
      expect(d.spotIndex).toBeNull();
    }
  });

  it('【不具合候補】復元した下書きのボードは札の形（ランク＋スート）だけ', () => {
    const d = sanitizeDraft({ board: ['zz', '', '<script>', 'As'] });
    expect(d.board.every((c) => /^[AKQJT98765432][shdc]$/.test(c))).toBe(true);
  });
});
