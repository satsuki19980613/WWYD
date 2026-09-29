/**
 * リリース前の総合テスト B（探索）: 回答画面の純関数（ブラシ・ミックスバー・塗りの履歴・サイズ・送信前の検査）を、
 * ランダムな操作列で参照モデルと突き合わせる。種を決めた擬似乱数（依存なし）。
 */
import { ANSWER_KEYS, MIX_TOTAL, emptyPaint, validatePaint, type AnswerKey, type Mix, type Paint } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../core/src/poker/release.tb.gen.ts';
import { boundaries, boundaryRange, handlesAt, initialBrush, moveBoundary, pickHandle, pureBrush, sameMix } from './brush.ts';
import {
  HISTORY_MAX,
  applyCell,
  beginStroke,
  cancelStroke,
  clear,
  endStroke,
  newEditor,
  redo,
  strokeMode,
  undo,
  type Editor,
  type Tool,
} from './paintEditor.ts';
import {
  PRESETS,
  initialSize,
  presetActive,
  presetSize,
  sizeForSubmit,
  sizeSummary,
  stepSize,
  submitErrors,
  usesS1,
  type SizeSpot,
} from './answerForm.ts';

const KEYSETS: AnswerKey[][] = [['fold', 'call'], ['fold', 'call', 's1'], ['check'], ['check', 's1']];

const snap = (p: Paint): string => JSON.stringify(p);

describe('B ブラシとミックスバー', () => {
  it('moveBoundary は合計 20・合法キー以外 0・境界の順序を保つ（ランダムな操作 5000 列）', () => {
    const rng = new Rng(11);
    for (let n = 0; n < 5_000; n++) {
      const keys = rng.pick(KEYSETS);
      let b: Mix = rng.chance(0.5) ? initialBrush(keys) : pureBrush(rng.pick(keys));
      for (let t = 0; t < 6; t++) {
        const i = rng.int(-1, keys.length);
        const units = rng.pick([rng.int(-5, 25), rng.next() * 30 - 5, -Infinity, Infinity]);
        const before = boundaries(b, keys);
        b = moveBoundary(b, keys, i, units as number);
        const sum = ANSWER_KEYS.reduce((s, k) => s + b[k], 0);
        expect(sum, `n=${n}`).toBe(MIX_TOTAL);
        for (const k of ANSWER_KEYS) {
          expect(Number.isInteger(b[k])).toBe(true);
          expect(b[k]).toBeGreaterThanOrEqual(0);
          if (!keys.includes(k)) expect(b[k], `n=${n} 不合法キー ${k}`).toBe(0);
        }
        const after = boundaries(b, keys);
        for (let j = 1; j < after.length; j++) expect(after[j]).toBeGreaterThanOrEqual(after[j - 1] as number);
        // 動かした境界以外は動かない
        if (i >= 0 && i < before.length) after.forEach((v, j) => j !== i && expect(v).toBe(before[j]));
      }
    }
  }, 60_000);

  it('pickHandle・handlesAt は必ず有効な添字を返す', () => {
    const rng = new Rng(12);
    for (let n = 0; n < 5_000; n++) {
      const keys = rng.pick(KEYSETS.filter((k) => k.length >= 2));
      const b = moveBoundary(pureBrush(rng.pick(keys)), keys, rng.int(0, keys.length - 2), rng.int(0, 20));
      const bounds = boundaries(b, keys);
      const at = handlesAt(bounds, rng.next(), rng.next() * 0.2);
      for (const i of at) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(bounds.length);
      }
      if (at.length > 0) {
        const h = pickHandle(bounds, at, rng.chance(0.5) ? 1 : -1);
        expect(at).toContain(h);
        const r = boundaryRange(bounds, h);
        expect(r.lo).toBeLessThanOrEqual(bounds[h] as number);
        expect(r.hi).toBeGreaterThanOrEqual(bounds[h] as number);
      }
    }
  }, 60_000);
});

describe('B 塗りの履歴（paintEditor）を参照モデルと突き合わせる', () => {
  it('ランダムな操作列（ストローク・スポイトの取り消し・元に戻す・やり直す・クリア）で、内容と履歴が参照モデルと一致し、履歴は 100 手まで', () => {
    const rng = new Rng(2027);
    for (let n = 0; n < 150; n++) {
      const keys = rng.pick(KEYSETS);
      let e: Editor = newEditor();
      // 参照モデル（内容のコピーで持つ）
      let cur: string = snap(emptyPaint());
      let undoS: string[] = [];
      let redoS: string[] = [];
      let stroke: string | null = null;
      let fixed: { mode: ReturnType<typeof strokeMode>; brush: Mix } | null = null;
      const brushes: Mix[] = keys.map((k) => pureBrush(k));
      brushes.push(...keys.slice(1).map((_, i) => moveBoundary(pureBrush(keys[0] as AnswerKey), keys, i, rng.int(1, 19))));
      const label = (op: string): string => `n=${n} op=${op}`;
      for (let t = 0; t < 400; t++) {
        const op = rng.pick(['begin', 'cell', 'cell', 'cell', 'end', 'end', 'cancel', 'undo', 'redo', 'clear'] as const);
        switch (op) {
          case 'begin':
            if (stroke === null) {
              e = beginStroke(e);
              stroke = cur;
              fixed = null;
            }
            break;
          case 'cell': {
            if (stroke === null) break;
            const idx = rng.int(0, 168);
            // ストロークの向き・ブラシは始点のマスで 1 回決め、そのストロークの間は変えない（画面と同じ）
            if (fixed === null) {
              const brush0 = rng.pick(brushes);
              const tool: Tool = rng.chance(0.15) ? 'eraser' : 'brush';
              fixed = { mode: strokeMode(e, idx, brush0, tool), brush: brush0 };
            }
            const { mode, brush } = fixed;
            e = applyCell(e, idx, mode, brush);
            const p = JSON.parse(cur) as Paint;
            p[idx] = mode === 'erase' ? null : { ...brush };
            cur = snap(p);
            break;
          }
          case 'end':
            if (stroke !== null) {
              e = endStroke(e);
              if (cur !== stroke) {
                undoS = [...undoS, stroke].slice(-HISTORY_MAX);
                redoS = [];
              }
              stroke = null;
            }
            break;
          case 'cancel':
            if (stroke !== null) {
              e = cancelStroke(e);
              cur = stroke;
              stroke = null;
            }
            break;
          case 'undo':
            e = undo(e);
            if (stroke === null && undoS.length > 0) {
              redoS = [...redoS, cur];
              cur = undoS[undoS.length - 1] as string;
              undoS = undoS.slice(0, -1);
            }
            break;
          case 'redo':
            e = redo(e);
            if (stroke === null && redoS.length > 0) {
              undoS = [...undoS, cur].slice(-HISTORY_MAX);
              cur = redoS[redoS.length - 1] as string;
              redoS = redoS.slice(0, -1);
            }
            break;
          case 'clear':
            e = clear(e);
            if (stroke === null && cur !== snap(emptyPaint())) {
              undoS = [...undoS, cur].slice(-HISTORY_MAX);
              redoS = [];
              cur = snap(emptyPaint());
            }
            break;
        }
        expect(snap(e.paint), label(op)).toBe(cur);
        expect(e.undo.length, label(op)).toBe(undoS.length);
        expect(e.redo.length, label(op)).toBe(redoS.length);
        expect(e.undo.length).toBeLessThanOrEqual(HISTORY_MAX);
        expect(e.strokeBase !== null, label(op)).toBe(stroke !== null);
        // 塗った内容はいつも合法（各マス null か、合計 20 のミックス）
        for (const m of e.paint) if (m) expect(ANSWER_KEYS.reduce((s, k) => s + m[k], 0)).toBe(MIX_TOTAL);
      }
      // 元に戻す → やり直すで同じ内容に戻る
      if (stroke === null) {
        const before = snap(e.paint);
        const u = undo(e);
        if (u !== e) expect(snap(redo(u).paint)).toBe(before);
      }
    }
  }, 120_000);

  it('同じミックスのマスから始めると消去、消しゴムは常に消去（strokeMode）', () => {
    const e = applyCell(newEditor(), 5, 'paint', pureBrush('call'));
    expect(strokeMode(e, 5, pureBrush('call'), 'brush')).toBe('erase');
    expect(strokeMode(e, 6, pureBrush('call'), 'brush')).toBe('paint');
    expect(strokeMode(e, 6, pureBrush('call'), 'eraser')).toBe('erase');
    expect(sameMix(null, null)).toBe(false);
  });
});

describe('B サイズと送信前の検査（answerForm）', () => {
  function spotOf(rng: Rng): SizeSpot {
    const minTo = rng.pick([1000, 500, 2000, 1, 13_000]);
    const maxTo = minTo + rng.pick([0, 1, 1000, 95_700, 9_000_000 - minTo]);
    return { currentBet: rng.pick([0, 0, 1000, 6500]), potBase: rng.pick([500, 1500, 9100, 22_100, 1]), minTo, maxTo };
  }

  it('プリセット・±0.1bb の増減・初期値はいつも範囲内で、サイズの表示は NaN を出さない', () => {
    const rng = new Rng(5);
    for (let n = 0; n < 5_000; n++) {
      const spot = spotOf(rng);
      for (const p of PRESETS) {
        const to = presetSize(p, spot);
        expect(to).toBeGreaterThanOrEqual(spot.minTo);
        expect(to).toBeLessThanOrEqual(spot.maxTo);
        // 割合のプリセットが max に丸められたときは、All-in が押された表示になる（割合のほうは押されない）
        expect(presetActive(p, to, spot), `preset=${p} to=${to} spot=${JSON.stringify(spot)}`).toBe(p === 'allin' || to !== spot.maxTo);
        if (to === spot.maxTo) expect(presetActive('allin', to, spot)).toBe(true);
      }
      const init = initialSize(spot, null);
      expect(init).toBeGreaterThanOrEqual(spot.minTo);
      expect(init).toBeLessThanOrEqual(spot.maxTo);
      const text = rng.pick(['', ' ', 'abc', '-1', '1e3', '0.0001', String(spot.minTo / 1000), String(spot.maxTo / 1000), '5.', '.5', '99999']);
      for (const dir of [1, -1] as const) {
        const v = stepSize(text, dir, spot);
        expect(v, `text=${text}`).toBeGreaterThanOrEqual(spot.minTo);
        expect(v).toBeLessThanOrEqual(spot.maxTo);
        expect(Number.isInteger(v)).toBe(true);
      }
      for (const to of [null, spot.minTo, spot.maxTo, init]) {
        const s = sizeSummary(to, spot);
        expect(`${s.amount}${s.pct}`).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  }, 60_000);

  it('submitErrors は、サーバーと同じ検証（validatePaint）が通るときだけ空になる', () => {
    const rng = new Rng(9);
    let ok = 0;
    for (let n = 0; n < 3000; n++) {
      const keys = rng.pick(KEYSETS);
      const paint = emptyPaint();
      for (let i = 0; i < 169; i++) if (rng.chance(0.05)) paint[i] = rng.chance(0.5) ? pureBrush(rng.pick(keys)) : moveBoundary(pureBrush(keys[0] as AnswerKey), keys, 0, rng.int(0, 20));
      // ときどき不合法なキーや壊れた合計を入れる
      if (rng.chance(0.2)) paint[rng.int(0, 168)] = { fold: rng.int(0, 21), check: 0, call: rng.int(0, 3), s1: 0 };
      const spot: SizeSpot | null = keys.includes('s1') ? spotOf(rng) : null;
      const to = rng.pick([null, spot?.minTo ?? 1000, spot?.maxTo ?? 2000, (spot?.maxTo ?? 2000) + 1, (spot?.minTo ?? 1000) - 1, 1500.5]);
      const errs = submitErrors(paint, keys, to, spot);
      const size = sizeForSubmit(paint, to);
      const code = validatePaint(paint, keys, size, spot?.minTo ?? null, spot?.maxTo ?? null);
      expect(errs.length === 0, `n=${n} errs=${JSON.stringify(errs)} code=${code}`).toBe(code === null);
      if (errs.length === 0) ok++;
      expect(usesS1(paint) ? size === to : size === null).toBe(true);
      for (const m of errs) expect(m).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(ok).toBeGreaterThan(100);
  }, 60_000);
});
