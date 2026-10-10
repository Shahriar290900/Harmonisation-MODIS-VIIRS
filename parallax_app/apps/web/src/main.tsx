import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Router } from './experience/Router';
import { registerPwa } from './ui/PwaStatus';
import './styles/app.css';

// The selection store is attached by the Router when the Workspace route mounts (so the Landing keeps its '#/' hash).
createRoot(document.getElementById('root')!).render(<StrictMode><Router /></StrictMode>);
// Service worker for BOTH routes (a landing-only visit must still cache the shell for offline). Idempotent, deferred to load.
registerPwa();
