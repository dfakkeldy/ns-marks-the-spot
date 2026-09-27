import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import { App } from '../App';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../styles.css';
import './rhodenaPage.css';

// The site serves this page at /rhodena; a trailing slash would change what
// relative links and the share URL are measured from.
if (/^\/rhodena\/$/u.test(location.pathname)) {
  try { history.replaceState(null, '', `/rhodena${location.search}${location.hash}`); } catch { /* The map still works if history is unavailable. */ }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App focus="rhodena" />
    </ErrorBoundary>
  </StrictMode>,
);
