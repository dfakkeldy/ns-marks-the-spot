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
  () =>
    [] as Array<{
      options: unknown;
      setOpacity: ReturnType<typeof vi.fn>;
      setLatLngMesh: ReturnType<typeof vi.fn>;
    }>,
);

vi.mock("../render/WarpedRasterLayer", () => ({
  WarpedRasterLayer: class {
    options: unknown;
    setOpacity = vi.fn();
    setLatLngMesh = vi.fn();
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

  it("closes a late-arriving bitmap and never adds a layer when unmounted mid-load", async () => {
    // Deliberate race: unmount happens BEFORE createImageBitmap resolves.
    // The cancelled flag captured by the effect's closure must still be
    // true when the promise settles, so the .then() branch closes the
    // bitmap instead of building/adding a layer.
    let resolveBitmap!: (b: unknown) => void;
    const createImageBitmapMock = vi.fn(
      () => new Promise((resolve) => { resolveBitmap = resolve; }),
    );
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
    const { unmount } = render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(createImageBitmapMock).toHaveBeenCalled());
    unmount();
    const lateBitmap = { width: 8, height: 6, close: vi.fn() };
    resolveBitmap(lateBitmap);
    await waitFor(() => expect(lateBitmap.close).toHaveBeenCalled());
    expect(stubMapApi.addLayer).not.toHaveBeenCalled();
  });

  it("updates opacity on the existing layer instead of rebuilding it", async () => {
    // A broken implementation that puts `opacity` in the layer-construction
    // effect's dependency array would tear down and recreate the layer on
    // every opacity change instead of calling setOpacity on the existing
    // one. Assert both halves: setOpacity gets the new value, AND only one
    // layer instance/addLayer call ever happens.
    stubBitmapLoading();
    const { rerender } = render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    expect(layerInstances).toHaveLength(1);
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.3 }]} />,
    );
    await waitFor(() =>
      expect(layerInstances[0].setOpacity).toHaveBeenCalledWith(0.3),
    );
    expect(layerInstances).toHaveLength(1);
    expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1);
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

const GCP_RECORD: UserMapRecord = {
  id: "g",
  name: "Church scan",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: {
    kind: "gcp",
    method: "affine",
    gcps: [
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
      { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
      { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
    ],
  },
};

describe("UserMapLayers draft overlay", () => {
  it("updates the draft mesh without rebuilding the layer or re-decoding", async () => {
    // The whole point of the draft path: a GCP drag re-solves on every
    // pointer move, and rebuilding the layer would re-run createImageBitmap
    // on a multi-megapixel preview each frame.
    const createImageBitmapMock = vi.fn(async () => ({
      width: 1200,
      height: 800,
      close: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);

    const meshA = [
      [{ lat: 46.1, lng: -61.2 }, { lat: 46.1, lng: -61.0 }],
      [{ lat: 46.0, lng: -61.2 }, { lat: 46.0, lng: -61.0 }],
    ];
    const meshB = [
      [{ lat: 46.2, lng: -61.2 }, { lat: 46.2, lng: -61.0 }],
      [{ lat: 46.1, lng: -61.2 }, { lat: 46.1, lng: -61.0 }],
    ];
    const draft = {
      record: GCP_RECORD,
      previewUrl: "blob:draft",
      opacity: 0.7,
      mesh: meshA,
    };
    const { rerender } = render(<UserMapLayers maps={[]} draft={draft} />);
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));

    rerender(<UserMapLayers maps={[]} draft={{ ...draft, mesh: meshB }} />);
    await waitFor(() =>
      expect(layerInstances[0].setLatLngMesh).toHaveBeenCalledWith(meshB),
    );
    expect(layerInstances).toHaveLength(1);
    expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1);
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
  });

  it("draws nothing while the draft has too few points to solve", async () => {
    // Anchor the wait on something that DOES happen. An earlier draft of this
    // test waited for `createPane`, which the null-mesh branch never reaches:
    // `ensurePane` lives inside the bitmap `.then()`, past the `hasMesh` early
    // return, so the assertion could only ever time out. Rendering a saved map
    // alongside the draft gives a real event to wait for, and makes the
    // "exactly one layer" assertion meaningful rather than vacuous.
    stubBitmapLoading();
    render(
      <UserMapLayers
        maps={[{ record, previewUrl: "blob:saved", opacity: 0.7 }]}
        draft={{
          record: GCP_RECORD,
          previewUrl: "blob:draft",
          opacity: 0.3,
          mesh: null,
        }}
      />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    expect(layerInstances).toHaveLength(1);
    // The one layer built is the saved map's, not the draft's.
    expect((layerInstances[0].options as { opacity: number }).opacity).toBe(0.7);
  });

  it("does not re-push geometry when a saved map re-renders unchanged", async () => {
    // `useUserMaps` rebuilds its VisibleUserMap wrappers every render, so the
    // wrapper object is always new while `record` stays referentially stable.
    // Deriving the mesh in the render body returns a fresh array each time,
    // and the geometry layout effect is keyed on it — measured 3 setLatLngMesh
    // calls after 3 identical re-renders. During a drag that is every saved
    // layer rebuilding its lattice and repainting on every pointer move.
    stubBitmapLoading();
    const { rerender } = render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    const pushesAfterMount = layerInstances[0].setLatLngMesh.mock.calls.length;
    // Fresh wrapper object each time, same `record` reference — exactly what
    // useUserMaps hands down on an unrelated state change.
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    expect(layerInstances[0].setLatLngMesh.mock.calls.length).toBe(
      pushesAfterMount,
    );
  });
});
