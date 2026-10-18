import { createRoot } from 'react-dom/client';
import { PokerApp } from './PokerApp';
import { ErrorBoundary } from '../components/ErrorBoundary';
if (/^\/poker\/?$/u.test(location.pathname)) {
  try { history.replaceState(null, '', '/poker'); } catch { /* The app still works if history is unavailable. */ }
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary className="poker-fatal-error" recoveryNote={<p>Reloading restores your last saved Poker session. If browser storage was unavailable, recent changes may not have been saved.</p>}>
    <PokerApp />
  </ErrorBoundary>,
);
