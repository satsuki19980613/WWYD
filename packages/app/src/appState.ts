/**
 * アプリ全体の状態（詳細仕様 06 章 §0.3）。
 * Supabase とのつなぎ込み（セッション確認・whoami・ヘルスチェック）は P3 で行う。
 * ここでは状態の種類と、通信失敗をどの状態として見せるかの判定だけを持つ。
 */

export type AppState = 'booting' | 'signedOut' | 'unavailable' | 'maintenance' | 'offline' | 'ready';

export const APP_STATES: readonly AppState[] = [
  'booting',
  'signedOut',
  'unavailable',
  'maintenance',
  'offline',
  'ready',
];

/** ヘルスチェックの打ち切り時間（ms）。これを超えたらメンテナンス中として扱う。 */
export const HEALTH_TIMEOUT_MS = 10_000;

/** バックエンドへの通信結果。 */
export type Reachability =
  | { kind: 'ok' }
  | { kind: 'http'; status: number }
  | { kind: 'timeout' }
  | { kind: 'network' };

/**
 * 通信結果から、全画面の状態を上書きすべきかを決める。
 * - 端末がオフラインで通信に失敗した → `offline`
 * - 到達できない・5xx・タイムアウト → `maintenance`（Supabase の休止中を含む。仕様書 §8）
 * - それ以外（成功、4xx）→ `null`（全画面の状態は変えない。4xx は各画面のエラーとして扱う）
 */
export function classifyReachability(result: Reachability, online: boolean): 'offline' | 'maintenance' | null {
  if (result.kind === 'ok') return null;
  if (result.kind === 'http' && result.status < 500) return null;
  if (!online) return 'offline';
  return 'maintenance';
}
