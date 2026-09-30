import { Component, type ReactNode } from 'react';
import { StatusScreen } from '../screens/StatusScreen.tsx';

/**
 * 画面の描画中に予期しない例外が起きたときの受け皿（F-004・V-033 の再発防止）。
 * 真っ白にせず「表示できませんでした」と再読み込みのボタンを出す。`resetKey` が変わる（別の画面へ移る）と元に戻す。
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean; key: string | undefined }> {
  override state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<{ failed: boolean }> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey?: string },
    state: { failed: boolean; key: string | undefined },
  ): Partial<{ failed: boolean; key: string | undefined }> | null {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  override componentDidCatch(error: unknown): void {
    // 開発者ツールで原因を追えるように残す（外部には送らない）
    console.error(error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <StatusScreen title="表示できませんでした" actionLabel="再読み込み" tone="error" onAction={() => window.location.reload()} />;
  }
}
