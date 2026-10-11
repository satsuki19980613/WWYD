import { describe, expect, it } from 'vitest';
import { headingOf, isHr, isTableSep, itemOf, parseInline, parseMarkdown } from './markdown.ts';

const text = (v: string) => ({ t: 'text', v }) as const;

describe('行内', () => {
  it('太字とリンク', () => {
    expect(parseInline('第**1**条は[こちら](/privacy)')).toEqual([
      text('第'),
      { t: 'strong', c: [text('1')] },
      text('条は'),
      { t: 'link', href: '/privacy', c: [text('こちら')] },
    ]);
  });

  it('コード', () => {
    expect(parseInline('`neon_auth` スキーマ')).toEqual([{ t: 'code', v: 'neon_auth' }, text(' スキーマ')]);
  });

  it('閉じていない記号と HTML は文字のまま', () => {
    expect(parseInline('**閉じない [x](')).toEqual([text('**閉じない [x](')]);
    expect(parseInline('<script>alert(1)</script>')).toEqual([text('<script>alert(1)</script>')]);
  });
});

describe('ブロック', () => {
  it('見出し・段落（行の区切りは改行）・区切り線', () => {
    expect(parseMarkdown('# 利用規約\n\n施行日: 未定\n運営者: 未定\n\n---\n## 第1条')).toEqual([
      { t: 'heading', level: 1, c: [text('利用規約')] },
      { t: 'para', c: [text('施行日: 未定'), { t: 'br' }, text('運営者: 未定')] },
      { t: 'hr' },
      { t: 'heading', level: 2, c: [text('第1条')] },
    ]);
  });

  it('番号付きリストと、字下げした子の箇条書き', () => {
    const [list] = parseMarkdown('1. 対局中の使用\n2. 次の行為\n   - 宣伝\n   - 営利目的の利用\n3. その他');
    expect(list).toEqual({
      t: 'list',
      ordered: true,
      items: [
        { c: [text('対局中の使用')], sub: null },
        {
          c: [text('次の行為')],
          sub: {
            t: 'list',
            ordered: false,
            items: [
              { c: [text('宣伝')], sub: null },
              { c: [text('営利目的の利用')], sub: null },
            ],
          },
        },
        { c: [text('その他')], sub: null },
      ],
    });
  });

  it('リストの直後の段落は別のブロック', () => {
    expect(parseMarkdown('- a\n- b\n\n本文').map((b) => b.t)).toEqual(['list', 'para']);
  });

  it('表', () => {
    expect(parseMarkdown('| 事業者 | 国 |\n|---|:--:|\n| Neon | 米国 |\n| Cloudflare | 米国 |')).toEqual([
      {
        t: 'table',
        head: [[text('事業者')], [text('国')]],
        rows: [
          [[text('Neon')], [text('米国')]],
          [[text('Cloudflare')], [text('米国')]],
        ],
      },
    ]);
  });

  it('同梱の文書を読める（見出しから始まる）', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['terms.md', 'privacy.md']) {
      const blocks = parseMarkdown(readFileSync(new URL(f, import.meta.url), 'utf8'));
      expect(blocks[0]?.t).toBe('heading');
    }
  });
});

// 行の判定（正規表現の後戻りを避けて文字を順に見る形にした。元の正規表現と同じ結果になること）
describe('行の判定', () => {
  it('見出しは # 〜 #### と空白のあと（空白が無い・# が 5 つ以上は見出しでない）', () => {
    expect(headingOf('## 第1条')).toEqual({ level: 2, text: '第1条' });
    expect(headingOf('#\t  題 ')).toEqual({ level: 1, text: '題 ' });
    expect(headingOf('# ')).toEqual({ level: 1, text: '' });
    expect(headingOf('#題')).toBeNull();
    expect(headingOf('##### 題')).toBeNull();
    expect(headingOf(' # 題')).toBeNull();
    expect(headingOf('# 題\u2028続き')).toBeNull();
  });

  it('リストの項目は字下げ・記号（- * 1. 1)）・空白・本文', () => {
    expect(itemOf('   - 宣伝')).toEqual({ marker: '-', text: '宣伝' });
    expect(itemOf('12) 十二')).toEqual({ marker: '12)', text: '十二' });
    expect(itemOf('1.  二つの空白')).toEqual({ marker: '1.', text: '二つの空白' });
    expect(itemOf('-なし')).toBeNull();
    expect(itemOf('1 x')).toBeNull();
    expect(itemOf('a. x')).toBeNull();
    expect(itemOf('-')).toBeNull();
  });

  it('区切り線は同じ記号が 3 つ以上', () => {
    expect(isHr('---')).toBe(true);
    expect(isHr('*****  ')).toBe(true);
    expect(isHr('___')).toBe(true);
    expect(isHr('--')).toBe(false);
    expect(isHr('-*-')).toBe(false);
    expect(isHr(' ---')).toBe(false);
  });

  it('表の区切りの行（両端の | は省ける。マスは :?-{2,}:?）', () => {
    expect(isTableSep('|---|:--:|')).toBe(true);
    expect(isTableSep('--- | --:')).toBe(true);
    expect(isTableSep('| :-- |  ')).toBe(true);
    expect(isTableSep('|-|')).toBe(false);
    expect(isTableSep('|---||')).toBe(false);
    expect(isTableSep('::--')).toBe(false);
    expect(isTableSep(' |---|')).toBe(false);
    expect(isTableSep('|')).toBe(false);
  });
});
