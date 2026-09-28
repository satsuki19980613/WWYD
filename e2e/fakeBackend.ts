import type { Page, Route } from '@playwright/test';

/**
 * 偽のバックエンド（Neon Auth・Data API）。ログイン済みの利用者として、アプリの起動（ヘルスチェック →
 * セッション → whoami）と、投稿の読み込み・回答・Hero の予想の保存に答える。受け取った要求は記録する。
 */

export const AUTH = 'http://auth.e2e.test';
export const DATA = 'http://data.e2e.test';
export const UID = '11111111-1111-4111-8111-111111111111';

type Json = Record<string, unknown> | unknown[] | null;

export type Backend = {
  /** get_post_detail の応答（テストの途中で差し替えられる）。null なら post_not_found */
  detail: Json;
  /** answers への insert の本文 */
  inserts: Record<string, unknown>[];
  /** save_host_answer の引数 */
  hostSaves: Record<string, unknown>[];
  /** insert をこのエラー（PostgREST の本文）で拒否する。null なら受け付ける */
  insertError: { status: number; body: Record<string, unknown> } | null;
  /** insert を受け付けたら、get_post_detail の応答をこれに差し替える（回答済みの状態） */
  afterInsert: Json;
  /** posts の delete で消した ID */
  deletes: string[];
  /** 呼ばれた認証・RPC の操作（'sign-out'・'delete_my_account'） */
  calls: string[];
  /** delete_my_account をこのエラーで拒否する。null なら受け付ける */
  deleteAccountError: { status: number; body: Record<string, unknown> } | null;
};

/** 回答済み（answers の主キーの重複） */
export const DUPLICATE = {
  status: 409,
  body: { code: '23505', message: 'duplicate key value violates unique constraint "answers_pkey"', details: null, hint: null },
};

function fakeJwt(): string {
  const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ sub: UID, exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
}

/** 別オリジン（localhost → 偽のホスト）なので CORS の応答ヘッダーを付ける（Cookie 付きの要求もある） */
function cors(route: Route): Record<string, string> {
  const req = route.request();
  return {
    'access-control-allow-origin': req.headers()['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*',
    'access-control-expose-headers': 'content-range, content-profile',
  };
}

async function json(route: Route, status: number, body: Json): Promise<void> {
  await route.fulfill({ status, headers: { ...cors(route), 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** `signedIn: false` なら未ログイン（セッションなし） */
export async function fakeBackend(page: Page, detail: Json, opts: { signedIn?: boolean } = {}): Promise<Backend> {
  const signedIn = opts.signedIn ?? true;
  const be: Backend = { detail, inserts: [], hostSaves: [], insertError: null, afterInsert: null, deletes: [], calls: [], deleteAccountError: null };

  await page.route(`${AUTH}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    const path = new URL(route.request().url()).pathname;
    if (path === '/ok') return json(route, 200, { ok: true });
    if (path === '/get-session') return json(route, 200, signedIn ? { user: { id: UID }, session: { userId: UID } } : null);
    if (path === '/token') return json(route, 200, { token: fakeJwt() });
    if (path === '/sign-out') {
      be.calls.push('sign-out');
      return json(route, 200, { success: true });
    }
    return json(route, 404, { message: 'not found' });
  });

  await page.route(`${DATA}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    const path = new URL(req.url()).pathname;
    const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
    if (path === '/rpc/whoami') return json(route, 200, { allowed: true, admin: false });
    if (path === '/rpc/get_post_detail') {
      if (be.detail === null) return json(route, 400, { code: 'P0001', message: 'post_not_found', details: null, hint: null });
      return json(route, 200, be.detail);
    }
    if (path === '/answers' && req.method() === 'POST') {
      if (be.insertError) return json(route, be.insertError.status, be.insertError.body);
      be.inserts.push(body);
      if (be.afterInsert) be.detail = be.afterInsert;
      return route.fulfill({ status: 201, headers: cors(route), body: '' });
    }
    if (path === '/posts' && req.method() === 'DELETE') {
      // `delete ... eq('id', …) select('id')`: 消した行を返す
      const id = (new URL(req.url()).searchParams.get('id') ?? '').replace(/^eq\./, '');
      be.deletes.push(id);
      return json(route, 200, [{ id }]);
    }
    if (path === '/rpc/list_posts') return json(route, 200, []);
    if (path === '/rpc/delete_my_account') {
      be.calls.push('delete_my_account');
      if (be.deleteAccountError) return json(route, be.deleteAccountError.status, be.deleteAccountError.body);
      return route.fulfill({ status: 204, headers: cors(route), body: '' });
    }
    if (path === '/rpc/save_host_answer') {
      be.hostSaves.push(body);
      return route.fulfill({ status: 204, headers: cors(route), body: '' });
    }
    return json(route, 404, { code: 'PGRST202', message: `偽のバックエンドに無い: ${req.method()} ${path}` });
  });

  return be;
}
