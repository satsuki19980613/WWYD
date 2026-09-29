import { STREETS, type Action, type Card, type Pos } from '@wwyd/core';
import { useEffect, useRef, useState } from 'react';
import { typingOrModal } from '../answer/Replay.tsx';
import { cardText } from '../components/PlayingCard.tsx';
import { useToast } from '../components/Toast.tsx';
import { ActionSection } from '../post/ActionSection.tsx';
import { applyCardKey, isHandComplete, type CardKey } from '../post/cardInput.ts';
import { CardKeyboard } from '../post/CardKeyboard.tsx';
import { HandPicker } from '../post/HandPicker.tsx';
import {
  addAction,
  addActions,
  addBoardCard,
  buildSubmission,
  canReplay,
  clearActions,
  makesPreflopAllin,
  neighborSeat,
  nextOpenSeat,
  normalizeSpot,
  parseSettings,
  phaseOf,
  PREFLOP_ALLIN,
  removeBoardFrom,
  seatsOf,
  selectSpot,
  setPlayers,
  truncateActions,
  undoAction,
  usedCards,
  type Draft,
} from '../post/draft.ts';
import { draftSlot, getDraft, resetDraft, setDraft, useDraft } from '../post/draftStore.ts';
import { activeUser, deleteDraft } from '../post/savedDrafts.ts';
import { messageForCode } from '../post/errorMessages.ts';
import { OcrImport } from '../post/OcrImport.tsx';
import { sendPost } from '../post/sendPost.ts';
import { PlayersSection, SettingsSection } from '../post/SetupSections.tsx';
import { ErrorList, SpotSection } from '../post/SpotSection.tsx';
import { navigate } from '../router.ts';
import { useHeightVar } from '../useHeightVar.ts';
import { useIsMobile } from '../useMediaQuery.ts';

const STEPS = ['基本設定', 'Player', 'Action', 'Spot'] as const;
const ACTION_STEP = STEPS.indexOf('Action');

/**
 * スポット投稿（06 章 §3。仕様書 §5.2）。
 * PC は 3 列（基本設定・プレイヤー / アクション / スポット＋エラー＋投稿）、スマホは 4 ステップ。
 * 下書きはメモリのストア（draftStore）に持つ。
 */
export function NewPostScreen(): JSX.Element {
  const d = useDraft();
  const mobile = useIsMobile();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [seat, setSeat] = useState<Pos | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // スマホの戻る・次へのバーの高さ（画面の下の余白に使う）
  const barRef = useHeightVar('.pf', '--bar-h');

  const { setup, invalid } = parseSettings(d);
  const phase = phaseOf(setup, d.actions, d.board);

  // 入力が変わったらサーバーのエラーは消す（投稿前の一覧はその場で計算し直す）
  useEffect(() => setServerError(null), [d]);

  // キーボードを開いた欄が隠れないよう、画面の中ほどへスクロールする
  useEffect(() => {
    if (!seat) return;
    document.querySelector(`[data-seat="${seat}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [seat]);

  const update = (f: (x: Draft) => Draft): void => setDraft(f);

  // 1つ進む（14 章 §3.1）: 1つ戻す・入れ直しで取り消したアクションを先頭から順に持つ。
  // 取り消したものと同じアクションを入れたら先へ進め、違うアクションを入れたら捨てる
  const [future, setFuture] = useState<readonly Action[]>([]);
  const advanceFuture = (as: readonly Action[]): void =>
    setFuture((f) => (as.every((a, k) => sameAction(a, f[k])) ? f.slice(as.length) : []));
  // Preflop で All-in になる Action は受け付けない（投稿できないハンドになる。2026-09-29 さつき）
  const refused = (as: readonly Action[]): boolean => {
    if (!makesPreflopAllin(getDraft(), as)) return false;
    toast(PREFLOP_ALLIN);
    return true;
  };
  const redo = (): void => {
    const next = future[0];
    if (!next || !canReplay(phase, next) || refused([next])) return;
    setFuture((f) => f.slice(1));
    update((x) => addAction(x, next));
  };
  const undoLast = (): void => {
    const last = getDraft().actions.at(-1);
    if (!last) return;
    setFuture((f) => [last, ...f]);
    update(undoAction);
  };
  const patch = (p: Partial<Draft>): void => update((x) => normalizeSpot({ ...x, ...p }));

  // PC の Action のキー（17 章）: Ctrl+Z で 1 つ戻す、Ctrl+Y・Ctrl+Shift+Z で 1 つ進む（入力欄・モーダルの操作中は効かせない）
  const keys = useRef({ undoLast, redo });
  keys.current = { undoLast, redo: canReplay(phase, future[0]) ? redo : () => undefined };
  useEffect(() => {
    if (mobile) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || typingOrModal(e)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) keys.current.undoLast();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) keys.current.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobile]);

  const onKey = (key: CardKey): void => {
    if (!seat) return;
    const cur = getDraft();
    const r = applyCardKey(cur.hands[seat], key, usedCards(cur, seat));
    if (r.used) toast(`${cardText(r.used)} は使用済み`);
    if (r.hand !== cur.hands[seat]) setDraft({ ...cur, hands: { ...cur.hands, [seat]: r.hand } });
  };

  const errors = [...(attempted ? submissionErrors(d) : []), ...(serverError ? [serverError] : [])];

  const submit = (): void => {
    setAttempted(true);
    const s = buildSubmission(d);
    if (!s.ok || busy) return;
    setBusy(true);
    void sendPost(s.body).then((r) => {
      setBusy(false);
      if (r.ok) {
        // 開いた下書きから投稿したら、その下書きは消す
        const slot = draftSlot();
        const uid = activeUser();
        if (slot && uid) deleteDraft(uid, slot);
        resetDraft();
        navigate('/?tab=mine');
      } else {
        setServerError(messageForCode(r.code, r.index));
      }
    });
  };

  const settings = <SettingsSection draft={d} invalid={invalid} onChange={patch} />;
  const players = (
    <PlayersSection
      draft={d}
      invalid={invalid}
      activeSeat={seat}
      onChange={patch}
      onPlayers={(n) => update((x) => setPlayers(x, n))}
      onOpenHand={(p) => setSeat(p)}
    />
  );
  const actions = (
    <ActionSection
      draft={d}
      setup={setup}
      phase={phase}
      mobile={mobile}
      onAction={(a: Action) => {
        if (refused([a])) return;
        advanceFuture([a]);
        update((x) => addAction(x, a));
      }}
      onActions={(as) => {
        if (refused(as)) return;
        advanceFuture(as);
        update((x) => addActions(x, as));
      }}
      onUndo={undoLast}
      onRedo={canReplay(phase, future[0]) ? redo : null}
      onTruncate={(i) => {
        setFuture((f) => [...d.actions.slice(i), ...f]);
        update((x) => truncateActions(x, i));
      }}
      onClear={() => {
        setFuture([]);
        update(clearActions);
      }}
      onBoardAdd={(c: Card) => update((x) => addBoardCard(x, c))}
      onBoardRemoveFrom={(i) => {
        const street = i < 3 ? 'flop' : i === 3 ? 'turn' : 'river';
        const cut = d.actions.findIndex((a) => STREETS.indexOf(a.street) >= STREETS.indexOf(street));
        if (cut >= 0) setFuture((f) => [...d.actions.slice(cut), ...f]);
        update((x) => removeBoardFrom(x, i));
      }}
    />
  );
  const spot = (
    <SpotSection
      draft={d}
      onSelectSpot={(i) => update((x) => selectSpot(x, i))}
      onTitle={(title) => update((x) => ({ ...x, title }))}
    />
  );
  const submitButton = (
    <button type="button" className="btn" disabled={busy} onClick={submit}>
      {busy ? '投稿中…' : '投稿する'}
    </button>
  );
  // PC はカード選択ボード、スマホはカードキーボード（2026-09-29 さつき）
  const keyboard = seat && !mobile && (
    <HandPicker
      seat={seat}
      hand={d.hands[seat]}
      used={usedCards(d, seat)}
      onChange={(hand) => update((x) => ({ ...x, hands: { ...x.hands, [seat]: hand } }))}
      onUsed={(c) => toast(`${cardText(c)} は使用済み`)}
      onFilled={() => {
        const next = nextOpenSeat(seatsOf(d), d.hands, seat);
        if (next) setSeat(next);
      }}
      onClose={() => setSeat(null)}
      onPrev={() => setSeat(neighborSeat(seatsOf(d), seat, -1))}
      onNext={() => setSeat(neighborSeat(seatsOf(d), seat, 1))}
    />
  );
  const mobileKeyboard = seat && mobile && (
    <CardKeyboard
      seat={seat}
      onKey={onKey}
      onClose={() => setSeat(null)}
      onPrev={() => setSeat(neighborSeat(seatsOf(d), seat, -1))}
      onNext={() => setSeat(neighborSeat(seatsOf(d), seat, 1))}
    />
  );
  // PC とスマホで同じ key の直下の子にして、幅が変わってレイアウトが切り替わっても読み込み・確認の途中の状態を保つ。
  // 反映したらスマホはアクションのステップへ（読み込んだアクションとスポットの確認に進む。2026-09-29）
  const ocr = (button: boolean): JSX.Element => <OcrImport key="ocr" button={button} onApplied={() => {
    setFuture([]);
    setStep(ACTION_STEP);
  }} />;

  if (!mobile) {
    return (
      <section className="screen pf">
        {ocr(true)}
        <div className="pf-grid">
          <div className="pf-col">
            {settings}
            {players}
          </div>
          <div className="pf-col">{actions}</div>
          <div className="pf-col">
            {spot}
            <ErrorList errors={errors} />
            {submitButton}
          </div>
        </div>
        {keyboard}
      </section>
    );
  }

  const done = stepDone(d, phase.kind === 'done');
  const last = step === STEPS.length - 1;
  // アクションのステップは卓で画面の残りを埋める。ハンドを入れている間は、下にアクションの台を出す（14 章）
  const docked = step === ACTION_STEP && (phase.kind === 'act' || phase.kind === 'board');
  const fill = !seat && step === ACTION_STEP && phase.kind !== 'invalid';
  return (
    <section className={`screen pf sp ${seat ? 'kb-open' : ''}${fill ? ' fill' : ''}${fill && docked ? ' docked' : ''}`}>
      <nav className="pf-steps" aria-label="ステップ">
        {STEPS.map((name, i) => (
          <button
            key={name}
            type="button"
            className={`pf-step ${done[i] ? 'done' : ''}`}
            aria-current={i === step ? 'step' : undefined}
            onClick={() => setStep(i)}
          >
            <span className="num">{i + 1}</span>
            {name}
          </button>
        ))}
      </nav>
      {ocr(step === 0)}
      {step === 0 && settings}
      {step === 1 && players}
      {step === 2 && actions}
      {step === 3 && spot}
      {/* 台を出している間は戻る・次へを隠す（13 章） */}
      {!seat && !docked && (
        <div className="pf-bar" ref={barRef}>
          <ErrorList errors={errors} />
          <div className="btn-row">
            <button type="button" className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
            {last ? (
              submitButton
            ) : (
              <button type="button" className="btn" onClick={() => setStep((s) => s + 1)}>
                次へ：{STEPS[step + 1]}
              </button>
            )}
          </div>
        </div>
      )}
      {mobileKeyboard}
    </section>
  );
}

function submissionErrors(d: Draft): string[] {
  const s = buildSubmission(d);
  return s.ok ? [] : s.errors;
}

/** ステップの完了（シアン）: 設定が正しい / ハンドが揃っている / ハンドが最後まで / スポットとタイトル */
function stepDone(d: Draft, handDone: boolean): boolean[] {
  const settingsOk = parseSettings(d).invalid.length === 0;
  const handsOk = d.players !== null && seatsOf(d).every((p) => isHandComplete(d.hands[p])) && d.hands[d.hero].length === 4;
  return [settingsOk, handsOk, handDone, d.spotIndex !== null && d.title.trim() !== ''];
}

function sameAction(a: Action, b: Action | undefined): boolean {
  return !!b && a.street === b.street && a.pos === b.pos && a.type === b.type && a.to === b.to;
}
