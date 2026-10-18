import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKER_PARSE_TIMEOUT_MS,
  raceWithWatchdog,
} from "./workerWatchdog";
import { UserMapImportError } from "../errors";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("raceWithWatchdog", () => {
  it("rejects a silent worker with the typed timeout error", async () => {
    // An OOM-killed worker fires neither `message` nor `error`; before the
    // watchdog, this promise stayed pending forever behind the import
    // spinner.
    const pending = raceWithWatchdog(new Promise<never>(() => {}));
    const settled = expect(pending).rejects.toMatchObject({
      name: "UserMapImportError",
      code: "parse-timeout",
    });
    await vi.advanceTimersByTimeAsync(WORKER_PARSE_TIMEOUT_MS);
    await settled;
  });

  it("passes a timely reply through and disarms the timer", async () => {
    const result = await raceWithWatchdog(Promise.resolve("parsed"));
    expect(result).toBe("parsed");
    // No stray rejection fires later.
    await vi.advanceTimersByTimeAsync(WORKER_PARSE_TIMEOUT_MS * 2);
  });

  it("passes a timely failure through unchanged", async () => {
    const failure = new UserMapImportError("corrupt-file", "bad bytes");
    await expect(
      raceWithWatchdog(Promise.reject(failure)),
    ).rejects.toBe(failure);
  });
});
