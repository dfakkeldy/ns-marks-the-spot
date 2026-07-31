import { describe, expect, it } from "vitest";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_URL,
} from "../../licensing/provinceLicense";
import { exportAttributionLines } from "./attributionLines";

describe("exportAttributionLines", () => {
  const source = (
    id: string,
    name: string,
    attribution: string,
    licenceUrl: string | null,
  ) => ({
    id: id as never,
    name,
    sourceUrl: `https://example.invalid/${id}`,
    sourceDate: "checked July 20, 2026",
    attribution,
    licenceUrl,
  });

  it("collapses sources sharing an attribution onto one line naming all of them", () => {
    // The app's default layer set puts four Province services on screen, and
    // every one of them carries the identical 149-character
    // PROVINCE_ATTRIBUTION. One line per layer repeated it four times, which
    // is what overran the PDF's attribution strip.
    const lines = exportAttributionLines([
      source("modern", "Modern map", "© OpenStreetMap contributors",
        "https://www.openstreetmap.org/copyright"),
      source("ns-aerial", "NS Aerial", PROVINCE_ATTRIBUTION,
        PROVINCE_LICENSE_URL),
      source("nsprd", "NS Property Boundaries", PROVINCE_ATTRIBUTION,
        PROVINCE_LICENSE_URL),
      source("water-features", "Water features", PROVINCE_ATTRIBUTION,
        PROVINCE_LICENSE_URL),
      source("roads", "Roads", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "Modern map: © OpenStreetMap contributors — " +
      "https://www.openstreetmap.org/copyright",
    );
    expect(lines[1]).toBe(
      "NS Aerial, NS Property Boundaries, Water features, Roads: " +
      `${PROVINCE_ATTRIBUTION} — ${PROVINCE_LICENSE_URL}`,
    );
    // Not one source dropped, and the Province text carried exactly once.
    expect(lines.join(" ").match(/Contains information obtained/gu))
      .toHaveLength(1);
  });

  it("emits the licence URL for every source that states one, and omits it otherwise", () => {
    // The window.print() flow already rendered licence URLs; the export path
    // discarded `licenceUrl` entirely, so the PDF carried attribution text
    // with no link to the terms it was asserting.
    const [withUrl, withoutUrl] = exportAttributionLines([
      source("zoning-a", "Municipality A zoning", "Municipality A",
        "https://example.invalid/licence"),
      source("zoning-b", "Municipality B zoning", "Municipality B", null),
    ]);
    expect(withUrl).toBe(
      "Municipality A zoning: Municipality A — https://example.invalid/licence",
    );
    expect(withoutUrl).toBe("Municipality B zoning: Municipality B");
  });
});
