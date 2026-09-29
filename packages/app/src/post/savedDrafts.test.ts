import { describe, expect, it } from 'vitest';
import { emptyDraft, type Draft } from './draft.ts';
import { deleteDraft, draftSummary, MAX_DRAFTS, readDrafts, sanitizeDraft, saveDraft, type KeyValue } from './savedDrafts.ts';

function memory(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const draft = (title: string): Draft => ({ ...emptyDraft(), players: 6, title });
const at = (min: number): Date => new Date(Date.UTC(2026, 8, 29, 0, min));

describe('下書きの保存（14 章 §3.5）', () => {
  it('利用者ごとに 3 件まで。4 件目は full、上書きはできる', () => {
    const s = memory();
    const ids: string[] = [];
    for (let i = 0; i < MAX_DRAFTS; i++) {
      const r = saveDraft('u1', draft(`d${i}`), null, at(i), s);
      expect(r.ok).toBe(true);
      if (r.ok) ids.push(r.id);
    }
    expect(saveDraft('u1', draft('d3'), null, at(9), s)).toEqual({ ok: false, reason: 'full' });
    // 開いた下書きの続きは上書き
    expect(saveDraft('u1', draft('d0 続き'), ids[0] as string, at(10), s)).toEqual({ ok: true, id: ids[0] });
    // 新しい順
    expect(readDrafts('u1', s).map((e) => e.draft.title)).toEqual(['d0 続き', 'd2', 'd1']);
    // 別の利用者は別
    expect(readDrafts('u2', s)).toEqual([]);
    deleteDraft('u1', ids[1] as string, s);
    expect(readDrafts('u1', s).map((e) => e.draft.title)).toEqual(['d0 続き', 'd2']);
    expect(saveDraft('u1', draft('d4'), null, at(11), s).ok).toBe(true);
  });

  it('保存できない（ストレージが使えない）ときは unavailable', () => {
    expect(saveDraft('u1', draft('x'), null, at(0), null)).toEqual({ ok: false, reason: 'unavailable' });
    const broken: KeyValue = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => undefined };
    expect(saveDraft('u1', draft('x'), null, at(0), broken)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('壊れた保存内容は読まない・項目は空の下書きで埋める', () => {
    const s = memory();
    s.setItem('wwyd.drafts.v1.u1', '{not json');
    expect(readDrafts('u1', s)).toEqual([]);
    s.setItem('wwyd.drafts.v1.u1', JSON.stringify([{ id: 'a', savedAt: '2026-09-29T00:00:00Z', draft: { title: 't', players: 9 } }, { x: 1 }]));
    const list = readDrafts('u1', s);
    expect(list).toHaveLength(1);
    expect(list[0]?.draft).toEqual({ ...emptyDraft(), title: 't' });
  });

  it('再生できない Action はその手から後を捨てる（画面の settleActions と同じ。Board は残す。R3-1）', () => {
    const d = sanitizeDraft({
      ...draft('t'),
      actions: [{ street: 'pf', pos: 'BB', type: 'raise', to: 1 }],
      board: ['Ah'],
      spotIndex: 0,
    });
    expect(d.actions).toEqual([]);
    expect(d.board).toEqual(['Ah']);
    expect(d.spotIndex).toBeNull();
    expect(d.title).toBe('t');
  });

  it('形の壊れた Action（null など）は捨てる。人数が未選択でも画面が落ちない（リリース前レビュー R3-3）', () => {
    for (const actions of [[null], [{ street: 'pf' }], [{ street: 'pf', pos: 'UTG', type: 'raise', to: '2' }], 'x']) {
      const d = sanitizeDraft({ ...emptyDraft(), players: null, actions });
      expect(d.actions).toEqual([]);
    }
  });

  it('札でない Board と、整数でない・候補に無い Spot は捨てる（リリース前テスト TB-3）', () => {
    for (const spotIndex of [0.5, -1, 1e21, 3]) {
      const d = sanitizeDraft({ ...draft('t'), board: ['Ah', 'zz', '<script>', 7], spotIndex });
      expect(d.board).toEqual(['Ah']);
      expect(d.spotIndex).toBeNull();
    }
  });

  it('一覧の文言: タイトル（無ければ「タイトルなし」）と人数・Hero・Street・Action 数', () => {
    const d: Draft = {
      ...draft(''),
      hands: { ...emptyDraft().hands, BTN: 'AdKd' },
      actions: [
        { street: 'pf', pos: 'UTG', type: 'fold' },
        { street: 'pf', pos: 'HJ', type: 'fold' },
      ],
    };
    const s = draftSummary(d);
    expect(s.title).toBe('タイトルなし');
    expect(s.meta).toMatch(/^6 人 · Hero BTN A♦K♦ · \S+ · 2 Action$/);
  });
});
