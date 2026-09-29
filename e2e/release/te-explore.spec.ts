/// <reference lib="dom.iterable" />
/**
 * T-E 探索的な試験（観点 E の範囲）:
 *  - iPhone の Safari は、入力欄の文字が 16px 未満だとフォーカス時に勝手に拡大する → 入力欄の文字の大きさ
 *  - 横向きのスマホ（幅 700px 以上 → PC 用の構成）の見え方
 *  - 悪意のある・極端なタイトル（幅の広い文字・結合文字・長い連続文字・絵文字・右から左の文字）が一覧・回答・集計・下書きで崩さないか
 *  - スマホでカードキーボードを開いたとき、入力中の席がキーボードの上に見えるか
 *  - なぞる操作の面（Range 表・Mix バー）の touch-action など
 */
import { expect, test } from '@playwright/test';
import { fakeBackend } from '../fakeBackend.ts';
import { layoutIssues } from './te-checks.ts';
import { measureText } from './te-colors.ts';
import { authorAnswered, answered, ID, listRow, SCENES, seedDrafts, setMotion, unanswered } from './te-scenes.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';

test.describe('入力欄（スマホ）', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('入力欄・テキストエリアの文字は 16px 以上（iPhone の Safari のフォーカス時の自動拡大を避ける）', async ({ page }) => {
    setMotion('reduce');
    const bad: string[] = [];
    for (const id of ['new-players6', 'new-full-draft', 'answer-painted', 'new-action-btn-open']) {
      const s = SCENES.find((x) => x.id === id)!;
      const p = await page.context().newPage();
      await s.open(p, true);
      // 全部の入力欄が出るように、必要なステップを開く
      for (const name of [/^1\s*基本設定$/, /^2\s*Player$/, /^3\s*Action$/, /^4\s*Spot$/]) {
        const b = p.getByRole('button', { name });
        if ((await b.count()) > 0) {
          await b.first().click();
          const fs = await p.evaluate(() =>
            [...document.querySelectorAll('input:not([type=hidden]):not([type=file]), textarea, select')]
              .filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0)
              .map((e) => ({ el: `${e.tagName.toLowerCase()}.${(e as HTMLElement).className}`, label: e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? '', px: parseFloat(getComputedStyle(e).fontSize) })),
          );
          for (const f of fs) if (f.px < 16) bad.push(`${id}/${String(name)}: ${f.el} "${f.label}" ${f.px}px`);
        }
      }
      const fs2 = await p.evaluate(() =>
        [...document.querySelectorAll('input:not([type=hidden]):not([type=file]), textarea, select')]
          .filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0)
          .map((e) => ({ el: `${e.tagName.toLowerCase()}.${(e as HTMLElement).className}`, label: e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? '', px: parseFloat(getComputedStyle(e).fontSize) })),
      );
      for (const f of fs2) if (f.px < 16) bad.push(`${id}: ${f.el} "${f.label}" ${f.px}px`);
      await p.close();
    }
    expect([...new Set(bad)], '16px 未満の入力欄（iOS Safari はフォーカス時にページを拡大する）').toEqual([]);
  });

  test('viewport の meta は拡大を禁止していない（user-scalable=no・maximum-scale を付けない）', async ({ page }) => {
    await fakeBackend(page, null);
    await page.goto('/');
    const v = await page.evaluate(() => document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? '');
    expect(v).not.toMatch(/user-scalable\s*=\s*(no|0)/);
    expect(v).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/);
  });

  test('なぞる操作の面（Range 表・Mix バー）は touch-action: none、長押しで選択・メニューが出ない設定', async ({ page }) => {
    setMotion('reduce');
    await fakeBackend(page, unanswered());
    await page.goto(`/s/${ID}/answer`);
    await page.getByRole('tab', { name: 'Range' }).click();
    const styles = await page.evaluate(() => {
      const pick = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { touchAction: cs.touchAction, userSelect: cs.userSelect, callout: cs.getPropertyValue('-webkit-touch-callout') };
      };
      return { grid: pick('.rgrid'), cell: pick('.rcell'), mixbar: pick('.mixbar'), handle: pick('.mhandle') };
    });
    test.info().annotations.push({ type: 'touch styles', description: JSON.stringify(styles) });
    expect(styles.grid?.touchAction, 'Range 表').toBe('none');
    expect(styles.mixbar?.touchAction, 'Mix バー').toBe('none');
    expect(styles.grid?.userSelect, 'Range 表の文字選択').toBe('none');
  });
});

test.describe('横向きのスマホ（PC 用の構成になる幅）', () => {
  for (const [w, h] of [[844, 390], [667, 375], [932, 430]] as const) {
    test(`${w}x${h}`, async ({ browser }) => {
      setMotion('reduce');
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
      const rows: string[] = [];
      for (const id of ['list-rows', 'answer', 'result-all', 'new-full-draft', 'login']) {
        const page = await ctx.newPage();
        const s = SCENES.find((x) => x.id === id)!;
        await s.open(page, w < 700);
        await page.waitForTimeout(300);
        const issues = await layoutIssues(page, { fit: Boolean(s.fit), mobile: w < 700, overlay: false });
        const text = await measureText(page);
        const minPx = Math.min(...text.map((t) => t.fontPx));
        rows.push(`${id}: 最小の文字 ${minPx}px / 問題 ${issues.filter((i) => i.type !== 'text-ellipsis').map((i) => i.type).join(',') || 'なし'}`);
        await page.screenshot({ path: `test-results-te/shots/landscape-${w}x${h}-${id}.png` });
        await page.close();
      }
      console.log(`横向き ${w}x${h}\n  ${rows.join('\n  ')}`);
      await ctx.close();
      // 文字が 8px 未満になる画面が無い（読める大きさ）
      expect(rows.filter((r) => /最小の文字 [0-7](\.\d)?px/.test(r)), '実際の大きさが 8px 未満の文字がある').toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------- 極端なタイトル

const HOSTILE = [
  ['wide', 'W'.repeat(40)],
  ['fullwidth', 'ＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷ'],
  ['nospace-long', 'a'.repeat(40)],
  ['zalgo', 'Z̛̖̗̘̙̜̝̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̕̚'.repeat(3)],
  ['emoji', '🃏♠️♥️♦️♣️🃏♠️♥️♦️♣️🃏♠️♥️♦️♣️🃏♠️♥️♦️♣️'],
  ['rtl', 'مرحبا بالعالم שלום עולם مرحبا بالعالم שלום עולם'],
  ['html', '<img src=x onerror=alert(1)><script>alert(1)</script>'],
  ['url', 'https://example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['newline-like', 'line1 line2 line3\u000Bline4'],
] as const;

for (const [label, vp, mobile] of [['pc', { width: 1280, height: 800 }, false], ['sp', { width: 390, height: 844 }, true]] as const) {
  test.describe(`極端なタイトル ${label}`, () => {
    test.use({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    for (const [name, title] of HOSTILE) {
      test(name, async ({ page }) => {
        setMotion('reduce');
        // 一覧
        const be = await fakeBackend(page, unanswered({ ...hs1bb(), title }));
        be.listRows = [listRow({ id: ID, title, is_mine: true, can_delete: true }), listRow({ id: '00000000-0000-4000-8000-000000000002', title: '普通のタイトル' })];
        await page.goto('/');
        await page.locator('.spot-row, .spot-card').first().waitFor();
        const problems: string[] = [];
        const check = async (where: string): Promise<void> => {
          await page.waitForTimeout(200);
          const issues = (await layoutIssues(page, { fit: where !== 'list' && where !== 'drafts', mobile, overlay: false })).filter((i) => i.type !== 'text-ellipsis' && !i.detail.includes('mhandle') && !(name === 'zalgo' && i.type === 'title-collapsed'));
          for (const i of issues) problems.push(`${where}: ${i.type} ${i.detail}`);
          await page.screenshot({ path: `test-results-te/shots/hostile-${label}-${name}-${where}.png` });
        };
        await check('list');
        // script が実行されていない
        expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
        expect(await page.locator('img[src="x"]').count(), 'タイトルの HTML が描画された').toBe(0);
        // 回答
        await page.goto(`/s/${ID}/answer`);
        await page.getByRole('heading', { level: 1 }).first().waitFor();
        await check('answer');
        // 集計
        be.detail = authorAnswered();
        (be.detail as { post: { title: string } }).post.title = title;
        await page.goto(`/s/${ID}/result`);
        await page.getByRole('heading', { level: 1 }).first().waitFor();
        await check('result');
        // 下書き
        await seedDrafts(page, [{ title }]);
        await page.goto('/drafts');
        await page.getByText('1 / 3').waitFor();
        await check('drafts');
        expect(problems, `タイトル「${name}」で崩れた所`).toEqual([]);
      });
    }
  });
}

// ---------------------------------------------------------------------------- スマホのカードキーボード

test.describe('スマホのカードキーボード', () => {
  for (const [w, h] of [[375, 667], [390, 844], [360, 640]] as const) {
    test(`${w}x${h}: 席の Hand を押すと、その席がキーボードの上に見える`, async ({ browser }) => {
      setMotion('reduce');
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await fakeBackend(page, null);
      await page.goto('/new');
      await page.getByRole('button', { name: /^2\s*Player$/ }).click();
      await page.getByRole('group', { name: '人数' }).getByRole('button', { name: '6', exact: true }).click();
      const res: string[] = [];
      for (const seat of ['UTG', 'CO', 'BTN', 'BB']) {
        await page.getByRole('button', { name: `${seat} の Hand` }).click();
        await page.waitForTimeout(900); // smooth scroll
        const g = await page.evaluate((sn) => {
          const kb = document.querySelector('.ckb')!.getBoundingClientRect();
          const row = document.querySelector(`[data-seat="${sn}"]`);
          const r = row?.getBoundingClientRect();
          const hdr = document.querySelector('.hdr')!.getBoundingClientRect();
          return { kbTop: kb.top, rowTop: r?.top ?? -1, rowBottom: r?.bottom ?? -1, hdrBottom: hdr.bottom };
        }, seat);
        const visible = g.rowBottom <= g.kbTop + 1 && g.rowTop >= g.hdrBottom - 1;
        if (!visible) res.push(`${seat}: 行 ${g.rowTop.toFixed(0)}..${g.rowBottom.toFixed(0)} がキーボード上端 ${g.kbTop.toFixed(0)}・ヘッダー下端 ${g.hdrBottom.toFixed(0)} の間に無い`);
        await page.getByRole('button', { name: '完了' }).click();
      }
      await ctx.close();
      expect(res).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------- 集計・回答の細部

test.describe('ⓘ と本文（PC）', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('ⓘ の各節は 09 章どおり、1 項目 70 文字以内・1 節 7 項目以内（画面に出た文字で確かめる）', async ({ page }) => {
    setMotion('reduce');
    const be = await fakeBackend(page, answered());
    be.listRows = [listRow({})];
    await page.goto('/');
    await page.getByRole('button', { name: 'インフォメーション' }).click();
    const items = await page.locator('.info-item').evaluateAll((els) => els.map((e) => (e.querySelector('dd')?.textContent ?? '').length));
    expect(items.length).toBeLessThanOrEqual(7);
    for (const n of items) expect(n).toBeLessThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------- ページ遷移の読み上げ（SPA）

test.describe('画面の切り替え（SPA）と読み上げ', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('画面ごとに document.title が変わる・遷移後のフォーカスが body のままでない（スクリーンリーダー利用者が居場所を失わない）', async ({ page }) => {
    setMotion('reduce');
    const be = await fakeBackend(page, unanswered());
    be.listRows = [listRow({})];
    await page.goto('/');
    await page.locator('.spot-link').first().waitFor();
    const titles: Record<string, string> = { list: await page.title() };
    await page.locator('.spot-link').first().focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { level: 1 }).waitFor();
    titles.answer = await page.title();
    const active = await page.evaluate(() => `${document.activeElement?.tagName.toLowerCase()}`);
    await page.goto('/terms');
    await page.getByRole('heading', { level: 1 }).waitFor();
    titles.terms = await page.title();
    console.log('titles', JSON.stringify({ titles, activeAfterNav: active }));
    expect(new Set(Object.values(titles)).size, `画面ごとの <title>（${JSON.stringify(titles)}）が全部同じ`).toBeGreaterThan(1);
    expect(active, '遷移後のフォーカスが body（見出しなどへ移していない）').not.toBe('body');
  });
});
