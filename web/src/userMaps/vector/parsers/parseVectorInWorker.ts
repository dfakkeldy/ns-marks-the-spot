import { UserMapImportError } from "../../errors";
import { raceWithWatchdog } from "../../parsers/workerWatchdog";
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
  const worker = new Worker(new URL("./vectorGeojsonWorker.ts", import.meta.url), {
    type: "module",
  });
  const reply = new Promise<ParsedVector>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<VectorWorkerReply>) => {
      if (event.data.ok) {
        resolve(event.data.parsed);
      } else {
        reject(new UserMapImportError(event.data.code, event.data.userMessage));
      }
    };
    worker.onerror = () => {
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
  return raceWithWatchdog(reply).finally(() => worker.terminate());
}
