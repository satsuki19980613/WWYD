import { useEffect, useRef, useState } from 'react';
import { ChipGroup } from '../components/ChipGroup.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { ChevronIcon } from '../components/Icons.tsx';
import { Link } from '../components/Link.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { Tabs } from '../components/Tabs.tsx';
import { useToast } from '../components/Toast.tsx';
import {
  cardAction,
  cardStatus,
  emptyState,
  formatAgo,
  formatLabel,
  listSearch,
  parseListQuery,
  SORT_ITEMS,
  STREET_ITEMS,
  STREET_LABEL,
  TAB_ITEMS,
  type ListQuery,
  type PostRow,
} from '../list/spotList.ts';
import { deletePost, useSpotList } from '../list/useSpotList.ts';
import { navigate, useLocation } from '../router.ts';
import { useIsMobile } from '../useMediaQuery.ts';

/** スポット一覧（06 章 §2。仕様書 §5.1）。状態は URL のクエリに持つ。 */
export function ListScreen(): JSX.Element {
  const { search } = useLocation();
  const query = parseListQuery(search);
  const mobile = useIsMobile();
  const list = useSpotList(query);
  const toast = useToast();
  const [deleting, setDeleting] = useState<{ id: string; busy: boolean } | null>(null);

  const setQuery = (patch: Partial<ListQuery>): void => {
    // 開発用の ?devstate= などは残さない（一覧の状態だけを URL に持つ）
    navigate(`/${listSearch({ ...query, ...patch })}`, { replace: true });
  };

  const confirmDelete = (): void => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting({ id, busy: true });
    deletePost(id).then(
      () => {
        list.remove(id);
        setDeleting(null);
      },
      () => {
        setDeleting(null);
        toast('削除できませんでした');
      },
    );
  };

  const now = Date.now();

  return (
    <section className={`screen list-screen ${mobile ? 'sp' : ''}`}>
      {/* 画面名はヘッダーに出す。PC は投稿ボタンをタブの右に置く。タブと絞り込みはスクロールしても上に固定する */}
      <div className="list-top">
        <div className="list-head">
          <Tabs label="投稿の範囲" items={TAB_ITEMS} value={query.tab} onChange={(tab) => setQuery({ tab })} />
          {!mobile && (
            <Link to="/new" className="btn auto">
              ＋ Spot を投稿
            </Link>
          )}
        </div>

        <div className="list-filters">
          <ChipGroup
            label="Street"
            variant="segment"
            items={STREET_ITEMS}
            value={query.street}
            onChange={(street) => setQuery({ street })}
          />
          <ChipGroup label="並び替え" variant="toggle" items={SORT_ITEMS} value={query.sort} onChange={(sort) => setQuery({ sort })} />
        </div>
      </div>

      {list.status === 'loading' && (
        <div className="spot-grid" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="spot-card skeleton" aria-hidden="true">
              <span className="sk sk-s" />
              <span className="sk sk-l" />
              <span className="sk sk-m" />
            </div>
          ))}
        </div>
      )}

      {list.status === 'error' && <LoadError onRetry={list.retry} />}

      {list.status === 'ready' && list.rows.length === 0 && <Empty query={query} />}

      {list.status === 'ready' && list.rows.length > 0 && (
        <>
          <div className="spot-grid">
            {list.rows.map((row) => (
              <SpotCard key={row.id} row={row} now={now} onDelete={() => setDeleting({ id: row.id, busy: false })} />
            ))}
          </div>
          {list.hasMore && list.more === 'idle' && <MoreSentinel onVisible={list.loadMore} />}
          {list.more === 'loading' && (
            <div className="list-more" role="status" aria-label="読み込み中">
              <span className="spinner" />
            </div>
          )}
          {list.more === 'error' && <LoadError onRetry={list.retry} />}
        </>
      )}

      {mobile && (
        <div className="list-fab">
          <Link to="/new" className="btn">
            ＋ Spot を投稿
          </Link>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title="この投稿を削除しますか"
          body="集まった回答もすべて削除されます。元には戻せません。"
          confirmLabel="削除する"
          busyLabel="削除中…"
          destructive
          busy={deleting.busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

function SpotCard(props: { row: PostRow; now: number; onDelete: () => void }): JSX.Element {
  const { row } = props;
  const status = cardStatus(row);
  const action = cardAction(row);
  return (
    // カード全体を押せる（タイトルのリンクをカードいっぱいに広げる。14 章）。削除のボタンはその上に重ねる
    <article className={`spot-card${action.primary ? '' : ' done'}`}>
      <div className="spot-top">
        <span className="street-badge">{STREET_LABEL[row.street]}</span>
        <span className="spot-fmt num">{formatLabel(row)}</span>
        {status === 'mine' && <span className="spot-tag mine">自分の投稿</span>}
        {status === 'answered' && <span className="spot-tag answered">回答済み</span>}
      </div>
      <h2 className="spot-title">
        <Link to={action.to} className="spot-link">
          {row.title}
        </Link>
      </h2>
      <p className="spot-seats">
        Hero{' '}
        <b className="pos" style={{ color: POS_VAR[row.hero] }}>
          {row.hero}
        </b>{' '}
        vs Villain{' '}
        <b className="pos" style={{ color: POS_VAR[row.villain] }}>
          {row.villain}
        </b>
      </p>
      <div className="spot-foot">
        <span className="spot-meta">
          <span className="num spot-count">{row.answer_count}</span> 人が回答 · {formatAgo(row.created_at, props.now)}
        </span>
        <span className="spot-ops">
          {row.can_delete && (
            <button type="button" className="btn red auto sm" onClick={props.onDelete}>
              削除
            </button>
          )}
          <span className={`spot-go${action.primary ? ' primary' : ''}`} aria-hidden="true">
            {action.label}
            <ChevronIcon />
          </span>
        </span>
      </div>
    </article>
  );
}

function Empty(props: { query: ListQuery }): JSX.Element {
  const e = emptyState(props.query);
  return (
    <div className="list-empty">
      <p className="list-empty-label">{e.label}</p>
      {e.showPost && (
        <Link to="/new" className="btn auto">
          Spot を投稿
        </Link>
      )}
    </div>
  );
}

function LoadError(props: { onRetry: () => void }): JSX.Element {
  return (
    <div className="list-empty" role="alert">
      <p className="form-err">読み込みに失敗しました</p>
      <button type="button" className="btn ghost auto" onClick={props.onRetry}>
        再試行
      </button>
    </div>
  );
}

/** 最後のカードの下が見えたら次のページを読む（06 章 §2.3）。 */
function MoreSentinel(props: { onVisible: () => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(props.onVisible);
  cb.current = props.onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      { rootMargin: '0px 0px 200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="list-sentinel" aria-hidden="true" />;
}
