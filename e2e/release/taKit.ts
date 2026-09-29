/**
 * リリース前の総合テスト T-A（機能とシナリオ）の共通の部品。偽のバックエンド（../fakeBackend.ts）に、
 * 一覧の絞り込みを見る list_posts・投稿の create-post・whoami・ヘルスチェックの差し替えと、
 * 捕まえていない例外（pageerror）・console.error の記録を足す。本物のバックエンドにはつながない。
 */
import type { Page, Route } from '@playwright/test';
import { AUTH, DATA, fakeBackend, type Backend } from '../fakeBackend.ts';

export { AUTH, DATA, fakeBackend };
export type { Backend };
export const FN = 'http://fn.e2e.test';

export type Json = Record<string, unknown> | unknown[] | null;

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

export async function fulfillJson(route: Route, status: number, body: Json): Promise<void> {
  await route.fulfill({ status, headers: { ...cors(route), 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** 捕まえていない例外と console.error を集める（テストの最後に expect(errors).toEqual([]) で確かめる） */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // 偽のバックエンドが 4xx / 5xx を返す試験では、ブラウザ自身が出すリソースの読み込み失敗の行が出る（アプリの例外ではない）
    if (/Failed to load resource/.test(t)) return;
    // 開発サーバー（Vite）の HMR の WebSocket が、負荷の高い実行で一瞬つながらないときの行（アプリの例外ではない）
    if (/WebSocket connection to 'ws:\/\/localhost/.test(t)) return;
    errors.push(`console.error: ${t}`);
  });
  return errors;
}

export type ListCall = { tab: unknown; street: unknown; sort: unknown; after: unknown; limit: unknown };

/**
 * list_posts を、引数（p_tab・p_street・p_sort・p_after・p_limit）で絞り込み・並び替え・ページ分けして返す。
 * 呼ばれた引数を calls に記録する。
 */
export async function fakeList(page: Page, rows: Record<string, unknown>[]): Promise<{ calls: ListCall[] }> {
  const calls: ListCall[] = [];
  await page.route(`${DATA}/rpc/list_posts`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    const a = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push({ tab: a['p_tab'], street: a['p_street'], sort: a['p_sort'], after: a['p_after'], limit: a['p_limit'] });
    let out = rows.slice();
    if (a['p_tab'] === 'mine') out = out.filter((r) => r['is_mine']);
    if (a['p_street']) out = out.filter((r) => r['street'] === a['p_street']);
    if (a['p_sort'] === 'many') out.sort((x, y) => Number(y['answer_count']) - Number(x['answer_count']));
    else out.sort((x, y) => String(y['created_at']).localeCompare(String(x['created_at'])));
    const limit = Number(a['p_limit'] ?? 20);
    const after = a['p_after'] as { id?: string } | null;
    let start = 0;
    if (after?.id) start = out.findIndex((r) => r['id'] === after.id) + 1;
    return fulfillJson(route, 200, out.slice(start, start + limit));
  });
  return { calls };
}

export const POST_ID = '00000000-0000-4000-8000-000000000001';

/** 一覧の 1 行（既定は他人のターンの投稿） */
export function row(n: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  const id = `00000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`;
  return {
    id,
    created_at: new Date(Date.UTC(2026, 8, 28, 10, 0, 0) - n * 60_000).toISOString().replace('Z', '000+00:00'),
    title: `投稿${n}`,
    fmt: 'cash',
    hero: 'BTN',
    street: 'turn',
    effective_stack: 100,
    answer_count: n,
    is_mine: false,
    answered_by_me: false,
    can_delete: false,
    players: 6,
    board: ['Kh', '8d', '3c', '2s'],
    ...over,
  };
}

/** ヘルスチェック（/api/auth/ok）を差し替える */
export async function healthAs(page: Page, status: number | 'abort' | 'hang'): Promise<void> {
  await page.route('**/api/auth/ok', async (route) => {
    if (status === 'abort') return route.abort('connectionrefused');
    if (status === 'hang') return; // 応答しない（タイムアウト）
    return fulfillJson(route, status, { ok: status < 400 });
  });
}

/** whoami を差し替える */
export async function whoamiAs(page: Page, status: number, body: Json): Promise<void> {
  await page.route(`${DATA}/rpc/whoami`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    return fulfillJson(route, status, body);
  });
}

export type CreatePostCall = { body: Record<string, unknown>; auth: string | undefined };

/**
 * create-post（Neon Function）。responder が状態とコードを決める。既定は 201 と id。
 * 受け取った本文と Authorization を calls に記録する。
 */
export async function fakeCreatePost(
  page: Page,
  responder: (body: Record<string, unknown>, n: number) => { status: number; body: Json } = () => ({ status: 201, body: { id: POST_ID } }),
): Promise<{ calls: CreatePostCall[] }> {
  const calls: CreatePostCall[] = [];
  await page.route(`${FN}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push({ body, auth: route.request().headers()['authorization'] });
    const r = responder(body, calls.length);
    return fulfillJson(route, r.status, r.body);
  });
  return { calls };
}
