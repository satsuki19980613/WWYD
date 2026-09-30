import { BOARD_COUNT, formatBb, totalPot, type Action, type Card, type HandSetup, type Mbb, type Pos, type Street } from '@wwyd/core';
import { useState, type ReactNode } from 'react';
import { HandLog, PokerTable } from '../answer/Replay.tsx';
import { seatViews } from '../answer/replayModel.ts';
import type { Hole } from '../answer/resultModel.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { HistoryIcon, RedoIcon, TrashIcon, UndoIcon } from '../components/Icons.tsx';
import { Modal } from '../components/Modal.tsx';
import { PlayingCard, cardText } from '../components/PlayingCard.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { useToast } from '../components/Toast.tsx';
import { useHeightVar } from '../useHeightVar.ts';
import { handCards } from './cardInput.ts';
import { CardPicker } from './CardPicker.tsx';
import {
  actionLog,
  aggressiveName,
  callName,
  defaultPreset,
  parseSize,
  PLAYERS_REQUIRED,
  sizeNote,
  sizePresets,
  skipTargets,
  STREET_NAME,
  usedCards,
  type Draft,
  type Phase,
} from './draft.ts';
import { SizeSlider } from './SizeSlider.tsx';

type ActPhase = Extract<Phase, { kind: 'act' }>;

/**
 * アクション入力（06 章 §3.6、13 章、14 章 §3.1）。
 * 上に入力中のハンドの卓（Hero を手前。スタック・ベット・ポット・ボード・手番の席）。卓のボードのカードを押すとそのカード以降を消す。
 * 手番の操作は「アクションの台」（act-dock）にまとめる: よく使う額 → Fold to / Check to → 道具の行
 * （手番の席・1つ戻す・1つ進む・すべて消す・額）→ 3 つのボタン。スマホは台を画面の下に固定する（親指の届く所）。
 * ログ（ハンドヒストリー）は PC は卓の下に出し、スマホは左上のボタンからモーダルで開く（量が増えると画面を圧迫するため）。
 * ログの 1 手を押すと、確かめてからその手以降を入れ直せる。
 */
export function ActionSection(props: {
  draft: Draft;
  setup: HandSetup | null;
  phase: Phase;
  mobile: boolean;
  onAction: (a: Action) => void;
  onActions: (a: readonly Action[]) => void;
  onUndo: () => void;
  /** 1つ進む（取り消したアクションを入れ直す）。できなければ null */
  onRedo: (() => void) | null;
  /** ログの 1 手から入れ直す（その手以降を消す） */
  onTruncate: (index: number) => void;
  onClear: () => void;
  onBoardAdd: (card: Card) => void;
  onBoardRemoveFrom: (i: number) => void;
  /** 投稿を押したことがある（エラーを出す） */
  attempted: boolean;
}): JSX.Element {
  const { draft: d, phase } = props;
  // 人数を選ぶ前の「Player の人数を選択してください」は、開いた直後には出さず、先に進もうとしたときだけ出す（F-036 Q-2。2026-09-30 さつき）。
  // PC は Action の節を押したとき・投稿を押したとき。スマホは Action の段に進んだとき（節が見えるのは進んだときだけ）
  const [tried, setTried] = useState(false);
  const askPlayers = props.mobile || props.attempted || tried;

  // ボードのカードピッカー（ストリートが終わったら自動で開き、揃うまで続けて開く。閉じたら「＋」で開き直す）
  const needKey = phase.kind === 'board' ? `${d.actions.length}:${phase.need}` : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const pickerOpen = needKey !== null && (manual || dismissed !== needKey);
  const openPicker = (): void => setManual(true);
  const closePicker = (): void => {
    setManual(false);
    setDismissed(needKey);
  };

  // ログの 1 手を押したら、確かめてからその手以降を消す
  const [rewind, setRewind] = useState<number | null>(null);
  const rewindText = rewind !== null && props.setup ? (actionLog(props.setup, d.actions)[rewind]?.text ?? null) : null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const canClear = d.actions.length > 0 || d.board.length > 0;
  const tools = (
    <Tools
      canUndo={d.actions.length > 0}
      onUndo={props.onUndo}
      onRedo={props.onRedo}
      canClear={canClear}
      onClear={() => setClearing(true)}
    />
  );
  // スマホの台（画面の下に固定）の高さ。卓で台のすぐ上までを埋める（14 章）
  const dockRef = useHeightVar('.pf', '--dock-h', { keepMax: true });
  const dock =
    phase.kind === 'act' ? (
      <ActDock
        key={d.actions.length}
        domRef={dockRef}
        phase={phase}
        actions={d.actions}
        mobile={props.mobile}
        tools={tools}
        onAction={props.onAction}
        onActions={props.onActions}
      />
    ) : phase.kind === 'board' ? (
      <BoardDock draft={d} tools={tools} onOpen={openPicker} domRef={dockRef} />
    ) : null;

  const invalid =
    phase.kind === 'invalid' &&
    (d.players !== null ? <p className="form-err">基本設定の値が正しくありません</p> : askPlayers && <p className="form-err">{PLAYERS_REQUIRED}</p>);
  // 手番が無い（終わった）ときは台が無いので、ここに 1つ戻す・すべて消す
  const undo = !dock && phase.kind !== 'invalid' && <div className="pf-undo">{tools}</div>;
  const log = props.setup && d.actions.length > 0 && (
    <HandLog
      setup={props.setup}
      actions={d.actions}
      board={d.board}
      spotIndex={d.spotIndex ?? -1}
      highlightLast
      strip={!props.mobile}
      onPick={(i) => {
        setHistoryOpen(false);
        setRewind(i);
      }}
    />
  );

  return (
    <section className="pf-sec pf-actsec" aria-labelledby="pf-actions" onPointerDown={d.players === null ? () => setTried(true) : undefined}>
      <h2 id="pf-actions" className="sec-h">
        Action 入力
      </h2>
      {props.mobile && invalid}
      {props.mobile && phase.kind !== 'invalid' && (
        <button type="button" className="hist-btn" disabled={d.actions.length === 0} onClick={() => setHistoryOpen(true)}>
          <HistoryIcon />
          History
        </button>
      )}
      <LiveTable draft={d} phase={phase} onOpen={openPicker} onRemoveFrom={props.onBoardRemoveFrom} />
      {props.mobile ? (
        <>
          {undo}
          {dock}
        </>
      ) : (
        // PC は卓・台・History の 3 段を決まった高さで区切る（台の大きさや History の手数で卓が動かない。2026-09-29 さつき）
        <>
          <div className="pf-dockslot">
            {invalid}
            {dock ?? undo}
          </div>
          <div className="pf-logslot">{log}</div>
        </>
      )}
      {historyOpen && log && (
        <Modal title="Hand History" tone="info" onClose={() => setHistoryOpen(false)}>
          {log}
        </Modal>
      )}
      {rewind !== null && rewindText && (
        <ConfirmDialog
          title={`${rewindText} から入れ直しますか`}
          body="この手から後の Action を消します。"
          confirmLabel="入れ直す"
          onConfirm={() => {
            props.onTruncate(rewind);
            setRewind(null);
          }}
          onCancel={() => setRewind(null)}
        />
      )}
      {clearing && (
        <ConfirmDialog
          title="Action と Board をすべて消しますか"
          body="入れた Action と Board の Card を消します。"
          confirmLabel="すべて消す"
          destructive
          onConfirm={() => {
            props.onClear();
            setClearing(false);
          }}
          onCancel={() => setClearing(false)}
        />
      )}
      {pickerOpen && phase.kind === 'board' && (
        <CardPicker
          title={`${STREET_NAME[cardStreet(d.board.length)]} ${cardStreet(d.board.length) === 'flop' ? `${d.board.length + 1}/3` : ''}`.trim()}
          used={usedCards(d)}
          onPick={props.onBoardAdd}
          onClose={closePicker}
        />
      )}
    </section>
  );
}

/** 道具: 1つ戻す・1つ進む・すべて消す（すべて消すは確認してから） */
function Tools(props: { canUndo: boolean; onUndo: () => void; onRedo: (() => void) | null; canClear: boolean; onClear: () => void }): JSX.Element {
  return (
    <span className="ad-tools">
      <button type="button" className="icon-btn ad-tool" aria-label="1つ戻す" disabled={!props.canUndo} onClick={props.onUndo}>
        <UndoIcon />
      </button>
      <button type="button" className="icon-btn ad-tool" aria-label="1つ進む" disabled={!props.onRedo} onClick={() => props.onRedo?.()}>
        <RedoIcon />
      </button>
      <button type="button" className="icon-btn ad-tool red" aria-label="すべて消す" disabled={!props.canClear} onClick={props.onClear}>
        <TrashIcon />
      </button>
    </span>
  );
}

/** 道具の行: 左に手番（席・ストリート）と道具、右に額 */
function ToolRow(props: { pos?: Pos; title: string; tools: JSX.Element; right?: ReactNode }): JSX.Element {
  return (
    <div className="ad-toolrow">
      <p className="ad-turn">
        {props.pos && (
          <b className="ad-pos" style={{ color: POS_VAR[props.pos] }}>
            {props.pos}
          </b>
        )}
        <span className="ad-street">{props.title}</span>
      </p>
      {props.tools}
      {props.right}
    </div>
  );
}

function ActDock(props: {
  domRef: (el: HTMLElement | null) => void;
  phase: ActPhase;
  actions: readonly Action[];
  mobile: boolean;
  tools: JSX.Element;
  onAction: (a: Action) => void;
  onActions: (a: readonly Action[]) => void;
}): JSX.Element {
  const { state, pos, legal } = props.phase;
  const toast = useToast();
  const range = legal.bet ?? legal.raise;
  const presets = sizePresets(state, legal);
  const [size, setSize] = useState(() => {
    const m = defaultPreset(state, legal);
    return m === null ? '' : formatBb(m);
  });
  const skip = skipTargets(state, pos, legal);
  // 1 手で回る席は「フォールド」「チェック」と同じなので出さない
  const shortcuts = skip.targets.filter((t) => t.actions.length >= 2);

  const act = (type: Action['type'], to?: Mbb): void =>
    props.onAction(to === undefined ? { street: state.street, pos, type } : { street: state.street, pos, type, to });
  const to = range ? parseSize(size, range) : null;
  const aggressive = (): void => {
    if (!range) return;
    if (to === null) {
      toast(`${formatBb(range.min)}〜${formatBb(range.max)}bb`);
      return;
    }
    act(legal.bet ? 'bet' : 'raise', to);
  };
  const callAllin = legal.call !== null && legal.call >= state.stacks[pos];
  // ベットがある（または BB のオプション）ならレイズ。レイズできないとき（相手がオールイン）もレイズと出して押せなくする
  const raiseLabel = state.currentBet > 0 || (legal.raise !== null && legal.bet === null);
  // ボタンはプレイヤーが呼ぶ名前（オープン / 3bet / リンプ など。13 章 §6）
  const s1Name = raiseLabel && state.currentBet === 0 ? 'Raise' : aggressiveName(state, props.actions);
  const unit = raiseLabel ? 'to' : 'bet';
  const sizeLabel = raiseLabel ? 'Raise の額（to。bb）' : 'Bet の額（bb）';

  // 額: スマホは縦のスライダー（キーボードを出さない）、PC は入力欄
  const sizeField =
    range &&
    (props.mobile ? (
      <SizeSlider
        unit={unit}
        label={sizeLabel}
        range={range}
        value={to}
        note={(v) => sizeNote(state, v)}
        onChange={(v) => setSize(formatBb(v))}
      />
    ) : (
      <label className="ad-size">
        <span className="mono-lbl">{unit}</span>
        <input
          className="inp num"
          inputMode="decimal"
          autoComplete="off"
          aria-label={sizeLabel}
          value={size}
          onChange={(e) => setSize(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') aggressive();
          }}
        />
      </label>
    ));

  // よく使う額がオールインだけなら行ごと出さない（額の欄の最大と同じで、台が高くなるだけ）
  const showChips = presets.some((p) => !p.allin);

  return (
    <div className="act-dock" role="group" aria-label="Action" ref={props.domRef}>
      {showChips && (
        <div className="ad-chips" role="group" aria-label={raiseLabel ? 'Raise の額' : 'Bet の額'}>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`ad-chip ${p.allin ? 'allin' : ''}`}
              aria-pressed={to === p.to}
              onClick={() => setSize(formatBb(p.to))}
            >
              <b>{p.label}</b>
              {!p.allin && p.label !== p.sub && <span className="num">{p.sub}</span>}
            </button>
          ))}
        </div>
      )}
      {shortcuts.length > 0 && (
        <div className="ad-skip" role="group" aria-label={skip.kind === 'fold' ? 'Fold to' : 'Check to'}>
          <span className="mono-lbl">{skip.kind === 'fold' ? 'Fold to' : 'Check to'}</span>
          {shortcuts.map((t) => (
            <button key={t.pos} type="button" className="ad-skip-btn" onClick={() => props.onActions(t.actions)}>
              <b style={{ color: POS_VAR[t.pos] }}>{t.pos}</b>
            </button>
          ))}
        </div>
      )}
      <ToolRow pos={pos} title={STREET_NAME[state.street]} tools={props.tools} right={sizeField} />
      <div className="ad-btns">
        <button type="button" className="act-btn fold" disabled={!legal.fold} onClick={() => act('fold')}>
          Fold
        </button>
        {legal.check ? (
          <button type="button" className="act-btn check" onClick={() => act('check')}>
            Check
          </button>
        ) : (
          <button type="button" className="act-btn call" disabled={legal.call === null} onClick={() => act('call')}>
            {callName(state, pos)}
            {legal.call !== null && <span className="num"> {formatBb(legal.call)}</span>}
            {callAllin && <small>All-in</small>}
          </button>
        )}
        <button type="button" className="act-btn s1" disabled={!range} onClick={aggressive}>
          {s1Name}
          {to !== null && <span className="num"> {formatBb(to)}</span>}
          {to !== null && range && to === range.max && <small>All-in</small>}
        </button>
      </div>
    </div>
  );
}

/** ボードを待つ間の台: 道具の行（「フロップのカード」）＋ピッカーを開き直すボタン */
function BoardDock(props: {
  draft: Draft;
  tools: JSX.Element;
  onOpen: () => void;
  domRef: (el: HTMLElement | null) => void;
}): JSX.Element {
  const street = cardStreet(props.draft.board.length);
  return (
    <div className="act-dock" role="group" aria-label="Board" ref={props.domRef}>
      <ToolRow title={`${STREET_NAME[street]} の Card`} tools={props.tools} />
      <div className="ad-btns one">
        <button type="button" className="btn ghost" onClick={props.onOpen}>
          {STREET_NAME[street]} の Card を選ぶ
        </button>
      </div>
    </div>
  );
}

const cardStreet = (i: number): Street => (i < 3 ? 'flop' : i === 3 ? 'turn' : 'river');

/**
 * 入力中のハンドの卓（14 章。回答画面の卓と同じ部品）。Hero を手前に置き、手番の席を光らせる。
 * ホールカードは入力した席だけ表向き。終わったら「{席} ポット獲得」または「ショーダウン」（カードの無い席は「マック」）。
 */
function LiveTable(props: { draft: Draft; phase: Phase; onOpen: () => void; onRemoveFrom: (i: number) => void }): JSX.Element | null {
  const { draft: d, phase } = props;
  if (phase.kind === 'invalid') return null;
  const done = phase.kind === 'done';
  // 終わったらベットをポットに回収して出す（集計画面の終了時と同じ）
  const s = done ? { ...phase.state, pot: totalPot(phase.state), bets: { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 } } : phase.state;
  const showdown = done && phase.result.kind === 'showdown' ? phase.result.seats : [];
  const holes: Partial<Record<Pos, Hole>> = {};
  for (const p of s.seated) {
    if (s.folded.has(p)) continue;
    const cards = handCards(d.hands[p]);
    if (cards.length === 2) holes[p] = cards;
    else if (showdown.includes(p)) holes[p] = 'muck';
  }
  const note = done ? (phase.result.kind === 'over' ? `${phase.result.winner} Pot 獲得` : 'Showdown') : null;
  const reached = phase.kind === 'act' ? BOARD_COUNT[phase.state.street] : phase.kind === 'board' ? phase.need : phase.boardCount;
  return (
    <PokerTable
      seats={seatViews(s, { hero: d.hero, actor: phase.kind === 'act' ? phase.pos : null })}
      pot={s.pot}
      board={d.board}
      holes={holes}
      note={note}
      boardContent={
        <BoardSlots draft={d} addable={phase.kind === 'board'} reached={reached} onOpen={props.onOpen} onRemoveFrom={props.onRemoveFrom} />
      }
    />
  );
}

/** 卓のボード 5 枠。次に要る枠の「＋」でピッカーを開く。カードを押すとそのカード以降を消す。 */
function BoardSlots(props: {
  draft: Draft;
  addable: boolean;
  /** 今のストリートまでに見えている枚数（それより後のカード＝1つ戻すで残ったものは薄く出す） */
  reached: number;
  onOpen: () => void;
  onRemoveFrom: (i: number) => void;
}): JSX.Element {
  const { draft: d } = props;
  const next = d.board.length;
  const street = cardStreet(next);
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => {
        const card = d.board[i];
        if (card) {
          return (
            <button
              key={i}
              type="button"
              className={`pf-bslot filled ${i >= props.reached ? 'ahead' : ''}`}
              aria-label={`${cardText(card)}（この Card 以降を消す）`}
              onClick={() => props.onRemoveFrom(i)}
            >
              <PlayingCard card={card} />
            </button>
          );
        }
        if (props.addable && i === next) {
          return (
            <button key={i} type="button" className="pf-bslot add" aria-label={`${STREET_NAME[street]} の Card を選ぶ`} onClick={props.onOpen}>
              ＋
            </button>
          );
        }
        return <span key={i} className="ptable-slot" />;
      })}
    </>
  );
}
