/**
 * T3（表示の機能テストと画面の品質）の共通の部品。偽のバックエンド（../fakeBackend.ts）に、Villain・MTT の情報つきの
 * get_post_detail を返す。試験用の手（Raw）は core の見本（postFixtures）を元に作る。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { mbbToBb } from '../../packages/core/src/money.ts';
import { acts } from '../../packages/core/src/poker/testHelpers.ts';
import { hs1, hs1bb, type Raw } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend, type Backend } from '../fakeBackend.ts';

export const ID = '00000000-0000-4000-8000-000000000001';
export const ID2 = '00000000-0000-4000-8000-000000000002';

export type Viewer = 'unanswered' | 'answered' | 'author';

/** Raw の action 列（金額は bb） */
export function rawActs(spec: Parameters<typeof acts>[0]): Raw[] {
  return acts(spec).map((a) => (a.to === undefined ? { ...a } : { ...a, to: mbbToBb(a.to) }));
}

/** H-S1 の BB の手番（Hero = BB。BTN が Open、BB が Call、Flop は BTN の C-Bet、Turn は BTN の Barrel に向き合う） */
export const baseHs1bb = (): Raw => hs1bb();

/**
 * Hero = BTN が Flop で Bet → BB が Raise（Check-Raise）して、Hero BTN の手番になる形（spot 8）。
 * pf: UTG〜CO Fold, BTN Open 2.5, SB Fold, BB Call（0〜5）。flop: BB Check（6）, BTN Bet 1.8（7）, BB Raise 6（8）。Hero の手番は 9。
 */
export function checkRaiseHand(): Raw {
  return {
    ...hs1(),
    title: 'BB の Check-Raise を受ける',
    actions: rawActs({
      pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
      flop: 'BB x, BTN b1.8, BB r6, BTN c',
      turn: 'BB x, BTN x',
      river: 'BB x, BTN x',
    }),
    spot_index: 9,
    derived: { street: 'flop', keys: ['fold', 'call', 's1'], s1_label: 'raise', min_to: 10.2, max_to: 97.5, pot_base: 15.1, effective_stack: 100, stop_index: 9 },
  };
}

/** 3 人（BTN・SB・BB）。Hero = BB。BTN が Open、SB が Call、BB が Call。Flop は SB が Check、Hero の手番 */
export function threeHanded(): Raw {
  return {
    ...hs1(),
    title: '3 人のポット',
    stacks: { BTN: 100, SB: 100, BB: 100 },
    hero: 'BB',
    hero_cards: ['Ks', 'Js'],
    known_cards: {},
    actions: rawActs({
      pf: 'BTN r2.5, SB c, BB c',
      flop: 'SB x, BB x, BTN b2, SB f, BB c',
      turn: 'BB x, BTN x',
      river: 'BB x, BTN x',
    }),
    spot_index: 4,
    derived: { street: 'flop', keys: ['check', 's1'], s1_label: 'bet', min_to: 1, max_to: 97.5, pot_base: 7.5, effective_stack: 100, stop_index: 4 },
  };
}

/** ヘッズアップ（BTN（SB）と BB）。Hero = BB */
export function headsUp(): Raw {
  return {
    ...hs1(),
    title: 'ヘッズアップ',
    stacks: { BTN: 100, BB: 100 },
    hero: 'BB',
    hero_cards: ['Ks', 'Js'],
    known_cards: {},
    actions: rawActs({
      pf: 'BTN r2.5, BB c',
      flop: 'BB x, BTN b2, BB c',
      turn: 'BB x, BTN x',
      river: 'BB x, BTN x',
    }),
    spot_index: 2,
    derived: { street: 'flop', keys: ['check', 's1'], s1_label: 'bet', min_to: 1, max_to: 97.5, pot_base: 5, effective_stack: 100, stop_index: 2 },
  };
}

export function detail(raw: Raw, viewer: Viewer = 'unanswered', over: Record<string, unknown> = {}): Record<string, unknown> {
  return detailJson(raw, { viewer, id: ID, answerCount: viewer === 'unanswered' ? 0 : 1, ...over });
}

export async function openAnswer(page: Page, raw: Raw, o: { motion?: 'reduce' | 'no-preference'; viewer?: Viewer } = {}): Promise<Backend> {
  await page.emulateMedia({ reducedMotion: o.motion ?? 'reduce' });
  const be = await fakeBackend(page, detail(raw, o.viewer ?? 'unanswered'));
  await page.goto(`/s/${ID}/answer`);
  return be;
}

export async function openResult(page: Page, raw: Raw, o: { motion?: 'reduce' | 'no-preference' } = {}): Promise<Backend> {
  await page.emulateMedia({ reducedMotion: o.motion ?? 'reduce' });
  const be = await fakeBackend(page, detail(raw, 'answered'));
  await page.goto(`/s/${ID}/result`);
  return be;
}

/** 横にはみ出していないか（ページ全体） */
export const noHScroll = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

export const isSp = (page: Page): boolean => (page.viewportSize()?.width ?? 1280) < 700;

/** 2 つの箱が重なっているか */
export async function overlaps(a: Locator, b: Locator): Promise<boolean> {
  const x = await a.boundingBox();
  const y = await b.boundingBox();
  if (!x || !y) return false;
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
}

/** 指定の要素の中の、見えている文字（text ノード）の一覧。sr-only・非表示は除く */
export function visibleTexts(page: Page, rootSel: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(sel))) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) {
        const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!t) continue;
        const el = n.parentElement;
        if (!el || el.closest('.sr-only')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        out.push(t);
      }
    }
    return out;
  }, rootSel);
}

export const JP = /[぀-ヿ㐀-鿿]/;
export const KATAKANA = /[ァ-ヺー]{2,}/g;

/** スマホの集計画面は Hand History のタブに卓がある。読み込み中の作り直しで要素が外れても、選ばれるまでやり直す */
export async function toHandHistoryTab(page: Page): Promise<void> {
  if (!isSp(page)) return;
  const tab = page.getByRole('tab', { name: 'Hand History' });
  await expect(async () => {
    await tab.click({ timeout: 2000 });
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}
