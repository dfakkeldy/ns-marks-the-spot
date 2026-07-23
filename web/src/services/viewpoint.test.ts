import { describe, expect, it } from "vitest";
import { viewpointParcelUrl } from "./viewpoint";

describe("ViewPoint parcel links", () => {
  it("preserves the exact eight-character PID, including leading zeroes", () => {
    expect(viewpointParcelUrl("00606848")).toBe(
      "https://www.viewpoint.ca/show/property/00606848",
    );
  });

  it("rejects values that are not exact Nova Scotia PIDs", () => {
    expect(() => viewpointParcelUrl("606848")).toThrow("eight digits");
    expect(() => viewpointParcelUrl("00606848 extra")).toThrow("eight digits");
  });
});
