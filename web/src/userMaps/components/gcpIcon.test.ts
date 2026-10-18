import { describe, expect, it } from "vitest";
import { numberedIcon } from "./gcpIcon";

describe("numberedIcon", () => {
  it("distinguishes a half-placed point from a completed one", () => {
    // Spec: markers are hollow while pending and solid once paired. The two
    // states must not share a class, or "click the other side" has no visual
    // acknowledgement at all.
    expect(numberedIcon("1").options.className).toBe("gcp-marker");
    expect(numberedIcon("1", { pending: true }).options.className).toContain(
      "gcp-marker--pending",
    );
  });

  it("marks the selected point separately from the pending one", () => {
    // These were conflated once: the list's hovered row was passed as the
    // `pendingHalf` argument, so hovering a finished row drew its marker in
    // the "still waiting for its other half" style.
    const icon = numberedIcon("2", { selected: true });
    expect(icon.options.className).toContain("gcp-marker--selected");
    expect(icon.options.className).not.toContain("gcp-marker--pending");
  });

  it("carries the point number as its label", () => {
    expect(numberedIcon("3").options.html).toContain("3");
  });
});
