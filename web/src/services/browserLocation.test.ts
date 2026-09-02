import { describe, expect, it, vi } from "vitest";
import {
  BrowserLocationError,
  browserLocationFailure,
  getBrowserLocation,
} from "./browserLocation";
import { MARK_MAX_FIX_AGE_MS } from "../location/captureSpec";

describe("browser location", () => {
  it("returns the position and the moment the device fixed it", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 46.02,
          longitude: -61.53,
          accuracy: 18,
          altitude: 31.5,
        },
        timestamp: 1_700_000_000_000,
      } as GeolocationPosition);
    });

    await expect(
      getBrowserLocation({ getCurrentPosition } as unknown as Geolocation),
    ).resolves.toEqual({
      latitude: 46.02,
      longitude: -61.53,
      accuracy: 18,
      altitude: 31.5,
      timestampMs: 1_700_000_000_000,
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("asks for a fix no older than a mark may be", async () => {
    const seen: (PositionOptions | undefined)[] = [];
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ) => {
        void error;
        seen.push(options);
        success({
          coords: { latitude: 46.02, longitude: -61.53, accuracy: 18 },
          timestamp: 1_700_000_000_000,
        } as GeolocationPosition);
      },
    );

    await getBrowserLocation({ getCurrentPosition } as unknown as Geolocation);

    expect(seen[0]?.maximumAge).toBe(MARK_MAX_FIX_AGE_MS);
    // The cache the caller asks for is the caller's to choose.
    await getBrowserLocation({ getCurrentPosition } as unknown as Geolocation, {
      maximumAgeMs: 0,
    });
    expect(seen[1]?.maximumAge).toBe(0);
  });

  it("has an altitude only when the device reported one", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 46.02, longitude: -61.53, accuracy: 18, altitude: null },
      } as GeolocationPosition);
    });

    const fix = await getBrowserLocation({
      getCurrentPosition,
    } as unknown as Geolocation);
    expect(fix.altitude).toBeNull();
    // No timestamp from the browser is not a reason to refuse the fix; the
    // caller's freshness gate reads what we put here.
    expect(fix.timestampMs).toBeTypeOf("number");
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ])("keeps failure %i apart as %s", async (code, failure) => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code, message: "from the browser" } as GeolocationPositionError);
      },
    );

    const rejection = await getBrowserLocation({
      getCurrentPosition,
    } as unknown as Geolocation).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(BrowserLocationError);
    expect(browserLocationFailure(rejection)).toBe(failure);
    // The browser's own words are kept for a log; the reader's sentence is
    // chosen from the failure by the caller.
    expect((rejection as Error).message).toBe("from the browser");
  });

  it("says a browser without the API is not a refusal", async () => {
    const rejection = await getBrowserLocation(undefined).catch(
      (error: unknown) => error,
    );
    expect(browserLocationFailure(rejection)).toBe("unsupported");
  });

  it("treats anything that is not one of ours as unavailable", () => {
    expect(browserLocationFailure(new Error("boom"))).toBe("unavailable");
  });
});
