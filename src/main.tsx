import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Guard against libraries trying to overwrite the read-only window.fetch property
try {
  const originalFetch = window.fetch;
  if (originalFetch) {
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      enumerable: true,
      get: () => originalFetch,
      set: () => { console.warn('Polyfill attempted to overwrite window.fetch - ignoring.'); }
    });
  }
} catch (e) {
  console.warn('Could not define fetch guard:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
