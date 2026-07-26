import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UserMapImportError } from "./errors";
import { UserMapStore } from "./store/userMapStore";
import { meshForRecord } from "./recordMesh";
import { BENT, gcpRecord } from "./testFixtures";
import { solveAffineFromGcps } from "./transform/affine";
import type { Gcp, GcpGeoref } from "./types";
import { needsGeoreferencing, useUserMaps } from "./useUserMaps";

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

/**
 * jsdom has no createImageBitmap, so parseImage is injected everywhere the
 * same way `parse` already is. Every PNG/JPEG test MUST go through
 * `options()` — a bare `useUserMaps({...})` would take the real decode path
 * and reject on a missing global.
 */
function testParseImage() {
  return async () => ({
    pixelSize: { width: 1200, height: 800 },
    preview: new Blob(["p"], { type: "image/png" }),
    previewSize: { width: 1200, height: 800 },
  });
}

function pngFile(name: string): File {
  // Real PNG magic bytes: sniffFileType reads them, so a placeholder blob
  // would take the "unrecognized" branch and never reach parseImage.
  const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([magic], name, { type: "image/png" });
}

function tiffFile(name: string): File {
  const magic = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  return new File([magic], name, { type: "image/tiff" });
}

let factory: IDBFactory;

function options(overrides: Record<string, unknown> = {}) {
  return {
    openStore: () => UserMapStore.open(factory),
    parse: testParse(),
    parseImage: testParseImage(),
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

describe("needsGeoreferencing", () => {
  it("does not badge a tps-solvable record as needing georeferencing", () => {
    // needsGeoreferencing (useUserMaps.ts:57) gates admission to visibleMaps.
    // Affine refuses a transform squashed past MIN_ANISOTROPY_RATIO; TPS has no
    // such concept, so an affine-only check would exclude a record whose spline
    // is fine and the user could never switch it on.
    const record = gcpRecord({ georef: { kind: "gcp", gcps: BENT, method: "tps" } });
    expect(needsGeoreferencing(record)).toBe(false);
  });

  it("badges a tps record the SPLINE refuses, though an affine would solve it", () => {
    // Added beyond the brief's list, and it is the test that actually pins the
    // wiring. Measured: the test above passes against an affine-only
    // predicate, because `solveTps` refuses a strict SUPERSET of what
    // `solveAffine` does — its destination gate IS a `solveAffine` call
    // (tps.ts:162) — so no record exists that affine refuses and TPS accepts.
    // The real divergence runs the other way, and this is it: a double-click
    // puts two control points on the same scan pixel, which makes two rows of
    // the interpolation matrix identical. An affine least-squares fit just
    // averages the duplicate away and solves; the spline refuses. Left
    // affine-only, the row gets an enabled checkbox and a slider, enters
    // `visibleMaps`, and then `meshForRecord` returns null and nothing is
    // drawn — the exact lie this predicate's doc comment exists to prevent.
    const doubleClicked: Gcp[] = [
      ...BENT,
      { id: "dup", pixel: { x: 320, y: 240 }, map: { lat: 46.407181, lng: -61.530755 } },
    ];
    // Pins that the fixture discriminates rather than being degenerate for
    // both solvers: an affine genuinely accepts these points.
    expect(solveAffineFromGcps(doubleClicked)).not.toBeNull();
    const record = gcpRecord({
      georef: { kind: "gcp", gcps: doubleClicked, method: "tps" },
    });
    expect(needsGeoreferencing(record)).toBe(true);
    // The predicate exists to mean "meshForRecord will draw nothing", so the
    // two must agree about this record.
    expect(meshForRecord(record)).toBeNull();
  });
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

  it("reports the conversion hint for PDFs, even tiny ones", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    // 5 bytes on purpose: regression guard for the Uint8Array(buffer, 0, 16)
    // RangeError the review caught.
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "plan.pdf");
    await act(async () => {
      await result.current.importFiles([pdf]);
    });
    expect(result.current.outcomes[0]).toMatchObject({ ok: false });
    // PDFs are the only type still turned away, and the georeferencer now
    // exists, so the old "arrives with the georeferencer" copy would be a
    // lie: the message has to tell the user how to get the file in today.
    expect((result.current.outcomes[0] as { message: string }).message).toContain(
      "gdal_translate",
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

  // --- Plain scans, drafts, and the georeferencing session -------------------

  it("imports a PNG as an ungeoreferenced draft", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("church-1888.png")]);
    });
    expect(result.current.records).toHaveLength(1);
    const [record] = result.current.records;
    expect(record.source).toBe("image");
    expect(record.georef).toEqual({ kind: "gcp", gcps: [], method: "affine" });
    expect(result.current.needsGeoreferencing(record)).toBe(true);
    expect(result.current.outcomes[0]).toMatchObject({
      ok: true,
      needsGeoreferencing: true,
    });
  });

  it("opens the georeferencer for a freshly imported scan", async () => {
    // Spec: an imported scan opens the panel. Without this the outcome's
    // needsGeoreferencing flag is produced and never consumed, and the user
    // has to find the new row and click Georeference themselves.
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("church-1888.png")]);
    });
    expect(result.current.georeferencingId).toBe(result.current.records[0].id);
    expect(result.current.editingMap?.record.id).toBe(
      result.current.records[0].id,
    );
  });

  it("does not open the georeferencer for a map that arrives already placed", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.georeferencingId).toBeNull();
  });

  it("routes an ungeoreferenced TIFF to the georeferencer rather than failing", async () => {
    const { result } = renderHook(() =>
      useUserMaps(
        options({
          parse: async () => ({
            pixelSize: { width: 8, height: 6 },
            georef: null,
            preview: new Blob(["preview"], { type: "image/png" }),
            previewSize: { width: 8, height: 6 },
          }),
        }),
      ),
    );
    await act(async () => {
      await result.current.importFiles([tiffFile("scan.tif")]);
    });
    const [record] = result.current.records;
    expect(record.source).toBe("geotiff");
    expect(record.georef).toEqual({ kind: "gcp", gcps: [], method: "affine" });
  });

  it("hides the map under edit from visibleMaps and exposes it as editingMap", async () => {
    // The georeferencer drapes the draft itself, through a mesh that changes
    // on every pointer move. If the same map were ALSO in visibleMaps it
    // would be drawn twice and the saved-map layer would rebuild on every
    // drag frame.
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("scan.png")]);
    });
    const id = result.current.records[0].id;
    await act(async () => {
      result.current.setEnabled(id, true);
      result.current.beginGeoreference(id);
    });
    expect(result.current.georeferencingId).toBe(id);
    expect(result.current.visibleMaps.map((m) => m.record.id)).not.toContain(id);
    expect(result.current.editingMap?.record.id).toBe(id);
    await act(async () => {
      result.current.endGeoreference();
    });
    expect(result.current.editingMap).toBeNull();
  });

  it("keeps editingMap referentially stable across an unrelated re-render", async () => {
    // App memoizes the georeference binding on `editingMap`. A fresh literal
    // every render busts that memo, hands MapCanvas a new `draft` object on
    // every unrelated state change, and defeats the whole hot path Task 6
    // exists to protect.
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("scan.png")]);
    });
    const before = result.current.editingMap;
    // Not just "not null": `undefined` would satisfy that and make the
    // identity assertion below pass vacuously before editingMap exists.
    expect(before?.record.id).toBe(result.current.records[0].id);
    // An unrelated import failure: new outcomes, importing/importingLabel
    // toggling, no change to the map under edit.
    await act(async () => {
      await result.current.importFiles([
        new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "plan.pdf"),
      ]);
    });
    expect(result.current.editingMap).toBe(before);
  });

  it("clears georeferencingId when the map under edit is removed", async () => {
    // removeMap owns the georeferencingId state, so it must invalidate any
    // open session when the subject map is deleted. Otherwise an empty
    // georeferencer would render over a deleted map holding a revoked blob URL.
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("scan.png")]);
    });
    const id = result.current.records[0].id;
    await act(async () => {
      result.current.beginGeoreference(id);
    });
    expect(result.current.georeferencingId).toBe(id);

    // Removing the map under edit must clear the session.
    await act(async () => {
      await result.current.removeMap(id);
    });
    expect(result.current.georeferencingId).toBeNull();
  });

  it("preserves georeferencingId when removing a different map", async () => {
    // Deleting map B must not close a session open on map A. Only the map
    // matching the deleted id should close its session.
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("scan-a.png"), pngFile("scan-b.png")]);
    });
    const [idA, idB] = result.current.records.map((r) => r.id);
    await act(async () => {
      result.current.beginGeoreference(idA);
    });
    expect(result.current.georeferencingId).toBe(idA);

    // Removing map B (the one NOT under edit) must not touch the session.
    await act(async () => {
      await result.current.removeMap(idB);
    });
    expect(result.current.georeferencingId).toBe(idA);
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0].id).toBe(idA);
  });

  it("persists saved GCPs to IndexedDB and leaves every other record's identity untouched", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("a.png"), pngFile("b.png")]);
    });
    const [first, second] = result.current.records;
    const secondBefore = second;
    const saved: Gcp[] = [
      { id: "g0", pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -61 } },
    ];
    await act(async () => {
      await result.current.saveGcps(first.id, saved);
    });
    const updated = result.current.records.find((r) => r.id === first.id);
    expect(updated?.georef).toMatchObject({ kind: "gcp", method: "affine" });
    expect((updated?.georef as GcpGeoref).gcps).toHaveLength(1);
    // The untouched record must be the SAME object, or UserMapLayers tears
    // down and rebuilds its Leaflet layer for nothing.
    expect(result.current.records.find((r) => r.id === second.id)).toBe(
      secondBefore,
    );

    // The half that had zero coverage, and was broken: a round trip through
    // the actual database. The first implementation assigned the new record
    // inside a setRecords updater and read it back on the next line, so the
    // write silently never happened whenever React deferred the updater —
    // which App always makes it do. In-memory `records` looked perfect.
    const reopened = await UserMapStore.open(factory);
    const persisted = await reopened.listUserMaps();
    const persistedGeoref = persisted.find((r) => r.id === first.id)
      ?.georef as GcpGeoref;
    expect(persistedGeoref.gcps).toEqual(saved);
    // …and the raster the metadata-only write must NOT have touched.
    expect(await (await reopened.getPreviewBlob(first.id))?.text()).toBe("p");
  });

  it("keeps points for the session when the metadata write fails", async () => {
    const failingStore = {
      listUserMaps: async () => [],
      saveUserMap: async () => {},
      putUserMapRecord: async () => {
        throw new Error("quota");
      },
      getPreviewBlob: async () => null,
      deleteUserMap: async () => {},
      close: () => {},
    } as unknown as UserMapStore;
    const { result } = renderHook(() =>
      useUserMaps(options({ openStore: async () => failingStore })),
    );
    await act(async () => {
      await result.current.importFiles([pngFile("a.png")]);
    });
    await act(async () => {
      await result.current.saveGcps(result.current.records[0].id, [
        { id: "g0", pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -61 } },
      ]);
    });
    expect((result.current.records[0].georef as GcpGeoref).gcps).toHaveLength(1);
    expect(result.current.storageError).toContain("close the tab");
  });
});
