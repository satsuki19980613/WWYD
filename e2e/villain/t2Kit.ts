/**
 * T2（Villain・MTT の投稿画面）の共通の部品。
 * - 下書きを localStorage に直接入れて開く（Action の列を画面で 1 手ずつ入れずに、任意の局面から始める）
 * - 捕まえていない例外・console.error を自動で見張る（test の最後に 0 件を確かめる）
 */
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { acts } from '../../packages/core/src/poker/testHelpers.ts';
import type { Action } from '../../packages/core/src/poker/state.ts';
import { UID } from '../fakeBackend.ts';
import { fakeCreatePost, fakeBackend, watchErrors, type CreatePostCall } from '../release/taKit.ts';
import { isMobile, S_SETTINGS, S_SPOT, step } from '../release/taPost.ts';

export { expect, isMobile, step, S_SPOT, S_SETTINGS };
export { acts };

export const DRAFT_KEY = `wwyd.drafts.v1.${UID}`;
export const PRESET_KEY = `wwyd.readPresets.${UID}`;
export const PRESET_KEY_V1 = `wwyd.readPresets.v1.${UID}`;

/** 捕まえていない例外と console.error を見張り、テストの最後に 0 件を確かめる */
export const test = base.extend<{ errs: string[] }>({
  errs: [
    async ({ page }, use) => {
      const errs = watchErrors(page);
      await use(errs);
      expect(errs).toEqual([]);
    },
    { auto: true },
  ],
});

type Pos = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
const POS: Pos[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export type DraftSpec = {
  hero: Pos;
  hands?: Partial<Record<Pos, string>>;
  actions: Action[];
  board: string[];
  spotIndex: number | null;
  players?: number;
  title?: string;
  fmt?: 'cash' | 'mtt';
  reads?: unknown;
  mtt?: unknown;
  stacks?: Partial<Record<Pos, string>>;
};

/** 下書きの JSON（draft.ts の Draft と同じ形） */
export function draftJson(s: DraftSpec): Record<string, unknown> {
  const each = (f: (p: Pos) => string): Record<string, string> => Object.fromEntries(POS.map((p) => [p, f(p)]));
  return {
    fmt: s.fmt ?? 'cash',
    sb: '0.5',
    ante: '0',
    rake: '',
    players: s.players ?? 6,
    stacks: each((p) => s.stacks?.[p] ?? '100'),
    hero: s.hero,
    hands: each((p) => s.hands?.[p] ?? ''),
    actions: s.actions,
    board: s.board,
    spotIndex: s.spotIndex,
    title: s.title ?? 'T2 seed',
    reads: s.reads ?? {},
    mtt: s.mtt ?? { speed: null, prize: null, rank: '', left: '', paid: '', entries: '', avg: '' },
  };
}

/** 保存済みの下書きとして localStorage に入れておく（ページを開く前に） */
export async function seedDraftStore(page: Page, drafts: Record<string, unknown>[]): Promise<void> {
  const saved = drafts.map((d, i) => ({ id: `seed${i}`, savedAt: `2026-09-30T0${i}:00:00.000Z`, draft: d }));
  await page.addInitScript(
    ([k, v]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(k as string, v as string);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [DRAFT_KEY, JSON.stringify(saved)],
  );
}

/** localStorage に任意の値を入れてから開く（ページの最初の 1 回だけ） */
export async function seedStorage(page: Page, entries: Record<string, string>): Promise<void> {
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('seededKv')) return;
    sessionStorage.setItem('seededKv', '1');
    for (const [k, v] of Object.entries(e as Record<string, string>)) localStorage.setItem(k, v);
  }, entries);
}

/** 下書きを開いて /new に入る（偽のバックエンド・create-post の偽もつなぐ） */
export async function openDraft(page: Page, draft: Record<string, unknown>): Promise<{ cp: { calls: CreatePostCall[] } }> {
  await fakeBackend(page, null);
  const cp = await fakeCreatePost(page);
  await seedDraftStore(page, [draft]);
  await page.goto('/drafts');
  await page.getByRole('link', { name: String(draft.title ?? 'T2 seed') }).click();
  await expect(page).toHaveURL('/new');
  return { cp };
}

export const villains = (page: Page): Locator => page.getByRole('region', { name: 'Villain' });
export const slider = (page: Page, name: string): Locator => page.getByRole('slider', { name, exact: true });
export const seatBtn = (page: Page, p: string): Locator => villains(page).getByRole('button', { name: `${p} の Villain の情報` });

/** 席を開く（開いていれば何もしない） */
export async function openSeat(page: Page, p: string): Promise<void> {
  const b = seatBtn(page, p);
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
}

export const noOverflow = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ---- 局面 ----

const FLOP = ['Kh', '8d', '3c'];
const TURN = ['Kh', '8d', '3c', '2s'];

/** SRP。Hero=BTN。BTN Open、SB Fold、BB Call。Flop: BB x / BTN b1.8 / BB c。Turn: BB x / BTN b6.5 / BB f。Spot: Turn の BTN の Bet（10） */
export function srpTurn(spot: number | null = 10): DraftSpec {
  return {
    hero: 'BTN',
    hands: { BTN: 'AdKd', BB: 'QsJc' },
    actions: acts({ pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN b1.8, BB c', turn: 'BB x, BTN b6.5, BB f' }),
    board: TURN,
    spotIndex: spot,
  };
}

/**
 * Hero=BB。CO Open、BTN 3-Bet、SB Fold、BB Call、CO Call。Flop K83: BB x、BTN b（C-Bet）、Spot は BB の次の手番。
 * BTN に候補が 2 つ（Preflop の 3-Bet と Flop の C-Bet）、CO は Call だけ（候補なし）。
 */
export function threeBetPot(): DraftSpec {
  return {
    hero: 'BB',
    hands: { BB: '9s9c', BTN: 'AhAd' },
    actions: acts({ pf: 'UTG f, HJ f, CO r2.5, BTN r8, SB f, BB c, CO c', flop: 'BB x, CO x, BTN b10, BB f, CO f' }),
    board: FLOP,
    spotIndex: 10, // BB の Flop の Fold（BTN の Bet を受ける）
  };
}

/**
 * Hero=BTN。CO Open、BTN Call、SB Fold、BB Call。Flop: BB b1.5（Donk）、CO r6、BTN c、BB r15、CO r40（2 回目の Raise）、Spot は BTN の Fold（11）。
 * CO に Flop の Raise が 2 回（Small と Big）。
 */
export function doubleRaise(): DraftSpec {
  return {
    hero: 'BTN',
    hands: { BTN: 'AdKd', CO: 'QhQd' },
    actions: acts({ pf: 'UTG f, HJ f, CO r2.5, BTN c, SB f, BB c', flop: 'BB b1.5, CO r6, BTN c, BB r15, CO r40, BTN f, BB f' }),
    board: FLOP,
    spotIndex: 11,
  };
}

export { TURN, FLOP };
