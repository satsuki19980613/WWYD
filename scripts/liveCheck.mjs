// 本番の通信確認（.github/workflows/live.yml から呼ぶ）。ログインせずに確かめられることだけを見る。書き込まない。
//   1. サイト: トップが 200 で、保護ヘッダ（CSP・HSTS など）が付いている
//   2. ログインの中継（/api/auth/*）: ok は 200、中継しない API は 404
//   3. Data API: トークン無しでは投稿を読めない（2xx を返さない）
//   4. Function create-post: トークン無しでは 401
//   5. Mozilla HTTP Observatory: 公開サイトを測らせ、評価が A+ か
// 住所は .env.production（公開の住所）から読む。結果は表にして標準出力と GITHUB_STEP_SUMMARY に書く。
//   node scripts/liveCheck.mjs                 … すべて
//   node scripts/liveCheck.mjs --no-observatory … Observatory を飛ばす
import { appendFileSync, readFileSync } from 'node:fs';

const SITE = (process.env.SITE ?? 'https://wwyd.pages.dev').replace(/\/+$/, '');
const env = Object.fromEntries(
  readFileSync('.env.production', 'utf8')
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const DATA_URL = env.VITE_NEON_DATA_API_URL.replace(/\/+$/, '');
const CREATE_POST_URL = env.VITE_NEON_CREATE_POST_URL;
const OBSERVATORY = 'https://observatory-api.mdn.mozilla.net/api/v2/scan';

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${detail}`);
};

/** 1 回の要求。ネットワークの失敗も結果として返す（ほかの確認は続ける） */
async function request(url, init = {}) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000), ...init });
    return { status: res.status, headers: res.headers, text: await res.text() };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: e instanceof Error ? e.message : String(e) };
  }
}

// 1. サイトと保護ヘッダ（packages/app/public/_headers が配られているか）
{
  const r = await request(`${SITE}/`);
  record('サイト /', r.status === 200, `${r.status}`);
  const csp = r.headers.get('content-security-policy') ?? '';
  const want = [
    ['Content-Security-Policy に default-src \'self\'', csp.includes("default-src 'self'")],
    ['Content-Security-Policy に frame-ancestors \'none\'', csp.includes("frame-ancestors 'none'")],
    ['Content-Security-Policy に \'unsafe-inline\'・\'unsafe-eval\' が無い', csp !== '' && !/'unsafe-(inline|eval)'/.test(csp)],
    ['X-Content-Type-Options: nosniff', r.headers.get('x-content-type-options') === 'nosniff'],
    ['Strict-Transport-Security', /max-age=\d{8,}/.test(r.headers.get('strict-transport-security') ?? '')],
    ['Referrer-Policy', (r.headers.get('referrer-policy') ?? '') !== ''],
  ];
  for (const [name, ok] of want) record(name, ok, ok ? 'あり' : 'なし');
  // connect-src に並ぶ通信先（自サイト以外はすべて Neon のはず）
  const connect = (/connect-src ([^;]*)/.exec(csp)?.[1] ?? '').trim().split(/\s+/).filter((s) => s !== "'self'");
  const onlyNeon = connect.length > 0 && connect.every((s) => /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.neon\.tech$/.test(s));
  record('通信先（connect-src）は自サイトと Neon だけ', onlyNeon, connect.join(' ') || '（なし）');
}

// 2. ログインの中継
{
  const ok = await request(`${SITE}/api/auth/ok`);
  record('ログインの中継 /api/auth/ok', ok.status === 200, `${ok.status}（200 が正しい）`);
  const other = await request(`${SITE}/api/auth/admin/list-users`);
  record('中継しない API /api/auth/admin/list-users', other.status === 404, `${other.status}（404 が正しい）`);
}

// 3. Data API（トークン無し）
{
  const r = await request(`${DATA_URL}/posts?select=id&limit=1`);
  const ok = r.status !== 0 && (r.status < 200 || r.status >= 300);
  record('Data API をトークン無しで読む', ok, `${r.status}（2xx 以外が正しい）`);
}

// 4. Function create-post（トークン無し）
{
  const r = await request(CREATE_POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE },
    body: '{}',
  });
  record('create-post をトークン無しで呼ぶ', r.status === 401, `${r.status}（401 が正しい）`);
}

// 5. Mozilla HTTP Observatory
let observatory = null;
if (!process.argv.includes('--no-observatory')) {
  const host = new URL(SITE).host;
  const r = await request(`${OBSERVATORY}?host=${encodeURIComponent(host)}`, { method: 'POST' });
  try {
    observatory = JSON.parse(r.text);
  } catch {
    observatory = null;
  }
  if (r.status === 200 && observatory?.grade) {
    const { grade, score, tests_passed: passed, tests_quantity: total, scanned_at: at } = observatory;
    record('Mozilla HTTP Observatory', grade === 'A+', `${grade}（${score} 点、${passed}/${total} 項目合格、${at}）`);
  } else {
    record('Mozilla HTTP Observatory', false, `${r.status} ${r.text.slice(0, 200)}`);
  }
}

// まとめ
const cell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const lines = [
  `### 本番の通信確認（${SITE}）`,
  '',
  '| 確認 | 結果 | 詳細 |',
  '|---|---|---|',
  ...results.map((r) => `| ${cell(r.name)} | ${r.ok ? 'OK' : '**FAIL**'} | ${cell(r.detail)} |`),
];
if (observatory?.details_url) lines.push('', `Observatory の詳細: ${observatory.details_url}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべての確認に通りました');
