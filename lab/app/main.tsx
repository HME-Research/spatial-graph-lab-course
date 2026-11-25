import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GuideProvider } from './ui/guide';
import './app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <GuideProvider>
      <App />
    </GuideProvider>
  </StrictMode>,
);
