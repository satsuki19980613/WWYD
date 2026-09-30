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

// ---- 6 件 ----
const SHOWCASES: Showcase[] = [
  {
    title: 'BTN vs BB、A 高の Flop で C-Bet するか',
    fmt: 'cash',
    players: 6,
    rake: '5',
    hero: 'BTN',
    hands: { BTN: 'AdJc', BB: '8h7h' },
    actions: { pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c', flop: 'BB x, BTN b1.8, BB c', turn: 'BB x, BTN x', river: 'BB b4, BTN c' },
    board: ['As', '8d', '3c', 'Th', '2s'],
    spot: 7,
    reads: {
      BB: {
        vpip: 35,
        pfr: 10,
        agg: 1,
        general: [
          { street: 'flop', action: 'fold_cbet', lean: 'under', strong: true },
          { street: 'river', action: 'probe', runout: ['brick'], size: 'small', lean: 'value' },
        ],
      },
    },
    author: 1,
    hoursAgo: 3,
    answer: (s, u) => (s < 0.3 ? null : s > 0.62 ? { s1: clamp20(15 + 2 * jitter(u, 1)), check: 20 - clamp20(15 + 2 * jitter(u, 1)) } : { s1: clamp20(9 + 4 * jitter(u, 2)), check: 20 - clamp20(9 + 4 * jitter(u, 2)) }),
    size: (d, u) => Math.round(d.pot * (u % 3 === 0 ? 0.5 : 0.33) * 10) / 10,
  },
  {
    title: '3-Bet Pot、Turn の 2 発目を受ける',
    fmt: 'cash',
    players: 6,
    rake: '5',
    hero: 'CO',
    hands: { CO: 'KsQh' },
    actions: {
      pf: 'UTG f, HJ f, CO r2.5, BTN r8, SB f, BB f, CO c',
      flop: 'CO x, BTN b6, CO c',
      turn: 'CO x, BTN b14, CO c',
      river: 'CO x, BTN b30, CO f',
    },
    board: ['Kc', '9s', '4d', '5h', '2c'],
    spot: 12,
    reads: {
      BTN: {
        vpip: 26,
        pfr: 21,
        agg: 3,
        image: 3,
        spot: { street: 'turn', action: 'barrel', lean: 'bluff', strong: false },
        general: [{ street: 'flop', action: 'cbet', texture: { high: 'k', suit: 'rainbow' }, size: 'small', lean: 'over' }],
      },
    },
    author: 2,
    hoursAgo: 9,
    answer: (s, u) =>
      s < 0.55 ? null : s > 0.8 ? { s1: clamp20(6 + 3 * jitter(u, 3)), call: 20 - clamp20(6 + 3 * jitter(u, 3)) } : s > 0.6 ? { call: clamp20(16 + 3 * jitter(u, 4)), fold: 20 - clamp20(16 + 3 * jitter(u, 4)) } : { fold: clamp20(14 + 4 * jitter(u, 5)), call: 20 - clamp20(14 + 4 * jitter(u, 5)) },
    size: (d, u) => Math.min(d.max, Math.round(d.min * (u % 2 === 0 ? 1.15 : 1.4) * 10) / 10),
  },
  {
    title: 'MTT のバブル前、River の All-in に Call するか',
    fmt: 'mtt',
    players: 6,
    ante: '0.125',
    stacks: { UTG: '25', HJ: '40', CO: '18', BTN: '32', SB: '55', BB: '22' },
    hero: 'BB',
    hands: { BB: 'QdTs', HJ: 'JsJd' },
    actions: { pf: 'UTG f, HJ r2.1, CO f, BTN f, SB f, BB c', flop: 'BB x, HJ b2.5, BB c', turn: 'BB x, HJ x', river: 'BB x, HJ b35.275, BB c' },
    board: ['Qh', '7c', '2d', 'Jc', '4s'],
    spot: 13,
    reads: {
      HJ: {
        vpip: 21,
        pfr: 18,
        agg: 2,
        general: [{ street: 'river', action: 'bet_vs_check', runout: ['brick'], size: 'overbet', lean: 'value', strong: true }],
      },
    },
    mtt: { speed: 65, prize: 'standard', rank: 14, left: 42, entries: 380, paid: 54, avg: 28.5 },
    author: 3,
    hoursAgo: 20,
    answer: (s, u) => (s < 0.35 ? null : s > 0.75 ? { call: clamp20(17 + 3 * jitter(u, 6)), fold: 20 - clamp20(17 + 3 * jitter(u, 6)) } : { fold: clamp20(15 + 5 * jitter(u, 7)), call: 20 - clamp20(15 + 5 * jitter(u, 7)) }),
  },
  {
    title: 'ヘッズアップ、Flop の Check-Raise を受ける',
    fmt: 'cash',
    players: 2,
    rake: '5',
    hero: 'BTN',
    hands: { BTN: 'AhKc' },
    actions: { pf: 'BTN r2.5, BB c', flop: 'BB x, BTN b1.5, BB r5, BTN c', turn: 'BB b8, BTN f' },
    board: ['9h', '8h', '4c', '2d'],
    spot: 5,
    reads: {
      BB: {
        vpip: 62,
        pfr: 28,
        agg: 4,
        spot: { street: 'flop', action: 'raise', lean: 'bluff', strong: true },
      },
    },
    author: 4,
    hoursAgo: 30,
    answer: (s, u) =>
      s < 0.2 ? null : s > 0.7 ? { call: clamp20(12 + 4 * jitter(u, 8)), s1: 20 - clamp20(12 + 4 * jitter(u, 8)) } : s > 0.45 ? { call: clamp20(13 + 4 * jitter(u, 9)), fold: 20 - clamp20(13 + 4 * jitter(u, 9)) } : { fold: clamp20(15 + 4 * jitter(u, 10)), call: 20 - clamp20(15 + 4 * jitter(u, 10)) },
    size: (d, u) => Math.min(d.max, Math.round(d.min * (u % 2 === 0 ? 1.0 : 1.3) * 10) / 10),
  },
  {
    title: '4 人の Limp Pot、Turn で先に動く',
    fmt: 'cash',
    players: 4,
    hero: 'BB',
    hands: { BB: '7h6h' },
    actions: { pf: 'CO c, BTN c, SB c, BB x', flop: 'SB x, BB x, CO x, BTN b2, SB f, BB c, CO f', turn: 'BB x, BTN b4, BB f' },
    board: ['Td', '6s', '3h', 'Qs'],
    spot: 11,
    reads: {
      CO: { vpip: 48, pfr: 6, agg: 0, spot: { street: 'pf', action: 'limp', lean: 'over' } },
      BTN: { vpip: 38, agg: 3, general: [{ street: 'flop', action: 'bet_vs_check', size: 'small', lean: 'bluff' }] },
    },
    author: 5,
    hoursAgo: 44,
    answer: (s, u) => (s < 0.15 ? null : s > 0.6 ? { s1: clamp20(10 + 5 * jitter(u, 11)), check: 20 - clamp20(10 + 5 * jitter(u, 11)) } : { check: clamp20(16 + 3 * jitter(u, 12)), s1: 20 - clamp20(16 + 3 * jitter(u, 12)) }),
    size: (d, u) => Math.round(d.pot * (u % 2 === 0 ? 0.5 : 0.75) * 10) / 10,
  },
  {
    title: 'River で Flush 完成、Overbet の All-in を打つか',
    fmt: 'cash',
    players: 5,
    rake: '5',
    hero: 'BTN',
    hands: { BTN: 'KhQh', CO: 'AdJd' },
    actions: { pf: 'HJ f, CO r2.5, BTN c, SB f, BB f', flop: 'CO b3, BTN c', turn: 'CO b8, BTN c', river: 'CO x, BTN b86.5, CO c' },
    board: ['Jh', 'Ts', '4h', '9c', '2h'],
    spot: 10,
    reads: {
      CO: {
        vpip: 30,
        pfr: 22,
        agg: 3,
        spot: { street: 'turn', action: 'barrel', lean: 'value' },
        general: [{ street: 'river', action: 'fold_bet', lean: 'under', strong: true }],
      },
    },
    author: 6,
    hoursAgo: 60,
    answer: (s, u) => (s < 0.5 ? null : s > 0.7 ? { s1: clamp20(17 + 2 * jitter(u, 13)), check: 20 - clamp20(17 + 2 * jitter(u, 13)) } : { check: clamp20(12 + 5 * jitter(u, 14)), s1: 20 - clamp20(12 + 5 * jitter(u, 14)) }),
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
