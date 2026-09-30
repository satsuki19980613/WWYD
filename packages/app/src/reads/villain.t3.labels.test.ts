import { STREET_ACTIONS } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import {
  ACTION_LABEL,
  actionName,
  LEAN_LABEL,
  leanSpeech,
  leanText,
  MTT_FIELD_LABEL,
  MTT_FIELDS,
  PRIZE_HINT,
  PRIZE_LABEL,
  READ_DEFS,
  readLine,
  readSpeech,
  RUNOUT_LABEL,
  SIZE_LABEL,
  SPEED_DEF,
  STEP_DEFS,
  STREET_NAME,
  TEXTURE_AXIS_NAME,
  TEXTURE_LABEL,
  labelOf,
  tendencyChips,
  mttCountsLine,
} from './readsModel.ts';

/**
 * T3-09: 不変条件 2（ポーカー用語は英語。例外は MTT の数の欄の名前）。表示の名前の表がすべて英語と記号だけで、
 * 15 章 §1.1・18 章 §2.1 の語と一致する。T3-01: VPIP・PFR の段階の境目。
 */
const ASCII = /^[\x20-\x7E·→–≥]+$/;

function collect(): string[] {
  const out: string[] = [];
  out.push(...Object.values(STREET_NAME), ...Object.values(ACTION_LABEL), ...Object.values(LEAN_LABEL), ...Object.values(SIZE_LABEL));
  out.push(...Object.values(TEXTURE_AXIS_NAME), ...Object.values(RUNOUT_LABEL), ...Object.values(PRIZE_LABEL), ...Object.values(PRIZE_HINT));
  for (const axis of Object.values(TEXTURE_LABEL)) out.push(...Object.values(axis));
  for (const d of READ_DEFS) out.push(d.name, ...d.labels);
  for (const d of STEP_DEFS) out.push(d.name, ...d.labels, ...d.ends);
  out.push(SPEED_DEF.name, ...(SPEED_DEF.ends ?? []));
  return out;
}

describe('T3-09 表示の名前は英語と記号だけ', () => {
  it('すべての名前・ラベルが ASCII（と · → – ≥）で、カタカナ・かなが無い', () => {
    for (const s of collect()) expect(s, s).toMatch(ASCII);
  });

  it('Read の 1 行は、あらゆる Street × Action × Lean × Size × 条件の組で英語と記号だけ', () => {
    const streets = ['pf', 'flop', 'turn', 'river'] as const;
    let n = 0;
    for (const street of streets) {
      for (const action of STREET_ACTIONS[street]) {
        for (const lean of ['over', 'under', 'value', 'bluff'] as const) {
          for (const strong of [false, true]) {
            for (const size of [null, 'small', 'big', 'overbet'] as const) {
              for (const cr of [false, true]) {
                const e = {
                  scope: 'general' as const,
                  street,
                  action,
                  texture: street === 'pf' ? null : { high: 'a' as const, suit: 'two' as const, paired: 'paired' as const, connect: 'straight' as const },
                  runout: street === 'turn' || street === 'river' ? (['brick', 'over', 'flush', 'straight', 'pair'] as const).slice() : null,
                  size,
                  lean,
                  strong,
                };
                const line = readLine(e, cr);
                expect(line, line).toMatch(ASCII);
                expect(line).toMatch(/ → /);
                expect(line.startsWith(STREET_NAME[street])).toBe(true);
                expect(readSpeech(e, cr)).toContain('→');
                // 読み上げは ++ を言葉にする
                if (strong) {
                  expect(readSpeech(e, cr)).toContain('（強い）');
                  expect(readSpeech(e, cr)).not.toContain('++');
                  expect(line.endsWith('++')).toBe(true);
                } else expect(line.endsWith('++')).toBe(false);
                n++;
              }
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('語彙が 18 章 §2.1.5 の表どおり（Preflop / Flop / Turn・River）', () => {
    const names = (s: 'pf' | 'flop' | 'turn' | 'river') => STREET_ACTIONS[s].map((a) => ACTION_LABEL[a]);
    expect(names('pf')).toEqual(['3-Bet', 'Fold to 3-Bet', '4-Bet', 'Fold to 4-Bet', 'Squeeze', 'Limp', 'Fold to Steal']);
    expect(names('flop')).toEqual(['C-Bet', 'Fold to C-Bet', 'Donk', 'Bet vs Check', 'Raise', 'Fold to Bet', 'Fold to Raise']);
    expect(names('turn')).toEqual(['Barrel', 'Fold to Barrel', 'Delayed C-Bet', 'Donk', 'Probe', 'Bet vs Check', 'Raise', 'Fold to Bet', 'Fold to Raise']);
    expect(names('river')).toEqual(['Barrel', 'Fold to Barrel', 'Donk', 'Probe', 'Bet vs Check', 'Raise', 'Fold to Bet', 'Fold to Raise']);
    // Block Bet・Call Down は作らない
    expect(JSON.stringify(ACTION_LABEL)).not.toMatch(/Block|Call Down/);
  });

  it('Check-Raise の表示名は Raise のときだけ', () => {
    expect(actionName('raise', true)).toBe('Check-Raise');
    expect(actionName('raise', false)).toBe('Raise');
    expect(actionName('cbet', true)).toBe('C-Bet');
    expect(actionName('fold_raise', true)).toBe('Fold to Raise');
  });

  it('Lean の 4 語と ++ ・読み上げ', () => {
    expect(Object.values(LEAN_LABEL)).toEqual(['Over', 'Under', 'Value-heavy', 'Bluff-heavy']);
    expect(leanText('value', true)).toBe('Value-heavy++');
    expect(leanText('over', false)).toBe('Over');
    expect(leanSpeech('value', true)).toBe('Value-heavy（強い）');
    expect(leanSpeech('under', false)).toBe('Under');
  });

  it('条件のタグ（18 章 §2.1.3）', () => {
    expect(Object.values(TEXTURE_LABEL.high)).toEqual(['A-high', 'K-high', 'Q/J-high', 'Middle', 'Low']);
    expect(Object.values(TEXTURE_LABEL.suit)).toEqual(['Rainbow', 'Two-tone', 'Monotone']);
    expect(Object.values(TEXTURE_LABEL.paired)).toEqual(['Unpaired', 'Paired']);
    expect(Object.values(TEXTURE_LABEL.connect)).toEqual(['Straight possible', 'No straight']);
    expect(Object.values(RUNOUT_LABEL)).toEqual(['Brick', 'Overcard', 'Flush Complete', 'Straight Complete', 'Board Pair']);
    expect(Object.values(SIZE_LABEL)).toEqual(['Small', 'Big', 'Overbet']);
    expect(Object.values(TEXTURE_AXIS_NAME)).toEqual(['High Card', 'Suit', 'Pairing', 'Connectivity']);
  });

  it('5 分割のボタンのラベル（C-1）と中央を出すか（C-2）', () => {
    const by = Object.fromEntries(STEP_DEFS.map((d) => [d.key, d]));
    expect(by.agg?.labels).toEqual(['Very Passive', 'Passive', 'Balanced', 'Aggressive', 'Very Aggressive']);
    expect(by.image?.labels).toEqual(['Very Tight', 'Tight', 'Standard', 'Loose', 'Very Loose']);
    expect(by.sample?.labels).toEqual(['First Impression', 'Few Orbits', 'Some History', 'Long', 'HUD Stats']);
    expect(by.agg?.hideMiddle).toBe(true);
    expect(by.image?.hideMiddle).toBe(true);
    expect(by.sample?.hideMiddle).toBe(false);
    // 見出しの下の左右の端の名前
    expect(by.sample?.ends).toEqual(['First Impression', 'HUD Stats']);
  });

  it('全体の傾向のチップ（VPIP 0・PFR 0 も出す）', () => {
    expect(tendencyChips({ vpip: 0, pfr: 0 })).toEqual(['VPIP 0', 'PFR 0']);
    expect(tendencyChips({ agg: 2, image: 2 })).toEqual([]);
    expect(tendencyChips({ sample: 2 })).toEqual(['Sample: Some History']);
    expect(tendencyChips({ agg: 4, image: 0 })).toEqual(['Very Aggressive', 'Hero Image: Very Tight']);
  });
});

describe('T3-01 VPIP・PFR の段階の境目（その値以上で次の段階。18 章 §2.1.1）', () => {
  const cases: [number, string][] = [
    [0, 'Very Tight'],
    [14, 'Very Tight'],
    [15, 'Tight'],
    [21, 'Tight'],
    [22, 'Standard'],
    [29, 'Standard'],
    [30, 'Loose'],
    [39, 'Loose'],
    [40, 'Very Loose'],
    [100, 'Very Loose'],
  ];
  for (const [v, l] of cases) it(`VPIP ${v} は ${l}`, () => expect(labelOf('vpip', v)).toBe(l));
  // V-006（2026-09-30 さつき）: 10/16/23/30
  const pfr: [number, string][] = [
    [0, 'Very Low'],
    [9, 'Very Low'],
    [10, 'Low'],
    [15, 'Low'],
    [16, 'Standard'],
    [22, 'Standard'],
    [23, 'High'],
    [29, 'High'],
    [30, 'Very High'],
    [100, 'Very High'],
  ];
  for (const [v, l] of pfr) it(`PFR ${v} は ${l}`, () => expect(labelOf('pfr', v)).toBe(l));
});

describe('T3-03 MTT の表示の文字列', () => {
  it('数の欄の名前は日本語（スポットの順位・残りの人数・エントリー数。ITM・Avg Stack はそのまま）で、並びはこの順', () => {
    expect(MTT_FIELDS.map((f) => MTT_FIELD_LABEL[f])).toEqual(['スポットの順位', '残りの人数', 'エントリー数', 'ITM', 'Avg Stack（bb）']);
  });
  it('Prize Structure の目安', () => {
    expect(PRIZE_LABEL).toEqual({ top: 'Top-heavy', standard: 'Standard', flat: 'Flat' });
    expect(PRIZE_HINT).toEqual({ top: '1st ≥ 25%', standard: '1st 15–25%', flat: '1st < 15%' });
  });
  it('人数の 1 行', () => {
    expect(mttCountsLine({ rank: 12, left: 58, paid: 50, entries: 320 })).toBe('12/58 ・ ITM 50 ・ 320 entries');
    expect(mttCountsLine({ rank: 12 })).toBe('#12');
    expect(mttCountsLine({ left: 58 })).toBe('58 left');
    expect(mttCountsLine({})).toBe('');
    expect(mttCountsLine({ avg: 10, speed: 5, prize: 'flat' })).toBe('');
  });
  it('Tournament Type は段階の無い Slider で、左 Deep・右 Turbo、0〜100', () => {
    expect(SPEED_DEF.ends).toEqual(['Deep', 'Turbo']);
    expect(SPEED_DEF.max).toBe(100);
    expect(SPEED_DEF.cuts).toBeNull();
    expect(SPEED_DEF.labels).toBeUndefined();
  });
});
