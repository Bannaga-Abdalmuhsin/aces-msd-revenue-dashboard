import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
  window.history.replaceState(null, '', '/');
}
createRoot(document.getElementById('root')).render(<App />);
