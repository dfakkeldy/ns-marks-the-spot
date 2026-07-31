import { describe, expect, it } from "vitest";
import {
  composeMapImage,
  type CompositorProgress,
  type CompositorTileLayer,
} from "./mapCompositor";
import {
  latLngToOutput,
  outputSpaceForBounds,
  tileOutputRect,
  tilesForBounds,
  zoomForOutput,
} from "./tileMath";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };
const size = { widthPx: 200, heightPx: 160 };

function solidTile(colour: string): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 256;
  tile.height = 256;
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 256, 256);
  return tile;
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...canvas.getContext("2d")!.getImageData(x, y, 1, 1).data];
}

function hexToRgb(hex: string): number[] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

// Typed against the concrete member (not the CompositorLayer union) so
// overrides stay structurally sound without a cast: Partial<union> only
// keeps keys common to every member, which drops `url`/`opacity`/etc and
// forces callers to assert their way past the mismatch.
const redTileLayer = (
  overrides?: Partial<CompositorTileLayer>,
): CompositorTileLayer => ({
  kind: "tile",
  id: "modern",
  name: "OpenStreetMap base map",
  url: ({ z, x, y }) => `https://tiles.example/${z}/${x}/${y}.png`,
  opacity: 1,
  maxNativeZoom: 19,
  ...overrides,
});

describe("composeMapImage", () => {
  it("draws a tile layer over the whole frame and reports rendered", async () => {
    const { canvas, statuses } = await composeMapImage(bounds, size,
      [redTileLayer()],
      { fetchImage: async () => solidTile("#ff0000") });
    expect(statuses).toEqual([
      { id: "modern", name: "OpenStreetMap base map", status: "rendered" },
    ]);
    expect(pixel(canvas, 100, 80).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it("places tiles individually rather than stretching one tile across the canvas", async () => {
    const layer = redTileLayer();
    const zoom = zoomForOutput(bounds, size.widthPx, layer.maxNativeZoom);
    const tiles = tilesForBounds(bounds, zoom);
    // Guard the test's own premise: this only proves per-tile placement
    // if the frame actually spans more than one tile (it does for these
    // bounds/size — a 2x2 grid at zoom 10).
    expect(tiles.length).toBeGreaterThan(1);

    const space = outputSpaceForBounds(bounds, size.widthPx, size.heightPx);
    const palette = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
    const colourByUrl = new Map<string, string>();
    const { canvas, statuses } = await composeMapImage(bounds, size,
      [layer],
      {
        fetchImage: async (url) => {
          // A different colour per tile coordinate: a bug that stretches
          // a single tile over the whole canvas would show only one of
          // these colours everywhere instead of each at its own rect.
          if (!colourByUrl.has(url)) {
            colourByUrl.set(url, palette[colourByUrl.size % palette.length]);
          }
          return solidTile(colourByUrl.get(url)!);
        },
      });
    expect(statuses[0].status).toBe("rendered");

    const sampled = tiles.map((tile) => {
      const rect = tileOutputRect(space, tile);
      const x = Math.round(
        Math.min(Math.max(rect.x + rect.width / 2, 0), size.widthPx - 1),
      );
      const y = Math.round(
        Math.min(Math.max(rect.y + rect.height / 2, 0), size.heightPx - 1),
      );
      const url = layer.url(tile)!;
      return {
        expected: hexToRgb(colourByUrl.get(url)!),
        actual: pixel(canvas, x, y).slice(0, 3),
      };
    });

    const distinctColours = new Set(sampled.map((s) => s.actual.join(",")));
    expect(distinctColours.size).toBeGreaterThanOrEqual(2);
    for (const { expected, actual } of sampled) {
      expect(actual).toEqual(expected);
    }
  });

  it("respects layer order and opacity", async () => {
    const { canvas } = await composeMapImage(bounds, size, [
      redTileLayer(),
      redTileLayer({
        id: "wash",
        name: "Blue wash",
        opacity: 0.5,
        url: () => "https://tiles.example/blue.png",
      }),
    ], {
      fetchImage: async (url) =>
        solidTile(url.includes("blue") ? "#0000ff" : "#ff0000"),
    });
    const [r, , b] = pixel(canvas, 100, 80);
    expect(r).toBeGreaterThan(100); // red shows through
    expect(b).toBeGreaterThan(100); // blue wash on top
  });

  it("reports a failed layer by name, keeps compositing, never throws", async () => {
    const { statuses } = await composeMapImage(bounds, size, [
      redTileLayer(),
      redTileLayer({
        id: "fletcher-03",
        name: "Fletcher sheet 3",
        url: () => "https://tiles.example/broken.png",
      }),
    ], {
      fetchImage: async (url) => {
        if (url.includes("broken")) throw new Error("HTTP 404");
        return solidTile("#ff0000");
      },
    });
    expect(statuses[0].status).toBe("rendered");
    expect(statuses[1]).toMatchObject({
      id: "fletcher-03",
      name: "Fletcher sheet 3",
      status: "failed",
    });
    expect(statuses[1].detail).toMatch(/tile/u);
  });

  it("marks a layer with no covering tiles as empty", async () => {
    const { statuses } = await composeMapImage(bounds, size,
      [redTileLayer({ url: () => null })],
      { fetchImage: async () => solidTile("#ff0000") });
    expect(statuses[0].status).toBe("empty");
  });

  it(
    "keeps canvas state balanced when a layer's draw throws mid-render " +
    "(regression)",
    async () => {
      const ring = [
        { lat: 46.15, lng: -61.35 },
        { lat: 46.15, lng: -61.15 },
        { lat: 46.05, lng: -61.15 },
        { lat: 46.05, lng: -61.35 },
        { lat: 46.15, lng: -61.35 },
      ];
      // Middle layer's fetchImage resolves to an object that isn't a
      // valid CanvasImageSource. node-canvas's ctx.drawImage throws a
      // synchronous TypeError ("Image or Canvas expected") for it, which
      // fires *after* ctx.save()/ctx.globalAlpha = 0.3 but before
      // ctx.restore() — exactly the unbalanced-stack scenario the
      // finally-block fix guards against.
      const { canvas, statuses } = await composeMapImage(bounds, size, [
        redTileLayer({ id: "base", name: "Base map" }),
        redTileLayer({
          id: "crashing",
          name: "Crashing overlay",
          opacity: 0.3,
          url: () => "https://tiles.example/crash.png",
        }),
        {
          kind: "parcel-ring",
          id: "selected-parcel",
          name: "Selected parcel",
          rings: [ring],
          strokeStyle: "#00ff00",
          lineWidthPx: 4,
        },
      ], {
        fetchImage: async (url) => {
          if (url.includes("crash")) {
            return {} as unknown as HTMLCanvasElement;
          }
          return solidTile("#ff0000");
        },
      });

      expect(statuses[1].status).toBe("failed");
      expect(statuses[2].status).toBe("rendered");

      // The parcel-ring renderer never touches globalAlpha itself, so it
      // is the layer that exposes a leaked value from the crashed layer
      // above it. Both the solid-red background and the green stroke
      // have a blue channel of 0, so the red channel alone measures the
      // opacity the stroke was actually drawn at: full opacity blends
      // src-over-dst completely (R → 0); a leaked globalAlpha of 0.3
      // would blend only 30% of the stroke in (R → ~178).
      const space = outputSpaceForBounds(bounds, size.widthPx, size.heightPx);
      const strokeY = Math.round(
        latLngToOutput(space, { lat: 46.15, lng: -61.25 }).y,
      );
      const row = Array.from({ length: size.widthPx }, (_, x) =>
        pixel(canvas, x, strokeY));
      const minRedChannel = Math.min(...row.map(([r]) => r));
      expect(minRedChannel).toBeLessThan(40);
    },
  );

  it("draws a parcel ring at projected pixel coordinates", async () => {
    const ring = [
      { lat: 46.15, lng: -61.35 },
      { lat: 46.15, lng: -61.15 },
      { lat: 46.05, lng: -61.15 },
      { lat: 46.05, lng: -61.35 },
      { lat: 46.15, lng: -61.35 },
    ];
    const { canvas, statuses } = await composeMapImage(bounds, size, [{
      kind: "parcel-ring",
      id: "selected-parcel",
      name: "Selected parcel",
      rings: [ring],
      strokeStyle: "#00ff00",
      lineWidthPx: 4,
    }], {});
    expect(statuses[0].status).toBe("rendered");
    // The ring's top edge sits at lat 46.15 → somewhere in the top half.
    const columns = Array.from({ length: size.widthPx }, (_, x) =>
      pixel(canvas, x, Math.round(size.heightPx * 0.25)));
    expect(columns.some(([r, g]) => g > 200 && r < 100)).toBe(true);

    // Horizontal span: pin the ring's left/right edges too, so a ring at
    // the right latitude but wrong longitude would fail this test. Sample
    // a row through the vertical mid-span of the ring (between its top
    // and bottom lats), which crosses only the left/right vertical edges.
    const space = outputSpaceForBounds(bounds, size.widthPx, size.heightPx);
    const midLat = (46.15 + 46.05) / 2;
    const rowY = Math.round(
      latLngToOutput(space, { lat: midLat, lng: -61.25 }).y,
    );
    const expectedLeftX = latLngToOutput(
      space, { lat: midLat, lng: -61.35 },
    ).x;
    const expectedRightX = latLngToOutput(
      space, { lat: midLat, lng: -61.15 },
    ).x;

    const midRow = Array.from({ length: size.widthPx }, (_, x) =>
      pixel(canvas, x, rowY));
    const greenXs = midRow
      .map(([r, g], x) => (g > 200 && r < 100 ? x : -1))
      .filter((x) => x >= 0);

    expect(greenXs.some((x) => Math.abs(x - expectedLeftX) <= 4)).toBe(true);
    expect(greenXs.some((x) => Math.abs(x - expectedRightX) <= 4)).toBe(true);
    // Well outside the ring's longitude span, the row must not be green —
    // this is what would catch a ring at the right latitude but the wrong
    // (or unbounded) longitude.
    expect(greenXs.some((x) => x < expectedLeftX - 15)).toBe(false);
    expect(greenXs.some((x) => x > expectedRightX + 15)).toBe(false);
  });

  it("warps a user map through the triangle mesh", async () => {
    const image = solidTile("#ffa500");
    // 1×1-cell mesh covering the middle of the frame.
    const latLngMesh = [
      [{ lat: 46.15, lng: -61.35 }, { lat: 46.15, lng: -61.15 }],
      [{ lat: 46.05, lng: -61.35 }, { lat: 46.05, lng: -61.15 }],
    ];
    const { canvas, statuses } = await composeMapImage(bounds, size, [{
      kind: "warped",
      id: "user-map-1",
      name: "My scan",
      image,
      imageWidth: 256,
      imageHeight: 256,
      latLngMesh,
      opacity: 1,
    }], {});
    expect(statuses[0].status).toBe("rendered");
    const [r, g, b] = pixel(canvas, 100, 80);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(100);
    expect(b).toBeLessThan(80);
  });

  it(
    "reports onProgress for each layer by name in order, ending fully " +
    "completed",
    async () => {
      const calls: CompositorProgress[] = [];
      await composeMapImage(bounds, size, [
        redTileLayer({ id: "a", name: "Layer A" }),
        redTileLayer({
          id: "b",
          name: "Layer B",
          url: () => "https://tiles.example/b.png",
        }),
      ], {
        fetchImage: async () => solidTile("#ff0000"),
        onProgress: (progress) => calls.push(progress),
      });

      expect(calls).toEqual([
        { completedLayers: 0, totalLayers: 2, currentLayer: "Layer A" },
        { completedLayers: 1, totalLayers: 2, currentLayer: "Layer B" },
        { completedLayers: 2, totalLayers: 2, currentLayer: "" },
      ]);
    },
  );
});
