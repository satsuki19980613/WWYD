/**
 * リリース前の総合テスト B（探索）: 投稿の詳細（get_post_detail の応答）の解釈と、回答・集計の Replay を、
 * ランダムなハンドで確かめる。未回答者に返る切り詰めた Action 列から作る停止位置の状態が、
 * ハンド全体から作る Spot の状態と一致すること、最後まで再生できることなど。
 * 種を決めた擬似乱数（依存なし）。
 */
import { BOARD_COUNT, POSITIONS, mbbToBb, spotView, status, type Action } from '@wwyd/core';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../core/src/poker/release.tb.gen.ts';
import { buildSubmission } from '../post/draft.ts';
import { buildDraft } from '../post/release.tb.draftgen.ts';
import { detailJson } from './detailFixtures.ts';
import { parsePostDetail } from './postDetail.ts';
import { actionText, actualAction, actualCell, cellDiff, cellViews, resultFrames } from './resultModel.ts';
import { answerFrames, seatViews } from './replayModel.ts';

type Raw = Record<string, unknown>;

/** 投稿できるランダムなハンドの本文（サーバーが通す形） */
function posts(count: number, seed0: number): Raw[] {
  const out: Raw[] = [];
  for (let i = 0; out.length < count && i < count * 40; i++) {
    const s = buildSubmission(buildDraft(new Rng(seed0 + i)).draft);
    if (s.ok) out.push(s.body);
  }
  return out;
}

describe('B 投稿の詳細の解釈と Replay', () => {
  const list = posts(250, 2_000_000);

  it('生成できた投稿の数', () => {
    expect(list.length).toBeGreaterThanOrEqual(200);
  });

  it('未回答者の応答（Action は停止位置まで、Board は到達したストリート）から作った停止位置の状態が、ハンド全体から作った Spot の状態と一致する', () => {
    for (const [i, raw] of list.entries()) {
      const full = parsePostDetail(detailJson(raw, { viewer: 'author', myAnswer: null }));
      const un = parsePostDetail(detailJson(raw, { viewer: 'unanswered' }));
      const label = `i=${i}`;
      // 未回答者には Hero のハンド・判明したハンドが返らず、Action は停止位置より前だけ
      expect(un.secrets, label).toBeNull();
      expect(un.hand.actions.length, label).toBe(un.hand.stopIndex);
      expect(un.hand.truncated).toBe(true);
      expect(un.hand.board.length, label).toBe(BOARD_COUNT[un.post.street]);
      // 全体の応答と同じ設定・キー・額
      expect(un.hand.setup).toEqual(full.hand.setup);
      expect(un.post).toEqual({ ...full.post, isMine: false, canDelete: false });
      // 停止位置の状態
      const frames = answerFrames(un.hand.setup, un.hand.actions, un.hand.stopIndex, un.post.street);
      expect(frames.length, label).toBe(un.hand.stopIndex + 1);
      const v = spotView(full.hand.setup, full.hand.actions, full.post.hero, full.hand.spotIndex);
      expect(frames[un.hand.stopIndex], label).toEqual(v.state);
      expect(status(frames[un.hand.stopIndex]!), label).toEqual({ kind: 'act', pos: full.post.hero });
      // 卓の表示: Hero が手前・座っている席だけ・NaN なし
      const seats = seatViews(frames[un.hand.stopIndex]!, { hero: un.post.hero, actor: un.post.hero, you: true });
      expect(seats[0]?.pos).toBe(un.post.hero);
      expect(seats.length).toBe(Object.values(full.hand.setup.stacks).filter((x) => x > 0).length);
      expect(JSON.stringify(seats)).not.toMatch(/NaN|undefined/);
      // 回答するときの合法キーと額の範囲は、停止位置の Hero の合法手から作ったもの
      expect(un.post.keys, label).toEqual(v.derived.keys);
      expect(un.post.minTo, label).toBe(v.derived.minTo);
      expect(un.post.maxTo, label).toBe(v.derived.maxTo);
      expect(un.post.potBase, label).toBe(v.derived.potBase);
    }
  });

  it('回答後の応答: 最後まで再生でき、終了の表示・ハンドの公開が正しい', () => {
    let shown = 0;
    for (const [i, raw] of list.entries()) {
      const d = parsePostDetail(detailJson(raw, { viewer: 'answered', answerCount: 1 }));
      const label = `i=${i}`;
      const frames = resultFrames(d);
      expect(frames.length, label).toBe(d.hand.actions.length + 1);
      const last = frames[frames.length - 1]!;
      expect(last.note, label).toMatch(/^(Showdown|[A-Z]+ Pot 獲得)$/);
      expect(last.board.length, label).toBe(d.hand.board.length);
      expect(Object.values(last.state.bets).every((b) => b === 0)).toBe(true);
      // Hero のハンドは公開され、答え合わせのアクションは Hero の出題のアクション
      expect(last.holes[d.post.hero], label).toEqual(d.secrets?.heroCards);
      const act = actualAction(d) as Action;
      expect(act, label).not.toBeNull();
      expect(act.pos).toBe(d.post.hero);
      expect(actionText(act)).not.toMatch(/NaN|undefined/);
      const cell = actualCell(d);
      expect(cell).not.toBeNull();
      // 途中のフレームでは Hero のハンドだけ（フォールドするまで）。ほかの席のカードは見せない
      for (const f of frames.slice(0, -1)) {
        for (const p of POSITIONS) if (p !== d.post.hero) expect(f.holes[p], `${label} ${p}`).toBeUndefined();
      }
      // 判明したハンドは終了時に見える（Muck は muck）
      for (const p of POSITIONS) {
        const k = d.secrets?.knownCards[p];
        if (k && p !== d.post.hero) expect(last.holes[p], label).toEqual(k);
      }
      shown++;
    }
    expect(shown).toBeGreaterThan(200);
  });

  it('自分との差: 0〜1 で、同じ回答なら 0、全体が 1 人で自分と違えば正の値。回答が入れ替わっても対称', () => {
    const rng = new Rng(77);
    const raw = list[0]!;
    const keys = (raw.derived as { keys: string[] }).keys;
    const allowed = keys as ('fold' | 'check' | 'call' | 's1')[];
    const mk = (): { fold: number; check: number; call: number; s1: number } => {
      const m = { fold: 0, check: 0, call: 0, s1: 0 };
      let left = 20;
      allowed.forEach((k, i) => {
        const v = i === allowed.length - 1 ? left : rng.int(0, left);
        m[k] = v;
        left -= v;
      });
      return m;
    };
    for (let t = 0; t < 200; t++) {
      const a = mk();
      const b = mk();
      const cell = rng.int(0, 168);
      const paintOf = (m: typeof a): string => {
        const p = new Uint8Array(676);
        p[cell * 4] = m.fold;
        p[cell * 4 + 1] = m.check;
        p[cell * 4 + 2] = m.call;
        p[cell * 4 + 3] = m.s1;
        return `\\x${[...p].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
      };
      const agg = (m: typeof a): string => {
        const u = new Uint8Array(1690);
        const o = cell * 10;
        const put = (off: number, v: number): void => {
          u[off] = v >> 8;
          u[off + 1] = v & 0xff;
        };
        put(o, 1);
        put(o + 2, m.fold);
        put(o + 4, m.check);
        put(o + 6, m.call);
        put(o + 8, m.s1);
        return `\\x${[...u].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
      };
      const d1 = parsePostDetail(detailJson(raw, { viewer: 'answered', answerCount: 1, myAnswer: { paint: paintOf(a), size: null }, aggregate: agg(b) }));
      const d2 = parsePostDetail(detailJson(raw, { viewer: 'answered', answerCount: 1, myAnswer: { paint: paintOf(b), size: null }, aggregate: agg(a) }));
      const x = cellDiff(d1, cell);
      const y = cellDiff(d2, cell);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1 + 1e-12);
      expect(Math.abs(x - y)).toBeLessThan(1e-12);
      const same = parsePostDetail(detailJson(raw, { viewer: 'answered', answerCount: 1, myAnswer: { paint: paintOf(a), size: null }, aggregate: agg(a) }));
      expect(cellDiff(same, cell)).toBe(0);
      // 全体のマス表示にも NaN が出ない
      expect(JSON.stringify(cellViews(d1, 'all'))).not.toMatch(/NaN|null.*NaN/);
    }
  });

  it('壊れた応答（型違い・欠け・不正な値）は例外にするが、それ以外の想定外の例外を出さない', () => {
    const rng = new Rng(3);
    const raw = list[0]!;
    const base = detailJson(raw, { viewer: 'answered', answerCount: 1 }) as Raw;
    const junk: unknown[] = [null, undefined, 0, 1, 'x', '', [], {}, true, NaN, -1, 1e21, { a: 1 }, ['x'], [[]], '\\x00'];
    const paths = ['viewer', 'post', 'hand', 'secrets', 'my_answer', 'aggregate', 'post.keys', 'post.hero', 'post.min_to', 'post.effective_stack', 'hand.actions', 'hand.stacks', 'hand.board', 'hand.sb', 'hand.spot_index', 'secrets.hero_cards', 'secrets.known_cards', 'aggregate.n', 'aggregate.cells'];
    let threw = 0;
    let ok = 0;
    for (let n = 0; n < 1500; n++) {
      const copy = JSON.parse(JSON.stringify(base)) as Raw;
      const path = rng.pick(paths).split('.');
      let o: Raw = copy;
      for (const key of path.slice(0, -1)) {
        const nx = o[key];
        if (typeof nx !== 'object' || nx === null) break;
        o = nx as Raw;
      }
      o[path[path.length - 1] as string] = rng.pick(junk);
      try {
        parsePostDetail(copy);
        ok++;
      } catch (e) {
        threw++;
        // 形の不正は専用のエラー。TypeError などの想定外は出さない
        expect(e instanceof TypeError || e instanceof RangeError, `path=${path.join('.')} → ${String(e)}`).toBe(false);
      }
    }
    expect(threw).toBeGreaterThan(500);
    expect(ok + threw).toBe(1500);
  });

  it('金額の往復: 応答の bb（numeric）→ mbb → bb が一致する', () => {
    for (const raw of list.slice(0, 100)) {
      const d = parsePostDetail(detailJson(raw, { viewer: 'author', myAnswer: null }));
      expect(mbbToBb(d.hand.setup.sb)).toBe(raw.sb);
      expect(mbbToBb(d.post.potBase)).toBe((raw.derived as { pot_base: number }).pot_base);
    }
  });
});
