import { POSITIONS, type Card, type Pos, type Street } from '@wwyd/core';
import { parseBody, type OcrAction } from './bodyText.ts';
import { crop, invert, type RgbaImage } from './image.ts';
import {
  BASE_W,
  bodyBox,
  heroRowIndex,
  maskBoardChips,
  nameBox,
  PLAYER_ROWS_Y,
  readBoardRows,
  readRowCards,
  rowHasContent,
} from './vision.ts';

/**
 * T4 のハンドヒストリー画像を読む（07 章）。画素で読める所（カード・ボード・Hero の行）は自前で、
 * 本文とプレイヤー名は `reader`（文字認識のエンジン。アプリは tesseract.js を渡す）で読む。
 *
 * **結果にプレイヤー名を入れない**（不変条件 6）。名前は本文の行を席に結び付ける受け皿としてだけ、
 * この関数の中で使って捨てる。
 */

/** `line` は 1 行（プレイヤー名）、`block` は複数行の段落（本文） */
export type TextMode = 'line' | 'block';
export type TextReader = (image: RgbaImage, mode: TextMode) => Promise<string>;

/**
 * 文字認識のエンジン（Tesseract）に渡す設定。流用元と同じく、名前の行は 1 行（PSM 7）、本文は段落（PSM 6）。
 * ブラウザ（アプリ）と手元の精度測定（scripts/ocr/accuracy.mts）の両方がこれを使う。
 */
export const TESSERACT_PARAMS: Record<TextMode, Record<string, string>> = {
  line: { tessedit_pageseg_mode: '7' },
  block: { tessedit_pageseg_mode: '6' },
};

/** 読めなかった所（名前は入れない）。画面はこれを見て「読めたところまで」を伝える */
export type OcrProblem =
  | { code: 'unexpected_width'; width: number }
  | { code: 'not_six_players'; rows: number }
  | { code: 'hero_unknown' }
  | { code: 'hand_unread'; pos: Pos }
  | { code: 'board_unread'; street: Street }
  | { code: 'board_mismatch' };

export type OcrResult = {
  /** Hero の席（太字の行）。特定できなければ null */
  hero: Pos | null;
  /** 席ごとのハンド（2 枚とも読めた席だけ）。T4 は全員のハンドを載せる */
  hands: Partial<Record<Pos, [Card, Card]>>;
  /** ボード（フロップ 3 枚・ターン・リバーの順。読めたところまで） */
  board: Card[];
  /** 本文のアクション（画像の順） */
  actions: OcrAction[];
  problems: OcrProblem[];
};

const BOARD_STREETS: readonly Street[] = ['flop', 'turn', 'river'];
const BOARD_EXPECTED = [3, 1, 1] as const;

export async function readHandHistory(image: RgbaImage, reader: TextReader): Promise<OcrResult> {
  const problems: OcrProblem[] = [];
  if (image.width !== BASE_W) problems.push({ code: 'unexpected_width', width: image.width });

  // ---- プレイヤー行（T4 の 6max は常に上から UTG, HJ, CO, BTN, SB, BB） ----
  const rows = PLAYER_ROWS_Y.filter((y) => rowHasContent(image, y));
  if (rows.length !== POSITIONS.length) {
    problems.push({ code: 'not_six_players', rows: rows.length });
    return { hero: null, hands: {}, board: [], actions: [], problems };
  }

  const heroIndex = heroRowIndex(image, rows);
  const hero = heroIndex === null ? null : (POSITIONS[heroIndex] as Pos);
  if (hero === null) problems.push({ code: 'hero_unknown' });

  const hands: Partial<Record<Pos, [Card, Card]>> = {};
  POSITIONS.forEach((pos, i) => {
    const [a, b] = readRowCards(image, rows[i] as number);
    if (a?.rank && b?.rank) hands[pos] = [a.rank + a.suit, b.rank + b.suit];
    else problems.push({ code: 'hand_unread', pos });
  });

  // ---- ボード ----
  const board: Card[] = [];
  const boardRows = readBoardRows(image);
  for (let i = 0; i < Math.min(boardRows.length, BOARD_STREETS.length); i++) {
    const cards = boardRows[i] as { rank: string | null; suit: string }[];
    if (cards.length !== BOARD_EXPECTED[i] || cards.some((c) => c.rank === null)) {
      problems.push({ code: 'board_unread', street: BOARD_STREETS[i] as Street });
      break;
    }
    for (const c of cards) board.push(`${c.rank}${c.suit}`);
  }

  // ---- 名前（メモリの中だけ）と本文 ----
  const names = new Map<Pos, string>();
  for (let i = 0; i < POSITIONS.length; i++) {
    const text = await reader(invert(crop(image, nameBox(image, rows[i] as number))), 'line');
    const name = text.trim();
    if (name !== '') names.set(POSITIONS[i] as Pos, name);
  }
  const body = invert(crop(maskBoardChips(image), bodyBox(image)));
  const parsed = parseBody(await reader(body, 'block'), names);
  names.clear();

  const chipStreets = BOARD_STREETS.slice(0, boardRows.length);
  if (parsed.boardStreets.join() !== chipStreets.join()) problems.push({ code: 'board_mismatch' });

  return { hero, hands, board, actions: parsed.actions, problems };
}
