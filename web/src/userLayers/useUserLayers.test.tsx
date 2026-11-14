import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useUserLayers } from "./useUserLayers";
import type { UserLayerRecord } from "./types";

describe("user layer state", () => {
  it("keeps only one enabled base and restores row state", async () => {
    const { result, unmount } = renderHook(() => useUserLayers());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const first = { id: "user-layer:base-a", role: "base", name: "A" } as UserLayerRecord;
    const second = { id: "user-layer:base-b", role: "base", name: "B" } as UserLayerRecord;
    await act(async () => { await result.current.save(first); });
    await act(async () => { await result.current.save(second); });
    act(() => { result.current.setEnabled(first.id, true); });
    act(() => { result.current.setEnabled(second.id, true); });
    expect(result.current.state[first.id].enabled).toBe(false);
    expect(result.current.state[second.id].enabled).toBe(true);
    unmount();
    const fresh = renderHook(() => useUserLayers());
    await waitFor(() => expect(fresh.result.current.records.some(x => x.id === second.id)).toBe(true));
    expect(fresh.result.current.state[second.id].enabled).toBe(true);
    await act(async () => { await fresh.result.current.remove(first.id); await fresh.result.current.remove(second.id); });
  });
});
