/// <reference lib="dom.iterable" />
/**
 * T-E: 画面の中で実行する点検（はみ出し・重なり・切れ、文字の収集、計算した色の収集）。
 * どれも DOM を読むだけで、画面は変えない。
 */
import type { Page } from '@playwright/test';

export type Issue = { type: string; detail: string };

/** はみ出し・重なり・切れ（E-01） */
export async function layoutIssues(page: Page, opts: { fit: boolean; mobile: boolean; overlay: boolean }): Promise<Issue[]> {
  return page.evaluate(({ fit, mobile, overlay }) => {
    const issues: { type: string; detail: string }[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const de = document.documentElement;
    const desc = (el: Element): string => {
      const h = el as HTMLElement;
      const label = h.getAttribute('aria-label') ?? '';
      const txt = (h.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28);
      const cls = typeof h.className === 'string' ? h.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${h.getAttribute('role') ? `[${h.getAttribute('role')}]` : ''} "${label || txt}"`;
    };
    const push = (type: string, detail: string): void => {
      issues.push({ type, detail });
    };

    // --- ページ全体
    if (de.scrollWidth > vw + 1) push('page-h-overflow', `documentElement.scrollWidth ${de.scrollWidth} > ${vw}`);
    if (document.body.scrollWidth > vw + 1) push('page-h-overflow', `body.scrollWidth ${document.body.scrollWidth} > ${vw}`);
    if (fit && !mobile && de.scrollHeight > vh + 1) push('page-v-scroll', `PC の 1 画面のはずがページが縦にスクロールする: scrollHeight ${de.scrollHeight} > ${vh}`);
    if (fit && !mobile) {
      const outer = document.querySelector('.fit-outer');
      const stage = document.querySelector('.fit-stage');
      if (!outer || !stage) push('fit-missing', 'FitStage が無い');
      else {
        const o = outer.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        if (s.right > o.right + 1.5 || s.bottom > o.bottom + 1.5 || s.left < o.left - 1.5 || s.top < o.top - 1.5)
          push('fit-stage-exceeds', `stage (${s.left.toFixed(0)},${s.top.toFixed(0)})-(${s.right.toFixed(0)},${s.bottom.toFixed(0)}) が outer (${o.left.toFixed(0)},${o.top.toFixed(0)})-(${o.right.toFixed(0)},${o.bottom.toFixed(0)}) を超える`);
        if (o.bottom > vh + 1) push('fit-outer-exceeds-viewport', `outer.bottom ${o.bottom.toFixed(0)} > ${vh}`);
        const zoom = Number((stage as HTMLElement).style.zoom || 1);
        if (!(zoom > 0.3)) push('fit-scale-small', `倍率 ${zoom}`);
      }
    }

    // --- 対象の面（モーダルが開いていればその中だけ）
    const backdrop = document.querySelector('.modal-backdrop');
    const menu = document.querySelector('.menu');
    const kb = document.querySelector('.ckb');
    const ocrRv = document.querySelector('.ocr-rv');
    const root: ParentNode = backdrop ?? menu ?? kb ?? ocrRv ?? document;
    void overlay;

    const isVisible = (el: Element): boolean => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      return true;
    };
    const INTERACTIVE =
      'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=slider], [role=gridcell], [role=tab], [role=menuitem], [role=radio], [tabindex]:not([tabindex="-1"])';
    const els = [...root.querySelectorAll(INTERACTIVE)].filter(isVisible);

    type Box = { l: number; t: number; r: number; b: number };
    const rectOf = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };

    // --- 切れ（overflow: hidden の祖先の外・画面の外）
    for (const el of els) {
      let box = rectOf(el);
      let fixed = false;
      let a: Element | null = el;
      let inScroller = false;
      while (a && a !== document.body && a !== de) {
        const cs = getComputedStyle(a);
        if (cs.position === 'fixed') {
          fixed = true;
          break; // 固定の面は、上の overflow に切られない
        }
        if (a !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
          const c = a.getBoundingClientRect();
          const scrollX = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && a.scrollWidth > a.clientWidth + 1;
          const scrollY = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && a.scrollHeight > a.clientHeight + 1;
          const outX = box.r > c.right + 2 || box.l < c.left - 2;
          const outY = box.b > c.bottom + 2 || box.t < c.top - 2;
          if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && outX && !scrollX)
            push('clipped-by-ancestor-x', `${desc(el)} は ${desc(a)} (overflow-x:${cs.overflowX}) の外: el ${box.l.toFixed(0)}..${box.r.toFixed(0)} / box ${c.left.toFixed(0)}..${c.right.toFixed(0)}`);
          const clampA = a.getAttribute('class')?.includes('spot-title') ? true : (cs.getPropertyValue('-webkit-line-clamp') !== '' && cs.getPropertyValue('-webkit-line-clamp') !== 'none');
          if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && outY && !scrollY && !clampA)
            push('clipped-by-ancestor-y', `${desc(el)} は ${desc(a)} (overflow-y:${cs.overflowY}) の外: el ${box.t.toFixed(0)}..${box.b.toFixed(0)} / box ${c.top.toFixed(0)}..${c.bottom.toFixed(0)}`);
          if (scrollX || scrollY) {
            inScroller = true;
            // 以降は、その面の枠を基準にする（中でスクロールして届く）
            box = { l: Math.max(box.l, c.left), t: Math.max(box.t, c.top), r: Math.min(box.r, c.right), b: Math.min(box.b, c.bottom) };
            if (box.r <= box.l || box.b <= box.t) box = { l: c.left, t: c.top, r: c.right, b: c.bottom };
          }
        }
        a = a.parentElement;
      }
      if (box.r > vw + 1.5 || box.l < -1.5) push('offscreen-x', `${desc(el)} x ${box.l.toFixed(0)}..${box.r.toFixed(0)} (画面幅 ${vw})${inScroller ? ' [スクロール枠の中]' : ''}`);
      const pageScrolls = de.scrollHeight > vh + 1;
      if ((fixed || !pageScrolls) && (box.b > vh + 1.5 || box.t < -1.5)) push('offscreen-y', `${desc(el)} y ${box.t.toFixed(0)}..${box.b.toFixed(0)} (画面高 ${vh})${fixed ? ' [fixed]' : ''}`);
    }

    // --- 重なり（矩形どうし。overflow で切れて見えない部分は除く。先に判定して、あとでスクロールして中心の点を調べる）
    const visibleBox = (el: Element): Box | null => {
      const r = el.getBoundingClientRect();
      let b: Box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      let a: Element | null = el.parentElement;
      while (a && a !== document.body && a !== de) {
        const cs = getComputedStyle(a);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const c = a.getBoundingClientRect();
          b = { l: Math.max(b.l, c.left), t: Math.max(b.t, c.top), r: Math.min(b.r, c.right), b: Math.min(b.b, c.bottom) };
        }
        a = a.parentElement;
      }
      return b.r > b.l && b.b > b.t ? b : null;
    };
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i] as Element;
        const b = els[j] as Element;
        if (a.contains(b) || b.contains(a)) continue;
        if (a.classList.contains('spot-link') || b.classList.contains('spot-link')) continue;
        const fixedOrSticky = (e: Element): boolean => {
          for (let x: Element | null = e; x && x !== document.body; x = x.parentElement) {
            const ps = getComputedStyle(x).position;
            if (ps === 'fixed' || ps === 'sticky') return true;
          }
          return false;
        };
        if (fixedOrSticky(a) !== fixedOrSticky(b)) continue; // 固定の面は、下をスクロールする内容と重なって見えるのが正常
        const ra = visibleBox(a);
        const rb = visibleBox(b);
        if (!ra || !rb) continue;
        const w = Math.min(ra.r, rb.r) - Math.max(ra.l, rb.l);
        const h = Math.min(ra.b, rb.b) - Math.max(ra.t, rb.t);
        if (w > 4 && h > 4) push('interactive-overlap', `${desc(a)} と ${desc(b)} が ${w.toFixed(0)}x${h.toFixed(0)}px 重なる`);
      }
    }

    // --- 別の要素に覆われている: 画面の中央へスクロールしてから、中心の点にあるのが自分か（固定バー・別の面に隠れない）
    for (const el of els) {
      (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
        push('unreachable', `${desc(el)} を画面の中央へスクロールしても、中心 (${cx.toFixed(0)},${cy.toFixed(0)}) が画面の外`);
        continue;
      }
      const top = document.elementFromPoint(cx, cy);
      if (!top || top === el || el.contains(top) || top.contains(el)) continue;
      if (el.closest('label') && el.closest('label')?.contains(top)) continue;
      if (top.closest('.spot-link') && el.closest('.spot-row, .spot-card')) continue;
      if (el.classList.contains('spot-link')) continue;
      if (top.closest('.toast-wrap')) continue; // 一時的なトースト
      push('covered', `${desc(el)} の中心が ${desc(top)} に覆われている（画面の中央へスクロール後）`);
    }
    window.scrollTo(0, 0);

    // --- 文字の切れ（overflow が hidden で中身が箱より大きい）
    const all = [...root.querySelectorAll('*')];
    for (const el of all) {
      const h = el as HTMLElement;
      if (!isVisible(el) || el.closest('.sr-only')) continue;
      const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (!hasOwnText) continue;
      const cs = getComputedStyle(el);
      const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const clipY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      const clamp = cs.getPropertyValue('-webkit-line-clamp');
      if (clipX && h.scrollWidth > h.clientWidth + 1) {
        push(cs.textOverflow === 'ellipsis' ? 'text-ellipsis' : 'text-cut-x', `${desc(el)} scrollWidth ${h.scrollWidth} > clientWidth ${h.clientWidth}`);
      }
      if (clipY && h.scrollHeight > h.clientHeight + 1 && !(clamp && clamp !== 'none')) {
        push('text-cut-y', `${desc(el)} scrollHeight ${h.scrollHeight} > clientHeight ${h.clientHeight}`);
      }
    }
    // 文字が親の箱の外へ出る（overflow が visible のまま）: 幅のある文字要素が、最も近い箱（背景か枠のある祖先）の外へ出る
    for (const el of all) {
      if (!isVisible(el)) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (own.length === 0) continue;
      const range = document.createRange();
      for (const n of own) {
        range.selectNodeContents(n);
        for (const rr of range.getClientRects()) {
          if (rr.width < 1) continue;
          if (rr.right > vw + 1.5 || rr.left < -1.5) {
            // スクロール枠の中の文字は除く
            let a: Element | null = el;
            let scroller = false;
            while (a && a !== document.body) {
              const cs = getComputedStyle(a);
              if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && a.scrollWidth > a.clientWidth + 1) scroller = true;
              a = a.parentElement;
            }
            if (!scroller) push('text-offscreen-x', `${desc(el)} 文字 ${rr.left.toFixed(0)}..${rr.right.toFixed(0)} (画面幅 ${vw})`);
          }
        }
      }
    }

    // 文字が 1 文字ずつ縦に並ぶ（列が潰れた）: 4 文字以上の文字が、幅が 2 文字分に満たない箱に入って 3 行以上になる
    for (const el of all) {
      if (!isVisible(el) || el.closest('.sr-only')) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => (n.textContent ?? '').trim()).join('');
      if (own.length < 4) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline') continue;
      const fs = parseFloat(cs.fontSize);
      const r = el.getBoundingClientRect();
      const lh = parseFloat(cs.lineHeight) || fs * 1.4;
      if (r.width < fs * 2.2 && r.height > lh * 2.5) push('text-column-collapsed', `${desc(el)} 幅 ${r.width.toFixed(0)}px に高さ ${r.height.toFixed(0)}px（文字が縦に並ぶ）`);
    }
    // 見えるはずの主要な文字が幅 0 に潰れている
    for (const el of document.querySelectorAll('.spot-link, .ans-title, .st-title, .spot-title')) {
      const r = el.getBoundingClientRect();
      if (isVisible(el) && r.width < 40 && (el.textContent ?? '').trim().length > 2) push('title-collapsed', `${desc(el)} の幅が ${r.width.toFixed(0)}px`);
    }

    // 重複を畳む
    const seen = new Set<string>();
    return issues.filter((i) => {
      const k = `${i.type}|${i.detail}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, opts);
}

/** ページを一番下までスクロールして、固定のバーに覆われる要素が無いかを見る（スマホ・縦にスクロールする画面） */
export async function coveredAtBottom(page: Page): Promise<Issue[]> {
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
  if (!scrolls) return [];
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const out: { type: string; detail: string }[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const INTERACTIVE = 'button, a[href], input:not([type=hidden]), [role=button], [role=tab]';
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) return out;
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue;
      const top = document.elementFromPoint(cx, cy);
      if (!top || top === el || el.contains(top) || top.contains(el)) continue;
      if (top.closest('.spot-link') || el.classList.contains('spot-link')) continue;
      const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 20);
      const t = top.getAttribute('aria-label') ?? (top.textContent ?? '').trim().slice(0, 20);
      out.push({ type: 'covered-at-bottom', detail: `"${label}" (${el.tagName.toLowerCase()}.${(el as HTMLElement).className}) が下端で ${top.tagName.toLowerCase()}.${(top as HTMLElement).className} "${t}" に覆われる` });
    }
    // 最後の内容が固定のバーに隠れていないか: ページ末尾の要素の下端と、固定バーの上端
    const fixedBars = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().width > vw * 0.5 && e.getBoundingClientRect().height > 20);
    for (const bar of fixedBars) {
      const br = bar.getBoundingClientRect();
      if (br.top < vh / 2) continue; // 下部の固定バーだけ
      const main = document.querySelector('main');
      const last = main ? [...main.querySelectorAll('*')].filter((e) => !bar.contains(e) && e.getBoundingClientRect().height > 0).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] : null;
      if (last && last.getBoundingClientRect().bottom > br.top + 1 && !last.contains(bar) && !bar.contains(last)) {
        out.push({ type: 'content-under-fixed-bar', detail: `最後の内容 ${last.tagName.toLowerCase()}.${(last as HTMLElement).className} の下端 ${last.getBoundingClientRect().bottom.toFixed(0)} が固定バー ${(bar as HTMLElement).className} の上端 ${br.top.toFixed(0)} より下` });
      }
    }
    return out;
  });
}

// ---------------------------------------------------------------------------- 文字の収集（E-02・E-03）

export type TextItem = { kind: 'text' | 'aria-label' | 'placeholder' | 'title' | 'alt' | 'value'; text: string; where: string; ctx: string };

/** 画面に見える文字・読み上げの名前・プレースホルダー・title を集める */
export async function collectTexts(page: Page): Promise<TextItem[]> {
  return page.evaluate(() => {
    const out: { kind: 'text' | 'aria-label' | 'placeholder' | 'title' | 'alt' | 'value'; text: string; where: string; ctx: string }[] = [];
    const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
    const where = (el: Element): string => {
      const h = el as HTMLElement;
      const cls = typeof h.className === 'string' ? h.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    };
    const visible = (el: Element): boolean => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    // どの種類の面にある文字か（説明文が許される所かの判定に使う）
    const ctxOf = (el: Element): string => {
      if (el.closest('.legal')) return 'legal';
      if (el.closest('.login-tagline')) return 'login-line';
      const m = el.closest('.modal');
      if (m) {
        if (m.querySelector('.info-list')) return 'info-modal';
        return m.getAttribute('role') === 'alertdialog' ? 'confirm-dialog' : `dialog(${m.className.replace('modal ', '')})`;
      }
      if (el.closest('.toast')) return el.closest('.toast.err') ? 'toast-error' : 'toast';
      if (el.closest('[role=alert], .form-err')) return 'error';
      if (el.closest('.sr-only')) return 'sr-only';
      return 'screen';
    };
    // テキストノード（見える要素の中のもの）
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = norm(n.textContent ?? '');
      if (!t) continue;
      const p = n.parentElement;
      if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) continue;
      if (!visible(p)) continue;
      out.push({ kind: 'text', text: t, where: where(p), ctx: ctxOf(p) });
    }
    for (const el of document.querySelectorAll('[aria-label]')) {
      const t = norm(el.getAttribute('aria-label') ?? '');
      if (t) out.push({ kind: 'aria-label', text: t, where: where(el), ctx: ctxOf(el) });
    }
    for (const el of document.querySelectorAll('[placeholder]')) {
      const t = norm(el.getAttribute('placeholder') ?? '');
      if (t) out.push({ kind: 'placeholder', text: t, where: where(el), ctx: ctxOf(el) });
    }
    for (const el of document.querySelectorAll('[title]')) {
      const t = norm(el.getAttribute('title') ?? '');
      if (t) out.push({ kind: 'title', text: t, where: where(el), ctx: ctxOf(el) });
    }
    for (const el of document.querySelectorAll('img[alt], svg title')) {
      const t = norm(el.getAttribute('alt') ?? el.textContent ?? '');
      if (t) out.push({ kind: 'alt', text: t, where: where(el), ctx: ctxOf(el) });
    }
    const t = norm(document.title);
    if (t) out.push({ kind: 'title', text: `<title> ${t}`, where: 'document', ctx: 'document' });
    return out;
  });
}
