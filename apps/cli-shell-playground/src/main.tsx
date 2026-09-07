import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@xterm/xterm/css/xterm.css';
import '@tigrisdata/cli-shell/styles.css';
import './app.css';

import { App } from './App';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
