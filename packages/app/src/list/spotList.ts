import { bbToMbb, formatBb, STREETS, type Pos, type Street } from '@wwyd/core';

/**
 * スポット一覧のデータ層（詳細仕様 02 章 §4.2 `list_posts`、06 章 §2）。
 * 画面から切り離した純関数（クエリの解釈、ページングのカーソル、重複の除去、表示用の文言）と、
 * RPC の呼び出し（呼び出し口を引数で受け取り、単体テストではモックを渡す）を置く。
 */

export type ListTab = 'all' | 'mine';
/** スポットのストリート（フロップ以降。プリフロップは出題しない。04 章 §8.1） */
export type SpotStreet = Exclude<Street, 'pf'>;
export const SPOT_STREETS: readonly SpotStreet[] = STREETS.filter((s): s is SpotStreet => s !== 'pf');
export type StreetFilter = 'all' | SpotStreet;
export type ListSort = 'new' | 'many';
export type ListQuery = { tab: ListTab; street: StreetFilter; sort: ListSort };

export const DEFAULT_QUERY: ListQuery = { tab: 'all', street: 'all', sort: 'new' };

/** 1 回に読む件数（06 章 §2.3「次の 20 件」）。 */
export const PAGE_SIZE = 20;

/** `list_posts` の 1 行。 */
export type PostRow = {
  id: string;
  /** サーバーの文字列のまま持つ（マイクロ秒を含む。Date にするとミリ秒に丸まり、カーソルがずれる） */
  created_at: string;
  title: string;
  fmt: 'cash' | 'mtt';
  hero: Pos;
  street: Street;
  effective_stack: number;
  answer_count: number;
  is_mine: boolean;
  answered_by_me: boolean;
  can_delete: boolean;
  /** 人数（2〜6）と、スポットの Street までの Board（17 章。マイグレーション 20260929000002 より前のサーバーは返さない） */
  players?: number;
  board?: string[];
  /** Villain・MTT の情報があるか（一覧の印 `Reads`・`MTT`。18 章。マイグレーション 20260930000000 より前のサーバーは返さない） */
  has_reads?: boolean;
  has_mtt?: boolean;
};

export const TAB_ITEMS: readonly { value: ListTab; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'mine', label: '自分の投稿' },
];

export const STREET_LABEL: Record<Street, string> = {
  pf: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

export const STREET_ITEMS: readonly { value: StreetFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  ...SPOT_STREETS.map((s) => ({ value: s, label: STREET_LABEL[s] })),
];

export const SORT_ITEMS: readonly { value: ListSort; label: string }[] = [
  { value: 'new', label: '新着順' },
  { value: 'many', label: '回答が多い順' },
];

// ---- URL のクエリ（06 章 §0.1 `?tab=mine&street=flop&sort=many`） ----

/** クエリから一覧の状態を読む。知らない値は既定値にする。 */
export function parseListQuery(search: string): ListQuery {
  const p = new URLSearchParams(search);
  const tab = p.get('tab');
  const street = p.get('street');
  const sort = p.get('sort');
  return {
    tab: tab === 'mine' ? 'mine' : 'all',
    street: SPOT_STREETS.find((s) => s === street) ?? 'all',
    sort: sort === 'many' ? 'many' : 'new',
  };
}

/** 一覧の状態をクエリ文字列にする（既定値は省く。すべて既定なら空文字）。 */
export function listSearch(q: ListQuery): string {
  const p = new URLSearchParams();
  if (q.tab !== DEFAULT_QUERY.tab) p.set('tab', q.tab);
  if (q.street !== DEFAULT_QUERY.street) p.set('street', q.street);
  if (q.sort !== DEFAULT_QUERY.sort) p.set('sort', q.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---- 読み込み ----

/** `list_posts` の引数。`after` は前ページの最後の行（無ければ 1 ページ目）。 */
export function listPostsArgs(q: ListQuery, after: PostRow | null): Record<string, unknown> {
  return {
    p_tab: q.tab,
    p_street: q.street === 'all' ? null : q.street,
    p_sort: q.sort,
    p_after: after ? { created_at: after.created_at, id: after.id, answer_count: after.answer_count } : null,
    p_limit: PAGE_SIZE,
  };
}

/** Data API の RPC の呼び出し口（`db.rpc` と同じ形。テストではモックを渡す）。 */
export type RpcCaller = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

export type Page = { rows: PostRow[]; hasMore: boolean };

/** 1 ページ読む。失敗したら例外。件数が PAGE_SIZE ちょうどなら続きがあるものとする。 */
export async function fetchPostPage(rpc: RpcCaller, q: ListQuery, after: PostRow | null): Promise<Page> {
  const { data, error } = await rpc('list_posts', listPostsArgs(q, after));
  if (error) throw error instanceof Error ? error : new Error('list_posts が失敗しました');
  if (!Array.isArray(data)) throw new Error('list_posts の応答が配列ではありません');
  const rows = data as PostRow[];
  return { rows, hasMore: rows.length >= PAGE_SIZE };
}

/** 「次のスポット」に選べる行（未回答・自分の投稿でない・今見ている投稿でない。14 章） */
export function pickNext(rows: readonly PostRow[], currentId: string): PostRow | null {
  return rows.find((r) => !r.answered_by_me && !r.is_mine && r.id !== currentId) ?? null;
}

/** 次に答えるスポットを新着順から探す（最大 3 ページ）。無ければ null。 */
export async function findNextSpot(rpc: RpcCaller, currentId: string): Promise<string | null> {
  let after: PostRow | null = null;
  for (let i = 0; i < 3; i++) {
    const page = await fetchPostPage(rpc, DEFAULT_QUERY, after);
    const hit = pickNext(page.rows, currentId);
    if (hit) return hit.id;
    if (!page.hasMore) return null;
    after = page.rows[page.rows.length - 1] ?? null;
  }
  return null;
}

/**
 * 読み込み済みの行に次のページをつなぐ。回答数順は読んでいる間に順位が動き、同じ投稿が
 * 2 回来ることがあるので `id` で重複を除く（02 章 §4.2。抜けは許容）。
 */
export function appendPage(prev: readonly PostRow[], page: readonly PostRow[]): PostRow[] {
  const seen = new Set(prev.map((r) => r.id));
  return [...prev, ...page.filter((r) => !seen.has(r.id))];
}

// ---- 表示 ----

/** 「キャッシュ · 100bb」「MTT · 22bb」 */
export function formatLabel(row: Pick<PostRow, 'fmt' | 'effective_stack'>): string {
  const mbb = bbToMbb(Number(row.effective_stack));
  const stack = mbb === null ? String(row.effective_stack) : formatBb(mbb);
  return `${row.fmt === 'mtt' ? 'MTT' : 'Cash'} · ${stack}bb`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 経過時間（06 章 §2.2）。端末の時計が遅れていて未来の時刻になるときは「たった今」。 */
export function formatAgo(createdAt: string, now: number): string {
  const elapsed = now - Date.parse(createdAt);
  if (!Number.isFinite(elapsed) || elapsed < MINUTE) return 'たった今';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}分前`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}時間前`;
  if (elapsed < 2 * DAY) return '昨日';
  return `${Math.floor(elapsed / DAY)}日前`;
}

export type CardStatus = 'mine' | 'answered' | null;

/** 右上の状態（自分の投稿が優先）。 */
export function cardStatus(row: Pick<PostRow, 'is_mine' | 'answered_by_me'>): CardStatus {
  if (row.is_mine) return 'mine';
  if (row.answered_by_me) return 'answered';
  return null;
}

/**
 * カードの主操作。未回答は回答画面、回答済みは集計画面へ（09 章「遷移」）。投稿者も自分の投稿に回答してから集計を見る。
 * 遷移先は `/s/:id` の振り分けを通さず直接指す（振り分けはサーバー側でも行う）。
 */
export function cardAction(row: Pick<PostRow, 'id' | 'is_mine' | 'answered_by_me'>): {
  primary: boolean;
  label: string;
  to: string;
} {
  const id = encodeURIComponent(row.id);
  if (row.is_mine && row.answered_by_me) return { primary: false, label: '回答を見る', to: `/s/${id}/result` };
  if (row.answered_by_me) return { primary: false, label: '結果を見る', to: `/s/${id}/result` };
  return { primary: true, label: '回答する', to: `/s/${id}/answer` };
}

/** 空のときの表示（06 章 §2.3）。自分の投稿・ストリートすべてのときだけ投稿ボタンを添える。 */
export function emptyState(q: ListQuery): { label: string; showPost: boolean } {
  if (q.tab === 'mine' && q.street === 'all') return { label: '投稿なし', showPost: true };
  return { label: '該当 Spot なし', showPost: false };
}
