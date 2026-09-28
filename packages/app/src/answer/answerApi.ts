import { encodePaint, mbbToBb, toHex, type Mbb, type Paint } from '@wwyd/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../backend/neon.ts';
import { errorCode, parsePostDetail, type PostDetail } from './postDetail.ts';

/**
 * 回答・集計画面の通信（詳細仕様 06 章 §4.2・§4.9）。
 * - 読み込み: `get_post_detail`
 * - 回答: `answers` への insert（検証・集計はトリガ。02 章 §4.5）
 * - Hero の想定レンジ: `save_host_answer`
 */

export type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: PostDetail }
  | { status: 'notFound' }
  | { status: 'error' };

/** 投稿 1 件を読む。`reload` は送信後などに読み直すとき。後から始めた読み込みを優先する。 */
export function usePostDetail(id: string): { state: DetailState; reload: () => void } {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const gen = useRef(0);

  const load = useCallback(() => {
    const my = ++gen.current;
    setState({ status: 'loading' });
    db.rpc('get_post_detail', { p_post_id: id }).then(
      ({ data, error }) => {
        if (my !== gen.current) return;
        if (error) {
          setState({ status: errorCode(error) === 'post_not_found' ? 'notFound' : 'error' });
          return;
        }
        try {
          setState({ status: 'ready', detail: parsePostDetail(data) });
        } catch {
          setState({ status: 'error' });
        }
      },
      () => {
        if (my === gen.current) setState({ status: 'error' });
      },
    );
  }, [id]);

  useEffect(load, [load]);
  return { state, reload: load };
}

export type SendResult = { ok: true } | { ok: false; code: string };

const paintHex = (paint: Paint): string => toHex(encodePaint(paint));
const sizeBb = (size: Mbb | null): number | null => (size === null ? null : mbbToBb(size));

/** 回答を送る。主キーの重複（2 回目）は `already_answered`。 */
export async function insertAnswer(postId: string, paint: Paint, size: Mbb | null): Promise<SendResult> {
  try {
    const { error } = await db.from('answers').insert({ post_id: postId, paint: paintHex(paint), size: sizeBb(size) });
    return error ? { ok: false, code: errorCode(error) } : { ok: true };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/** Hero の想定レンジを保存する（何度でも上書き）。 */
export async function saveHostAnswer(postId: string, paint: Paint, size: Mbb | null): Promise<SendResult> {
  try {
    const { error } = await db.rpc('save_host_answer', { p_post_id: postId, p_paint: paintHex(paint), p_size: sizeBb(size) });
    return error ? { ok: false, code: errorCode(error) } : { ok: true };
  } catch {
    return { ok: false, code: 'network' };
  }
}
