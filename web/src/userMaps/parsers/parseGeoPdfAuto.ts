import { UserMapImportError, type UserMapImportErrorCode } from "../errors";
import {
  parseGeoPdf,
  type GeoPdfCanvas,
  type ParsedGeoPdf,
} from "./geoPdfSource";
import type {
  GeoPdfMetadataExtraction,
  PdfViewportGeometry,
} from "./geoPdfMetadata";

export type GeoPdfWorkerRequest =
  | {
      type: "parse";
      buffer: ArrayBuffer;
      assetBaseUrl: string;
    }
  | {
      type: "metadata";
      buffer: ArrayBuffer;
      viewport: PdfViewportGeometry;
    };

export type GeoPdfWorkerReply =
  | { ok: true; kind: "parsed"; parsed: ParsedGeoPdf }
  | {
      ok: true;
      kind: "metadata";
      extraction: GeoPdfMetadataExtraction;
    }
  | {
      ok: false;
      kind: "import-error";
      code: UserMapImportErrorCode;
      userMessage: string;
    }
  | {
      ok: false;
      kind: "metadata-error";
      message: string;
    }
  | {
      ok: false;
      kind: "topology-unsupported";
      message: string;
      buffer: ArrayBuffer;
    };

export type GeoPdfFeatureWorker = {
  onmessage: ((event: { data: GeoPdfWorkerReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage: (message: GeoPdfWorkerRequest, transfer: Transferable[]) => void;
  terminate: () => void;
};

export type ParseGeoPdfAutoEnvironment = {
  supportsWorker?: boolean;
  supportsWorkerCanvas?: boolean;
  createWorker?: () => GeoPdfFeatureWorker;
  parseOnMain?: (
    buffer: ArrayBuffer,
    extractMetadata?: (
      bytes: Uint8Array,
      viewport: PdfViewportGeometry,
    ) => Promise<GeoPdfMetadataExtraction>,
  ) => Promise<ParsedGeoPdf>;
  assetBaseUrl?: string;
};

const PDFJS_VERSION = "6.1.200";
const PDF_WORKER_URL = new URL(
  "../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

function createHtmlCanvas(
  pixelSize: { width: number; height: number },
): GeoPdfCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = pixelSize.width;
  canvas.height = pixelSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is unavailable");
  }
  return {
    canvas,
    context,
    encodePng: () =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("PDF preview PNG encoding failed"));
          }
        }, "image/png");
      }),
    release: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

async function parseOnMainThread(
  buffer: ArrayBuffer,
  extractMetadata?: (
    bytes: Uint8Array,
    viewport: PdfViewportGeometry,
  ) => Promise<GeoPdfMetadataExtraction>,
): Promise<ParsedGeoPdf> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  return parseGeoPdf(buffer, {
    getDocument: (options) =>
      pdfjs.getDocument(
        options as Parameters<typeof pdfjs.getDocument>[0],
      ) as unknown as ReturnType<
        import("./geoPdfSource").GeoPdfParseEnvironment["getDocument"]
      >,
    createCanvas: createHtmlCanvas,
    extractMetadata,
  });
}

function workerCanvasSupported(): boolean {
  if (
    typeof OffscreenCanvas === "undefined" ||
    typeof OffscreenCanvas.prototype.convertToBlob !== "function"
  ) {
    return false;
  }
  try {
    return new OffscreenCanvas(1, 1).getContext("2d") !== null;
  } catch {
    return false;
  }
}

function workerSupported(): boolean {
  return typeof Worker !== "undefined";
}

function defaultWorker(): GeoPdfFeatureWorker {
  return new Worker(new URL("./geoPdfWorker.ts", import.meta.url), {
    type: "module",
  }) as unknown as GeoPdfFeatureWorker;
}

function corruptWorkerError(): UserMapImportError {
  return new UserMapImportError(
    "corrupt-file",
    "This PDF could not be read. Export a new copy and try again.",
  );
}

function defaultAssetBaseUrl(): string {
  if (typeof window === "undefined") {
    throw new Error("A local PDF.js asset base URL is required");
  }
  return new URL(
    `${import.meta.env.BASE_URL}vendor/pdfjs/${PDFJS_VERSION}/`,
    window.location.href,
  ).href;
}

async function parseInFeatureWorker(
  buffer: ArrayBuffer,
  createWorker: () => GeoPdfFeatureWorker,
  assetBaseUrl: string,
): Promise<ParsedGeoPdf | { fallbackBuffer: ArrayBuffer }> {
  const worker = createWorker();
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.ok && data.kind === "parsed") {
          resolve(data.parsed);
        } else if (data.kind === "topology-unsupported") {
          resolve({ fallbackBuffer: data.buffer });
        } else if (data.kind === "import-error") {
          reject(new UserMapImportError(data.code, data.userMessage));
        } else {
          reject(corruptWorkerError());
        }
      };
      worker.onerror = () => reject(corruptWorkerError());
      try {
        worker.postMessage({ type: "parse", buffer, assetBaseUrl }, [buffer]);
      } catch {
        reject(corruptWorkerError());
      }
    });
  } finally {
    worker.terminate();
  }
}

async function extractMetadataInWorker(
  bytes: Uint8Array,
  viewport: PdfViewportGeometry,
  createWorker: () => GeoPdfFeatureWorker,
): Promise<GeoPdfMetadataExtraction> {
  const worker = createWorker();
  const buffer = bytes.buffer as ArrayBuffer;
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.ok && data.kind === "metadata") {
          resolve(data.extraction);
        } else if (!data.ok && data.kind === "metadata-error") {
          reject(new Error(data.message));
        } else {
          reject(new Error("Unexpected GeoPDF metadata worker response"));
        }
      };
      worker.onerror = () =>
        reject(new Error("GeoPDF metadata worker failed"));
      try {
        worker.postMessage(
          { type: "metadata", buffer, viewport },
          [buffer],
        );
      } catch {
        reject(new Error("GeoPDF metadata worker could not start"));
      }
    });
  } finally {
    worker.terminate();
  }
}

export async function parseGeoPdfAuto(
  buffer: ArrayBuffer,
  environment: ParseGeoPdfAutoEnvironment = {},
): Promise<ParsedGeoPdf> {
  const parseOnMain = environment.parseOnMain ?? parseOnMainThread;
  const supportsWorker =
    environment.supportsWorker ?? workerSupported();
  if (!supportsWorker) {
    return parseOnMain(buffer);
  }
  const createWorker = environment.createWorker ?? defaultWorker;
  const supportsCanvas =
    environment.supportsWorkerCanvas ?? workerCanvasSupported();
  if (supportsCanvas) {
    const result = await parseInFeatureWorker(
      buffer,
      createWorker,
      environment.assetBaseUrl ?? defaultAssetBaseUrl(),
    );
    if (!("fallbackBuffer" in result)) {
      return result;
    }
    buffer = result.fallbackBuffer;
  }
  return parseOnMain(buffer, (bytes, viewport) =>
    extractMetadataInWorker(bytes, viewport, createWorker),
  );
}
