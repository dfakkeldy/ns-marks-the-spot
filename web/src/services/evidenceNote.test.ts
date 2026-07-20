import { describe, expect, it } from "vitest";
import { buildEvidenceNote } from "./evidenceNote";

describe("parcel evidence note", () => {
  it("exports a timestamped, source-linked note with limitations", () => {
    const note = buildEvidenceNote({
      generatedAt: new Date("2026-07-20T14:05:06.000Z"),
      pid: "15234636",
      mode: "current",
      shareUrl: "https://example.com/map/?pid=15234636",
      position: { latitude: 46.18845, longitude: -60.02123, zoom: 15 },
      activeLayers: [{ name: "NS Property Boundaries", sourceUrl: "https://example.com/nsprd", sourceDate: "Live service checked July 20, 2026" }],
      events: [{
        name: "CBRM — July 21, 2026",
        sources: [{ label: "Official notice", sourceUrl: "https://example.com/notice" }],
      }],
      civicAddresses: [{ label: "16 Centre St, Reserve Mines", sourceUrl: "https://example.com/civic" }],
      resourceResults: [{ name: "Mineral occurrences", sourceUrl: "https://example.com/minerals", status: "ready", results: ["Example occurrence · Au"] }],
    });

    expect(note.filename).toBe(
      "ns-marks-evidence-15234636-2026-07-20T14-05-06Z.md",
    );
    expect(note.markdown).toContain("Generated: 2026-07-20T14:05:06.000Z");
    expect(note.markdown).toContain("[Open this map state](https://example.com/map/?pid=15234636)");
    expect(note.markdown).toContain("[Official notice](https://example.com/notice)");
    expect(note.markdown).toContain("[Mineral occurrences source](https://example.com/minerals)");
    expect(note.markdown).toContain("not proof of ownership, access, occupancy");
    expect(note.markdown).toContain("screening evidence, not a legal, safety, or economic conclusion");
  });
});
