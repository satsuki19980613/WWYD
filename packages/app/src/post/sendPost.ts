import { CREATE_POST_URL, getToken } from '../backend/neon.ts';

export type SendResult = { ok: true; id: string } | { ok: false; code: string; index?: number };

/**
 * Neon Function `create-post` に投稿を送る（詳細仕様 03 章 §3）。
 * 失敗はエラーコードで返す（通信の失敗は `network`）。文言への変換は errorMessages.ts。
 */
export async function sendPost(body: Record<string, unknown>): Promise<SendResult> {
  let res: Response;
  try {
    const token = await getToken();
    if (!token) return { ok: false, code: 'not_authenticated' };
    res = await fetch(CREATE_POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: 'network' };
  }
  let data: { id?: unknown; error?: unknown; detail?: { index?: unknown } } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    // 本文が JSON でない（ゲートウェイのエラー等）
  }
  if (res.status === 201 && typeof data.id === 'string') return { ok: true, id: data.id };
  const code = typeof data.error === 'string' ? data.error : res.status >= 500 ? 'internal' : 'network';
  const index = typeof data.detail?.index === 'number' ? data.detail.index : undefined;
  return index === undefined ? { ok: false, code } : { ok: false, code, index };
}
