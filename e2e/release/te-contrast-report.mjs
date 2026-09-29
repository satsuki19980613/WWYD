// T-E: test-results-te/contrast/*.json をまとめる
//   node e2e/release/te-contrast-report.mjs contrast|size|tap [view]
import { readdirSync, readFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'contrast';
const view = process.argv[3];
const dir = 'test-results-te/contrast';
const data = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))).filter((r) => !view || r.label === view);
const map = new Map();
const add = (k, r, extra) => {
  const e = map.get(k) ?? { scenes: new Set(), extra };
  e.scenes.add(`${r.label}:${r.scene}`);
  map.set(k, e);
};
if (mode === 'contrast') {
  for (const r of data)
    for (const t of r.text)
      if (!t.disabled && t.ratio < (t.large ? 3 : 4.5)) add(`${t.ratio}:1 fg=${t.fg} bg=${t.bg} ${t.fontPx}px ${t.el} "${t.text}"`, r);
} else if (mode === 'pair') {
  // 色の組み合わせ（fg,bg）ごとの最小比と個数
  const pairs = new Map();
  for (const r of data)
    for (const t of r.text) {
      if (t.disabled) continue;
      const k = `fg=${t.fg} bg=${t.bg}`;
      const e = pairs.get(k) ?? { min: 99, n: 0, ex: new Set(), small: 0 };
      e.min = Math.min(e.min, t.ratio);
      e.n++;
      e.ex.add(t.el);
      if (t.ratio < (t.large ? 3 : 4.5)) e.small++;
      pairs.set(k, e);
    }
  for (const [k, e] of [...pairs.entries()].sort((a, b) => a[1].min - b[1].min).slice(0, 25))
    console.log(`${e.min}:1 ${k} n=${e.n} 不足=${e.small} 例=${[...e.ex].slice(0, 3).join(' ')}`);
  process.exit(0);
} else if (mode === 'size') {
  for (const r of data) for (const t of r.text) if (t.fontPx < 11) add(`${t.fontPx}px ${t.el} "${t.text}"`, r);
} else if (mode === 'tap') {
  for (const r of data) for (const t of r.targets) if (Math.min(t.w, t.h) < 44) add(`${t.w}x${t.h} ${t.el} "${t.label}"`, r);
}
for (const [k, e] of [...map.entries()].sort()) console.log(`${k}   (${[...e.scenes].slice(0, 3).join(', ')}${e.scenes.size > 3 ? ` 他${e.scenes.size - 3}` : ''})`);
console.log(`-- ${map.size} 種類`);
