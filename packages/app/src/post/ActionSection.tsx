import { formatBb, STREETS, type Action, type Card, type HandSetup, type Mbb, type Street } from '@wwyd/core';
import { useState } from 'react';
import { PlayingCard, cardText } from '../components/PlayingCard.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { useToast } from '../components/Toast.tsx';
import { handCards } from './cardInput.ts';
import { CardPicker } from './CardPicker.tsx';
import { actionLog, defaultAmount, parseSize, STREET_NAME, statusLine, usedCards, type Draft, type Phase } from './draft.ts';

/**
 * アクション入力（06 章 §3.6）: 状況行・ボタン・額・ボード・1つ戻す / すべて消す・ログ・終了表示。
 */
export function ActionSection(props: {
  draft: Draft;
  setup: HandSetup | null;
  phase: Phase;
  onAction: (a: Action) => void;
  onUndo: () => void;
  onClear: () => void;
  onBoardAdd: (card: Card) => void;
  onBoardRemoveFrom: (i: number) => void;
}): JSX.Element {
  const { draft: d, phase } = props;
  return (
    <section className="pf-sec" aria-labelledby="pf-actions">
      <h2 id="pf-actions" className="sec-h">
        アクション入力
      </h2>
      {phase.kind === 'invalid' && <p className="form-err">基本設定の値が正しくありません</p>}
      {phase.kind === 'act' && <ActPanel key={d.actions.length} phase={phase} onAction={props.onAction} />}
      <Board draft={d} phase={phase} onAdd={props.onBoardAdd} onRemoveFrom={props.onBoardRemoveFrom} />
      <div className="btn-row pf-undo">
        <button type="button" className="btn ghost" disabled={d.actions.length === 0} onClick={props.onUndo}>
          1つ戻す
        </button>
        <button type="button" className="btn red" disabled={d.actions.length === 0 && d.board.length === 0} onClick={props.onClear}>
          すべて消す
        </button>
      </div>
      {props.setup && d.actions.length > 0 && <Log setup={props.setup} draft={d} />}
      {phase.kind === 'done' && <EndDisplay draft={d} phase={phase} />}
    </section>
  );
}

function ActPanel(props: { phase: Extract<Phase, { kind: 'act' }>; onAction: (a: Action) => void }): JSX.Element {
  const { state, pos, legal } = props.phase;
  const toast = useToast();
  const range = legal.bet ?? legal.raise;
  const [size, setSize] = useState(() => (range ? formatBb(defaultAmount(state, pos, range)) : ''));
  const act = (type: Action['type'], to?: Mbb): void =>
    props.onAction(to === undefined ? { street: state.street, pos, type } : { street: state.street, pos, type, to });

  const sized = (type: 'bet' | 'raise'): void => {
    if (!range) return;
    const to = parseSize(size, range);
    if (to === null) {
      toast(`${formatBb(range.min)}〜${formatBb(range.max)}bb`);
      return;
    }
    act(type, to);
  };

  return (
    <div className="pf-act">
      <p className="pf-status num">
        <b style={{ color: POS_VAR[pos] }}>{pos}</b>
        {statusLine(state, pos).slice(pos.length)}
      </p>
      <div className="pf-act-btns">
        <button type="button" className="act-btn fold" disabled={!legal.fold} onClick={() => act('fold')}>
          フォールド
        </button>
        <button type="button" className="act-btn check" disabled={!legal.check} onClick={() => act('check')}>
          チェック
        </button>
        <button type="button" className="act-btn call" disabled={legal.call === null} onClick={() => act('call')}>
          コール{legal.call !== null && <span className="num"> {formatBb(legal.call)}</span>}
        </button>
        <button type="button" className="act-btn s1" disabled={!legal.bet} onClick={() => sized('bet')}>
          ベット
        </button>
        <button type="button" className="act-btn s1" disabled={!legal.raise} onClick={() => sized('raise')}>
          レイズ
        </button>
      </div>
      {range && (
        <div className="pf-size">
          <label className="mono-lbl" htmlFor="pf-size-inp">
            {legal.bet ? 'ベット' : 'レイズ to'}
          </label>
          <input
            id="pf-size-inp"
            className="inp num"
            inputMode="decimal"
            autoComplete="off"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sized(legal.bet ? 'bet' : 'raise');
            }}
          />
          <span className="pf-range num">
            {formatBb(range.min)}〜{formatBb(range.max)}bb
          </span>
        </div>
      )}
    </div>
  );
}

const cardStreet = (i: number): Street => (i < 3 ? 'flop' : i === 3 ? 'turn' : 'river');

/** ボード 5 枠。必要になった枠の「＋」でピッカー（ストリートが終わったら自動で開き、揃うまで続けて開く）。 */
function Board(props: {
  draft: Draft;
  phase: Phase;
  onAdd: (card: Card) => void;
  onRemoveFrom: (i: number) => void;
}): JSX.Element {
  const { draft: d, phase } = props;
  const needKey = phase.kind === 'board' ? `${d.actions.length}:${phase.need}` : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const open = needKey !== null && (manual || dismissed !== needKey);
  const next = d.board.length;
  const street = cardStreet(next);
  const nth = street === 'flop' ? `${next + 1}/3` : '';

  return (
    <div className="pf-board" role="group" aria-label="ボード">
      {[0, 1, 2, 3, 4].map((i) => {
        const card = d.board[i];
        if (card) {
          return (
            <button
              key={i}
              type="button"
              className="pf-bslot filled"
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
            onClick={() => setManual(true)}
          >
            {addable ? '＋' : ''}
          </button>
        );
      })}
      {open && (
        <CardPicker
          title={`${STREET_NAME[street]} ${nth}`.trim()}
          used={usedCards(d)}
          onPick={props.onAdd}
          onClose={() => {
            setManual(false);
            setDismissed(needKey);
          }}
        />
      )}
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
