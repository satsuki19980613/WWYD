/**
 * カードのランク文字のテンプレート。**生成物**（`node --experimental-strip-types scripts/ocr/genRankTemplates.mts`）。
 *
 * T4 のカード面は固定フォントで描かれるので、文字認識より 2 値ビットマップの直接照合が確実。
 * 正解データ（sample/pc。git 管理外）のプレイヤー行とボードの全カードから、`extractGlyph`（チップの中で
 * いちばん左のインクの塊を 16×20 に正規化）で字形を取り、同じものをまとめた。
 * 生成時の別ラベル間の最小距離は 33（照合の上限は 40）。
 */

export const GLYPH_W = 16;
export const GLYPH_H = 20;

export const LABELS: readonly string[] = ['A', 'A', 'A', 'A', 'A', 'A', 'K', 'K', 'K', 'K', 'K', 'K', 'K', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'J', 'J', 'J', 'J', 'J', 'J', 'J', 'T', 'T', 'T', '9', '9', '9', '9', '9', '9', '8', '8', '8', '8', '8', '8', '7', '7', '7', '7', '7', '7', '6', '6', '6', '6', '6', '6', '5', '5', '5', '5', '5', '4', '4', '4', '4', '4', '4', '4', '3', '3', '3', '3', '3', '2', '2', '2', '2', '2', '2', '2'];

const PACKED =
  'A8AH4AfgB+AP8A/wD/Ae+B54Hng+fD/8P/w//D/8PDx8Pnw+fD74HwfgB+AH4AfgD/AP8A/wHvgeeB54Pnw//D/8P/w//Dw8fD58' +
  'Pnw++B8H4AfgB+AP8A/wD/Af+B/4Hvg+fD58P/w//D/8P/x//nw+fD78P/w/B+AH4AfgD/AP8A/wD/Af+B54Hng+fD/8P/w//D/8' +
  'f/58Pnw+fD74HwfgB+AP8A/wD/Af+B/4H/gf+B/4Hng//D/8P/x//nw+fD74H/gf+B8H4A/wD/AP8A/4H/gf+B/4H/gf+D58P/w/' +
  '/H/+f/5//vw//D/4H/gf+H74/Pj4+Pj5+Pnw++D/wP/A/8D/4P/w//D8+Pj4+Pj4fPh8+D74P/h++Pz4+Pj4+fj58Pvg/8D/wP/A' +
  '/+D/8P/4/Pj8+Pj4+Pz4fvg++D/8fvx8/Pz8+P34/fD/8P/g/8D/4P/w//D/+P74/Pj8/Px8/H78P/w/+H74fPj4+Pj5+Pnw++D/' +
  'wP/A/8D/4P/w//D8+Pj4+Pj4fPh8+D74P/h++Hz4/Pn4+fD78P/w/+D/wP/A//D/8P/w/fD4+Pj8+Hz4fvg++D/8fvz8/Pj8+P34' +
  '//D/4P/g/8D/wP/w//D/+Pz4/Pj8+Pz8/H78fvw/+H74fPj4+fj58Pvw/+D/4P/A/8D/8P/w//D98Pj4+Pz4fPh++D74Hw/gP/g/' +
  '/H/8+Dz4PPg++B74Hvg++Dx4fHz8P/g/8A/gA/ID/gH/AD4P4D/4P/x+/Pg8+Dz4Hvge+B74Hvg8eHx8fD/4P/AP4APyA/4B/wA+' +
  'B+A/+D/8fvx4PPg++B74Hvge+B74PHg8fHw/+B/wD+AD8gH+AP8APg/gP/g//H/8+Dz4Pvg++D74Pvg++Dz4fHz8P/g/8B/gA/oD' +
  '/gH/AH8P4D/4P/x+/Pg8+Dz4Hvge+B74Hvg8eDx8fD/4P/AP4APyAf4B/wA+D+A/+D/8f/z4Pvg++D74Hvge+D74Pnh8fvw//D/4' +
  'D+AD+gP/Af8APw/gP/g//H/8+Dz4Pvge+B74Hvge+Dx4PHx8P/g/8A/gA/IB/gD/AD8H4D/4P/x//Hg8+D74Hvge+B74Hvg8eDx8' +
  'fD/4H/AP4APyAf4A/wA+AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8Afzh///7//n/8P/gDgAA/AD8APwA/AD8APwA/AD8APwA/' +
  'AD8APwA/AD8YP///f/4//B/4B+AAfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/OH///v/+f/w/+APAAD8APwA/AD8APwA/AD8A' +
  'PwA/AD8APwA/AD8APxx///9//n/+H/wDwAA/AD8APwA/AD8APwA/AD8APwA/AD8APwA/AD8cf///f/5//h/4A8AAfwB/AH8AfwB/' +
  'AH8AfwB/AH8AfwB/AH8AfwB/OH///v/+f/w/+AfgAH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8Afxh+//7//H/8H/gHwP//////' +
  '//////8H4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+D/////////////B8AHwAfAB8AHwAfAB8AHwAfAB8AHwAfAB8AHwAfA' +
  '//////////9//gfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4B/gP/h/+P/8/P78fvw+/H/+////f/8//w9+AH4Afn/8//j/' +
  '8D/gD4Af4D/wf/h//Pz8+D74Pvx+/v5//3/+P/4PPgB+AH5//P/4f/A/4AeAD+Af+D/8f/x+fvw+/D98P35/f/8//x//Bz8APgB+' +
  'P/x//H/4H+AHgA/wP/h//H/+/D74H/gf/D/+f3//f/8//wefAD8AP3/+//x/+D/wB4AP8D/4f/x//vw++B/4H/wf/n9//3//P/8H' +
  'nwA/AD9//n/8f/g/8AeAD/A/+D/8f/5+fvw//D/8P37/f/8//z//B78APwB+P/5//H/4P/AHgA/wP/x//H/+/D78Pn4+f/w/+B/4' +
  'P/x//vh/+D/4P/x///5//B/4B8AP8D/4P/x//Hx+fD5+fD/8P/gf+D/8f/58fvw++D/+fn/+P/wf+APAD/A/+H/8f/5+fn5+f3x/' +
  '/D/4H/g//H/+/P78f/w//v5//n/8H/gHwA/4H/w//n/+fD98Hn4+P/4f/B/8P/59/3w/+B/4H/4/f/8//h/4A+AP+B/8P/5//nw/' +
  'fB5+Pj/+P/wf/D/+ff98P/gf+B/+P3//P/4f+APgH/A//H/8f/78Pvw+fj5//D/4H/g//H/++H/4P/g//n///n/8P/gHwP//////' +
  '////f/4AfgB8AfgB+AP4B/AH8AfgB+AP4A/gD+AP4A/gD+D////////////+APwA+AH4A/AD8AfgB+AH4A/gD8APwA/AD8APwA/A' +
  '//////////9//wB+AHwB+AH4A/gH8AfwB+AH4A/gD+AP4A/gD+AP4P/////////+f/4A/AD4AfgB8APwB+AH4AfAB8APwA/AD8AP' +
  'wA/AD8D////////////+AHwB/AH4A/gD8AfgB+AP4A/gD+AP4A/gH8AfwB/A/////////////gB8AfwB+APwA/AH4AfgD+AP4A/g' +
  'D+APwA/AH8AfwAf4D/wf/j/8fzh8APwA//j//P/+//78Pvw/fD98Pz/+P/wf/A/wAcAH+B/+P/9//n4c/AD4APv4//7//v///D/4' +
  'H/gf/D9//z/+P/wP+APgB/wP/h//P/4/nH4AfkB//P/+//////4/fj9+P34/P/8//h/8D/gB4Af4D/wf/j/8fzx8APwA//j//P/+' +
  '//78Pvw/fD98Pz/+P/wf/A/wAcAH+B/+P/4//n88/AD8QP/4//z//v/+/j/8P/w/fD9//j/+H/wP+APAB/gP/B/+P/x/PHwA/AD/' +
  '+P/8//7//vw//D/8P3w/f/4//h/8D/gBwD/+P/4//j/+P/5+AH/gf/x//n/+GH8APwA/AD8gP//+//5//D/4B8A//j/+P/4//j/+' +
  'PwA/4D/8f/w//hz/AH8APwA/MH9//v/+f/w/+AfAP/4//j/+P/4//D4AP+A/+D/8P/4c/gB/AD8APyA/f/7//H/4H/ADgD//P/8/' +
  '/z//P/4/AD/wP/w//j//Hn8APwA/AD8wP3////5//B/4A+A//j/+P/5//n/+fgB/8H/8f/5//zh/AD8APwA/ID/////+f/w/+AfA' +
  'AfgD+AP4B/gH+A/4H/gf+D/4Pvj8+P//////////APgA+AD4APgA+AH8AfwD/AP8B/wP/A/8H/wf/D/8fvz//////////wD8APwA' +
  '/AD8APwB/AP8A/wH/Af8D/wf/B98P3w+fPx8//////////8AfAB8AHwAfAB8AfwD/AP8B/wH/A/8H/wffD98Pnx8fP//////////' +
  'AHwAfAB8AHwAfAH8AfwD/Af8B/wP/A/8H/wf/D/8fvz//////////wD8APwA/AD8APwB/AP8B/wH/A/8D/wf/D/8Pvx+/Pj8////' +
  '//////8A/AD8APwA/AD8AfwD/AP8B/wP/A/8H/wf/D/8fvz8/P//////////APwA/AD8APwA/B/wf/z//n/+OH8APwB+D/4P/A/4' +
  'D/4H/wA/AD8gP/////7//D/4B8Af8H/8//5//jh+AD4Afg/+D/wP+A/+A/4APwA/ID/////+f/w/+AfAD/g//H/+P/4+fwB/AH4H' +
  '/gf8B/gH/gf/AD8APzA/f////3/+H/gH4B/wP/h//H/+PH4AfgB+B/wP+A/4D/wH/gB+AD8wP3/+//5//D/4B8AP8D/4f/x//jx+' +
  'AH4Afgf8B/gH+Af8Af4AfgA/ID9//v/+f/w/8AOAH/A/+P/8//54fjB+AD4APgB+AH4B/AP4B/AP4B/gP8B//////////x/wf/j/' +
  '/P/+eH4wfgA+AD4AfgB+A/wD+AfwD/Af4D/ef/////////8f4H/4//j//Hn8MP4A/gD+APwA/AP4B/AP8A/gP8B//v//////////' +
  'H/B/+P/8//54fjB+AD4APgB+AH4D/AP4B/AP8B/gP8B//////////x/wP/h//H/8PP4QfgB+AH4AfgD8AfgD+AfwD+AfwD++f///' +
  '//////8f4H/4//z//HH+IH4AfgB+AH4B/AP4B/gP8B/gP8B/gP//////////H/A/+H/8//58/jh+AH4AfgB+APwB+AP4B/AP4B/A' +
  'P/5//////////w';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

let cache: Uint8Array[] | null = null;

/** テンプレート（各 20×16 の 0/1 を行優先で並べたもの）。初回だけ展開する。 */
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
