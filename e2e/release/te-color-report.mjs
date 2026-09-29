// T-E: test-results-te/colors/*.json を、色の系統ごと・要素ごとにまとめる
//   node e2e/release/te-color-report.mjs [red|yellow|cyan]
import { readdirSync, readFileSync } from 'node:fs';

const fam = process.argv[2] ?? 'red';
const dir = 'test-results-te/colors';
const data = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const map = new Map();
for (const r of data)
  for (const c of r.colors) {
    if (c.family !== fam) continue;
    const key = `${c.el} [${c.prop}] < ${c.ancestors.split(' < ')[0] ?? ''}`;
    const e = map.get(key) ?? { n: 0, scenes: new Set(), texts: new Set(), rgb: new Set() };
    e.n++;
    e.scenes.add(r.scene);
    if (c.text) e.texts.add(c.text);
    e.rgb.add(`${c.rgb}/${c.alpha}`);
    map.set(key, e);
  }
for (const [k, e] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  console.log(`${k}  n=${e.n} scenes=${[...e.scenes].slice(0, 3).join(',')}${e.scenes.size > 3 ? '…' : ''} rgb=${[...e.rgb].slice(0, 2).join(';')} text=${[...e.texts].slice(0, 3).join('|')}`);
console.log(`-- ${map.size} 種類`);
