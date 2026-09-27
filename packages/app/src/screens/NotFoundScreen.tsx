import { navigate } from '../router.ts';
import { StatusScreen } from './StatusScreen.tsx';

/** 404（06 章 §0.1）。「ページが見つかりません」＋「一覧へ」。 */
export function NotFoundScreen(): JSX.Element {
  return (
    <StatusScreen title="ページが見つかりません" actionLabel="一覧へ" tone="warn" onAction={() => navigate('/')} />
  );
}
