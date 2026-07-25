import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserMapRecord } from "../types";

const paneEl = vi.hoisted(() => ({ current: null as HTMLElement | null }));

const stubMapApi = vi.hoisted(() => ({
  createPane: vi.fn(() => {
    paneEl.current = document.createElement("div");
    return paneEl.current;
  }),
  getPane: vi.fn(() => paneEl.current ?? undefined),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
}));

vi.mock("react-leaflet", () => ({
  useMap: () => stubMapApi,
}));

const layerInstances = vi.hoisted(
  () => [] as Array<{ options: unknown; setOpacity: ReturnType<typeof vi.fn> }>,
);

vi.mock("../render/WarpedRasterLayer", () => ({
  WarpedRasterLayer: class {
    options: unknown;
    setOpacity = vi.fn();
    constructor(options: unknown) {
      this.options = options;
      layerInstances.push(this as never);
    }
    addTo(map: { addLayer: (l: unknown) => void }) {
      map.addLayer(this);
      return this;
    }
    remove() {
      stubMapApi.removeLayer(this);
    }
  },
}));

import { UserMapLayers } from "./UserMapLayers";

const record: UserMapRecord = {
  id: "a",
  name: "Fixture map",
  source: "geotiff",
  createdAt: "2026-07-24T00:00:00.000Z",
  pixelSize: { width: 8, height: 6 },
  georef: {
    kind: "embedded",
    crs: "EPSG:26920",
    geotransform: [500000, 10, 0, 5000000, 0, -10],
  },
};

function stubBitmapLoading() {
  const bitmap = { width: 8, height: 6, close: vi.fn() };
  vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  return bitmap;
}

afterEach(() => {
  // Explicitly unmount before clearing mocks. This file's own afterEach runs
  // BEFORE the global afterEach in src/test/setup.ts (Vitest runs same-level
  // afterEach hooks LIFO: the later-registered, file-local hook fires first),
  // so any test that leaves its tree mounted would otherwise have its
  // effect-cleanup (which calls removeLayer) fire only after this afterEach
  // already cleared the mocks — leaking a stray removeLayer call into the
  // NEXT test's call count. Calling cleanup() here first makes teardown
  // deterministic regardless of hook order; setup.ts's later cleanup() call
  // then finds nothing left to unmount.
  cleanup();
  vi.unstubAllGlobals();
  layerInstances.length = 0;
  paneEl.current = null;
  stubMapApi.createPane.mockClear();
  stubMapApi.addLayer.mockClear();
  stubMapApi.removeLayer.mockClear();
});

describe("UserMapLayers", () => {
  it("creates the user-maps pane once per map set", async () => {
    stubBitmapLoading();
    render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    expect(stubMapApi.createPane).toHaveBeenCalledWith("user-maps-pane");
  });

  it("adds a warped layer per visible map, closes its bitmap on unmount", async () => {
    const bitmap = stubBitmapLoading();
    const { unmount } = render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    unmount();
    expect(stubMapApi.removeLayer).toHaveBeenCalledTimes(1);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("constructs the layer with the latest opacity when it changes during bitmap load", async () => {
    // Deliberate race: opacity changes before createImageBitmap resolves. The
    // ref-based implementation reads through opacityRef at construction time,
    // so the layer must be built with the LATEST opacity (0.2), never the
    // stale 0.7 captured when the effect first ran.
    let resolveBitmap!: (b: unknown) => void;
    const createImageBitmapMock = vi.fn(
      () => new Promise((resolve) => { resolveBitmap = resolve; }),
    );
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
    const { rerender } = render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.2 }]} />,
    );
    // fetch()+blob() need to actually resolve through their own microtasks
    // before createImageBitmap gets called and resolveBitmap is assigned;
    // render()/rerender() do not flush those extra ticks, so calling
    // resolveBitmap immediately would throw "resolveBitmap is not a
    // function". Wait for the real invocation instead.
    await waitFor(() => expect(createImageBitmapMock).toHaveBeenCalled());
    resolveBitmap({ width: 8, height: 6, close: vi.fn() });
    await waitFor(() => expect(layerInstances).toHaveLength(1));
    const built = layerInstances[0].options as { opacity: number };
    expect(built.opacity).toBe(0.2);
  });

  it("survives a failed bitmap load without an unhandled rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("gone"); }));
    vi.stubGlobal("createImageBitmap", vi.fn());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:dead", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(stubMapApi.addLayer).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
