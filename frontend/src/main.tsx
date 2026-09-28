import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';

// pegangan debug di konsol peramban saat pengembangan: window.__twin.S (adegan), .sim, .ui
if (import.meta.env.DEV) {
  Promise.all([import('./three/context'), import('./domain/state'), import('./store/twinStore')]).then(([three, state, store]) => {
    (window as unknown as Record<string, unknown>).__twin = { S: three.S, T3: three.T3, VIEWS: three.VIEWS, sim: state.sim, ui: store.ui, store };
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Element #root not found in index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
