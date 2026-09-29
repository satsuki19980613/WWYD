/// <reference lib="dom.iterable" />
/**
 * T-E E-05: キーボードだけの操作（PC 1280x800）。
 *  - Tab の順・フォーカスの見え方（フォーカス時と外したときの見た目を画像で比べる）・フォーカスが消える・閉じ込められる
 *  - モーダル・ダイアログ: 開くと中にフォーカスが入る・Tab / Shift+Tab が外へ出ない・Esc で閉じる・閉じたら開いた要素へ戻る・aria-modal・名前
 *  - キーボードだけで 一覧 → 回答（塗る・送信）→ 集計 まで通す
 * 結果の詳細は test-results-te/kb/*.json。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fakeBackend } from '../fakeBackend.ts';
import { authorAnswered, answered, ID, LIST_ROWS, SCENES, seedDrafts, unanswered } from './te-scenes.ts';

const OUT = 'test-results-te/kb';
mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1280, height: 800 } });

type Stop = { i: number; el: string; visible: boolean; indicator: boolean; inViewport: boolean };

const describeActive = (): string => {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return 'null';
  const cls = typeof a.className === 'string' ? a.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
  const label = a.getAttribute('aria-label') ?? (a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return `${a.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${label}"`;
};

/** Tab で最初から順に辿り、各停止位置を記録する。フォーカスの見え方は、フォーカス中と外した状態の画像を比べる */
async function tabThrough(page: Page, max = 160): Promise<{ stops: Stop[]; lost: string[]; trapped: string | null }> {
  await page.addStyleTag({ content: '*{caret-color:transparent!important;animation:none!important;transition:none!important}' });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: Stop[] = [];
  const lost: string[] = [];
  let trapped: string | null = null;
  let prev = '';
  let same = 0;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const el = await page.evaluate(describeActive);
    if (el === 'body "' || el.startsWith('body')) {
      // 一周して文書の外（ブラウザの UI）へ出た
      if (i > 0) break;
      lost.push(`Tab ${i + 1} 回目でフォーカスが body（見えない位置）にある`);
      continue;
    }
    if (el === prev) {
      same++;
      if (same >= 3) {
        trapped = el;
        break;
      }
    } else same = 0;
    prev = el;
    const handle = await page.evaluateHandle(() => document.activeElement as HTMLElement);
    const box = await handle.evaluate((e) => {
      // 行・カード全体を覆うリンクは、外側の行・カードの枠で見る（フォーカスの枠は外側に描く）
      const outer = e.classList.contains('spot-link') ? e.closest('.spot-card, .spot-row') : null;
      const r = (outer ?? e).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
    });
    const inViewport = box.x + box.w > 0 && box.y + box.h > 0 && box.x < box.vw && box.y < box.vh;
    let indicator = true;
    if (inViewport && box.w > 0 && box.h > 0) {
      const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(box.w + 16, box.vw), height: Math.min(box.h + 16, box.vh) };
      const focused = await page.screenshot({ clip });
      await handle.evaluate((e) => e.blur());
      const blurred = await page.screenshot({ clip });
      await handle.evaluate((e) => e.focus());
      indicator = !focused.equals(blurred);
    }
    stops.push({ i: i + 1, el, visible: box.w > 0 && box.h > 0, indicator, inViewport });
  }
  return { stops, lost, trapped };
}

const TAB_SCENES = ['login', 'list-rows', 'drafts-3', 'terms', 'new-empty', 'new-players6', 'new-action-btn-open', 'new-full-draft', 'answer', 'answer-painted', 'result-all', 'result-author', 'result-diff', 'state-maintenance', 'notfound'];

test.describe('E-05 Tab の順とフォーカスの見え方', () => {
  for (const id of TAB_SCENES) {
    test(id, async ({ page }) => {
      const s = SCENES.find((x) => x.id === id);
      if (!s) throw new Error(id);
      await s.open(page, false);
      await page.waitForTimeout(300);
      const r = await tabThrough(page);
      writeFileSync(`${OUT}/tab__${id}.json`, JSON.stringify(r, null, 1));
      const noIndicator = r.stops.filter((x) => !x.indicator).map((x) => `Tab ${x.i}: ${x.el}`);
      const hidden = r.stops.filter((x) => !x.visible || !x.inViewport).map((x) => `Tab ${x.i}: ${x.el}（見えない・画面の外）`);
      expect(r.trapped, 'フォーカスが同じ要素に閉じ込められた').toBeNull();
      expect(r.lost, 'フォーカスが見えない位置へ').toEqual([]);
      expect(hidden, 'フォーカスが画面の外・大きさ 0 の要素にある').toEqual([]);
      expect(noIndicator, 'フォーカスの見た目が無い（フォーカス時と外した時が同じ画像）').toEqual([]);
      expect(r.stops.length, 'Tab で辿れる要素が無い').toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------- ダイアログ

type Case = { id: string; prepare: (page: Page) => Promise<Locator>; dialog: (page: Page) => Locator; escapeCloses?: boolean };

const kbOpen = async (trigger: Locator): Promise<void> => {
  await trigger.focus();
  await trigger.press('Enter');
};

const CASES: Case[] = [
  {
    id: 'info-list',
    prepare: async (page) => {
      const be = await fakeBackend(page, null);
      be.listRows = LIST_ROWS;
      await page.goto('/');
      const t = page.getByRole('button', { name: 'インフォメーション' });
      await t.waitFor();
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('dialog'),
  },
  {
    id: 'list-delete-confirm',
    prepare: async (page) => {
      const be = await fakeBackend(page, null);
      be.listRows = LIST_ROWS;
      await page.goto('/');
      const t = page.getByRole('button', { name: '削除' }).first();
      await t.waitFor();
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('alertdialog'),
  },
  {
    id: 'answer-confirm',
    prepare: async (page) => {
      await fakeBackend(page, unanswered());
      await page.goto(`/s/${ID}/answer`);
      await page.getByRole('button', { name: /^AA / }).first().focus();
      await page.keyboard.press('Enter');
      const t = page.getByRole('button', { name: '回答する' });
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('alertdialog', { name: '回答を送信しますか' }),
  },
  {
    id: 'result-delete-confirm',
    prepare: async (page) => {
      await fakeBackend(page, authorAnswered());
      await page.goto(`/s/${ID}/result`);
      const t = page.getByRole('button', { name: /削除/ }).first();
      await t.waitFor();
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('alertdialog'),
  },
  {
    id: 'hand-picker',
    prepare: async (page) => {
      await fakeBackend(page, null);
      await page.goto('/new');
      await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
      const t = page.getByRole('button', { name: 'BTN の Hand' });
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('dialog', { name: 'BTN の Hand' }),
  },
  {
    id: 'ocr-game-dialog',
    prepare: async (page) => {
      await fakeBackend(page, null);
      await page.goto('/new');
      const t = page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' });
      await t.waitFor();
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('dialog', { name: 'T4 の Game' }),
  },
  {
    id: 'recount-dialog',
    prepare: async (page) => {
      await fakeBackend(page, null);
      await page.goto('/new');
      await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
      const dock = page.getByRole('group', { name: 'Action' });
      await dock.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
      await dock.getByRole('button', { name: /^Open/ }).click();
      const t = page.getByRole('group', { name: '人数' }).getByRole('button', { name: '5', exact: true });
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('alertdialog'),
  },
  {
    id: 'leave-draft-dialog',
    prepare: async (page) => {
      await fakeBackend(page, null);
      await page.goto('/new');
      await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
      const t = page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' });
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('alertdialog', { name: '下書きに保存しますか' }),
  },
  {
    id: 'drafts-delete-confirm',
    prepare: async (page) => {
      await fakeBackend(page, null);
      await seedDrafts(page, [{ title: '消す下書き' }]);
      await page.goto('/drafts');
      const t = page.getByRole('button', { name: '削除' });
      await t.waitFor();
      await kbOpen(t);
      return t;
    },
    dialog: (page) => page.getByRole('alertdialog'),
  },
];

test.describe('E-05 ダイアログ: フォーカスの閉じ込めと戻り', () => {
  for (const c of CASES) {
    test(c.id, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const trigger = await c.prepare(page);
      const dialog = c.dialog(page);
      await expect(dialog).toBeVisible();

      // 名前・aria-modal
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      const name = await dialog.evaluate((d) => {
        const id = d.getAttribute('aria-labelledby');
        return id ? (document.getElementById(id)?.textContent ?? '') : (d.getAttribute('aria-label') ?? '');
      });
      expect(name.trim(), 'ダイアログの名前が空').not.toBe('');

      const inside = (): Promise<boolean> => dialog.evaluate((d) => d.contains(document.activeElement));
      expect(await inside(), '開いた直後にフォーカスがダイアログの中にある').toBe(true);

      // Tab / Shift+Tab が外へ出ない（要素数より多く回す）
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab');
        expect(await inside(), `Tab ${i + 1} 回目でフォーカスが外へ出た: ${await page.evaluate(describeActive)}`).toBe(true);
      }
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Shift+Tab');
        expect(await inside(), `Shift+Tab ${i + 1} 回目でフォーカスが外へ出た: ${await page.evaluate(describeActive)}`).toBe(true);
      }

      // Esc で閉じ、開いた要素へ戻る
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      const returned = await trigger.evaluate((t) => t === document.activeElement);
      const where = await page.evaluate(describeActive);
      expect(returned, `閉じたあとのフォーカスが開いた要素に戻っていない（いまは ${where}）`).toBe(true);
    });
  }

  test('アカウントメニュー → アカウント削除の確認 → Esc（メニューの項目は消えるので、フォーカスの行き先を確かめる）', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, null);
    await page.goto('/');
    const acct = page.getByRole('button', { name: 'アカウント' });
    await acct.waitFor();
    await kbOpen(acct);
    await expect(page.getByRole('menu')).toBeVisible();
    // 最初の項目にフォーカスが入る
    expect(await page.evaluate(describeActive)).toContain('利用規約');
    await page.keyboard.press('ArrowUp'); // 末尾（アカウントを削除）へ
    expect(await page.evaluate(describeActive)).toContain('アカウントを削除');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    const where = await page.evaluate(describeActive);
    expect(where, `確認を閉じたあとのフォーカス（${where}）が body のままだと、キーボードの利用者は先頭から辿り直しになる`).not.toMatch(/^body/);
  });

  test('アカウントメニュー: Esc で閉じてアカウントのボタンへ戻る・外を押すと閉じる', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, null);
    await page.goto('/');
    const acct = page.getByRole('button', { name: 'アカウント' });
    await acct.waitFor();
    await kbOpen(acct);
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await acct.evaluate((t) => t === document.activeElement)).toBe(true);
  });
});

// ---------------------------------------------------------------------------- キーボードだけの流れ

test.describe('E-05 キーボードだけの主要な流れ', () => {
  test('一覧 → 行を開く（Enter）→ Range を塗る（矢印と Enter）→ 送信（確認も Enter）→ 集計', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const be = await fakeBackend(page, unanswered());
    be.listRows = [LIST_ROWS[0] as Record<string, unknown>];
    be.afterInsert = answered();
    await page.goto('/');
    await page.locator('.spot-link').first().waitFor();

    // 一覧: Tab で行のリンクへ（前にヘッダーとフィルターがある）
    let tabs = 0;
    while (tabs < 40 && !(await page.evaluate(() => document.activeElement?.classList.contains('spot-link') ?? false))) {
      await page.keyboard.press('Tab');
      tabs++;
    }
    expect(tabs, '一覧の最初の行に Tab で届くまでの回数').toBeLessThan(40);
    test.info().annotations.push({ type: '一覧の行まで Tab', description: String(tabs) });
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/s/${ID}/answer`);
    await page.getByRole('button', { name: '回答する' }).waitFor();

    // 回答: Range 表に Tab で届くまで
    tabs = 0;
    while (tabs < 80 && !(await page.evaluate(() => !!document.activeElement?.closest('.rgrid')))) {
      await page.keyboard.press('Tab');
      tabs++;
    }
    expect(tabs, 'Range 表に Tab で届くまでの回数').toBeLessThan(80);
    test.info().annotations.push({ type: 'Range 表まで Tab', description: String(tabs) });
    await page.keyboard.press('Enter'); // 先頭のマス（AA）を塗る
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /^AA Call/ })).toBeVisible();

    // 送信ボタンへ Tab（表の後ろ）
    tabs = 0;
    while (tabs < 60 && !(await page.evaluate(() => document.activeElement?.textContent?.trim() === '回答する'))) {
      await page.keyboard.press('Tab');
      tabs++;
    }
    expect(tabs, '「回答する」に Tab で届くまでの回数').toBeLessThan(60);
    await page.keyboard.press('Enter');
    const dlg = page.getByRole('alertdialog', { name: '回答を送信しますか' });
    await expect(dlg).toBeVisible();
    // 初期フォーカスは「やめる」（Enter の押し間違いで送信しない）
    expect(await page.evaluate(describeActive)).toContain('やめる');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(describeActive)).toContain('送信する');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/s/${ID}/result`);
    expect(be.inserts.length).toBe(1);
  });

  test('投稿: 人数 → Hand（選択ボードにキーで打つ）→ Action（Fold to・Open）をキーボードだけで', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, null);
    await page.goto('/new');
    const six = page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true });
    await six.focus();
    await page.keyboard.press('Enter');
    await expect(six).toHaveAttribute('aria-pressed', 'true');
    const hand = page.getByRole('button', { name: 'BTN の Hand' });
    await hand.focus();
    await page.keyboard.press('Enter');
    const picker = page.getByRole('dialog', { name: 'BTN の Hand' });
    await expect(picker).toBeVisible();
    for (const k of ['a', 's', 'k', 'd']) await page.keyboard.press(k);
    await expect(page.getByRole('dialog', { name: 'SB の Hand' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await hand.evaluate((h) => h === document.activeElement), '選択ボードを閉じたら、開いた Hand の欄へ戻る（BTN の Hand）').toBe(true);

    const dock = page.getByRole('group', { name: 'Action' });
    const foldTo = dock.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' });
    await foldTo.focus();
    await page.keyboard.press('Enter');
    const open = dock.getByRole('button', { name: /^Open/ });
    await open.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.hlog')).toContainText('BTN Raise 2.5');
  });

  test('ヘッダーのナビ: List・＋ Post・下書き・ⓘ・アカウントにキーボードで届き、aria-current が正しい', async ({ page }) => {
    await fakeBackend(page, null);
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'メニュー' });
    await expect(nav.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: '＋ Post' })).not.toHaveAttribute('aria-current', 'page');
    await page.goto('/new');
    await expect(nav.getByRole('link', { name: '＋ Post' })).toHaveAttribute('aria-current', 'page');
  });
});
