import { describe, expect, it } from "vitest";
import {
  hydroLineStyle,
  hydroPotentialLabel,
} from "./hydroPotential";

describe("Inverness micro-hydro presentation", () => {
  it("labels the explicit micro-hydro opportunity bands", () => {
    expect(hydroPotentialLabel("below-1kw")).toBe("Below 1 kW scale");
    expect(hydroPotentialLabel("kw-1-5")).toBe("1–5 kW scale");
    expect(hydroPotentialLabel("kw-5-15")).toBe("5–15 kW scale");
    expect(hydroPotentialLabel("kw-15-30")).toBe("15–30 kW scale");
    expect(hydroPotentialLabel("kw-30-50")).toBe("30–50 kW scale");
    expect(hydroPotentialLabel("over-50kw")).toBe("Above 50 kW scale");
  });

  it("uses drainage area for line width and potential class for colour", () => {
    const small = hydroLineStyle({
      upstreamAreaKm2: 5,
      potentialClass: "kw-5-15",
    });
    const large = hydroLineStyle({
      upstreamAreaKm2: 500,
      potentialClass: "kw-5-15",
    });
    const differentPotential = hydroLineStyle({
      upstreamAreaKm2: 5,
      potentialClass: "kw-1-5",
    });
    const flatterReach = hydroLineStyle({
      upstreamAreaKm2: 500,
      potentialClass: "not-qualified",
    });

    expect(Number(large.weight)).toBeGreaterThan(Number(small.weight));
    expect(large.color).toBe(small.color);
    expect(differentPotential.color).not.toBe(small.color);
    expect(flatterReach.color).not.toBe(large.color);
  });
});
