/**
 * T4-05（Villain・MTT の情報（P11）の総合テスト。docs/villain-reads-test-plan.md §3 T4）: 不変条件 10 の画面側の確認。
 * 未回答の回答画面で、Villain の席のモーダル・All Villains・MTT・History を開いても、判断地点より後の Action・River のカード・
 * Hero のハンドの手がかりが画面に出ない（偽のバックエンドは未回答者向けに切り詰めた応答を返す。サーバー側の強制は pgTAP の 91_villain_reads）。
 */
import { expect, test } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';
import { watchErrors } from '../release/taKit.ts';

const ID = '00000000-0000-4000-8000-000000000001';

// hs1bb: Hero = BB、Spot 11（Turn の BTN Bet 6.5 に向き合う）。River は BB x・BTN b15・BB c（判断地点より後）。BTN は Ad Kd、BB（Hero）は Ks Js
const READS = {
  BTN: {
    vpip: 40,
    reads: [
      { scope: 'spot', street: 'turn', action: 'barrel', texture: null, runout: null, size: 'big', lean: 'value', strong: true },
      { scope: 'general', street: 'river', action: 'barrel', texture: null, runout: null, size: 'overbet', lean: 'bluff', strong: false },
    ],
  },
  SB: { reads: [{ scope: 'spot', street: 'pf', action: 'fold_steal', texture: null, runout: null, size: null, lean: 'under', strong: false }] },
};
const MTT = { speed: 80, rank: 12, left: 58, paid: 50, entries: 320, avg: 35, prize: 'top' };

for (const v of ['', ' @sp'] as const) {
  test(`T4-05 未回答の画面の Villain・MTT・History の表示に、判断地点より後の手がかりが出ない${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeBackend(page, detailJson({ ...hs1bb(), fmt: 'mtt', rake: null, villain_reads: READS, mtt: MTT }, { viewer: 'unanswered', id: ID }));
    await page.goto(`/s/${ID}/answer`);
    await expect(page.locator('header h1')).toBeVisible();
    const seen: string[] = [];
    const grab = async (): Promise<void> => {
      seen.push(await page.locator('body').innerText());
      seen.push(await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label],[title]')).map((e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`).join('\n')));
    };
    await grab();
    for (const name of ['BTN の Villain の情報', 'SB の Villain の情報']) {
      await page.getByRole('button', { name }).click();
      await grab();
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'All Villains' }).click();
    await grab();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'MTT', exact: true }).click();
    await grab();
    await page.keyboard.press('Escape');
    if (v) {
      await page.getByRole('button', { name: 'History' }).click();
      await grab();
      await page.keyboard.press('Escape');
    }
    const all = seen.join('\n');
    // River の Action・額・カード（7♥）、Hero（BB）・BTN のハンドが、どの表示にも出ない
    expect(all).not.toMatch(/Bet\s*15/);
    expect(all).not.toMatch(/7♥|Heart の 7/);
    const hit = /Diamond の A|Diamond の K|Spade の K|Spade の J|A♦|K♦|K♠|J♠/.exec(all);
    expect(hit && all.slice(Math.max(0, hit.index - 80), hit.index + 80), '出てはいけないカード').toBeNull();
    expect(all).not.toMatch(/Hero（BB）実際の Action|実際の Action/);
    // General Read の River（投稿者が書いたもの）は回答の手がかりとして見える（設計どおり）。River の Action そのものは無い
    expect(all).toContain('River · Barrel (Overbet) → Bluff-heavy');
    expect(errors).toEqual([]);
  });
}
