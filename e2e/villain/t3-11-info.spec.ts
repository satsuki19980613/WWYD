/**
 * T3-11（画面側）: ⓘ のモーダルが各画面で 09 章の節を出し、Villain の項目が 70 文字以内・7 項目以内に収まって見える。
 * 利用規約・プライバシーポリシーのページに、18 章 §7 の文が表示される。文言の照合は packages/app/src/info/villain.t3.info.test.ts。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend } from '../fakeBackend.ts';
import { fakeList, row } from '../release/taKit.ts';
import { openNew } from '../release/taPost.ts';
import { baseHs1bb, detail, ID, noHScroll, openAnswer, openResult } from './t3-kit.ts';

async function infoItems(page: Page): Promise<{ title: string; items: { term: string; desc: string }[] }> {
  await page.getByRole('button', { name: 'インフォメーション' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  const title = (await dlg.getByRole('heading').first().innerText()).trim();
  const items = await dlg.locator('.info-item').evaluateAll((els) => els.map((e) => ({ term: e.querySelector('dt')?.textContent ?? '', desc: e.querySelector('dd')?.textContent ?? '' })));
  return { title, items };
}

for (const v of ['', ' @sp'] as const) {
  test(`T3-11 ⓘ: 回答・集計・Post・List の節に Villain の項目があり、70 文字以内・7 項目以内。画面からはみ出さない${v}`, async ({ page }) => {
    // 回答
    await openAnswer(page, { ...baseHs1bb(), villain_reads: { BTN: { vpip: 20 } } });
    let r = await infoItems(page);
    expect(r.items.length).toBeLessThanOrEqual(7);
    const vA = r.items.find((i) => i.term === 'Read');
    expect(vA?.desc).toBe('◆ の席・All Villains で見る。Over・Under は頻度、Value・Bluff-heavy は打つ手の中身。++ は強い。');
    for (const i of r.items) expect([...i.desc].length, i.term).toBeLessThanOrEqual(70);
    expect(await noHScroll(page)).toBe(true);
    // ⓘ のモーダルの上で Villain の情報のモーダルと重ならない（閉じてから）
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // 集計
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openResult(page, baseHs1bb());
    r = await infoItems(page);
    expect(r.items.find((i) => i.term === 'Read')?.desc).toContain('◆ の席');
    await page.keyboard.press('Escape');
    // Post
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openNew(page);
    r = await infoItems(page);
    expect(r.items.find((i) => i.term === 'Villain')?.desc).toBe('参加した席と Steal に Fold した Blind。Lean を再度押すと強い（++）。Preset は端末だけ。');
    expect(r.items.length).toBeLessThanOrEqual(7);
    await page.keyboard.press('Escape');
    // List
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await fakeBackend(page, null);
    await fakeList(page, [row(1, { has_reads: true })]);
    await page.goto('/');
    r = await infoItems(page);
    expect(r.items.find((i) => i.term === '印')?.desc).toBe('Reads は Villain の情報、MTT は大会の状況が付いた投稿。');
    // 画面にある印（Reads）と ⓘ の説明の語が同じ
    await page.keyboard.press('Escape');
    await expect(page.locator('.spot-badge')).toHaveText(['Reads']);
  });

  test(`T3-11 ⓘ は Memo・Read Confidence・Stage などの旧仕様の語を出さない${v}`, async ({ page }) => {
    await fakeBackend(page, detail(baseHs1bb(), 'unanswered'));
    for (const path of ['/', '/new', `/s/${ID}/answer`]) {
      await page.goto(path);
      const r = await infoItems(page);
      const all = JSON.stringify(r);
      for (const w of ['Memo', 'Read Confidence', 'Stage', 'PKO', 'Satellite', 'Regular']) expect(all, `${path} ${w}`).not.toContain(w);
      await page.keyboard.press('Escape');
    }
  });

  test(`T3-11 利用規約・プライバシーポリシーのページに、Villain の情報の免責と Preset の文が出る（Memo は無い）${v}`, async ({ page }) => {
    await fakeBackend(page, null);
    await page.goto('/terms');
    const t = page.locator('main');
    await expect(t).toContainText('投稿に付いた Villain の情報は、投稿者の主観的な評価です。');
    await expect(t).toContainText('禁止事項に反する投稿や不適切な投稿は、予告なく削除することがあります。');
    await expect(t).toContainText('他人を誹謗中傷すること');
    await expect(t).not.toContainText('Memo');
    await expect(t).toContainText('Spot のタイトルに、実在の人物を特定できる情報');
    expect(await noHScroll(page)).toBe(true);
    await page.goto('/privacy');
    await expect(page.locator('main')).toContainText('投稿の下書きと Villain の情報の Preset は、その端末のブラウザにだけ保存し、サーバーには送信しません。');
    await expect(page.locator('main')).not.toContainText('Memo');
    expect(await noHScroll(page)).toBe(true);
  });
}
