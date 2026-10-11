import { expect, type Locator, type Page, type Worker } from '@playwright/test';

/**
 * 決めた時間だけ待つ（waitForTimeout）代わりに、画面の状態で待つための部品。
 * - 動き（CSS の遷移・アニメーション）が終わるまで
 * - 読んだ値（レイアウト・スクロールの位置など）が落ち着くまで
 * - 描画が進むまで（React の更新が画面に出るまで）
 * - 端末内 OCR の Worker が止まるまで
 */

/**
 * 要素（と、その中の要素）の終わりのある動き（CSS の遷移・アニメーション）がすべて終わるまで待つ。
 * getAnimations は保留中のスタイルを反映してから返すので、直前の操作で始まる遷移も含まれる。終わらない動き（infinite）は待たない。
 */
export async function animationsDone(target: Locator): Promise<void> {
  await target.evaluate(async (el) => {
    const finite = (): Animation[] => el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    // 途中で別の遷移に替わる（取り消される）ことがあるので、残りが無くなるまで繰り返す
    for (let list = finite(); list.length > 0; list = finite()) {
      await Promise.all(list.map((a) => a.finished.catch(() => undefined)));
    }
  });
}

/**
 * read() の値が続けて 2 回同じになるまで読み直し、落ち着いた値を返す（JSON にして比べる）。
 * レイアウト・スクロール・再描画が収まるのを、時間を決めずに待つ。収まらなければ expect.poll の時間切れで落ちる。
 */
export async function untilStable<T>(read: () => Promise<T>, message?: string): Promise<T> {
  let prev: string | undefined;
  let last: T | undefined;
  await expect
    .poll(
      async () => {
        last = await read();
        const cur = JSON.stringify(last);
        const same = cur === prev;
        prev = cur;
        return same;
      },
      { message: message ?? '値が落ち着かない', intervals: [50, 100, 250] },
    )
    .toBe(true);
  return last as T;
}

/** 描画を 2 回進める（直前に受け取った応答・イベントによる React の更新が画面に出るまで） */
export async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/**
 * 端末内 OCR の Worker（/ocr/worker）が作られて、止まる（terminate）まで待つ Promise。
 * 画像を選ぶ前に呼ぶ（作られるところから見る）。読み取りを取り消すと、アプリは Worker の準備ができたところで止める。
 */
export function ocrWorkerClosed(page: Page): Promise<void> {
  return page
    .waitForEvent('worker', { predicate: (w) => w.url().includes('/ocr/worker'), timeout: 30_000 })
    .then((w: Worker) => new Promise<void>((r) => w.once('close', () => r())));
}
