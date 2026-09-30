import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { installScrollIndicator } from './scrollIndicator.ts';
// 書体は自サイトから配信する（Google Fonts へ通信しない。2026-09-28 さつきの決定）
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/zen-kaku-gothic-new/400.css';
import '@fontsource/zen-kaku-gothic-new/500.css';
import '@fontsource/zen-kaku-gothic-new/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/post.css';
import './styles/answer.css';
import './styles/reads.css';
import './styles/scrollbar.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root がありません');

installScrollIndicator();

createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      {/* ヘッダーを含めて落ちたときの最後の受け皿（F-004） */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ToastProvider>
  </StrictMode>,
);
