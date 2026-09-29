// T-E: test-results-te/e01/*.json をまとめて、種類ごと・場面ごとに表示する（node e2e/release/te-summary.mjs [フォルダ]）
import { readdirSync, readFileSync } from 'node:fs';

const dir = process.argv[2] ?? 'test-results-te/e01';
const rows = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const byKey = new Map();
for (const r of rows) {
  for (const i of r.issues) {
    // 詳細から数値を除いて、同じ種類の問題を畳む
    const k = `${i.type} | ${r.scene} | ${i.detail.replace(/-?\d+(\.\d+)?/g, '#')}`;
    const e = byKey.get(k) ?? { type: i.type, scene: r.scene, detail: i.detail, sizes: [] };
    e.sizes.push(r.size);
    byKey.set(k, e);
  }
}
console.log(`files: ${rows.length}, with issues: ${rows.filter((r) => r.issues.length).length}`);
const list = [...byKey.values()].sort((a, b) => a.type.localeCompare(b.type) || a.scene.localeCompare(b.scene));
for (const e of list) console.log(`[${e.type}] ${e.scene} @ ${[...new Set(e.sizes)].join(',')}\n    ${e.detail}`);
