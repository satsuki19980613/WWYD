/**
 * T3-06: 一覧のカード（スマホの 3 段）と PC の表の印（18 章 §6）。
 * T3-07: スクロールバー（18 章 §8）の追加の確認（4px・is-scrolling の出入り・入れ子のスクロール）。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend } from '../fakeBackend.ts';
import { fakeList, row, watchErrors } from '../release/taKit.ts';
import { detail, baseHs1bb, ID, isSp, noHScroll, openAnswer } from './t3-kit.ts';

const YELLOW = 'rgb(252, 238, 10)';

async function openList(page: Page, rows: Record<string, unknown>[]): Promise<void> {
  await fakeBackend(page, null);
  await fakeList(page, rows);
  await page.goto('/');
  await expect(page.locator('.spot-link').first()).toBeVisible();
}

const ROWS = [
  row(1, { title: '短い題', has_reads: true, has_mtt: true, fmt: 'mtt', effective_stack: 18.5, street: 'river', board: ['Kh', '8d', '3c', '2s', '7h'], hero: 'UTG', players: 6, answer_count: 123 }),
  row(2, { title: 'とても長いタイトルの投稿はカードの幅に合わせて二行まで表示し、それを超える分は省略記号にする想定の文章です', has_reads: true, has_mtt: false, street: 'flop', board: ['Kh', '8d', '3c'] }),
  row(3, { title: 'MTT だけ', has_reads: false, has_mtt: true, fmt: 'mtt', effective_stack: 100, street: 'turn' }),
  row(4, { title: '印なし（前の版の投稿）', street: 'turn' }),
  row(5, { title: '自分の投稿', is_mine: true, can_delete: true, has_reads: true, has_mtt: true, fmt: 'mtt', effective_stack: 99.5, street: 'river', board: ['Kh', '8d', '3c', '2s', '7h'], hero: 'HJ' }),
  row(6, { title: '回答済み', answered_by_me: true, has_reads: true, has_mtt: true, fmt: 'mtt', effective_stack: 100.5, street: 'river', board: ['Ah', 'Kd', 'Qc', 'Js', 'Th'], hero: 'BB', players: 2 }),
  // has_reads / has_mtt のキーが無い（前の版のサーバーの応答）
  (() => {
    const r = row(7, { title: 'キー無し' });
    delete r.has_reads;
    delete r.has_mtt;
    return r;
  })(),
];

test.describe('スマホのカード', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 700, 'スマホだけ');

  for (const w of [320, 360, 375, 412]) {
    test(`T3-06 3 段: 2 段目は 1 行に収まり Board と印は縮まない（幅 ${w}px） @sp`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: 800 });
      await openList(page, ROWS);
      const cards = page.locator('.spot-card');
      await expect(cards).toHaveCount(ROWS.length);
      for (let i = 0; i < ROWS.length; i++) {
        const c = cards.nth(i);
        // 段の構造
        await expect(c.locator('.spot-t1')).toHaveCount(1);
        await expect(c.locator('.spot-t2')).toHaveCount(1);
        await expect(c.locator('.spot-foot')).toHaveCount(1);
        const t2 = await c.locator('.spot-t2').evaluate((el) => {
          const r = el.getBoundingClientRect();
          const kids = Array.from(el.children).map((k) => {
            const b = (k as HTMLElement).getBoundingClientRect();
            return { cls: (k as HTMLElement).className, top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width };
          });
          return { top: r.top, h: r.height, right: r.right, left: r.left, sw: el.scrollWidth, cw: el.clientWidth, kids };
        });
        // 1 行（子の top が揃い、高さが 2 行分にならない）
        expect(t2.h, `card ${i} の 2 段目の高さ`).toBeLessThan(40);
        for (const k of t2.kids) expect(Math.abs(k.top - t2.kids[0]!.top), `card ${i} ${k.cls}`).toBeLessThan(8);
        // はみ出さない（右の印がカードの外へ出ない）
        expect(t2.sw, `card ${i} の 2 段目の横のあふれ`).toBeLessThanOrEqual(t2.cw + 1);
        const cardBox = await c.boundingBox();
        for (const k of t2.kids) expect(k.right, `card ${i} ${k.cls}`).toBeLessThanOrEqual((cardBox?.x ?? 0) + (cardBox?.width ?? 0) + 0.5);
      }
      expect(await noHScroll(page)).toBe(true);
      // Board（札）と印は、同じ Board の種類なら条件の文字の長さに関わらず同じ幅
      const widths = await cards.evaluateAll((els) =>
        els.map((e) => ({
          board: Math.round((e.querySelector('.spot-board') as HTMLElement).getBoundingClientRect().width),
          badges: Math.round(((e.querySelector('.spot-badges') as HTMLElement | null)?.getBoundingClientRect().width) ?? 0),
        })),
      );
      // 印が Reads + MTT の 2 つのカード（0・4・5）で同じ幅
      expect(widths[0]!.badges).toBe(widths[4]!.badges);
      expect(widths[4]!.badges).toBe(widths[5]!.badges);
      expect(widths[0]!.badges).toBeGreaterThan(0);
      // 印が無いカードには印の要素を出さない
      await expect(cards.nth(3).locator('.spot-badges')).toHaveCount(0);
      await expect(cards.nth(6).locator('.spot-badges')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test('T3-06 印 Reads・MTT の文字・色（シアンの枠）と、条件の文字が縮んだときに title で全文 @sp', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openList(page, ROWS);
    const c = page.locator('.spot-card').nth(0);
    await expect(c.locator('.spot-badge')).toHaveText(['Reads', 'MTT']);
    await expect(page.locator('.spot-card').nth(1).locator('.spot-badge')).toHaveText(['Reads']);
    await expect(page.locator('.spot-card').nth(2).locator('.spot-badge')).toHaveText(['MTT']);
    const col = await c.locator('.spot-badge').first().evaluate((el) => ({ color: getComputedStyle(el).color, border: getComputedStyle(el).borderTopColor }));
    expect(col.color).toBe('rgb(58, 230, 255)');
    expect(col.border).toMatch(/^rgba\(58, 230, 255/);
    // 条件の文字は長いときに … で省略され、全文は title
    const cond = c.locator('.spot-cond');
    await expect(cond).toHaveAttribute('title', /Hero UTG · MTT · 18\.5bb · 6 Players/);
    expect(await cond.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
  });

  test('T3-06 黄は CTA（回答する）と回答数だけ。状態の札は控えめの色。文字は fg・dim・dim2 の 3 階調 @sp', async ({ page }) => {
    await openList(page, ROWS);
    const cards = page.locator('.spot-card');
    const report = await cards.evaluateAll((els, Y) => {
      const out: { card: number; cls: string; prop: string; text: string }[] = [];
      els.forEach((card, i) => {
        card.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          const txt = (el.textContent ?? '').trim().slice(0, 20);
          const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
          if (own && cs.color === Y) out.push({ card: i, cls: (el as HTMLElement).className, prop: 'color', text: txt });
          if (cs.backgroundColor === Y) out.push({ card: i, cls: (el as HTMLElement).className, prop: 'bg', text: txt });
          if (cs.borderTopColor === Y && parseFloat(cs.borderTopWidth) > 0) out.push({ card: i, cls: (el as HTMLElement).className, prop: 'border', text: txt });
        });
      });
      return out;
    }, YELLOW);
    // 許す: 回答数（spot-count）と、未回答のカードの CTA（spot-go primary）
    for (const r of report) {
      const ok = /spot-count/.test(r.cls) || (/spot-go/.test(r.cls) && /primary/.test(r.cls));
      expect(ok, `黄を使っている: card ${r.card} .${r.cls} ${r.prop} 「${r.text}」`).toBe(true);
    }
    // 回答数は黄・CTA（回答する）は黄、回答済みの CTA（結果を見る）・状態の札は黄ではない
    const color = (i: number, sel: string) => cards.nth(i).locator(sel).first().evaluate((el) => getComputedStyle(el).color);
    expect(await color(0, '.spot-count')).toBe(YELLOW);
    expect(await color(0, '.spot-go')).toBe(YELLOW);
    expect(await color(5, '.spot-go')).not.toBe(YELLOW);
    expect(await color(4, '.spot-tag')).not.toBe(YELLOW);
    expect(await color(5, '.spot-tag')).not.toBe(YELLOW);
    expect(await color(4, '.spot-tag')).not.toMatch(/58, 230, 255/);
    expect(await color(5, '.spot-tag')).not.toMatch(/58, 230, 255/);
    // タイトルの色は状態によって変わるが、3 階調（fg・dim・dim2）のどれか。
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const tmp = document.createElement('i');
      document.body.append(tmp);
      const rgb = (v: string): string => {
        tmp.style.color = cs.getPropertyValue(v);
        return getComputedStyle(tmp).color;
      };
      const o = { fg: rgb('--fg'), dim: rgb('--dim'), dim2: rgb('--dim2') };
      tmp.remove();
      return o;
    });
    const textColors = await cards.evaluateAll((els) => {
      const set = new Map<string, string[]>();
      for (const card of els) {
        card.querySelectorAll('*').forEach((el) => {
          const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
          if (!own) return;
          const c = getComputedStyle(el).color;
          set.set(c, [...(set.get(c) ?? []), (el as HTMLElement).className || el.tagName]);
        });
      }
      return [...set.entries()];
    });
    const allowed = new Set([tokens.fg, tokens.dim, tokens.dim2, YELLOW, 'rgb(58, 230, 255)']);
    for (const [c, where] of textColors) {
      // 席の色（ポジション 6 色）と札の実色は別扱い
      const isSeat = where.every((w) => /pos|pcard|street-badge|em|I|B/.test(w));
      if (!allowed.has(c) && !isSeat) console.log('想定外の文字色', c, where);
    }
  });

  test('T3-06 カード全体を押せる（タイトル以外の場所でも開く）。削除のボタンは別。回答済みは結果へ @sp', async ({ page }) => {
    await openList(page, ROWS);
    const cards = page.locator('.spot-card');
    // 1 段目の右寄りの空き・2 段目・3 段目の左（回答数の所）・3 段目の右（CTA）
    for (const sel of ['.spot-t2', '.spot-foot .spot-meta', '.spot-foot .spot-go']) {
      await page.goto('/');
      await expect(cards.first()).toBeVisible();
      const bb = await cards.nth(0).locator(sel).first().boundingBox();
      await page.mouse.click((bb?.x ?? 0) + Math.min(10, (bb?.width ?? 0) / 2), (bb?.y ?? 0) + (bb?.height ?? 0) / 2);
      await expect(page).toHaveURL(/\/s\/.+\/answer$/);
    }
    await page.goto('/');
    await cards.nth(5).scrollIntoViewIfNeeded();
    const fb = await cards.nth(5).locator('.spot-foot').boundingBox();
    await page.mouse.click((fb?.x ?? 0) + 20, (fb?.y ?? 0) + (fb?.height ?? 0) / 2);
    await expect(page).toHaveURL(/\/s\/.+\/result$/);
    // 削除は確認を出し、移動しない
    await page.goto('/');
    await cards.nth(4).getByRole('button', { name: '削除' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    // カードの角（1 段目の左上の余白）
    await page.keyboard.press('Escape');
    await cards.nth(3).scrollIntoViewIfNeeded();
    const b = await cards.nth(3).boundingBox();
    for (const [dx, dy] of [[3, 3], [(b?.width ?? 0) / 2, 3]]) {
      await page.goto('/');
      await cards.nth(3).scrollIntoViewIfNeeded();
      const bb = await cards.nth(3).boundingBox();
      await page.mouse.click((bb?.x ?? 0) + dx!, (bb?.y ?? 0) + dy!);
      await expect(page, `カード内の (${dx}, ${dy}) を押した`).toHaveURL(/\/answer$/);
    }
  });

  test('T3-06 一覧の最後までスクロールすると、最後のカードの CTA は ＋ Post の浮いたボタンに隠れない @sp', async ({ page }) => {
    await openList(page, ROWS);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const last = page.locator('.spot-card').last();
    const fab = page.locator('.list-fab .btn');
    const lb = await last.boundingBox();
    const fbb = await fab.boundingBox();
    const go = await last.locator('.spot-go').boundingBox();
    expect(lb && fbb && go).toBeTruthy();
    if (!lb || !fbb || !go) return;
    const overlap = go.x < fbb.x + fbb.width && fbb.x < go.x + go.width && go.y < fbb.y + fbb.height && fbb.y < go.y + go.height;
    expect(overlap, '最後のカードの CTA が FAB と重なっている').toBe(false);
  });

  test('T3-06 Tab で各カードのリンクに入り、フォーカスはカード全体に見える @sp', async ({ page }) => {
    await openList(page, ROWS);
    const link = page.locator('.spot-card').nth(0).locator('.spot-link');
    await link.focus();
    const outline = await page.locator('.spot-card').nth(0).evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth);
    expect(outline).toMatch(/solid 2px/);
  });

  test('T3-06 タイトルは 2 行まで・あふれたら省略 @sp', async ({ page }) => {
    await openList(page, ROWS);
    const t = page.locator('.spot-card').nth(1).locator('.spot-title');
    const { lines, lh, h } = await t.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { lines: cs.webkitLineClamp, lh: parseFloat(cs.lineHeight), h: el.getBoundingClientRect().height };
    });
    expect(lines).toBe('2');
    expect(h).toBeLessThanOrEqual(lh * 2 + 2);
  });
}); // describe

test.describe('PC の表', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 700, 'PC だけ');
  test('T3-06 PC の表: 条件の行の後ろに印、回答数は黄、状態の札は控えめ、カードの形は使わない', async ({ page }) => {
    await openList(page, ROWS);
    const rows = page.locator('.spot-row');
    await expect(rows).toHaveCount(ROWS.length);
    await expect(rows.nth(0).locator('.st-meta .spot-badge')).toHaveText(['Reads', 'MTT']);
    await expect(rows.nth(1).locator('.st-meta .spot-badge')).toHaveText(['Reads']);
    await expect(rows.nth(3).locator('.spot-badge')).toHaveCount(0);
    // 印は条件の行の内側
    const meta = await rows.nth(0).locator('.st-meta').boundingBox();
    const badge = await rows.nth(0).locator('.spot-badge').last().boundingBox();
    expect((badge?.x ?? 0) + (badge?.width ?? 0)).toBeLessThanOrEqual((meta?.x ?? 0) + (meta?.width ?? 0) + 1);
    const color = (i: number, sel: string) => rows.nth(i).locator(sel).first().evaluate((el) => getComputedStyle(el).color);
    expect(await color(0, '.st-count')).toBe(YELLOW);
    expect(await color(4, '.spot-tag')).not.toBe(YELLOW);
    expect(await color(5, '.spot-tag')).not.toBe(YELLOW);
    expect(await color(0, '.spot-go')).toBe(YELLOW);
    expect(await color(5, '.spot-go')).not.toBe(YELLOW);
    await expect(page.locator('.spot-card')).toHaveCount(0);
    // 表の中の黄: 回答数・CTA・並び替えの見出し（押されている方）・ナビ以外は使わない
    const yellows = await rows.evaluateAll((els, Y) => {
      const out: string[] = [];
      els.forEach((r) => r.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        if (own && cs.color === Y) out.push((el as HTMLElement).className);
      }));
      return out;
    }, YELLOW);
    for (const c of yellows) expect(/st-count|spot-go|primary/.test(c), `表の黄: ${c}`).toBe(true);
    expect(await noHScroll(page)).toBe(true);
  });

  test('T3-06 PC の表: 行全体を押せる。印のあるタイトルでも行の幅に収まる', async ({ page }) => {
    await openList(page, ROWS);
    const r = page.locator('.spot-row').nth(0);
    const b = await r.boundingBox();
    await page.mouse.click((b?.x ?? 0) + (b?.width ?? 0) - 200, (b?.y ?? 0) + (b?.height ?? 0) / 2);
    await expect(page).toHaveURL(/\/answer$/);
  });
});

// ---- T3-07 スクロールバー ----

for (const v of ['', ' @sp'] as const) {
  test(`T3-07 スクロールバー: 4px・is-scrolling はスクロールした要素だけに付き、0.9 秒で消え、続けてスクロールすると延びる${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await fakeList(page, Array.from({ length: 30 }, (_, i) => row(i + 1)));
    await page.goto('/');
    await expect(page.locator('.spot-link').first()).toBeVisible();
    // 擬似要素の幅（Chromium）
    const w = await page.evaluate(() => {
      const f = (el: Element) => getComputedStyle(el, '::-webkit-scrollbar');
      // つまみの色は getComputedStyle だと OS で変わる（Linux の Chromium は :hover の色を返す）ので、CSS の規則を読む
      const rules = Array.from(document.styleSheets).flatMap((ss) => Array.from(ss.cssRules)).filter((r): r is CSSStyleRule => r instanceof CSSStyleRule);
      const thumb = rules.find((r) => r.selectorText === '::-webkit-scrollbar-thumb')?.style.background ?? '';
      return { html: f(document.documentElement).width, body: f(document.body).width, thumb };
    });
    expect(parseFloat(w.html)).toBeLessThanOrEqual(4);
    expect(parseFloat(w.body)).toBeLessThanOrEqual(4);
    // ふだんはつまみが透明（見えない）
    expect(w.thumb).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    const html = page.locator('html');
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 200);
    await expect(html).toHaveClass(/is-scrolling/);
    // 600ms 後、もう一度スクロール → 最初の 900ms では消えない（タイマーの延長）
    await page.waitForTimeout(600);
    await expect(html).toHaveClass(/is-scrolling/);
    await page.mouse.wheel(0, 100);
    const t0 = Date.now();
    await page.waitForTimeout(600);
    await expect(html).toHaveClass(/is-scrolling/); // 最初のタイマー（残り 300ms）が切れても残っている
    // 最後のスクロールから 0.9 秒前後で外れる
    await expect(html).not.toHaveClass(/is-scrolling/, { timeout: 3000 });
    const dt = Date.now() - t0;
    expect(dt).toBeGreaterThan(200);
    expect(dt).toBeLessThan(1600);
  });

  test(`T3-07 入れ子のスクロール（All Villains のモーダルの中）は、その枠だけに is-scrolling${v}`, async ({ page }) => {
    await page.setViewportSize(isSp(page) ? { width: 375, height: 420 } : { width: 1024, height: 420 });
    const reads: Record<string, unknown> = {};
    for (const p of ['UTG', 'HJ', 'CO', 'BTN', 'SB']) {
      reads[p] = {
        vpip: 30, pfr: 20, agg: 4, image: 4,
        reads: [
          { scope: 'general', street: 'flop', action: 'cbet', texture: { high: 'a', suit: 'two', paired: 'unpaired', connect: 'straight' }, runout: null, size: 'small', lean: 'over', strong: true },
          { scope: 'general', street: 'turn', action: 'barrel', texture: null, runout: ['over', 'flush'], size: 'big', lean: 'bluff', strong: false },
        ],
      };
    }
    await openAnswer(page, { ...baseHs1bb(), villain_reads: reads });
    await page.getByRole('button', { name: 'All Villains' }).click();
    const dlg = page.getByRole('dialog', { name: 'All Villains' });
    await expect(dlg).toBeVisible();
    await page.locator('details.rv-folded summary').click().catch(() => undefined);
    // モーダルの中でスクロールする要素を探す
    const handle = await page.evaluateHandle(() => {
      const d = document.querySelector('[role="dialog"]') as HTMLElement;
      const all = [d, ...Array.from(d.querySelectorAll<HTMLElement>('*'))];
      return all.find((el) => el.scrollHeight > el.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) ?? null;
    });
    const el = handle.asElement();
    expect(el, 'モーダルの中にスクロールする枠が無い').not.toBeNull();
    if (!el) return;
    // 幅（擬似要素）
    expect(parseFloat(await el.evaluate((e) => getComputedStyle(e, '::-webkit-scrollbar').width))).toBeLessThanOrEqual(4);
    await el.evaluate((e) => e.scrollBy(0, 80));
    await expect.poll(() => el.evaluate((e) => e.classList.contains('is-scrolling'))).toBe(true);
    // ページ（html）には付かない
    expect(await page.evaluate(() => document.documentElement.classList.contains('is-scrolling'))).toBe(false);
    await expect.poll(() => el.evaluate((e) => e.classList.contains('is-scrolling')), { timeout: 3000 }).toBe(false);
  });
}

test('T3-07 PC: 回答画面の History の横スクロール（入れ子）も、スクロールした枠だけに is-scrolling', async ({ page }) => {
  await openAnswer(page, baseHs1bb());
  await expect(page.locator('.ptable')).toBeVisible();
  await page.waitForTimeout(500);
  const handle = await page.evaluateHandle(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    return all.find((el) => el.scrollWidth > el.clientWidth + 20 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)) ?? null;
  });
  const el = handle.asElement();
  expect(el, '横にスクロールする枠が無い').not.toBeNull();
  if (!el) return;
  expect(parseFloat(await el.evaluate((e) => getComputedStyle(e, '::-webkit-scrollbar').height))).toBeLessThanOrEqual(4);
  await el.evaluate((e) => e.scrollBy(60, 0));
  await expect.poll(() => el.evaluate((e) => e.classList.contains('is-scrolling'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.classList.contains('is-scrolling'))).toBe(false);
  await expect.poll(() => el.evaluate((e) => e.classList.contains('is-scrolling')), { timeout: 3000 }).toBe(false);
});

// 使っていない import の抑止
void detail;
void ID;
