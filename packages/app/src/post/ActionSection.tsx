import { BOARD_COUNT, formatBb, STREETS, type Action, type Card, type HandSetup, type Mbb, type Street } from '@wwyd/core';
import { useState } from 'react';
import { UndoIcon } from '../components/Icons.tsx';
import { PlayingCard, cardText } from '../components/PlayingCard.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { useToast } from '../components/Toast.tsx';
import { handCards } from './cardInput.ts';
import { CardPicker } from './CardPicker.tsx';
import {
  actionLog,
  defaultPreset,
  parseSize,
  PLAYERS_REQUIRED,
  sizePresets,
  skipTargets,
  STREET_NAME,
  turnInfo,
  usedCards,
  type Draft,
  type Phase,
} from './draft.ts';

type ActPhase = Extract<Phase, { kind: 'act' }>;

/**
 * アクション入力（06 章 §3.6、13 章）。
 * 手番の操作はまとめて「アクションの台」（act-dock）に置く: 手番の見出し（席・ストリート・ポット・to call・残り）と
 * 1つ戻す、よく使う額、Fold to / Check to、3 つのボタン（フォールド / チェック・コール / ベット・レイズ）。
 * スマホは台を画面の下に固定し（親指の届く所。ボタンの位置が手番ごとに動かない）、上にボード・ログ・終了表示。
 */
export function ActionSection(props: {
  draft: Draft;
  setup: HandSetup | null;
  phase: Phase;
  mobile: boolean;
  onAction: (a: Action) => void;
  onActions: (a: readonly Action[]) => void;
  onUndo: () => void;
  onClear: () => void;
  onBoardAdd: (card: Card) => void;
  onBoardRemoveFrom: (i: number) => void;
}): JSX.Element {
  const { draft: d, phase } = props;

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

  const undo = (
    <button type="button" className="icon-btn ad-undo" aria-label="1つ戻す" disabled={d.actions.length === 0} onClick={props.onUndo}>
      <UndoIcon />
    </button>
  );
  const dock =
    phase.kind === 'act' ? (
      <ActDock key={d.actions.length} phase={phase} undo={undo} onAction={props.onAction} onActions={props.onActions} />
    ) : phase.kind === 'board' ? (
      <BoardDock draft={d} undo={undo} onOpen={openPicker} />
    ) : null;

  return (
    <section className={`pf-sec pf-actsec ${dock && props.mobile ? 'has-dock' : ''}`} aria-labelledby="pf-actions">
      <h2 id="pf-actions" className="sec-h">
        アクション入力
      </h2>
      {phase.kind === 'invalid' && (
        <p className="form-err">{d.players === null ? PLAYERS_REQUIRED : '基本設定の値が正しくありません'}</p>
      )}
      {/* PC は台をボードの上に置く（スマホは下に固定） */}
      {!props.mobile && dock}
      <Board draft={d} phase={phase} onOpen={openPicker} onRemoveFrom={props.onBoardRemoveFrom} />
      {props.setup && d.actions.length > 0 && <Log setup={props.setup} draft={d} />}
      {phase.kind === 'done' && <EndDisplay draft={d} phase={phase} />}
      {/* 1つ戻すは台の見出し（手番を入れている間）。終わった後もここから戻せるように置く */}
      <div className="btn-row pf-undo">
        {!dock && (
          <button type="button" className="btn ghost" disabled={d.actions.length === 0} onClick={props.onUndo}>
            1つ戻す
          </button>
        )}
        <button type="button" className="btn red" disabled={d.actions.length === 0 && d.board.length === 0} onClick={props.onClear}>
          すべて消す
        </button>
      </div>
      {props.mobile && dock}
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

/** 手番の見出し（席・ストリート・ポット・残り）と 1つ戻す。to call はコールのボタンに出す */
function DockHead(props: { pos?: Action['pos']; title: string; nums?: { pot: Mbb; stack: Mbb }; undo: JSX.Element }): JSX.Element {
  return (
    <div className="ad-head">
      <p className="ad-turn">
        {props.pos && (
          <b className="ad-pos" style={{ color: POS_VAR[props.pos] }}>
            {props.pos}
          </b>
        )}
        <span className="ad-street">{props.title}</span>
      </p>
      {props.nums && (
        <p className="ad-nums num">
          <span>
            <i className="mono-lbl">POT</i> {formatBb(props.nums.pot)}
          </span>
          <span>
            <i className="mono-lbl">残り</i> {formatBb(props.nums.stack)}
          </span>
        </p>
      )}
      {props.undo}
    </div>
  );
}

function ActDock(props: {
  phase: ActPhase;
  undo: JSX.Element;
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
  const info = turnInfo(state, pos);

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

  return (
    <div className="act-dock" role="group" aria-label="アクション">
      <DockHead pos={pos} title={STREET_NAME[state.street]} nums={info} undo={props.undo} />
      {range && (
        <div className="ad-chips" role="group" aria-label={raiseLabel ? 'レイズの額' : 'ベットの額'}>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`ad-chip ${p.allin ? 'allin' : ''}`}
              aria-pressed={to === p.to}
              onClick={() => setSize(formatBb(p.to))}
            >
              {p.allin ? (
                // 7 つ並んでも収まるよう 2 行に
                <b aria-label="オールイン">
                  オール
                  <br />
                  イン
                </b>
              ) : (
                <b>{p.label}</b>
              )}
              {!p.allin && p.label !== p.sub && <span className="num">{p.sub}</span>}
            </button>
          ))}
        </div>
      )}
      {(shortcuts.length > 0 || range) && (
        <div className="ad-row">
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
          {range && (
            <label className="ad-size">
              <span className="mono-lbl">{raiseLabel ? 'to' : 'bet'}</span>
              <input
                className="inp num"
                inputMode="decimal"
                autoComplete="off"
                aria-label={raiseLabel ? 'レイズの額（to。bb）' : 'ベットの額（bb）'}
                value={size}
                onChange={(e) => setSize(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') aggressive();
                }}
              />
            </label>
          )}
        </div>
      )}
      <div className="ad-btns">
        <button type="button" className="act-btn fold" disabled={!legal.fold} onClick={() => act('fold')}>
          フォールド
        </button>
        {legal.check ? (
          <button type="button" className="act-btn check" onClick={() => act('check')}>
            チェック
          </button>
        ) : (
          <button type="button" className="act-btn call" disabled={legal.call === null} onClick={() => act('call')}>
            コール{legal.call !== null && <span className="num"> {formatBb(legal.call)}</span>}
            {callAllin && <small>オールイン</small>}
          </button>
        )}
        <button type="button" className="act-btn s1" disabled={!range} onClick={aggressive}>
          {raiseLabel ? 'レイズ' : 'ベット'}
          {to !== null && <span className="num"> {formatBb(to)}</span>}
          {to !== null && range && to === range.max && <small>オールイン</small>}
        </button>
      </div>
    </div>
  );
}

/** ボードを待つ間の台: 「フロップのカード」＋開き直すボタン */
function BoardDock(props: { draft: Draft; undo: JSX.Element; onOpen: () => void }): JSX.Element {
  const street = cardStreet(props.draft.board.length);
  return (
    <div className="act-dock" role="group" aria-label="ボード">
      <DockHead title={`${STREET_NAME[street]}のカード`} undo={props.undo} />
      <div className="ad-btns one">
        <button type="button" className="btn ghost" onClick={props.onOpen}>
          {STREET_NAME[street]}のカードを選ぶ
        </button>
      </div>
    </div>
  );
}

const cardStreet = (i: number): Street => (i < 3 ? 'flop' : i === 3 ? 'turn' : 'river');

/** ボード 5 枠。必要になった枠の「＋」でピッカーを開く。カードを押すとそのカード以降を消す。 */
function Board(props: { draft: Draft; phase: Phase; onOpen: () => void; onRemoveFrom: (i: number) => void }): JSX.Element {
  const { draft: d, phase } = props;
  const next = d.board.length;
  const street = cardStreet(next);
  // まだ来ていないストリートのカード（1つ戻すで残ったもの）は薄く出す
  const reached =
    phase.kind === 'act' ? BOARD_COUNT[phase.state.street] : phase.kind === 'board' ? phase.need : phase.kind === 'done' ? phase.boardCount : 5;
  return (
    <div className="pf-board" role="group" aria-label="ボード">
      {[0, 1, 2, 3, 4].map((i) => {
        const card = d.board[i];
        if (card) {
          return (
            <button
              key={i}
              type="button"
              className={`pf-bslot filled ${i >= reached ? 'ahead' : ''}`}
              aria-label={`${cardText(card)}（このカード以降を消す）`}
              onClick={() => props.onRemoveFrom(i)}
            >
              <PlayingCard card={card} />
            </button>
          );
        }
        const addable = phase.kind === 'board' && i === next;
        return (
          <button
            key={i}
            type="button"
            className="pf-bslot"
            disabled={!addable}
            aria-label={addable ? `${STREET_NAME[street]}のカードを選ぶ` : '空き'}
            onClick={props.onOpen}
          >
            {addable ? '＋' : ''}
          </button>
        );
      })}
    </div>
  );
}

/** ストリートごとの列（見出し = ストリート名＋そのストリートのボード）。最新のアクションを強調。 */
function Log(props: { setup: HandSetup; draft: Draft }): JSX.Element {
  const items = actionLog(props.setup, props.draft.actions);
  const last = items.length - 1;
  const streets = STREETS.filter((s) => items.some((it) => it.street === s));
  const boardOf: Record<Street, Card[]> = {
    pf: [],
    flop: props.draft.board.slice(0, 3),
    turn: props.draft.board.slice(3, 4),
    river: props.draft.board.slice(4, 5),
  };
  return (
    <div className="pf-log">
      {streets.map((s) => (
        <div key={s} className="pf-log-col">
          <div className="pf-log-head">
            <span className="mono-lbl">{STREET_NAME[s]}</span>
            <span className="pf-log-board">
              {boardOf[s].map((c) => (
                <PlayingCard key={c} card={c} size="sm" />
              ))}
            </span>
          </div>
          <ol className="pf-log-list">
            {items
              .filter((it) => it.street === s)
              .map((it) => (
                <li key={it.index} className={it.index === last ? 'latest' : ''}>
                  {it.text}
                </li>
              ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** 終了表示: 「{席} ポット獲得」または「ショーダウン」（残った席のハンド、未入力は「マック」） */
function EndDisplay(props: { draft: Draft; phase: Extract<Phase, { kind: 'done' }> }): JSX.Element {
  const r = props.phase.result;
  return (
    <div className="pf-end">
      <span className="brk tl" />
      <span className="brk br" />
      {r.kind === 'over' ? (
        <p className="pf-end-title">
          <b style={{ color: POS_VAR[r.winner] }}>{r.winner}</b> ポット獲得
        </p>
      ) : (
        <>
          <p className="pf-end-title">ショーダウン</p>
          <ul className="pf-end-seats">
            {r.seats.map((p) => {
              const cards = handCards(props.draft.hands[p]);
              return (
                <li key={p}>
                  <b style={{ color: POS_VAR[p] }}>{p}</b>
                  {cards.length === 2 ? (
                    <span className="pf-end-cards">
                      {cards.map((c) => (
                        <PlayingCard key={c} card={c} size="sm" />
                      ))}
                    </span>
                  ) : (
                    <span className="pf-muck">マック</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
