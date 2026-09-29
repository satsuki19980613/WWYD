import { aggregateBar, labelOfCards, paintBar, type AnswerKey, type Card } from '@wwyd/core';
import { useMemo, useState } from 'react';
import { ComboBar } from '../answer/ComboBar.tsx';
import type { PostDetail } from '../answer/postDetail.ts';
import { HandLog, HistoryButton, PokerTable, ReplayControls, useReplay, useReplayKeys, type ReplayControl } from '../answer/Replay.tsx';
import { seatViews } from '../answer/replayModel.ts';
import { ResultGrid } from '../answer/ResultGrid.tsx';
import {
  actionText,
  actualAction,
  actualCell,
  breakdown,
  cellShares,
  cellViews,
  diffHeat,
  emptyLabel,
  initialCell,
  keyNames,
  resultFrames,
  resultTabs,
  heroHand,
  type ResultFrame,
  type ResultView,
  type Shares,
} from '../answer/resultModel.ts';
import { Link } from '../components/Link.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { FitStage } from '../components/FitStage.tsx';
import { PlayingCard } from '../components/PlayingCard.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { useToast } from '../components/Toast.tsx';
import { deletePost, useNextSpot } from '../list/useSpotList.ts';
import { navigate } from '../router.ts';
import { useIsMobile } from '../useMediaQuery.ts';
import { metaLine } from './AnswerScreen.tsx';

type MobileTab = 'agg' | 'hand';
const MOBILE_TABS: readonly { value: MobileTab; label: string }[] = [
  { value: 'agg', label: '集計' },
  { value: 'hand', label: 'Hand History' },
];

/**
 * 集計画面（06 章 §5。仕様書 §5.4）。回答済みの人が開く（投稿者も回答してから。未回答は SpotScreen が回答画面へ移す）。
 * PC は左にハンドヒストリーの再生、右に集計。スマホは上部固定のタブ「集計 / ハンドヒストリー」。
 * 集計は答え合わせ（Hero の実際のアクションとハンド）を先頭に置き、全体と自分のレンジを並べて比べる（14 章）。
 * 最後に「次のスポット」（未回答の新着）へ進める。
 */
export function ResultScreen(props: { detail: PostDetail }): JSX.Element {
  const { detail: d } = props;
  const { post } = d;
  const mobile = useIsMobile();

  const [view, setView] = useState<ResultView>('all');
  const [selected, setSelected] = useState(() => initialCell(d));
  const [hover, setHover] = useState<number | null>(null);
  const [tab, setTab] = useState<MobileTab>('agg');

  const tabs = resultTabs(d);
  const names = keyNames(d);
  const views = useMemo(() => cellViews(d, view), [d, view]);
  const empty = emptyLabel(d, view);
  const allRatios = useMemo(() => (d.aggregate && d.aggregate.n > 0 ? aggregateBar(d.aggregate.cells, d.aggregate.n) : null), [d]);
  const myRatios = useMemo(() => (d.myAnswer ? paintBar(d.myAnswer.paint) : null), [d]);
  const heat = useMemo(() => (view === 'diff' ? diffHeat(d) : undefined), [d, view]);
  const next = useNextSpot(post.id);

  const head = (
    <div className="ans-head">
      <p className="ans-meta num">{metaLine(d)}</p>
      <h1 className="ans-title">{post.title}</h1>
    </div>
  );

  const nextLink = typeof next === 'string' && (
    <Link to={`/s/${next}`} className="btn">
      次の Spot
    </Link>
  );
  // 集計の表示の切り替え。スマホは上部固定のパネルに置く（表や内訳までスクロールしても切り替えられるように）
  const viewTabs = <Tabs label="集計の表示" items={tabs} value={view} onChange={setView} />;
  const aggregate = (
    <div className="res-agg">
      <ActualBox detail={d} />
      {!mobile && viewTabs}
      {empty ? (
        <div className="list-empty">
          <p className="list-empty-label">{empty}</p>
        </div>
      ) : (
        <>
          <div className="cbars">
            {view !== 'mine' && allRatios && <ComboBar keys={post.keys} names={names} ratios={allRatios} label="全体" />}
            {myRatios && <ComboBar keys={post.keys} names={names} ratios={myRatios} label="自分" />}
          </div>
          <ResultGrid views={views} selected={selected} actual={actualCell(d)} onSelect={setSelected} heat={heat} />
          <BreakdownPanel detail={d} view={view} idx={selected} />
        </>
      )}
      <Operations detail={d} />
      {!mobile && nextLink}
    </div>
  );
  // リプレイの位置はスマホのタブを切り替えても残す
  const frames = useMemo(() => resultFrames(d), [d]);
  const replay = useReplay(d.hand.actions.length, { atEnd: true });
  useReplayKeys(replay, !mobile);
  const hand = <ResultReplay detail={d} frames={frames} c={replay} logInModal={mobile} />;

  if (!mobile) {
    // PC（17 章）: 左にハンドヒストリーの再生、中央に集計の表と表示の切り替え、右に答え合わせ・バー・マスの内訳・操作。
    // マスにマウスを乗せると内訳がそのマスになる（押すと固定。GTO Wizard の Hand matrix・PioViewer に倣う）
    const shown = hover ?? selected;
    return (
      <FitStage className="screen ans res pc">
        <div className="ans-replay">
          {head}
          <h2 className="sr-only">Hand History</h2>
          {hand}
        </div>
        <div className="ans-range res-agg">
          <h2 className="sr-only">集計</h2>
          {viewTabs}
          {empty ? (
            <div className="list-empty">
              <p className="list-empty-label">{empty}</p>
            </div>
          ) : (
            <ResultGrid
              views={views}
              selected={selected}
              actual={actualCell(d)}
              // 押す・キーで選んだマスを出す（マウスを乗せたままでも、選び直したマスを優先する）
              onSelect={(i) => {
                setSelected(i);
                setHover(null);
              }}
              onHover={setHover}
              heat={heat}
            />
          )}
        </div>
        <div className="ans-tools res-side">
          <ActualBox detail={d} />
          {!empty && (
            <>
              <div className="cbars">
                {view !== 'mine' && allRatios && <ComboBar keys={post.keys} names={names} ratios={allRatios} label="全体" />}
                {myRatios && <ComboBar keys={post.keys} names={names} ratios={myRatios} label="自分" />}
              </div>
              <BreakdownPanel detail={d} view={view} idx={shown} />
            </>
          )}
          <div className="ans-send">
            <Operations detail={d} />
            {nextLink}
          </div>
        </div>
      </FitStage>
    );
  }

  return (
    <section className={`screen ans res sp tab-${tab}${nextLink ? ' has-next' : ''}`}>
      {head}
      <div className="ans-top">
        <Tabs label="表示" items={MOBILE_TABS} value={tab} onChange={setTab} />
        {tab === 'agg' && <div className="res-agg">{viewTabs}</div>}
      </div>
      {tab === 'agg' ? aggregate : hand}
      {nextLink && <div className="ans-bottom">{nextLink}</div>}
    </section>
  );
}

/** 選んだマスの内訳（06 章 §5.2）。 */
function BreakdownPanel(props: { detail: PostDetail; view: ResultView; idx: number }): JSX.Element {
  const b = breakdown(props.detail, props.view, props.idx);
  const keys = props.detail.post.keys;
  const shares = cellShares(props.detail, props.idx);
  return (
    <div className="res-detail" aria-live="polite">
      <div className="res-detail-head">
        <b className="res-detail-lbl num">{b.label}</b>
        {b.kind === 'all' ? (
          <span className="res-detail-sub num">
            Range 内 {b.n} / {b.total}人
          </span>
        ) : (
          <span className="res-detail-sub num">{b.text}</span>
        )}
        {b.kind === 'all' && b.diff !== undefined && <span className="res-detail-diff num">差 {b.diff}%</span>}
      </div>
      {b.kind === 'all' && (
        <div className="res-bars" aria-hidden="true">
          {shares.all && <MiniBar label="全体" keys={keys} shares={shares.all} />}
          {shares.mine && <MiniBar label="自分" keys={keys} shares={shares.mine} />}
        </div>
      )}
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
      {b.kind === 'all' && <p className="res-mine num">自分：{b.mine}</p>}
    </div>
  );
}

/** マスの割合の細いバー（全体 / 自分。空きはレンジに入れなかった割合） */
function MiniBar(props: { label: string; keys: readonly AnswerKey[]; shares: Shares }): JSX.Element {
  return (
    <div className="res-bar">
      <span className="res-bar-lbl">{props.label}</span>
      <span className="cbar-track">
        {props.keys.map((k) => (
          <i key={k} className={`cseg ${k}`} style={{ width: `${props.shares[k] * 100}%` }} />
        ))}
      </span>
    </div>
  );
}

/** Hero の実際のアクションとハンド（答え合わせ。06 章 §5.3） */
function ActualBox(props: { detail: PostDetail }): JSX.Element {
  const { detail: d } = props;
  const a = actualAction(d);
  const h = heroHand(d);
  return (
    <div className="bracket-hero res-actual">
      <span className="brk tl" aria-hidden="true" />
      <span className="brk br" aria-hidden="true" />
      <div className="res-actual-act">
        <span className="res-actual-lbl">Hero（{d.post.hero}）実際の Action</span>
        <b className="res-actual-name">{a ? actionText(a) : '—'}</b>
      </div>
      <div className="res-actual-hand">
        {h && h.length === 2 ? (
          <>
            {h.map((c) => (
              <PlayingCard key={c} card={c} size="sm" />
            ))}
            <span className="num">{labelOfCards(h[0] as Card, h[1] as Card)}</span>
          </>
        ) : (
          <span className="res-actual-unknown">Hand 不明</span>
        )}
      </div>
    </div>
  );
}

/** 操作（06 章 §5.5）: 自分の投稿は「削除」、他人の投稿は管理者だけ「削除」。 */
function Operations(props: { detail: PostDetail }): JSX.Element | null {
  const { post } = props.detail;
  const toast = useToast();
  const [deleting, setDeleting] = useState<{ busy: boolean } | null>(null);
  if (!post.canDelete) return null;

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

/** ハンドヒストリーの再生（06 章 §5.4）: 最初から最後まで。初期表示は最後の状態。スマホのログはモーダル（14 章） */
function ResultReplay(props: { detail: PostDetail; frames: readonly ResultFrame[]; c: ReplayControl; logInModal: boolean }): JSX.Element {
  const { detail: d, frames, c } = props;
  const { hand, post } = d;
  const f = frames[c.step] ?? frames[frames.length - 1];
  if (!f) return <></>;
  const log = (
    <HandLog
      setup={hand.setup}
      actions={hand.actions.slice(0, c.step)}
      board={f.board}
      spotIndex={hand.spotIndex}
      highlightLast={c.step < c.max}
      actual={hand.spotIndex}
      onPick={props.logInModal ? undefined : (i) => c.goto(i + 1)}
      strip={!props.logInModal}
    />
  );
  return (
    <div className="replay">
      {props.logInModal && <HistoryButton disabled={c.step === 0}>{log}</HistoryButton>}
      <PokerTable
        seats={seatViews(f.state, { hero: post.hero, actor: f.actor })}
        pot={f.state.pot}
        board={f.board}
        holes={f.holes}
        note={f.note}
        spot={c.step === hand.spotIndex}
      />
      <ReplayControls c={c} spot={hand.spotIndex} />
      {!props.logInModal && log}
    </div>
  );
}
