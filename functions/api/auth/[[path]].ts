import { proxyAuth } from '../../../packages/app/src/backend/authProxy.ts';

/**
 * Cloudflare Pages Functions: `/api/auth/*` を本番の Neon Auth へ中継し、セッションのクッキーを自サイトのものにする
 * （詳細仕様 12 章 §7.2。中身は packages/app/src/backend/authProxy.ts）。
 * 本番の Neon Auth の URL（.env.production の VITE_NEON_AUTH_URL と同じ。公開の住所）。変えたら .env.production・public/_headers と合わせて直す。
 * Pages Functions の実行は Workers の無料枠（1 日 10 万回）に数える。静的なファイルの配信は関数を通らない。
 */
export const UPSTREAM = 'https://ep-aged-wave-b3j6dpzy.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth';

export const onRequest = (ctx: { request: Request; params: { path?: string | string[] } }): Promise<Response> => {
  const p = ctx.params.path;
  return proxyAuth(ctx.request, UPSTREAM, Array.isArray(p) ? p.join('/') : (p ?? ''));
};
