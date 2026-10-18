import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestDurableStorage,
  resetDurableStorageRequestForTests,
} from "./durableStorage";

afterEach(() => {
  resetDurableStorageRequestForTests();
  vi.unstubAllGlobals();
});

describe("requestDurableStorage", () => {
  it("asks navigator.storage.persist exactly once across many saves", () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal("navigator", { storage: { persist } });

    requestDurableStorage();
    requestDurableStorage();
    requestDurableStorage();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("survives a browser without the API, and a rejecting one", () => {
    vi.stubGlobal("navigator", {});
    expect(() => requestDurableStorage()).not.toThrow();

    resetDurableStorageRequestForTests();
    vi.stubGlobal("navigator", {
      storage: { persist: vi.fn(async () => Promise.reject(new Error("no"))) },
    });
    expect(() => requestDurableStorage()).not.toThrow();
  });
});
