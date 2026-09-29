/**
 * T-A A-06（全画像）: sample/pc・sample/sp の T4 画像をすべて、実際の操作（読み込むボタン → ゲーム選択 → ファイル選択）で読み込み、
 * 確認画面の内容を正解（*.expected.json）と比べる。投稿できないハンドは確認画面を開かずにはじく（06 章 §3.9・16 章）。
 * あわせて、全画像の読み込みの間の通信を記録し、画像やその中身が自サイト以外へ送られていないこと、画像の Object URL を破棄していることを確かめる。
 * 画像は個人の対戦画像なのでリポジトリに置かない（元のリポジトリの sample/ から絶対パスで読むだけ）。
 */
import { expect, test } from '@playwright/test';
import { AUTH, DATA, fakeBackend } from './taKit.ts';
import { diffReview, heroHasPostflop, importImage, loadSamples, PREFLOP_ALLIN, readReview, UNREADABLE, type Sample } from './taOcr.ts';

async function sweep(page: import('@playwright/test').Page, baseURL: string | undefined, samples: Sample[], label: string): Promise<void> {
  test.setTimeout(20 * 60_000);
  const requests: { url: string; method: string; body: number; type: string }[] = [];
  page.context().on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postDataBuffer()?.length ?? 0, type: r.resourceType() }));
  await page.addInitScript(() => {
    const w = window as unknown as { __blobs: { created: string[]; revoked: string[] } };
    w.__blobs = { created: [], revoked: [] };
    const c = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (o: Blob | MediaSource): string => {
      const u = c(o);
      w.__blobs.created.push(u);
      return u;
    };
    const r = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (u: string): void => {
      w.__blobs.revoked.push(u);
      r(u);
    };
  });
  await fakeBackend(page, null);
  await page.goto('/new');

  let reviews = 0;
  const diffs: string[] = [];
  let handTotal = 0;
  let handBad = 0;
  let boardTotal = 0;
  let boardBad = 0;
  let actTotal = 0;
  let actBad = 0;
  const misclassified: string[] = [];
  const errorsSeen: Record<string, number> = {};
  for (const s of samples) {
    const out = await importImage(page, s.png);
    const postable = heroHasPostflop(s.expected);
    if (out.kind === 'error') {
      errorsSeen[out.message] = (errorsSeen[out.message] ?? 0) + 1;
      if (postable && out.message !== PREFLOP_ALLIN) misclassified.push(`${s.name}: 投稿できるはずが「${out.message}」`);
      if (!postable && out.message === UNREADABLE) misclassified.push(`${s.name}: 「${UNREADABLE}」（Hero に Flop 以降の Action が無い画像）`);
      continue;
    }
    reviews++;
    if (!postable) misclassified.push(`${s.name}: Hero に Flop 以降の Action が無いのに確認画面が開いた`);
    const review = page.getByRole('dialog', { name: '読み取り結果' });
    const v = await readReview(review);
    const d = diffReview(v, s.expected);
    for (const [pos, cards] of Object.entries(s.expected.hands)) {
      handTotal++;
      if ((v.hands[pos] ?? []).join('') !== cards.join('')) handBad++;
    }
    boardTotal++;
    if (v.board.join('') !== s.expected.board.join('')) boardBad++;
    s.expected.actions.forEach((a, i) => {
      actTotal++;
      const g = v.actions[i];
      const want = a.amount === null ? '' : String(a.amount);
      const verb = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' }[a.verb];
      if (!g || g.pos !== a.pos || g.verb !== verb || ((a.verb === 'bet' || a.verb === 'raise') && g.amount !== want)) actBad++;
    });
    if (d.length > 0) diffs.push(`${s.name}: ${d.join(' / ')}`);
    await review.getByRole('button', { name: 'やめる' }).click();
    await expect(review).toHaveCount(0);
  }

  const report = [
    `[${label}] 画像 ${samples.length} 枚 / 確認画面 ${reviews} 枚 / エラー ${JSON.stringify(errorsSeen)}`,
    `[${label}] Hand 誤り ${handBad}/${handTotal}、Board 誤り ${boardBad}/${boardTotal}、Action 誤り ${actBad}/${actTotal}`,
    ...diffs.slice(0, 40).map((x) => `[${label}] 違い ${x}`),
    ...misclassified.map((x) => `[${label}] 判定 ${x}`),
  ];
  console.log(report.join('\n'));

  // 通信: 全画像の読み込みの間、自サイトと偽のバックエンド以外へ行かない。自サイトへの POST・画像サイズの本文が無い
  const own = new URL(baseURL ?? '').origin;
  const allowed = new Set([own, new URL(AUTH).origin, new URL(DATA).origin]);
  const outside = requests.filter((r) => !/^(data|blob):/.test(r.url) && !allowed.has(new URL(r.url).origin));
  expect(outside.map((r) => r.url)).toEqual([]);
  const posts = requests.filter((r) => r.method !== 'GET' && r.method !== 'OPTIONS' && r.method !== 'HEAD');
  expect(posts.filter((r) => new URL(r.url).origin === own).map((r) => `${r.method} ${r.url}`)).toEqual([]);
  expect(Math.max(0, ...requests.map((r) => r.body))).toBeLessThan(2048);
  // 画像の Object URL は確認画面を閉じるたびに破棄している。ファイル入力に参照を残さない
  const blobs = await page.evaluate(() => (window as unknown as { __blobs: { created: string[]; revoked: string[] } }).__blobs);
  expect(blobs.created.length).toBe(reviews);
  expect([...blobs.revoked].sort()).toEqual([...blobs.created].sort());
  expect(await page.evaluate(() => (document.querySelector('[data-testid=ocr-file]') as HTMLInputElement).files?.length)).toBe(0);
  // 画像を IndexedDB・localStorage・sessionStorage に保存していない
  const stores = await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    return { idb: dbs.map((d) => d.name), ls: Object.keys(localStorage), ss: Object.keys(sessionStorage) };
  });
  expect(stores.idb).toEqual([]);
  expect(stores.ss).toEqual([]);
  expect(stores.ls.filter((k) => !k.startsWith('wwyd.'))).toEqual([]);

  // 判定と精度（package の合格ライン: ボード 100%・Player・Action 95% 以上）
  expect.soft(misclassified, '投稿できる・できないの判定').toEqual([]);
  if (boardTotal > 0) expect.soft(boardBad, 'Board の誤り').toBe(0);
  if (handTotal > 0) expect.soft(1 - handBad / handTotal, 'Hand の正解率').toBeGreaterThanOrEqual(0.95);
  if (actTotal > 0) expect.soft(1 - actBad / actTotal, 'Action の正解率').toBeGreaterThanOrEqual(0.95);
}

const pc = loadSamples('pc');
const sp = loadSamples('sp');

test.describe('A-06 全画像', () => {
  test.skip(pc.length + sp.length === 0, '試験画像（sample/）が無いので skip');

  test(`PC の画像 ${pc.length} 枚を PC の画面で読み込む`, async ({ page, baseURL }) => {
    test.skip(pc.length === 0);
    await sweep(page, baseURL, pc, 'pc画像');
  });

  test(`スマホの画像 ${sp.length} 枚をスマホの画面で読み込む @sp`, async ({ page, baseURL }) => {
    test.skip(sp.length === 0);
    await sweep(page, baseURL, sp, 'sp画像');
  });

  test(`PC の画像の一部をスマホの画面で、スマホの画像の一部を PC の画面で読み込んでも動く（画面の幅は画像に依らない）`, async ({ page, baseURL }) => {
    test.skip(pc.length === 0 || sp.length === 0);
    await sweep(page, baseURL, sp.slice(0, 6), 'sp画像をPC画面');
  });
});
