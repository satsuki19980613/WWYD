import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { boardChips, crop, PLAYER_ROWS_Y, playerCardChips, type RgbaImage } from '../../packages/ocr/src/index.ts';
import { decodePng } from './png.mts';
// チップの中の数字の左端と上端（左端の列から 6 列の範囲の最上段）
function pos(img: RgbaImage): [number, number] {
  const { width: w, height: h, data } = img;
  const g = (x: number, y: number) => ((data[(y * w + x) * 4] ?? 0) + (data[(y * w + x) * 4 + 1] ?? 0) + (data[(y * w + x) * 4 + 2] ?? 0)) / 3;
  let mn = 999, mx = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { mn = Math.min(mn, g(x, y)); mx = Math.max(mx, g(x, y)); }
  const th = (mn + mx) / 2 + 20; let left = 999, top = 999;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g(x, y) > th) left = Math.min(left, x);
  for (let y = 0; y < h; y++) for (let x = left; x < left + 6; x++) if (g(x, y) > th) top = Math.min(top, y);
  return [left, top];
}
const POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const by: Record<string, Set<string>> = {};
const layout = new Set<string>();
let n = 0;
for (const f of readdirSync('sample/sp').filter((x) => x.endsWith('.png') && !x.includes('(1)') || x.endsWith('(1).png'))) {
  const base = f.replace(/ \(\d+\)/, '');
  const ep = `sample/sp/${f.replace('.png', '.expected.json')}`; if (!existsSync(ep)) continue;
  const exp = JSON.parse(readFileSync(ep, 'utf8'));
  const sp = decodePng(readFileSync(`sample/sp/${f}`)); const pc = decodePng(readFileSync(`sample/pc/${base}`));
  const add = (key: string, a: RgbaImage, b: RgbaImage) => { const [x1, y1] = pos(a), [x2, y2] = pos(b); (by[key] ??= new Set()).add(`${x1 - x2 >= 0 ? '+' : ''}${x1 - x2},${y1 - y2 >= 0 ? '+' : ''}${y1 - y2}`); n++; };
  POS.forEach((p, i) => { const cs = playerCardChips(sp, PLAYER_ROWS_Y[i]!), cp = playerCardChips(pc, PLAYER_ROWS_Y[i]!); [0, 1].forEach((k) => add(`行:${exp.hands[p][k]}`, crop(sp, cs[k]!), crop(pc, cp[k]!))); });
  const bs = boardChips(sp).flat(), bp = boardChips(pc).flat();
  layout.add(`${f.slice(9, 29)} ボードのチップの y: sp ${bs.map((c) => c.box[1]).join('/')} pc ${bp.map((c) => c.box[1]).join('/')}`);
  bs.forEach((c, k) => { if (bp[k]) add(`盤:${exp.board[k]}`, crop(sp, c.box), crop(pc, bp[k]!.box)); });
}
const keys = Object.keys(by).sort();
const inconsistent = keys.filter((k) => by[k]!.size > 1);
console.log('比べたカード', n, '種類', keys.length, 'ずれが画像ごとに違う種類', inconsistent.length);
for (const k of inconsistent) console.log('  ', k, [...by[k]!].join(' | '));
const byRank: Record<string, Set<string>> = {};
for (const k of keys) for (const v of by[k]!) (byRank[k.split(':')[0] + ':' + k.split(':')[1]![0]] ??= new Set()).add(v);
console.log(Object.entries(byRank).map(([k, v]) => `${k}=${[...v].join('|')}`).join('  '));
for (const l of layout) if (!l.endsWith('sp  pc ')) console.log(l);
