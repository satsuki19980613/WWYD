/**
 * 画像の最小限の表現と操作。ブラウザの `ImageData` と同じ形（RGBA を行優先で並べたもの）を受け取る。
 * DOM に依存しないので、Node の単体テストでも合成した画像で試せる。
 */

export type RgbaImage = {
  readonly width: number;
  readonly height: number;
  /** RGBA を行優先で並べたもの（長さ width × height × 4） */
  readonly data: Uint8ClampedArray | Uint8Array;
};

/** [x1, y1, x2, y2)（右端・下端は含まない。Python の配列の切り出しと同じ） */
export type Box = readonly [number, number, number, number];

export function blank(width: number, height: number, rgb: readonly [number, number, number] = [0, 0, 0]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** 画像の範囲に収めた矩形（はみ出した分は切り捨てる。空になることもある）。 */
export function clampBox(img: RgbaImage, box: Box): Box {
  const [x1, y1, x2, y2] = box;
  const cx = (v: number): number => Math.max(0, Math.min(Math.trunc(v), img.width));
  const cy = (v: number): number => Math.max(0, Math.min(Math.trunc(v), img.height));
  return [cx(x1), cy(y1), Math.max(cx(x1), cx(x2)), Math.max(cy(y1), cy(y2))];
}

export function crop(img: RgbaImage, box: Box): RgbaImage {
  const [x1, y1, x2, y2] = clampBox(img, box);
  const w = x2 - x1;
  const h = y2 - y1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y1 + y) * img.width + x1) * 4;
    data.set(img.data.subarray(from, from + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

/** 色を反転する（暗い地に明るい文字 → 白地に黒文字。文字認識に渡す前に通す）。アルファは保つ。 */
export function invert(img: RgbaImage): RgbaImage {
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    data[i] = 255 - (img.data[i] ?? 0);
    data[i + 1] = 255 - (img.data[i + 1] ?? 0);
    data[i + 2] = 255 - (img.data[i + 2] ?? 0);
    data[i + 3] = img.data[i + 3] ?? 255;
  }
  return { width: img.width, height: img.height, data };
}

/** 矩形を 1 色で塗った複製。 */
export function fill(img: RgbaImage, boxes: readonly Box[], rgb: readonly [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(img.data);
  for (const box of boxes) {
    const [x1, y1, x2, y2] = clampBox(img, box);
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const i = (y * img.width + x) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
      }
    }
  }
  return { width: img.width, height: img.height, data };
}

export function rgbAt(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
}

/** RGB の平均（流用元の `arr.mean(axis=2)`）。 */
export function meanAt(img: RgbaImage, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return ((img.data[i] ?? 0) + (img.data[i + 1] ?? 0) + (img.data[i + 2] ?? 0)) / 3;
}

/** 中央値（numpy の median と同じ。偶数個は中央 2 つの平均）。 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
