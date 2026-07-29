import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedGeoPdf } from "./geoPdfSource";
import type {
  GeoPdfMetadataExtraction,
  PdfViewportGeometry,
} from "./geoPdfMetadata";
import {
  parseGeoPdfAuto,
  type GeoPdfFeatureWorker,
} from "./parseGeoPdfAuto";

const parsed: ParsedGeoPdf = {
  pixelSize: { width: 4096, height: 2048 },
  previewSize: { width: 4096, height: 2048 },
  preview: new Blob(["png"], { type: "image/png" }),
  pageCount: 1,
  registration: { status: "manual", reason: "absent" },
};

const extraction: GeoPdfMetadataExtraction = {
  producer: null,
  pageStructure: null,
  candidates: [],
  rejected: [],
};

const viewport: PdfViewportGeometry = {
  width: 4096,
  height: 2048,
  transform: [1, 0, 0, -1, 0, 2048],
  viewBox: [0, 0, 4096, 2048],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function workerThat(
  reply:
    | { ok: true; kind: "parsed"; parsed: ParsedGeoPdf }
    | {
        ok: true;
        kind: "metadata";
        extraction: GeoPdfMetadataExtraction;
      }
    | {
        ok: false;
        kind: "topology-unsupported";
        message: string;
        buffer: ArrayBuffer;
      }
    | {
        ok: false;
        kind: "import-error";
        code: "password-protected";
        userMessage: string;
      },
) {
  const worker: GeoPdfFeatureWorker = {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(() => {
      queueMicrotask(() => worker.onmessage?.({ data: reply }));
    }),
    terminate: vi.fn(),
  };
  return worker;
}

describe("parseGeoPdfAuto", () => {
  it("transfers the buffer to the preferred feature worker", async () => {
    const buffer = new ArrayBuffer(8);
    const worker = workerThat({ ok: true, kind: "parsed", parsed });
    await expect(
      parseGeoPdfAuto(buffer, {
        supportsWorker: true,
        supportsWorkerCanvas: true,
        createWorker: () => worker,
        assetBaseUrl: "http://localhost/vendor/pdfjs/6.1.200/",
        parseOnMain: vi.fn(),
      }),
    ).resolves.toEqual(parsed);
    expect(worker.postMessage).toHaveBeenCalledWith(
      {
        type: "parse",
        buffer,
        assetBaseUrl: "http://localhost/vendor/pdfjs/6.1.200/",
      },
      [buffer],
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("uses the main-canvas fallback when worker rendering is unavailable", async () => {
    const metadataWorker = workerThat({
      ok: true,
      kind: "metadata",
      extraction,
    });
    const parseOnMain = vi.fn(async (buffer, extractMetadata) => {
      expect(extractMetadata).toBeTypeOf("function");
      await expect(
        extractMetadata!(new Uint8Array(buffer), viewport),
      ).resolves.toEqual(extraction);
      return parsed;
    });
    const buffer = new ArrayBuffer(8);
    await expect(
      parseGeoPdfAuto(buffer, {
        supportsWorker: true,
        supportsWorkerCanvas: false,
        createWorker: () => metadataWorker,
        parseOnMain,
      }),
    ).resolves.toEqual(parsed);
    expect(metadataWorker.postMessage).toHaveBeenCalledWith(
      { type: "metadata", buffer, viewport },
      [buffer],
    );
    expect(metadataWorker.terminate).toHaveBeenCalledTimes(1);
    expect(parseOnMain).toHaveBeenCalledTimes(1);
  });

  it("disables PDF.js OffscreenCanvas resizing on the iOS main-canvas fallback", async () => {
    const iosNavigator = Object.create(navigator) as Navigator;
    Object.defineProperties(iosNavigator, {
      userAgent: {
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      },
      platform: { value: "iPhone" },
      maxTouchPoints: { value: 5 },
    });
    vi.stubGlobal("navigator", iosNavigator);
    const metadataWorker = workerThat({
      ok: true,
      kind: "metadata",
      extraction,
    });
    const parseOnMain = vi.fn(async (buffer, extractMetadata) => {
      await extractMetadata!(new Uint8Array(buffer), viewport);
      return parsed;
    });

    await expect(
      parseGeoPdfAuto(new ArrayBuffer(8), {
        supportsWorker: true,
        supportsWorkerCanvas: false,
        createWorker: () => metadataWorker,
        parseOnMain,
      }),
    ).resolves.toEqual(parsed);

    expect(parseOnMain).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.any(Function),
      false,
    );
  });

  it("preserves the iOS memory policy after a feature worker rejects the topology", async () => {
    const iosNavigator = Object.create(navigator) as Navigator;
    Object.defineProperties(iosNavigator, {
      userAgent: {
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      },
      platform: { value: "iPhone" },
      maxTouchPoints: { value: 5 },
    });
    vi.stubGlobal("navigator", iosNavigator);
    const returned = new ArrayBuffer(8);
    const preferredWorker = workerThat({
      ok: false,
      kind: "topology-unsupported",
      message: "no 2D context",
      buffer: returned,
    });
    const metadataWorker = workerThat({
      ok: true,
      kind: "metadata",
      extraction,
    });
    const createWorker = vi
      .fn()
      .mockReturnValueOnce(preferredWorker)
      .mockReturnValueOnce(metadataWorker);
    const parseOnMain = vi.fn(async (buffer, extractMetadata) => {
      expect(buffer).toBe(returned);
      await expect(
        extractMetadata!(new Uint8Array(buffer), viewport),
      ).resolves.toEqual(extraction);
      return parsed;
    });

    await expect(
      parseGeoPdfAuto(new ArrayBuffer(8), {
        supportsWorker: true,
        supportsWorkerCanvas: true,
        createWorker,
        assetBaseUrl: "http://localhost/vendor/pdfjs/6.1.200/",
        parseOnMain,
      }),
    ).resolves.toEqual(parsed);

    expect(parseOnMain).toHaveBeenCalledWith(
      returned,
      expect.any(Function),
      false,
    );
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(preferredWorker.terminate).toHaveBeenCalledTimes(1);
    expect(metadataWorker.terminate).toHaveBeenCalledTimes(1);
  });

  it("falls back once when the worker explicitly refuses the topology", async () => {
    const returned = new ArrayBuffer(8);
    const preferredWorker = workerThat({
      ok: false,
      kind: "topology-unsupported",
      message: "no 2D context",
      buffer: returned,
    });
    const metadataWorker = workerThat({
      ok: true,
      kind: "metadata",
      extraction,
    });
    const createWorker = vi
      .fn()
      .mockReturnValueOnce(preferredWorker)
      .mockReturnValueOnce(metadataWorker);
    const parseOnMain = vi.fn(async (buffer, extractMetadata) => {
      await extractMetadata!(new Uint8Array(buffer), viewport);
      return parsed;
    });
    await expect(
      parseGeoPdfAuto(new ArrayBuffer(8), {
        supportsWorker: true,
        supportsWorkerCanvas: true,
        createWorker,
        assetBaseUrl: "http://localhost/vendor/pdfjs/6.1.200/",
        parseOnMain,
      }),
    ).resolves.toEqual(parsed);
    expect(parseOnMain).toHaveBeenCalledWith(
      returned,
      expect.any(Function),
    );
    expect(parseOnMain).toHaveBeenCalledTimes(1);
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(preferredWorker.terminate).toHaveBeenCalledTimes(1);
    expect(metadataWorker.terminate).toHaveBeenCalledTimes(1);
  });

  it("does not retry typed import failures", async () => {
    const worker = workerThat({
      ok: false,
      kind: "import-error",
      code: "password-protected",
      userMessage: "Unlock it.",
    });
    const parseOnMain = vi.fn();
    await expect(
      parseGeoPdfAuto(new ArrayBuffer(8), {
        supportsWorker: true,
        supportsWorkerCanvas: true,
        createWorker: () => worker,
        assetBaseUrl: "http://localhost/vendor/pdfjs/6.1.200/",
        parseOnMain,
      }),
    ).rejects.toMatchObject({
      code: "password-protected",
      userMessage: "Unlock it.",
    });
    expect(parseOnMain).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("parses entirely on main only when Worker itself is unavailable", async () => {
    const buffer = new ArrayBuffer(8);
    const parseOnMain = vi.fn(async () => parsed);
    const createWorker = vi.fn();
    await expect(
      parseGeoPdfAuto(buffer, {
        supportsWorker: false,
        supportsWorkerCanvas: false,
        createWorker,
        parseOnMain,
      }),
    ).resolves.toEqual(parsed);
    expect(parseOnMain).toHaveBeenCalledWith(buffer);
    expect(createWorker).not.toHaveBeenCalled();
  });
});
