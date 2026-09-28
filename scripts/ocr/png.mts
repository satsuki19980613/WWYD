import { deflateSync, inflateSync } from 'node:zlib';

/**
 * 手元の OCR の道具（精度の測定・テンプレートの生成）用の最小限の PNG の読み書き。
 * 依存を増やさないため Node 標準の zlib だけで書く。8bit・インターレースなしの RGB / RGBA / グレーだけ扱う
 * （T4 のダウンロード画像はこの形）。アプリには入らない。
 */

export type Rgba = { width: number; height: number; data: Uint8ClampedArray };

export function decodePng(buf: Buffer): Rgba {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG ではない');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9] ?? 0;
      if (depth !== 8 || body[12] !== 0) throw new Error('8bit・インターレースなし以外は扱わない');
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType as 0 | 2 | 4 | 6];
  if (!channels) throw new Error(`色の形式 ${colorType} は扱わない`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] as number;
      const a = x >= channels ? (px[y * stride + x - channels] as number) : 0;
      const b = y > 0 ? (px[(y - 1) * stride + x] as number) : 0;
      const c = x >= channels && y > 0 ? (px[(y - 1) * stride + x - channels] as number) : 0;
      let out = v;
      if (filter === 1) out = v + a;
      else if (filter === 2) out = v + b;
      else if (filter === 3) out = v + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = out & 0xff;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    if (channels >= 3) {
      data[i * 4] = px[s] as number;
      data[i * 4 + 1] = px[s + 1] as number;
      data[i * 4 + 2] = px[s + 2] as number;
      data[i * 4 + 3] = channels === 4 ? (px[s + 3] as number) : 255;
    } else {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = px[s] as number;
      data[i * 4 + 3] = channels === 2 ? (px[s + 1] as number) : 255;
    }
  }
  return { width, height, data };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** RGBA を PNG にする（文字認識のエンジンに渡すため）。 */
export function encodePng(img: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * 4 + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset + y * img.width * 4, img.width * 4).copy(raw, y * (img.width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
