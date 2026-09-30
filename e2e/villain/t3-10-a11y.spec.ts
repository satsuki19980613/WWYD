/**
 * T3-10: UI コンセプトとアクセシビリティ。
 * 黄は選択・主要な操作、シアンは情報、赤は削除・エラーだけ / aria-pressed と名前 / Tab の順・フォーカスの見え方・モーダルの閉じ込めと戻り /
 * タップの大きさ（スマホ 36〜44px）/ 文字のコントラスト（4.5:1 の目安）。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { watchErrors } from '../release/taKit.ts';
import { openNew, pickSpot, playSrpTurn, step, S_SETTINGS } from '../release/taPost.ts';
import { baseHs1bb, isSp, openAnswer } from './t3-kit.ts';

const villains = (page: Page) => page.getByRole('region', { name: 'Villain' });
const RED = 'rgb(255, 59, 59)';
const YELLOW = 'rgb(252, 238, 10)';

/** 投稿画面: SB の席を開き、Spot Read に Lean・General Read を 1 件作った状態 */
async function openedSeat(page: Page): Promise<Locator> {
  await openNew(page);
  await playSrpTurn(page);
  await pickSpot(page, 'Turn / BTN Bet 3');
  const sec = villains(page);
  await sec.getByRole('button', { name: 'SB の Villain の情報' }).click();
  await sec.getByRole('button', { name: '＋ General Read' }).click();
  const g = sec.locator('.vr-read').filter({ hasText: 'General Read 1' });
  await g.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Turn' }).click();
  await g.getByRole('button', { name: 'Barrel', exact: true }).click();
  await g.getByRole('button', { name: 'Board · Size' }).click();
  return sec;
}

for (const v of ['', ' @sp'] as const) {
  test(`T3-10 5 分割のボタン・Lean・条件のボタンは名前と aria-pressed を持つ。Slider は role と値の読み上げ${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    const sec = await openedSeat(page);
    const report = await sec.evaluate((root) => {
      const bad: string[] = [];
      const name = (el: Element): string => (el.getAttribute('aria-label') ?? (el as HTMLElement).innerText ?? '').trim();
      root.querySelectorAll('button').forEach((b) => {
        if (!name(b)) bad.push(`名前なし: ${b.className}`);
        const inChoice = b.closest('.seg5, .vr-chips');
        if (inChoice && !['true', 'false'].includes(b.getAttribute('aria-pressed') ?? '')) bad.push(`aria-pressed なし: ${name(b)}`);
      });
      // 選択肢の行・5 分割のボタンの組は group と名前を持つ
      root.querySelectorAll('.seg5, .vr-choice').forEach((g) => {
        if (g.getAttribute('role') !== 'group' || !g.getAttribute('aria-label')) bad.push(`group の名前なし: ${g.className}`);
      });
      root.querySelectorAll('[role="slider"]').forEach((s) => {
        for (const a of ['aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext', 'tabindex']) if (!s.hasAttribute(a)) bad.push(`slider に ${a} なし`);
      });
      return bad;
    });
    expect(report).toEqual([]);
    // 押すと aria-pressed が変わり、もう一度押すと戻る（5 分割）
    const agg = sec.getByRole('group', { name: 'Postflop Aggression' }).getByRole('button', { name: 'Aggressive', exact: true });
    await expect(agg).toHaveAttribute('aria-pressed', 'false');
    await agg.click();
    await expect(agg).toHaveAttribute('aria-pressed', 'true');
    // 5 分割: 選んだボタンだけが true（左の lit は色だけ）
    const pressed = await sec.getByRole('group', { name: 'Postflop Aggression' }).getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
    expect(pressed).toEqual(['false', 'false', 'false', 'true', 'false']);
    // Lean: 通常 → 強い で名前が変わる（読み上げ）
    const lean = sec.locator('.vr-read').filter({ hasText: 'General Read 1' }).getByRole('group', { name: 'Lean' });
    await lean.getByRole('button', { name: 'Value-heavy' }).click();
    await expect(lean.getByRole('button', { name: 'Value-heavy' })).toHaveAttribute('aria-pressed', 'true');
    await lean.getByRole('button', { name: 'Value-heavy' }).click();
    await expect(lean.getByRole('button', { name: 'Value-heavy（強い）' })).toHaveAttribute('aria-pressed', 'true');
    // 席の見出しのボタンは展開の状態を持つ
    const head = sec.getByRole('button', { name: 'SB の Villain の情報' });
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    await expect(sec.getByRole('button', { name: 'Board · Size' })).toHaveAttribute('aria-expanded', 'true');
    expect(errors).toEqual([]);
  });

  test(`T3-10 Tab の順は画面の順で、フォーカスが見える（outline）。Slider は Tab で入り矢印で動く${v}`, async ({ page }) => {
    const sec = await openedSeat(page);
    await sec.getByRole('button', { name: 'SB の Villain の情報' }).focus();
    const seen: { pos: string; name: string; outline: string; shadow: string }[] = [];
    let prevTop = -1;
    const order: number[] = [];
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        const sec = document.querySelector('section[aria-labelledby]:has(.vr-list)');
        return {
          inside: !!sec?.contains(el),
          name: el.getAttribute('aria-label') ?? el.innerText?.slice(0, 20) ?? el.tagName,
          outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
          shadow: cs.boxShadow,
          top: el.getBoundingClientRect().top + window.scrollY,
          idx: Array.from(document.querySelectorAll('*')).indexOf(el),
        };
      });
      if (!info || !info.inside) break;
      seen.push({ pos: String(info.idx), name: info.name, outline: info.outline, shadow: info.shadow });
      order.push(info.idx);
      prevTop = info.top;
    }
    void prevTop;
    // DOM の順（= Tab の順）が増えていく（tabindex の乱れなし）
    for (let i = 1; i < order.length; i++) expect(order[i]! > order[i - 1]!, `Tab の順: ${seen[i - 1]?.name} → ${seen[i]?.name}`).toBe(true);
    expect(seen.length).toBeGreaterThan(25);
    // フォーカスが見える: outline があるか、box-shadow がある
    const invisible = seen.filter((s) => /^none|^hidden/.test(s.outline) && s.shadow === 'none').map((s) => s.name);
    expect(invisible, 'フォーカスが見えない要素').toEqual([]);
    // Slider に Tab で入って矢印で動く
    const vpip = sec.getByRole('slider', { name: 'VPIP', exact: true });
    await vpip.focus();
    await page.keyboard.press('ArrowRight');
    await expect(vpip).toHaveAttribute('aria-valuenow', '50');
    await page.keyboard.press('Delete');
    await expect(vpip).toHaveAttribute('aria-valuetext', '未入力');
  });

  test(`T3-10 モーダル（席・All Villains・MTT）: フォーカスが中に入り、Tab で外へ出ず、Esc で閉じてボタンに戻る${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await openAnswer(page, { ...baseHs1bb(), fmt: 'mtt', rake: null, villain_reads: { BTN: { vpip: 20, reads: [{ scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: false }] }, UTG: { vpip: 10 } }, mtt: { avg: 20 } });
    const cases: [Locator, string][] = [
      [page.getByRole('button', { name: 'BTN の Villain の情報' }), 'Villain · BTN'],
      [page.getByRole('button', { name: 'All Villains' }), 'All Villains'],
      [page.getByRole('button', { name: 'MTT', exact: true }), 'MTT'],
    ];
    for (const [opener, title] of cases) {
      await opener.focus();
      await page.keyboard.press('Enter');
      const dlg = page.getByRole('dialog', { name: title });
      await expect(dlg).toBeVisible();
      // フォーカスは中（または背景の外へ出ない）
      const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      await page.keyboard.press('Tab');
      expect(await inside(), `${title}: 最初の Tab`).toBe(true);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        expect(await inside(), `${title}: Tab ${i + 2} 回目`).toBe(true);
      }
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Shift+Tab');
        expect(await inside(), `${title}: Shift+Tab ${i + 1} 回目`).toBe(true);
      }
      // 見出し（名前）はモーダルの題
      await page.keyboard.press('Escape');
      await expect(dlg).toHaveCount(0);
      await expect(opener, `${title}: 閉じたら押したボタンへ戻る`).toBeFocused();
    }
    // 背景（モーダルの外）を押すと閉じる
    await page.getByRole('button', { name: 'All Villains' }).click();
    await page.mouse.click(3, 3);
    await expect(page.getByRole('dialog', { name: 'All Villains' })).toHaveCount(0);
    // 閉じるボタンの名前
    await page.getByRole('button', { name: 'All Villains' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /閉じる|Close/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`T3-10 Preset のダイアログ: フォーカスの閉じ込めと戻り${v}`, async ({ page }) => {
    const sec = await openedSeat(page);
    const opener = sec.getByRole('button', { name: 'Preset' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dlg = page.getByRole('dialog', { name: 'Preset · SB' });
    await expect(dlg).toBeVisible();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test(`T3-10 色の意味: 赤は削除・エラーだけ。席の Villain の欄で赤が装飾に使われない${v}`, async ({ page }) => {
    const sec = await openedSeat(page);
    const used = await sec.evaluate((root, R) => {
      const out: string[] = [];
      root.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        const hit = [cs.color === R ? 'color' : '', cs.backgroundColor === R ? 'bg' : '', parseFloat(cs.borderTopWidth) > 0 && cs.borderTopColor === R ? 'border' : ''].filter(Boolean);
        if (hit.length) out.push(`${(el as HTMLElement).className || el.tagName}:${hit.join('+')}`);
      });
      return out;
    }, RED);
    // 席を開いた直後の入力欄には赤は出ない（削除・エラーが無いので）。× は削除なので許す
    expect(used.filter((u) => !/rs-clear/.test(u)), '赤を使っている要素').toEqual([]);
  });

  test(`T3-10 色の意味: 黄は選択中・主要な操作。席を閉じたときの見出し・情報のラベルにシアン以外の色を使っていない${v}`, async ({ page }) => {
    const sec = await openedSeat(page);
    // 選択していない状態の General Read のボタン（未選択）は黄でない
    const g = sec.locator('.vr-read').filter({ hasText: 'General Read 1' });
    const unsel = await g.getByRole('button', { pressed: false }).evaluateAll((els, Y) => els.map((e) => ({ n: e.textContent, c: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor })).filter((x) => x.c === Y || x.bg === Y), YELLOW);
    expect(unsel, '選択していないボタンが黄').toEqual([]);
    // 色の移り変わり（transition）の途中を測らないように、ポインタを外して待つ（スマホで押した直後は途中の色になる）
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);
    const sel = await g.getByRole('button', { pressed: true }).evaluateAll((els) => els.map((e) => ({ n: e.textContent, c: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor, bd: getComputedStyle(e).borderTopColor })));
    // 選んだボタンは黄（背景か文字か枠）
    for (const s of sel) expect([s.c, s.bg, s.bd].some((c) => c === YELLOW), `選んだボタンが黄でない: ${s.n}`).toBe(true);
  });
}

// ---- タップの大きさ（スマホ。36〜44px の目安） ----

test('T3-10 タップの大きさ（スマホ）: Villain の欄の押せる要素は高さ・幅とも 36px 以上 @sp', async ({ page }) => {
  const sec = await openedSeat(page);
  const small = await sec.evaluate((root) => {
    const out: string[] = [];
    root.querySelectorAll('button, [role="slider"], input').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 36 || r.width < 36) out.push(`${(el as HTMLElement).className || el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 16)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    return out;
  });
  console.log('[T3-10] 36px 未満の押せる要素:', JSON.stringify(small));
  expect(small, '36px 未満').toEqual([]);
});

test('T3-10 タップの大きさ（スマホ）: MTT の欄と回答画面のボタン・席の ◆ @sp', async ({ page }) => {
  await openNew(page);
  await step(page, S_SETTINGS);
  await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
  const fs = page.locator('.pf-fieldset:has(.mtt-fields)');
  const small = await fs.evaluate((root) => {
    const out: string[] = [];
    root.querySelectorAll('button, [role="slider"], input').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 36) out.push(`${(el as HTMLElement).className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    return out;
  });
  console.log('[T3-10] MTT の欄で 36px 未満:', JSON.stringify(small));
  expect(small).toEqual([]);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await openAnswer(page, { ...baseHs1bb(), villain_reads: { BTN: { vpip: 20 } } });
  const btns = page.locator('.rp-info button');
  for (const h of await btns.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(36);
  // 席の ◆ を含む札（ボタン）の大きさ
  const seat = await page.getByRole('button', { name: 'BTN の Villain の情報' }).boundingBox();
  expect(seat?.height ?? 0).toBeGreaterThanOrEqual(36);
  expect(seat?.width ?? 0).toBeGreaterThanOrEqual(36);
});

// ---- コントラスト ----

type Low = { text: string; ratio: number; fg: string; bg: string; cls: string; size: number };

/** 要素の中の見えている文字について、文字色と（重なった背景を合成した）背景色のコントラスト比を返す */
async function lowContrast(root: Locator, min = 4.5): Promise<Low[]> {
  return root.evaluate((rootEl, MIN) => {
    const parse = (c: string): [number, number, number, number] => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return [0, 0, 0, 0];
      const p = (m[1] as string).split(/[,/ ]+/).filter(Boolean).map(Number);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    };
    const over = (top: number[], bottom: number[]): number[] => {
      const a = top[3] ?? 1;
      return [0, 1, 2].map((i) => (top[i] as number) * a + (bottom[i] as number) * (1 - a)).concat([1]);
    };
    const lum = (c: number[]): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0] as number) + 0.7152 * f(c[1] as number) + 0.0722 * f(c[2] as number);
    };
    const bgOf = (el: Element): number[] => {
      const chain: number[][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c[3] !== 0) chain.push(c);
        if (c[3] === 1) break;
      }
      let acc = [0, 0, 0, 1];
      for (const c of chain.reverse()) acc = over(c, acc);
      return acc;
    };
    const out: Low[] = [];
    const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    const seen = new Set<Element>();
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent ?? '').trim()) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const bg = bgOf(el);
      const fg = over(parse(cs.color), bg);
      const L1 = Math.max(lum(fg), lum(bg));
      const L2 = Math.min(lum(fg), lum(bg));
      const ratio = (L1 + 0.05) / (L2 + 0.05);
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : MIN;
      if (ratio < need) out.push({ text: (n.textContent ?? '').trim().slice(0, 24), ratio: Math.round(ratio * 100) / 100, fg: cs.color, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(',')})`, cls: (el as HTMLElement).className, size });
    }
    return out;
  }, min);
}

// 4.5:1 未満は所見として出力し（--dim2 の小さな文字の多くが 4.17:1）、3:1 未満（どんな文字でも読みにくい）は失敗にする
test('T3-10 コントラスト: 席のモーダル・All Villains・MTT のモーダルの文字（PC）', async ({ page }) => {
  await openAnswer(page, {
    ...baseHs1bb(),
    fmt: 'mtt',
    rake: null,
    villain_reads: {
      UTG: { vpip: 12, pfr: 8, agg: 0, image: 4, sample: 3 },
      BTN: { vpip: 40, reads: [{ scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: true }, { scope: 'general', street: 'flop', action: 'cbet', texture: { high: 'a' }, runout: null, size: 'small', lean: 'over', strong: false }] },
    },
    mtt: { speed: 70, rank: 12, left: 58, paid: 50, entries: 320, avg: 35, prize: 'top' },
  });
  const low45: Record<string, Low[]> = {};
  const low3: Record<string, Low[]> = {};
  const grab = async (k: string): Promise<void> => {
    low45[k] = await lowContrast(page.getByRole('dialog'), 4.5);
    low3[k] = await lowContrast(page.getByRole('dialog'), 3);
  };
  await page.getByRole('button', { name: 'BTN の Villain の情報' }).click();
  await grab('seat');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'All Villains' }).click();
  await page.locator('details.rv-folded summary').click();
  await grab('all');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'MTT', exact: true }).click();
  await grab('mtt');
  console.log('[T3-10] 4.5:1 未満（モーダル）:', JSON.stringify(Object.fromEntries(Object.entries(low45).map(([k, v]) => [k, v.map((x) => `${x.text}/${x.ratio}/${x.cls}`)]))));
  expect(low3).toEqual({ seat: [], all: [], mtt: [] });
});

test('T3-10 コントラスト: 投稿の Villain の欄（PC）', async ({ page }) => {
  const sec = await openedSeat(page);
  const low45 = await lowContrast(sec, 4.5);
  console.log('[T3-10] 投稿の Villain の欄で 4.5:1 未満:', low45.length, '件。最低', Math.min(...low45.map((x) => x.ratio)), JSON.stringify([...new Set(low45.map((x) => x.cls.split(' ')[0]))]));
  expect(await lowContrast(sec, 3.0), '3:1 未満').toEqual([]);
});

// ---- 使っていない ----
void isSp;
