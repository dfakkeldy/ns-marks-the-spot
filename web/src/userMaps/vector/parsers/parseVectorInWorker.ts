import { UserMapImportError } from "../../errors";
import { parseGeoJson, type ParsedVector } from "./geojsonSource";
import type { VectorWorkerReply } from "./vectorGeojsonWorker";

/**
 * Parse off the main thread when the browser can (a 50 MB JSON.parse blocks
 * for long enough to jank the UI). jsdom lacks Worker, so tests exercise the
 * main-thread path; no OffscreenCanvas gate is needed here — the parse is
 * pure JSON, no canvas involved.
 */
export async function parseGeoJsonAuto(buffer: ArrayBuffer): Promise<ParsedVector> {
  if (typeof Worker === "undefined") {
    return parseGeoJson(new TextDecoder().decode(buffer));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./vectorGeojsonWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<VectorWorkerReply>) => {
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.parsed);
      } else {
        reject(new UserMapImportError(event.data.code, event.data.userMessage));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(
        new UserMapImportError(
          "corrupt-file",
          "Something went wrong reading this file.",
        ),
      );
    };
    // Transfer, don't copy: the buffer is not reused by the caller.
    worker.postMessage(buffer, [buffer]);
  });
}
