// 公開用のサンプル投稿（6 件）の SQL を生成する（2026-09-30 さつき: 投稿を整理してアプリの機能を網羅するサンプルに）。
//   node --experimental-strip-types --no-warnings scripts/genShowcaseSql.ts   … db/seed/showcase.sql を書き出す
// Hand は投稿画面と同じ下書き（Draft）から作り、create-post と同じ検証（validateInput → verifyPost）を通した値を
// insert_post に渡す（派生メタは core が計算した値）。回答は試験用ユーザー同士で、core の paint コーデックで作る。
import { writeFileSync } from 'node:fs';
import {
  encodePaint,
  emptyPaint,
  labelOf,
  readCandidates,
  CELL_COUNT,
  validateInput,
  verifyPost,
  villainSeats,
  type AnswerKey,
  type Mix,
  type Pos,
} from '../packages/core/src/index.ts';
import { acts } from '../packages/core/src/poker/testHelpers.ts';
import { buildSubmission, emptyDraft, parseSettings, submissionBody, type Draft } from '../packages/app/src/post/draft.ts';
import { toInsertPayload } from '../packages/functions/src/createPost/payload.ts';

const OUT = 'db/seed/showcase.sql';
const USER = (n: number): string => `00000000-0000-0000-5eed-${String(n).padStart(12, '0')}`;

type Tendency = { vpip?: number; pfr?: number; agg?: number; image?: number };
type General = { street: string; action: string; texture?: Record<string, string>; runout?: string[]; size?: string; lean: string; strong?: boolean };
type SeatSpec = Tendency & { spot?: { street: string; action: string; lean: string; strong?: boolean }; general?: General[] };

type Showcase = {
  title: string;
  fmt: 'cash' | 'mtt';
  players: 2 | 3 | 4 | 5 | 6;
  sb?: string;
  ante?: string;
  rake?: string;
  stacks?: Partial<Record<Pos, string>>;
  hero: Pos;
  hands: Partial<Record<Pos, string>>;
  actions: Parameters<typeof acts>[0];
  board: string[];
  spot: number;
  reads?: Partial<Record<Pos, SeatSpec>>;
  mtt?: Record<string, unknown>;
  author: number;
  hoursAgo: number;
  /** 回答の塗り方（そのマスの Hand の強さ 0〜1 と回答者の番号から頻度を決める） */
  answer: (strength: number, user: number) => Partial<Record<AnswerKey, number>> | null;
  /** s1（Bet・Raise）の額の決め方（pot_base・min_to・max_to から） */
  size?: (d: { pot: number; min: number; max: number }, user: number) => number;
};

// ---- 回答の塗り: 13×13 のマスの強さ（Preflop の目安。0〜1） ----
const RANK = '23456789TJQKA';
function strengthOf(label: string): number {
  const a = RANK.indexOf(label[0] as string);
  const b = RANK.indexOf(label[1] as string);
  if (label.length === 2) return 0.5 + (a / 12) * 0.5; // ペア
  const suited = label.endsWith('s');
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const gap = hi - lo;
  return Math.max(0, Math.min(1, (hi / 12) * 0.55 + (lo / 12) * 0.35 + (suited ? 0.08 : 0) - (gap > 3 ? 0.08 : 0)));
}

/** 20 を合計にしたミックス（5% 刻み） */
function mix(parts: Partial<Record<AnswerKey, number>>): Mix {
  const m: Mix = { fold: 0, check: 0, call: 0, s1: 0 };
  let total = 0;
  for (const [k, v] of Object.entries(parts)) {
    m[k as AnswerKey] = Math.max(0, Math.round(v as number));
    total += m[k as AnswerKey];
  }
  // 丸めのずれを最大のキーで吸収
  const top = (Object.keys(m) as AnswerKey[]).sort((x, y) => m[y] - m[x])[0] as AnswerKey;
  m[top] += 20 - total;
  return m;
}

/** 回答者ごとに少しずらす（-1〜+1） */
const jitter = (user: number, salt: number): number => (((user * 37 + salt * 11) % 7) - 3) / 3;

const clamp20 = (v: number): number => Math.max(0, Math.min(20, v));

// ---- 6 件（2026-10-01 さつき: 公開されているプロのハンドから抜粋） ----
// 額は bb に直した値。チップの額が bb で割り切れないものは小数第 1〜3 位に丸めた。
// Big Blind Ante は全員のアンティに直した（場の額が同じになるよう、Stack は BB Ante を払った後の額に合わせた）。
// 実際より人数の多い卓は、Preflop で降りた人を除いて席を詰めた。出典に無い Stack は、結果が変わらない額を置いた（「推定」）。
// Hero のハンドが分かる言葉はタイトルに入れない。人の名前は DB に入れない（不変条件 6）ので、出典はこのコメントだけに書く。
const SHOWCASES: Showcase[] = [
  {
    // 2003 WSOP Main Event の Heads-up。Moneymaker（BTN）の River の All-in に Farha（BB、Hero）が Top Pair で Fold。
    // 20,000/40,000・アンティ 5,000。Stack 4,620,000 / 3,770,000。
    // https://upswingpoker.com/chris-moneymaker-vs-sammy-farha/
    // https://www.pokernews.com/strategy/analyzing-moneymaker-bluff-of-the-century-against-farha-35218.htm
    title: 'WSOP Main Event 2003、River の All-in',
    fmt: 'mtt',
    players: 2,
    ante: '0.125',
    stacks: { BTN: '115.5', BB: '94.25' },
    hero: 'BB',
    hands: { BB: 'Qs9h', BTN: 'Ks7h' },
    actions: { pf: 'BTN r2.5, BB c', flop: 'BB x, BTN x', turn: 'BB b7.5, BTN r20, BB c', river: 'BB x, BTN b92.875, BB f' },
    board: ['9s', '2d', '6s', '8s', '3h'],
    spot: 9,
    reads: { BTN: { image: 3 } },
    mtt: { speed: 20, prize: 'top', rank: 2, left: 2, entries: 839, paid: 63, avg: 104.9 },
    author: 1,
    hoursAgo: 3,
    answer: (s, u) => (s < 0.3 ? null : s > 0.78 ? { call: clamp20(17 + 3 * jitter(u, 1)), fold: 20 - clamp20(17 + 3 * jitter(u, 1)) } : { fold: clamp20(13 + 5 * jitter(u, 2)), call: 20 - clamp20(13 + 5 * jitter(u, 2)) }),
  },
  {
    // High Stakes Poker Season 2（2006）。Hansen（UTG）の Flop の Check-Raise を Negreanu（HJ、Hero）が Set of 6 で Call。Turn で Quads。
    // $300/$600・アンティ $100・8 人（降りた 2 人を除いて 6 人に）。実効 Stack $287,100。$8,000 等の 600 で割り切れない額は小数第 1 位に丸めた。
    // https://www.cardplayer.com/poker-news/1640563-daniel-negreanu-gus-hansen-break-down-iconic-high-stakes-poker-hand
    title: '3-Bet Pot の Flop、Check-Raise を受ける',
    fmt: 'cash',
    players: 6,
    ante: '0.167',
    stacks: { UTG: '478.5', HJ: '478.5', CO: '300', BTN: '300', SB: '300', BB: '300' },
    hero: 'HJ',
    hands: { HJ: '6s6h', UTG: '5d5c' },
    actions: {
      pf: 'UTG r3.5, HJ r8.3, CO f, BTN f, SB f, BB f, UTG c',
      flop: 'UTG x, HJ b13.3, UTG r43.3, HJ c',
      turn: 'UTG b40, HJ c',
      river: 'UTG x, HJ b108.3, UTG r386.733, HJ c',
    },
    board: ['9c', '6d', '5h', '5s', '8s'],
    spot: 10,
    reads: { UTG: { vpip: 45, pfr: 30, agg: 4, image: 3 } },
    author: 2,
    hoursAgo: 9,
    answer: (s, u) =>
      s < 0.45 ? null : s > 0.8 ? { call: clamp20(11 + 4 * jitter(u, 3)), s1: 20 - clamp20(11 + 4 * jitter(u, 3)) } : s > 0.6 ? { call: clamp20(15 + 3 * jitter(u, 4)), fold: 20 - clamp20(15 + 3 * jitter(u, 4)) } : { fold: clamp20(14 + 4 * jitter(u, 5)), call: 20 - clamp20(14 + 4 * jitter(u, 5)) },
    size: (d, u) => (u % 3 === 0 ? d.max : Math.min(d.max, Math.round(d.min * 1.1 * 10) / 10)),
  },
  {
    // High Stakes Poker Season 9（2022 放送）。4 人で Flop、River で Antonius（HJ）の Check-Raise All-in に Negreanu（BTN、Hero）が 99 の Full House で Fold。
    // $500/$1,000・BB Ante $1,000・8 人（降りた CO を除いて 5 人に。BB Ante は 5 人のアンティ 0.2 に）。Antonius の Stack $186,500。ほかの Stack は推定。
    // https://www.pokernews.com/news/2022/05/phil-ivey-negreanu-high-stakes-poker-41207.htm
    // https://www.cardplayer.com/poker-news/26915-watch-daniel-negreanu-phil-ivey-and-patrik-antonius-play-insane-pot-on-high-stakes-poker
    title: '4 人の Pot、River の Check-Raise All-in',
    fmt: 'cash',
    players: 5,
    ante: '0.2',
    stacks: { HJ: '186.7', CO: '250', BTN: '400', SB: '250', BB: '400' },
    hero: 'BTN',
    hands: { BTN: '9s9h', HJ: '5s5d', CO: '6d4d', BB: 'KcTd' },
    actions: {
      pf: 'HJ r2.5, CO c, BTN c, SB f, BB c',
      flop: 'BB x, HJ b5, CO f, BTN c, BB c',
      turn: 'BB x, HJ x, BTN b26, BB c, HJ c',
      river: 'BB x, HJ x, BTN b54, BB f, HJ r153, BTN f',
    },
    board: ['Th', '9d', '5c', 'Tc', 'Qd'],
    spot: 20,
    reads: { HJ: { vpip: 30, pfr: 20, agg: 4, general: [{ street: 'river', action: 'raise', lean: 'bluff' }] } },
    author: 3,
    hoursAgo: 20,
    answer: (s, u) => (s < 0.55 ? null : s > 0.85 ? { call: clamp20(16 + 3 * jitter(u, 6)), fold: 20 - clamp20(16 + 3 * jitter(u, 6)) } : { fold: clamp20(13 + 5 * jitter(u, 7)), call: 20 - clamp20(13 + 5 * jitter(u, 7)) }),
  },
  {
    // 2019 WSOP Main Event の最後のハンド。Ensan（BTN）の Turn の Bet に Sammartino（BB、Hero）が Flush Draw＋Gutshot で Check-Raise All-in。
    // 2M/4M・BB Ante 4M（2 人のアンティ 0.5 に）。Stack 345.5M / 169.5M（BB Ante を払った後の額が同じになるよう 0.5bb ずらした）。
    // https://www.pokernewsdaily.com/hossein-ensan-wins-2019-wsop-main-event-33001/
    // https://www.pokernews.com/tours/wsop/2019-wsop/main-event/chips.300675.htm
    title: 'WSOP Main Event 2019、Turn の Bet を受ける',
    fmt: 'mtt',
    players: 2,
    ante: '0.5',
    stacks: { BTN: '86.875', BB: '41.875' },
    hero: 'BB',
    hands: { BB: '8s4s', BTN: 'KhKc' },
    actions: { pf: 'BTN r2.75, BB c', flop: 'BB x, BTN b3.75, BB c', turn: 'BB x, BTN b8.25, BB r34.875, BTN c' },
    board: ['Ts', '6s', '2d', '9c', 'Qc'],
    spot: 7,
    mtt: { speed: 10, prize: 'top', rank: 2, left: 2, entries: 8569, paid: 1286, avg: 64.4 },
    author: 4,
    hoursAgo: 30,
    answer: (s, u) =>
      s < 0.25 ? null : s > 0.75 ? { call: clamp20(12 + 4 * jitter(u, 8)), s1: 20 - clamp20(12 + 4 * jitter(u, 8)) } : s > 0.45 ? { call: clamp20(12 + 4 * jitter(u, 9)), s1: clamp20(4 + 2 * jitter(u, 10)) } : { fold: clamp20(14 + 4 * jitter(u, 11)), s1: 20 - clamp20(14 + 4 * jitter(u, 11)) },
    size: (d) => d.max,
  },
  {
    // Triton Cyprus 2022 $30K 6-max の残り 8 人。Holz（SB）の River の Bet に Kudinov（BB、Hero）が T 高で Call（Holz は 6 高の Bluff）。
    // 50,000/100,000・BB Ante 100,000・4 人の卓（4 人のアンティ 0.25 に）。Stack 約 5.2M / 2.2M。降りた 2 人の Stack は推定。
    // https://www.pokernews.com/strategy/an-insane-ten-high-hero-call-with-eight-players-remaining-in-50302.htm
    // https://highstakesdb.com/news/live-poker-news/fedor-holz-gut-punched-by-hero-call-of-viktor-kudinov-at-triton-final-table
    title: 'High Roller の残り 8 人、River の Bet を受ける',
    fmt: 'mtt',
    players: 4,
    ante: '0.25',
    stacks: { CO: '35', BTN: '40', SB: '52', BB: '22' },
    hero: 'BB',
    hands: { BB: 'Tc9s', SB: '6d4c' },
    actions: { pf: 'CO f, BTN f, SB r2.4, BB c', flop: 'SB x, BB x', turn: 'SB b1.75, BB c', river: 'SB b3.9, BB c' },
    board: ['Kh', 'Qh', '2c', 'Ks', 'Ac'],
    spot: 9,
    reads: { SB: { vpip: 40, pfr: 32, agg: 4, spot: { street: 'river', action: 'barrel', lean: 'bluff' } } },
    mtt: { speed: 40, prize: 'top', left: 8, entries: 123 },
    author: 5,
    hoursAgo: 44,
    answer: (s, u) =>
      s < 0.2 ? null : s > 0.7 ? { call: clamp20(15 + 3 * jitter(u, 12)), s1: 20 - clamp20(15 + 3 * jitter(u, 12)) } : s > 0.45 ? { call: clamp20(12 + 5 * jitter(u, 13)), fold: 20 - clamp20(12 + 5 * jitter(u, 13)) } : { fold: clamp20(16 + 3 * jitter(u, 14)), call: 20 - clamp20(16 + 3 * jitter(u, 14)) },
    size: (d, u) => (u % 2 === 0 ? d.max : Math.min(d.max, Math.round(d.min * 1.2 * 10) / 10)),
  },
  {
    // Polk vs Negreanu の Heads-up（2020〜21、$200/$400 のオンライン Cash）。4-Bet Pot の River で Polk（BTN、Hero）が Q 高で All-in の Bluff。
    // 実効 Stack 約 $64,555。3-Bet の額（約 $4,300）は公表されていないので目安。セント単位の額は小数第 2〜3 位に丸めた。
    // https://upswingpoker.com/biggest-pots-polk-vs-negreanu/
    title: 'Heads-up の 4-Bet Pot、River で Check される',
    fmt: 'cash',
    players: 2,
    stacks: { BTN: '161.389', BB: '161.389' },
    hero: 'BTN',
    hands: { BTN: 'QhJs', BB: 'AdQd' },
    actions: {
      pf: 'BTN r2.37, BB r10.75, BTN r32.19, BB c',
      flop: 'BB x, BTN b12.875, BB c',
      turn: 'BB x, BTN b29.74, BB c',
      river: 'BB x, BTN b86.584, BB c',
    },
    board: ['As', '8s', '4c', 'Ah', '4s'],
    spot: 11,
    author: 6,
    hoursAgo: 60,
    answer: (s, u) => (s < 0.35 ? null : s > 0.7 ? { s1: clamp20(15 + 3 * jitter(u, 15)), check: 20 - clamp20(15 + 3 * jitter(u, 15)) } : { check: clamp20(13 + 5 * jitter(u, 16)), s1: 20 - clamp20(13 + 5 * jitter(u, 16)) }),
    size: (d, u) => (u % 3 === 0 ? Math.round(d.pot * 0.75 * 10) / 10 : d.max),
  },
];

// ---- 本文を作って検証する ----
const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;
const lines: string[] = [];
lines.push(
  '-- 公開用のサンプル投稿 6 件（`npm run db:showcase -- --branch <ブランチ>`。消すときは `npm run db:sample-clean -- --branch <ブランチ>`）',
  '-- このファイルは scripts/genShowcaseSql.ts が生成する。手で編集しない。',
  '-- 試験用ユーザー（00000000-0000-0000-5eed-…、@example.test）の投稿と、その人たち同士の回答だけを作る。実在するユーザーには触れない。',
  '-- 前の試験データ（sample.sql の 40 件を含む、試験用ユーザーの投稿）は消してから作る。',
  'begin;',
  '',
  "delete from public.posts where author_uid::text like '00000000-0000-0000-5eed-%';",
  "delete from neon_auth.\"user\" where id::text like '00000000-0000-0000-5eed-%';",
  "insert into neon_auth.\"user\" (id, name, email, \"emailVerified\", \"createdAt\", \"updatedAt\")",
  "select ('00000000-0000-0000-5eed-' || lpad(n::text, 12, '0'))::uuid, 'seed' || n, 'seed' || n || '@example.test', false, now(), now()",
  'from generate_series(1, 8) as n;',
  '',
  'create temp table showcase_limit as select daily_post_limit from public.app_settings;',
  'update public.app_settings set daily_post_limit = 100;',
  'create temp table showcase_posts (k int, id uuid);',
  '',
);

SHOWCASES.forEach((sc, k) => {
  const d: Draft = { ...emptyDraft(), fmt: sc.fmt, players: sc.players, hero: sc.hero, title: sc.title, spotIndex: sc.spot };
  if (sc.sb) d.sb = sc.sb;
  if (sc.ante) d.ante = sc.ante;
  d.rake = sc.rake ?? '';
  d.stacks = { ...d.stacks, ...(sc.stacks ?? {}) } as Draft['stacks'];
  d.hands = { ...d.hands, ...sc.hands } as Draft['hands'];
  d.actions = acts(sc.actions);
  d.board = sc.board as Draft['board'];
  const sub = buildSubmission(d);
  if (!sub.ok) {
    // どの検証で落ちたかを出す（画面の文言ではなくコード）
    let why = '';
    try {
      verifyPost(validateInput(submissionBody(d)));
    } catch (e) {
      why = `${(e as Error).message} ${JSON.stringify(e)} ${String((e as { detail?: unknown }).detail)}`;
    }
    throw new Error(`${sc.title}: ${sub.errors.join(' / ')} ${why}`);
  }
  const body = sub.body as Record<string, unknown>;

  // Villain の情報（Spot Read は core の候補から Size を取る）と MTT の情報
  const setup = parseSettings(d).setup;
  if (!setup) throw new Error(`${sc.title}: 設定`);
  const seats = villainSeats(setup, d.actions, sc.hero);
  const cands = readCandidates(setup, d.actions, sc.hero, sc.spot);
  const reads: Record<string, unknown> = {};
  for (const [pos, spec] of Object.entries(sc.reads ?? {})) {
    if (!seats.includes(pos as Pos)) throw new Error(`${sc.title}: ${pos} は登録できない席（${seats.join(',')}）`);
    const { spot, general, ...tendency } = spec as SeatSpec;
    const entries: Record<string, unknown>[] = [];
    if (spot) {
      const c = [...cands].reverse().find((x) => x.pos === pos && x.street === spot.street && x.action === spot.action);
      if (!c) throw new Error(`${sc.title}: ${pos} の Spot Read の候補が無い（${cands.map((x) => `${x.pos}:${x.street}:${x.action}`).join(', ')}）`);
      entries.push({ scope: 'spot', street: c.street, action: c.action, texture: null, runout: null, size: c.size, lean: spot.lean, strong: spot.strong ?? false });
    }
    for (const g of general ?? []) {
      entries.push({ scope: 'general', street: g.street, action: g.action, texture: g.texture ?? null, runout: g.runout ?? null, size: g.size ?? null, lean: g.lean, strong: g.strong ?? false });
    }
    reads[pos] = { ...tendency, ...(entries.length > 0 ? { reads: entries } : {}) };
  }
  body.villain_reads = reads;
  if (sc.mtt) body.mtt = sc.mtt;

  const v = verifyPost(validateInput(body));
  const payload = toInsertPayload(v);
  const der = v.derived;
  const pot = payload.pot_base;
  const min = payload.min_to ?? 0;
  const max = payload.max_to ?? 0;

  lines.push(`-- ${k + 1}. ${sc.title}（${sc.fmt}・${sc.players} 人・Hero ${sc.hero}・${der.street}・${payload.keys.join('/')}）`);
  lines.push(`insert into showcase_posts select ${k}, public.insert_post('${USER(sc.author)}'::uuid, ${q(JSON.stringify(payload))}::jsonb);`);

  // 回答（投稿者以外の試験用ユーザー 6〜7 人と、投稿者本人）
  const keys = payload.keys as AnswerKey[];
  for (let u = 1; u <= 8; u++) {
    if ((u + k) % 5 === 0) continue; // 回答数をばらつかせる
    const paint = emptyPaint();
    for (let idx = 0; idx < CELL_COUNT; idx++) {
      const s = strengthOf(labelOf(idx)) + jitter(u, idx) * 0.03;
      const m = sc.answer(s, u);
      if (!m) continue;
      const allowed: Partial<Record<AnswerKey, number>> = {};
      for (const [key, val] of Object.entries(m)) if (keys.includes(key as AnswerKey)) allowed[key as AnswerKey] = val;
      if (Object.keys(allowed).length === 0) continue;
      paint[idx] = mix(allowed);
    }
    const usesS1 = paint.some((m) => m !== null && m.s1 > 0);
    const size = usesS1 && sc.size ? Math.max(min, Math.min(max, sc.size({ pot, min, max }, u))) : null;
    const hex = Buffer.from(encodePaint(paint)).toString('hex');
    lines.push(
      `select set_config('request.jwt.claims', json_build_object('sub', '${USER(u)}', 'role', 'authenticated')::text, true);`,
      `insert into public.answers (post_id, paint, size) select id, decode('${hex}', 'hex'), ${size === null ? 'null' : size} from showcase_posts where k = ${k};`,
    );
  }
  lines.push('');
});

lines.push(
  "select set_config('request.jwt.claims', '', true);",
  'update public.app_settings set daily_post_limit = (select daily_post_limit from showcase_limit);',
  '',
  '-- 作成日時を少しずつ過去に（作成日時の書き換えはトリガで拒否されるので、一時的に外す）',
  'alter table public.posts disable trigger posts_only_count_update;',
  ...SHOWCASES.map((sc, k) => `update public.posts set created_at = now() - interval '${sc.hoursAgo} hours' where id = (select id from showcase_posts where k = ${k});`),
  'alter table public.posts enable trigger posts_only_count_update;',
  '',
  "select count(*) as showcase_posts, sum(answer_count) as showcase_answers from public.posts where author_uid::text like '00000000-0000-0000-5eed-%';",
  'commit;',
  '',
);

writeFileSync(OUT, lines.join('\n'));
console.log(`${OUT} を書き出しました（${SHOWCASES.length} 件）`);
