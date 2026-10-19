import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { PREVIEW } from './lib.js';
import { MotionConfig } from 'framer-motion';
import { installSpotlight } from './motion.jsx';

const Router = PREVIEW ? MemoryRouter : BrowserRouter;
if (PREVIEW) {
  // Download links need the real server; explain instead of breaking.
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href^="/api"]');
    if (a) { e.preventDefault(); alert('Downloads work in the real app, not in this preview.'); }
  }, true);
}
import App from './App.jsx';
import { ToastProvider } from './ui.jsx';
import './styles.css';

installSpotlight();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <Router>
        <ToastProvider><App /></ToastProvider>
      </Router>
    </MotionConfig>
  </React.StrictMode>,
);
