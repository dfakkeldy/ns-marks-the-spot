import { UserMapImportError } from "../errors";

/**
 * How long a parse worker may stay SILENT before it is presumed dead.
 *
 * A worker the OS kills for memory — a real outcome for the 500 MB rasters
 * this pipeline admits — can die without firing either `message` or `error`,
 * and every parser awaited exactly those two events: the import hung forever
 * behind its spinner and the dead worker's resources leaked. Two minutes is
 * far beyond any measured successful parse while still bounded; a user
 * staring at one spinner for longer than that has lost the import either
 * way, and deserves the honest error plus a live app.
 */
export const WORKER_PARSE_TIMEOUT_MS = 120_000;

export function parseTimeoutError(): UserMapImportError {
  return new UserMapImportError(
    "parse-timeout",
    "Reading this file took too long and was stopped. Try again, or re-export a smaller file.",
  );
}

/**
 * Race a worker's reply against the watchdog. The caller keeps ownership of
 * the worker and terminates it in its own `finally`, which is what actually
 * reclaims a wedged worker after a timeout loss.
 */
export function raceWithWatchdog<T>(
  pending: Promise<T>,
  timeoutMs: number = WORKER_PARSE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(parseTimeoutError()), timeoutMs);
  });
  return Promise.race([pending, watchdog]).finally(() => {
    clearTimeout(timer);
  }) as Promise<T>;
}
