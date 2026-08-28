import { describe, expect, it } from "vitest";
import { halifaxTimestamp, halifaxUtcOffset } from "./halifaxTime";

describe("halifaxUtcOffset", () => {
  it("uses ADT through the summer", () => {
    expect(halifaxUtcOffset("2026-08-11")).toBe("-03:00");
    expect(halifaxUtcOffset("2026-06-21")).toBe("-03:00");
  });

  it("uses AST through the winter — the case the hard-coded offset broke", () => {
    // NS municipalities hold October/March sales; built with -03:00 these
    // deadlines landed an hour early.
    expect(halifaxUtcOffset("2026-01-15")).toBe("-04:00");
    expect(halifaxUtcOffset("2026-12-01")).toBe("-04:00");
  });

  it("lands on the right side of both 2026 transitions", () => {
    expect(halifaxUtcOffset("2026-03-07")).toBe("-04:00");
    expect(halifaxUtcOffset("2026-03-09")).toBe("-03:00");
    expect(halifaxUtcOffset("2026-10-31")).toBe("-03:00");
    expect(halifaxUtcOffset("2026-11-02")).toBe("-04:00");
  });

  it("builds instants that agree with Halifax wall clocks", () => {
    const winter = new Date(halifaxTimestamp("2026-12-01", "10:00"));
    const summer = new Date(halifaxTimestamp("2026-08-11", "10:00"));
    const wall = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Halifax",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(wall.format(winter)).toBe("10:00");
    expect(wall.format(summer)).toBe("10:00");
    // Same wall time, different instants: exactly one hour apart in UTC terms.
    expect(winter.getUTCHours()).toBe(14);
    expect(summer.getUTCHours()).toBe(13);
  });
});
