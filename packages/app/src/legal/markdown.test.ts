import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown.ts';

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

  it('閉じていない記号と HTML は文字のまま', () => {
    expect(parseInline('**閉じない [x](')).toEqual([text('**閉じない [x](')]);
    expect(parseInline('<script>alert(1)</script>')).toEqual([text('<script>alert(1)</script>')]);
  });
});

describe('ブロック', () => {
  it('見出し・段落（改行は詰める）・区切り線', () => {
    expect(parseMarkdown('# 利用規約\n\n本規約は、\nWWYD の利用条件を定める。\n\n---\n## 第1条')).toEqual([
      { t: 'heading', level: 1, c: [text('利用規約')] },
      { t: 'para', c: [text('本規約は、WWYD の利用条件を定める。')] },
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
