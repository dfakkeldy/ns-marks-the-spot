/// <reference lib="webworker" />
import { UserMapImportError } from "../errors";
import { parseGeoTiff, rgbToRgba, type ParsedGeoTiff } from "./geoTiffSource";

export type WorkerReply =
  | { ok: true; parsed: ParsedGeoTiff }
  | { ok: false; code: UserMapImportError["code"]; userMessage: string };

/** OffscreenCanvas preview maker — the worker-side counterpart of the DOM path. */
async function offscreenPreview(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  }
  ctx.putImageData(new ImageData(rgbToRgba(rgb, width, height), width, height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const parsed = await parseGeoTiff(event.data, { makePreview: offscreenPreview });
    self.postMessage({ ok: true, parsed } satisfies WorkerReply);
  } catch (error) {
    const reply: WorkerReply =
      error instanceof UserMapImportError
        ? { ok: false, code: error.code, userMessage: error.userMessage }
        : {
            ok: false,
            code: "corrupt-file",
            userMessage: "Something went wrong reading this file.",
          };
    self.postMessage(reply);
  }
};
