/**
 * リリース前テストの指摘 F-031・F-033・F-034（villain-reads-test V-032・V-035）の直しの試験（2026-09-30 さつきの判断「推奨どおり」）。
 * - F-033: FitStage の倍率が下限（0.65）を下回る画面は、PC の構成ではなくスマホの構成にする（17 章 §3.0）。
 * - F-034: 小さな文字に --dim2 を使わない（--dim にしてコントラスト 4.5:1 以上）。ⓘ の押せる範囲は 36px 以上。
 * - F-031: 面取り（clip-path）の要素のフォーカスのリングが見える。アカウント削除の確認を閉じると、開いたアカウントのボタンへフォーカスが戻る。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const ANSWER = `/s/${ID}/answer`;

async function openAnswer(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fakeBackend(page, detailJson(hs1bb(), { viewer: 'unanswered', id: ID }));
  await page.goto(ANSWER);
  await expect(page.locator('.ans')).toBeVisible();
}

// ---- F-033: 構成の切り替え ----

/** 画面の大きさと、期待する構成（pc = FitStage の 3 列、sp = スマホの構成） */
const SIZES: { w: number; h: number; pc: boolean }[] = [
  { w: 1024, h: 640, pc: true },
  { w: 1280, h: 800, pc: true },
  { w: 1440, h: 900, pc: true },
  { w: 1920, h: 1080, pc: true },
  { w: 768, h: 1024, pc: false }, // タブレットの縦（倍率 0.53）
  { w: 915, h: 412, pc: false }, // 横向きのスマホ（倍率 0.41）
  { w: 800, h: 600, pc: false }, // 低く狭いウィンドウ（倍率 0.56）
];

for (const s of SIZES) {
  test(`F-033 ${s.w}x${s.h} は ${s.pc ? 'PC' : 'スマホ'} の構成（回答・一覧・投稿）`, async ({ page }) => {
    await page.setViewportSize({ width: s.w, height: s.h });
    await openAnswer(page);
    const appW = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-w').trim());
    if (s.pc) {
      await expect(page.locator('.fit-stage.ans.pc')).toBeVisible();
      const zoom = await page.locator('.fit-stage').evaluate((el) => Number((el as HTMLElement).style.zoom));
      expect(zoom, '倍率は下限 0.65 以上').toBeGreaterThanOrEqual(0.65);
      await expect(page.getByRole('navigation', { name: 'メニュー' })).toBeVisible();
      expect(appW).toBe('1440px');
    } else {
      await expect(page.locator('.ans.sp')).toBeVisible();
      await expect(page.locator('.fit-stage')).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'メニュー' })).toHaveCount(0);
      expect(appW, 'CSS の構成（アプリ面の幅）も JS の判定と一致する').toBe('420px');
    }
    const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hOverflow, '横にはみ出さない').toBe(false);

    await page.goto('/');
    await expect(page.locator(s.pc ? '.list-screen.pc' : '.list-screen.sp')).toBeVisible();
    await page.goto('/new');
    await expect(page.locator(s.pc ? '.fit-stage.pf' : '.pf.sp')).toBeVisible();
  });
}

test('F-033 境目（927x605）: 1px 狭い・低いとスマホの構成。行き来しても揺れない', async ({ page }) => {
  await page.setViewportSize({ width: 927, height: 605 });
  await openAnswer(page);
  await expect(page.locator('.fit-stage.ans.pc')).toBeVisible();
  const zoom = await page.locator('.fit-stage').evaluate((el) => Number((el as HTMLElement).style.zoom));
  expect(zoom).toBeGreaterThanOrEqual(0.65);
  for (const v of [{ width: 926, height: 605 }, { width: 927, height: 604 }]) {
    await page.setViewportSize(v);
    await expect(page.locator('.ans.sp')).toBeVisible();
    await page.setViewportSize({ width: 927, height: 605 });
    await expect(page.locator('.fit-stage.ans.pc')).toBeVisible();
  }
  // 切り替えた後、構成が行ったり来たりしない（1 秒の間、同じ構成のまま）
  await page.setViewportSize({ width: 926, height: 605 });
  await expect(page.locator('.ans.sp')).toBeVisible();
  const flips = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const mo = new MutationObserver(() => {
          if (document.querySelector('.fit-stage')) n += 1;
        });
        mo.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          mo.disconnect();
          resolve(n);
        }, 1000);
      }),
  );
  expect(flips).toBe(0);
});

// ---- F-034: 小さな文字の色 ----

const DIM2 = 'rgb(116, 118, 93)';
const DIM = 'rgb(167, 169, 140)';

/** WCAG の相対輝度のコントラスト比（不透明な色どうし） */
function contrast(a: string, b: string): number {
  const lum = (c: string): number => {
    const m = c.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const [r, g, bl] = m.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('F-034 指摘の小さな文字（.mono-lbl・.rv-none・.rv-hint・.rs-label・.vr-sum・.rs-num など）は --dim（4.5:1 以上）', async ({ page }) => {
  await openAnswer(page);
  // 指摘の部品を、実際のスタイルシートのまま本文の上に置いて色を読む（出ている画面を問わず、規則の色を確かめる）
  const colors = await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.background = '#0c0d0a';
    host.innerHTML = `
      <span class="mono-lbl" data-k="mono-lbl">x</span>
      <span class="rv-none" data-k="rv-none">—</span>
      <span class="rv-hint" data-k="rv-hint">x</span>
      <div class="rs"><span class="rs-label" data-k="rs-label">x</span><button class="rs-num" data-k="rs-num">--<small data-k="rs-num small">%</small></button></div>
      <div class="vr-row"><span class="vr-sum" data-k="vr-sum">x</span></div>
      <button class="chip chip-2l"><small data-k="chip-2l small">x</small></button>
      <div class="chip-row toggle"><button class="chip" data-k="chip-row.toggle .chip">x</button></div>
      <div class="st-head" data-k="st-head">x<button class="st-sort" data-k="st-sort">x</button></div>
      <span class="ocr-rv-no" data-k="ocr-rv-no">1</span>
      <button class="ocr-rv-hero" data-k="ocr-rv-hero">x</button>`;
    document.body.appendChild(host);
    const out: Record<string, string> = {};
    host.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => {
      out[el.dataset.k ?? ''] = getComputedStyle(el).color;
    });
    host.remove();
    return out;
  });
  for (const [k, c] of Object.entries(colors)) {
    expect(c, k).toBe(DIM);
    expect(contrast(c, 'rgb(12, 13, 10)'), `${k} の地色 --bg とのコントラスト`).toBeGreaterThanOrEqual(4.5);
  }
});

test('F-034 Range 表の塗っていないマスの文字は 4.5:1 以上（--cell-off の上で）', async ({ page }) => {
  await openAnswer(page);
  const off = page.locator('.rgrid .rcell').filter({ hasNot: page.locator('.cseg') }).first();
  const { color, bg } = await off.evaluate((el) => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
  expect(color).not.toBe(DIM2);
  expect(contrast(color, bg), `${color} on ${bg}`).toBeGreaterThanOrEqual(4.5);
});

for (const path of ['/', '/new', ANSWER]) {
  test(`F-034 画面（${path}）に --dim2 の色の文字が無い`, async ({ page }) => {
    await openAnswer(page);
    await page.goto(path);
    await page.waitForTimeout(300);
    const hits = await page.evaluate((dim2) => {
      const out: string[] = [];
      document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
        if (!el.textContent?.trim()) return;
        if (getComputedStyle(el).color === dim2) out.push(`${el.tagName}.${el.className}`);
      });
      return out.slice(0, 10);
    }, DIM2);
    expect(hits).toEqual([]);
  });
}

// ---- F-034: ⓘ の押せる範囲 ----

for (const v of ['', ' @sp'] as const) {
  test(`F-034 ⓘ は見た目の丸の外も 36px 四方まで押せる${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await page.goto('/');
    const info = page.getByRole('button', { name: 'インフォメーション' });
    await expect(info).toBeVisible();
    const box = (await info.boundingBox()) as { x: number; y: number; width: number; height: number };
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // 36px 四方の四隅（中心から ±17px）と四辺の中点で、押される要素が ⓘ か
    const pts: [number, number][] = [
      [-17, -17], [17, -17], [-17, 17], [17, 17],
      [0, -17], [0, 17], [-17, 0], [17, 0],
    ];
    const hits = await page.evaluate(
      ({ cx, cy, pts }) => pts.map(([dx, dy]) => Boolean(document.elementFromPoint(cx + dx, cy + dy)?.closest('.infomark'))),
      { cx, cy, pts },
    );
    expect(hits, `ⓘ の丸 ${box.width}x${box.height}`).toEqual(pts.map(() => true));
    // 端を押すと開く
    await page.mouse.click(cx + 17, cy + 17);
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('F-034 ブラシの混合のバーのつまみは 36px 幅まで押せる @sp', async ({ page }) => {
  await openAnswer(page);
  await page.getByRole('tab', { name: 'Range' }).click();
  const h = page.locator('.mhandle').first();
  await expect(h).toBeVisible();
  const box = (await h.boundingBox()) as { width: number; height: number };
  expect(box.width).toBeGreaterThanOrEqual(36);
  expect(box.height).toBeGreaterThanOrEqual(36);
});

// ---- F-031: フォーカス ----

/** 要素の画像の中のシアン（--cyan #3ae6ff）に近い画素の数 */
async function cyanPixels(page: Page, l: Locator): Promise<number> {
  const png = await l.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs((d[i] ?? 0) - 58) < 40 && Math.abs((d[i + 1] ?? 0) - 230) < 40 && Math.abs((d[i + 2] ?? 0) - 255) < 40) n += 1;
    }
    return n;
  }, png.toString('base64'));
}

test('F-031 ＋ Post（面取り）にキーボードでフォーカスすると、リングが面の内側に見える', async ({ page }) => {
  await fakeBackend(page, null);
  await page.goto('/');
  const post = page.getByRole('link', { name: '＋ Post' });
  await expect(post).toBeVisible();
  const before = await cyanPixels(page, post);
  await page.keyboard.press('Shift');
  await post.focus();
  await expect(post).toBeFocused();
  const after = await cyanPixels(page, post);
  expect(after - before, 'フォーカスでシアンの画素が増える').toBeGreaterThan(60);
});

test('F-031 ＋ Post（いまいる画面＝黄の実面）でもフォーカスが見える', async ({ page }) => {
  await fakeBackend(page, null);
  await page.goto('/new');
  const post = page.getByRole('link', { name: '＋ Post' });
  await expect(post).toHaveAttribute('aria-current', 'page');
  const before = await post.screenshot();
  await page.keyboard.press('Shift');
  await post.focus();
  await expect(post).toBeFocused();
  const after = await post.screenshot();
  expect(after.equals(before), 'フォーカスの前後で見た目が変わる').toBe(false);
  const ring = await post.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, offset: parseFloat(s.outlineOffset) };
  });
  expect(ring.style).toBe('solid');
  expect(ring.offset, 'リングは内側（面取りで削られない）').toBeLessThan(0);
});

test('F-031 ブラシのタイル（面取り）にキーボードでフォーカスすると、リングが見える', async ({ page }) => {
  await openAnswer(page);
  const fold = page.getByRole('button', { name: /^Fold \d+%/ });
  await expect(fold).toBeVisible();
  const before = await cyanPixels(page, fold);
  await page.keyboard.press('Shift');
  await fold.focus();
  await expect(fold).toBeFocused();
  const after = await cyanPixels(page, fold);
  expect(after - before, 'フォーカスでシアンの画素が増える').toBeGreaterThan(60);
});

for (const v of ['', ' @sp'] as const) {
  test(`F-031 アカウント削除の確認を閉じると、アカウントのボタンにフォーカスが戻る${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await page.goto('/');
    const acct = page.getByRole('button', { name: 'アカウント' });
    // Esc で閉じる
    await acct.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'アカウントを削除' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(acct).toBeFocused();
    // 「やめる」で閉じる（マウス）
    await acct.click();
    await page.getByRole('menuitem', { name: 'アカウントを削除' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'やめる' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(acct).toBeFocused();
  });
}
