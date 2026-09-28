import type { Pos, Street } from '@wwyd/core';

/**
 * 本文（文字認識した全ストリートのテキスト）の解釈。流用元 `_parse_actions` の移植で、
 * **席の結び付けは行頭のポジションバッジを先に見る**（07 章 §2）。名前は、バッジが読めなかった行の
 * 受け皿としてだけ使い、呼び出し側のメモリの中に留める（結果には入れない。不変条件 6）。
 *
 * 本文の形（1 行 1 アクション。見出しは各ストリートの最初のアクションと同じ行に読まれる）:
 *
 *     Preflop (UTG Alice Fold
 *     HJ) Bob22 Raise 2bb
 *     Flop 6bb SB) NanashiCheck
 *     Result {BB Frank25 won 4.5bb
 */

export type OcrVerb = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export type OcrAction = {
  street: Street;
  /** 読めた席（読めなければ null。呼び出し側が再生の順番で補う） */
  pos: Pos | null;
  verb: OcrVerb;
  /** 画像に書かれた額（bb。ベット・レイズはそのストリートで「いくらまで」出したか）。無ければ null */
  amount: number | null;
};

export type BodyParse = {
  actions: OcrAction[];
  /** 見出しから拾った、めくられたストリート（ボードのチップとの突き合わせ用） */
  boardStreets: Street[];
};

const POSITIONS_6MAX: readonly Pos[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** バッジの定番の誤読（流用元の表に、tesseract.js で見つかったものを足す） */
const POSITION_FIXES: Readonly<Record<string, Pos>> = {
  BIN: 'BTN',
  BTIN: 'BTN',
  '8TN': 'BTN',
  EIN: 'BTN',
  '8IN': 'BTN',
  'H)': 'HJ',
  H1: 'HJ',
  'H]': 'HJ',
  CQ: 'CO',
  GO: 'CO',
  C0: 'CO',
  OY: 'CO',
  '€O': 'CO',
  '58': 'SB',
  '5B': 'SB',
  S8: 'SB',
  UTS: 'UTG',
  '8B': 'BB',
  BE: 'BB',
  BBY: 'BB',
  '8E': 'BB',
  '88': 'BB',
  B8: 'BB',
};

type Heading = Street | 'showdown' | 'result' | 'allinEv' | 'rake';

/** 行頭の見出し。後ろに英字が続くものは見出しではない（`flopsy` のような名前の行で切り替えない） */
const HEADINGS: ReadonlyArray<readonly [string, Heading]> = [
  ['preflop', 'pf'],
  ['flop', 'flop'],
  ['turn', 'turn'],
  ['river', 'river'],
  ['showdown', 'showdown'],
  ['sd', 'showdown'],
  ['result', 'result'],
  ['all-in ev', 'allinEv'],
  ['allin ev', 'allinEv'],
  ['rake', 'rake'],
];

/** 動詞。**行の中でいちばん右**のものを採る（名前に Call や Bet が入っていても、動詞は名前の後ろにある） */
const VERB_RE = /(all[\s-]?in|fold|check|call|bet|raise)/gi;

/** 額。小文字の bb だけ（大文字の BB はポジションのバッジ） */
const AMOUNT_RE = /(\d+(?:\.\d+)?)\s?bb/;

/** difflib の SequenceMatcher.ratio と同じ考え方の類似度（一致した文字数 × 2 ÷ 両方の長さ）。 */
export function similarity(a: string, b: string): number {
  if (a.length + b.length === 0) return 1;
  return (2 * matchingChars(a, b)) / (a.length + b.length);
}

function matchingChars(a: string, b: string): number {
  // 最長の共通部分文字列を取り、その左右を再帰的に数える（difflib の matching blocks）
  let bestLen = 0;
  let bestA = 0;
  let bestB = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > bestLen) {
        bestLen = k;
        bestA = i;
        bestB = j;
      }
    }
  }
  if (bestLen === 0) return 0;
  return (
    bestLen +
    matchingChars(a.slice(0, bestA), b.slice(0, bestB)) +
    matchingChars(a.slice(bestA + bestLen), b.slice(bestB + bestLen))
  );
}

/** バッジの文字列を席に正規化する。候補に無ければ null。 */
export function fuzzyPosition(raw: string): Pos | null {
  const t = raw.toUpperCase().trim().replace(/[:.]+$/, '');
  if (t === '') return null;
  if ((POSITIONS_6MAX as readonly string[]).includes(t)) return t as Pos;
  const fixed = POSITION_FIXES[t];
  if (fixed) return fixed;
  let best: Pos | null = null;
  let bestScore = 0.5; // 流用元と同じ下限（get_close_matches の cutoff）
  for (const p of POSITIONS_6MAX) {
    const s = similarity(t, p);
    if (s >= bestScore && (best === null || s > bestScore)) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

/** 行頭のバッジ。`'BIN) Somebody Fold'` → `'BTN'`。読めなければ null。 */
export function leadingPosition(line: string): Pos | null {
  const head = line.trim().split(/\s+/)[0] ?? '';
  const t = head.replace(/^[()[\]{}|:.,]+|[()[\]{}|:.,]+$/g, '');
  if (t === '' || t.length > 5) return null;
  return fuzzyPosition(t);
}

/** 見出しの行を（見出し, 残り）に分ける。見出しの直後の額（そのストリートのポット）は捨てる。 */
export function splitHeading(line: string): { heading: Heading | null; rest: string } {
  const trimmed = line.trim();
  const low = trimmed.toLowerCase();
  for (const [marker, heading] of HEADINGS) {
    if (!low.startsWith(marker)) continue;
    const after = trimmed.slice(marker.length);
    if (after !== '' && /^[a-z]/i.test(after)) continue;
    const rest = after.replace(/^[:\s]*\d+(?:\.\d+)?\s*bb\b/i, '');
    return { heading, rest: rest.trim() };
  }
  return { heading: null, rest: trimmed };
}

function verbOf(word: string): OcrVerb {
  const w = word.toLowerCase().replace(/[\s-]/g, '');
  return w === 'allin' ? 'allin' : (w as OcrVerb);
}

/** 行の中でいちばん右の動詞と、その後ろの位置。 */
function lastVerb(line: string): { verb: OcrVerb; start: number; end: number } | null {
  let found: { verb: OcrVerb; start: number; end: number } | null = null;
  for (const m of line.matchAll(VERB_RE)) {
    found = { verb: verbOf(m[0]), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
  }
  return found;
}

/** 末尾にくっついた動詞を剥がす（`NanashiiFold` → `Nanashii`）。 */
function stripTrailingVerb(word: string): string | null {
  const m = /(all[\s-]?in|fold|check|call|bet|raise)$/i.exec(word);
  return m && m.index > 0 ? word.slice(0, m.index) : null;
}

/** 名前で席を探す（バッジが読めなかった行の受け皿）。 */
function positionByName(line: string, names: ReadonlyMap<Pos, string>): Pos | null {
  const low = line.toLowerCase();
  for (const [pos, name] of names) {
    if (name.length >= 2 && low.includes(name.toLowerCase())) return pos;
  }
  let best: Pos | null = null;
  let bestScore = 0.75;
  for (const word of line.split(/\s+/)) {
    const candidates = [word];
    const stripped = stripTrailingVerb(word);
    if (stripped) candidates.push(stripped);
    for (const c of candidates) {
      for (const [pos, name] of names) {
        if (name.length < 2) continue;
        const s = similarity(c.toLowerCase(), name.toLowerCase());
        if (s >= bestScore && (best === null || s > bestScore)) {
          best = pos;
          bestScore = s;
        }
      }
    }
  }
  return best;
}

/**
 * 本文を行ごとに解釈する。`names` は席ごとの名前（プレイヤー行から読んだもの。メモリの中だけで使う）。
 * 見出し（Preflop / Flop / Turn / River / SD / Result …）でストリートを切り替え、SD 以降は読まない。
 */
export function parseBody(text: string, names: ReadonlyMap<Pos, string> = new Map()): BodyParse {
  const actions: OcrAction[] = [];
  const boardStreets: Street[] = [];
  let section: Heading = 'pf';
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const { heading, rest } = splitHeading(raw);
    if (heading) {
      section = heading;
      if ((heading === 'flop' || heading === 'turn' || heading === 'river') && !boardStreets.includes(heading)) {
        boardStreets.push(heading);
      }
    }
    if (section !== 'pf' && section !== 'flop' && section !== 'turn' && section !== 'river') continue;
    const line = rest;
    const v = lastVerb(line);
    if (!v) continue;
    // 先頭の語がプレイヤー名そのものならバッジが落ちている（`Bob` を BB と読まない）
    const head = (line.split(/\s+/)[0] ?? '').toLowerCase();
    const headIsName = [...names.values()].some((n) => n.toLowerCase() === head);
    const pos = (headIsName ? null : leadingPosition(line)) ?? positionByName(line.slice(0, v.start), names);
    const m = AMOUNT_RE.exec(line.slice(v.end));
    actions.push({ street: section, pos, verb: v.verb, amount: m ? Number(m[1]) : null });
  }
  return { actions, boardStreets };
}
