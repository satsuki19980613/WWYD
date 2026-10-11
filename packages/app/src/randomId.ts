/**
 * 端末内に保存するもの（下書き・Preset）の ID: 時刻（base36）＋乱数の 6 文字（base36）。
 * 乱数は暗号用の乱数（crypto.getRandomValues）から作る。
 */
export function localId(now: number): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const random = (buf[0] as number).toString(36).padStart(6, '0').slice(-6);
  return `${now.toString(36)}${random}`;
}
