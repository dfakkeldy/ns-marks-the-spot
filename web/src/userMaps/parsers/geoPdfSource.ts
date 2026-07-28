import { UserMapImportError } from "../errors";
import type { ParsedPdfRegistration } from "../types";
import type { PixelSize } from "../transform/projection";
import { selectGeoPdfFrame } from "./geoPdfFrameSelection";
import {
  extractGeoPdfMetadata,
  type GeoPdfMetadataExtraction,
  type PdfViewportGeometry,
} from "./geoPdfMetadata";

export type ParsedGeoPdf = {
  pixelSize: PixelSize;
  previewSize: PixelSize;
  preview: Blob;
  pageCount: number;
  registration: ParsedPdfRegistration;
};

export type GeoPdfCanvas = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  encodePng: () => Promise<Blob>;
  release: () => void;
};

type PdfJsViewport = PdfViewportGeometry;

type PdfJsPage = {
  getViewport: (options: { scale: number }) => PdfJsViewport;
  render: (options: {
    canvasContext:
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;
    viewport: PdfJsViewport;
    background?: string;
  }) => { promise: Promise<unknown>; cancel?: () => void };
  cleanup?: () => void;
};

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  cleanup?: () => void;
  destroy?: () => Promise<unknown>;
};

type PdfJsLoadingTask = {
  promise: Promise<PdfJsDocument>;
  onPassword?: (callback: () => void, reason: number) => void;
  destroy?: () => Promise<unknown>;
};

export type GeoPdfParseEnvironment = {
  getDocument: (options: Record<string, unknown>) => PdfJsLoadingTask;
  createCanvas: (pixelSize: PixelSize) => GeoPdfCanvas;
  extractMetadata?: (
    bytes: Uint8Array,
    viewport: PdfViewportGeometry,
  ) => Promise<GeoPdfMetadataExtraction>;
  selectFrame?: (
    extraction: GeoPdfMetadataExtraction,
  ) => ParsedPdfRegistration;
  assetBaseUrl?: string;
};

const PDFJS_VERSION = "6.1.200";

function defaultAssetBaseUrl(): string {
  if (typeof window === "undefined") {
    throw new Error("A local PDF.js asset base URL is required");
  }
  return new URL(
    `${import.meta.env.BASE_URL}vendor/pdfjs/${PDFJS_VERSION}/`,
    window.location.href,
  ).href;
}

function localAssetUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new Error("PDF.js assets must remain same-origin");
  }
  return url.href;
}

function corruptPdfError(): UserMapImportError {
  return new UserMapImportError(
    "corrupt-file",
    "This PDF could not be read. Export a new copy and try again.",
  );
}

function passwordProtectedError(): UserMapImportError {
  return new UserMapImportError(
    "password-protected",
    "Unlock and export this PDF before importing it.",
  );
}

async function ignoreCleanupFailure(
  cleanup: (() => void | Promise<unknown>) | undefined,
): Promise<void> {
  try {
    await cleanup?.();
  } catch {
    // Cleanup must not replace the import result or its typed failure.
  }
}

export async function parseGeoPdf(
  buffer: ArrayBuffer,
  environment: GeoPdfParseEnvironment,
): Promise<ParsedGeoPdf> {
  const assetBaseUrl = environment.assetBaseUrl ?? defaultAssetBaseUrl();
  let loadingTask: PdfJsLoadingTask | null = null;
  let document: PdfJsDocument | null = null;
  let page: PdfJsPage | null = null;
  let canvas: GeoPdfCanvas | null = null;
  let passwordError: UserMapImportError | null = null;

  try {
    // PDF.js may transfer this typed array into its own worker. Keep the
    // caller's buffer available only until public-object metadata extraction
    // has completed; neither byte view escapes the function.
    const pdfJsBytes = new Uint8Array(buffer.slice(0));
    loadingTask = environment.getDocument({
      data: pdfJsBytes,
      cMapUrl: localAssetUrl(assetBaseUrl, "cmaps/"),
      cMapPacked: true,
      standardFontDataUrl: localAssetUrl(assetBaseUrl, "standard_fonts/"),
      iccUrl: localAssetUrl(assetBaseUrl, "iccs/"),
      wasmUrl: localAssetUrl(assetBaseUrl, "wasm/"),
      enableXfa: false,
      isEvalSupported: false,
      stopAtErrors: true,
      useWorkerFetch: false,
    });
    loadingTask.onPassword = () => {
      passwordError = passwordProtectedError();
    };
    try {
      document = await loadingTask.promise;
    } catch (error) {
      if (passwordError) {
        throw passwordError;
      }
      throw error;
    }
    page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const dominant = Math.max(baseViewport.width, baseViewport.height);
    if (!Number.isFinite(dominant) || dominant <= 0) {
      throw new Error("invalid PDF page dimensions");
    }
    let scale = 4096 / dominant;
    let viewport = page.getViewport({ scale });
    let pixelSize = {
      width: Math.max(1, Math.round(viewport.width)),
      height: Math.max(1, Math.round(viewport.height)),
    };
    if (Math.max(pixelSize.width, pixelSize.height) !== 4096) {
      scale *= 4096 / Math.max(pixelSize.width, pixelSize.height);
      viewport = page.getViewport({ scale });
      pixelSize = {
        width: Math.max(1, Math.round(viewport.width)),
        height: Math.max(1, Math.round(viewport.height)),
      };
    }
    if (Math.max(pixelSize.width, pixelSize.height) !== 4096) {
      throw new Error("PDF page could not be normalized to 4096 pixels");
    }
    const metadataViewport: PdfViewportGeometry = {
      width: pixelSize.width,
      height: pixelSize.height,
      transform: viewport.transform,
      viewBox: viewport.viewBox,
    };
    let extraction: GeoPdfMetadataExtraction;
    try {
      extraction = await (
        environment.extractMetadata ?? extractGeoPdfMetadata
      )(new Uint8Array(buffer), metadataViewport);
    } catch {
      extraction = {
        producer: null,
        pageStructure: null,
        candidates: [],
        rejected: [{ flavor: null, reason: "unreadable" }],
      };
    }

    canvas = environment.createCanvas(pixelSize);
    canvas.context.save();
    canvas.context.fillStyle = "#fff";
    canvas.context.fillRect(0, 0, pixelSize.width, pixelSize.height);
    canvas.context.restore();
    const renderTask = page.render({
      canvasContext: canvas.context,
      viewport,
      background: "#fff",
    });
    await renderTask.promise;
    const preview = await canvas.encodePng();
    return {
      pixelSize,
      previewSize: pixelSize,
      preview,
      pageCount: document.numPages,
      registration: (
        environment.selectFrame ?? selectGeoPdfFrame
      )(extraction),
    };
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    if (passwordError) {
      throw passwordError;
    }
    throw corruptPdfError();
  } finally {
    await ignoreCleanupFailure(() => page?.cleanup?.());
    canvas?.release();
    await ignoreCleanupFailure(() => document?.cleanup?.());
    await ignoreCleanupFailure(() => document?.destroy?.());
    await ignoreCleanupFailure(() => loadingTask?.destroy?.());
  }
}
