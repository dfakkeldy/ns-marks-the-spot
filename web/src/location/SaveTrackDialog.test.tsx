import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveTrackDialog } from "./SaveTrackDialog";
import type { StopResult } from "./trackRecorder";

function walk(): StopResult {
  return {
    segments: [
      [
        { lat: 46, lng: -61, accuracyM: 5, altitudeM: null, timestampMs: 0 },
        {
          lat: 46.001,
          lng: -61,
          accuracyM: 5,
          altitudeM: null,
          timestampMs: 1_000,
        },
      ],
    ],
    rawSegments: [],
    startedAt: "2026-09-03T00:00:00.000Z",
    endedAt: "2026-09-03T00:00:01.000Z",
    rawFixCount: 412,
    acceptedFixCount: 400,
    distanceM: 111,
    recordingMs: 1_000,
  };
}

describe("SaveTrackDialog", () => {
  it("counts the positions the device reported without calling them GPS fixes", () => {
    // The Geolocation API names no sensor: the same call answers from a
    // satellite fix, a Wi-Fi lookup or an IP estimate, and on a desktop
    // browser it is usually not the satellite. popup.test.ts holds the same
    // line for what a mark's callout may claim.
    render(
      <SaveTrackDialog
        result={walk()}
        saving={false}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Save track" });
    expect(dialog).toHaveTextContent("412 positions");
    expect(dialog.textContent).not.toContain("GPS");
  });
});
