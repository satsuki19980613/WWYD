import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChipGroup } from '../components/ChipGroup.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { ChevronIcon, TrashIcon } from '../components/Icons.tsx';
import { Link } from '../components/Link.tsx';
import { cardText, PlayingCard } from '../components/PlayingCard.tsx';
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

  const more = list.status === 'ready' && list.rows.length > 0 && (
    <>
      {list.hasMore && list.more === 'idle' && <MoreSentinel onVisible={list.loadMore} />}
      {list.more === 'loading' && (
        <div className="list-more" role="status" aria-label="読み込み中">
          <span className="spinner" />
        </div>
      )}
      {list.more === 'error' && <LoadError onRetry={list.retry} />}
    </>
  );
  const deleteDialog = deleting && (
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
  );

  if (!mobile) {
    // PC: 左に絞り込みの列、右に 1 行 1 投稿の表（17 章。GTO Wizard の Analyzer・LeetCode の問題一覧に倣う）
    return (
      <section className="screen list-screen pc">
        <aside className="list-rail" aria-label="絞り込み">
          <ChipGroup label="範囲" variant="rail" items={TAB_ITEMS} value={query.tab} onChange={(tab) => setQuery({ tab })} />
          <ChipGroup label="Street" variant="rail" items={STREET_ITEMS} value={query.street} onChange={(street) => setQuery({ street })} />
          <ChipGroup label="並び替え" variant="rail" items={SORT_ITEMS} value={query.sort} onChange={(sort) => setQuery({ sort })} />
        </aside>
        <div className="list-main">
          {list.status !== 'error' && !(list.status === 'ready' && list.rows.length === 0) && (
            <SpotTable
              rows={list.status === 'ready' ? list.rows : []}
              loading={list.status === 'loading'}
              now={now}
              sort={query.sort}
              onSort={(sort) => setQuery({ sort })}
              onDelete={(id) => setDeleting({ id, busy: false })}
            />
          )}
          {list.status === 'error' && <LoadError onRetry={list.retry} />}
          {list.status === 'ready' && list.rows.length === 0 && <Empty query={query} />}
          {more}
        </div>
        {deleteDialog}
      </section>
    );
  }

  return (
    <section className="screen list-screen sp">
      {/* 画面名はヘッダーに出す。タブと絞り込みはスクロールしても上に固定する */}
      <div className="list-top">
        <div className="list-head">
          <Tabs label="投稿の範囲" items={TAB_ITEMS} value={query.tab} onChange={(tab) => setQuery({ tab })} />
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
        <div className="spot-grid">
          {list.rows.map((row) => (
            <SpotCard key={row.id} row={row} now={now} onDelete={() => setDeleting({ id: row.id, busy: false })} />
          ))}
        </div>
      )}
      {more}

      <div className="list-fab">
        <Link to="/new" className="btn">
          ＋ Post
        </Link>
      </div>

      {deleteDialog}
    </section>
  );
}

/**
 * PC の一覧の表（17 章）。1 行 1 投稿で、行全体を押せる（タイトルのリンクを行いっぱいに広げる）。
 * 見出しの「回答」「投稿」を押すと並び替える。↑↓（j / k）で行を移り、Enter で開く。
 */
function SpotTable(props: {
  rows: readonly PostRow[];
  loading: boolean;
  now: number;
  sort: ListQuery['sort'];
  onSort: (sort: ListQuery['sort']) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const ref = useRef<HTMLOListElement>(null);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLOListElement>): void => {
    const down = e.key === 'ArrowDown' || e.key === 'j';
    const up = e.key === 'ArrowUp' || e.key === 'k';
    if (!down && !up) return;
    const links = [...(ref.current?.querySelectorAll<HTMLAnchorElement>('.spot-link') ?? [])];
    const i = links.findIndex((l) => l === document.activeElement);
    const next = links[i < 0 ? 0 : Math.min(links.length - 1, Math.max(0, i + (down ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    next.focus();
  };
  const sortHead = (value: ListQuery['sort'], label: string): JSX.Element => (
    <button type="button" className="st-sort" aria-pressed={props.sort === value} onClick={() => props.onSort(value)}>
      {label}
    </button>
  );
  return (
    <div className="spot-table">
      <div className="st-row st-head">
        <span>Board</span>
        <span>Title</span>
        <span>Hero</span>
        <span className="st-num">{sortHead('many', '回答')}</span>
        <span className="st-num">{sortHead('new', '投稿')}</span>
        <span />
        <span />
      </div>
      {props.loading && (
        <div aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="st-row skeleton" aria-hidden="true">
              <span className="sk sk-s" />
              <span className="sk sk-l" />
            </div>
          ))}
        </div>
      )}
      {props.rows.length > 0 && (
        <ol ref={ref} className="st-body" onKeyDown={onKeyDown}>
          {props.rows.map((row) => (
            <SpotRow key={row.id} row={row} now={props.now} onDelete={() => props.onDelete(row.id)} />
          ))}
        </ol>
      )}
    </div>
  );
}

/** Street と、スポットの Street までの Board（17 章。サーバーが Board を返さないときは Street だけ） */
function SpotBoard(props: { row: PostRow; size: 'sm' | 'big' }): JSX.Element {
  const board = props.row.board ?? [];
  return (
    <span className={`spot-board ${props.size}`}>
      <span className="street-badge">{STREET_LABEL[props.row.street]}</span>
      {board.length > 0 && (
        <span className="spot-board-cards" aria-label={`Board ${board.map(cardText).join(' ')}`}>
          {board.map((c) => (
            <PlayingCard key={c} card={c} size={props.size} />
          ))}
        </span>
      )}
    </span>
  );
}

/** 「Cash · 100bb · 6 Players」（人数はサーバーが返すときだけ） */
function metaText(row: PostRow): string {
  return row.players ? `${formatLabel(row)} · ${row.players} Players` : formatLabel(row);
}

/** Villain・MTT の情報が登録された投稿の印（18 章 §6） */
function InfoBadges(props: { row: PostRow }): JSX.Element | null {
  if (!props.row.has_reads && !props.row.has_mtt) return null;
  return (
    <span className="spot-badges">
      {props.row.has_reads && <span className="spot-badge">Reads</span>}
      {props.row.has_mtt && <span className="spot-badge">MTT</span>}
    </span>
  );
}

function SpotRow(props: { row: PostRow; now: number; onDelete: () => void }): JSX.Element {
  const { row } = props;
  const status = cardStatus(row);
  const action = cardAction(row);
  return (
    <li className={`st-row spot-row${action.primary ? '' : ' done'}`}>
      <SpotBoard row={row} size="big" />
      <span className="st-title">
        <Link to={action.to} className="spot-link">
          {row.title}
        </Link>
        <span className="st-meta num">
          {metaText(row)}
          <InfoBadges row={row} />
        </span>
        {status === 'mine' && <span className="spot-tag mine">自分の投稿</span>}
        {status === 'answered' && <span className="spot-tag answered">回答済み</span>}
      </span>
      <b className="st-pos" style={{ color: POS_VAR[row.hero] }}>
        {row.hero}
      </b>
      <span className="st-num num st-count">{row.answer_count}</span>
      <span className="st-num st-ago">{formatAgo(row.created_at, props.now)}</span>
      <span className={`spot-go${action.primary ? ' primary' : ''}`} aria-hidden="true">
        {action.label}
        <ChevronIcon />
      </span>
      {/* 削除は専用の列（無い行も同じ幅を空けて、ほかの列を揃える。2026-09-29 さつき） */}
      <span className="st-del">
        {row.can_delete && (
          <button type="button" className="spot-del" aria-label="削除" onClick={props.onDelete}>
            <TrashIcon />
          </button>
        )}
      </span>
    </li>
  );
}

function SpotCard(props: { row: PostRow; now: number; onDelete: () => void }): JSX.Element {
  const { row } = props;
  const status = cardStatus(row);
  const action = cardAction(row);
  return (
    // 3 段（18 章 §6。2026-09-30 さつき）: タイトル / スポットの状況（Board・Hero・条件・印）/ 回答数・経過時間と CTA。
    // 段は区切り線ではなく余白で分ける。カード全体を押せる（タイトルのリンクをカードいっぱいに広げる。14 章）。削除のボタンはその上に重ねる
    <article className={`spot-card${action.primary ? '' : ' done'}`}>
      <div className="spot-t1">
        <h2 className="spot-title">
          <Link to={action.to} className="spot-link">
            {row.title}
          </Link>
        </h2>
        {/* 削除はカードの右上に固定（2026-09-29 さつき） */}
        {row.can_delete && (
          <button type="button" className="spot-del" aria-label="削除" onClick={props.onDelete}>
            <TrashIcon />
          </button>
        )}
      </div>
      <div className="spot-t2">
        <SpotBoard row={row} size="sm" />
        <span className="spot-cond num" title={`Hero ${row.hero} · ${metaText(row)}`}>
          <b className="pos" style={{ color: POS_VAR[row.hero] }}>
            {row.hero}
          </b>{' '}
          · {metaText(row)}
        </span>
        <InfoBadges row={row} />
      </div>
      <div className="spot-foot">
        <span className="spot-meta">
          <span className="num spot-count">{row.answer_count}</span> 人が回答 · {formatAgo(row.created_at, props.now)}
          {status === 'mine' && <> · <span className="spot-tag mine">自分の投稿</span></>}
          {status === 'answered' && <> · <span className="spot-tag answered">回答済み</span></>}
        </span>
        <span className={`spot-go${action.primary ? ' primary' : ''}`} aria-hidden="true">
          {action.label}
          <ChevronIcon />
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
          Post
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
