import { describe, expect, it } from 'vitest';
import { blank, crop, fill, invert, type RgbaImage } from './image.ts';
import { GLYPH_H, GLYPH_W, LABELS, templates } from './rankTemplates.ts';
import { boardChipRows, detectSuit, extractGlyph, heroRowIndex, matchRank, readBoardRows } from './vision.ts';

const BG = [30, 41, 57] as const; // T4 の地の色
const RED = [239, 68, 68] as const;
const BLUE = [59, 130, 246] as const;
const WHITE = [255, 255, 255] as const;

/** テンプレートの字形を `scale` 倍にして (x, y) に白で描く。 */
function drawGlyph(img: RgbaImage, bits: Uint8Array, x: number, y: number, scale: number): RgbaImage {
  const boxes: [number, number, number, number][] = [];
  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      if (bits[gy * GLYPH_W + gx]) boxes.push([x + gx * scale, y + gy * scale, x + (gx + 1) * scale, y + (gy + 1) * scale]);
    }
  }
  return fill(img, boxes, WHITE);
}

/**
 * 色のチップに、実物と同じ大きさ（16×20）でランクの字形を描き、すぐ右（隙間 2px）にスートに見立てた塊を描く。
 * 文字はチップの左端から 12px 以上離す（ボードの在否を見る帯に文字を入れない）。
 */
function chip(label: string, color: readonly [number, number, number], shiftX = 0): RgbaImage {
  const i = LABELS.indexOf(label);
  const x = 14 + shiftX;
  let img = fill(blank(66, 46, BG), [[1, 1, 65, 45]], color);
  img = drawGlyph(img, templates()[i] as Uint8Array, x, 12, 1);
  return fill(img, [[x + 18, 16, x + 32, 32]], WHITE);
}

describe('ランク（テンプレート照合）', () => {
  it('各ラベルの字形を読める（文字の位置がずれていても、スートがすぐ隣にあっても）', () => {
    for (const label of new Set(LABELS)) {
      expect(matchRank(chip(label, RED))).toBe(label);
      expect(matchRank(chip(label, BLUE, 4))).toBe(label);
    }
  });
  it('ランクとスートが 1 画素でつながっていても（Android の 4♦）、細い所で切ってランクを読む', () => {
    for (const label of new Set(LABELS)) {
      // 字形の右寄り（x = 26〜29）からスートの塊（x = 32〜）まで、高さ 1 画素の橋でつなぐ
      const img = fill(chip(label, BLUE), [[26, 22, 33, 23]], WHITE);
      expect(matchRank(img)).toBe(label);
    }
  });
  it('インクが無ければ null', () => {
    expect(extractGlyph(blank(40, 40, RED))).toBeNull();
    expect(matchRank(blank(40, 40, RED))).toBeNull();
  });
});

describe('スート（背景色）', () => {
  it('背景色の中央値に最も近い色のスート', () => {
    expect(detectSuit(blank(20, 20, RED))).toBe('h');
    expect(detectSuit(blank(20, 20, BLUE))).toBe('d');
    expect(detectSuit(blank(20, 20, [34, 197, 94]))).toBe('c');
    expect(detectSuit(blank(20, 20, [94, 108, 131]))).toBe('s');
    // 白い文字が少し入っていても中央値は背景色
    expect(detectSuit(chip('K', RED))).toBe('h');
  });
});

describe('ボード', () => {
  it('本文の左の列のチップの行を見つけて読む（フロップ 3 枚・ターン 1 枚）', () => {
    let img = blank(839, 900, BG);
    const put = (base: RgbaImage, c: RgbaImage, x: number, y: number): RgbaImage => {
      const data = new Uint8ClampedArray(base.data);
      for (let yy = 0; yy < 44; yy++) data.set(c.data.subarray((yy + 1) * c.width * 4 + 4, (yy + 1) * c.width * 4 + 4 + 64 * 4), ((y + yy) * base.width + x) * 4);
      return { ...base, data };
    };
    img = put(img, chip('A', BLUE), 42, 560);
    img = put(img, chip('K', RED), 110, 560);
    img = put(img, chip('7', BLUE), 178, 560);
    img = put(img, chip('2', RED), 42, 700);
    expect(boardChipRows(img)).toHaveLength(2);
    expect(readBoardRows(img)).toEqual([
      [
        { rank: 'A', suit: 'd' },
        { rank: 'K', suit: 'h' },
        { rank: '7', suit: 'd' },
      ],
      [{ rank: '2', suit: 'h' }],
    ]);
  });
  it('チップが無ければ空', () => {
    expect(readBoardRows(blank(839, 1000, BG))).toEqual([]);
  });
});

describe('Hero の行（太字）', () => {
  const rows = [169, 225, 281, 337, 393, 449];
  const withStrokes = (boldIndex: number | null): RgbaImage => {
    const boxes: [number, number, number, number][] = [];
    rows.forEach((y, i) => {
      const w = i === boldIndex ? 5 : 2;
      for (let x = 130; x < 300; x += 10) boxes.push([x, y - 10, x + w, y + 10]);
    });
    return fill(blank(839, 1000, BG), boxes, WHITE);
  };
  it('線が太い行を返す', () => {
    expect(heroRowIndex(withStrokes(3), rows)).toBe(3);
  });
  it('突出した行が無ければ null（Hero が参加していない）', () => {
    expect(heroRowIndex(withStrokes(null), rows)).toBeNull();
  });
});

describe('画像の操作', () => {
  it('crop は範囲に収め、invert は色を反転する', () => {
    const img = fill(blank(10, 10, [0, 0, 0]), [[2, 2, 4, 4]], [200, 100, 50]);
    const c = crop(img, [2, 2, 20, 20]);
    expect([c.width, c.height]).toEqual([8, 8]);
    expect(Array.from(invert(c).data.slice(0, 4))).toEqual([55, 155, 205, 255]);
    expect(crop(img, [5, 5, 3, 3]).width).toBe(0);
  });
});
