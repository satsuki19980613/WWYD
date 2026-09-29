// T-E: test-results-te/texts/*.json から、面ごとの文言の一覧（説明文らしい文・カタカナの連なり）を出す
//   node e2e/release/te-text-report.mjs [sentences|katakana|all-screen|dump <scene>]
import { readdirSync, readFileSync } from 'node:fs';

import { katakanaViolations } from './te-terms.ts';
const dir = 'test-results-te/texts';
const data = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const mode = process.argv[2] ?? 'sentences';

const SENTENCE = /(してください|ください|できます|できません|されます|されません|します|しました|しています|ています|です。|ます。|ました。|しましょう|。(?!bb))/;
const map = new Map();
const add = (key, r) => {
  const e = map.get(key) ?? new Set();
  e.add(`${r.label}:${r.scene}`);
  map.set(key, e);
};

if (mode === 'sentences') {
  for (const r of data) for (const i of r.items) if (SENTENCE.test(i.text) && i.ctx !== 'legal') add(`[${i.ctx}/${i.kind}] ${i.text}`, r);
} else if (mode === 'katakana') {
  for (const r of data) for (const i of r.items) for (const k of i.text.match(/[ァ-ヴー]+/g) ?? []) add(`${k}  ← [${i.ctx}] ${i.text.slice(0, 60)}`, r);
} else if (mode === 'kata') {
  for (const r of data) for (const i of r.items) { const v = katakanaViolations(i.text); if (v.length) add(`${v.join(',')}  ← [${i.ctx}/${i.kind}] ${i.text.slice(0, 70)}`, r); }
} else if (mode === 'screen-text') {
  // 画面（ctx=screen）の文字のうち長さ 8 以上のもの（説明文の見落としを目で確かめる）
  for (const r of data) for (const i of r.items) if (i.ctx === 'screen' && i.kind === 'text' && i.text.length >= 8) add(i.text, r);
} else if (mode === 'dump') {
  for (const r of data) if (r.scene === process.argv[3]) for (const i of r.items) add(`[${r.label}][${i.ctx}/${i.kind}] ${i.text}`, r);
}
const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [k, v] of rows) console.log(`${k}\n      (${[...v].slice(0, 4).join(', ')}${v.size > 4 ? ` 他${v.size - 4}` : ''})`);
console.log(`-- ${rows.length} 種類`);
