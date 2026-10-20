import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import { App } from '../App';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { fishingPagePath } from './pagePath';
import '../styles.css';
import './fishingPage.css';

// The site serves this page at /fishmap (and the map at its long path); local
// servers at /fishing. A trailing slash would change what relative links and
// the share URL are measured from.
const path = fishingPagePath(location.pathname);
if (path !== null) {
  try { history.replaceState(null, '', `${path}${location.search}${location.hash}`); } catch { /* The map still works if history is unavailable. */ }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App focus="fishing" />
    </ErrorBoundary>
  </StrictMode>,
);
