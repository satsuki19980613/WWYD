import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../backend/neon.ts';
import { appendPage, fetchPostPage, type ListQuery, type PostRow, type RpcCaller } from './spotList.ts';

export type SpotList = {
  rows: PostRow[];
  /** 初回の読み込み */
  status: 'loading' | 'ready' | 'error';
  /** 追加読み込み */
  more: 'idle' | 'loading' | 'error';
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
  remove: (id: string) => void;
};

const rpc: RpcCaller = (fn, args) => db.rpc(fn, args);

/**
 * 一覧の読み込み（06 章 §2.3）。クエリが変わったら最初から読み直す。
 * 後から始めた読み込みを優先し、古い応答は捨てる（タブを素早く切り替えたとき）。
 */
export function useSpotList(query: ListQuery): SpotList {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [status, setStatus] = useState<SpotList['status']>('loading');
  const [more, setMore] = useState<SpotList['more']>('idle');
  const [hasMore, setHasMore] = useState(false);
  const gen = useRef(0);
  // loadMore から最新の値を読むため（IntersectionObserver のコールバックは作り直さない）
  const latest = useRef({ rows, more, hasMore, status });
  latest.current = { rows, more, hasMore, status };

  const { tab, street, sort } = query;

  const loadFirst = useCallback(() => {
    const id = ++gen.current;
    setStatus('loading');
    setMore('idle');
    setRows([]);
    setHasMore(false);
    fetchPostPage(rpc, { tab, street, sort }, null).then(
      (page) => {
        if (id !== gen.current) return;
        setRows(page.rows);
        setHasMore(page.hasMore);
        setStatus('ready');
      },
      () => {
        if (id === gen.current) setStatus('error');
      },
    );
  }, [tab, street, sort]);

  useEffect(loadFirst, [loadFirst]);

  const loadMore = useCallback(() => {
    const cur = latest.current;
    if (cur.status !== 'ready' || cur.more === 'loading' || !cur.hasMore) return;
    const last = cur.rows[cur.rows.length - 1] ?? null;
    const id = gen.current;
    setMore('loading');
    latest.current = { ...cur, more: 'loading' };
    fetchPostPage(rpc, { tab, street, sort }, last).then(
      (page) => {
        if (id !== gen.current) return;
        setRows((prev) => appendPage(prev, page.rows));
        setHasMore(page.hasMore);
        setMore('idle');
      },
      () => {
        if (id === gen.current) setMore('error');
      },
    );
  }, [tab, street, sort]);

  const retry = useCallback(() => {
    if (latest.current.status === 'error') loadFirst();
    else {
      setMore('idle');
      latest.current = { ...latest.current, more: 'idle' };
      loadMore();
    }
  }, [loadFirst, loadMore]);

  const remove = useCallback((postId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== postId));
  }, []);

  return { rows, status, more, hasMore, loadMore, retry, remove };
}

/**
 * 投稿を削除する（本人または管理者。posts の RLS が判定し、回答・集計はカスケードで消える）。
 * RLS で弾かれた削除はエラーにならず 0 件になるので、消えた行を返させて確かめる。
 */
export async function deletePost(postId: string): Promise<void> {
  const { data, error } = await db.from('posts').delete().eq('id', postId).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length !== 1) throw new Error('削除できませんでした');
}
