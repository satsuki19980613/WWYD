/**
 * T-E: 計算した色の収集（E-04）と、コントラスト・文字の大きさ・タップの大きさの計測（E-06）。DOM を読むだけで画面は変えない。
 */
import type { Page } from '@playwright/test';

export type ColorItem = { family: 'red' | 'yellow' | 'cyan'; prop: string; rgb: string; alpha: number; el: string; text: string; ancestors: string };

/** 見える要素の計算した色（文字・背景・枠・アウトライン・影・SVG の塗りと線）のうち、赤・黄・シアンに近いものを集める */
export async function collectColors(page: Page): Promise<ColorItem[]> {
  return page.evaluate(() => {
    const out: { family: 'red' | 'yellow' | 'cyan'; prop: string; rgb: string; alpha: number; el: string; text: string; ancestors: string }[] = [];
    const parse = (v: string): { r: number; g: number; b: number; a: number }[] => {
      const res: { r: number; g: number; b: number; a: number }[] = [];
      for (const m of v.matchAll(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/g)) {
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        res.push({ r: +(m[1] ?? 0), g: +(m[2] ?? 0), b: +(m[3] ?? 0), a });
      }
      for (const m of v.matchAll(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/g)) {
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        res.push({ r: +(m[1] ?? 0) * 255, g: +(m[2] ?? 0) * 255, b: +(m[3] ?? 0) * 255, a });
      }
      return res;
    };
    const family = (c: { r: number; g: number; b: number }): 'red' | 'yellow' | 'cyan' | null => {
      const r = c.r / 255, g = c.g / 255, b = c.b / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      if (d === 0) return null;
      const s = d / (1 - Math.abs(2 * l - 1));
      if (s < 0.45 || l < 0.12 || l > 0.92) return null;
      let h = 0;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      if (h <= 14 || h >= 346) return 'red';
      if (h >= 48 && h <= 64) return 'yellow';
      if (h >= 178 && h <= 198) return 'cyan';
      return null;
    };
    const visible = (el: Element): boolean => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const cls = (el: Element): string => {
      const c = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.split(/\s+/).filter(Boolean).slice(0, 4).join('.') : '';
      return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}`;
    };
    const ancestors = (el: Element): string => {
      const parts: string[] = [];
      let a = el.parentElement;
      for (let i = 0; i < 3 && a && a !== document.body; i++, a = a.parentElement) parts.push(cls(a));
      return parts.join(' < ');
    };
    const push = (el: Element, prop: string, value: string, minAlpha = 0.08): void => {
      for (const c of parse(value)) {
        if (c.a < minAlpha) continue;
        const f = family(c);
        if (!f) continue;
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => (n.textContent ?? '').trim()).join('');
        out.push({ family: f, prop, rgb: `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`, alpha: Math.round(c.a * 100) / 100, el: cls(el), text: (own || el.getAttribute('aria-label') || '').slice(0, 24), ancestors: ancestors(el) });
      }
    };
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (hasText) push(el, 'color', cs.color, 0.3);
      push(el, 'background-color', cs.backgroundColor);
      if (cs.backgroundImage !== 'none') push(el, 'background-image', cs.backgroundImage);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const w = parseFloat(cs.getPropertyValue(`border-${side}-width`));
        if (w > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none') push(el, `border-${side}`, cs.getPropertyValue(`border-${side}-color`));
      }
      if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') push(el, 'outline', cs.outlineColor);
      if (cs.boxShadow !== 'none') push(el, 'box-shadow', cs.boxShadow, 0.15);
      if (el instanceof SVGElement) {
        if (cs.fill !== 'none') push(el, 'fill', cs.fill);
        if (cs.stroke !== 'none') push(el, 'stroke', cs.stroke);
      }
    }
    return out;
  });
}

// ---------------------------------------------------------------------------- 読みやすさ（E-06）

export type TextMetric = {
  el: string;
  text: string;
  /** 画面に見える大きさ（CSS の font-size × FitStage の zoom） */
  fontPx: number;
  ratio: number;
  large: boolean;
  fg: string;
  bg: string;
  disabled: boolean;
};

/**
 * 見える文字ごとに、実際の大きさ（zoom を掛けた font-size）と、文字色と背景色のコントラスト比を測る。
 * 背景色は祖先の背景を不透明度つきで下から重ねて求める（画像・グラデーションの背景は最初の色で近似するので、目安）。
 */
export async function measureText(page: Page): Promise<TextMetric[]> {
  return page.evaluate(() => {
    const out: { el: string; text: string; fontPx: number; ratio: number; large: boolean; fg: string; bg: string; disabled: boolean }[] = [];
    type RGBA = { r: number; g: number; b: number; a: number };
    const parse = (v: string): RGBA | null => {
      const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(v);
      if (m) return { r: +(m[1] ?? 0), g: +(m[2] ?? 0), b: +(m[3] ?? 0), a: m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]) };
      const n = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/.exec(v);
      if (n) return { r: +(n[1] ?? 0) * 255, g: +(n[2] ?? 0) * 255, b: +(n[3] ?? 0) * 255, a: n[4] === undefined ? 1 : n[4].endsWith('%') ? parseFloat(n[4]) / 100 : parseFloat(n[4]) };
      return null;
    };
    const over = (top: RGBA, under: RGBA): RGBA => {
      const a = top.a + under.a * (1 - top.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return { r: (top.r * top.a + under.r * under.a * (1 - top.a)) / a, g: (top.g * top.a + under.g * under.a * (1 - top.a)) / a, b: (top.b * top.a + under.b * under.a * (1 - top.a)) / a, a };
    };
    const lum = (c: RGBA): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const bgOf = (el: Element): RGBA => {
      const chain: RGBA[] = [];
      for (let a: Element | null = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        let c = parse(cs.backgroundColor);
        if ((!c || c.a === 0) && cs.backgroundImage !== 'none') {
          const g = parse(cs.backgroundImage);
          if (g) c = { ...g, a: g.a };
        }
        if (c && c.a > 0) chain.push(c);
        if (c && c.a >= 1) break;
      }
      let acc: RGBA = { r: 0, g: 0, b: 0, a: 1 }; // body の背景は黒
      for (const c of chain.reverse()) acc = over(c, acc);
      return acc;
    };
    const zoomOf = (el: Element): number => {
      let z = 1;
      for (let a: Element | null = el; a; a = a.parentElement) {
        const zz = parseFloat((a as HTMLElement).style?.zoom || '') || 1;
        z *= zz;
      }
      return z;
    };
    const cls = (el: Element): string => {
      const c = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
      return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}`;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = (n.textContent ?? '').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || ['SCRIPT', 'STYLE'].includes(el.tagName) || el.closest('.sr-only')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      seen.add(el);
      const fg0 = parse(cs.color);
      if (!fg0) continue;
      const bg = bgOf(el);
      // 要素の不透明度（祖先の opacity も掛ける）
      let op = 1;
      for (let a: Element | null = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
      const fg = over({ ...fg0, a: fg0.a * op }, bg);
      const l1 = lum(fg), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = parseFloat(cs.fontSize) * zoomOf(el);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const disabled = !!el.closest(':disabled, [aria-disabled=true], [disabled]');
      out.push({
        el: cls(el),
        text: t.slice(0, 26),
        fontPx: Math.round(px * 10) / 10,
        ratio: Math.round(ratio * 100) / 100,
        large: px >= 24 || (px >= 18.66 && bold),
        fg: `${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)}`,
        bg: `${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}`,
        disabled,
      });
    }
    return out;
  });
}

export type TapTarget = { el: string; label: string; w: number; h: number };

/** 押せる要素の実際の大きさ（zoom 込み）。スマホのタップの大きさの点検用 */
export async function measureTargets(page: Page): Promise<TapTarget[]> {
  return page.evaluate(() => {
    const out: { el: string; label: string; w: number; h: number }[] = [];
    const root = document.querySelector('.modal-backdrop') ?? document;
    for (const el of root.querySelectorAll('button, a[href], input:not([type=hidden]), [role=button], [role=tab], [role=menuitem], [role=radio], [role=slider], [role=gridcell]')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (el as HTMLButtonElement).disabled) continue;
      let r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      // 行全体に広がるリンク（::after で覆う）は、外側の行の大きさで見る
      if (el.classList.contains('spot-link')) {
        const card = el.closest('.spot-card, .spot-row');
        if (card) r = card.getBoundingClientRect();
      }
      const c = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
      const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 22);
      out.push({ el: `${el.tagName.toLowerCase()}${c ? '.' + c : ''}`, label, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
    }
    return out;
  });
}
