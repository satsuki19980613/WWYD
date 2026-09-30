/**
 * Villain・MTT の情報の画面での扱い（詳細仕様 18 章）。
 */
import { bbToMbb, validateInput, verifyPost, type Action, type Pos, type ReadEntry } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { hs1bb, type Raw } from '../../../core/src/post/postFixtures.ts';
import { buildSubmission, emptyDraft, submissionBody, villainContext, type Draft } from '../post/draft.ts';
import { sanitizeDraft, type KeyValue } from '../post/savedDrafts.ts';
import { deletePreset, MAX_PRESETS, presetOf, readPresets, savePreset } from './readPresets.ts';
import {
  clearRead,
  cycleLean,
  defLabel,
  emptyGeneral,
  emptyMtt,
  generalEntry,
  incompleteSeats,
  isEmptySeat,
  labelOf,
  MTT_FIELD_LABEL,
  MTT_FIELDS,
  mttCountsLine,
  parseMtt,
  readLine,
  readSpeech,
  readsForSubmit,
  sanitizeSeat,
  seatSummary,
  setGeneralAction,
  setGeneralStreet,
  setRead,
  SPEED_DEF,
  spotCandidateOf,
  STEP_DEF,
  tendencyChips,
  toggleRunout,
  toggleSize,
  toggleStep,
  toggleTexture,
  villainOrder,
  type GeneralDraft,
} from './readsModel.ts';

describe('VPIP・PFR の段階のラベル（18 章 §2.1）', () => {
  it('VPIP の境目', () => {
    expect([0, 14, 15, 21, 22, 29, 30, 39, 40, 100].map((v) => labelOf('vpip', v))).toEqual([
      'Very Tight',
      'Very Tight',
      'Tight',
      'Tight',
      'Standard',
      'Standard',
      'Loose',
      'Loose',
      'Very Loose',
      'Very Loose',
    ]);
  });

  it('PFR の境目', () => {
    expect([7, 8, 13, 14, 19, 20, 25, 26].map((v) => labelOf('pfr', v))).toEqual(['Very Low', 'Low', 'Low', 'Standard', 'Standard', 'High', 'High', 'Very High']);
  });

  it('5 分割のボタンのラベル（§10 C-1）', () => {
    expect(STEP_DEF.agg.labels).toEqual(['Very Passive', 'Passive', 'Balanced', 'Aggressive', 'Very Aggressive']);
    expect(STEP_DEF.image.labels).toEqual(['Very Tight', 'Tight', 'Standard', 'Loose', 'Very Loose']);
    expect(STEP_DEF.sample.labels).toEqual(['First Impression', 'Few Orbits', 'Some History', 'Long', 'HUD Stats']);
  });
});

describe('入力の操作（18 章 §2.1・§2.2）', () => {
  it('PFR を VPIP より上げると VPIP も上がり、VPIP を PFR より下げると PFR も下がる', () => {
    expect(setRead({ vpip: 20, pfr: 10 }, 'pfr', 30)).toEqual({ vpip: 30, pfr: 30 });
    expect(setRead({ vpip: 30, pfr: 25 }, 'vpip', 18)).toEqual({ vpip: 18, pfr: 18 });
  });
  it('片方が未入力なら追従しない。範囲に丸める', () => {
    expect(setRead({}, 'pfr', 30)).toEqual({ pfr: 30 });
    expect(setRead({ pfr: 30 }, 'vpip', 10)).toEqual({ pfr: 10, vpip: 10 });
    expect(setRead({}, 'vpip', 120)).toEqual({ vpip: 100 });
  });
  it('5 分割のボタンは押すと選び、もう一度押すと未入力（中央と未入力は別）', () => {
    const r = toggleStep({}, 'agg', 2);
    expect(r).toEqual({ agg: 2 });
    expect(toggleStep(r, 'agg', 3)).toEqual({ agg: 3 });
    expect(toggleStep(r, 'agg', 2)).toEqual({});
    expect(isEmptySeat(clearRead({ vpip: 3 }, 'vpip'))).toBe(true);
  });
  it('Lean は 未選択 → 通常 → 強い → 未選択。別の Lean を押すとそれの通常（§10 C-6）', () => {
    let l = cycleLean({ lean: null, strong: false }, 'over');
    expect(l).toEqual({ lean: 'over', strong: false });
    l = cycleLean(l, 'over');
    expect(l).toEqual({ lean: 'over', strong: true });
    expect(cycleLean(l, 'under')).toEqual({ lean: 'under', strong: false });
    expect(cycleLean(l, 'over')).toEqual({ lean: null, strong: false });
  });
  it('General Read: Street を変えると合わない Action・条件・Size・Lean を外す', () => {
    let g: GeneralDraft = setGeneralStreet(emptyGeneral(), 'turn');
    g = setGeneralAction(g, 'barrel');
    g = toggleTexture(g, 'high', 'a');
    g = toggleRunout(toggleRunout(g, 'pair'), 'over');
    g = toggleSize(g, 'overbet');
    g = { ...g, ...cycleLean(g, 'value') };
    expect(generalEntry(g)).toEqual({
      scope: 'general',
      street: 'turn',
      action: 'barrel',
      texture: { high: 'a' },
      runout: ['over', 'pair'],
      size: 'overbet',
      lean: 'value',
      strong: false,
    });
    // Flop に変えると Barrel・Runout・Size・Lean は外れ、texture は残る
    const f = setGeneralStreet(g, 'flop');
    expect(f).toMatchObject({ street: 'flop', action: null, texture: { high: 'a' }, runout: [], size: null, lean: null });
    // Preflop は texture も外れる。Fold 系の Action は Size と Value-heavy を外す
    expect(setGeneralStreet(g, 'pf').texture).toEqual({});
    const fold = setGeneralAction(g, 'fold_bet');
    expect(fold).toMatchObject({ size: null, lean: null });
    // 同じ Street・Action を押すと外す
    expect(setGeneralStreet(g, 'turn')).toEqual(emptyGeneral());
    expect(setGeneralAction(g, 'barrel').action).toBeNull();
  });
  it('V-039: Runout の Brick はほかと同時に選べない（Brick を選ぶとほかを外し、ほかを選ぶと Brick を外す）', () => {
    let g: GeneralDraft = setGeneralStreet(emptyGeneral(), 'river');
    g = toggleRunout(toggleRunout(g, 'flush'), 'over');
    expect(g.runout).toEqual(['over', 'flush']);
    g = toggleRunout(g, 'brick');
    expect(g.runout).toEqual(['brick']);
    g = toggleRunout(g, 'pair');
    expect(g.runout).toEqual(['pair']);
    expect(toggleRunout(g, 'pair').runout).toEqual([]);
  });
});

const entry = (over: Partial<ReadEntry> = {}): ReadEntry => ({
  scope: 'general',
  street: 'river',
  action: 'barrel',
  texture: null,
  runout: null,
  size: 'big',
  lean: 'value',
  strong: false,
  ...over,
});

describe('表示（18 章 §2.1.2・§2.1.6）', () => {
  it('Read の 1 行は英語と記号だけ。条件は Street と Action の間、強いは ++', () => {
    expect(readLine(entry())).toBe('River · Barrel (Big) → Value-heavy');
    expect(readLine(entry({ street: 'flop', action: 'fold_cbet', size: null, lean: 'over' }))).toBe('Flop · Fold to C-Bet → Over');
    expect(readLine(entry({ street: 'turn', runout: ['flush'], size: null, lean: 'under' }))).toBe('Turn · Flush Complete · Barrel → Under');
    expect(readLine(entry({ street: 'flop', action: 'cbet', texture: { high: 'a' }, size: null, lean: 'over', strong: true }))).toBe('Flop · A-high · C-Bet → Over++');
    expect(readLine(entry({ action: 'raise', size: null }), true)).toBe('River · Check-Raise → Value-heavy');
    expect(readLine(entry({ street: 'flop', action: 'cbet', size: null, texture: { connect: 'straight' } }))).toBe('Flop · Straight possible · C-Bet → Value-heavy');
    expect(readSpeech(entry({ strong: true }))).toBe('River · Barrel (Big) → Value-heavy（強い）');
  });
  it('全体の傾向のチップ: VPIP・PFR は数、Aggression・Hero Image の中央は出さない、Sample は中央も出す（§10 C-2）', () => {
    expect(tendencyChips({ vpip: 38, pfr: 12, agg: 1, sample: 3 })).toEqual(['VPIP 38', 'PFR 12', 'Passive', 'Sample: Long']);
    expect(tendencyChips({ agg: 2, image: 2, sample: 2 })).toEqual(['Sample: Some History']);
    expect(tendencyChips({ image: 3 })).toEqual(['Hero Image: Loose']);
  });
  it('折りたたんだ席の 1 行', () => {
    expect(seatSummary({ vpip: 30, pfr: 22, agg: 3, general: [emptyGeneral()] })).toBe('30/22 · Aggressive');
    expect(seatSummary({ vpip: 45, spot: { street: 'flop', action: 'cbet', lean: 'over', strong: false } })).toBe('VPIP 45 · 1 Read');
    expect(seatSummary(undefined)).toBe('');
  });
  it('V-012: 候補を渡すと、候補に当たらない（送らない）Spot Read は数えない', () => {
    const spot = { street: 'flop', action: 'cbet', size: 'small', lean: 'over', strong: false } as const;
    const cand = { index: 7, pos: 'BTN', street: 'flop', action: 'cbet', size: 'small', checkRaise: false } as const;
    expect(seatSummary({ vpip: 45, spot }, [cand])).toBe('VPIP 45 · 1 Read');
    expect(seatSummary({ vpip: 45, spot }, [])).toBe('VPIP 45');
    expect(seatSummary({ vpip: 45, spot }, [{ ...cand, size: 'big' }])).toBe('VPIP 45');
  });
});

describe('MTT の欄（18 章 §2.4）', () => {
  it('空は null、数は整数、Avg Stack は小数第 1 位まで', () => {
    expect(parseMtt(emptyMtt())).toEqual({ info: null, invalid: [] });
    const m = { ...emptyMtt(), speed: 4, rank: '12', left: '58', paid: '50', entries: '320', avg: '32.5' };
    expect(parseMtt(m)).toEqual({ info: { speed: 4, rank: 12, left: 58, entries: 320, paid: 50, avg: 32.5 }, invalid: [] });
    expect(parseMtt({ ...emptyMtt(), rank: '1.5', avg: '3.25', entries: '0' }).invalid).toEqual(['rank', 'entries', 'avg']);
  });
  it('Tournament Type は 0（Deep）〜 100（Turbo）の連続した値で、段階を付けない。0 も入力として送る', () => {
    expect(parseMtt({ ...emptyMtt(), speed: 0 })).toEqual({ info: { speed: 0 }, invalid: [] });
    expect(parseMtt({ ...emptyMtt(), speed: 100 })).toEqual({ info: { speed: 100 }, invalid: [] });
    expect(SPEED_DEF.ends).toEqual(['Deep', 'Turbo']);
    expect(defLabel(SPEED_DEF, 70)).toBe(''); // 段階のラベルは付けない
  });
  it('数の欄の名前は日本語（スポットの順位・残りの人数・エントリー数・ITM・Avg Stack の順）', () => {
    expect(MTT_FIELDS.map((f) => MTT_FIELD_LABEL[f])).toEqual(['スポットの順位', '残りの人数', 'エントリー数', 'ITM', 'Avg Stack（bb）']);
  });
  it('「12/58 ・ ITM 50 ・ 320 entries」', () => {
    expect(mttCountsLine({ rank: 12, left: 58, paid: 50, entries: 320 })).toBe('12/58 ・ ITM 50 ・ 320 entries');
    expect(mttCountsLine({ paid: 50 })).toBe('ITM 50');
    expect(mttCountsLine({ rank: 3 })).toBe('#3');
    expect(mttCountsLine({})).toBe('');
  });
});

describe('All Villains の並び', () => {
  it('Preflop で Fold した席を下に（Hero は除く）', () => {
    const actions: Action[] = [
      { street: 'pf', pos: 'UTG', type: 'fold' },
      { street: 'pf', pos: 'HJ', type: 'call' },
      { street: 'pf', pos: 'CO', type: 'fold' },
      { street: 'pf', pos: 'BTN', type: 'raise', to: 2500 },
      { street: 'flop', pos: 'HJ', type: 'fold' },
    ];
    expect(villainOrder(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], 'BTN', actions)).toEqual({
      active: ['HJ', 'SB', 'BB'],
      folded: ['UTG', 'CO'],
    });
  });
});

/** 見本（03 章 §3.1 の形）をそのまま下書きにする（Action は mbb） */
function draftOf(raw: Raw): Draft {
  const stacks = raw.stacks as Record<Pos, number>;
  const hands = { ...emptyDraft().hands, [raw.hero as Pos]: (raw.hero_cards as string[]).join('') };
  for (const [p, cards] of Object.entries((raw.known_cards ?? {}) as Record<string, string[]>)) hands[p as Pos] = cards.join('');
  return {
    ...emptyDraft(),
    players: 6,
    fmt: raw.fmt as Draft['fmt'],
    sb: String(raw.sb),
    ante: String(raw.ante),
    rake: raw.rake === null ? '' : String(raw.rake),
    stacks: Object.fromEntries(Object.entries(stacks).map(([p, v]) => [p, String(v)])) as Record<Pos, string>,
    hero: raw.hero as Pos,
    hands,
    actions: (raw.actions as Raw[]).map((a) => (typeof a.to === 'number' ? { ...a, to: bbToMbb(a.to) } : { ...a })) as Action[],
    board: raw.board as Draft['board'],
    spotIndex: raw.spot_index as number,
    title: raw.title as string,
  };
}

describe('投稿の本文（画面とサーバーの一致）', () => {
  // H-S1 を BB の手番で出題（ターンの BTN b6.5 に向き合う）。登録できる席は SB（Fold to Steal）と BTN
  const base = (): Draft => draftOf(hs1bb());

  it('登録できる席と Spot Read の候補（core の villainSeats・readCandidates）', () => {
    const v = villainContext(base());
    expect(v.seats).toEqual(['BTN', 'SB']);
    expect(v.cands.map((c) => `${c.pos} ${c.action} ${c.size ?? '-'}`)).toEqual(['SB fold_steal -', 'BTN cbet small', 'BTN barrel big']);
    expect(villainContext({ ...base(), spotIndex: null }).cands).toEqual([]);
  });

  it('情報なしならキーを送らない。登録できない席・候補に無い Spot Read・途中の General Read は送らない', () => {
    const d = base();
    expect(submissionBody(d)).not.toHaveProperty('villain_reads');
    expect(submissionBody(d)).not.toHaveProperty('mtt');
    const done = { ...setGeneralAction(setGeneralStreet(emptyGeneral(), 'flop'), 'cbet'), lean: 'over' as const };
    const body = submissionBody({
      ...d,
      reads: {
        BTN: { vpip: 30, spot: { street: 'turn', action: 'barrel', lean: 'value', strong: true }, general: [done, setGeneralStreet(emptyGeneral(), 'river')] },
        SB: { spot: { street: 'river', action: 'barrel', lean: 'over', strong: false } },
        UTG: { vpip: 10 },
      },
    });
    expect(body.villain_reads).toEqual({
      BTN: {
        vpip: 30,
        reads: [
          { scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: true },
          { scope: 'general', street: 'flop', action: 'cbet', texture: null, runout: null, size: null, lean: 'over', strong: false },
        ],
      },
    });
    // 送る本文は core の検証（サーバーと同じ）を通る
    expect(verifyPost(validateInput(body)).reads.BTN?.reads).toHaveLength(2);
    expect(submissionBody({ ...d, mtt: { ...emptyMtt(), speed: 1 } })).not.toHaveProperty('mtt');
    expect(submissionBody({ ...d, fmt: 'mtt', rake: '', mtt: { ...emptyMtt(), speed: 1 } }).mtt).toEqual({ speed: 1 });
  });

  it('途中の General Read は投稿の前のエラー（何も選んでいないものはエラーにしない）', () => {
    const d = base();
    const half = setGeneralStreet(emptyGeneral(), 'flop');
    expect(incompleteSeats({ BTN: { general: [half] }, SB: { general: [emptyGeneral()] } }, ['BTN', 'SB'])).toEqual(['BTN']);
    const s = buildSubmission({ ...d, reads: { BTN: { general: [half] } } });
    expect(s.ok).toBe(false);
    expect(!s.ok && s.errors).toContain('BTN の General Read を最後まで選んでください');
    expect(buildSubmission({ ...d, reads: { BTN: { general: [emptyGeneral()] } } }).ok).toBe(true);
  });

  it('V-010: 同じ Street・Action の候補が 2 つある Raise は、選んだ候補の Size で送る（最後の候補にしない）', () => {
    const cands = [
      { index: 8, pos: 'BB', street: 'flop', action: 'raise', size: 'small', checkRaise: true },
      { index: 10, pos: 'BB', street: 'flop', action: 'raise', size: 'big', checkRaise: true },
    ] as const;
    const pick = (size: 'small' | 'big' | undefined) =>
      readsForSubmit({ BB: { spot: { street: 'flop', action: 'raise', size, lean: 'over', strong: false } } }, ['BB'], cands).BB?.reads?.[0]?.size;
    expect(pick('small')).toBe('small');
    expect(pick('big')).toBe('big');
    // 前の版の下書き（Size なし）は判断地点にいちばん近い候補
    expect(pick(undefined)).toBe('big');
    expect(spotCandidateOf({ street: 'flop', action: 'raise', size: 'small', lean: 'over', strong: false }, 'BB', cands)?.index).toBe(8);
  });

  it('readsForSubmit: Spot Read の Size は実際の額から', () => {
    const v = villainContext(base());
    expect(readsForSubmit({ BTN: { spot: { street: 'flop', action: 'cbet', lean: 'under', strong: false } } }, v.seats, v.cands).BTN?.reads?.[0]?.size).toBe('small');
  });
});

describe('下書きの読み直し（前の版の下書き・壊れた値）', () => {
  it('項目の無い下書きは情報なし', () => {
    const d = sanitizeDraft({ title: 'x' });
    expect(d.reads).toEqual({});
    expect(d.mtt).toEqual(emptyMtt());
  });
  it('範囲の外・型の違う値は捨て、PFR が VPIP を超えていれば PFR を捨てる。前の版の Memo・Read Confidence は捨てる', () => {
    const d = sanitizeDraft({
      reads: { SB: { vpip: 20, pfr: 30, agg: 101, conf: 2, memo: 'x', sample: 2 }, XX: { vpip: 1 }, BB: 'x', CO: { memo: 'only' } },
      mtt: { stage: 'bubble', type: 'pko', speed: 150, prize: 'flat', rank: 3 },
    });
    expect(d.reads).toEqual({ SB: { vpip: 20, sample: 2 } });
    expect(d.mtt).toEqual({ ...emptyMtt(), prize: 'flat' });
    expect(sanitizeDraft({ mtt: { speed: 1 } }).mtt.speed).toBe(1);
  });
  it('Read は合わない値を外して読み直す', () => {
    const s = sanitizeSeat({
      spot: { street: 'flop', action: 'fold_bet', lean: 'value', strong: true },
      general: [{ street: 'pf', action: '3bet', texture: { high: 'a' }, size: 'overbet', lean: 'bluff', strong: true }, { street: 'x' }, 5],
    });
    expect(s.spot).toBeUndefined();
    expect(sanitizeSeat({ spot: { street: 'flop', action: 'raise', size: 'big', lean: 'over', strong: false } }).spot?.size).toBe('big');
    expect(sanitizeSeat({ spot: { street: 'pf', action: '3bet', size: null, lean: 'over', strong: false } }).spot?.size).toBeNull();
    expect(sanitizeSeat({ spot: { street: 'flop', action: 'raise', size: 'huge', lean: 'over', strong: false } }).spot).toEqual({ street: 'flop', action: 'raise', lean: 'over', strong: false });
    expect(s.general).toEqual([{ street: 'pf', action: '3bet', texture: {}, runout: [], size: null, lean: 'bluff', strong: true }]);
    // 前の版の Brick とほかの組み合わせは Brick を外す（V-039）
    expect(sanitizeSeat({ general: [{ street: 'turn', action: 'barrel', runout: ['brick', 'flush'] }] }).general?.[0]?.runout).toEqual(['flush']);
  });
});

function memoryStore(): KeyValue {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('Preset（18 章 §2.1.7。端末だけに保存。schema version つき）', () => {
  const done = (): GeneralDraft => ({ ...setGeneralAction(setGeneralStreet(emptyGeneral(), 'flop'), 'fold_cbet'), lean: 'over', strong: false });

  it('中身は全体の傾向と最後まで選んだ General Read（Spot Read は入れない）', () => {
    expect(presetOf({ vpip: 22, spot: { street: 'flop', action: 'cbet', lean: 'over', strong: false }, general: [done(), emptyGeneral()] })).toEqual({
      vpip: 22,
      general: [done()],
    });
  });

  it('保存・呼び出し・同じ名前は上書き・削除', () => {
    const s = memoryStore();
    expect(savePreset('u1', ' Reg ', { vpip: 22, pfr: 18 }, s)).toEqual({ ok: true });
    expect(savePreset('u1', 'Fish', { vpip: 50, general: [done()] }, s)).toEqual({ ok: true });
    expect(savePreset('u1', 'Reg', { vpip: 25, pfr: 20 }, s)).toEqual({ ok: true });
    const list = readPresets('u1', s);
    expect(list.map((p) => [p.name, p.read])).toEqual([
      ['Reg', { vpip: 25, pfr: 20 }],
      ['Fish', { vpip: 50, general: [done()] }],
    ]);
    expect(JSON.parse(s.getItem('wwyd.readPresets.u1') ?? '{}').schema).toBe(2);
    expect(readPresets('u2', s)).toEqual([]);
    deletePreset('u1', list[0]?.id ?? '', s);
    expect(readPresets('u1', s).map((p) => p.name)).toEqual(['Fish']);
  });

  it('名前が空・長すぎる、中身が空、上限、保存できない端末', () => {
    const s = memoryStore();
    expect(savePreset('u', '  ', { vpip: 1 }, s)).toEqual({ ok: false, reason: 'name' });
    expect(savePreset('u', 'x'.repeat(21), { vpip: 1 }, s)).toEqual({ ok: false, reason: 'name' });
    expect(savePreset('u', 'a', {}, s)).toEqual({ ok: false, reason: 'empty' });
    for (let i = 0; i < MAX_PRESETS; i++) savePreset('u', `p${i}`, { vpip: i }, s);
    expect(savePreset('u', 'over', { vpip: 1 }, s)).toEqual({ ok: false, reason: 'full' });
    expect(savePreset('u', 'p0', { vpip: 2 }, s)).toEqual({ ok: true });
    expect(savePreset('u', 'a', { vpip: 1 }, null)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('壊れた保存内容・前の版（schema なし・Memo の形）は読み飛ばす。書くと前の版の鍵を消す', () => {
    const s = memoryStore();
    s.setItem('wwyd.readPresets.u', '{bad');
    expect(readPresets('u', s)).toEqual([]);
    s.setItem('wwyd.readPresets.u', JSON.stringify([{ id: 'a', name: 'old', read: { vpip: 1 } }]));
    expect(readPresets('u', s)).toEqual([]);
    s.setItem('wwyd.readPresets.u', JSON.stringify({ schema: 2, presets: [{ id: 'a', name: '', read: {} }, { id: 'b', name: 'ok', read: { vpip: 500, memo: 'x' } }, 3] }));
    expect(readPresets('u', s)).toEqual([{ id: 'b', name: 'ok', read: {} }]);
    s.setItem('wwyd.readPresets.v1.u', '[]');
    savePreset('u', 'n', { vpip: 3 }, s);
    expect(s.getItem('wwyd.readPresets.v1.u')).toBeNull();
  });
});
