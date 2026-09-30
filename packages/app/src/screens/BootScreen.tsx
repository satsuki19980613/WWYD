/** 起動中（セッション確認中）。ロゴのみ・文字なし（06 章 §0.3）。 */
export function BootScreen(): JSX.Element {
  return (
    <div className="boot" role="status" aria-label="読み込み中">
      <AppMark className="boot-mark" />
    </div>
  );
}

/**
 * アプリのマーク（public/icon.svg と同じ絵。2026-10-01 さつき）: 面取りの板と黄の縁に、回答で塗るレンジ表を 3×3 に縮めた形。
 * 黄＝Raise・シアン＝Call・赤＝Fold・暗＝Range 外。色はトークン（screens.css の .am-*）
 */
const CELLS: readonly (readonly [number, number, 'y' | 'c' | 'r' | 'o'])[] = [
  [12, 12, 'y'], [26, 12, 'y'], [40, 12, 'c'],
  [12, 26, 'y'], [26, 26, 'c'], [40, 26, 'r'],
  [12, 40, 'c'], [26, 40, 'r'], [40, 40, 'o'],
];

export function AppMark(props: { className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 64 64" aria-hidden="true">
      <path className="am-plate" d="M3 3h48l10 10v48H13L3 51z" strokeWidth="3" />
      {CELLS.map(([x, y, k]) => (
        <rect key={`${x}-${y}`} className={`am-${k}`} x={x} y={y} width="12" height="12" />
      ))}
    </svg>
  );
}
