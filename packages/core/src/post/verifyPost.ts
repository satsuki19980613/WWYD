/**
 * 投稿の検証と派生メタの再計算（詳細仕様 03 章 §3.2 の 3〜7）。
 * Edge Function `create-post` はこの結果（サーバーが計算した値）を保存する。クライアントも送信前に同じ処理を行う。
 */
import type { Pos } from '../constants.ts';
import { findDuplicateCard, type Card } from '../cards.ts';
import { fail } from '../errors.ts';
import { replay, type HandResult } from '../poker/replay.ts';
import { hasPreflopAllin, spotCandidates, spotView, type Derived } from '../poker/spot.ts';
import type { PostInput } from './validateInput.ts';

/** 保存する known_cards。ショーダウンでカードが無い席は `'muck'`。 */
export type KnownCards = Partial<Record<Pos, [Card, Card] | 'muck'>>;

export type VerifiedPost = Omit<PostInput, 'derived' | 'knownCards'> & {
  /** サーバーで再計算した派生メタ（クライアントの値ではない）。 */
  derived: Derived;
  knownCards: KnownCards;
  result: HandResult;
};

function sameDerived(a: Derived, b: Derived): boolean {
  return (
    a.street === b.street &&
    a.keys.length === b.keys.length &&
    a.keys.every((k, i) => k === b.keys[i]) &&
    a.s1Label === b.s1Label &&
    a.minTo === b.minTo &&
    a.maxTo === b.maxTo &&
    a.potBase === b.potBase &&
    a.effectiveStack === b.effectiveStack &&
    a.stopIndex === b.stopIndex
  );
}

export function verifyPost(input: PostInput): VerifiedPost {
  // 3. カードの重複（Hero・known_cards・ボード）
  const cards: Card[] = [...input.heroCards, ...Object.values(input.knownCards).flat(), ...input.board];
  if (findDuplicateCard(cards)) fail('duplicate_card');

  // 4. 再生
  const r = replay(input.setup, input.actions, input.board.length);

  // Preflop でだれかが All-in になったハンドは投稿できない（Hero でもほかの席でも。2026-09-29 さつき）
  if (hasPreflopAllin(input.setup, input.actions)) fail('preflop_allin');
  // Flop 以降に Hero の手番が無い（Hero の Preflop の Fold、Preflop で終わった）ハンドは投稿できない
  if (spotCandidates(input.actions, input.hero).length === 0) fail('no_spot');

  // 5〜6. スポットと派生メタの再計算・照合（金額は mbb の整数で比較）
  const view = spotView(input.setup, input.actions, input.hero, input.spotIndex);
  if (!sameDerived(view.derived, input.derived)) fail('derived_mismatch');

  // 7. ショーダウンに残った Hero 以外の席でカードが無ければマック
  const knownCards: KnownCards = { ...input.knownCards };
  if (r.result.kind === 'showdown') {
    for (const p of r.result.seats) if (p !== input.hero && !knownCards[p]) knownCards[p] = 'muck';
  }

  return { ...input, derived: view.derived, knownCards, result: r.result };
}
