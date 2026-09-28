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

/** 行内: `**太字**`・`[文字](URL)`・`` `コード` ``。閉じていない記号は文字のまま。 */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = (): void => {
    if (text) out.push({ t: 'text', v: text });
    text = '';
  };
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'strong', c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'code', v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (s[i] === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(s.slice(i));
      if (m) {
        flush();
        out.push({ t: 'link', href: m[2] as string, c: parseInline(m[1] as string) });
        i += m[0].length;
        continue;
      }
    }
    text += s[i];
    i++;
  }
  flush();
  return out;
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const ITEM = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const HR = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): Inline[][] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => parseInline(c.trim()));
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      blocks.push({ t: 'heading', level: (h[1] as string).length as 1 | 2 | 3 | 4, c: parseInline((h[2] as string).trim()) });
      i++;
      continue;
    }
    if (HR.test(line.trim())) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && TABLE_SEP.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] as string).trim().startsWith('|')) rows.push(cells(lines[i++] as string));
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (ITEM.test(line)) {
      const [list, next] = parseList(lines, i, indentOf(line));
      blocks.push(list);
      i = next;
      continue;
    }
    // 段落: 空行・見出し・リスト・表・区切り線の手前まで。行の区切りは改行にする
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] as string;
      if (l.trim() === '' || HEADING.test(l) || ITEM.test(l) || HR.test(l.trim()) || l.trim().startsWith('|')) break;
      para.push(l.trim());
      i++;
    }
    blocks.push({ t: 'para', c: para.flatMap((l, k) => (k === 0 ? parseInline(l) : [{ t: 'br' } as const, ...parseInline(l)])) });
  }
  return blocks;
}

function indentOf(line: string): number {
  return (/^\s*/.exec(line)?.[0] ?? '').length;
}

/** `indent` の深さのリストを読む。より深い字下げの項目は直前の項目の子リストにする。 */
function parseList(lines: readonly string[], start: number, indent: number): [Block, number] {
  const first = ITEM.exec(lines[start] as string);
  const ordered = /\d/.test(first?.[2] ?? '');
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim() === '') {
      // 空行の後に同じリストの続きがあれば続ける
      const next = lines[i + 1];
      if (next !== undefined && ITEM.test(next) && indentOf(next) >= indent) {
        i++;
        continue;
      }
      break;
    }
    const m = ITEM.exec(line);
    if (!m) {
      // 項目の続きの行（字下げされた文）
      const last = items[items.length - 1];
      if (last && indentOf(line) > indent) {
        last.c.push(...parseInline(line.trim()));
        i++;
        continue;
      }
      break;
    }
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) {
      const last = items[items.length - 1];
      const [sub, next] = parseList(lines, i, ind);
      if (last && !last.sub) last.sub = sub;
      i = next;
      continue;
    }
    items.push({ c: parseInline(m[3] as string), sub: null });
    i++;
  }
  return [{ t: 'list', ordered, items }, i];
}
