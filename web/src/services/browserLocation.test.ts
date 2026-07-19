import { describe, expect, it, vi } from "vitest";
import { getBrowserLocation } from "./browserLocation";

describe("browser location", () => {
  it("returns coordinates without sending them to an application server", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 46.02,
          longitude: -61.53,
          accuracy: 18,
        },
      } as GeolocationPosition);
    });

    await expect(
      getBrowserLocation({ getCurrentPosition } as unknown as Geolocation),
    ).resolves.toEqual({ latitude: 46.02, longitude: -61.53, accuracy: 18 });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("preserves a denied permission as a recoverable error", async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: "Permission denied" } as GeolocationPositionError);
      },
    );

    await expect(
      getBrowserLocation({ getCurrentPosition } as unknown as Geolocation),
    ).rejects.toThrow("Permission denied");
  });
});
