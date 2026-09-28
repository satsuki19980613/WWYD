import { crop, fill, meanAt, median, rgbAt, type Box, type RgbaImage } from './image.ts';
import { GLYPH_H, GLYPH_W, LABELS, templates } from './rankTemplates.ts';

/**
 * 画素だけで読む部分（流用元 tenfour_watcher `src/ocr.py` の移植）。文字認識のエンジンを使わない。
 *
 * - カードのランク: 固定フォントのテンプレート照合
 * - カードのスート: 背景色（4 色デッキ）
 * - ボード: 本文の左の列に並ぶ色のチップを走査して見つける
 * - Hero の行: 太字で描かれている行（線の太さで判定）
 *
 * ## 座標
 * T4 の画像は**幅が常に 839px、高さだけが可変**（ハンドが長いほど下に伸びる。縦に引き伸ばされることはない）。
 * だから **y はスケールしない**。上はプレイヤー行まで絶対座標、本文はその下からフッターの上まで。
 * x は幅に合わせてスケールする（PC・Android のダウンロード画像は 839px で同じ。07 章 §0）。
 */

export const BASE_W = 839;

/** プレイヤー行の y の中心（画像の高さに関係なく常にここ）。上から UTG, HJ, CO, BTN, SB, BB。 */
export const PLAYER_ROWS_Y = [169, 225, 281, 337, 393, 449] as const;

const LAYOUT = {
  positionBox: [38, -18, 115, 18],
  nameBox: [120, -20, 450, 20],
  /** カードのチップ全体（実測: 左 666〜729、右 734〜797、行の中心から -21〜+22） */
  cardLeftChip: [665, -22, 731, 24],
  cardRightChip: [733, -22, 799, 24],
  cardLeftColor: [675, -18, 715, 18],
  cardRightColor: [740, -18, 800, 18],
  bodyLeft: 30,
  bodyRight: 820,
  bodyTop: 466,
  /** フッターの上端（下端からの距離） */
  footerFromBottom: 78,
} as const;

/** 4 色デッキの背景色 */
export const SUIT_REFERENCE: ReadonlyArray<readonly [string, readonly [number, number, number]]> = [
  ['h', [239, 68, 68]],
  ['d', [59, 130, 246]],
  ['c', [34, 197, 94]],
  ['s', [94, 108, 131]],
];

// ボードのチップ（本文の左の列）。x は固定、y は画像ごとに動くので走査して見つける。
const BOARD_X_LIMIT = 260; // ここより右はポジションのバッジ（灰色がスペードの色に近い）なので見ない
const BOARD_CHIP_X0 = 42;
const BOARD_CHIP_PITCH = 68;
const BOARD_CHIP_W = 64;
const BOARD_CHIP_H = 44;
const BOARD_CHIP_MIN_H = 24;
const BOARD_CHIP_GAP_TOLERANCE = 8;
const BOARD_MAX_CHIPS = 3;
/** チップ内の「文字が絶対に来ない帯」（左端から 4〜11px。A の左脚は 11px から出るので含めない） */
const BOARD_PROBE_DX = [4, 11] as const;
/** チップの色とみなす距離（RGB の差の 2 乗和。1 チャンネル 30 程度） */
const BOARD_COLOUR_TOLERANCE = 900;
/** テンプレートとの不一致の画素数の上限（320 画素中）。テンプレートを作り直したら別ラベル間の最小距離と比べて見直す */
export const MAX_GLYPH_DISTANCE = 40;
/** ランク文字の幅の上限（実測 13〜21px）。これより広い塊はスートとつながっている */
const MAX_RANK_W = 24;
/** ランク文字とみなす塊の最小の画素数（アンチエイリアスの点を除く） */
const MIN_GLYPH_PIXELS = 20;

const sx = (w: number): number => w / BASE_W;

export function rowBox(img: RgbaImage, rowY: number, offset: readonly [number, number, number, number]): Box {
  const s = sx(img.width);
  return [Math.trunc(offset[0] * s), rowY + offset[1], Math.trunc(offset[2] * s), rowY + offset[3]];
}

export function positionBox(img: RgbaImage, rowY: number): Box {
  return rowBox(img, rowY, LAYOUT.positionBox);
}

export function nameBox(img: RgbaImage, rowY: number): Box {
  return rowBox(img, rowY, LAYOUT.nameBox);
}

/** プレイヤー行の下からフッターの上まで。ここに全ストリートが入る。 */
export function bodyBox(img: RgbaImage): Box {
  const s = sx(img.width);
  const top = LAYOUT.bodyTop;
  let bottom = img.height - LAYOUT.footerFromBottom;
  if (bottom <= top) bottom = img.height;
  return [Math.trunc(LAYOUT.bodyLeft * s), top, Math.trunc(LAYOUT.bodyRight * s), bottom];
}

// ---- ランク ----

/**
 * カード（チップ全体）からランク文字だけを取り出し、16×20 の 0/1 に正規化する。
 *
 * ランク文字は**チップの中でいちばん左にあるインクの塊**（4 近傍でつながった画素）として取る。
 * 流用元は固定の枠で切り出して列の隙間でスートと分けていたが、Android の画像は文字が 4〜5px 右に寄って
 * 描かれ、枠からはみ出したりスートがくっついたりして読めなかった（2026-09-28。07 章 §0）。
 * 塊で取れば、文字の位置・ランクとスートの隙間（1〜2px）に左右されない。
 */
export function extractGlyph(chip: RgbaImage): Uint8Array | null {
  const { width: w, height: h } = chip;
  if (w === 0 || h === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  const gray = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = meanAt(chip, x, y);
      gray[y * w + x] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
  }
  const threshold = (min + max) / 2 + 20;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = (gray[i] as number) > threshold ? 1 : 0;

  // 4 近傍の塊に分け、左端がいちばん左の塊（小さな点は除く）を選ぶ
  const label = new Int32Array(w * h).fill(-1);
  let best: { id: number; minX: number; size: number; box: [number, number, number, number] } | null = null;
  let next = 0;
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || label[start] !== -1) continue;
    const id = next++;
    label[start] = id;
    stack.push(start);
    let size = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const x = i % w;
      const y = (i - x) / w;
      size++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const around = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of around) {
        if (j >= 0 && ink[j] && label[j] === -1) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    if (size < MIN_GLYPH_PIXELS) continue;
    if (!best || x0 < best.minX || (x0 === best.minX && size > best.size)) {
      best = { id, minX: x0, size, box: [x0, y0, x1, y1] };
    }
  }
  if (!best) return null;
  const id = best.id;
  let [bx0, by0, bx1, by1] = best.box;

  // ランクとスートがつながっている（Android の 4♦ は 4 の横棒が ♦ の左端に 1 画素触れる）。
  // ランクの幅（実測 13〜21px）を超えていたら、インクがいちばん少ない列で切り、左だけをランクにする
  if (bx1 - bx0 + 1 > MAX_RANK_W) {
    const count = (x: number): number => {
      let n = 0;
      for (let y = by0; y <= by1; y++) if (label[y * w + x] === id) n++;
      return n;
    };
    let cut = -1;
    let least = Infinity;
    for (let x = bx0 + 12; x <= Math.min(bx1 - 3, bx0 + MAX_RANK_W - 1); x++) {
      const n = count(x);
      if (n < least) {
        least = n;
        cut = x;
      }
    }
    if (cut < 0) return null;
    bx1 = cut - 1;
    by0 = h;
    by1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = bx0; x <= bx1; x++) {
        if (label[y * w + x] === id) {
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
    }
    if (by1 < by0) return null;
  }
  const subW = bx1 - bx0 + 1;
  const subH = by1 - by0 + 1;
  // 出力の画素の中心を入力に写して切り捨てる（PIL の NEAREST と同じ標本点）
  const glyph = new Uint8Array(GLYPH_W * GLYPH_H);
  for (let gy = 0; gy < GLYPH_H; gy++) {
    const yIn = by0 + Math.trunc(((gy + 0.5) * subH) / GLYPH_H);
    for (let gx = 0; gx < GLYPH_W; gx++) {
      const xIn = bx0 + Math.trunc(((gx + 0.5) * subW) / GLYPH_W);
      glyph[gy * GLYPH_W + gx] = label[yIn * w + xIn] === id ? 1 : 0;
    }
  }
  return glyph;
}

/** 最も近いテンプレートのラベルと距離（不一致の画素数）。 */
export function nearestRank(glyph: Uint8Array): { rank: string; distance: number } | null {
  let best = -1;
  let bestDistance = Infinity;
  templates().forEach((t, i) => {
    let d = 0;
    for (let k = 0; k < t.length; k++) if (t[k] !== glyph[k]) d++;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best < 0 ? null : { rank: LABELS[best] as string, distance: bestDistance };
}

/** テンプレートとの照合でランクを決める。一致しなければ null。 */
export function matchRank(chip: RgbaImage): string | null {
  const glyph = extractGlyph(chip);
  const m = glyph && nearestRank(glyph);
  return m && m.distance <= MAX_GLYPH_DISTANCE ? m.rank : null;
}

// ---- スート ----

function nearestSuit(rgb: readonly [number, number, number]): { index: number; dist: number } {
  let index = 0;
  let dist = Infinity;
  SUIT_REFERENCE.forEach(([, ref], i) => {
    const d = (rgb[0] - ref[0]) ** 2 + (rgb[1] - ref[1]) ** 2 + (rgb[2] - ref[2]) ** 2;
    if (d < dist) {
      dist = d;
      index = i;
    }
  });
  return { index, dist };
}

const suitLetter = (i: number): string => (SUIT_REFERENCE[i] as readonly [string, unknown])[0];

/** 領域の RGB の中央値に最も近い背景色のスート。 */
export function detectSuit(region: RgbaImage): string {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const [pr, pg, pb] = rgbAt(region, x, y);
      r.push(pr);
      g.push(pg);
      b.push(pb);
    }
  }
  const m: [number, number, number] = [Math.trunc(median(r)), Math.trunc(median(g)), Math.trunc(median(b))];
  return suitLetter(nearestSuit(m).index);
}

/** 領域が 4 色のどれか 1 色で塗りつぶされていればそのスート（1 画素でも外れたら null。文字を拾わないため）。 */
function solidChipSuit(region: RgbaImage): string | null {
  if (region.width === 0 || region.height === 0) return null;
  let first = -1;
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const { index, dist } = nearestSuit(rgbAt(region, x, y));
      if (dist > BOARD_COLOUR_TOLERANCE) return null;
      if (first < 0) first = index;
      else if (index !== first) return null;
    }
  }
  return suitLetter(first);
}

// ---- プレイヤー行 ----

export type RowCards = { rank: string | null; suit: string }[];

/** プレイヤー行の 2 枚のカードのチップ。 */
export function playerCardChips(img: RgbaImage, rowY: number): [Box, Box] {
  return [rowBox(img, rowY, LAYOUT.cardLeftChip), rowBox(img, rowY, LAYOUT.cardRightChip)];
}

/** プレイヤー行の 2 枚のカード。 */
export function readRowCards(img: RgbaImage, rowY: number): RowCards {
  const [left, right] = playerCardChips(img, rowY);
  return [
    { rank: matchRank(crop(img, left)), suit: detectSuit(crop(img, rowBox(img, rowY, LAYOUT.cardLeftColor))) },
    { rank: matchRank(crop(img, right)), suit: detectSuit(crop(img, rowBox(img, rowY, LAYOUT.cardRightColor))) },
  ];
}

/** その行にプレイヤーが座っているか。 */
export function rowHasContent(img: RgbaImage, rowY: number): boolean {
  const s = sx(img.width);
  const x1 = Math.trunc(120 * s);
  const x2 = Math.min(img.width, Math.trunc(460 * s));
  const y1 = Math.max(0, rowY - 16);
  const y2 = Math.min(img.height, rowY + 16);
  let bright = 0;
  let total = 0;
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      total++;
      if (meanAt(img, x, y) > 120) bright++;
    }
  }
  return total > 0 && bright / total > 0.005;
}

/**
 * 太字で描かれている行（＝ Hero）の番号。T4 は Hero の行だけ名前を太字で描く。
 * 太さは「横方向のインクの連なり（run）の平均の長さ」で測る。突出していなければ null（Hero が参加していない等）。
 */
export function heroRowIndex(img: RgbaImage, rows: readonly number[]): number | null {
  const s = sx(img.width);
  const x1 = Math.trunc(125 * s);
  const x2 = Math.min(img.width, Math.trunc(450 * s));
  const scores = rows.map((y) => {
    let ink = 0;
    let starts = 0;
    for (let yy = Math.max(0, y - 14); yy < Math.min(img.height, y + 14); yy++) {
      let prev = false;
      for (let x = x1; x < x2; x++) {
        const on = meanAt(img, x, yy) > 170;
        if (on) {
          ink++;
          if (!prev) starts++;
        }
        prev = on;
      }
    }
    return starts > 0 ? ink / starts : 0;
  });
  if (scores.length < 2) return null;
  const order = scores.map((_, i) => i).sort((a, b) => (scores[b] as number) - (scores[a] as number));
  const best = scores[order[0] as number] as number;
  const second = scores[order[1] as number] as number;
  if (best <= 0 || second <= 0) return null;
  return best / second > 1.15 ? (order[0] as number) : null;
}

// ---- ボード ----

type ChipRow = readonly [number, number];

function boardProbeX(index: number, w: number): [number, number] {
  const s = sx(w);
  const left = BOARD_CHIP_X0 + BOARD_CHIP_PITCH * index;
  return [Math.trunc((left + BOARD_PROBE_DX[0]) * s), Math.trunc((left + BOARD_PROBE_DX[1]) * s)];
}

function boardChipBox(index: number, row: ChipRow, w: number): Box {
  const s = sx(w);
  const left = BOARD_CHIP_X0 + BOARD_CHIP_PITCH * index;
  return [Math.trunc(left * s), row[0], Math.trunc((left + BOARD_CHIP_W) * s), row[1]];
}

/**
 * ボードのチップの行を上から順に返す（各 [y1, y2)）。フロップ / ターン / リバーで最大 3 行。
 * 「文字が来ない帯」が単色で続く縦の範囲を探す。行の高さは実測せず、上端から定数で決める
 * （帯は A の左脚などで下のほうが途切れることがあり、実測するとランク文字の下が切れる）。
 */
export function boardChipRows(img: RgbaImage): ChipRow[] {
  const [, top, , bottom] = bodyBox(img);
  if (bottom <= top) return [];
  const [x1, x2] = boardProbeX(0, img.width);
  const groups: [number, number][] = [];
  let start: number | null = null;
  let last = 0;
  for (let y = top; y < Math.min(bottom, img.height); y++) {
    let solid = x2 > x1;
    let first = -1;
    for (let x = x1; x < x2 && solid; x++) {
      const { index, dist } = nearestSuit(rgbAt(img, x, y));
      if (dist > BOARD_COLOUR_TOLERANCE) solid = false;
      else if (first < 0) first = index;
      else if (index !== first) solid = false;
    }
    if (!solid) continue;
    const yy = y - top;
    if (start === null) start = yy;
    else if (yy - last > BOARD_CHIP_GAP_TOLERANCE) {
      groups.push([start, last]);
      start = yy;
    }
    last = yy;
  }
  if (start !== null) groups.push([start, last]);

  const rows: ChipRow[] = [];
  for (const [first, final] of groups) {
    if (final - first + 1 < BOARD_CHIP_MIN_H) continue;
    const y1 = Math.max(0, top + first - 1); // 角丸のぶん、帯は 1px 遅れて始まる
    rows.push([y1, Math.min(img.height, y1 + BOARD_CHIP_H)]);
  }
  return rows;
}

/** 1 行に並ぶチップ（左から、チップがある所まで）の矩形とスート。 */
function boardRowChips(img: RgbaImage, row: ChipRow): { box: Box; suit: string }[] {
  const chips: { box: Box; suit: string }[] = [];
  const limit = Math.trunc(BOARD_X_LIMIT * sx(img.width));
  for (let index = 0; index < BOARD_MAX_CHIPS; index++) {
    const [px1, px2] = boardProbeX(index, img.width);
    if (px2 > limit) break;
    // 在否は「チップの上半分」で見る（下半分は A の左脚が帯に入ることがある）
    const suit = solidChipSuit(crop(img, [px1, row[0] + 3, px2, row[0] + 18]));
    if (suit === null) break;
    chips.push({ box: boardChipBox(index, row, img.width), suit });
  }
  return chips;
}

/** ボードの行ごとのチップ（上からフロップ・ターン・リバー）。 */
export function boardChips(img: RgbaImage): { box: Box; suit: string }[][] {
  return boardChipRows(img).map((row) => boardRowChips(img, row));
}

/** ボードの行ごとのカード（上からフロップ・ターン・リバー）。 */
export function readBoardRows(img: RgbaImage): { rank: string | null; suit: string }[][] {
  return boardChips(img).map((row) => row.map((c) => ({ rank: matchRank(crop(img, c.box)), suit: c.suit })));
}

/**
 * ボードのチップを地の色で塗りつぶした複製（本文を文字認識する前に通す）。
 * チップは各ストリートの最初のアクションと同じ高さにあり、文字認識に食わせると化けた文字がその行を壊す。
 * 塗る色はチップの左の余白の中央値。
 */
export function maskBoardChips(img: RgbaImage): RgbaImage {
  const rows = boardChipRows(img);
  const firstRow = rows[0];
  if (!firstRow) return img;
  const s = sx(img.width);
  const margin = crop(img, [Math.trunc(LAYOUT.bodyLeft * s), firstRow[0], Math.trunc((BOARD_CHIP_X0 - 2) * s), firstRow[1]]);
  if (margin.width === 0 || margin.height === 0) return img;
  const ch: number[][] = [[], [], []];
  for (let y = 0; y < margin.height; y++) {
    for (let x = 0; x < margin.width; x++) {
      const px = rgbAt(margin, x, y);
      for (let c = 0; c < 3; c++) (ch[c] as number[]).push(px[c] as number);
    }
  }
  const color: [number, number, number] = [
    Math.trunc(median(ch[0] as number[])),
    Math.trunc(median(ch[1] as number[])),
    Math.trunc(median(ch[2] as number[])),
  ];
  const boxes: Box[] = [];
  for (const row of rows) for (let i = 0; i < 3; i++) boxes.push(boardChipBox(i, row, img.width));
  return fill(img, boxes, color);
}
