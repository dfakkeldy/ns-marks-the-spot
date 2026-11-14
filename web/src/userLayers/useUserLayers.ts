import { useCallback, useEffect, useMemo, useState } from "react";
import { UserLayerStore } from "./store/userLayerStore";
import { validateLayerUrl, validateTermsUrl } from "./parseLayerUrl";
import type { UserLayerRecord, UserLayerUiState } from "./types";

const KEY = "user-layer-ui-state-v1";
function readState(): UserLayerUiState {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([id, raw]) => {
      if (!raw || typeof raw !== "object") return [];
      const state = raw as { enabled?: unknown; opacity?: unknown };
      return typeof state.enabled === "boolean" && typeof state.opacity === "number" && Number.isFinite(state.opacity)
        ? [[id, { enabled: state.enabled, opacity: Math.max(0, Math.min(1, state.opacity)) }]] : [];
    }));
  } catch { return {}; }
}
export function useUserLayers() {
  const [loaded, setLoaded] = useState(false);
  const [records, setRecords] = useState<UserLayerRecord[]>([]);
  const [state, setState] = useState<UserLayerUiState>(readState);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let live = true;
    UserLayerStore.open().then(async store => { try { const rows = await store.list(); if (live) { setRecords(rows.filter(record => record && typeof record.url === "string" && typeof record.id === "string" && record.id.startsWith("user-layer:") && typeof record.name === "string" && typeof record.createdAt === "string" && typeof record.attribution === "string" && typeof record.termsNote === "string" && (record.termsUrl === null || typeof record.termsUrl === "string") && record.acknowledgement?.version === 1 && ["xyz", "tms", "wms", "arcgis-map", "arcgis-image"].includes(record.kind) && !validateLayerUrl(record.url, record.kind) && !validateTermsUrl(record.termsUrl ?? ""))); setLoaded(true); } } finally { store.close(); } }).catch(() => { if (live) { setStorageError(true); setLoaded(true); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === KEY) setState(readState()); };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, []);
  const writeState = useCallback((update: (current: UserLayerUiState) => UserLayerUiState) => {
    setState(current => { const next = update(current); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { setStorageError(true); } return next; });
  }, []);
  const save = useCallback(async (record: UserLayerRecord) => {
    if (record.role === "base" && state[record.id]?.enabled) writeState(ui => {
      const next = { ...ui }; for (const item of records) if (item.id !== record.id && item.role === "base") next[item.id] = { enabled: false, opacity: ui[item.id]?.opacity ?? 1 }; return next;
    });
    setRecords(current => [...current.filter(item => item.id !== record.id), record]);
    try { const store = await UserLayerStore.open(); try { await store.put(record); } finally { store.close(); } } catch { setStorageError(true); }
  }, [records, state, writeState]);
  const remove = useCallback(async (id: string) => {
    setRecords(current => current.filter(item => item.id !== id));
    writeState(current => { const next = { ...current }; delete next[id]; return next; });
    try { const store = await UserLayerStore.open(); try { await store.delete(id); } finally { store.close(); } } catch { setStorageError(true); }
  }, [writeState]);
  const setEnabled = useCallback((id: string, enabled: boolean) => writeState(current => {
    const record = records.find(item => item.id === id); const next = { ...current };
    if (enabled && record?.role === "base") for (const layer of records) if (layer.role === "base" && layer.id !== id) next[layer.id] = { enabled: false, opacity: current[layer.id]?.opacity ?? 1 };
    next[id] = { enabled, opacity: current[id]?.opacity ?? 1 }; return next;
  }), [records, writeState]);
  const setOpacity = useCallback((id: string, opacity: number) => writeState(current => ({ ...current, [id]: { enabled: current[id]?.enabled ?? false, opacity: Math.max(0, Math.min(1, opacity)) } })), [writeState]);
  const visibleLayers = useMemo(() => records.filter(record => state[record.id]?.enabled).map(record => ({ record, opacity: state[record.id]?.opacity ?? 1 })), [records, state]);
  return { loaded, records, state, storageError, save, remove, setEnabled, setOpacity, visibleLayers };
}
