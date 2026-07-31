import { describe, expect, it } from "vitest";
import {
  composeMapImage,
  type CompositorTileLayer,
} from "./mapCompositor";

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
});
