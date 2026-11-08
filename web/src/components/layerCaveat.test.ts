import { describe, expect, it } from "vitest";
import { CAVEAT_REST_LENGTH, splitCaveat } from "./layerCaveat";

describe("splitCaveat", () => {
  it("leaves a short caveat alone, with nothing for the disclosure", () => {
    expect(splitCaveat("Online imagery · zoom 10+")).toEqual({ lead: "Online imagery · zoom 10+", full: null });
  });

  it("rests on the first sentence and keeps every word for the disclosure", () => {
    const text = "These are inventoried turbines, not proposals or a current field inspection. The newest records are from 2018, so farms built since are missing here.";
    expect(splitCaveat(text)).toEqual({
      lead: "These are inventoried turbines, not proposals or a current field inspection.",
      full: text,
    });
  });

  it("does not end a sentence on an abbreviation", () => {
    const text = "Mapped around St. Peter's and the Bras d'Or lakes from the 2017 survey only. A blank view does not show absence anywhere else in the province.";
    expect(splitCaveat(text).lead).toBe("Mapped around St. Peter's and the Bras d'Or lakes from the 2017 survey only.");
  });

  it("rests on the facts that fit when a caveat is a list", () => {
    const text = "Provincial colour background with GeoNAMES · source scale limits apply · closer zoom adds no survey precision";
    const { lead, full } = splitCaveat(text);
    expect(lead.length).toBeLessThanOrEqual(CAVEAT_REST_LENGTH);
    expect(lead.startsWith("Provincial colour background")).toBe(true);
    expect(full).toBe(text);
  });

  it("keeps one long sentence whole for the row to clamp", () => {
    const text = "A single long sentence with no list in it that runs on well past the length a row can show at rest";
    expect(splitCaveat(text)).toEqual({ lead: text, full: text });
  });
});
