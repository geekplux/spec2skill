import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { migrateTheme, safeStorage, storedTheme } from './design/theme';
import './design/tokens.css';
import './app.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

// An explicit earlier choice wins; otherwise the CSS follows prefers-color-scheme.
migrateTheme(safeStorage());
const theme = storedTheme(safeStorage());
if (theme) document.documentElement.dataset.theme = theme;

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
