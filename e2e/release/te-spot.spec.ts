/**
 * T-E E-07: 出題の局面の演出（SPOT の札・卓の縁・目盛り）、Hand History の横一列（投稿・回答・集計）、PC のカード選択ボード。
 * 17 章 §3.3〜§3.5。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend } from '../fakeBackend.ts';
import { answered, ID, setMotion, unanswered } from './te-scenes.ts';

test.describe('SPOT の演出（17 章 §3.5）', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('回答 PC: 停止位置が SPOT（札・卓の縁・目盛り）。戻ると札と縁が消え、目盛りは残る。End で戻る', async ({ page }) => {
    setMotion('reduce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, unanswered());
    await page.goto(`/s/${ID}/answer`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    const table = page.locator('.ptable');
    await expect(table).toHaveClass(/at-spot/);
    const tag = page.locator('.pseat.hero .pseat-spot');
    await expect(tag).toBeVisible();
    await expect(tag).toHaveText('Spot');
    // SPOT の札は Hero の席の右（席の外側）にあり、席・ほかの席・Board と重ならない
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const t = await box('.pseat.hero .pseat-spot');
    const plate = await box('.pseat.hero .pseat-plate');
    expect(t.x, 'SPOT の札は席の右にある').toBeGreaterThanOrEqual(plate.x + plate.width - 2);
    const tb = await box('.ptable');
    expect(t.x + t.width, 'SPOT の札が卓の外へ出ない').toBeLessThanOrEqual(tb.x + tb.width + 1);
    // 目盛り（進み具合のバー上の黄）
    const spotTick = page.locator('.rp-spot');
    await expect(spotTick).toHaveCount(1);
    const barBox = await box('.rp-bar');
    const tick = await spotTick.boundingBox();
    expect(tick!.x + tick!.width / 2, 'Spot の目盛りはバーの終端（回答は Spot で止まる）').toBeCloseTo(barBox.x + barBox.width, -1);
    // 戻る
    await page.keyboard.press('ArrowLeft');
    await expect(table).not.toHaveClass(/at-spot/);
    await expect(page.locator('.pseat.hero .pseat-spot')).toHaveCount(0);
    await expect(spotTick).toHaveCount(1);
    await page.keyboard.press('End');
    await expect(table).toHaveClass(/at-spot/);
    await page.keyboard.press('Home');
    await expect(table).not.toHaveClass(/at-spot/);
  });

  test('視差効果を減らす設定: 卓の縁は止まる（枠だけが残るはずだが、消えたままか確かめる）', async ({ page }) => {
    setMotion('reduce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, unanswered());
    await page.goto(`/s/${ID}/answer`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(400);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    const ring = await page.evaluate(() => {
      const t = document.querySelector('.ptable');
      if (!t) return null;
      const cs = getComputedStyle(t, '::after');
      return { animationName: cs.animationName, opacity: cs.opacity, border: cs.borderTopColor };
    });
    test.info().annotations.push({ type: 'reduce 時の縁（::after）', description: JSON.stringify(ring) });
    expect(running, '視差効果を減らす設定で動いているアニメーション（擬似要素 ::after の spot-ring を含む）').toBe(0);
  });

  test('集計 PC: 最初へ戻ると SPOT が無く、Hero が出題の Action をする直前で SPOT が出る', async ({ page }) => {
    setMotion('reduce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, answered());
    await page.goto(`/s/${ID}/result`);
    await page.getByRole('tab', { name: /^全体/ }).waitFor();
    const table = page.locator('.ptable');
    await expect(table).not.toHaveClass(/at-spot/); // 開いた直後は最後
    await page.keyboard.press('Home');
    for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowRight');
    await expect(table).toHaveClass(/at-spot/);
    await expect(page.locator('.pseat.hero .pseat-spot')).toHaveText('Spot');
    await page.keyboard.press('ArrowRight');
    await expect(table).not.toHaveClass(/at-spot/);
    // History の「出題」の印
    await expect(page.locator('.hlog-tag')).toHaveText('出題');
  });

  test('SPOT の見出し（PC）: Spot・Street・Board・Hero と向き合う Action・Pot・to call が 1 つの帯にあり、帯の中に収まる', async ({ page }) => {
    setMotion('reduce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, unanswered());
    await page.goto(`/s/${ID}/answer`);
    const banner = page.getByRole('group', { name: 'Spot' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Turn');
    await expect(banner).toContainText('Hero BB');
    await expect(banner).toContainText('BTN Bet 6.5');
    await expect(banner).toContainText('Pot');
    await expect(banner).toContainText('to call');
    // 中身が帯からはみ出さない・1 行
    const ok = await banner.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const kids = [...b.querySelectorAll('*')].filter((k) => k.getBoundingClientRect().width > 0 && !k.classList.contains('brk'));
      const outside = kids.filter((k) => {
        const kr = k.getBoundingClientRect();
        return kr.right > r.right + 1 || kr.left < r.left - 1 || kr.bottom > r.bottom + 1 || kr.top < r.top - 1;
      });
      return { h: r.height, outside: outside.map((k) => k.className) };
    });
    expect(ok.outside).toEqual([]);
    expect(ok.h, '帯は 1 行（高さ 90px 未満）').toBeLessThan(90);
    // 色: 黄の枠（コーナーブラケットは左上と右下だけ）
    const brk = await banner.locator('.brk').count();
    expect(brk).toBe(2);
  });
});

test.describe('SPOT の見出し（スマホ）', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('Range のタブの 1 行: Board・Hero・向き合う Action・Pot。行は増やさない（高さ 1 行）', async ({ page }) => {
    setMotion('reduce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, unanswered());
    await page.goto(`/s/${ID}/answer`);
    await page.getByRole('tab', { name: 'Range' }).click();
    const strip = page.getByRole('button', { name: 'Replay を見る' });
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('Hero');
    await expect(strip).toContainText('BTN Bet 6.5');
    await expect(strip).toContainText('POT');
    const h = (await strip.boundingBox())!.height;
    expect(h, '1 行（高さ 60px 未満）').toBeLessThan(60);
    const overflow = await strip.evaluate((s) => s.scrollWidth > s.clientWidth + 1);
    expect(overflow, '中身が横にはみ出す').toBe(false);
  });
});

// ---------------------------------------------------------------------------- History の横一列

type Strip = {
  rowTops: number[];
  overflowX: string;
  wrap: string;
  scrollLeft: number;
  maxScroll: number;
  clientWidth: number;
  scrollWidth: number;
  lastRightGap: number;
  nextRightGap: number | null;
  columns: number;
};

async function stripInfo(page: Page): Promise<Strip> {
  return page.evaluate(() => {
    const s = document.querySelector('.hlog.strip') as HTMLElement;
    const cs = getComputedStyle(s);
    const r = s.getBoundingClientRect();
    const cards = [...s.querySelectorAll('.hlog-list li')] as HTMLElement[];
    const tops = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)))];
    const last = cards[cards.length - 1];
    const next = s.querySelector('.hlog-next') as HTMLElement | null;
    return {
      rowTops: tops,
      overflowX: cs.overflowX,
      wrap: getComputedStyle(s).flexWrap,
      scrollLeft: s.scrollLeft,
      maxScroll: s.scrollWidth - s.clientWidth,
      clientWidth: s.clientWidth,
      scrollWidth: s.scrollWidth,
      lastRightGap: last ? r.right - last.getBoundingClientRect().right : 0,
      nextRightGap: next ? r.right - next.getBoundingClientRect().right : null,
      columns: s.querySelectorAll('.hlog-col').length,
    };
  });
}

test.describe('Hand History の横一列（17 章 §3.3・§3.4）', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('投稿 PC: 1 段・横スクロール・最新（右端）の手が見える。手が増えると右端へ', async ({ page }) => {
    setMotion('reduce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { SCENES } = await import('./te-scenes.ts');
    const s = SCENES.find((x) => x.id === 'new-full-draft')!;
    await s.open(page, false);
    const info = await stripInfo(page);
    console.log('投稿の strip', JSON.stringify(info));
    expect(info.rowTops.length, '全部の手のカードが同じ高さ（1 段）に並ぶ').toBe(1);
    expect(info.overflowX).toBe('auto');
    expect(info.maxScroll, '15 手あれば横にあふれてスクロールになる').toBeGreaterThan(0);
    expect(Math.abs(info.scrollLeft - info.maxScroll), '最新の手（右端）まで送ってある').toBeLessThanOrEqual(1);
    expect(info.lastRightGap, '最後のカードが枠の右端に収まる').toBeGreaterThanOrEqual(-1);
  });

  test('回答 PC: 1 段・右端が今の手。「▶ Hero to act」の札が切れない', async ({ page }) => {
    setMotion('reduce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, unanswered());
    await page.goto(`/s/${ID}/answer`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(300);
    const info = await stripInfo(page);
    console.log('回答の strip', JSON.stringify(info));
    expect(info.rowTops.length, '1 段').toBe(1);
    expect(info.nextRightGap, '「▶ BB to act」が枠の右端に収まる（負なら右で切れている）').not.toBeNull();
    expect(info.nextRightGap!, `「▶ BB to act」が右で ${(-info.nextRightGap!).toFixed(0)}px 切れている`).toBeGreaterThanOrEqual(-1);
  });

  test('集計 PC: 1 段。History の手を押すとその時点へ、押した手が見える範囲にある', async ({ page }) => {
    setMotion('reduce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, answered());
    await page.goto(`/s/${ID}/result`);
    await page.getByRole('tab', { name: /^全体/ }).waitFor();
    const info = await stripInfo(page);
    console.log('集計の strip', JSON.stringify(info));
    expect(info.rowTops.length, '1 段').toBe(1);
    // 最初の手を押す → 1 手目の時点
    await page.locator('.hlog-pick').first().click();
    await expect(page.locator('.rp-count')).toContainText('1 /');
  });
});

// ---------------------------------------------------------------------------- PC のカード選択ボード

test.describe('PC のカード選択ボード（17 章 §3.4）', () => {
  for (const [w, h] of [[1024, 640], [1280, 800], [1366, 768], [1920, 1080]] as const) {
    test(`${w}x${h}: 4 段（♠♥♦♣）× 13 列（A〜2）・使った Card は押せない・ダイアログが画面に収まる`, async ({ page }) => {
      setMotion('reduce');
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await fakeBackend(page, null);
      await page.goto('/new');
      await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
      await page.getByRole('button', { name: 'BTN の Hand' }).click();
      const dlg = page.getByRole('dialog', { name: 'BTN の Hand' });
      await dlg.getByRole('gridcell', { name: 'A♠' }).click();
      await dlg.getByRole('gridcell', { name: 'K♦' }).click();
      const sb = page.getByRole('dialog', { name: 'SB の Hand' });
      const geom = await sb.evaluate((d) => {
        const cells = [...d.querySelectorAll('[role=gridcell]')] as HTMLElement[];
        const rects = cells.map((c) => ({ label: c.getAttribute('aria-label') ?? '', r: c.getBoundingClientRect(), disabled: (c as HTMLButtonElement).disabled }));
        const rows = [...new Set(rects.map((x) => Math.round(x.r.top)))].sort((a, b) => a - b);
        const cols = [...new Set(rects.map((x) => Math.round(x.r.left)))].sort((a, b) => a - b);
        const dr = d.getBoundingClientRect();
        const rank = (l: string): string => l[0] ?? '';
        const orderRow0 = rects.filter((x) => Math.round(x.r.top) === rows[0]).sort((a, b) => a.r.left - b.r.left).map((x) => x.label);
        const suits = rows.map((t) => rects.find((x) => Math.round(x.r.top) === t)?.label.slice(-1));
        return {
          n: cells.length,
          rows: rows.length,
          cols: cols.length,
          disabled: rects.filter((x) => x.disabled).map((x) => x.label),
          firstRow: orderRow0.map(rank).join(''),
          suits: suits.join(''),
          minCell: Math.min(...rects.map((x) => Math.min(x.r.width, x.r.height))),
          dialog: { l: dr.left, t: dr.top, r: dr.right, b: dr.bottom, vw: window.innerWidth, vh: window.innerHeight },
        };
      });
      test.info().annotations.push({ type: `board ${w}x${h}`, description: JSON.stringify(geom) });
      expect(geom.n).toBe(52);
      expect(geom.rows).toBe(4);
      expect(geom.cols).toBe(13);
      expect(geom.firstRow).toBe('AKQJT98765432');
      expect(geom.suits).toBe('♠♥♦♣');
      expect(geom.disabled.sort()).toEqual(['A♠', 'K♦']);
      expect(geom.dialog.l).toBeGreaterThanOrEqual(0);
      expect(geom.dialog.t).toBeGreaterThanOrEqual(0);
      expect(geom.dialog.r).toBeLessThanOrEqual(geom.dialog.vw);
      expect(geom.dialog.b).toBeLessThanOrEqual(geom.dialog.vh);
      expect(geom.minCell, 'Card のマスの小さい辺（px）').toBeGreaterThanOrEqual(24);
    });
  }
});
