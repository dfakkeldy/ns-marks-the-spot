import { describe, expect, it, vi } from "vitest";
import { startLiveLocation, type LiveLocationSnapshot } from "./liveLocation";

type SuccessCallback = (position: GeolocationPosition) => void;
type ErrorCallback = (error: GeolocationPositionError) => void;

function fakeGeolocation() {
  let success: SuccessCallback | undefined;
  let error: ErrorCallback | undefined;
  const clearWatch = vi.fn();
  const geolocation = {
    watchPosition: vi.fn((onSuccess: SuccessCallback, onError: ErrorCallback) => {
      success = onSuccess;
      error = onError;
      return 7;
    }),
    clearWatch,
    getCurrentPosition: vi.fn(),
  } as unknown as Geolocation;
  return {
    geolocation,
    clearWatch,
    pushPosition(coords: Partial<GeolocationCoordinates>, timestamp = 1_000) {
      success?.({
        coords: {
          latitude: 46,
          longitude: -61,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          ...coords,
        },
        timestamp,
      } as GeolocationPosition);
    },
    pushError(code: number) {
      error?.({ code, message: "" } as GeolocationPositionError);
    },
  };
}

function collect(): { snapshots: LiveLocationSnapshot[]; onChange: (s: LiveLocationSnapshot) => void } {
  const snapshots: LiveLocationSnapshot[] = [];
  return { snapshots, onChange: (snapshot) => snapshots.push(snapshot) };
}

describe("startLiveLocation", () => {
  it("reports unavailable when the browser has no geolocation", () => {
    const { snapshots, onChange } = collect();
    const handle = startLiveLocation(onChange, undefined);
    expect(snapshots).toEqual([{ status: "unavailable", fix: null }]);
    expect(() => handle.stop()).not.toThrow();
  });

  it("moves acquiring → active and normalizes NaN heading and speed to null", () => {
    const fake = fakeGeolocation();
    const { snapshots, onChange } = collect();
    startLiveLocation(onChange, fake.geolocation);
    expect(snapshots[0]).toEqual({ status: "acquiring", fix: null });

    fake.pushPosition(
      { latitude: 46.12, longitude: -60.91, accuracy: 24, heading: NaN, speed: NaN },
      5_000,
    );
    expect(snapshots[1]).toEqual({
      status: "active",
      fix: {
        latitude: 46.12,
        longitude: -60.91,
        accuracyM: 24,
        altitudeM: null,
        headingDeg: null,
        speedMps: null,
        timestampMs: 5_000,
      },
    });
  });

  it("keeps the last fix through a signal loss and recovers on the next fix", () => {
    const fake = fakeGeolocation();
    const { snapshots, onChange } = collect();
    startLiveLocation(onChange, fake.geolocation);

    fake.pushPosition({ latitude: 45.5 });
    fake.pushError(3); // TIMEOUT
    const lost = snapshots.at(-1);
    expect(lost?.status).toBe("signal-lost");
    expect(lost?.fix?.latitude).toBe(45.5);
    expect(fake.clearWatch).not.toHaveBeenCalled();

    fake.pushPosition({ latitude: 45.6 });
    expect(snapshots.at(-1)?.status).toBe("active");
  });

  it("treats a denial as final: clears the watch and ignores later callbacks", () => {
    const fake = fakeGeolocation();
    const { snapshots, onChange } = collect();
    startLiveLocation(onChange, fake.geolocation);

    fake.pushError(1); // PERMISSION_DENIED
    expect(snapshots.at(-1)).toEqual({ status: "denied", fix: null });
    expect(fake.clearWatch).toHaveBeenCalledWith(7);

    fake.pushPosition({ latitude: 45.5 });
    expect(snapshots.at(-1)).toEqual({ status: "denied", fix: null });
  });

  it("stops delivering after stop() and clears the watch", () => {
    const fake = fakeGeolocation();
    const { snapshots, onChange } = collect();
    const handle = startLiveLocation(onChange, fake.geolocation);

    handle.stop();
    expect(fake.clearWatch).toHaveBeenCalledWith(7);
    fake.pushPosition({ latitude: 45.5 });
    expect(snapshots.at(-1)).toEqual({ status: "acquiring", fix: null });
  });
});
