import { useEffect } from 'react';
import { Link } from '../components/Link.tsx';
import { usePostDetail } from '../answer/answerApi.ts';
import type { Viewer } from '../answer/postDetail.ts';
import { navigate, routePath } from '../router.ts';
import { AnswerScreen } from './AnswerScreen.tsx';
import { ResultScreen } from './ResultScreen.tsx';

export type SpotView = 'spot' | 'answer' | 'result';

/**
 * `/s/:id`・`/s/:id/answer`・`/s/:id/result` の共通の器（06 章 §0.1・§4.2・§5.1）。
 * `get_post_detail` を 1 回読み、`viewer` に合わない画面なら置き換え遷移する
 * （未回答 → 回答、回答済み → 集計。投稿者は回答画面で Hero の想定レンジを入力し、`/s/:id` からは集計へ）。
 * 画面を切り替えても同じ部品のまま（読み込み直さない）。
 */
export function SpotScreen(props: { id: string; view: SpotView }): JSX.Element {
  const { id, view } = props;
  const { state, reload } = usePostDetail(id);
  const viewer = state.status === 'ready' ? state.detail.viewer : null;
  const target = viewer ? targetView(view, viewer) : null;

  useEffect(() => {
    if (target && target !== view) navigate(routePath({ name: target, id }), { replace: true });
  }, [target, view, id]);

  if (state.status === 'loading' || (target && target !== view)) {
    return (
      <section className="screen ans" aria-busy="true">
        <div className="ans-skel" aria-hidden="true">
          <span className="sk sk-s" />
          <span className="sk sk-l" />
          <span className="sk ans-sk-block" />
        </div>
      </section>
    );
  }
  if (state.status === 'notFound') {
    return (
      <section className="screen">
        <div className="list-empty" role="alert">
          <p className="form-err">スポットが見つかりません</p>
          <Link to="/" className="btn ghost auto">
            一覧へ
          </Link>
        </div>
      </section>
    );
  }
  if (state.status === 'error') {
    return (
      <section className="screen">
        <div className="list-empty" role="alert">
          <p className="form-err">読み込みに失敗しました</p>
          <button type="button" className="btn ghost auto" onClick={reload}>
            再試行
          </button>
        </div>
      </section>
    );
  }

  if (view === 'answer') {
    return (
      <AnswerScreen
        detail={state.detail}
        onDone={(host) => {
          // 集計は送信後の値で読み直す。Hero の想定レンジは集計の「Hero の想定レンジ」タブで開く（06 章 §4.9）
          reload();
          navigate(`${routePath({ name: 'result', id })}${host ? '?view=host' : ''}`, { replace: true });
        }}
      />
    );
  }
  return <ResultScreen detail={state.detail} />;
}

/** 表示すべき画面。 */
export function targetView(view: SpotView, viewer: Viewer): SpotView {
  if (view === 'spot') return viewer === 'unanswered' ? 'answer' : 'result';
  if (view === 'answer') return viewer === 'answered' ? 'result' : 'answer';
  return viewer === 'unanswered' ? 'answer' : 'result';
}
