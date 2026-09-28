import { describe, expect, it } from 'vitest';
import { blank, fill, type RgbaImage } from './image.ts';
import { readHandHistory, type TextMode } from './readHandHistory.ts';
import { PLAYER_ROWS_Y } from './vision.ts';

const BG = [30, 41, 57] as const;

/** プレイヤー行の名前の欄に白い線を描いた画像（`bold` の行だけ太い） */
function table(rows: readonly number[], bold: number): RgbaImage {
  const boxes: [number, number, number, number][] = [];
  rows.forEach((y, i) => {
    const w = i === bold ? 5 : 2;
    for (let x = 130; x < 300; x += 10) boxes.push([x, y - 10, x + w, y + 10]);
  });
  return fill(blank(839, 1100, BG), boxes, [255, 255, 255]);
}

const NAMES = ['SecretAlice', 'SecretBob', 'SecretCarol', 'SecretDan', 'SecretEve', 'SecretFrank'];

describe('readHandHistory', () => {
  it('結果にプレイヤー名を入れない（不変条件 6）。名前は本文の行の結び付けにだけ使う', async () => {
    let line = 0;
    const calls: TextMode[] = [];
    const reader = async (_img: RgbaImage, mode: TextMode): Promise<string> => {
      calls.push(mode);
      if (mode === 'line') return NAMES[line++] ?? '';
      // バッジが読めない行（名前で席を探す）を混ぜる
      return ['Preflop ~ SecretAlice Fold', 'HJ) SecretBob Raise 2.5bb', '~~ SecretCarol Call 2.5bb', 'Result HJ SecretBob won 5bb'].join('\n');
    };
    const r = await readHandHistory(table(PLAYER_ROWS_Y, 3), reader);
    expect(JSON.stringify(r)).not.toMatch(/Secret/);
    expect(r.hero).toBe('BTN');
    expect(r.actions).toEqual([
      { street: 'pf', pos: 'UTG', verb: 'fold', amount: null },
      { street: 'pf', pos: 'HJ', verb: 'raise', amount: 2.5 },
      { street: 'pf', pos: 'CO', verb: 'call', amount: 2.5 },
    ]);
    // カードが描かれていないので、全席のハンドが読めなかったことになる
    expect(r.problems.filter((p) => p.code === 'hand_unread')).toHaveLength(6);
    expect(calls).toEqual(['line', 'line', 'line', 'line', 'line', 'line', 'block']);
  });

  it('6 人の卓でなければ何も読まない', async () => {
    const r = await readHandHistory(table(PLAYER_ROWS_Y.slice(0, 5), 0), async () => '');
    expect(r).toEqual({ hero: null, hands: {}, board: [], actions: [], problems: [{ code: 'not_six_players', rows: 5 }] });
  });

  it('幅が 839px でなければ知らせる（横は幅に合わせて読む）', async () => {
    const r = await readHandHistory(blank(600, 800, BG), async () => '');
    expect(r.problems[0]).toEqual({ code: 'unexpected_width', width: 600 });
  });
});
