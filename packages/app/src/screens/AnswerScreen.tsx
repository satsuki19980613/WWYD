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
  type Action,
  type Card,
  type Mbb,
  type Pos,
  type State,
  type Street,
} from '@wwyd/core';
import { PlayingCard } from '../components/PlayingCard.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { ACTION_NAME, STREET_NAME } from '../post/draft.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { FitStage } from '../components/FitStage.tsx';
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
import {
  HandLog,
  HistoryButton,
  PokerTable,
  ReplayControls,
  typingOrModal,
  useReplay,
  useReplayKeys,
  type ReplayControl,
} from '../answer/Replay.tsx';
import { actorAt, answerFrames, seatViews } from '../answer/replayModel.ts';
import { SizeButton, SizeControl } from '../answer/SizeControl.tsx';
import { STREET_LABEL } from '../list/spotList.ts';
import { ErrorList } from '../post/SpotSection.tsx';
import { useHeightVar } from '../useHeightVar.ts';
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
  useReplayKeys(replay, !mobile);
  const stop = frames[hand.stopIndex] as (typeof frames)[number];

  // ---- アクションの名前とサイズ ----
  const facing = post.keys.includes('call');
  const s1Name = post.s1Label === 'bet' || (post.s1Label === null && stop.currentBet === 0) ? 'Bet' : 'Raise';
  const names: KeyNames = { fold: 'Fold', check: 'Check', call: 'Call', s1: s1Name };
  const callAmount = Math.min(stop.currentBet - stop.bets[post.hero], stop.stacks[post.hero]);
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

  // PC の塗りのキー（17 章）: Ctrl+Z で元に戻す、Ctrl+Y・Ctrl+Shift+Z でやり直す、E で消しゴム・B でブラシ
  useEffect(() => {
    if (mobile) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.altKey || typingOrModal(e)) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z' && !e.shiftKey) setEditor(undo);
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) setEditor(redo);
      else if (!mod && k === 'e') setTool('eraser');
      else if (!mod && k === 'b') setTool('brush');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobile]);

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
  // スマホの下部固定バーの高さを --ans-bottom-h に（いちばん下までスクロールしたとき、レンジ表の最後の行がバーのすぐ上に来る）
  const bottomRef = useHeightVar('.ans', '--ans-bottom-h');
  const s1Sub = sizeSpot ? sizeSummary(to, sizeSpot) : null;
  // スマホはブラシの道具の行に Size（モーダル）と Hand History（停止位置までのログのモーダル）のボタンを置く（2026-09-29 さつき）
  const tools = mobile && (
    <>
      {sizeSpot && <SizeButton label={`${s1Name} Size`} spot={sizeSpot} text={sizeText} onText={setSizeText} />}
      <HistoryButton compact>
        <HandLog
          setup={hand.setup}
          actions={hand.actions.slice(0, hand.stopIndex)}
          board={hand.board.slice(0, BOARD_COUNT[stop.street])}
          spotIndex={hand.spotIndex}
          highlightLast
          prompt={`▶ ${post.hero} to act`}
        />
      </HistoryButton>
    </>
  );
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
      extra={tools}
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
    // PC（17 章）: 左にリプレイ、上にスポットの見出し、中央にレンジ表、右に道具と送信。
    // 設計の大きさで組み、画面に収まるよう全体を同じ比率で拡大縮小する（FitStage。ページはスクロールしない）
    return (
      <FitStage className="screen ans pc">
        <div className="ans-replay">
          {head}
          <h2 className="sr-only">Replay</h2>
          {replayView}
        </div>
        <SpotBanner detail={d} state={stop} />
        <div className="ans-range">
          <h2 className="sr-only">Range</h2>
          {grid}
        </div>
        <div className="ans-tools">
          {brushPanel}
          {size}
          {bar}
          <div className="ans-send">
            <ErrorList errors={errors} />
            {submitButton}
          </div>
        </div>
        {dialog}
      </FitStage>
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
          </div>
        )}
      </div>
      {/* Range のタブは画面をスクロールさせず、表を残りの高さに収める（2026-09-29 さつき） */}
      {tab === 'replay' ? replayView : <div className="ans-gridbox">{grid}</div>}
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

/** スポットの要点（17 章）: Street・Board・Hero・Hero が向き合う Action（このストリートの最後の Bet・Raise。無ければ最後の Action）・Pot・to call */
type SpotFacts = { street: Street; board: Card[]; hero: Pos; facing: Action | null; pot: Mbb; toCall: Mbb };

function spotFacts(d: PostDetail, state: State): SpotFacts {
  const { hand, post } = d;
  const inStreet = hand.actions.slice(0, hand.stopIndex).filter((a) => a.street === post.street);
  const aggressive = [...inStreet].reverse().find((a) => a.type === 'bet' || a.type === 'raise');
  return {
    street: post.street,
    board: hand.board.slice(0, BOARD_COUNT[state.street]),
    hero: post.hero,
    facing: aggressive ?? inStreet[inStreet.length - 1] ?? null,
    pot: totalPot(state),
    toCall: Math.min(state.currentBet - state.bets[post.hero], state.stacks[post.hero]),
  };
}

/** 「vs BB Bet 6.5」「vs BB Check」、このストリートで最初の Action なら「to act」 */
function FacingText(props: { f: SpotFacts }): JSX.Element {
  const a = props.f.facing;
  if (!a) return <span className="sp-facing">to act</span>;
  return (
    <span className="sp-facing">
      vs <b style={{ color: POS_VAR[a.pos] }}>{a.pos}</b> {ACTION_NAME[a.type]}
      {a.to !== undefined && <span className="num"> {formatBb(a.to)}</span>}
    </span>
  );
}

/**
 * PC のスポットの見出し（レンジ表と道具の上の帯。17 章。2026-09-29 さつき: どこのスポットの Range を答えるか分かるように）。
 * 「SPOT · Turn · Board · Hero BTN vs BB Bet 6.5 · Pot · to call」。コーナーブラケットで囲む（シグネチャー 2）。
 */
function SpotBanner(props: { detail: PostDetail; state: State }): JSX.Element {
  const f = spotFacts(props.detail, props.state);
  return (
    <div className="bracket-hero spot-banner" role="group" aria-label="Spot">
      <span className="brk tl" aria-hidden="true" />
      <span className="brk br" aria-hidden="true" />
      <span className="mono-lbl sp-lbl">Spot</span>
      <span className="sp-street">{STREET_NAME[f.street]}</span>
      <span className="sp-board">
        {f.board.map((c) => (
          <PlayingCard key={c} card={c} />
        ))}
      </span>
      <span className="sp-q">
        <span className="sp-hero">
          Hero <b style={{ color: POS_VAR[f.hero] }}>{f.hero}</b>
        </span>
        <FacingText f={f} />
      </span>
      <span className="sp-nums num">
        <span>
          <i className="mono-lbl">Pot</i> {formatBb(f.pot)}bb
        </span>
        {f.toCall > 0 && (
          <span>
            <i className="mono-lbl">to call</i> {formatBb(f.toCall)}bb
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * スマホのスポットの要約（Range のタブの 1 行。14 章・17 章）: Board・Hero・向き合う Action・Pot。行は増やさない。
 * 塗りながら Replay のタブへ戻らずに局面を確かめられるようにする。押すと Replay のタブへ。
 */
function SpotStrip(props: { detail: PostDetail; state: State; onOpen: () => void }): JSX.Element {
  const f = spotFacts(props.detail, props.state);
  return (
    <button type="button" className="spot-strip" aria-label="Replay を見る" onClick={props.onOpen}>
      <span className="ss-board">
        {f.board.map((c) => (
          <PlayingCard key={c} card={c} size="sm" />
        ))}
      </span>
      <span className="ss-line">
        Hero{' '}
        <b className="ss-hero" style={{ color: POS_VAR[f.hero] }}>
          {f.hero}
        </b>{' '}
        <FacingText f={f} />
      </span>
      <span className="ss-pot num">
        <i className="mono-lbl">POT</i> {formatBb(f.pot)}
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
  const actor = actorAt(hand.actions, c.step, hand.stopIndex, post.hero);
  const board = hand.board.slice(0, BOARD_COUNT[state.street]);
  // Hero のハンドは投稿者が自分の投稿に答えるときも伏せる（回答してから集計画面で見せる。2026-09-29 さつき。Q-14 を改める）
  const log = (
    <HandLog
      setup={hand.setup}
      actions={hand.actions.slice(0, c.step)}
      board={board}
      spotIndex={hand.spotIndex}
      highlightLast
      prompt={c.step === hand.stopIndex ? `▶ ${post.hero} to act` : null}
      onPick={props.logInModal ? undefined : (i) => c.goto(i + 1)}
    />
  );
  return (
    <div className="replay">
      {props.logInModal && <HistoryButton disabled={c.step === 0}>{log}</HistoryButton>}
      <PokerTable
        seats={seatViews(state, { hero: post.hero, actor, you: true })}
        pot={state.pot}
        board={board}
        holes={state.folded.has(post.hero) ? {} : { [post.hero]: 'back' }}
        heroLabel="Hero（あなた）"
        spot={c.step === hand.stopIndex}
      />
      <ReplayControls c={c} spot={hand.stopIndex} />
      {!props.logInModal && log}
    </div>
  );
}
