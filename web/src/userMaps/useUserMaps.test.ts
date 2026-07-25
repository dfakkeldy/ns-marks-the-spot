import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UserMapImportError } from "./errors";
import { UserMapStore } from "./store/userMapStore";
import { useUserMaps } from "./useUserMaps";

function fixtureFile(name = "survey.tif"): File {
  const raw = readFileSync(
    join(__dirname, "..", "test", "fixtures", "utm20-8x6.tif"),
  );
  return new File([raw], name);
}

/** jsdom has no canvas, so every test injects a parse with a fake preview. */
function testParse() {
  return async (buffer: ArrayBuffer) => {
    const { parseGeoTiff } = await import("./parsers/geoTiffSource");
    return parseGeoTiff(buffer, {
      makePreview: async () => new Blob(["p"], { type: "image/png" }),
    });
  };
}

let factory: IDBFactory;

function options(overrides: Record<string, unknown> = {}) {
  return {
    openStore: () => UserMapStore.open(factory),
    parse: testParse(),
    ...overrides,
  };
}

beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => `blob:fake-${Math.random()}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("useUserMaps", () => {
  it("imports a GeoTIFF, enables it by default, and exposes it as visible", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.records[0].name).toBe("survey");
    expect(result.current.outcomes[0]).toMatchObject({ ok: true });
    expect(result.current.visibleMaps).toHaveLength(1);
    expect(result.current.visibleMaps[0].opacity).toBe(0.7);
  });

  it("reloads persisted maps on a fresh mount", async () => {
    const first = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await first.result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(first.result.current.records).toHaveLength(1));
    first.unmount();

    const second = renderHook(() => useUserMaps(options()));
    await waitFor(() => expect(second.result.current.records).toHaveLength(1));
  });

  it("reports the georeferencer message for PDFs, even tiny ones", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    // 5 bytes on purpose: regression guard for the Uint8Array(buffer, 0, 16)
    // RangeError the review caught.
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "plan.pdf");
    await act(async () => {
      await result.current.importFiles([pdf]);
    });
    expect(result.current.outcomes[0]).toMatchObject({ ok: false });
    expect((result.current.outcomes[0] as { message: string }).message).toContain(
      "georeferencer",
    );
    expect(result.current.records).toHaveLength(0);
  });

  it("refuses files over the hard limit without reading them", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    const huge = new File([new Uint8Array(8)], "huge.tif");
    Object.defineProperty(huge, "size", { value: 501 * 1024 * 1024 });
    await act(async () => {
      await result.current.importFiles([huge]);
    });
    expect(result.current.outcomes[0]).toMatchObject({ ok: false });
  });

  it("keeps the map available in memory when saving fails (spec promise)", async () => {
    const failingStore = {
      listUserMaps: async () => [],
      saveUserMap: async () => {
        throw new UserMapImportError(
          "quota",
          "Storage is full — this map stays available until you close the tab.",
        );
      },
      getPreviewBlob: async () => null,
      deleteUserMap: async () => {},
      close: () => {},
    } as unknown as UserMapStore;
    const { result } = renderHook(() =>
      useUserMaps(options({ openStore: async () => failingStore })),
    );
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.visibleMaps).toHaveLength(1);
    expect(result.current.outcomes[0]).toMatchObject({ ok: true });
    expect((result.current.outcomes[0] as { note?: string }).note).toContain(
      "close the tab",
    );
  });

  it("surfaces a storage error when the database cannot open", async () => {
    const { result } = renderHook(() =>
      useUserMaps(
        options({
          openStore: async () => {
            throw new Error("blocked");
          },
        }),
      ),
    );
    await waitFor(() => expect(result.current.storageError).not.toBeNull());
    // Importing still works — maps just live in memory for this session.
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
  });

  it("toggles visibility and persists opacity to localStorage", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    const id = result.current.records[0].id;

    act(() => result.current.setEnabled(id, false));
    expect(result.current.visibleMaps).toHaveLength(0);

    act(() => result.current.setOpacity(id, 0.4));
    const stored = JSON.parse(
      localStorage.getItem("user-map-ui-state-v1") ?? "{}",
    ) as Record<string, { enabled: boolean; opacity: number }>;
    expect(stored[id]).toEqual({ enabled: false, opacity: 0.4 });
  });

  it("removes a map everywhere and revokes its preview URL", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    const id = result.current.records[0].id;
    await act(async () => {
      await result.current.removeMap(id);
    });
    expect(result.current.records).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("revokes all preview URLs on unmount", async () => {
    const { result, unmount } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  // --- Record-identity stability -------------------------------------------
  //
  // UserMapLayers' layer-construction effect (Task 7) depends on the `record`
  // OBJECT REFERENCE inside each VisibleUserMap entry. If useUserMaps handed
  // out a freshly-constructed record object on every render, that effect
  // would tear down and rebuild the Leaflet layer (re-decoding the bitmap)
  // on every unrelated state change — a visible flicker. This test pins that
  // half of the contract: identity survives renders caused by OTHER state.
  // (There is currently no path that mutates an existing record in place, so
  // a record's object identity never changes for its own lifetime.)

  it("keeps a stable record object identity across an unrelated re-render", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.visibleMaps).toHaveLength(1));
    const id = result.current.records[0].id;
    const recordBefore = result.current.visibleMaps[0].record;

    // Opacity is unrelated to record data; this must not touch identity.
    act(() => result.current.setOpacity(id, 0.42));
    expect(result.current.visibleMaps[0].record).toBe(recordBefore);

    // Importing an (invalid) second file causes an unrelated `outcomes`
    // update and an importing/importingLabel toggle; the first map's record
    // must still be the same reference afterward.
    await act(async () => {
      await result.current.importFiles([
        new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "plan.pdf"),
      ]);
    });
    expect(result.current.visibleMaps[0].record).toBe(recordBefore);
  });

  // --- "Large file" note truthfulness ---------------------------------------
  //
  // The note used to be keyed on file BYTES (> LARGE_FILE_BYTES) while
  // downsampling is keyed on PIXELS (> PREVIEW_MAX_DIMENSION in either
  // dimension), so a highly-compressed large file that decodes at full
  // resolution got a false "reduced resolution" claim. It must be keyed on
  // whether parseGeoTiff actually returned a smaller previewSize than
  // pixelSize.

  it("does not claim reduced resolution when the preview was not actually downsampled", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    // The real fixture is tiny (8x6) and never gets downsampled by
    // parseGeoTiff; forcing a large byte size in isolation proves the note
    // is no longer keyed on bytes alone.
    const file = fixtureFile();
    Object.defineProperty(file, "size", { value: 180 * 1024 * 1024 });
    await act(async () => {
      await result.current.importFiles([file]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    const outcome = result.current.outcomes[0] as { ok: true; note?: string };
    expect(outcome.note).toBe("Large file.");
  });

  it("claims reduced resolution only when previewSize is genuinely smaller than pixelSize", async () => {
    const downsampledParse = async (buffer: ArrayBuffer) => {
      const { parseGeoTiff } = await import("./parsers/geoTiffSource");
      const parsed = await parseGeoTiff(buffer, {
        makePreview: async () => new Blob(["p"], { type: "image/png" }),
      });
      return {
        ...parsed,
        pixelSize: { width: 5000, height: 5000 },
        previewSize: { width: 4096, height: 4096 },
      };
    };
    const { result } = renderHook(() =>
      useUserMaps(options({ parse: downsampledParse })),
    );
    // Deliberately a small file in bytes: proves the note is keyed on the
    // parsed pixel/preview sizes, not on file.size.
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    const outcome = result.current.outcomes[0] as { ok: true; note?: string };
    expect(outcome.note).toBe("Large file — displayed at reduced resolution.");
  });

  // --- crypto.randomUUID unavailable (plain-http LAN dev server) -----------

  it("still imports successfully when crypto.randomUUID is unavailable", async () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    });
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.outcomes[0]).toMatchObject({ ok: true });
    expect(result.current.records[0].id).toBeTruthy();
  });
});
