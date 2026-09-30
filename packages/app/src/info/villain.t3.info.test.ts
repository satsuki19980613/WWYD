import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INFO_SECTIONS, type InfoSectionId } from './infoSections.ts';

/**
 * T3-11: ⓘ（09 章と同じ文言・70 文字以内・7 項目以内）、利用規約・プライバシーポリシー（18 章 §7）。
 * 09 章の表を読み込んで、実装の文言と 1 文字ずつ照らす。
 */
const ROOT = resolve(__dirname, '../../../..');
const doc09 = (() => {
  const dir = resolve(ROOT, 'docs/detailed-spec');
  const f = readdirSync(dir).find((n) => n.startsWith('09-'));
  if (!f) throw new Error('09 章が無い');
  return readFileSync(resolve(dir, f), 'utf-8');
})();

const SECTION_OF_HEADING: Record<string, InfoSectionId> = {
  '§0 ログイン': 'login',
  '§1 List': 'list',
  '§2 Range 入力': 'answer',
  '§3 集計': 'result',
  '§4 Post': 'new',
  '§4.1 下書き': 'drafts',
  '§5 アカウント': 'account',
};

/** 09 章の「## §N ...」の表（| 見出し | 本文 |）を節ごとに読む */
function parse09(): Record<string, { term: string; desc: string }[]> {
  const out: Record<string, { term: string; desc: string }[]> = {};
  let cur: string | null = null;
  for (const line of doc09.split('\n')) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      cur = SECTION_OF_HEADING[(h[1] as string).trim()] ?? null;
      if (cur) out[cur] = [];
      continue;
    }
    if (!cur) continue;
    const m = /^\| (.+?) \| (.+) \|$/.exec(line);
    if (!m || m[1] === '見出し' || /^-+$/.test(m[1] as string)) continue;
    (out[cur] as { term: string; desc: string }[]).push({ term: m[1] as string, desc: m[2] as string });
  }
  return out;
}

describe('T3-11 ⓘ の文言は 09 章と同じ', () => {
  const d = parse09();
  it('09 章の表を読めている（節が 7 つ）', () => {
    expect(Object.keys(d).sort()).toEqual(['account', 'answer', 'drafts', 'list', 'login', 'new', 'result']);
  });
  for (const id of Object.keys(SECTION_OF_HEADING).map((k) => SECTION_OF_HEADING[k] as InfoSectionId)) {
    it(`節 ${id}: 項目の見出しと本文・並びが 09 章と 1 文字も違わない`, () => {
      const items = INFO_SECTIONS[id].items.map((i) => ({ term: i.term, desc: i.desc }));
      expect(items).toEqual(d[id]);
    });
  }
  it('Villain の項目（回答・集計・Post）は 70 文字以内、1 節 7 項目以内', () => {
    for (const id of ['answer', 'result', 'new', 'list'] as const) {
      expect(INFO_SECTIONS[id].items.length).toBeLessThanOrEqual(7);
      for (const i of INFO_SECTIONS[id].items) expect([...i.desc].length, `${id}/${i.term}`).toBeLessThanOrEqual(70);
    }
  });
  it('Memo・Read Confidence・旧仕様の語が無い', () => {
    const all = JSON.stringify(INFO_SECTIONS);
    for (const w of ['Memo', 'Read Confidence', 'Regular', 'PKO', 'Satellite', 'Stage', 'Bubble']) expect(all, w).not.toContain(w);
  });
  it('Villain の項目は回答・集計・Post・List（印）にあり、ほかの節には無い', () => {
    const has = (id: InfoSectionId): boolean => INFO_SECTIONS[id].items.some((i) => /Villain|Reads/.test(i.term + i.desc));
    expect(has('answer')).toBe(true);
    expect(has('result')).toBe(true);
    expect(has('new')).toBe(true);
    expect(has('list')).toBe(true);
    expect(has('drafts')).toBe(false);
    expect(has('account')).toBe(false);
  });
  it('項目の文は説明だけで、英語の用語は 15 章のとおり（Steal・Lean・Preset・All Villains・Over・Value-heavy など）', () => {
    // 2026-09-30 さつき: 登録できる席に Steal に Fold した Blind を足し（V-015）、回答・集計に Read の定義と Size の境目を足した（V-016）
    const t = INFO_SECTIONS.new.items.find((i) => i.term === 'Villain')?.desc ?? '';
    expect(t).toContain('Steal');
    expect(t).toContain('Lean');
    expect(t).toContain('Preset');
    for (const id of ['answer', 'result'] as const) {
      const a = INFO_SECTIONS[id].items.find((i) => i.term === 'Read')?.desc ?? '';
      expect(a).toContain('All Villains');
      expect(a).toContain('Over・Under は頻度');
      expect(a).toContain('Value・Bluff-heavy は打つ手の中身');
    }
    expect(INFO_SECTIONS.answer.items.find((i) => i.term === 'Size')?.desc).toContain('50% 未満が Small');
    // カタカナのポーカー用語（ヴィラン・リード・プリセット・ストリート・ベット等）を使わない
    for (const w of ['ヴィラン', 'ビラン', 'リード', 'プリセット', 'ストリート', 'ベット', 'レイズ', 'スタック', 'スポットリード']) {
      expect(JSON.stringify(INFO_SECTIONS), w).not.toContain(w);
    }
  });
});

describe('T3-11 利用規約・プライバシーポリシー', () => {
  const terms = readFileSync(resolve(ROOT, 'packages/app/src/legal/terms.md'), 'utf-8');
  const privacy = readFileSync(resolve(ROOT, 'packages/app/src/legal/privacy.md'), 'utf-8');
  it('規約 §1: Memo の行が消え、タイトルの行と誹謗中傷の行は残る', () => {
    const s1 = /## 1\. 禁止事項([\s\S]*?)## 2\./.exec(terms)?.[1] ?? '';
    expect(s1).not.toMatch(/Memo/);
    expect(s1).not.toMatch(/Villain の情報（/);
    expect(s1).toContain('Spot のタイトルに、実在の人物を特定できる情報');
    expect(s1).toContain('他人を誹謗中傷すること');
  });
  it('規約 §2: 禁止事項に反する投稿の削除・非表示の文', () => {
    expect(terms).toContain('禁止事項に反する投稿や不適切な投稿は、予告なく削除することがあります。');
  });
  it('規約 §3: 免責に Villain の情報は主観的な評価（Memo の語なし）', () => {
    const s3 = /## 3\. 免責([\s\S]*?)## 4\./.exec(terms)?.[1] ?? '';
    expect(s3).toContain('投稿に付いた Villain の情報は、投稿者の主観的な評価です。');
    expect(s3).not.toMatch(/Memo|スライダー/);
    expect(s3).toContain('本サービスの利用によって生じた損害について');
  });
  it('プライバシーポリシー §1: 下書きと Preset は端末のブラウザにだけ保存しサーバーに送信しない', () => {
    expect(privacy).toContain('投稿の下書きと Villain の情報の Preset は、その端末のブラウザにだけ保存し、サーバーには送信しません。');
  });
  it('Memo の語が規約・ポリシーのどこにも無い', () => {
    expect(terms).not.toMatch(/Memo/);
    expect(privacy).not.toMatch(/Memo/);
  });
  it('規約・ポリシーにカタカナのポーカー用語の不統一が無い（Villain は英字）', () => {
    for (const w of ['ヴィラン', 'ビラン', 'プリセット']) {
      expect(terms).not.toContain(w);
      expect(privacy).not.toContain(w);
    }
  });
  it('プライバシーポリシー §3 は Villain の情報の閲覧（投稿者は匿名のまま）と矛盾しない', () => {
    // 「投稿や回答が誰のものかは、他の利用者には表示されません」。Villain の情報は投稿者の主観の選択肢だけ（個人を特定する欄が無い）
    expect(privacy).toContain('投稿や回答が誰のものかは、他の利用者には表示されません。');
  });
});
