import { describe, expect, it, vi } from "vitest";
import type { ParsedGeoPdf } from "./geoPdfSource";
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

function workerThat(
  reply:
    | { ok: true; kind: "parsed"; parsed: ParsedGeoPdf }
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
        supportsWorkerCanvas: true,
        createWorker: () => worker,
        parseOnMain: vi.fn(),
      }),
    ).resolves.toEqual(parsed);
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: "parse", buffer },
      [buffer],
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("uses the main-canvas fallback when worker rendering is unavailable", async () => {
    const parseOnMain = vi.fn(async () => parsed);
    await expect(
      parseGeoPdfAuto(new ArrayBuffer(8), {
        supportsWorkerCanvas: false,
        createWorker: vi.fn(),
        parseOnMain,
      }),
    ).resolves.toEqual(parsed);
    expect(parseOnMain).toHaveBeenCalledTimes(1);
  });

  it("falls back once when the worker explicitly refuses the topology", async () => {
    const returned = new ArrayBuffer(8);
    const worker = workerThat({
      ok: false,
      kind: "topology-unsupported",
      message: "no 2D context",
      buffer: returned,
    });
    const parseOnMain = vi.fn(async () => parsed);
    await expect(
      parseGeoPdfAuto(new ArrayBuffer(8), {
        supportsWorkerCanvas: true,
        createWorker: () => worker,
        parseOnMain,
      }),
    ).resolves.toEqual(parsed);
    expect(parseOnMain).toHaveBeenCalledWith(returned);
    expect(parseOnMain).toHaveBeenCalledTimes(1);
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
        supportsWorkerCanvas: true,
        createWorker: () => worker,
        parseOnMain,
      }),
    ).rejects.toMatchObject({
      code: "password-protected",
      userMessage: "Unlock it.",
    });
    expect(parseOnMain).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
