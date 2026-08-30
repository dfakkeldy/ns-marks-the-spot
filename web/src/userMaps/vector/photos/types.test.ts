import { describe, expect, it } from "vitest";
import { readPhotoDescriptors } from "./types";

describe("readPhotoDescriptors", () => {
  it("reads well-formed descriptors, tolerating missing optionals and unknown fields", () => {
    expect(
      readPhotoDescriptors({
        "nsmts:photos": [
          { id: "p1", capturedAt: "2026-08-30T00:00:00.000Z", width: 2048, height: 1536 },
          { id: "p2", sourceName: "IMG_1.jpg", future: "ignored" },
          { id: "p3" },
        ],
      }),
    ).toEqual([
      { id: "p1", capturedAt: "2026-08-30T00:00:00.000Z", width: 2048, height: 1536 },
      { id: "p2", sourceName: "IMG_1.jpg" },
      { id: "p3" },
    ]);
  });

  it("treats a malformed value as opaque: all-or-nothing empty", () => {
    // A half-valid array would attribute the wrong photos to a feature.
    expect(
      readPhotoDescriptors({ "nsmts:photos": [{ id: "p1" }, { id: 42 }] }),
    ).toEqual([]);
    expect(readPhotoDescriptors({ "nsmts:photos": "not-an-array" })).toEqual([]);
    expect(readPhotoDescriptors({ "nsmts:photos": [null] })).toEqual([]);
    expect(readPhotoDescriptors({ "nsmts:photos": [{ id: "" }] })).toEqual([]);
    expect(readPhotoDescriptors(null)).toEqual([]);
    expect(readPhotoDescriptors({})).toEqual([]);
  });
});
