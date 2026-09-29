import { RANKS, SUITS, type Card } from '@wwyd/core';
import { Modal } from '../components/Modal.tsx';
import { cardText, PlayingCard } from '../components/PlayingCard.tsx';

/**
 * ボードのカードピッカー（06 章 §3.6）。13 × 4、使用済みは非活性。
 * 見出しは入力中のストリートと枚数（例「フロップ 2/3」）。
 */
export function CardPicker(props: {
  title: string;
  used: ReadonlySet<Card>;
  onPick: (card: Card) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <Modal title={props.title} tone="info" wide onClose={props.onClose}>
      <div className="picker" role="grid" aria-label="Card">
        {[...SUITS].map((s) => (
          <div key={s} className="picker-row" role="row">
            {[...RANKS].map((r) => {
              const card = r + s;
              const used = props.used.has(card);
              return (
                <button
                  key={card}
                  type="button"
                  role="gridcell"
                  className="picker-cell"
                  // 札の span の aria-label は読み上げに使われないので、ボタンに名前を付ける
                  aria-label={cardText(card)}
                  disabled={used}
                  aria-disabled={used}
                  onClick={() => props.onPick(card)}
                >
                  <PlayingCard card={card} size="sm" />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}
