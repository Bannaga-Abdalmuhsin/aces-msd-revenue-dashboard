import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// When deployed to GitHub Pages the backend runs on Replit.
// Set VITE_API_BASE_URL (GitHub secret) to the Replit API server URL,
// e.g. https://<repl-slug>.replit.app/aces-msd-revenue-dashboard
// Leave it unset (or empty) for local / Replit dev — relative URLs work there.
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) setBaseUrl(apiBase);

createRoot(document.getElementById('root')!).render(<App />);
