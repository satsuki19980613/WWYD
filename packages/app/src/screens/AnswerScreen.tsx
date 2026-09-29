import {
  BOARD_COUNT,
  emptyPaint,
  encodePaint,
  formatBb,
  paintBar,
  toHex,
  totalPot,
  type AnswerKey,
  type Mix,
  type Paint,
  type State,
} from '@wwyd/core';
import { PlayingCard } from '../components/PlayingCard.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { ACTION_NAME } from '../post/draft.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { useToast } from '../components/Toast.tsx';
import { insertAnswer } from '../answer/answerApi.ts';
import { initialSize, parseSizeText, sizeForSubmit, sizeSummary, submitErrors, type SizeSpot } from '../answer/answerForm.ts';
import { initialBrush } from '../answer/brush.ts';
import { BrushPanel, type KeyNames } from '../answer/BrushPanel.tsx';
import { ComboBar } from '../answer/ComboBar.tsx';
import {
  applyCell,
  beginStroke,
  cancelStroke,
  clear,
  endStroke,
  isEmpty,
  newEditor,
  redo,
  strokeMode,
  undo,
  type Editor,
  type StrokeMode,
  type Tool,
} from '../answer/paintEditor.ts';
import { answerErrorMessage, type PostDetail } from '../answer/postDetail.ts';
import { RangeGrid } from '../answer/RangeGrid.tsx';
import { HandLog, HistoryButton, PokerTable, ReplayControls, useReplay, type ReplayControl } from '../answer/Replay.tsx';
import { actorAt, answerFrames, seatViews } from '../answer/replayModel.ts';
import { SizeControl } from '../answer/SizeControl.tsx';
import { STREET_LABEL } from '../list/spotList.ts';
import { ErrorList } from '../post/SpotSection.tsx';
import { useIsMobile } from '../useMediaQuery.ts';

type MobileTab = 'replay' | 'range';
const MOBILE_TABS: readonly { value: MobileTab; label: string }[] = [
  { value: 'replay', label: 'Replay' },
  { value: 'range', label: 'Range' },
];

/** 「ターン · キャッシュ · 100bb · SB 0.5 / BB 1」（アンティは 0 のとき出さない） */
export function metaLine(d: PostDetail): string {
  const { setup } = d.hand;
  const parts = [
    STREET_LABEL[d.post.street],
    d.post.fmt === 'mtt' ? 'MTT' : 'Cash',
    `${formatBb(d.post.effectiveStack)}bb`,
    `SB ${formatBb(setup.sb)} / BB ${formatBb(setup.bb)}`,
  ];
  if (setup.ante > 0) parts.push(`Ante ${formatBb(setup.ante)}`);
  return parts.join(' · ');
}

const paintKey = (p: Paint): string => toHex(encodePaint(p));

/**
 * 回答（レンジ入力）画面（06 章 §4。仕様書 §5.3）。未回答の人が開く（投稿者も自分の投稿に回答する。2026-09-28）。
 * `onDone` は送信が済んだとき（または既に回答済みだったとき）。
 */
export function AnswerScreen(props: { detail: PostDetail; onDone: () => void }): JSX.Element {
  const { detail: d } = props;
  const { hand, post } = d;
  const mobile = useIsMobile();
  const toast = useToast();

  // ---- リプレイ ----
  const frames = useMemo(
    () => answerFrames(hand.setup, hand.actions, hand.stopIndex, post.street),
    [hand.setup, hand.actions, hand.stopIndex, post.street],
  );
  const replay = useReplay(hand.stopIndex);
  const stop = frames[hand.stopIndex] as (typeof frames)[number];

  // ---- アクションの名前とサイズ ----
  const facing = post.keys.includes('call');
  const s1Name = post.s1Label === 'bet' || (post.s1Label === null && stop.currentBet === 0) ? 'Bet' : 'Raise';
  const names: KeyNames = { fold: 'Fold', check: 'Check', call: 'Call', s1: s1Name };
  const callAmount = Math.min(stop.currentBet - stop.bets[post.villain], stop.stacks[post.villain]);
  const sizeSpot: SizeSpot | null =
    post.keys.includes('s1') && post.minTo !== null && post.maxTo !== null
      ? { currentBet: stop.currentBet, potBase: post.potBase, minTo: post.minTo, maxTo: post.maxTo }
      : null;

  // ---- 塗り・ブラシ・サイズ ----
  const initialPaint = useMemo(() => emptyPaint(), []);
  const [editor, setEditor] = useState<Editor>(() => newEditor(initialPaint));
  const [brush, setBrush] = useState<Mix>(() => initialBrush(post.keys));
  const [tool, setTool] = useState<Tool>('brush');
  const [sizeText, setSizeText] = useState(() => (sizeSpot ? formatBb(initialSize(sizeSpot, null)) : ''));
  const [sizeOpen, setSizeOpen] = useState(false);

  // ポインタのイベントから最新の値を読むため
  const live = useRef({ editor, brush, tool, mode: 'paint' as StrokeMode });
  live.current = { ...live.current, editor, brush, tool };

  const onStart = useCallback((idx: number) => {
    const { editor: e, brush: b, tool: t } = live.current;
    const mode = strokeMode(e, idx, b, t);
    live.current.mode = mode;
    setEditor((x) => applyCell(beginStroke(x), idx, mode, b));
  }, []);
  const onEnter = useCallback((idx: number) => {
    const { mode, brush: b } = live.current;
    setEditor((x) => applyCell(x, idx, mode, b));
  }, []);
  const onEnd = useCallback(() => setEditor(endStroke), []);
  const onPick = useCallback(
    (idx: number) => {
      const e = live.current.editor;
      const mix = (e.strokeBase ?? e.paint)[idx] ?? null;
      setEditor(cancelStroke);
      if (mix) {
        setBrush({ ...mix });
        setTool('brush');
      } else {
        toast('Range 外', 'notice');
      }
    },
    [toast],
  );

  // ---- 送信 ----
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const to = sizeSpot ? parseSizeText(sizeText) : null;
  const errors = [...(attempted ? submitErrors(editor.paint, post.keys, to, sizeSpot) : []), ...(serverError ? [serverError] : [])];

  useEffect(() => setServerError(null), [editor.paint, sizeText]);

  // 塗りを変えたまま画面を離れるとき、ブラウザの離脱確認を出す（06 章 §4.9）
  const initialKey = useMemo(() => paintKey(initialPaint), [initialPaint]);
  const dirty = !sent && paintKey(editor.paint) !== initialKey;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const send = async (): Promise<void> => {
    setBusy(true);
    const size = sizeForSubmit(editor.paint, to);
    const r = await insertAnswer(post.id, editor.paint, size);
    setBusy(false);
    if (r.ok || r.code === 'already_answered') {
      setSent(true);
      setConfirming(false);
      props.onDone();
      return;
    }
    setConfirming(false);
    setServerError(answerErrorMessage(r.code));
  };

  const submit = (): void => {
    setAttempted(true);
    if (busy || submitErrors(editor.paint, post.keys, to, sizeSpot).length > 0) return;
    setConfirming(true);
  };

  // ---- 部品 ----
  const [tab, setTab] = useState<MobileTab>('replay');
  const bottomRef = useBottomBarHeight();
  const s1Sub = sizeSpot ? sizeSummary(to, sizeSpot) : null;
  const brushPanel = (
    <BrushPanel
      keys={post.keys}
      names={names}
      subs={{
        call: facing ? `${formatBb(callAmount)}bb` : undefined,
        s1: s1Sub ? (s1Sub.pct === 'All-in' ? 'All-in' : s1Sub.amount) : undefined,
      }}
      disabledNames={mobile ? [] : unavailableNames(post.keys, facing, s1Name)}
      brush={brush}
      tool={tool}
      onBrush={setBrush}
      onTool={setTool}
      canUndo={editor.undo.length > 0}
      canRedo={editor.redo.length > 0}
      canClear={!isEmpty(editor.paint)}
      onUndo={() => setEditor(undo)}
      onRedo={() => setEditor(redo)}
      onClear={() => setEditor(clear)}
    />
  );
  const grid = <RangeGrid paint={editor.paint} names={names} onStart={onStart} onEnter={onEnter} onEnd={onEnd} onPick={onPick} />;
  const size = sizeSpot && (
    <SizeControl
      label={`${s1Name} Size`}
      spot={sizeSpot}
      text={sizeText}
      onText={setSizeText}
      open={sizeOpen}
      onOpen={setSizeOpen}
    />
  );
  const bar = <ComboBar keys={post.keys} names={names} ratios={paintBar(editor.paint)} />;
  const submitButton = (
    <button type="button" className="btn" disabled={busy} onClick={submit}>
      {busy ? '送信中…' : '回答する'}
    </button>
  );
  const replayView = <ReplayView detail={d} frames={frames} c={replay} logInModal={mobile} />;

  const head = (
    <div className="ans-head">
      <p className="ans-meta num">{metaLine(d)}</p>
      <h1 className="ans-title">{post.title}</h1>
    </div>
  );
  const dialog = confirming && (
    <ConfirmDialog
      title="回答を送信しますか"
      body="送信後は変更できません。"
      confirmLabel="送信する"
      busyLabel="送信中…"
      busy={busy}
      onConfirm={() => void send()}
      onCancel={() => setConfirming(false)}
    />
  );

  if (!mobile) {
    return (
      <section className="screen ans">
        {head}
        <div className="ans-grid">
          <div className="ans-col">
            <h2 className="sec-h">Replay</h2>
            {replayView}
          </div>
          <div className="ans-col">
            <h2 className="sec-h">Range</h2>
            {brushPanel}
            {grid}
            {size}
            {bar}
            <ErrorList errors={errors} />
            {submitButton}
          </div>
        </div>
        {dialog}
      </section>
    );
  }

  return (
    <section className={`screen ans sp tab-${tab}`}>
      {head}
      <div className="ans-top">
        <Tabs label="表示" items={MOBILE_TABS} value={tab} onChange={setTab} />
        {tab === 'range' && (
          <div className="ans-panel">
            <SpotStrip detail={d} state={stop} onOpen={() => setTab('replay')} />
            {brushPanel}
            {size}
          </div>
        )}
      </div>
      {tab === 'replay' ? replayView : grid}
      <div className="ans-bottom" ref={bottomRef}>
        {tab === 'replay' ? (
          <button type="button" className="btn" onClick={() => setTab('range')}>
            Range 入力
          </button>
        ) : (
          <>
            {bar}
            <ErrorList errors={errors} />
            {submitButton}
          </>
        )}
      </div>
      {dialog}
    </section>
  );
}

/**
 * スマホの下部固定バーの高さを `--ans-bottom-h` に入れる（画面の下の余白をバーの高さに合わせ、
 * いちばん下までスクロールしたときにレンジ表の最後の行がバーのすぐ上に来るようにする）。
 */
function useBottomBarHeight(): (el: HTMLDivElement | null) => void {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const root = el.closest<HTMLElement>('.ans');
    const set = (): void => root?.style.setProperty('--ans-bottom-h', `${el.offsetHeight}px`);
    set();
    observer.current = new ResizeObserver(set);
    observer.current.observe(el);
  }, []);
}

/**
 * スポットの要約（スマホのレンジタブ。14 章）: ボード・出題の Hero のアクション・ポット。
 * 塗りながらリプレイのタブへ戻らずに局面を確かめられるようにする。押すとリプレイのタブへ。
 */
function SpotStrip(props: { detail: PostDetail; state: State; onOpen: () => void }): JSX.Element {
  const { hand, post } = props.detail;
  const board = hand.board.slice(0, BOARD_COUNT[props.state.street]);
  const a = hand.actions[hand.spotIndex];
  return (
    <button type="button" className="spot-strip" aria-label="Replay を見る" onClick={props.onOpen}>
      <span className="ss-board">
        {board.map((c) => (
          <PlayingCard key={c} card={c} size="sm" />
        ))}
      </span>
      {a && (
        <span className="ss-line">
          <b style={{ color: POS_VAR[a.pos] }}>{a.pos}</b>
          {a.pos === post.hero && <span className="ss-tag">Hero</span>} {ACTION_NAME[a.type]}
          {a.to !== undefined && <span className="num"> {formatBb(a.to)}</span>}
        </span>
      )}
      <span className="ss-pot num">
        <i className="mono-lbl">POT</i> {formatBb(totalPot(props.state))}
      </span>
    </button>
  );
}

/** PC で非活性ボタンとして並べる取れないアクション（06 章 §4.6） */
function unavailableNames(keys: readonly AnswerKey[], facing: boolean, s1Name: string): string[] {
  const out = facing ? ['Check', 'Bet'] : ['Fold', 'Call'];
  if (!keys.includes('s1')) out.push(s1Name);
  return out;
}

/** リプレイ（テーブル・操作・ハンドヒストリー）。スマホのハンドヒストリーは卓の左上のボタンからモーダルで開く（14 章） */
function ReplayView(props: {
  detail: PostDetail;
  frames: ReturnType<typeof answerFrames>;
  c: ReplayControl;
  logInModal: boolean;
}): JSX.Element {
  const { detail: d, c } = props;
  const { hand, post } = d;
  const state = props.frames[c.step] ?? props.frames[props.frames.length - 1];
  if (!state) return <></>;
  const actor = actorAt(hand.actions, c.step, hand.stopIndex, post.villain);
  const board = hand.board.slice(0, BOARD_COUNT[state.street]);
  // 投稿者は自分のハンドなので表向き（Q-14）
  const author = d.viewer === 'author';
  const log = (
    <HandLog
      setup={hand.setup}
      actions={hand.actions.slice(0, c.step)}
      board={board}
      spotIndex={hand.spotIndex}
      highlightLast
      prompt={c.step === hand.stopIndex ? `▶ ${post.villain} to act` : null}
    />
  );
  return (
    <div className="replay">
      {props.logInModal && <HistoryButton disabled={c.step === 0}>{log}</HistoryButton>}
      <PokerTable
        seats={seatViews(state, { hero: post.hero, villain: post.villain, actor })}
        pot={state.pot}
        board={board}
        holes={state.folded.has(post.hero) ? {} : { [post.hero]: (author ? d.secrets?.heroCards : null) ?? 'back' }}
        villainLabel="Villain（あなた）"
      />
      <ReplayControls c={c} />
      {!props.logInModal && log}
    </div>
  );
}
