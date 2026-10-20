import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import { App } from '../App';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../styles.css';
import './pointTupperPage.css';

// The site serves this page at /pointtupper; a trailing slash would change
// what relative links and the share URL are measured from.
if (/^\/pointtupper\/$/u.test(location.pathname)) {
  try { history.replaceState(null, '', `/pointtupper${location.search}${location.hash}`); } catch { /* The map still works if history is unavailable. */ }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App focus="pointtupper" />
    </ErrorBoundary>
  </StrictMode>,
);
