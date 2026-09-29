import { RANKS, SUITS, type Card } from '@wwyd/core';
import { useEffect, useRef } from 'react';
import { Modal } from '../components/Modal.tsx';
import { cardText, PlayingCard } from '../components/PlayingCard.tsx';
import { applyCardKey, handCards, keyFromKeyboard, pickCard } from './cardInput.ts';

/**
 * PC のハンドのカード選択ボード（06 章 §3.5。2026-09-29 さつき: PC はスマホ用のキーボードではなくボードで選ぶ）。
 * 上に選んだ 2 枚、下に 4 段 × 13 列（♠ ♥ ♦ ♣ × A〜2）の札。ほかの席とボードで使った札は押せない。
 * 札を押すと足す（選んである札は外す。2 枚そろっていれば 2 枚目を置き換える）。
 * 2 枚そろうと次の空の席へ進む（`onFilled`）。パソコンのキーでも打てる（`A` `s` の順。Backspace で 1 文字、Delete で全部消す）。
 * ← → で前後の席、Enter で閉じる。
 */
export function HandPicker(props: {
  seat: string;
  hand: string;
  /** ほかの席のハンドとボードの札 */
  used: ReadonlySet<Card>;
  onChange: (hand: string) => void;
  /** 2 枚そろったとき（親は次の空の席へ進める。17 章） */
  onFilled?: () => void;
  /** 使用済みの札をキーで打ったとき */
  onUsed: (card: Card) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}): JSX.Element {
  const selected = handCards(props.hand);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const p = live.current;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        (e.key === 'ArrowLeft' ? p.onPrev : p.onNext)();
        return;
      }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        p.onClose();
        return;
      }
      const k = keyFromKeyboard(e.key);
      if (!k) return;
      e.preventDefault();
      const r = applyCardKey(p.hand, k, p.used);
      if (r.used) p.onUsed(r.used);
      if (r.hand !== p.hand) change(p, r.hand);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const footer = (
    <div className="hp-foot">
      <span className="hp-nav">
        <button type="button" className="btn ghost auto" aria-label="前の席" onClick={props.onPrev}>
          ←
        </button>
        <button type="button" className="btn ghost auto" aria-label="次の席" onClick={props.onNext}>
          →
        </button>
      </span>
      <button type="button" className="btn ghost auto" disabled={props.hand === ''} onClick={() => props.onChange('')}>
        消す
      </button>
      <button type="button" className="btn auto" onClick={props.onClose}>
        完了
      </button>
    </div>
  );

  return (
    <Modal title={`${props.seat} の Hand`} tone="info" wide onClose={props.onClose} footer={footer}>
      <div className="hp" data-seat-picker={props.seat}>
        <div className="hp-slots" aria-label="選んだ Card">
          {[0, 1].map((i) => {
            const c = selected[i];
            return c ? (
              <button
                key={i}
                type="button"
                className="hp-slot"
                aria-label={`${cardText(c)} を外す`}
                onClick={() => change(props, pickCard(props.hand, c))}
              >
                <PlayingCard card={c} size="big" />
              </button>
            ) : (
              <span key={i} className="hp-slot empty" aria-hidden="true" />
            );
          })}
        </div>
        <div className="picker hp-grid" role="grid" aria-label="Card">
          {[...SUITS].map((s) => (
            <div key={s} className="picker-row" role="row">
              {[...RANKS].map((r) => {
                const card = r + s;
                const used = props.used.has(card);
                const on = selected.includes(card);
                return (
                  <button
                    key={card}
                    type="button"
                    role="gridcell"
                    className={`picker-cell${on ? ' on' : ''}`}
                    aria-label={cardText(card)}
                    aria-selected={on}
                    disabled={used}
                    onClick={() => change(props, pickCard(props.hand, card))}
                  >
                    <PlayingCard card={card} size="sm" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** ハンドを変え、1 枚以下から 2 枚になったら `onFilled` を呼ぶ */
function change(p: { hand: string; onChange: (hand: string) => void; onFilled?: () => void }, next: string): void {
  p.onChange(next);
  if (handCards(next).length === 2 && handCards(p.hand).length < 2) p.onFilled?.();
}
