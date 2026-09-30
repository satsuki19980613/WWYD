/**
 * PC とスマホの構成の境目（06 章 §0.2・17 章 §3.0）。
 *
 * PC の投稿・回答・集計は設計の大きさ（STAGE_W × STAGE_H）で組み、ヘッダーの下の領域に収まる倍率で全体を縮める（FitStage）。
 * 縮めすぎると文字が読めなくなる（リリース前テスト F-033: 横向きのスマホ・タブレットの縦・低い画面で 3〜6px）ので、
 * 倍率が FIT_MIN_ZOOM を下回る画面はスマホの構成にする（2026-09-30 さつき「推奨どおり」）。
 *
 * 下限 0.65 の根拠: 舞台の文字は 12〜16px が大半（Range 表のマス 12px、Hand History・席の表 13px、本文 14〜16px）。
 * 0.65 倍で 16px の本文は 10.4px、13px の文字は約 8.5px。これを下回ると 13px の文字が 8px 未満、10px のラベルが 6px 以下になり、
 * F-033 の「3〜6px」の域に入る。1024×640（倍率 0.69）は PC のまま残す。
 *
 * 倍率は画面（ビューポート）の大きさだけで決まるので、境目は画面の幅と高さの 2 つの数になる。
 * CSS のメディアクエリ（tokens.css・components.css・reads.css・post.css・base.css）も同じ数を使う（layout.test.ts で照合）。
 * 画面の大きさだけで決めるので、構成を切り替えても判定の入力は変わらず、行ったり来たりしない。
 */

/** PC の画面の設計の大きさ（1440×900 の画面でヘッダーと余白を除いた広さ。17 章） */
export const STAGE_W = 1376;
export const STAGE_H = 800;

/** FitStage の倍率の下限。これを下回る画面はスマホの構成（F-033） */
export const FIT_MIN_ZOOM = 0.65;

/** 舞台の外の幅: .app-main の左右の余白（1200px 未満は 16px ずつ。境目は 1200px より狭いので 16px で計算する） */
const CHROME_W = 2 * 16;
/** 舞台の外の高さ: ヘッダー 52px ＋ 下線 1px ＋ .fit-outer の上下の余白 16px ずつ（base.css の .fit-outer の height） */
const CHROME_H = 52 + 1 + 2 * 16;

/** PC の構成にする最小の画面の幅と高さ（これ未満はスマホの構成）。927 × 605 */
export const PC_MIN_WIDTH = Math.ceil(STAGE_W * FIT_MIN_ZOOM + CHROME_W);
export const PC_MIN_HEIGHT = Math.ceil(STAGE_H * FIT_MIN_ZOOM + CHROME_H);

/**
 * スマホの構成にするメディアクエリ（幅 927px 未満、または高さ 605px 未満）。CSS の各所と同じ文字列。
 * 前は幅 700px 未満だけだった。
 */
export const MOBILE_QUERY = '(max-width: 926.98px), (max-height: 604.98px)';
/** PC の構成のメディアクエリ（MOBILE_QUERY の否定） */
export const PC_QUERY = '(min-width: 927px) and (min-height: 605px)';

/** 画面の大きさで決まる FitStage の倍率（PC の構成のとき） */
export function fitZoom(viewportW: number, viewportH: number): number {
  const padW = viewportW >= 1200 ? 2 * 32 : CHROME_W;
  return Math.min((viewportW - padW) / STAGE_W, (viewportH - CHROME_H) / STAGE_H);
}
