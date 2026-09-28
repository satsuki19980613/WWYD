import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ToastProvider } from './components/Toast.tsx';
// 書体は自サイトから配信する（Google Fonts へ通信しない。2026-09-28 さつきの決定）
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/zen-kaku-gothic-new/400.css';
import '@fontsource/zen-kaku-gothic-new/500.css';
import '@fontsource/zen-kaku-gothic-new/700.css';
import '@fontsource/zen-kaku-gothic-new/900.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/post.css';
import './styles/answer.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root がありません');

createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
