/**
 * カードのランクのテンプレート（packages/ocr/src/rankTemplates.ts）を正解データから作り直す。
 *
 *   node --experimental-strip-types scripts/ocr/genRankTemplates.mts [--check] [フォルダ ...]
 *
 * 既定のフォルダは sample/pc（git 管理外。個人の対戦画像）。各 `<名前>.png` と `<名前>.expected.json`
 * （hands・board のラベルは目視で確かめたもの）の組から、プレイヤー行とボードの全カードの字形を取り、
 * 同じ字形をまとめて保存する。別ラベル間の最小距離を表示するので、照合の上限（MAX_GLYPH_DISTANCE）と比べて確かめる。
 * `--check` は書き込まずに、今のテンプレートでの一致率と距離だけを表示する。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  boardChips,
  crop,
  extractGlyph,
  MAX_GLYPH_DISTANCE,
  nearestRank,
  PLAYER_ROWS_Y,
  playerCardChips,
} from '../../packages/ocr/src/index.ts';
import { GLYPH_H, GLYPH_W } from '../../packages/ocr/src/rankTemplates.ts';
import { decodePng } from './png.mts';

const POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;
const args = process.argv.slice(2);
const check = args.includes('--check');
const dirs = args.filter((a) => !a.startsWith('--'));
if (dirs.length === 0) dirs.push('sample/pc');

type Sample = { label: string; glyph: Uint8Array; where: string };
const samples: Sample[] = [];
for (const dir of dirs) {
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.png'))) {
    const expPath = join(dir, f.replace(/\.png$/, '.expected.json'));
    if (!existsSync(expPath)) continue;
    const exp = JSON.parse(readFileSync(expPath, 'utf8')) as { hands: Record<string, string[]>; board: string[] };
    const img = decodePng(readFileSync(join(dir, f)));
    POS.forEach((p, i) => {
      const chips = playerCardChips(img, PLAYER_ROWS_Y[i] as number);
      chips.forEach((box, k) => {
        const card = exp.hands[p]?.[k];
        const glyph = extractGlyph(crop(img, box));
        if (card && glyph) samples.push({ label: card.charAt(0), glyph, where: `${f} ${p}#${k}` });
      });
    });
    boardChips(img)
      .flat()
      .forEach((c, k) => {
        const card = exp.board[k];
        const glyph = extractGlyph(crop(img, c.box));
        if (card && glyph) samples.push({ label: card.charAt(0), glyph, where: `${f} board#${k}` });
      });
  }
}

const dist = (a: Uint8Array, b: Uint8Array): number => a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0);

if (check) {
  let ok = 0;
  let worst = 0;
  for (const s of samples) {
    const m = nearestRank(s.glyph);
    const hit = m && m.rank === s.label && m.distance <= MAX_GLYPH_DISTANCE;
    if (hit) ok++;
    else console.log('不一致', s.where, s.label, m);
    if (m && m.rank === s.label) worst = Math.max(worst, m.distance);
  }
  console.log(`一致 ${ok} / ${samples.length}、正しいラベルへの最大距離 ${worst}（上限 ${MAX_GLYPH_DISTANCE}）`);
  process.exit(ok === samples.length ? 0 : 1);
}

// 同じ字形はまとめる
const unique: Sample[] = [];
for (const s of samples) if (!unique.some((u) => u.label === s.label && dist(u.glyph, s.glyph) === 0)) unique.push(s);
unique.sort((a, b) => 'AKQJT98765432'.indexOf(a.label) - 'AKQJT98765432'.indexOf(b.label));

let minCross = Infinity;
let pair = '';
for (let i = 0; i < unique.length; i++) {
  for (let j = i + 1; j < unique.length; j++) {
    const a = unique[i] as Sample;
    const b = unique[j] as Sample;
    if (a.label === b.label) continue;
    const d = dist(a.glyph, b.glyph);
    if (d < minCross) {
      minCross = d;
      pair = `${a.label}（${a.where}）と ${b.label}（${b.where}）`;
    }
  }
}
const counts: Record<string, number> = {};
for (const u of unique) counts[u.label] = (counts[u.label] ?? 0) + 1;
console.log(`カード ${samples.length} 枚 → 字形 ${unique.length} 種`, counts);
console.log(`別ラベル間の最小距離 ${minCross}: ${pair}（照合の上限 ${MAX_GLYPH_DISTANCE}）`);
// 照合は最も近いテンプレートで決める（上限は崩れた字形を弾くためだけ）。別ラベル間の最小距離が
// 上限を下回っても誤読にはならないが、余裕が小さいことは知っておく
if (minCross <= MAX_GLYPH_DISTANCE) console.warn(`注意: 別ラベル間の最小距離 ${minCross} が照合の上限 ${MAX_GLYPH_DISTANCE} 以下`);

// 6 ビットずつ base64 にする（rankTemplates.ts の展開と対）
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const bits = unique.flatMap((u) => Array.from(u.glyph));
while (bits.length % 6 !== 0) bits.push(0);
let packed = '';
for (let i = 0; i < bits.length; i += 6) {
  let v = 0;
  for (let b = 0; b < 6; b++) v = (v << 1) | (bits[i + b] as number);
  packed += B64.charAt(v);
}
const lines = packed.match(/.{1,100}/g) ?? [];
const file = `/**
 * カードのランク文字のテンプレート。**生成物**（\`node --experimental-strip-types scripts/ocr/genRankTemplates.mts\`）。
 *
 * T4 のカード面は固定フォントで描かれるので、文字認識より 2 値ビットマップの直接照合が確実。
 * 正解データ（sample/pc。git 管理外）のプレイヤー行とボードの全カードから、\`extractGlyph\`（チップの中で
 * いちばん左のインクの塊を ${GLYPH_W}×${GLYPH_H} に正規化）で字形を取り、同じものをまとめた。
 * 生成時の別ラベル間の最小距離は ${minCross}（照合の上限は ${MAX_GLYPH_DISTANCE}）。
 */

export const GLYPH_W = ${GLYPH_W};
export const GLYPH_H = ${GLYPH_H};

export const LABELS: readonly string[] = [${unique.map((u) => `'${u.label}'`).join(', ')}];

const PACKED =
${lines.map((l) => `  '${l}'`).join(' +\n')};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

let cache: Uint8Array[] | null = null;

/** テンプレート（各 ${GLYPH_H}×${GLYPH_W} の 0/1 を行優先で並べたもの）。初回だけ展開する。 */
export function templates(): Uint8Array[] {
  if (cache) return cache;
  // base64 を 6 ビットずつビット列に展開する（atob は環境によって型が無いので使わない）
  const bits = new Uint8Array(PACKED.length * 6);
  for (let i = 0; i < PACKED.length; i++) {
    const v = B64.indexOf(PACKED.charAt(i));
    for (let b = 0; b < 6; b++) bits[i * 6 + b] = (v >> (5 - b)) & 1;
  }
  const size = GLYPH_W * GLYPH_H;
  cache = LABELS.map((_, i) => bits.slice(i * size, (i + 1) * size));
  return cache;
}
`;
writeFileSync('packages/ocr/src/rankTemplates.ts', file);
console.log('packages/ocr/src/rankTemplates.ts を書き出した');
