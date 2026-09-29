import { POSITIONS, type Card, type Pos } from '@wwyd/core';
import type { OcrVerb } from '@wwyd/ocr';
import { useId, useRef, useState } from 'react';
import { ChipGroup } from '../components/ChipGroup.tsx';
import { PlayingCard } from '../components/PlayingCard.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { Select } from '../components/Select.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { useLayer } from '../components/useLayer.ts';
import { useIsMobile } from '../useMediaQuery.ts';
import { applyCardKey, handCards, type CardKey } from './cardInput.ts';
import { CardKeyboard } from './CardKeyboard.tsx';
import { CardPicker } from './CardPicker.tsx';
import { neighborSeat, STREET_NAME, type Draft } from './draft.ts';
import { evaluateReview, type Review, type ReviewRow } from './ocrDraft.ts';
import { HandButton } from './SetupSections.tsx';
import { ErrorList } from './SpotSection.tsx';
import { T4_GAME_ORDER, T4_GAMES, type T4Game } from './t4Games.ts';

/**
 * 読み取り結果の確認（06 章 §3.9）。OCR は 100% とは限らないので、画像と見比べて直してから反映する。
 * PC は左に画像・右に結果、スマホはタブ（結果 / 画像）。直せるのは T4 のゲーム・Hero・ハンド・ボード・アクション（動詞と額）。
 * アクションの席とストリートは再生で決まる（ocrDraft.ts）。画像の読み取りと席が合わない行・再生できない行は赤。
 * 画像は Object URL でメモリから表示するだけ（保存・送信しない。閉じたら呼び出し側が破棄する）。
 */

type EditRow = ReviewRow & { key: number; text: string };

const VERBS: readonly { value: OcrVerb; label: string }[] = [
  { value: 'fold', label: 'Fold' },
  { value: 'check', label: 'Check' },
  { value: 'call', label: 'Call' },
  { value: 'bet', label: 'Bet' },
  { value: 'raise', label: 'Raise' },
  { value: 'allin', label: 'All-in' },
];
const WITH_AMOUNT: ReadonlySet<OcrVerb> = new Set(['bet', 'raise', 'allin']);

const parseAmount = (t: string): number | null => (/^\d+(\.\d{1,3})?$/.test(t.trim()) ? Number(t.trim()) : null);

export function OcrReview(props: {
  initial: Review;
  imageUrl: string;
  base: Draft;
  onApply: (draft: Draft) => void;
  onCancel: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mobile = useIsMobile();
  const nextKey = useRef(props.initial.rows.length);
  const [tab, setTab] = useState<'result' | 'image'>('result');
  const [game, setGame] = useState<T4Game>(props.initial.game);
  const [hero, setHero] = useState<Pos>(props.initial.hero);
  const [hands, setHands] = useState(props.initial.hands);
  const [board, setBoard] = useState<Card[]>(props.initial.board);
  const [rows, setRows] = useState<EditRow[]>(() =>
    props.initial.rows.map((r, i) => ({ ...r, key: i, text: r.amount === null ? '' : String(r.amount) })),
  );
  const [seat, setSeat] = useState<Pos | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  useLayer(ref, props.onCancel, { trapFocus: true });

  const review: Review = { game, hero, hands, board, rows: rows.map((r) => ({ ...r, amount: parseAmount(r.text) })) };
  const ev = evaluateReview(props.base, review);

  const used = (exceptSeat?: Pos, exceptSlot?: number): Set<Card> => {
    const s = new Set<Card>();
    for (const p of POSITIONS) if (p !== exceptSeat) for (const c of handCards(hands[p])) s.add(c);
    board.forEach((c, i) => i !== exceptSlot && s.add(c));
    return s;
  };

  // 続けて速く押されても取りこぼさないよう、最新の状態に対して適用する
  const onKey = (key: CardKey): void => {
    if (!seat) return;
    setHands((cur) => {
      const s = new Set<Card>(board);
      for (const p of POSITIONS) if (p !== seat) for (const c of handCards(cur[p])) s.add(c);
      const r = applyCardKey(cur[seat], key, s);
      return r.hand === cur[seat] ? cur : { ...cur, [seat]: r.hand };
    });
  };

  const patchRow = (i: number, p: Partial<EditRow>): void => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const insertRow = (at: number): void => {
    const row: EditRow = { verb: 'fold', amount: null, readPos: null, readStreet: null, key: nextKey.current++, text: '' };
    setRows([...rows.slice(0, at), row, ...rows.slice(at)]);
  };

  const result = (
    <div className="ocr-rv-form">
      <section className="pf-sec">
        <h3 className="sec-h">T4 の Game</h3>
        <ChipGroup
          label="T4 の Game"
          variant="segment"
          items={T4_GAME_ORDER.map((g) => ({ value: g, label: `${T4_GAMES[g].label}（${T4_GAMES[g].capBb}bb cap）` }))}
          value={game}
          onChange={setGame}
        />
      </section>

      <section className="pf-sec">
        <h3 className="sec-h">Hand</h3>
        <div className="ocr-rv-hands" role="radiogroup" aria-label="Hero">
          {POSITIONS.map((p) => (
            <div key={p} className="ocr-rv-seat">
              <span className="ocr-rv-pos" style={{ color: POS_VAR[p] }}>
                {p}
              </span>
              <HandButton seat={p} hand={hands[p]} active={seat === p} onOpen={() => setSeat(p)} />
              <button
                type="button"
                role="radio"
                aria-checked={hero === p}
                aria-label={`Hero を ${p} にする`}
                className={`ocr-rv-hero ${hero === p ? 'on' : ''}`}
                onClick={() => setHero(p)}
              >
                HERO
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="pf-sec">
        <h3 className="sec-h">Board</h3>
        <div className="pf-board">
          {[0, 1, 2, 3, 4].map((i) => {
            const card = board[i];
            if (card) {
              return (
                <button key={i} type="button" className="pf-bslot filled" aria-label={`${i + 1}枚目を選び直す`} onClick={() => setSlot(i)}>
                  <PlayingCard card={card} />
                </button>
              );
            }
            const addable = i === board.length;
            return (
              <button
                key={i}
                type="button"
                className="pf-bslot"
                disabled={!addable}
                aria-label={addable ? `${i + 1}枚目を選ぶ` : '空き'}
                onClick={() => setSlot(i)}
              >
                {addable ? '＋' : ''}
              </button>
            );
          })}
          {board.length > 0 && (
            <button type="button" className="icon-btn ocr-rv-x" aria-label="最後の Card を消す" onClick={() => setBoard(board.slice(0, -1))}>
              ×
            </button>
          )}
        </div>
      </section>

      <section className="pf-sec">
        <h3 className="sec-h">Action</h3>
        <ol className="ocr-rv-rows">
          {rows.map((row, i) => {
            const v = ev.rows[i];
            const prev = i > 0 ? ev.rows[i - 1] : undefined;
            const header = v?.street && v.street !== prev?.street ? STREET_NAME[v.street] : null;
            return (
              <li key={row.key} className={`ocr-rv-row ${v?.ok ? '' : 'ng'} ${v?.mismatch ? 'mm' : ''}`}>
                {header && <span className="ocr-rv-street">{header}</span>}
                <span className="ocr-rv-no">{i + 1}</span>
                <span className="ocr-rv-actor" style={v?.pos && !v.mismatch ? { color: POS_VAR[v.pos] } : undefined}>
                  {v?.pos ?? '—'}
                </span>
                <Select label={`${i + 1}手目の Action`} options={VERBS} value={row.verb} onChange={(verb) => patchRow(i, { verb })} />
                {WITH_AMOUNT.has(row.verb) ? (
                  <label className="ocr-rv-amt">
                    <input
                      className="inp num"
                      autoComplete="off"
                      inputMode="decimal"
                      aria-label={`${i + 1}手目の額（bb）`}
                      value={row.text}
                      placeholder={row.verb === 'allin' ? 'All-in' : ''}
                      onChange={(e) => patchRow(i, { text: e.currentTarget.value })}
                    />
                    <span className="mono-lbl">bb</span>
                  </label>
                ) : (
                  <span />
                )}
                <button type="button" className="icon-btn" aria-label={`${i + 1}手目の下に行を足す`} onClick={() => insertRow(i + 1)}>
                  ＋
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${i + 1}手目を消す`}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn ghost auto" onClick={() => insertRow(rows.length)}>
          Action を足す
        </button>
      </section>

      <ErrorList errors={ev.issues} />
    </div>
  );

  const image = (
    <div className="ocr-rv-img">
      <img src={props.imageUrl} alt="読み込んだ画像" />
    </div>
  );

  return (
    <div ref={ref} className="ocr-rv" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="ocr-rv-head">
        <h2 id={titleId} className="ocr-rv-title">
          読み取り結果
        </h2>
        <div className="btn-row">
          <button type="button" className="btn ghost auto" onClick={props.onCancel}>
            やめる
          </button>
          <button type="button" className="btn auto" onClick={() => props.onApply(ev.draft)}>
            反映する
          </button>
        </div>
      </header>
      {mobile && (
        <Tabs
          label="表示"
          items={[
            { value: 'result', label: '結果' },
            { value: 'image', label: '画像' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      <div className="ocr-rv-body">
        {(!mobile || tab === 'image') && image}
        {(!mobile || tab === 'result') && result}
      </div>
      {seat && (
        <CardKeyboard
          seat={seat}
          onKey={onKey}
          onClose={() => setSeat(null)}
          onPrev={() => setSeat(neighborSeat(POSITIONS, seat, -1))}
          onNext={() => setSeat(neighborSeat(POSITIONS, seat, 1))}
        />
      )}
      {slot !== null && (
        <CardPicker
          title={`Board ${slot + 1}枚目`}
          used={used(undefined, slot)}
          onPick={(c) => {
            const next = [...board];
            next[slot] = c;
            setBoard(next);
            setSlot(null);
          }}
          onClose={() => setSlot(null)}
        />
      )}
    </div>
  );
}
