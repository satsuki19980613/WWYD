/**
 * T5-02 合法手のランダムウォーク＋ランダムな Read（投稿専用。docs/villain-reads-test-plan.md §3 T5-02）。前回の T-D（td-walk.ts）に、Villain・MTT の入力を足した。
 * 台のボタン（Fold / Check / Call / Bet・Raise・よく使う額）と Card の選択だけを押してハンドを最後まで入れ、Spot を選び、
 * 登録できる席にランダムな全体の傾向・Spot Read・General Read（MTT なら MTT の欄も）を画面の操作で入れて投稿する。
 * create-post への本文は偽の応答で受け取り、packages/core の validateInput + verifyPost（サーバーと同じ判定）を Node 側で通す。
 * 画面の判定（buildSubmission）とサーバーの判定が食い違えば不具合として記録する。
 */
import type { Page } from '@playwright/test';
import { formatBb, SEATS_BY_COUNT, type Pos } from '../../packages/core/src/index.ts';
import { mulberry32, type Rng } from './t5Kit.ts';
import { serverJudge } from './t5Gen.ts';

export { serverJudge };

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;
const RANKS = 'AKQJT98765432';
const cardName = (c: string): string => `${c[0]}${SUIT[c[1] as keyof typeof SUIT]}`;

export type WalkOutcome =
  | 'posted'
  | 'no-spot' // 最後まで入れたが Spot の候補が無い（Hero が Preflop で Fold など）。画面が止めたのは正しい
  | 'stuck' // 押せる合法手が無くなった・手数の上限
  | 'blocked' // 候補があり Spot・タイトルを入れたのに画面が送らなかった
  | 'server-reject' // 画面は送ったが、サーバーと同じ判定が断った（食い違い）
  | 'prefix'; // 途中まで入れて止めた（モンキーの出発点）

export type WalkResult = {
  seed: number;
  hand: number;
  outcome: WalkOutcome;
  players: number;
  actions: number;
  detail?: string;
  /** 再現用: 入力の記録 */
  script: string[];
  /** 投稿された本文（outcome が posted のとき） */
  body?: unknown;
  /** 入れた Read の数（Spot Read・General Read）と MTT の欄を入れたか */
  reads?: number;
  mtt?: boolean;
};

type Phase = {
  kind: 'invalid' | 'act' | 'board' | 'done';
  actions: number;
  board: number;
  spot: number | null;
  cands: number[];
  pos?: Pos;
  need?: number;
  legal?: {
    fold: boolean;
    check: boolean;
    call: number | null;
    bet: { min: number; max: number } | null;
    raise: { min: number; max: number } | null;
  };
  err?: string;
};

const ORACLE = `(async () => {
  try {
    const store = await import('/src/post/draftStore.ts');
    const dr = await import('/src/post/draft.ts');
    const d = dr.settleActions(store.getDraft());
    const ps = dr.parseSettings(d);
    const base = { actions: d.actions.length, board: d.board.length, spot: d.spotIndex, cands: dr.candidates(d).map((c) => c.index) };
    if (!ps.setup) return { kind: 'invalid', ...base };
    const ph = dr.phaseOf(ps.setup, d.actions, d.board);
    const out = { kind: ph.kind, ...base };
    if (ph.kind === 'act') { out.pos = ph.pos; out.legal = ph.legal; }
    if (ph.kind === 'board') out.need = ph.need;
    return out;
  } catch (e) { return { kind: 'invalid', actions: 0, board: 0, spot: null, cands: [], err: String(e && e.message || e) }; }
})()`;

export async function phaseNow(page: Page): Promise<Phase> {
  return (await page.evaluate(ORACLE)) as Phase;
}

function shuffled(rng: Rng): string[] {
  const deck: string[] = [];
  for (const r of RANKS) for (const s of 'shdc') deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [deck[i], deck[j]] = [deck[j] as string, deck[i] as string];
  }
  return deck;
}

export type WalkEnv = {
  page: Page;
  mobile: boolean;
  /** create-post に届いた本文の記録（setupBackend の ctx.posts） */
  posts: { body: unknown; status: number }[];
  judged: { ok: boolean; message: string; body: unknown }[];
};

async function step(env: WalkEnv, name: RegExp): Promise<void> {
  if (!env.mobile) return;
  await env.page.getByRole('navigation', { name: 'ステップ' }).getByRole('button', { name }).click();
}

/** 1 ハンドを入れて投稿する */
export async function walkHand(env: WalkEnv, seed: number, hand: number, opts: { stopAfterActions?: number } = {}): Promise<WalkResult> {
  const { page, mobile } = env;
  const rng = mulberry32(seed * 100003 + hand * 7 + 1);
  const script: string[] = [];
  const log = (s: string): void => void script.push(s);
  const players = rng.range(2, 6);
  const seats = SEATS_BY_COUNT[players as 2 | 3 | 4 | 5 | 6] as readonly Pos[];
  const res = (outcome: WalkOutcome, actions: number, detail?: string): WalkResult => ({ seed, hand, outcome, players, actions, ...(detail ? { detail } : {}), script });

  await page.goto('/new', { waitUntil: 'domcontentloaded' });
  if (mobile) await page.getByRole('navigation', { name: 'ステップ' }).waitFor();
  else await page.getByRole('group', { name: '人数' }).waitFor();

  // --- 基本設定（半分はそのまま、半分は値をばらつかせる）
  const varied = rng.chance(0.55);
  if (varied) {
    await step(env, /基本設定$/);
    if (rng.chance(0.3)) {
      log('fmt=mtt');
      await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
    }
    const sb = rng.pick(['0.5', '0.5', '0.25', '0.4', '0.1', '1']);
    const ante = rng.pick(['', '', '0.1', '0.125', '0.5', '1']);
    log(`sb=${sb} ante=${ante}`);
    await page.getByLabel('SB（bb）').fill(sb);
    await page.getByLabel('Ante（bb）').fill(ante);
    if (rng.chance(0.4) && (await page.getByLabel('Rake（%）').isEnabled())) {
      const rake = rng.pick(['5', '3.5', '0']);
      log(`rake=${rake}`);
      await page.getByLabel('Rake（%）').fill(rake);
    }
  }

  // --- 人数・Stack・Hero
  await step(env, /Player$/);
  log(`players=${players}`);
  await page.getByRole('group', { name: '人数' }).getByRole('button', { name: String(players), exact: true }).click();
  const hero = rng.pick(seats);
  if (hero !== 'BTN' || rng.chance(0.2)) {
    log(`hero=${hero}`);
    await page.getByRole('radio', { name: `Hero を ${hero} にする` }).click();
  }
  if (varied) {
    for (const p of seats) {
      if (!rng.chance(0.5)) continue;
      const st = rng.pick(['100', '50', '20.5', '12', '8.25', '200', '35', '150.5', '15', '1000', '3']); // Stack の上限は 1000bb（F-037。前は 9999.999 で Pot の上限に当たっていた）
      log(`stack ${p}=${st}`);
      await page.getByRole('textbox', { name: `${p} の Stack（bb）` }).fill(st);
    }
  }

  // --- ハンド（Hero は必ず。ほかは半分）。カードはキーで打つ
  const deck = shuffled(rng);
  const take = (): string => deck.pop() as string;
  const holes = new Map<Pos, [string, string]>();
  for (const p of seats) if (p === hero || rng.chance(0.5)) holes.set(p, [take(), take()]);
  for (const [p, cs] of holes) {
    log(`hand ${p}=${cs.join('')}`);
    await page.getByRole('button', { name: `${p} の Hand`, exact: true }).click();
    // PC は 2 枚そろうと次の空の席へ進むので、席を指定して開き直す（キーは開いている席に入る）
    for (const c of cs) await page.keyboard.type(c[0]!.toUpperCase() + c[1]!);
    if (mobile) await page.getByRole('button', { name: '完了' }).click().catch(() => undefined);
    else await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined);
  }

  // --- Action
  await step(env, /Action$/);
  let phase = await phaseNow(page);
  if (phase.kind === 'invalid') return res('stuck', 0, `invalid settings: ${phase.err ?? ''} ${script.join(' ')}`);
  const dock = page.locator('.act-dock');
  let guard = 0;
  while (phase.kind !== 'done' && guard++ < 150) {
    if (opts.stopAfterActions !== undefined && phase.actions >= opts.stopAfterActions) return res('prefix', phase.actions);
    if (phase.kind === 'board') {
      const need = (phase.need ?? 0) - phase.board;
      for (let i = 0; i < need; i++) {
        const c = take();
        log(`board ${c}`);
        const cell = page.getByRole('gridcell', { name: cardName(c), exact: true });
        if ((await cell.count()) === 0) {
          await page.getByRole('button', { name: /の Card を選ぶ$/ }).first().click();
        }
        await cell.click();
      }
      const after = await phaseNow(page);
      if (after.kind === 'board' && after.board === phase.board) return res('stuck', phase.actions, `board did not advance ${script.join(' ')}`);
      phase = after;
      continue;
    }
    if (phase.kind !== 'act' || !phase.legal) return res('stuck', phase.actions, `unexpected phase ${phase.kind} ${phase.err ?? ''}`);
    const lg = phase.legal;
    const tried = new Set<string>();
    let advanced = false;
    for (let attempt = 0; attempt < 6 && !advanced; attempt++) {
      const options: [string, number][] = [];
      // Hero の Fold は少なめ（Flop 以降に Hero の手番を残して Spot の候補を作る）
      const h = phase.pos === hero;
      if (lg.fold && !tried.has('fold')) options.push(['fold', lg.check ? 2 : h ? 5 : 14]);
      if (lg.check && !tried.has('check')) options.push(['check', 30]);
      if (lg.call !== null && !lg.check && !tried.has('call')) options.push(['call', h ? 50 : 38]);
      if ((lg.bet || lg.raise) && !tried.has('aggr')) options.push(['aggr', h ? 20 : 16]);
      if (!tried.has('skip')) options.push(['skip', 2]);
      if (options.length === 0) break;
      const which = rng.weighted(options);
      tried.add(which);
      const before = phase.actions;
      if (which === 'fold') {
        log(`${phase.pos} fold`);
        await dock.locator('.act-btn.fold').click();
      } else if (which === 'check') {
        log(`${phase.pos} check`);
        await dock.locator('.act-btn.check').click();
      } else if (which === 'call') {
        log(`${phase.pos} call`);
        await dock.locator('.act-btn.call').click();
      } else if (which === 'skip') {
        const skips = dock.locator('.ad-skip-btn');
        const n = await skips.count();
        if (n === 0) continue;
        const k = rng.int(n);
        log(`${phase.pos} skip#${k}`);
        await skips.nth(k).click();
      } else {
        const range = lg.bet ?? lg.raise!;
        const how = rng.weighted([['chip', 45], ['type', 35], ['min', 8], ['max', 12]] as const);
        const chips = dock.locator('.ad-chip');
        if (how === 'chip' && (await chips.count()) > 0) {
          const k = rng.int(await chips.count());
          log(`${phase.pos} chip#${k}`);
          await chips.nth(k).click();
        } else if (!mobile) {
          const v =
            how === 'min' ? range.min : how === 'max' ? range.max : Math.min(range.max, Math.max(range.min, range.min + rng.int(Math.floor((range.max - range.min) / 100) + 1) * 100));
          log(`${phase.pos} size=${formatBb(v)}`);
          await dock.locator('.ad-size input').fill(formatBb(v));
        }
        log(`${phase.pos} aggr`);
        await dock.locator('.act-btn.s1').click();
      }
      // 画面が受け付けたか（Preflop の All-in は受け付けないので別の手を試す）
      await page.waitForTimeout(30);
      const next = await phaseNow(page);
      if (next.actions !== before || next.board !== phase.board || next.kind !== phase.kind) {
        phase = next;
        advanced = true;
      }
    }
    if (!advanced) return res('stuck', phase.actions, `no legal button worked at action ${phase.actions} (${phase.pos}) ${JSON.stringify(lg)}`);
  }
  if (phase.kind !== 'done') return res('stuck', phase.actions, 'guard exceeded');

  // --- Spot とタイトル
  if (opts.stopAfterActions !== undefined) return res('prefix', phase.actions);
  await step(env, /Spot$/);
  const title = `試験 ${seed}-${hand}`;
  if (phase.cands.length === 0) {
    await page.getByRole('button', { name: /^(投稿する)$/ }).click();
    await page.getByRole('alert').first().waitFor({ timeout: 3000 }).catch(() => undefined);
    return res('no-spot', phase.actions, (await page.getByRole('alert').allInnerTexts()).join(' | ').slice(0, 200));
  }
  const radios = page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio');
  const nr = await radios.count();
  if (nr !== phase.cands.length) return res('blocked', phase.actions, `候補の数が違う（画面 ${nr} / 下書き ${phase.cands.length}）`);
  const pick = rng.int(nr);
  log(`spot#${pick}`);
  await radios.nth(pick).click();
  const readsInfo = await applyReads(env, rng, log);
  await toSpotStep(env);
  await page.getByPlaceholder(/タイトル/).fill(title);
  const before = env.posts.length;
  await page.getByRole('button', { name: '投稿する' }).click();
  // 送られる（または画面のエラーが出る）のを待つ
  for (let i = 0; i < 60 && env.posts.length === before; i++) {
    if ((await page.getByRole('alert').count()) > 0) break;
    await page.waitForTimeout(50);
  }
  if (env.posts.length === before) {
    const errs = (await page.getByRole('alert').allInnerTexts()).join(' | ').slice(0, 300);
    // 何を断られたか: 画面が送るはずの本文を取り出し、サーバーと同じ判定に通して理由を出す
    const body = await page
      .evaluate(`(async () => {
        const store = await import('/src/post/draftStore.ts');
        const dr = await import('/src/post/draft.ts');
        return dr.submissionBody(dr.settleActions(store.getDraft()));
      })()`)
      .catch(() => null);
    const j = body ? serverJudge(body) : null;
    return res('blocked', phase.actions, `候補ありで Spot・タイトルを入れたのに送られない。画面のエラー: ${errs} / 本文をサーバーの判定に通すと: ${j ? (j.ok ? 'ok' : j.message) : '本文なし'} / derived=${JSON.stringify((body as { derived?: unknown } | null)?.derived)} stacks=${JSON.stringify((body as { stacks?: unknown } | null)?.stacks)}`);
  }
  const last = env.judged[env.judged.length - 1];
  if (!last || !last.ok) return { ...res('server-reject', phase.actions, `${last?.message ?? '判定なし'}`), body: last?.body, ...readsInfo };
  return { ...res('posted', phase.actions), body: last.body, ...readsInfo };
}

async function toSpotStep(env: WalkEnv): Promise<void> {
  await step(env, /Spot$/);
}

/** 値を入れる乱数の選び方 */
const pickN = (rng: Rng, n: number): number => rng.int(n);

/**
 * 登録できる席（Villain の欄の見出し）にランダムな Read を入れる。MTT の Game 形式なら MTT の欄も。すべて画面の操作（role で探す）。
 */
async function applyReads(env: WalkEnv, rng: Rng, log: (s: string) => void): Promise<{ reads: number; mtt: boolean }> {
  const { page } = env;
  let reads = 0;
  let mtt = false;
  // --- MTT（Game 形式が MTT のときだけ欄がある）
  const mttFields = page.locator('.mtt-fields');
  if ((await mttFields.count()) === 0 && env.mobile) await step(env, /基本設定$/);
  if ((await mttFields.count()) > 0) {
    mtt = true;
    if (rng.chance(0.7)) {
      const sl = page.getByRole('slider', { name: 'Tournament Type' });
      await sl.focus();
      const keys = rng.pick([['End'], ['Home'], ['ArrowRight'], ['ArrowRight', 'PageUp', 'PageUp'], ['PageDown']]);
      log(`mtt speed keys=${keys.join(',')}`);
      for (const k of keys) await page.keyboard.press(k);
    }
    const entries = rng.range(2, 3000);
    const left = rng.range(2, entries);
    const rank = rng.range(1, left);
    const vals: [string, string][] = [
      ['スポットの順位', String(rank)],
      ['残りの人数', String(left)],
      ['エントリー数', String(entries)],
      ['ITM', String(rng.range(1, entries))],
      ['Avg Stack（bb）', rng.chance(0.5) ? String(rng.range(1, 300)) : `${rng.range(1, 300)}.${rng.range(0, 9)}`],
    ];
    for (const [name, v] of vals) {
      if (!rng.chance(0.65)) continue;
      log(`mtt ${name}=${v}`);
      await page.getByRole('textbox', { name, exact: true }).fill(v);
    }
    if (rng.chance(0.6)) {
      const prize = page.getByRole('group', { name: 'Prize Structure' }).getByRole('button');
      await prize.nth(pickN(rng, await prize.count())).click();
    }
  }
  // --- Villain
  await step(env, /Spot$/);
  const sec = page.getByRole('region', { name: 'Villain' });
  if ((await sec.count()) === 0) return { reads, mtt };
  const heads = sec.locator('button.vr-head');
  const n = await heads.count();
  for (let i = 0; i < n; i++) {
    if (!rng.chance(0.75)) continue;
    const head = heads.nth(i);
    const pos = ((await head.getAttribute('aria-label')) ?? '').replace(' の Villain の情報', '');
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    log(`villain ${pos}`);
    // VPIP・PFR（数・キー）
    for (const name of ['VPIP', 'PFR'] as const) {
      if (!rng.chance(0.45)) continue;
      if (rng.chance(0.5)) {
        await page.getByRole('button', { name: `${name} を数で入力` }).click();
        const v = String(rng.range(0, 100));
        log(`${pos} ${name}=${v}`);
        await page.getByRole('textbox', { name: `${name}（%）` }).fill(v);
        await page.keyboard.press('Enter');
      } else {
        const sl = page.getByRole('slider', { name, exact: true });
        await sl.focus();
        const keys = rng.pick([['ArrowRight'], ['End'], ['PageUp', 'PageUp'], ['Home'], ['ArrowRight', 'ArrowRight', 'ArrowLeft']]);
        log(`${pos} ${name} keys=${keys.join(',')}`);
        for (const k of keys) await page.keyboard.press(k);
      }
    }
    // 5 分割のボタン
    for (const name of ['Postflop Aggression', 'Hero Image']) {
      if (!rng.chance(0.4)) continue;
      const b = sec.getByRole('group', { name, exact: true }).getByRole('button');
      const k = pickN(rng, 5);
      log(`${pos} ${name}#${k}`);
      await b.nth(k).click();
    }
    // Spot Read（候補があるときだけ枠が出る）
    const spot = sec.locator('.vr-read').filter({ hasText: 'Spot Read' });
    if ((await spot.count()) > 0 && rng.chance(0.75)) {
      const acts = spot.getByRole('group', { name: 'Action' }).getByRole('button');
      const na = await acts.count();
      if (na > 1) await acts.nth(pickN(rng, na)).click();
      const lean = spot.getByRole('group', { name: 'Lean' }).getByRole('button');
      const k = pickN(rng, await lean.count());
      const times = rng.pick([1, 1, 2]);
      log(`${pos} spot lean#${k} x${times}`);
      for (let t = 0; t < times; t++) await lean.nth(k).click();
      reads++;
    }
    // General Read（2 件まで）
    const ng = rng.pick([0, 0, 1, 1, 2]);
    for (let g = 0; g < ng; g++) {
      const add = sec.getByRole('button', { name: '＋ General Read' });
      if ((await add.count()) === 0) break;
      await add.click();
      const box = sec.locator('.vr-read').filter({ hasText: `General Read ${g + 1}` });
      const streets = box.getByRole('group', { name: 'Street' }).getByRole('button');
      await streets.nth(pickN(rng, await streets.count())).click();
      const actions = box.getByRole('group', { name: 'Action' }).getByRole('button');
      await actions.nth(pickN(rng, await actions.count())).click();
      // 条件（あれば）
      const cond = box.getByRole('button', { name: 'Board · Size' });
      if ((await cond.count()) > 0 && rng.chance(0.6)) {
        await cond.click();
        const chips = box.locator('.vr-cond .vr-chip');
        const nc = await chips.count();
        for (let t = 0; t < rng.range(1, 3) && nc > 0; t++) await chips.nth(pickN(rng, nc)).click();
      }
      const lean = box.getByRole('group', { name: 'Lean' }).getByRole('button');
      if ((await lean.count()) > 0 && rng.chance(0.9)) {
        const k = pickN(rng, await lean.count());
        const times = rng.pick([1, 1, 2]);
        for (let t = 0; t < times; t++) await lean.nth(k).click();
        log(`${pos} general#${g} lean#${k} x${times}`);
        reads++;
      } else {
        // 途中の General Read は投稿の前のエラー。消す
        log(`${pos} general#${g} removed`);
        await box.getByRole('button', { name: `General Read ${g + 1} を削除` }).click();
        g--;
        if (rng.chance(0.5)) break;
      }
    }
    // 席を閉じる（別の席を開くと閉じる）
    if (rng.chance(0.3)) await head.click();
  }
  return { reads, mtt };
}
