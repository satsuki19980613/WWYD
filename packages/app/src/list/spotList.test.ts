import { describe, expect, it, vi } from 'vitest';
import {
  appendPage,
  cardAction,
  cardStatus,
  emptyState,
  fetchPostPage,
  findNextSpot,
  pickNext,
  formatAgo,
  formatLabel,
  listPostsArgs,
  listSearch,
  PAGE_SIZE,
  parseListQuery,
  STREET_ITEMS,
  type ListQuery,
  type PostRow,
  type RpcCaller,
} from './spotList.ts';

function row(over: Partial<PostRow> = {}): PostRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    created_at: '2026-09-28T10:00:00.123456+00:00',
    title: 'BTN の 3bet',
    fmt: 'cash',
    hero: 'BTN',
    street: 'flop',
    effective_stack: 100,
    answer_count: 3,
    is_mine: false,
    answered_by_me: false,
    can_delete: false,
    ...over,
  };
}

const ALL: ListQuery = { tab: 'all', street: 'all', sort: 'new' };

describe('parseListQuery / listSearch', () => {
  it('既定値', () => {
    expect(parseListQuery('')).toEqual(ALL);
    expect(listSearch(ALL)).toBe('');
  });
  it('06 章 §0.1 の例を往復できる', () => {
    const q = parseListQuery('?tab=mine&street=flop&sort=many');
    expect(q).toEqual({ tab: 'mine', street: 'flop', sort: 'many' });
    expect(listSearch(q)).toBe('?tab=mine&street=flop&sort=many');
  });
  it('Preflop は出題しないので絞り込めない（既定値にする）', () => {
    expect(parseListQuery('?street=pf').street).toBe('all');
    expect(STREET_ITEMS.map((i) => i.value)).toEqual(['all', 'flop', 'turn', 'river']);
  });
  it('知らない値は既定値にする', () => {
    expect(parseListQuery('?tab=x&street=preflop&sort=old&devstate=offline')).toEqual(ALL);
  });
  it('既定値の項目は省く', () => {
    expect(listSearch({ tab: 'all', street: 'river', sort: 'new' })).toBe('?street=river');
  });
});

describe('listPostsArgs', () => {
  it('1 ページ目。Street すべては null', () => {
    expect(listPostsArgs(ALL, null)).toEqual({
      p_tab: 'all',
      p_street: null,
      p_sort: 'new',
      p_after: null,
      p_limit: PAGE_SIZE,
    });
  });
  it('2 ページ目は前ページ最後の行をカーソルにする（created_at は文字列のまま）', () => {
    const last = row({ id: 'abc', answer_count: 7 });
    expect(listPostsArgs({ tab: 'mine', street: 'turn', sort: 'many' }, last)).toEqual({
      p_tab: 'mine',
      p_street: 'turn',
      p_sort: 'many',
      p_after: { created_at: '2026-09-28T10:00:00.123456+00:00', id: 'abc', answer_count: 7 },
      p_limit: PAGE_SIZE,
    });
  });
});

describe('次の Spot（14 章）', () => {
  it('未回答・自分の投稿でない・今の投稿でない最初の行', () => {
    const rows = [
      row({ id: 'cur' }),
      row({ id: 'done', answered_by_me: true }),
      row({ id: 'mine', is_mine: true }),
      row({ id: 'next' }),
    ];
    expect(pickNext(rows, 'cur')?.id).toBe('next');
    expect(pickNext(rows.slice(0, 3), 'cur')).toBeNull();
  });
  it('1 ページ目に無ければ続きを読む。3 ページで止める', async () => {
    const full = (p: string, o: Partial<PostRow>) => Array.from({ length: PAGE_SIZE }, (_, i) => row({ id: `${p}${i}`, ...o }));
    const pages = [full('a', { answered_by_me: true }), [...full('b', { is_mine: true }).slice(1), row({ id: 'hit' })]];
    const rpc = vi.fn<RpcCaller>(async () => ({ data: pages.shift() ?? [], error: null }));
    expect(await findNextSpot(rpc, 'cur')).toBe('hit');
    expect(rpc).toHaveBeenCalledTimes(2);
    const none = vi.fn<RpcCaller>(async () => ({ data: full('c', { answered_by_me: true }), error: null }));
    expect(await findNextSpot(none, 'cur')).toBeNull();
    expect(none).toHaveBeenCalledTimes(3);
  });
});

describe('fetchPostPage', () => {
  it('list_posts を呼び、20 件ちょうどなら続きがある', async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => row({ id: `id${i}` }));
    const rpc = vi.fn<RpcCaller>(async () => ({ data: rows, error: null }));
    const page = await fetchPostPage(rpc, ALL, null);
    expect(rpc).toHaveBeenCalledWith('list_posts', listPostsArgs(ALL, null));
    expect(page).toEqual({ rows, hasMore: true });
  });
  it('20 件未満なら終わり', async () => {
    const rpc: RpcCaller = async () => ({ data: [row()], error: null });
    expect((await fetchPostPage(rpc, ALL, null)).hasMore).toBe(false);
  });
  it('エラーは例外', async () => {
    const rpc: RpcCaller = async () => ({ data: null, error: { message: 'x' } });
    await expect(fetchPostPage(rpc, ALL, null)).rejects.toThrow();
  });
  it('配列でない応答は例外', async () => {
    const rpc: RpcCaller = async () => ({ data: { id: 1 }, error: null });
    await expect(fetchPostPage(rpc, ALL, null)).rejects.toThrow();
  });
});

describe('appendPage', () => {
  it('id の重複を除いてつなぐ（回答数順で順位が動いたとき）', () => {
    const a = row({ id: 'a' });
    const b = row({ id: 'b' });
    const c = row({ id: 'c' });
    expect(appendPage([a, b], [b, c]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('formatLabel', () => {
  it('Cash · 100bb / MTT · 22.5bb', () => {
    expect(formatLabel({ fmt: 'cash', effective_stack: 100 })).toBe('Cash · 100bb');
    expect(formatLabel({ fmt: 'mtt', effective_stack: 22.5 })).toBe('MTT · 22.5bb');
  });
});

describe('formatAgo（06 章 §2.2）', () => {
  const t0 = '2026-09-28T00:00:00Z';
  const at = (ms: number): number => Date.parse(t0) + ms;
  const MIN = 60_000;
  const H = 60 * MIN;
  it.each([
    [-5 * MIN, 'たった今'],
    [0, 'たった今'],
    [59_999, 'たった今'],
    [MIN, '1分前'],
    [59 * MIN + 59_999, '59分前'],
    [H, '1時間前'],
    [23 * H + 59 * MIN, '23時間前'],
    [24 * H, '昨日'],
    [47 * H, '昨日'],
    [48 * H, '2日前'],
    [30 * 24 * H, '30日前'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatAgo(t0, at(ms))).toBe(expected);
  });
});

describe('cardStatus / cardAction', () => {
  it('未回答', () => {
    const r = row({ id: 'p1' });
    expect(cardStatus(r)).toBeNull();
    expect(cardAction(r)).toEqual({ primary: true, label: '回答する', to: '/s/p1/answer' });
  });
  it('回答済み', () => {
    const r = row({ id: 'p1', answered_by_me: true });
    expect(cardStatus(r)).toBe('answered');
    expect(cardAction(r)).toEqual({ primary: false, label: '結果を見る', to: '/s/p1/result' });
  });
  it('自分の投稿: 未回答なら回答する、回答済みなら回答を見る（投稿者も回答してから集計を見る）', () => {
    const r = row({ id: 'p1', is_mine: true });
    expect(cardStatus(r)).toBe('mine');
    expect(cardAction(r)).toEqual({ primary: true, label: '回答する', to: '/s/p1/answer' });
    const answered = row({ id: 'p1', is_mine: true, answered_by_me: true });
    expect(cardStatus(answered)).toBe('mine');
    expect(cardAction(answered)).toEqual({ primary: false, label: '回答を見る', to: '/s/p1/result' });
  });
});

describe('emptyState（06 章 §2.3）', () => {
  it('自分の投稿・Street すべては「投稿なし」＋投稿ボタン', () => {
    expect(emptyState({ tab: 'mine', street: 'all', sort: 'many' })).toEqual({ label: '投稿なし', showPost: true });
  });
  it('それ以外は「該当 Spot なし」', () => {
    expect(emptyState({ tab: 'mine', street: 'flop', sort: 'new' })).toEqual({ label: '該当 Spot なし', showPost: false });
    expect(emptyState(ALL)).toEqual({ label: '該当 Spot なし', showPost: false });
  });
});
