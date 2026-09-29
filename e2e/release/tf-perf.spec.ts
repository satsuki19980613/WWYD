/**
 * リリース前テスト F-01: 最初の表示（ログイン後の一覧）にかかる通信の量と回数。本番のビルド（preview。5216 番）で測る。
 * 前提: 本番の Neon の公開の住所を埋め込んでビルドし（tf-helpers.ts の冒頭）、preview を起動しておく。
 * 通信の量は「配信されたファイルの大きさ（生）」と「Cloudflare Pages が返す gzip / brotli の見積もり（node の zlib）」の両方を出す
 * （preview は圧縮しないので、圧縮後の大きさは手元で計算する）。
 */
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { guard, installFake, LAUNCH_ARGS, ORIGIN, watchErrors } from './tf-helpers.ts';

test.use({ launchOptions: { args: LAUNCH_ARGS } });

type Item = { path: string; type: string; status: number; raw: number; br: number; gz: number };

function collect(page: Page): Item[] {
  const items: Item[] = [];
  page.on('response', async (r) => {
    const url = r.url();
    if (!url.startsWith(ORIGIN) || url.includes('/api/auth/')) return;
    const body = await r.body().catch(() => Buffer.alloc(0));
    const path = new URL(url).pathname;
    const type = r.headers()['content-type'] ?? '';
    const text = /javascript|css|html|svg|json/.test(type);
    items.push({
      path,
      type,
      status: r.status(),
      raw: body.length,
      br: text ? brotliCompressSync(body).length : body.length,
      gz: text ? gzipSync(body).length : body.length,
    });
  });
  return items;
}

function summarize(items: Item[]): Record<string, { n: number; raw: number; br: number }> {
  const groups: Record<string, { n: number; raw: number; br: number }> = {};
  for (const it of items) {
    const k = /\.(woff2?)$/.test(it.path) ? 'font' : /\.js$/.test(it.path) ? 'js' : /\.css$/.test(it.path) ? 'css' : /\/ocr\//.test(it.path) ? 'ocr' : 'other';
    const g = (groups[k] ??= { n: 0, raw: 0, br: 0 });
    g.n++;
    g.raw += it.raw;
    g.br += it.br;
  }
  return groups;
}

for (const [name, sp] of [['PC', false], ['SP', true]] as const) {
  test(`F-01 最初の表示（ログイン済み → 一覧）の通信の量と回数 ${sp ? '@sp' : ''}`.trim(), async ({ page, context }) => {
    test.skip(sp !== (test.info().project.name === 'sp'), 'プロジェクトが違う');
    const escaped = await guard(context);
    const errs = watchErrors(page);
    const fake = await installFake(page);
    const items = collect(page);
    const t0 = Date.now();
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('.spot-row, .spot-card').first()).toBeVisible();
    const tList = Date.now() - t0;
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1;
      return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(fcp) };
    });
    const sum = summarize(items);
    const total = Object.values(sum).reduce((a, g) => ({ n: a.n + g.n, raw: a.raw + g.raw, br: a.br + g.br }), { n: 0, raw: 0, br: 0 });
    // eslint-disable-next-line no-console
    console.log(
      `F-01 [${name}] 一覧が出るまで ${tList}ms（偽の応答・遅延なし） nav=${JSON.stringify(nav)}\n` +
        `  自サイトの静的ファイル: ${JSON.stringify(sum)}\n  合計: ${total.n} 件, 生 ${(total.raw / 1024).toFixed(0)}KB, 圧縮後(br) ${(total.br / 1024).toFixed(0)}KB\n` +
        `  Neon 側の要求: ${JSON.stringify(fake.counts())}\n` +
        items
          .filter((i) => !/\.(woff2?)$/.test(i.path))
          .map((i) => `    ${i.status} ${i.path} raw=${i.raw} br=${i.br}`)
          .join('\n') +
        '\n' +
        items
          .filter((i) => /\.(woff2?)$/.test(i.path))
          .map((i) => `    font ${i.path} ${i.raw}`)
          .join('\n'),
    );
    expect(escaped, '偽の応答が拾わなかった外部への通信').toEqual([]);
    expect(errs).toEqual([]);
    // 一覧の表示は Neon 側に whoami・list_posts の 2 回だけ（Auth は ok・get-session・token の 3 回）
    expect(fake.counts()).toEqual({
      'auth:ok': 1,
      'auth:get-session': 1,
      'auth:token': 1,
      'data:rpc/whoami': 1,
      'data:rpc/list_posts': 1,
    });
  });
}
