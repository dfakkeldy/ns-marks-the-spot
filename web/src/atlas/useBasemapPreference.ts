import { useCallback, useEffect, useState } from 'react';
import { isBasemapStyle, resolveBasemapStyle, type BasemapPreference, type BasemapStyle } from './basemap';

const STORAGE_KEY = 'ns-marks-the-spot:basemap';
function storedPreference(): BasemapPreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isBasemapStyle(value) ? value : 'system';
  } catch { return 'system'; }
}

export function useBasemapPreference(shared?: BasemapStyle) {
  const [preference, updatePreference] = useState<BasemapPreference>(() => shared ?? storedPreference());
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const changed = () => setSystemDark(query.matches);
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    changed();
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  const style = resolveBasemapStyle(preference, systemDark);
  const dark = preference === 'osm' ? systemDark : style === 'night';
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.mapAppearance;
    root.dataset.mapAppearance = dark ? 'night' : 'day';
    return () => {
      if (previous) root.dataset.mapAppearance = previous;
      else delete root.dataset.mapAppearance;
    };
  }, [dark]);
  const setPreference = useCallback((value: BasemapPreference) => {
    updatePreference(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the choice for this session. */ }
  }, []);
  return { preference, setPreference, style };
}
