/**
 * 規約ページ用の小さな Markdown の解釈（06 章 §6.2。同梱の Markdown だけを読む）。
 * 対応: 見出し（# 〜 ####）、段落、箇条書き・番号付きリスト（2 段まで）、表、区切り線、太字、リンク、`コード`。
 * 段落の中の改行はそのまま改行にする（「施行日:」「運営者:」のような行を 1 行に詰めない）。
 * HTML は解釈しない（文字としてそのまま出す）。描画は React の要素で行う（LegalScreen）。
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'br' }
  | { t: 'strong'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] };

export type ListItem = { c: Inline[]; sub: Block | null };

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: 'para'; c: Inline[] }
  | { t: 'list'; ordered: boolean; items: ListItem[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

type InlineMatch = { node: Inline; end: number };

/** `**太字**`（閉じていなければ null） */
function strongAt(s: string, i: number): InlineMatch | null {
  if (!s.startsWith('**', i)) return null;
  const end = s.indexOf('**', i + 2);
  if (end <= i + 2) return null;
  return { node: { t: 'strong', c: parseInline(s.slice(i + 2, end)) }, end: end + 2 };
}

/** `` `コード` ``（閉じていなければ null） */
function codeAt(s: string, i: number): InlineMatch | null {
  if (s[i] !== '`') return null;
  const end = s.indexOf('`', i + 1);
  if (end <= i + 1) return null;
  return { node: { t: 'code', v: s.slice(i + 1, end) }, end: end + 1 };
}

/** `[文字](URL)`（形になっていなければ null） */
function linkAt(s: string, i: number): InlineMatch | null {
  if (s[i] !== '[') return null;
  const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(s.slice(i));
  if (!m) return null;
  return { node: { t: 'link', href: m[2] as string, c: parseInline(m[1] as string) }, end: i + m[0].length };
}

/** 行内: `**太字**`・`[文字](URL)`・`` `コード` ``。閉じていない記号は文字のまま。 */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  let i = 0;
  while (i < s.length) {
    const m = strongAt(s, i) ?? codeAt(s, i) ?? linkAt(s, i);
    if (m) {
      if (text) out.push({ t: 'text', v: text });
      text = '';
      out.push(m.node);
      i = m.end;
      continue;
    }
    text += s[i];
    i++;
  }
  if (text) out.push({ t: 'text', v: text });
  return out;
}

// 行の解釈は正規表現の後戻りで遅くならないよう、文字を順に見て行う（行は改行で分けたあとの 1 行）

/** 1 行の中に置けない改行の文字（正規表現の `.` が当たらない文字） */
const LINE_BREAK = /[\r\u2028\u2029]/;

/** 先頭の空白を除いた残り（空白が 1 つも無ければ null）。`\s+(.*)$` と同じ */
function afterSpaces(rest: string): string | null {
  const text = rest.trimStart();
  if (text.length === rest.length || LINE_BREAK.test(text)) return null;
  return text;
}

/** 見出し: `#`〜`####` と空白で始まる行 */
export function headingOf(line: string): { level: 1 | 2 | 3 | 4; text: string } | null {
  let n = 0;
  while (line[n] === '#') n++;
  if (n < 1 || n > 4) return null;
  const text = afterSpaces(line.slice(n));
  return text === null ? null : { level: n as 1 | 2 | 3 | 4, text };
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

/** リストの項目: 字下げ、記号（`-`・`*`・`1.`・`1)`）、空白、本文 */
export function itemOf(line: string): { marker: string; text: string } | null {
  const body = line.trimStart();
  let n = 0;
  if (body.startsWith('-') || body.startsWith('*')) n = 1;
  else {
    while (isDigit(body[n])) n++;
    if (n === 0 || (body[n] !== '.' && body[n] !== ')')) return null;
    n++;
  }
  const text = afterSpaces(body.slice(n));
  return text === null ? null : { marker: body.slice(0, n), text };
}

/** 区切り線: 同じ記号（`-`・`*`・`_`）が 3 つ以上（後ろの空白は許す） */
export function isHr(line: string): boolean {
  const t = line.trimEnd();
  const c = t[0];
  return t.length >= 3 && (c === '-' || c === '*' || c === '_') && [...t].every((x) => x === c);
}

/** 表の見出しの下の区切りの 1 マス（`---`・`:--`・`--:`・`:-:`。前後の空白は許す） */
function isSepCell(cell: string): boolean {
  let t = cell.trim();
  if (t.startsWith(':')) t = t.slice(1);
  if (t.endsWith(':')) t = t.slice(0, -1);
  return t.length >= 2 && [...t].every((x) => x === '-');
}

/** 表の見出しの下の区切りの行（`|---|:--:|`。両端の `|` は省ける） */
export function isTableSep(line: string): boolean {
  let t = line.startsWith('|') ? line.slice(1) : line;
  t = t.trimEnd();
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').every(isSepCell);
}

function cells(line: string): Inline[][] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => parseInline(c.trim()));
}

/** 段落の終わり（空行・見出し・リスト・表・区切り線） */
function endsPara(l: string): boolean {
  return l.trim() === '' || headingOf(l) !== null || itemOf(l) !== null || isHr(l.trim()) || l.trim().startsWith('|');
}

/** 表（見出しの行と区切りの行のあと、`|` で始まる行が続く間） */
function parseTable(lines: readonly string[], start: number): [Block, number] {
  const head = cells(lines[start] as string);
  const rows: Inline[][][] = [];
  let i = start + 2;
  while (i < lines.length && (lines[i] as string).trim().startsWith('|')) rows.push(cells(lines[i++] as string));
  return [{ t: 'table', head, rows }, i];
}

/** 段落: 空行・見出し・リスト・表・区切り線の手前まで。行の区切りは改行にする */
function parsePara(lines: readonly string[], start: number): [Block, number] {
  const para: string[] = [];
  let i = start;
  while (i < lines.length && !endsPara(lines[i] as string)) {
    para.push((lines[i] as string).trim());
    i++;
  }
  return [{ t: 'para', c: para.flatMap((l, k) => (k === 0 ? parseInline(l) : [{ t: 'br' } as const, ...parseInline(l)])) }, i];
}

/** `start` の行から始まるブロックを 1 つ読む（空でない行） */
function parseBlock(lines: readonly string[], start: number): [Block, number] {
  const line = lines[start] as string;
  const h = headingOf(line);
  if (h) return [{ t: 'heading', level: h.level, c: parseInline(h.text.trim()) }, start + 1];
  if (isHr(line.trim())) return [{ t: 'hr' }, start + 1];
  if (line.trim().startsWith('|') && isTableSep(lines[start + 1] ?? '')) return parseTable(lines, start);
  if (itemOf(line)) return parseList(lines, start, indentOf(line));
  return parsePara(lines, start);
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if ((lines[i] as string).trim() === '') {
      i++;
      continue;
    }
    const [block, next] = parseBlock(lines, i);
    blocks.push(block);
    i = next;
  }
  return blocks;
}

function indentOf(line: string): number {
  return (/^\s*/.exec(line)?.[0] ?? '').length;
}

/** 空行の後に同じリストの続き（同じか深い字下げの項目）があるか */
function continuesAfterBlank(lines: readonly string[], i: number, indent: number): boolean {
  const next = lines[i + 1];
  return next !== undefined && itemOf(next) !== null && indentOf(next) >= indent;
}

/** `indent` の深さのリストを読む。より深い字下げの項目は直前の項目の子リストにする。 */
function parseList(lines: readonly string[], start: number, indent: number): [Block, number] {
  const ordered = isDigit(itemOf(lines[start] as string)?.marker[0]);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const next = listLine(lines, i, indent, items);
    if (next === null) break;
    i = next;
  }
  return [{ t: 'list', ordered, items }, i];
}

/** リストの 1 行を読んで `items` に足す。続ければ次に読む行、リストがここで終わるなら null */
function listLine(lines: readonly string[], i: number, indent: number, items: ListItem[]): number | null {
  const line = lines[i] as string;
  // 空行の後に同じリストの続きがあれば続ける
  if (line.trim() === '') return continuesAfterBlank(lines, i, indent) ? i + 1 : null;
  const m = itemOf(line);
  const last = items.at(-1);
  const ind = indentOf(line);
  if (!m) {
    // 項目の続きの行（字下げされた文）
    if (!last || ind <= indent) return null;
    last.c.push(...parseInline(line.trim()));
    return i + 1;
  }
  if (ind < indent) return null;
  if (ind > indent) {
    const [sub, next] = parseList(lines, i, ind);
    if (last && !last.sub) last.sub = sub;
    return next;
  }
  items.push({ c: parseInline(m.text), sub: null });
  return i + 1;
}
