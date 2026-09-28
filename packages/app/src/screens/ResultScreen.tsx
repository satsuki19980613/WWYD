import { aggregateBar, labelOfCards, paintBar, type BarRatios, type Card } from '@wwyd/core';
import { useMemo, useState } from 'react';
import { ComboBar } from '../answer/ComboBar.tsx';
import type { PostDetail } from '../answer/postDetail.ts';
import { HandLog, PokerTable, ReplayControls, useReplay, type ReplayControl } from '../answer/Replay.tsx';
import { seatViews } from '../answer/replayModel.ts';
import { ResultGrid } from '../answer/ResultGrid.tsx';
import {
  actionText,
  actualAction,
  actualCell,
  breakdown,
  cellViews,
  emptyLabel,
  initialCell,
  initialView,
  keyNames,
  resultFrames,
  resultTabs,
  villainHand,
  type ResultFrame,
  type ResultView,
} from '../answer/resultModel.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { Link } from '../components/Link.tsx';
import { PlayingCard } from '../components/PlayingCard.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { useToast } from '../components/Toast.tsx';
import { deletePost } from '../list/useSpotList.ts';
import { navigate, routePath, useLocation } from '../router.ts';
import { useIsMobile } from '../useMediaQuery.ts';
import { metaLine } from './AnswerScreen.tsx';

type MobileTab = 'agg' | 'hand';
const MOBILE_TABS: readonly { value: MobileTab; label: string }[] = [
  { value: 'agg', label: '集計' },
  { value: 'hand', label: 'ハンドヒストリー' },
];

/**
 * 集計画面（06 章 §5。仕様書 §5.4）。`detail.viewer` は `answered` か `author`（未回答は SpotScreen が回答画面へ移す）。
 * PC は左にハンドヒストリーの再生、右に集計。スマホは上部固定のタブ「集計 / ハンドヒストリー」。
 */
export function ResultScreen(props: { detail: PostDetail }): JSX.Element {
  const { detail: d } = props;
  const { post } = d;
  const mobile = useIsMobile();
  const { search } = useLocation();

  const [view, setView] = useState<ResultView>(() => initialView(search));
  const [selected, setSelected] = useState(() => initialCell(d));
  const [tab, setTab] = useState<MobileTab>('agg');

  const tabs = resultTabs(d);
  const names = keyNames(d);
  const views = useMemo(() => cellViews(d, view), [d, view]);
  const empty = emptyLabel(d, view);
  const ratios: BarRatios | null = useMemo(() => {
    if (view === 'all') return d.aggregate ? aggregateBar(d.aggregate.cells, d.aggregate.n) : null;
    const saved = view === 'mine' ? d.myAnswer : d.hostAnswer;
    return saved ? paintBar(saved.paint) : null;
  }, [d, view]);

  const head = (
    <div className="ans-head">
      <p className="ans-meta num">{metaLine(d)}</p>
      <h1 className="ans-title">{post.title}</h1>
    </div>
  );

  const aggregate = (
    <div className="res-agg">
      <Tabs label="集計の表示" items={tabs} value={view} onChange={setView} />
      {empty ? (
        <div className="list-empty">
          <p className="list-empty-label">{empty}</p>
          {view === 'host' && post.isMine && (
            <Link to={routePath({ name: 'answer', id: post.id })} className="btn auto">
              想定レンジを入力
            </Link>
          )}
        </div>
      ) : (
        <>
          {ratios && <ComboBar keys={post.keys} names={names} ratios={ratios} />}
          <ResultGrid views={views} selected={selected} actual={actualCell(d)} onSelect={setSelected} />
          <BreakdownPanel detail={d} view={view} idx={selected} />
        </>
      )}
      <ActualBox detail={d} />
      <Operations detail={d} />
    </div>
  );
  // リプレイの位置はスマホのタブを切り替えても残す
  const frames = useMemo(() => resultFrames(d), [d]);
  const replay = useReplay(d.hand.actions.length, { atEnd: true });
  const hand = <ResultReplay detail={d} frames={frames} c={replay} />;

  if (!mobile) {
    return (
      <section className="screen ans res">
        {head}
        <div className="ans-grid">
          <div className="ans-col">
            <h2 className="sec-h">ハンドヒストリー</h2>
            {hand}
          </div>
          <div className="ans-col">
            <h2 className="sec-h">集計</h2>
            {aggregate}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen ans res sp">
      {head}
      <div className="ans-top">
        <Tabs label="表示" items={MOBILE_TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'agg' ? aggregate : hand}
    </section>
  );
}

/** 選んだマスの内訳（06 章 §5.2）。 */
function BreakdownPanel(props: { detail: PostDetail; view: ResultView; idx: number }): JSX.Element {
  const b = breakdown(props.detail, props.view, props.idx);
  return (
    <div className="res-detail" aria-live="polite">
      <div className="res-detail-head">
        <b className="res-detail-lbl num">{b.label}</b>
        {b.kind === 'all' ? (
          <span className="res-detail-sub num">
            レンジ内 {b.n} / {b.total}人
          </span>
        ) : (
          <span className="res-detail-sub num">{b.text}</span>
        )}
      </div>
      {b.kind === 'all' && b.rows.length > 0 && (
        <ul className="res-rows">
          {b.rows.map((r) => (
            <li key={r.key}>
              <i className={`cdot ${r.key}`} aria-hidden="true" />
              {r.name}{' '}
              <b className="num">
                {r.pct}%（{r.count}人）
              </b>
            </li>
          ))}
        </ul>
      )}
      {b.kind === 'all' && b.mine !== null && <p className="res-mine num">自分：{b.mine}</p>}
    </div>
  );
}

/** Villain の実際のアクションとハンド（06 章 §5.3）。 */
function ActualBox(props: { detail: PostDetail }): JSX.Element {
  const { detail: d } = props;
  const a = actualAction(d);
  const h = villainHand(d);
  return (
    <div className="bracket-hero res-actual">
      <span className="brk tl" aria-hidden="true" />
      <span className="brk br" aria-hidden="true" />
      <div className="res-actual-act">
        <span className="res-actual-lbl">Villain（{d.post.villain}）実際のアクション</span>
        <b className="res-actual-name">{a ? actionText(a) : '—'}</b>
      </div>
      <div className="res-actual-hand">
        {Array.isArray(h) && h.length === 2 ? (
          <>
            {h.map((c) => (
              <PlayingCard key={c} card={c} size="sm" />
            ))}
            <span className="num">{labelOfCards(h[0] as Card, h[1] as Card)}</span>
          </>
        ) : (
          <span className="res-actual-unknown">{h === 'muck' ? 'マック' : 'ハンド不明'}</span>
        )}
      </div>
    </div>
  );
}

/** 操作（06 章 §5.5）: 自分の投稿は「想定レンジを編集」「削除」、他人の投稿は管理者だけ「削除」。 */
function Operations(props: { detail: PostDetail }): JSX.Element | null {
  const { post } = props.detail;
  const toast = useToast();
  const [deleting, setDeleting] = useState<{ busy: boolean } | null>(null);
  if (!post.isMine && !post.canDelete) return null;

  const confirmDelete = (): void => {
    setDeleting({ busy: true });
    deletePost(post.id).then(
      () => navigate('/', { replace: true }),
      () => {
        setDeleting(null);
        toast('削除できませんでした');
      },
    );
  };

  return (
    <div className="res-ops">
      {post.isMine && (
        <Link to={routePath({ name: 'answer', id: post.id })} className="btn ghost auto">
          想定レンジを編集
        </Link>
      )}
      {post.canDelete && (
        <button type="button" className="btn red auto" onClick={() => setDeleting({ busy: false })}>
          削除
        </button>
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
    </div>
  );
}

/** ハンドヒストリーの再生（06 章 §5.4）: 最初から最後まで。初期表示は最後の状態。 */
function ResultReplay(props: { detail: PostDetail; frames: readonly ResultFrame[]; c: ReplayControl }): JSX.Element {
  const { detail: d, frames, c } = props;
  const { hand, post } = d;
  const f = frames[c.step] ?? frames[frames.length - 1];
  if (!f) return <></>;
  return (
    <div className="replay">
      <PokerTable
        seats={seatViews(f.state, { hero: post.hero, villain: post.villain, actor: f.actor })}
        pot={f.state.pot}
        board={f.board}
        holes={f.holes}
        villainLabel="Villain"
        note={f.note}
      />
      <ReplayControls c={c} />
      <HandLog
        setup={hand.setup}
        actions={hand.actions.slice(0, c.step)}
        board={f.board}
        spotIndex={hand.spotIndex}
        highlightLast={c.step < c.max}
        actual={hand.stopIndex}
      />
    </div>
  );
}
