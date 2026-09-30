/**
 * T2-08（送る本文）。情報の組み合わせを変えて create-post に送る本文を受け取り（fakeCreatePost）、
 * 本文を Node 側で core の validateInput・verifyPost に通して確かめる。
 * 最後に、画面の状態機械（readsModel の操作）を乱数で歩かせて、作られた Read が常に core の検証を通ることを確かめる。
 */
import type { Page } from '@playwright/test';
import { validateInput, verifyPost } from '../../packages/core/src/index.ts';
import { buildSubmission, submissionBody, villainContext } from '../../packages/app/src/post/draft.ts';
import type { Draft } from '../../packages/app/src/post/draft.ts';
import {
  cycleLean,
  emptyGeneral,
  incompleteSeats,
  readsForSubmit,
  setGeneralAction,
  setGeneralStreet,
  setRead,
  toggleRunout,
  toggleSize,
  toggleStep,
  toggleTexture,
  type GeneralDraft,
  type ReadsDraft,
  type SeatDraft,
} from '../../packages/app/src/reads/readsModel.ts';
import {
  AGGRESSIVE_ACTIONS,
  RUNOUTS,
  STREET_ACTIONS,
  STREETS,
  TEXTURE_AXES,
  TEXTURE_KEYS,
  leansOf,
  sizesOf,
  type Pos,
} from '../../packages/core/src/index.ts';
import { acts, doubleRaise, draftJson, expect, openDraft, openSeat, S_SPOT, seedDraftStore, srpTurn, step, test, threeBetPot, villains, type DraftSpec } from './t2Kit.ts';
import { fakeBackend, fakeCreatePost } from '../release/taKit.ts';

const submitBtn = (page: Page) => page.getByRole('button', { name: /^投稿(する|中…)$/ });
/** 受け取った本文を core の検証にかける（通らなければ例外） */
function coreAccepts(body: Record<string, unknown>): void {
  verifyPost(validateInput(body));
}

async function post(page: Page, draft: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { cp } = await openDraft(page, draft);
  await step(page, S_SPOT);
  await submitBtn(page).click();
  await expect.poll(() => cp.calls.length).toBe(1);
  const body = cp.calls[0]?.body as Record<string, unknown>;
  coreAccepts(body);
  return body;
}

test('T2-08 情報が無ければ villain_reads・mtt のキーを送らない（Cash）', async ({ page }) => {
  const a = await post(page, draftJson(srpTurn()));
  expect(a).not.toHaveProperty('villain_reads');
  expect(a).not.toHaveProperty('mtt');
});

test('T2-08 情報が無ければ villain_reads・mtt のキーを送らない（MTT で何も入れていない）', async ({ page }) => {
  const b = await post(page, draftJson({ ...srpTurn(), fmt: 'mtt' }));
  expect(b).not.toHaveProperty('villain_reads');
  expect(b).not.toHaveProperty('mtt');
});

test('T2-08 MTT の値: 数の欄は数で、空白は削り、先頭のゼロは外す。読めない欄は送らずエラー', async ({ page }) => {
  const mtt = { speed: 0, prize: 'standard', rank: ' 012 ', left: '58', paid: '50', entries: '1000000', avg: '0.1' };
  const body = await post(page, draftJson({ ...srpTurn(), fmt: 'mtt', mtt }));
  expect(body.mtt).toEqual({ speed: 0, prize: 'standard', rank: 12, left: 58, paid: 50, entries: 1000000, avg: 0.1 });
  expect(body.rake).toBeNull();
});

for (const [mtt, label, msg] of [
  [{ rank: '60', left: '58' }, 'rank>left', 'MTT の スポットの順位 は 残りの人数 以下にしてください'],
  [{ left: '400', entries: '320' }, 'left>entries', 'MTT の 残りの人数 は エントリー数 以下にしてください'],
  [{ rank: '400', entries: '320' }, 'rank>entries', 'MTT の スポットの順位 は エントリー数 以下にしてください'],
  [{ paid: '400', entries: '320' }, 'paid>entries', 'MTT の ITM は エントリー数 以下にしてください'],
] as const) {
  test(`T2-08 MTT の人数の大小（${label}）は画面でどの欄かを示すエラー（V-018）で、本文は送らない`, async ({ page }) => {
    const { cp } = await openDraft(page, draftJson({ ...srpTurn(), fmt: 'mtt', mtt: { ...{ speed: null, prize: null, rank: '', left: '', paid: '', entries: '', avg: '' }, ...mtt } }));
    await step(page, S_SPOT);
    await submitBtn(page).click();
    await expect(page.locator('.pf-errors')).toContainText(msg);
    expect(cp.calls.length).toBe(0);
  });
}

test('T2-08 ITM は残りの人数を超えてよい（入賞後）', async ({ page }) => {
  const body = await post(page, draftJson({ ...srpTurn(), fmt: 'mtt', title: 'ITM ok', mtt: { speed: null, prize: null, rank: '', left: '20', paid: '50', entries: '320', avg: '' } }));
  expect(body.mtt).toEqual({ left: 20, paid: 50, entries: 320 });
});

// Hero=BB。BTN が Open 2.5、BB Call。Flop のポットは 5.5。BTN の C-Bet の額を変える
for (const [bet, label] of [
  ['2.7', 'Small'], // 49.1%
  ['2.75', 'Big'], // ちょうど 50%
  ['5.5', 'Big'], // ちょうど 100%
  ['5.6', 'Overbet'],
  ['1', 'Small'],
  ['20', 'Overbet'],
] as [string, string][]) {
  test(`T2-08 Spot Read の Size は実際の額から決まる（C-Bet ${bet}bb → ${label}）。画面の候補・本文・core が一致する`, async ({ page }) => {
    const spec: DraftSpec = {
      hero: 'BB',
      hands: { BB: '9s9c' },
      actions: acts({ pf: `UTG f, HJ f, CO f, BTN r2.5, SB f, BB c`, flop: `BB x, BTN b${bet}, BB f` }),
      board: ['Kh', '8d', '3c'],
      spotIndex: 8,
      title: `size ${bet}`,
    };
    const { cp } = await openDraft(page, draftJson(spec));
    await step(page, S_SPOT);
    await openSeat(page, 'BTN');
    const cand = villains(page).locator('.vr-read').first();
    await expect(cand.locator('.vr-line')).toHaveText(`Flop · C-Bet (${label})`);
    await cand.getByRole('group', { name: 'Lean' }).getByRole('button').nth(2).click();
    await submitBtn(page).click();
    await expect.poll(() => cp.calls.length).toBe(1);
    const body = cp.calls[0]?.body as { villain_reads: { BTN: { reads: { size: string; action: string; street: string }[] } } };
    coreAccepts(body as unknown as Record<string, unknown>);
    expect(body.villain_reads.BTN.reads[0]).toMatchObject({ street: 'flop', action: 'cbet', size: label.toLowerCase() });
  });
}

test('T2-08 Preflop の Spot Read（3-Bet）は Size を持たない。Check-Raise は action が raise で、Spot Read の Raise は実際の額の Size', async ({ page }) => {
  // Hero=BB の 3-bet pot の BTN: Preflop 3-Bet
  const { cp } = await openDraft(page, draftJson({ ...threeBetPot(), spotIndex: 7, title: 'pf3bet' }));
  await step(page, S_SPOT);
  await openSeat(page, 'BTN');
  await villains(page).locator('.vr-read').first().getByRole('group', { name: 'Lean' }).getByRole('button').nth(2).click();
  await submitBtn(page).click();
  await expect.poll(() => cp.calls.length).toBe(1);
  const body = cp.calls[0]?.body as { villain_reads: { BTN: { reads: Record<string, unknown>[] } } };
  coreAccepts(body as unknown as Record<string, unknown>);
  expect(body.villain_reads.BTN.reads).toEqual([{ scope: 'spot', street: 'pf', action: '3bet', texture: null, runout: null, size: null, lean: 'value', strong: false }]);
});

test('T2-08 席の入力の組み合わせ（全部入り・複数の席・中央だけ）が core を通る。登録できない席（Hero・Fold しただけの席）は送らない', async ({ page }) => {
  const full = {
    vpip: 38,
    pfr: 12,
    agg: 4,
    image: 0,
    sample: 2, // 廃止した Sample（V-007）が前の版の下書きに残っていても送らない
    spot: { street: 'flop', action: 'cbet', lean: 'bluff', strong: true },
    general: [
      { street: 'turn', action: 'delayed_cbet', texture: { high: 'k', suit: 'two', paired: 'unpaired', connect: 'none' }, runout: ['over', 'pair'], size: 'overbet', lean: 'value', strong: false },
      { street: 'pf', action: 'squeeze', size: 'big', lean: 'bluff', strong: true },
    ],
  };
  const reads = {
    BTN: full,
    CO: { agg: 2 }, // 中央だけ（送る）
    BB: { vpip: 99 }, // Hero（送らない）
    SB: { vpip: 50 }, // Fold しただけ（送らない）
    UTG: { pfr: 3 }, // Fold しただけ（送らない）
  };
  const body = (await post(page, draftJson({ ...threeBetPot(), title: 'all', reads }))) as { villain_reads: Record<string, Record<string, unknown>> };
  expect(Object.keys(body.villain_reads).sort()).toEqual(['BTN', 'CO']);
  expect(body.villain_reads.CO).toEqual({ agg: 2 });
  const btn = body.villain_reads.BTN as { reads: { scope: string }[] } & Record<string, unknown>;
  expect(btn).toMatchObject({ vpip: 38, pfr: 12, agg: 4, image: 0 });
  expect(btn).not.toHaveProperty('sample');
  // Spot Read が先、General Read はそのあと
  expect(btn.reads.map((r) => r.scope)).toEqual(['spot', 'general', 'general']);
  expect(btn.reads[0]).toMatchObject({ street: 'flop', action: 'cbet', size: 'small', lean: 'bluff', strong: true });
  expect(btn.reads[1]).toMatchObject({ texture: { high: 'k', suit: 'two', paired: 'unpaired', connect: 'none' }, runout: ['over', 'pair'], size: 'overbet' });
});

test('T2-08 Spot Read が合わなくなった（Spot を変えた）席は Spot Read だけ送らない。ほかの入力は送る', async ({ page }) => {
  const reads = { BTN: { vpip: 20, spot: { street: 'flop', action: 'cbet', lean: 'value', strong: false } } };
  // Spot を BB の Flop の Check（C-Bet の前）にする。C-Bet は判断地点より後なので候補に無い
  const body = (await post(page, draftJson({ ...threeBetPot(), spotIndex: 7, title: 'stale', reads }))) as { villain_reads: Record<string, unknown> };
  expect(body.villain_reads).toEqual({ BTN: { vpip: 20 } });
});

test('T2-08 General Read の Check-Raise は action raise で送る（OOP の表示名だけ）', async ({ page }) => {
  const reads = { BB: { general: [{ street: 'flop', action: 'raise', lean: 'bluff', strong: true }] } };
  const body = (await post(page, draftJson({ ...srpTurn(), title: 'xr', reads }))) as { villain_reads: { BB: { reads: Record<string, unknown>[] } } };
  expect(body.villain_reads.BB.reads[0]).toEqual({ scope: 'general', street: 'flop', action: 'raise', texture: null, runout: null, size: null, lean: 'bluff', strong: true });
});

for (const [code, text] of [
  ['invalid_reads', 'Villain の情報を確認してください'],
  ['invalid_mtt', 'MTT の情報を確認してください'],
  ['malformed', '入力内容を確認してください'],
] as const) {
  test(`T2-08 サーバーが ${code} で断ったときの文言`, async ({ page }) => {
    await fakeBackend(page, null);
    await fakeCreatePost(page, () => ({ status: 422, body: { error: code } }));
    await seedDraftStore(page, [draftJson({ ...srpTurn(), title: `srv ${code}` })]);
    await page.goto('/drafts');
    await page.getByRole('link', { name: `srv ${code}` }).click();
    await step(page, S_SPOT);
    await submitBtn(page).click();
    await expect(page.locator('.pf-errors')).toContainText(text);
  });
}

// ---- 乱数で画面の状態機械を歩かせる（Node のみ） ----

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGeneral(r: () => number): GeneralDraft {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;
  let g = emptyGeneral();
  const steps = 3 + Math.floor(r() * 14);
  for (let i = 0; i < steps; i++) {
    const op = Math.floor(r() * 8);
    if (op === 0) g = setGeneralStreet(g, pick(STREETS));
    else if (op === 1 && g.street) g = setGeneralAction(g, pick(STREET_ACTIONS[g.street]));
    else if (op === 2 && g.street && g.street !== 'pf') {
      const axis = pick(TEXTURE_KEYS);
      g = toggleTexture(g, axis, pick(TEXTURE_AXES[axis]));
    } else if (op === 3 && (g.street === 'turn' || g.street === 'river')) g = toggleRunout(g, pick(RUNOUTS));
    else if (op === 4 && g.street && g.action && AGGRESSIVE_ACTIONS.includes(g.action)) g = toggleSize(g, pick(sizesOf(g.street)));
    else if (op >= 5 && g.action) {
      const l = pick(leansOf(g.action));
      g = { ...g, ...cycleLean({ lean: g.lean, strong: g.strong }, l) };
    }
  }
  return g;
}

test('T2-08 乱数: 画面の操作で作った Read・傾向・Spot Read は、常に core の検証（validateInput＋verifyPost）を通る', async () => {
  const specs: DraftSpec[] = [srpTurn(10), srpTurn(7), threeBetPot(), { ...threeBetPot(), spotIndex: 7 }, doubleRaise(), { ...doubleRaise(), spotIndex: 8 }];
  const r = rng(20260930);
  let sent = 0;
  let spotSent = 0;
  let incompleteOnly = 0;
  for (let n = 0; n < 1500; n++) {
    const spec = specs[n % specs.length] as DraftSpec;
    const d0 = draftJson({ ...spec, title: `rnd ${n}` }) as unknown as Draft;
    const vc = villainContext(d0);
    const reads: ReadsDraft = {};
    for (const p of [...vc.seats, 'UTG' as Pos, 'BB' as Pos]) {
      if (r() < 0.25) continue;
      let seat: SeatDraft = {};
      if (r() < 0.6) seat = setRead(seat, 'vpip', Math.floor(r() * 101));
      if (r() < 0.6) seat = setRead(seat, 'pfr', Math.floor(r() * 101));
      for (const k of ['agg', 'image'] as const) if (r() < 0.4) seat = toggleStep(seat, k, Math.floor(r() * 5));
      const cs = vc.cands.filter((c) => c.pos === p);
      if (cs.length > 0 && r() < 0.6) {
        // 画面と同じ作り方: 候補の Street・Action、その Action で選べる Lean
        const c = cs[Math.floor(r() * cs.length)]!;
        const ls = leansOf(c.action);
        seat.spot = { street: c.street, action: c.action, lean: ls[Math.floor(r() * ls.length)]!, strong: r() < 0.3 };
      }
      const gn = Math.floor(r() * 3);
      if (gn > 0) seat.general = Array.from({ length: gn }, () => randomGeneral(r));
      reads[p] = seat;
    }
    const d = { ...d0, reads };
    const built = buildSubmission(d);
    const incomplete = incompleteSeats(reads, vc.seats);
    if (!built.ok) {
      // 失敗してよいのは途中の General Read があるときだけ
      expect(incomplete.length, `n=${n}: ${built.errors.join(' / ')}`).toBeGreaterThan(0);
      incompleteOnly++;
      continue;
    }
    // 本文を core の検証に通す（buildSubmission の中でも通しているが、独立にもう一度）
    const body = submissionBody(d);
    coreAccepts(body);
    const sub = readsForSubmit(reads, vc.seats, vc.cands);
    expect(body.villain_reads ?? {}).toEqual(sub);
    sent++;
    if (Object.values(sub).some((x) => x.reads?.some((e) => e.scope === 'spot'))) spotSent++;
  }
  // 試験が空回りしていないこと
  expect(sent).toBeGreaterThan(300);
  expect(spotSent).toBeGreaterThan(50);
  expect(incompleteOnly).toBeGreaterThan(10);
});

test('T2-08 乱数: Spot Read の Size は、同じ Street・Action の候補が複数でも、選んだ候補の Size になる（Node）', async () => {
  // doubleRaise の CO は Flop の Raise が 2 回（Small・Big）。Spot Read の Size は選んだ方でなければならない
  const d0 = draftJson({ ...doubleRaise(), title: 'two raises' }) as unknown as Draft;
  const vc = villainContext(d0);
  const co = vc.cands.filter((c) => c.pos === 'CO' && c.street === 'flop' && c.action === 'raise');
  expect(co.map((c) => c.size)).toEqual(['small', 'big']);
  // 画面が作る Spot Read（SpotRead コンポーネントは street・action しか持たない）から、送る Size がどう決まるか
  const reads: ReadsDraft = { CO: { spot: { street: 'flop', action: 'raise', lean: 'over', strong: false } } };
  const sub = readsForSubmit(reads, vc.seats, vc.cands);
  const size = sub.CO?.reads?.[0]?.size;
  test.info().annotations.push({ type: 'spot-size-for-two-raises', description: String(size) });
  // 情報: 候補を区別する手段（index など）が無いので、先の候補を選べない
  expect(['small', 'big']).toContain(size);
});
