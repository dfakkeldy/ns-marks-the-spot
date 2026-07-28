import { UserMapImportError, type UserMapImportErrorCode } from "../errors";
import {
  parseGeoPdf,
  type GeoPdfCanvas,
  type ParsedGeoPdf,
} from "./geoPdfSource";

export type GeoPdfWorkerRequest = { type: "parse"; buffer: ArrayBuffer };

export type GeoPdfWorkerReply =
  | { ok: true; kind: "parsed"; parsed: ParsedGeoPdf }
  | {
      ok: false;
      kind: "import-error";
      code: UserMapImportErrorCode;
      userMessage: string;
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
  supportsWorkerCanvas?: boolean;
  createWorker?: () => GeoPdfFeatureWorker;
  parseOnMain?: (buffer: ArrayBuffer) => Promise<ParsedGeoPdf>;
};

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

async function parseOnMainThread(buffer: ArrayBuffer): Promise<ParsedGeoPdf> {
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
  });
}

function workerCanvasSupported(): boolean {
  if (
    typeof Worker === "undefined" ||
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

async function parseInFeatureWorker(
  buffer: ArrayBuffer,
  createWorker: () => GeoPdfFeatureWorker,
): Promise<ParsedGeoPdf | { fallbackBuffer: ArrayBuffer }> {
  const worker = createWorker();
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.ok) {
          resolve(data.parsed);
        } else if (data.kind === "topology-unsupported") {
          resolve({ fallbackBuffer: data.buffer });
        } else {
          reject(new UserMapImportError(data.code, data.userMessage));
        }
      };
      worker.onerror = () => reject(corruptWorkerError());
      try {
        worker.postMessage({ type: "parse", buffer }, [buffer]);
      } catch {
        reject(corruptWorkerError());
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
    environment.supportsWorkerCanvas ?? workerCanvasSupported();
  if (!supportsWorker) {
    return parseOnMain(buffer);
  }
  const result = await parseInFeatureWorker(
    buffer,
    environment.createWorker ?? defaultWorker,
  );
  if ("fallbackBuffer" in result) {
    return parseOnMain(result.fallbackBuffer);
  }
  return result;
}
