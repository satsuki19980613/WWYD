import { Fragment, useMemo } from 'react';
import { Link } from '../components/Link.tsx';
import { parseMarkdown, type Block, type Inline } from './markdown.ts';
import privacyMd from './privacy.md?raw';
import termsMd from './terms.md?raw';

const SOURCES = { terms: termsMd, privacy: privacyMd } as const;

/**
 * 利用規約・プライバシーポリシー（06 章 §6.2）。アプリに同梱した Markdown を表示する。
 * ログインしていなくても開ける（ログイン画面の規約リンク）。
 */
export function LegalScreen(props: { doc: keyof typeof SOURCES }): JSX.Element {
  const blocks = useMemo(() => parseMarkdown(SOURCES[props.doc]), [props.doc]);
  return (
    <article className="screen legal">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </article>
  );
}

function BlockView(props: { block: Block }): JSX.Element {
  const { block: b } = props;
  switch (b.t) {
    case 'heading': {
      // 文書の題（#）は画面の見出し（ハザードティック）、節（##〜）は本文の見出し
      if (b.level === 1) {
        return (
          <h1 className="sec-h legal-title">
            <Inlines c={b.c} />
          </h1>
        );
      }
      const H = b.level === 2 ? 'h2' : b.level === 3 ? 'h3' : 'h4';
      return (
        <H className={`legal-h${b.level}`}>
          <Inlines c={b.c} />
        </H>
      );
    }
    case 'para':
      return (
        <p>
          <Inlines c={b.c} />
        </p>
      );
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul';
      return (
        <L>
          {b.items.map((it, i) => (
            <li key={i}>
              <Inlines c={it.c} />
              {it.sub && <BlockView block={it.sub} />}
            </li>
          ))}
        </L>
      );
    }
    case 'table':
      return (
        <div className="legal-table">
          <table>
            <thead>
              <tr>
                {b.head.map((c, i) => (
                  <th key={i}>
                    <Inlines c={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <Inlines c={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr />;
  }
}

function Inlines(props: { c: readonly Inline[] }): JSX.Element {
  return (
    <>
      {props.c.map((x, i) => (
        <Fragment key={i}>{inline(x)}</Fragment>
      ))}
    </>
  );
}

function inline(x: Inline): JSX.Element | string {
  switch (x.t) {
    case 'text':
      return x.v;
    case 'code':
      return <code>{x.v}</code>;
    case 'br':
      return <br />;
    case 'strong':
      return (
        <strong>
          <Inlines c={x.c} />
        </strong>
      );
    case 'link':
      // アプリ内（/privacy など）はアプリ内の遷移、外部は別タブ。javascript: などは文字のまま
      if (x.href.startsWith('/') && !x.href.startsWith('//')) {
        return (
          <Link to={x.href}>
            <Inlines c={x.c} />
          </Link>
        );
      }
      if (/^https?:/i.test(x.href)) {
        return (
          <a href={x.href} target="_blank" rel="noopener noreferrer">
            <Inlines c={x.c} />
          </a>
        );
      }
      if (/^mailto:/i.test(x.href)) {
        return (
          <a href={x.href}>
            <Inlines c={x.c} />
          </a>
        );
      }
      return <Inlines c={x.c} />;
  }
}
