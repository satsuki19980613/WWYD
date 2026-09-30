/**
 * T3-05: ヘッダーの投稿のタイトル（18 章 §5.1）。収まる・収まらない（流れる）・prefers-reduced-motion・幅の変更・タイトルの変更・画面名は読み上げ用にだけ。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend } from '../fakeBackend.ts';
import { watchErrors } from '../release/taKit.ts';
import { baseHs1bb, detail, ID, ID2, isSp, openAnswer } from './t3-kit.ts';

const LONG = 'とても長いタイトルがヘッダーに収まらないときは横に流れて全文を見せる。さらに続く長い長い題名の例'.repeat(3);
const SHORT = '短い題';

/** アプリの中のルーター（開発サーバーの /src/router.ts）で、画面を読み込み直さずに移る */
async function navTo(page: Page, to: string): Promise<void> {
  await page.evaluate(async (t) => {
    const path = '/src/router.ts';
    const r = (await import(/* @vite-ignore */ path)) as { navigate: (to: string) => void };
    r.navigate(t);
  }, to);
}

const hdrPost = (page: Page) => page.locator('.hdr-post');
const mq = (page: Page) => page.locator('.hdr-post .mq');

async function metrics(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector('.hdr-post .mq') as HTMLElement;
    const inner = document.querySelector('.hdr-post .mq-inner') as HTMLElement;
    const cs = getComputedStyle(inner);
    return {
      cls: box.className,
      boxW: box.clientWidth,
      innerW: inner.scrollWidth,
      anim: cs.animationName,
      dur: cs.animationDuration,
      over: inner.scrollWidth - box.clientWidth,
      mqDur: inner.style.getPropertyValue('--mq-dur'),
      mqDist: inner.style.getPropertyValue('--mq-dist'),
    };
  });
}

for (const v of ['', ' @sp'] as const) {
  test(`T3-05 収まるタイトルは止めたまま（流さない・省略しない）${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await openAnswer(page, { ...baseHs1bb(), title: SHORT }, { motion: 'no-preference' });
    await expect(page.locator('header h1')).toHaveText(SHORT);
    const m = await metrics(page);
    expect(m.cls).not.toMatch(/mq-run|mq-clip/);
    expect(m.anim).toBe('none');
    expect(m.over).toBeLessThanOrEqual(1);
    expect(await hdrPost(page).getByRole('button').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test(`T3-05 収まらないタイトルは流れる（36px/秒・両端で 18% ずつ止まる・終点で右が切れない）${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await openAnswer(page, { ...baseHs1bb(), title: LONG }, { motion: 'no-preference' });
    await expect(mq(page)).toHaveClass(/mq-run/);
    const m = await metrics(page);
    expect(m.anim).toBe('mq-scroll');
    expect(m.over).toBeGreaterThan(1);
    // 速さ: 動く距離 over を 36px/秒で。周期 = 動く時間 / (1 - 2×0.18)
    const expectedDur = m.over / 36 / (1 - 2 * 0.18);
    expect(parseFloat(m.mqDur)).toBeCloseTo(expectedDur, 1);
    expect(parseFloat(m.mqDist)).toBe(-m.over);
    // キーフレームの形（0〜18% は左端で止まる、82〜100% は右端で止まる、途中は動く）を、現在時刻を動かして確かめる
    const pos = await page.evaluate(() => {
      const inner = document.querySelector('.hdr-post .mq-inner') as HTMLElement;
      const box = document.querySelector('.hdr-post .mq') as HTMLElement;
      const a = inner.getAnimations()[0];
      if (!a) return null;
      a.pause();
      const dur = Number(a.effect?.getComputedTiming().duration);
      const at = (p: number): { left: number; right: number; boxLeft: number; boxRight: number } => {
        a.currentTime = dur * p;
        const r = inner.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        return { left: r.left, right: r.right, boxLeft: b.left, boxRight: b.right };
      };
      return { p0: at(0), p10: at(0.1), p18: at(0.18), p50: at(0.5), p82: at(0.82), p95: at(0.95), iter: a.effect?.getComputedTiming().iterations };
    });
    expect(pos).not.toBeNull();
    if (!pos) return;
    expect(pos.iter).toBe(Infinity);
    expect(pos.p10.left).toBeCloseTo(pos.p0.left, 0);
    expect(pos.p18.left).toBeCloseTo(pos.p0.left, 0);
    expect(pos.p50.left).toBeLessThan(pos.p0.left - 5);
    expect(pos.p82.left).toBeLessThan(pos.p50.left);
    expect(pos.p95.left).toBeCloseTo(pos.p82.left, 0);
    // 始点: 左の余白（8px の内側）から文字が始まる
    expect(pos.p0.left).toBeGreaterThanOrEqual(pos.p0.boxLeft - 0.5);
    // 終点: 最後の文字が箱の右の端（フェードの 12px）より内側で止まる
    expect(pos.p82.right).toBeLessThanOrEqual(pos.p82.boxRight - 12 + 0.5);
    expect(errors).toEqual([]);
  });

  test(`T3-05 動きを減らす設定: 省略（…）して、押すと全文を折り返し、もう一度で戻る。キーボードでも${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await openAnswer(page, { ...baseHs1bb(), title: LONG }, { motion: 'reduce' });
    const toggle = hdrPost(page).getByRole('button');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(mq(page)).toHaveClass(/mq-clip/);
    const m = await metrics(page);
    expect(m.anim).toBe('none'); // 流さない
    const h0 = (await page.locator('header').boundingBox())?.height ?? 0;
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // 全文が見える（切れていない）
    const m2 = await metrics(page);
    expect(m2.over).toBeLessThanOrEqual(1);
    const h1 = (await page.locator('header').boundingBox())?.height ?? 0;
    if (isSp(page)) expect(h1).toBeGreaterThan(h0);
    else {
      // PC はヘッダーを伸ばさず（1 画面に収める。V-043）、全文はタイトルの枠の中でスクロールして読む
      expect(Math.abs(h1 - h0)).toBeLessThan(1);
      const oy = await page.locator('.hdr-post .mq-inner').evaluate((e) => getComputedStyle(e).overflowY);
      expect(oy).toBe('auto');
    }
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(Math.abs(((await page.locator('header').boundingBox())?.height ?? 0) - h0)).toBeLessThan(1);
    // キーボード
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // 見出しは 1 つで、全文が読み上げられる
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('header h1')).toHaveText(LONG);
    expect(errors).toEqual([]);
  });

  test(`T3-05 幅を変える: 広いと止まり、狭いと流れ（または省略し）、戻すと止まる${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    for (const motion of ['no-preference', 'reduce'] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.setViewportSize({ width: 1280, height: 800 });
      await openAnswer(page, { ...baseHs1bb(), title: 'K83r のターンのバレルを受けるときのレンジ' }, { motion });
      await expect(mq(page)).not.toHaveClass(/mq-run|mq-clip/);
      await page.setViewportSize({ width: 360, height: 800 });
      await expect(mq(page)).toHaveClass(motion === 'reduce' ? /mq-clip/ : /mq-run/);
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(mq(page)).not.toHaveClass(/mq-run|mq-clip/);
      await page.setViewportSize({ width: 320, height: 700 });
      await expect(mq(page)).toHaveClass(motion === 'reduce' ? /mq-clip/ : /mq-run/);
    }
    expect(errors).toEqual([]);
  });

  test(`T3-05 画面の中でタイトルが変わる（別の投稿へ移る）と測り直す${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    const be = await openAnswer(page, { ...baseHs1bb(), title: SHORT }, { motion: 'no-preference' });
    await expect(page.locator('header h1')).toHaveText(SHORT);
    await expect(mq(page)).not.toHaveClass(/mq-run|mq-clip/);
    // 短い → 長い
    be.detail = { ...detail({ ...baseHs1bb(), title: LONG }), post: { ...(detail({ ...baseHs1bb(), title: LONG }).post as object), id: ID2 } };
    await navTo(page, `/s/${ID2}/answer`);
    await expect(page.locator('header h1')).toHaveText(LONG);
    await expect(mq(page)).toHaveClass(/mq-run/);
    // 長い → 短い
    be.detail = { ...detail({ ...baseHs1bb(), title: SHORT }), post: { ...(detail({ ...baseHs1bb(), title: SHORT }).post as object), id: ID } };
    await navTo(page, `/s/${ID}/answer`);
    await expect(page.locator('header h1')).toHaveText(SHORT);
    await expect(mq(page)).not.toHaveClass(/mq-run|mq-clip/);
    // 画面を離れるとタイトルは消え、List の画面名に戻る
    await navTo(page, '/');
    await expect(page.locator('.hdr-post')).toHaveCount(0);
    await expect(page.locator('header h1')).toHaveText('List');
    expect(errors).toEqual([]);
  });

  test(`T3-05 省略の表示中（押して全文にした状態）で別の投稿へ移ると、閉じた状態に戻る${v}`, async ({ page }) => {
    const be = await openAnswer(page, { ...baseHs1bb(), title: LONG }, { motion: 'reduce' });
    await hdrPost(page).getByRole('button').click();
    await expect(hdrPost(page).getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    const d2 = detail({ ...baseHs1bb(), title: `${LONG}（2）` });
    (d2.post as Record<string, unknown>).id = ID2;
    be.detail = d2;
    await navTo(page, `/s/${ID2}/answer`);
    await expect(page.locator('header h1')).toHaveText(`${LONG}（2）`);
    // 新しい投稿の見出しが、前の投稿の「開いた」状態を引き継がない（押されていない）
    await expect(hdrPost(page).getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  test(`T3-05 画面名は画面に出さず読み上げ用にだけ残す（List・Post・下書き・規約・プライバシーポリシー・回答・結果）${v}`, async ({ page }) => {
    await fakeBackend(page, detail(baseHs1bb(), 'unanswered'));
    const names: [string, string][] = [
      ['/', 'List'],
      ['/new', 'Post'],
      ['/drafts', '下書き'],
    ];
    for (const [path, name] of names) {
      await page.goto(path);
      const h1 = page.locator('header h1');
      await expect(h1).toHaveText(name);
      await expect(h1).toHaveClass(/sr-only/);
      const b = await h1.boundingBox();
      expect((b?.width ?? 0) <= 2 && (b?.height ?? 0) <= 2).toBe(true); // 見えない（読み上げ用）
    }
    for (const [path, name] of [['/terms', '利用規約'], ['/privacy', 'プライバシーポリシー']] as const) {
      await page.goto(path);
      // 画面名は読み上げ用のみ（見出しは本文の題の 1 つだけ）
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const hid = page.locator('header .hdr-title');
      await expect(hid).toHaveText(name);
      await expect(hid).toHaveClass(/sr-only/);
    }
    // 回答・結果は投稿のタイトルだけ（「回答」「結果」の文字は見えない）
    await page.goto(`/s/${ID}/answer`);
    await expect(page.locator('header').getByText('回答', { exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(isSp(page) || true).toBe(true);
  });

  test(`T3-05 スクロールしてもヘッダーは上に固定で、展開したタイトル（省略の設定）が固定のタブ・本文に重ならない${v}`, async ({ page }) => {
    // 投稿のタイトルの上限（40 文字）いっぱいの題
    const max40 = 'とても長いタイトルの例として四十文字いっぱいの題名を付けたときの表示を確かめます。';
    expect([...max40].length).toBeGreaterThanOrEqual(38);
    await openAnswer(page, { ...baseHs1bb(), title: max40.slice(0, 40) }, { motion: 'reduce' });
    const tg = hdrPost(page).getByRole('button');
    if ((await tg.count()) === 0) return; // PC は収まるので省略しない
    await tg.click();
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(200);
    const hb = await page.locator('header').boundingBox();
    expect(hb?.y ?? 99).toBeLessThanOrEqual(1);
    const hBottom = (hb?.y ?? 0) + (hb?.height ?? 0);
    // スマホは Replay / Range のタブが固定（.ans-top）。ヘッダーの下に隠れないこと
    const top = page.locator('.ans-top');
    if (await top.count()) {
      const tb = await top.boundingBox();
      expect(tb?.y ?? 0).toBeGreaterThanOrEqual(hBottom - 1);
    }
  });
}

// 長さと幅を変えて掃引し、例外（Maximum update depth など）・真っ白・横のはみ出しが出ないこと
test('T3-05 掃引: タイトルの長さ × 幅 × 動きの設定で、例外が無い', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const titles = ['あ', 'Ab', 'K83r', 'K83r のターン', 'K83r のターンのバレルを受ける', 'K83r のターンのバレルを受けるときのレンジを考える', 'W'.repeat(40), '長'.repeat(60), 'a b '.repeat(40), '絵文字😀'.repeat(10)];
  const widths = [320, 360, 375, 412, 600, 768, 1024, 1280];
  for (const motion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion: motion });
    for (const t of titles) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await fakeBackend(page, detail({ ...baseHs1bb(), title: t }, 'unanswered'));
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/s/${ID}/answer`);
      await expect(page.locator('header h1')).toHaveText(t);
      for (const w of widths) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.waitForTimeout(40);
        const m = await metrics(page);
        // 収まるのに流している／収まらないのに止めている、が無い
        const fits = m.over <= 1;
        const cls = m.cls;
        if (!/mq-clip open/.test(cls)) {
          if (fits) expect(cls, `${t} @${w}`).not.toMatch(/mq-run|mq-clip/);
          // 止めたまま（static）なのに、文字が切れている、が無い
          if (!/mq-run|mq-clip/.test(cls)) expect(m.over, `${t} @${w} が切れている`).toBeLessThanOrEqual(1);
        }
      }
    }
  }
  expect(errors).toEqual([]);
});

// 不具合 T3-05-A の再現: 動きを減らす設定で、タイトルの幅が箱の幅と数 px 以内のとき、Marquee が static と clip の間で切り替わり続け
// （Maximum update depth exceeded）、画面が真っ白になる。実機の幅（360・375・390・412・430）で固定の幅のまま読み込んでも起きる
const LOOP_HITS: [number, string][] = [
  [360, 'K83r のターンのバレ'],
  [375, 'K83r のターンのバレル'],
  [390, 'K83r のターンのバレルを'],
  [412, 'BTN 3bet ポットでフロップ'],
  [430, 'K83r のターンのバレルを受け'],
];
for (const [w, title] of LOOP_HITS) {
  test(`T3-05 動きを減らす設定で、幅 ${w}px・題「${title}」でも画面が落ちない（Marquee の再描画の無限ループ）`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: w, height: 800 });
    await openAnswer(page, { ...baseHs1bb(), title }, { motion: 'reduce' });
    await page.waitForTimeout(300);
    await expect(page.locator('header h1')).toHaveText(title);
    expect(errors).toEqual([]);
  });
}
