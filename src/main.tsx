import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAnalytics } from './analytics';
import './design/tokens.css';
import './app.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

startAnalytics();

// Every history entry is the same page; the app itself scrolls a selection into view (list rows,
// map camera), so the browser must not restore an older scroll offset after back/forward.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
