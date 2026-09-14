import { useCallback, useEffect, useState } from 'react';
import { isBasemapStyle, resolveBasemapStyle, type BasemapPreference, type BasemapStyle } from './basemap';

export type InterfaceAppearance = 'map' | 'system' | 'day' | 'night';
const APPEARANCE_KEY = 'ns-marks-the-spot:interface-appearance';
function storedAppearance(): InterfaceAppearance {
  try {
    const value = localStorage.getItem(APPEARANCE_KEY);
    return value === 'system' || value === 'day' || value === 'night' ? value : 'map';
  } catch { return 'map'; }
}

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
  const [appearance, updateAppearance] = useState(storedAppearance);
  const interfaceStyle = appearance === 'map' ? (style === 'osm' ? (systemDark ? 'night' : 'day') : style)
    : appearance === 'system' ? (systemDark ? 'night' : 'day') : appearance;
  const setAppearance = useCallback((value: InterfaceAppearance) => {
    updateAppearance(value);
    try { localStorage.setItem(APPEARANCE_KEY, value); } catch { /* Session choice still works. */ }
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.mapAppearance;
    root.dataset.mapAppearance = interfaceStyle;
    return () => {
      if (previous) root.dataset.mapAppearance = previous;
      else delete root.dataset.mapAppearance;
    };
  }, [interfaceStyle]);
  const setPreference = useCallback((value: BasemapPreference) => {
    updatePreference(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the choice for this session. */ }
  }, []);
  return { preference, setPreference, style, appearance, setAppearance };
}
