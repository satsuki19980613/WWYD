import { readHandHistory, TESSERACT_PARAMS, type OcrResult, type RgbaImage, type TextMode } from '@wwyd/ocr';
import { createWorker, OEM } from 'tesseract.js';

/**
 * 端末内 OCR の入口（詳細仕様 07 章）。「T4ハンドヒストリー画像を読み込む」を押したときだけ動的 import で読み込む
 * （tesseract.js と認識エンジン・学習データを通常の画面の読み込みに含めない）。
 *
 * - 画像は File → ImageBitmap → Canvas → ImageData の順にメモリの中だけで扱い、終わったら参照を捨てる。
 *   保存も送信もしない（不変条件 5）。
 * - 認識エンジン・学習データ・Worker はすべて自サイトの /ocr/ から読む（scripts/copyOcrAssets.mjs が配置する）。
 *   tesseract.js の既定の CDN を必ず上書きする。学習データは IndexedDB に保存しない（cacheMethod: 'none'。
 *   2 回目以降はブラウザの HTTP キャッシュが効く）。
 */

const assetUrl = (path: string): string => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, window.location.href).href;

export class OcrCancelled extends Error {
  constructor() {
    super('OCR を取り消した');
    this.name = 'OcrCancelled';
  }
}

async function toRgba(file: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas を使えない');
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width, height, data };
  } finally {
    bitmap.close();
  }
}

function toCanvas(img: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas を使えない');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas;
}

/** 画像を読む。`signal` で取り消すと Worker を止めて OcrCancelled を投げる。 */
export async function runOcr(file: Blob, signal: AbortSignal): Promise<OcrResult> {
  const workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: assetUrl('worker.min.js'),
    corePath: assetUrl('core'),
    langPath: assetUrl('lang'),
    workerBlobURL: false,
    cacheMethod: 'none',
    gzip: true,
  });
  const stop = (): void => {
    void workerPromise.then((w) => w.terminate()).catch(() => undefined);
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    let image: RgbaImage | null = await toRgba(file);
    const worker = await workerPromise;
    if (signal.aborted) throw new OcrCancelled();
    let mode: TextMode | null = null;
    const reader = async (region: RgbaImage, m: TextMode): Promise<string> => {
      if (signal.aborted) throw new OcrCancelled();
      if (region.width === 0 || region.height === 0) return '';
      if (m !== mode) {
        await worker.setParameters(TESSERACT_PARAMS[m]);
        mode = m;
      }
      const { data } = await worker.recognize(toCanvas(region));
      return data.text;
    };
    const result = await readHandHistory(image, reader);
    image = null; // 画像の参照を捨てる
    if (signal.aborted) throw new OcrCancelled();
    return result;
  } catch (e) {
    if (signal.aborted) throw new OcrCancelled();
    throw e;
  } finally {
    signal.removeEventListener('abort', stop);
    stop();
  }
}
