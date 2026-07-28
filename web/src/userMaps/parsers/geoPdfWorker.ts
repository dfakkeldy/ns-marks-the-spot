import { UserMapImportError } from "../errors";
import type { GeoPdfCanvas } from "./geoPdfSource";
import { parseGeoPdf } from "./geoPdfSource";
import type {
  GeoPdfWorkerReply,
  GeoPdfWorkerRequest,
} from "./parseGeoPdfAuto";

const PDF_WORKER_URL = new URL(
  "../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

type WorkerScope = {
  onmessage:
    | ((event: { data: GeoPdfWorkerRequest }) => void | Promise<void>)
    | null;
  postMessage: (reply: GeoPdfWorkerReply, transfer?: Transferable[]) => void;
};

const workerScope = globalThis as unknown as WorkerScope;

function supportsCanvas(): boolean {
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

function createOffscreenCanvas(
  pixelSize: { width: number; height: number },
): GeoPdfCanvas {
  const canvas = new OffscreenCanvas(pixelSize.width, pixelSize.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OffscreenCanvas 2D is unavailable");
  }
  return {
    canvas,
    context,
    encodePng: () => canvas.convertToBlob({ type: "image/png" }),
    release: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

workerScope.onmessage = async ({ data }) => {
  if (data.type !== "parse") {
    return;
  }
  if (!supportsCanvas()) {
    workerScope.postMessage(
      {
        ok: false,
        kind: "topology-unsupported",
        message: "OffscreenCanvas 2D PNG rendering is unavailable",
        buffer: data.buffer,
      },
      [data.buffer],
    );
    return;
  }
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    const parsed = await parseGeoPdf(data.buffer, {
      getDocument: (options) =>
        pdfjs.getDocument(
          options as Parameters<typeof pdfjs.getDocument>[0],
        ) as unknown as ReturnType<
          import("./geoPdfSource").GeoPdfParseEnvironment["getDocument"]
        >,
      createCanvas: createOffscreenCanvas,
    });
    workerScope.postMessage({ ok: true, kind: "parsed", parsed });
  } catch (error) {
    if (error instanceof UserMapImportError) {
      workerScope.postMessage({
        ok: false,
        kind: "import-error",
        code: error.code,
        userMessage: error.userMessage,
      });
      return;
    }
    workerScope.postMessage({
      ok: false,
      kind: "import-error",
      code: "corrupt-file",
      userMessage: "This PDF could not be read. Export a new copy and try again.",
    });
  }
};
