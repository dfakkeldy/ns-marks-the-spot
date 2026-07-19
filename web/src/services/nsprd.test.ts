import { describe, expect, it } from "vitest";
import {
  NSPRD_LAYER_URL,
  buildPidQueryUrl,
  normalizePid,
} from "./nsprd";

describe("NSPRD PID queries", () => {
  it("normalizes common PID formatting without guessing missing digits", () => {
    expect(normalizePid("50 20-3256")).toBe("50203256");
    expect(normalizePid("5020325")).toBeNull();
    expect(normalizePid("50203256 extra")).toBeNull();
  });

  it("builds a geometry-enabled GeoJSON query with unique PIDs", () => {
    const url = new URL(
      buildPidQueryUrl(["50203256", "50000462", "50203256"]),
    );

    expect(`${url.origin}${url.pathname}`).toBe(`${NSPRD_LAYER_URL}/query`);
    expect(url.searchParams.get("where")).toBe(
      "PID IN ('50203256','50000462')",
    );
    expect(url.searchParams.get("outFields")).toBe("PID,UPDAT_DATE");
    expect(url.searchParams.get("returnGeometry")).toBe("true");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("geojson");
  });

  it("rejects an empty or malformed PID query", () => {
    expect(() => buildPidQueryUrl([])).toThrow("at least one valid PID");
    expect(() => buildPidQueryUrl(["not-a-pid"])).toThrow(
      "at least one valid PID",
    );
  });
});
