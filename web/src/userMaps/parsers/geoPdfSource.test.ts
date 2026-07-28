import { describe, expect, it, vi } from "vitest";
import type { GeoPdfMetadataExtraction } from "./geoPdfMetadata";
import {
  parseGeoPdf,
  type GeoPdfParseEnvironment,
} from "./geoPdfSource";

const soleExtraction: GeoPdfMetadataExtraction = {
  producer: "Fixture",
  pageStructure: {
    family: "measure",
    structureId: "measure-vp-geo-v1",
    completeLabels: ["Map frame"],
    registrationCount: 1,
  },
  candidates: [
    {
      id: "measure-1",
      flavor: "measure",
      embeddedLabel: "Map frame",
      sourceRect: { x: 0, y: 0, width: 4096, height: 2048 },
      gcps: [
        { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -63 } },
        { id: "b", pixel: { x: 4096, y: 0 }, map: { lat: 46, lng: -62 } },
        { id: "c", pixel: { x: 0, y: 2048 }, map: { lat: 45, lng: -63 } },
      ],
    },
  ],
  rejected: [],
};

function environment(
  extraction: GeoPdfMetadataExtraction = soleExtraction,
): {
  environment: GeoPdfParseEnvironment;
  getPage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  encodePng: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  destroyLoading: ReturnType<typeof vi.fn>;
  destroyDocument: ReturnType<typeof vi.fn>;
  cleanupPage: ReturnType<typeof vi.fn>;
  extractMetadata: ReturnType<typeof vi.fn>;
} {
  const events: string[] = [];
  const fillRect = vi.fn(() => events.push("fill"));
  const render = vi.fn(() => ({
    promise: Promise.resolve().then(() => events.push("rendered")),
    cancel: vi.fn(),
  }));
  const cleanupPage = vi.fn();
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 200 * scale,
      height: 100 * scale,
      transform: [scale, 0, 0, -scale, 0, 100 * scale] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ],
      viewBox: [0, 0, 200, 100] as [number, number, number, number],
    }),
    render,
    cleanup: cleanupPage,
  };
  const getPage = vi.fn(async () => page);
  const destroyDocument = vi.fn(async () => undefined);
  const document = {
    numPages: 3,
    getPage,
    cleanup: vi.fn(),
    destroy: destroyDocument,
  };
  const destroyLoading = vi.fn(async () => undefined);
  const loadingTask = {
    promise: Promise.resolve(document),
    onPassword: undefined as
      | ((callback: () => void, reason: number) => void)
      | undefined,
    destroy: destroyLoading,
  };
  const encodePng = vi.fn(async () => {
    events.push("encoded");
    return new Blob(["png"], { type: "image/png" });
  });
  const release = vi.fn();
  const extractMetadata = vi.fn(async () => extraction);
  const parseEnvironment: GeoPdfParseEnvironment = {
    getDocument: vi.fn(() => loadingTask),
    createCanvas: vi.fn((size) => ({
      canvas: { width: size.width, height: size.height } as HTMLCanvasElement,
      context: {
        save: vi.fn(),
        fillStyle: "",
        fillRect,
        restore: vi.fn(),
      } as unknown as CanvasRenderingContext2D,
      encodePng,
      release,
    })),
    extractMetadata,
    assetBaseUrl: "http://localhost/vendor/pdfjs/6.1.200/",
  };
  return {
    environment: parseEnvironment,
    getPage,
    fillRect,
    render,
    encodePng,
    release,
    destroyLoading,
    destroyDocument,
    cleanupPage,
    extractMetadata,
  };
}

describe("parseGeoPdf", () => {
  it("rasterizes only page 1 at an opaque 4096-pixel dominant edge", async () => {
    const seams = environment();
    const parsed = await parseGeoPdf(new ArrayBuffer(16), seams.environment);
    expect(seams.getPage).toHaveBeenCalledWith(1);
    expect(seams.getPage).toHaveBeenCalledTimes(1);
    expect(parsed.pixelSize).toEqual({ width: 4096, height: 2048 });
    expect(parsed.pageCount).toBe(3);
    expect(seams.fillRect).toHaveBeenCalledWith(0, 0, 4096, 2048);
    expect(seams.render).toHaveBeenCalledTimes(1);
    expect(seams.encodePng).toHaveBeenCalledTimes(1);
    expect(parsed.registration).toMatchObject({
      status: "automatic",
      selection: { kind: "sole" },
    });
  });

  it("passes the rendered page viewport to metadata extraction", async () => {
    const seams = environment();
    await parseGeoPdf(new ArrayBuffer(16), seams.environment);
    expect(seams.extractMetadata.mock.calls[0][1]).toMatchObject({
      width: 4096,
      height: 2048,
      transform: [20.48, 0, 0, -20.48, 0, 2048],
    });
  });

  it("keeps multiple valid frames selection-required", async () => {
    const second = {
      ...soleExtraction.candidates[0],
      id: "measure-2",
      embeddedLabel: "Inset",
    };
    const seams = environment({
      ...soleExtraction,
      pageStructure: {
        ...soleExtraction.pageStructure!,
        completeLabels: ["Map frame", "Inset"],
        registrationCount: 2,
      },
      candidates: [...soleExtraction.candidates, second],
    });
    const parsed = await parseGeoPdf(new ArrayBuffer(16), seams.environment);
    expect(parsed.registration).toMatchObject({
      status: "selection-required",
      candidates: [{ id: "measure-1" }, { id: "measure-2" }],
    });
  });

  it("retains a rendered page when metadata is unreadable", async () => {
    const seams = environment();
    seams.environment.extractMetadata = vi.fn(async () => {
      throw new Error("public objects unreadable");
    });
    const parsed = await parseGeoPdf(new ArrayBuffer(16), seams.environment);
    expect(parsed.registration).toEqual({
      status: "manual",
      reason: "unreadable",
    });
    expect(parsed.preview.type).toBe("image/png");
  });

  it("releases page, document, loading task, and canvas", async () => {
    const seams = environment();
    await parseGeoPdf(new ArrayBuffer(16), seams.environment);
    expect(seams.cleanupPage).toHaveBeenCalledTimes(1);
    expect(seams.destroyDocument).toHaveBeenCalledTimes(1);
    expect(seams.destroyLoading).toHaveBeenCalledTimes(1);
    expect(seams.release).toHaveBeenCalledTimes(1);
  });
});
