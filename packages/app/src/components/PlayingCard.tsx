import type { Card } from '@wwyd/core';

const SUIT: Record<string, { sym: string; cls: string; name: string }> = {
  s: { sym: '♠', cls: '', name: 'スペード' },
  h: { sym: '♥', cls: 'red', name: 'ハート' },
  d: { sym: '♦', cls: 'blue', name: 'ダイヤ' },
  c: { sym: '♣', cls: 'green', name: 'クラブ' },
};

/** 表示用の「K♦」（トースト等の文字列）。 */
export function cardText(card: Card): string {
  return card.charAt(0) + (SUIT[card.charAt(1)]?.sym ?? '');
}

/**
 * 札（ICMCLEC の `.card` と同じ見た目。4 色デッキ ♠黒 ♥赤 ♦青 ♣緑）。
 * `rank` だけのときはスート未確定の「K?」。
 */
export function PlayingCard(props: { card?: Card; rank?: string; size?: 'sm' | 'md' | 'big' }): JSX.Element {
  const size = props.size && props.size !== 'md' ? ` ${props.size}` : '';
  if (!props.card) {
    return (
      <span className={`pcard pending${size}`} aria-label={`${props.rank ?? ''} スート未確定`}>
        {props.rank}
        <em>?</em>
      </span>
    );
  }
  const suit = SUIT[props.card.charAt(1)];
  return (
    <span className={`pcard ${suit?.cls ?? ''}${size}`} aria-label={`${suit?.name ?? ''}の${props.card.charAt(0)}`}>
      {props.card.charAt(0)}
      <em aria-hidden="true">{suit?.sym}</em>
    </span>
  );
}
