/**
 * リリース前の総合テスト B-03（額の境界）の画面側: 額のボタン・スライダー・% pot・Fold to / Check to・カード入力を、
 * ランダムなハンドの各手番で確かめる。種を決めた擬似乱数（依存なし）。
 */
import { POSITIONS, apply, formatBb, pctFromSize, sizeFromPct, status, type Action, type HandSetup, type Pos, type State } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../core/src/poker/release.tb.gen.ts';
import { RANK_CHARS, applyCardKey, handCards, handSlots, isHandComplete, keyFromKeyboard } from './cardInput.ts';
import {
  actionLog,
  aggressiveName,
  callName,
  canReplay,
  defaultAmount,
  defaultPreset,
  parseSettings,
  parseSize,
  phaseOf,
  sizeNote,
  sizePresets,
  skipTargets,
  sliderStep,
  sliderValue,
  statusLine,
  turnInfo,
} from './draft.ts';
import { buildDraft } from './release.tb.draftgen.ts';

const clean = (s: string): boolean => !/NaN|undefined|Infinity|\[object/.test(s);

describe('B-03b 額のボタン・スライダー・% pot（ランダムなハンドの全手番）', () => {
  it('各手番で: 額のボタンは範囲内・重複なし・最後が All-in・apply が通る。初期値・スライダー・% pot・Fold to / Check to も一貫する', () => {
    const stat = { hands: 0, turns: 0, sized: 0, presets: 0, skips: 0 };
    for (let i = 0; i < 1200; i++) {
      const seed = 1_700_000 + i;
      const d = buildDraft(new Rng(seed)).draft;
      const setup = parseSettings(d).setup as HandSetup;
      stat.hands++;
      for (let k = 0; k <= d.actions.length; k++) {
        const prefix = d.actions.slice(0, k);
        const ph = phaseOf(setup, prefix, d.board);
        if (ph.kind !== 'act') continue;
        stat.turns++;
        const { state, pos, legal } = ph;
        const label = `seed=${seed} k=${k} pos=${pos}`;
        // 表示の文字列
        expect(clean(statusLine(state, pos)), label).toBe(true);
        const ti = turnInfo(state, pos);
        expect(ti.pot).toBeGreaterThan(0);
        expect(ti.toCall).toBeGreaterThanOrEqual(0);
        expect(ti.toCall).toBeLessThanOrEqual(ti.stack === 0 ? 0 : Math.max(ti.toCall, 0));
        expect(clean(callName(state, pos)) && clean(aggressiveName(state, prefix)), label).toBe(true);
        // 実際のログの文字
        const logs = actionLog(setup, prefix);
        expect(logs.length).toBe(prefix.length);
        for (const l of logs) expect(clean(l.text), `${label} ${l.text}`).toBe(true);

        const range = legal.bet ?? legal.raise;
        if (range) {
          stat.sized++;
          const ps = sizePresets(state, legal);
          stat.presets += ps.length;
          expect(ps.length, label).toBeGreaterThanOrEqual(1);
          expect(ps[ps.length - 1], label).toMatchObject({ allin: true, to: range.max });
          expect(new Set(ps.map((p) => p.to)).size, `${label} 重複`).toBe(ps.length);
          for (const p of ps) {
            expect(p.to, label).toBeGreaterThanOrEqual(range.min);
            expect(p.to, label).toBeLessThanOrEqual(range.max);
            expect(clean(p.label + p.sub), label).toBe(true);
            // 表示した額はそのまま入力欄に戻せる
            expect(parseSize(formatBb(p.to), range), `${label} parseSize ${p.sub}`).toBe(p.to);
            // その額で実際に Action を入れられる
            const a: Action = { street: state.street, pos, type: legal.bet ? 'bet' : 'raise', to: p.to };
            expect(() => apply(state, a), `${label} apply ${p.to}`).not.toThrow();
          }
          // All-in 以外は max 未満（All-in が最後に 1 つだけ）
          expect(ps.filter((p) => p.allin).length).toBe(1);
          // 初期値
          const dp = defaultPreset(state, legal);
          expect(dp, label).not.toBeNull();
          expect(dp as number).toBeGreaterThanOrEqual(range.min);
          expect(dp as number).toBeLessThanOrEqual(range.max);
          const da = defaultAmount(state, pos, range);
          expect(da).toBeGreaterThanOrEqual(range.min);
          expect(da).toBeLessThanOrEqual(range.max);
          // スライダー: 端と単調性
          expect(sliderValue(0, range)).toBe(range.min);
          expect(sliderValue(1, range)).toBe(range.max);
          const step = sliderStep(range);
          expect(step).toBeGreaterThan(0);
          let prev = range.min;
          for (let t = 0; t <= 100; t++) {
            const v = sliderValue(t / 100, range);
            expect(v, `${label} t=${t}`).toBeGreaterThanOrEqual(prev);
            expect(v).toBeLessThanOrEqual(range.max);
            expect(Number.isInteger(v)).toBe(true);
            prev = v;
          }
          // 添え書き
          for (const to of [range.min, range.max, da]) {
            const note = sizeNote(state, to);
            if (note !== null) expect(clean(note), `${label} note ${to}`).toBe(true);
          }
          // % pot（core の共通関数）
          if (legal.bet) {
            for (const pct of [33, 50, 75, 125]) {
              const to = sizeFromPct(state.currentBet, ti.pot, pct, range.min, range.max);
              expect(to).toBeGreaterThanOrEqual(range.min);
              expect(to).toBeLessThanOrEqual(range.max);
              const back = pctFromSize(state.currentBet, ti.pot, to, range.max);
              if (back !== 'allin') expect(Number.isFinite(back), `${label} pct ${pct}`).toBe(true);
            }
          }
        } else {
          expect(sizePresets(state, legal)).toEqual([]);
          expect(defaultPreset(state, legal)).toBeNull();
        }

        // Fold to / Check to: 入れる Action は順に合法で、着いた席が次の手番になる
        const sk = skipTargets(state, pos, legal);
        for (const t of sk.targets) {
          stat.skips++;
          let s2: State = state;
          for (const a of t.actions) s2 = apply(s2, a);
          const st = status(s2);
          expect(st, `${label} skip→${t.pos}`).toEqual({ kind: 'act', pos: t.pos });
          expect(t.actions.every((a) => a.type === sk.kind)).toBe(true);
        }
        // 取り消した Action の入れ直し: 実際の次の Action は入れ直せる
        const next = d.actions[k];
        if (next) expect(canReplay(ph, next), `${label} canReplay`).toBe(true);
        // 別の席・別のストリートの Action は入れ直せない
        if (next) {
          const other = POSITIONS.find((p) => p !== next.pos) as Pos;
          expect(canReplay(ph, { ...next, pos: other })).toBe(false);
        }
      }
    }
    // eslint-disable-next-line no-console
    (globalThis as unknown as { console: { log: (...a: unknown[]) => void } }).console.log('B-03b 統計', JSON.stringify(stat));
    expect(stat.turns).toBeGreaterThan(5000);
    expect(stat.sized).toBeGreaterThan(2000);
    expect(stat.skips).toBeGreaterThan(500);
  }, 240_000);
});

describe('B-03c カード入力（applyCardKey）のランダムなキー列', () => {
  const KEYS = [...'AKQJT98765432', '1', '0', 's', 'h', 'd', 'c', 'C', 'BS', 'x', '', 'AA', 'S', '10', '-'];
  const HAND = /^(?:[AKQJT98765432][shdc]){0,2}$|^(?:[AKQJT98765432][shdc]){0,1}[AKQJT987654321]$/;

  it('どんなキー列でも、手の形が壊れない（最大 4 文字・札は重複しない・使用済みの札は入らない）', () => {
    const rng = new Rng(31337);
    let usedHits = 0;
    for (let n = 0; n < 6_000; n++) {
      const used = new Set<string>();
      for (let u = rng.int(0, 6); u > 0; u--) used.add(rng.pick([...RANK_CHARS]) + rng.pick([...'shdc']));
      let hand = '';
      const seq: string[] = [];
      for (let t = 0; t < 14; t++) {
        const key = rng.pick(KEYS);
        seq.push(key);
        const r = applyCardKey(hand, key, used);
        if (r.used) usedHits++;
        hand = r.hand;
        expect(hand.length, seq.join(' ')).toBeLessThanOrEqual(4);
        expect(HAND.test(hand), `${JSON.stringify(hand)} ← ${seq.join(' ')}`).toBe(true);
        const cs = handCards(hand);
        for (const c of cs) expect(used.has(c), `使用済み ${c} ← ${seq.join(' ')}`).toBe(false);
        if (cs.length === 2) expect(cs[0]).not.toBe(cs[1]);
        // 2 枠の表示が例外にならず、完成判定と矛盾しない
        expect(handSlots(hand)).toHaveLength(2);
        if (isHandComplete(hand) && hand !== '') expect(cs).toHaveLength(2);
      }
    }
    expect(usedHits).toBeGreaterThan(20);
  }, 120_000);

  it('T は「1」「0」の 2 打でも入る。キーボードのキーの変換は想定した文字だけ返す', () => {
    let h = applyCardKey('', '1', new Set()).hand;
    h = applyCardKey(h, '0', new Set()).hand;
    h = applyCardKey(h, 's', new Set()).hand;
    expect(h).toBe('Ts');
    const all = ['Backspace', 'Delete', 'Enter', 'Tab', 'Shift', 'a', 'A', 'k', 'K', 'q', 'j', 't', 'T', 'S', 'H', 'D', 'C', 'c', 'x', 'X', '0', '1', '9', '10', 'ArrowLeft', ' ', 'あ', ''];
    for (const k of all) {
      const v = keyFromKeyboard(k);
      expect(v === null || KEYS.includes(v) || v === 'BS' || v === 'C').toBe(true);
    }
    expect(keyFromKeyboard('c')).toBe('c');
    expect(keyFromKeyboard('C')).toBe('c');
    expect(keyFromKeyboard('Delete')).toBe('C');
  });
});
