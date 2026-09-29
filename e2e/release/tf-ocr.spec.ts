/**
 * リリース前テスト F-04: アプリでの OCR（本番のビルド。preview の 5216 番）。実際の T4 画像（sample/。個人の画像なのでコピー・コミットしない）を
 * 絶対パスで `setInputFiles` に渡す。1 枚あたりの時間（起動からの初回と 2 回目以降）、読み込み中の取り消し（Worker の停止、取り消し後の再読み取り）、
 * 画像が外へ出ないこと（自サイト以外への通信・POST が 0 件）を確かめる。
 * 精度そのもの（ボード・プレイヤー・アクション）は `npm run ocr:accuracy`（scripts/ocr/accuracy.mts）が測る。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { guard, installFake, LAUNCH_ARGS, ORIGIN, watchErrors } from './tf-helpers.ts';

test.use({ launchOptions: { args: LAUNCH_ARGS } });

const SAMPLE = process.env.TF_SAMPLE_DIR ?? resolve(process.cwd(), '../../../sample');

function images(kind: 'pc' | 'sp', n: number): string[] {
  const dir = join(SAMPLE, kind);
  if (!existsSync(dir)) return [];
  const all = readdirSync(dir).filter((f) => f.endsWith('.png') && existsSync(join(dir, f.replace(/\.png$/, '.expected.json'))));
  // Flop 以降に Hero の Action がある画像（投稿できるハンド）を優先して n 枚。足りなければ残りから
  const postable = all.filter((f) => {
    const e = JSON.parse(readFileSync(join(dir, f.replace(/\.png$/, '.expected.json')), 'utf8')) as { hero: string; actions: { pos: string | null; street: string }[] };
    return e.actions.some((a) => a.pos === e.hero && a.street !== 'pf');
  });
  const pool = [...postable, ...all.filter((f) => !postable.includes(f))];
  const step = Math.max(1, Math.floor(postable.length / n));
  return Array.from({ length: n }, (_, i) => join(dir, pool[Math.min(pool.length - 1, i * step)] as string));
}

/** 読み取りを始め、結果（確認画面・エラーの表示）が出るまでの時間（ms）を返す */
async function readOne(page: Page, file: string): Promise<{ ms: number; outcome: 'review' | 'error' }> {
  const t0 = Date.now();
  await page.getByTestId('ocr-file').setInputFiles(file);
  const review = page.getByRole('dialog', { name: '読み取り結果' });
  const alert = page.getByRole('alert');
  await expect(review.or(alert.first())).toBeVisible({ timeout: 60_000 });
  const ms = Date.now() - t0;
  return { ms, outcome: (await review.count()) > 0 ? 'review' : 'error' };
}

async function closeReview(page: Page): Promise<void> {
  const review = page.getByRole('dialog', { name: '読み取り結果' });
  if ((await review.count()) > 0) await review.getByRole('button', { name: 'やめる' }).click();
  await expect(review).toHaveCount(0);
}

for (const kind of ['pc', 'sp'] as const) {
  test(`F-04 アプリでの読み取りの時間と通信（${kind} の画像 5 枚、続けて）${kind === 'sp' ? ' @sp' : ''}`, async ({ page, context }) => {
    test.setTimeout(240_000);
    const files = images(kind, 5);
    test.skip(files.length === 0, `sample/${kind} が無い`);
    const escaped = await guard(context);
    const errs = watchErrors(page);
    await installFake(page);
    const reqs: { url: string; method: string; post: number; type: string }[] = [];
    context.on('request', (r) => reqs.push({ url: r.url(), method: r.method(), post: r.postData()?.length ?? 0, type: r.resourceType() }));
    const respSizes: Record<string, number> = {};
    page.on('response', async (r) => {
      if (r.url().includes('/ocr/')) respSizes[new URL(r.url()).pathname] = (await r.body().catch(() => Buffer.alloc(0))).length;
    });
    await page.goto(`${ORIGIN}/new`);
    await expect(page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' })).toBeVisible();
    const times: string[] = [];
    for (const f of files) {
      const r = await readOne(page, f);
      times.push(`${r.ms}ms(${r.outcome})`);
      await closeReview(page);
      // 「読み取れませんでした」以外のエラー（Preflop の All-in・候補なし）は仕様どおりの拒否
      const alerts = await page.getByRole("alert").allInnerTexts();
      if (alerts.length) times.push(`[${alerts.join("|")}]`);
      expect(alerts.filter((a) => /読み取れませんでした/.test(a)), `${f}: 読み取れなかった`).toEqual([]);
    }
    // eslint-disable-next-line no-console
    console.log(`F-04 [${kind}] 画像 ${files.length} 枚の所要時間（アプリ、初回は Worker・学習データの読み込み込み）: ${times.join(', ')}`);
    // eslint-disable-next-line no-console
    console.log(`F-04 [${kind}] /ocr/ の配信: ${JSON.stringify(respSizes)}`);
    const own = new URL(ORIGIN).origin;
    const outside = reqs.filter((r) => !r.url.startsWith(own) && !r.url.startsWith('data:') && !r.url.startsWith('blob:') && !/\.neon\.tech/.test(r.url));
    expect(outside, '自サイト・Neon 以外への通信').toEqual([]);
    // 画像を送りうる POST・大きな本文が無い（Neon への通信は偽の応答。OCR の間は要求自体が無いはず）
    expect(reqs.filter((r) => r.method !== 'GET' && r.post > 10_000)).toEqual([]);
    expect(reqs.filter((r) => r.type === 'ping' || r.type === 'beacon')).toEqual([]);
    expect(escaped).toEqual([]);
    expect(errs).toEqual([]);
  });
}

test('F-04 読み込み中の取り消し: いろいろな時点で取り消して、結果もエラーも出さず、次の読み取りが成功する', async ({ page, context }) => {
  test.setTimeout(240_000);
  const files = images('pc', 2);
  test.skip(files.length === 0, 'sample/pc が無い');
  await guard(context);
  const errs = watchErrors(page);
  await installFake(page);
  await page.goto(`${ORIGIN}/new`);
  const review = page.getByRole('dialog', { name: '読み取り結果' });
  const busy = page.getByRole('dialog', { name: '読み取り中…' });
  // 0（読み始めてすぐ）〜数秒（認識の途中）で取り消す
  for (const delay of [0, 100, 300, 700, 1200]) {
    await page.getByTestId('ocr-file').setInputFiles(files[0] as string);
    await expect(busy).toBeVisible();
    await page.waitForTimeout(delay);
    if ((await busy.count()) === 0) continue; // 速く終わってしまった
    await busy.getByRole('button', { name: 'キャンセル' }).click();
    await expect(busy).toHaveCount(0);
    await page.waitForTimeout(2500); // 取り消した読み取りが、あとから結果を出さない
    await expect(review).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  // 取り消しを何度も行ったあとに、通常の読み取りができる
  const r = await readOne(page, files[1] as string);
  expect(['review', 'error']).toContain(r.outcome);
  // F-04-1（S4）: tesseract.js は terminate 後の worker.postMessage が非同期関数の中で例外になり、握りつぶされずに pageerror になる
  // （取り消しのタイミングによる。画面には出ない）。既知なので数えるだけにして、それ以外のエラーがないことを確かめる
  const known = errs.filter((e) => /reading 'postMessage'/.test(e));
  test.info().annotations.push({ type: 'F-04-1', description: `取り消し時の pageerror（postMessage）${known.length} 件` });
  // 取り消しで中断された要求（ERR_ABORTED）は失敗として記録されるので除く
  expect(errs.filter((e) => !known.includes(e) && !/^requestfailed: .*ERR_ABORTED/.test(e))).toEqual([]);
});

test('F-04 学習データの読み込み中（遅い回線）に取り消す → 待たずに閉じ、遅れて届いても結果を出さない', async ({ page, context }) => {
  test.setTimeout(120_000);
  const files = images('pc', 1);
  test.skip(files.length === 0, 'sample/pc が無い');
  await guard(context);
  await installFake(page);
  await context.route('**/ocr/lang/**', async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    await route.continue().catch(() => undefined);
  });
  await page.goto(`${ORIGIN}/new`);
  const busy = page.getByRole('dialog', { name: '読み取り中…' });
  await page.getByTestId('ocr-file').setInputFiles(files[0] as string);
  await expect(busy).toBeVisible();
  const t0 = Date.now();
  await busy.getByRole('button', { name: 'キャンセル' }).click();
  await expect(busy).toHaveCount(0);
  expect(Date.now() - t0, '取り消しは即座に画面へ反映される').toBeLessThan(1000);
  await page.waitForTimeout(7000);
  await expect(page.getByRole('dialog', { name: '読み取り結果' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
