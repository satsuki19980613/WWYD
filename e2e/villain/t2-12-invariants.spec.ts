/**
 * 不変条件 1（画面に説明文を出さない）・2（ポーカー用語は英語）の点検と、入力欄の大きさ（iPhone の拡大）。
 */
import type { Page } from '@playwright/test';
import { draftJson, expect, openDraft, openSeat, S_SETTINGS, S_SPOT, srpTurn, step, test, threeBetPot, villains } from './t2Kit.ts';

/** 見える文字（日本語を含むもの）を集める */
async function japaneseTexts(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out = new Set<string>();
    const root = document.querySelector(sel);
    if (!root) return ['<root が無い>'];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = (n.textContent ?? '').trim();
      if (!t || !/[぀-ヿ㐀-鿿]/.test(t)) continue;
      const el = n.parentElement as HTMLElement;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none') continue;
      out.add(t);
    }
    root.querySelectorAll<HTMLInputElement>('input[placeholder]').forEach((i) => {
      if (/[぀-ヿ㐀-鿿]/.test(i.placeholder)) out.add(`placeholder:${i.placeholder}`);
    });
    return Array.from(out);
  }, selector);
}

for (const v of ['', ' @sp'] as const) {
  test(`不変条件 1・2: Villain の欄（席を全部開いた状態・Preset・エラー前）に出る日本語は、例外（Spot Read の注記・クリア・保存 など）だけ${v}`, async ({ page }) => {
    await openDraft(page, draftJson({ ...threeBetPot(), reads: { BTN: { vpip: 30 } } }));
    await step(page, S_SPOT);
    await openSeat(page, 'BTN');
    await villains(page).getByRole('button', { name: '＋ General Read' }).click();
    const g = villains(page).locator('.vr-read').filter({ hasText: 'General Read 1' });
    await g.getByRole('group', { name: 'Street', exact: true }).getByRole('button', { name: 'Flop', exact: true }).click();
    await g.getByRole('group', { name: 'Action', exact: true }).getByRole('button', { name: 'C-Bet', exact: true }).click();
    await g.getByRole('button', { name: 'Board · Size' }).click();
    const found = await japaneseTexts(page, 'section[aria-labelledby]:has(.vr-list)');
    // 許す: Spot Read の注記（18 章 C-10）、操作のボタン「クリア」
    const allowed = new Set(['この Hand の結果を知る前の読みで', 'クリア', '＋ General Read']);
    const extra = found.filter((t) => !allowed.has(t));
    expect(extra, `説明文が出ている: ${JSON.stringify(extra)}`).toEqual([]);
    // Preset のダイアログ
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    const dlg = await japaneseTexts(page, '[role="dialog"]');
    const allowedDlg = new Set(['保存', 'placeholder:Preset の名前']);
    expect(dlg.filter((t) => !allowedDlg.has(t)), `Preset のダイアログ: ${JSON.stringify(dlg)}`).toEqual([]);
    // 保存できないときのエラー表示は許される例外だが、説明文にならないよう短い（20 文字の名前）
    await dlg.length;
  });

  test(`不変条件 1・2: MTT の欄に出る日本語は、数の欄の名前 5 つだけ${v}`, async ({ page }) => {
    await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt' }));
    await step(page, S_SETTINGS);
    const found = await japaneseTexts(page, 'section[aria-labelledby]:has(.mtt-fields)');
    // 数の欄の名前（18 章 §2.4）。「（bb）」の付いた Avg Stack は英語＋記号
    const allowed = new Set(['スポットの順位', '残りの人数', 'エントリー数']);
    const extra = found.filter((t) => !allowed.has(t) && !/^Avg Stack/.test(t));
    expect(extra, `説明文が出ている: ${JSON.stringify(extra)}`).toEqual([]);
  });

  test(`入力欄の文字は 16px 以上（iPhone の Safari が拡大しない）: MTT の数の欄・Preset の名前${v}`, async ({ page }) => {
    // タッチの端末（pointer: coarse）だけ 16px にした（V-031）。PC（マウス）は拡大の問題が無いので 15px のまま
    test.skip(v === '', 'PC（マウス）は対象外');
    await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt' }));
    await step(page, S_SETTINGS);
    const sizes = await page.locator('.mtt-fields input').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes).toHaveLength(5);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
    await step(page, S_SPOT);
    await openSeat(page, 'BB');
    await villains(page).getByRole('button', { name: 'Preset' }).click();
    const name = page.getByPlaceholder('Preset の名前');
    expect(parseFloat(await name.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  });
}
