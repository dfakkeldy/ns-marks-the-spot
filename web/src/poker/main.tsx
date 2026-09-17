import { createRoot } from 'react-dom/client';
import { PokerApp } from './PokerApp';
if (/^\/poker\/?$/u.test(location.pathname)) {
  try { history.replaceState(null, '', '/poker'); } catch { /* The app still works if history is unavailable. */ }
}
createRoot(document.getElementById('root')!).render(<PokerApp />);
