/**
 * Neon Function `create-post` の入口（詳細仕様 03 章 §3、12 章 S-4）。
 * 配備: `npx neonctl functions deploy createpost --src packages/functions/src/createPost/index.ts ...`
 * （esbuild が packages/core と依存をまとめる。環境変数 ALLOWED_ORIGINS はカンマ区切りで --env に渡す）
 *
 * Neon が自動で入れる環境変数:
 * - DATABASE_URL: DB の所有者の接続文字列（プール経由）。insert_post は所有者だけが実行できる
 * - NEON_AUTH_JWKS_URL / NEON_AUTH_BASE_URL: Neon Auth の公開鍵と住所（JWT の検証に使う）
 */
import { attachDatabasePool } from '@neon/functions';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';
import { createPostHandler, DbError } from './handler.ts';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} がありません`);
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pool = new pg.Pool({ connectionString: env('DATABASE_URL'), max: 2 });
attachDatabasePool(pool);

const jwks = createRemoteJWKSet(new URL(env('NEON_AUTH_JWKS_URL')));
// Neon Auth の JWT の iss は Auth の URL のオリジン（スパイク S-4 で確認）
const issuer = new URL(env('NEON_AUTH_BASE_URL')).origin;

const handler = createPostHandler({
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  async verifyToken(token) {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (payload.role !== 'authenticated') return null;
    return typeof payload.sub === 'string' && UUID.test(payload.sub) ? payload.sub : null;
  },

  async insertPost(uid, payload) {
    try {
      const { rows } = await pool.query<{ id: string }>('select public.insert_post($1::uuid, $2::jsonb) as id', [
        uid,
        JSON.stringify(payload),
      ]);
      const id = rows[0]?.id;
      if (!id) throw new Error('insert_post が ID を返さなかった');
      return id;
    } catch (e) {
      // public.fail(code) は SQLSTATE P0001、メッセージがコード
      if (e instanceof pg.DatabaseError && e.code === 'P0001') throw new DbError(e.message);
      throw e;
    }
  },

  logError(message, error) {
    // カードや本文は出さない。エラーの種類とメッセージだけ
    console.error(message, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  },
});

export default { fetch: handler };
