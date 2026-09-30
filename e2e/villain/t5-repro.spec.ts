/**
 * T5 のモンキーが見つけた不具合の再現（期待する正しい挙動で書く。不具合があれば落ちる）。
 * V-T5-01: Tournament Type の Slider が 0〜100 の範囲を超える（端で矢印・PageUp/Down）
 * V-T5-02: 長いタイトルを開く（動きを減らす設定）と、PC の小さい画面で回答・集計画面がページごとスクロールする
 */
import { expect, test } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend, UID } from '../fakeBackend.ts';
import { openNew, pickSpot, playSrpTurn, S_SETTINGS, setTitle, step, submit } from '../release/taPost.ts';

const ID = '00000000-0000-4000-8000-000000000001';

for (const v of ['', ' @sp'] as const) {
  test(`V-T5-01 Tournament Type は 0〜100 から出ない（端で矢印・PageUp/Down）${v}`, async ({ page }) => {
    await openNew(page);
    await step(page, S_SETTINGS);
    await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
    const sl = page.getByRole('slider', { name: 'Tournament Type' });
    await sl.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    expect(await sl.getAttribute('aria-valuenow'), 'End のあと ArrowRight').toBe('100');
    await page.keyboard.press('PageUp');
    expect(await sl.getAttribute('aria-valuenow'), 'End のあと PageUp').toBe('100');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft');
    expect(await sl.getAttribute('aria-valuenow'), 'Home のあと ArrowLeft').toBe('0');
    await page.keyboard.press('PageDown');
    expect(await sl.getAttribute('aria-valuenow'), 'Home のあと PageDown').toBe('0');
  });
}

for (const [w, h] of [[1024, 640], [800, 600]] as const) {
  test(`V-T5-02 長いタイトルを開いても、PC（${w}x${h}）でページがスクロールしない`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const title = [...'😀🎉🃏♠♥♦♣'.repeat(12)].slice(0, 40).join('');
    for (const path of ['answer', 'result']) {
      await fakeBackend(page, detailJson({ ...hs1bb(), title }, { viewer: path === 'answer' ? 'unanswered' : 'answered', id: ID, answerCount: 1 }));
      await page.goto(`/s/${ID}/${path}`);
      await expect(page.locator('.hdr-post')).toBeVisible();
      // 絵文字の幅はフォントで変わる（CI の Linux では 1024 幅に収まる）。はみ出すときだけ開くボタンがあり、開いてもスクロールしないこと
      const fits = await page.locator('.hdr-post').evaluate((box) => {
        const r = document.createRange();
        r.selectNodeContents(box.querySelector('.mq-inner') ?? box);
        return r.getBoundingClientRect().width <= box.getBoundingClientRect().width + 1;
      });
      const toggle = page.locator('.hdr-post').getByRole('button');
      if (fits) await expect(toggle).toHaveCount(0);
      else {
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      }
      const over = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
      expect(over.sh, `${path}: scrollHeight ${over.sh} / innerHeight ${over.ih}`).toBeLessThanOrEqual(over.ih + 1);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
}

test('V-T5-01b Tournament Type を端で超えたまま投稿しても、送る mtt.speed は 100 以下（または画面が断る）', async ({ page }) => {
  const { cp } = await openNew(page);
  await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
  const sl = page.getByRole('slider', { name: 'Tournament Type' });
  await sl.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await playSrpTurn(page);
  await pickSpot(page, 'Turn / BTN Bet 3');
  await setTitle(page, 'speed 101');
  await submit(page);
  await page.waitForTimeout(800);
  const errs = await page.locator('.pf-errors').allInnerTexts();
  const sent = cp.calls[0]?.body as { mtt?: { speed?: number } } | undefined;
  console.log(`errors=${JSON.stringify(errs)} sent.mtt=${JSON.stringify(sent?.mtt)} calls=${cp.calls.length}`);
  expect(sent?.mtt?.speed ?? 100).toBeLessThanOrEqual(100);
});

for (const [name, drafts, presets] of [
  ['巨大な下書きと Preset', 'x'.repeat(200_000), 'y'.repeat(300_000)],
  ['壊れた JSON', '{broken', '[[[['],
  ['配列でない', JSON.stringify({ a: 1 }), JSON.stringify({ schema: 2, presets: 'x' })],
] as const) {
  test(`T5-05 起動時に壊れた localStorage（${name}）でも投稿画面が出る`, async ({ page }) => {
    await openNew(page);
    await page.addInitScript(
      ([d, p, u]) => {
        localStorage.setItem(`wwyd.drafts.v1.${u}`, d as string);
        localStorage.setItem(`wwyd.readPresets.${u}`, p as string);
      },
      [drafts, presets, UID],
    );
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('/new');
    await expect(page.locator('.hdr')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.hdr')).toBeVisible({ timeout: 15_000 });
    expect(errs).toEqual([]);
  });
}
