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
    // Which transient failure it was, kept for the sentence the reader gets.
    expect(lost && "reason" in lost ? lost.reason : null).toBe("timeout");
    expect(lost?.fix?.latitude).toBe(45.5);
    expect(fake.clearWatch).not.toHaveBeenCalled();

    // A position the device cannot determine is its own state, not a
    // timeout: the message the reader gets differs.
    fake.pushError(2); // POSITION_UNAVAILABLE
    const unavailable = snapshots.at(-1);
    expect(
      unavailable && "reason" in unavailable ? unavailable.reason : null,
    ).toBe("unavailable");

    fake.pushPosition({ latitude: 45.6 });
    expect(snapshots.at(-1)?.status).toBe("active");
  });

  it("carries no fix when the watch fails before any position arrives", () => {
    const fake = fakeGeolocation();
    const { snapshots, onChange } = collect();
    startLiveLocation(onChange, fake.geolocation);

    // Location Services off for the device, or a desktop with no positioning
    // source: code 2 with nothing ever delivered. There is no last fix to
    // keep, because a watch that has never had a position has not lost one.
    fake.pushError(2); // POSITION_UNAVAILABLE
    const first = snapshots.at(-1);
    expect(first?.status).toBe("signal-lost");
    expect(first?.fix).toBeNull();
    expect(first && "reason" in first ? first.reason : null).toBe(
      "unavailable",
    );
    // Transient either way: the watch is left running so a fix can still
    // arrive.
    expect(fake.clearWatch).not.toHaveBeenCalled();

    fake.pushError(3); // TIMEOUT
    const second = snapshots.at(-1);
    expect(second?.fix).toBeNull();
    expect(second && "reason" in second ? second.reason : null).toBe("timeout");
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

  it("stops the watch after a third pre-fix report that the position is unavailable", () => {
    const fake = fakeGeolocation();
    const { snapshots, onChange } = collect();
    startLiveLocation(onChange, fake.geolocation);

    fake.pushError(2); // POSITION_UNAVAILABLE
    // A timeout is the device still working, not the device answering, so it
    // does not count towards giving up.
    fake.pushError(3); // TIMEOUT
    fake.pushError(2);
    expect(snapshots.at(-1)?.status).toBe("signal-lost");
    expect(fake.clearWatch).not.toHaveBeenCalled();

    fake.pushError(2);
    expect(snapshots.at(-1)).toEqual({
      status: "position-unavailable",
      fix: null,
    });
    expect(fake.clearWatch).toHaveBeenCalledWith(7);

    // A watch that has stopped delivers nothing more.
    fake.pushPosition({ latitude: 45.5 });
    expect(snapshots.at(-1)).toEqual({
      status: "position-unavailable",
      fix: null,
    });
  });

  it("keeps trying forever once a fix has been had, however often the position goes unavailable", () => {
    const fake = fakeGeolocation();
    const { snapshots, onChange } = collect();
    startLiveLocation(onChange, fake.geolocation);

    fake.pushPosition({ latitude: 45.5 });
    // A marker is on the map and a fix can come back at any moment. Giving up
    // on a followed position because the signal is poor would take the
    // reader's location off the map while they are standing in it.
    fake.pushError(2);
    fake.pushError(2);
    fake.pushError(2);
    fake.pushError(2);

    const last = snapshots.at(-1);
    expect(last?.status).toBe("signal-lost");
    expect(last?.fix?.latitude).toBe(45.5);
    expect(fake.clearWatch).not.toHaveBeenCalled();
  });

  // The walk has no other source of fixes: ending the watch would end the
  // track, which is a worse answer than a device that is still struggling.
  it("never gives up while a track is recording", () => {
    const fake = fakeGeolocation();
    const { snapshots, onChange } = collect();
    startLiveLocation(onChange, fake.geolocation, undefined, false);

    fake.pushError(2);
    fake.pushError(2);
    fake.pushError(2);
    fake.pushError(2);

    expect(snapshots.at(-1)).toEqual({
      status: "signal-lost",
      fix: null,
      reason: "unavailable",
    });
    expect(fake.clearWatch).not.toHaveBeenCalled();
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
