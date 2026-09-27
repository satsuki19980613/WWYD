import { validateInput, ValidationError, verifyPost } from '@wwyd/core';
import { toInsertPayload, type InsertPayload } from './payload.ts';

/**
 * Neon Function `create-post` の本体（詳細仕様 03 章 §3）。外との境目（JWT の検証・DB）は引数で受け取り、
 * HTTP の振る舞い（CORS・認証・検証・エラーの写し方）を単体テストできるようにする。
 */
export type CreatePostDeps = {
  /** Neon Auth の JWT を検証し、ログイン中のユーザーの UID を返す（無効なら null）。 */
  verifyToken: (token: string) => Promise<string | null>;
  /** `insert_post` を DB の所有者として呼び、投稿の ID を返す。DB の `fail()` は `DbError` で投げる。 */
  insertPost: (uid: string, payload: InsertPayload) => Promise<string>;
  /** ブラウザから呼んでよいオリジン（本番とローカル開発）。 */
  allowedOrigins: readonly string[];
  /** 想定外のエラーの記録（本文には内部情報を出さない）。 */
  logError?: (message: string, error: unknown) => void;
};

/** DB の `public.fail(code)`（SQLSTATE P0001、メッセージがコード）。 */
export class DbError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'DbError';
    this.code = code;
  }
}

/** 本文の上限。6max の 1 ハンドなら数 KB で収まる。 */
export const MAX_BODY_BYTES = 64 * 1024;

type Json = Record<string, unknown>;

export function createPostHandler(deps: CreatePostDeps): (req: Request) => Promise<Response> {
  const allowed = new Set(deps.allowedOrigins);
  const log = deps.logError ?? ((m: string, e: unknown) => console.error(m, e));

  return async (req) => {
    const origin = req.headers.get('Origin');
    const cors: Record<string, string> = { Vary: 'Origin' };
    if (origin && allowed.has(origin)) cors['Access-Control-Allow-Origin'] = origin;

    const reply = (status: number, body: Json | null): Response =>
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: body === null ? cors : { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
      });

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600',
        },
      });
    }
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

    // 1. 認証
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
    let uid: string | null = null;
    if (m?.[1]) {
      try {
        uid = await deps.verifyToken(m[1]);
      } catch {
        uid = null;
      }
    }
    if (!uid) return reply(401, { error: 'not_authenticated' });

    // 2〜7. 形の検証・カード・再生・スポット・派生メタの照合・マックの補完（packages/core）
    let payload: InsertPayload;
    try {
      const text = await req.text();
      if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return reply(422, { error: 'malformed' });
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return reply(422, { error: 'malformed' });
      }
      payload = toInsertPayload(verifyPost(validateInput(raw)));
    } catch (e) {
      if (e instanceof ValidationError) {
        return reply(422, e.index === undefined ? { error: e.code } : { error: e.code, detail: { index: e.index } });
      }
      log('create-post: 検証中の想定外のエラー', e);
      return reply(500, { error: 'internal' });
    }

    // 8. 保存（サーバーが計算した値）
    try {
      const id = await deps.insertPost(uid, payload);
      return reply(201, { id });
    } catch (e) {
      if (e instanceof DbError && e.code === 'daily_limit') return reply(429, { error: 'daily_limit' });
      if (e instanceof DbError && e.code === 'not_allowed') return reply(403, { error: 'not_allowed' });
      log('create-post: 保存に失敗', e);
      return reply(500, { error: 'internal' });
    }
  };
}
