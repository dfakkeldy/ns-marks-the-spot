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
      assessmentEvidence: {
        status: "ready",
        result: {
          matchMethod: "notice-aan",
          accounts: [{
            aan: "00603988",
            records: [
              {
                taxYear: 2026,
                assessedValue: 41_000,
                taxableAssessedValue: 39_500,
                coordinates: [-61.391318, 46.071925],
              },
              {
                taxYear: 2025,
                assessedValue: 40_000,
                taxableAssessedValue: 40_000,
                coordinates: [-61.391318, 46.071925],
              },
            ],
          }],
        },
      },
      dwellingEvidence: {
        status: "ready",
        accounts: [{
          aan: "00603988",
          dwellings: [
            {
              yearBuilt: 2018,
              style: "Manufactured Home",
              squareFeetLivingArea: 1056,
              livingUnits: 1,
              bathrooms: 2,
              garage: false,
              underConstruction: false,
            },
            {
              yearBuilt: 1962,
              style: "1 Storey",
              squareFeetLivingArea: 480,
              livingUnits: 1,
              bathrooms: 0,
              garage: null,
              underConstruction: null,
            },
          ],
        }],
      },
      resourceResults: [{
        name: "Mineral occurrences",
        sourceUrl: "https://example.com/minerals",
        status: "ready",
        results: ["A01-002 · Nearby occurrence · Within 1 km · Placer · Au"],
        emptyMessage: "No published mineral occurrence was returned on or within 1 km of this parcel; a returned-empty result does not prove absence.",
      }],
    });

    expect(note.filename).toBe(
      "ns-marks-evidence-15234636-2026-07-20T14-05-06Z.md",
    );
    expect(note.markdown).toContain("Generated: 2026-07-20T14:05:06.000Z");
    expect(note.markdown).toContain("[Open this map state](https://example.com/map/?pid=15234636)");
    expect(note.markdown).toContain("[Official notice](https://example.com/notice)");
    expect(note.markdown).toContain("[Mineral occurrences source](https://example.com/minerals)");
    expect(note.markdown).toContain("not proof of ownership, access, occupancy");
    expect(note.markdown).toContain("Within 1 km");
    expect(note.markdown).toContain("proximity to a published record");
    expect(note.markdown).toContain("A returned-empty result does not prove absence.");
    expect(note.markdown).toContain("does not prove mineralization");
    expect(note.markdown).toContain("## PVSC assessment accounts");
    expect(note.markdown).toContain("AAN 00603988");
    expect(note.markdown).toContain("2026: assessed $41,000.00; taxable assessed $39,500.00");
    expect(note.markdown).toContain("2025: assessed $40,000.00; taxable assessed $40,000.00");
    expect(note.markdown).toContain("matched directly from the municipal notice AAN");
    expect(note.markdown).toContain("not a current market appraisal or sale price");
    expect(note.markdown).toContain("Open Data & Information Government Licence");
    expect(note.markdown).toContain("## PVSC residential dwelling records");
    expect(note.markdown).toContain(
      "- built 2018 · Manufactured Home · 1,056 sq ft living area · 1 living unit · 2 bathrooms · no garage",
    );
    expect(note.markdown).toContain(
      "- built 1962 · 1 Storey · 480 sq ft living area · 1 living unit · 0 bathrooms",
    );
    expect(note.markdown).toContain("not a building census");
  });

  it("exports source-specific bounded empty wording", () => {
    const note = buildEvidenceNote({
      generatedAt: new Date("2026-07-20T14:05:06.000Z"),
      pid: "15234636",
      mode: "current",
      shareUrl: "https://example.com/map/?pid=15234636",
      position: { latitude: 46.18845, longitude: -60.02123, zoom: 15 },
      activeLayers: [],
      events: [],
      civicAddresses: [],
      assessmentEvidence: {
        status: "ready",
        result: { matchMethod: "spatial", accounts: [] },
      },
      dwellingEvidence: { status: "ready", accounts: [] },
      resourceResults: [{
        name: "Mineral occurrences",
        sourceUrl: "https://example.com/minerals",
        status: "ready",
        results: [],
        emptyMessage: "No published mineral occurrence was returned on or within 1 km of this parcel; a returned-empty result does not prove absence.",
      }],
    });

    expect(note.markdown).toContain(
      "No published mineral occurrence was returned on or within 1 km of this parcel; a returned-empty result does not prove absence.",
    );
    expect(note.markdown).toContain(
      "No PVSC assessment account point was returned inside the mapped parcel geometry.",
    );
    expect(note.markdown).toContain(
      "No residential dwelling record was returned for the matched assessment accounts.",
    );
  });

  it("keeps multiple spatially matched assessment accounts separate", () => {
    const note = buildEvidenceNote({
      generatedAt: new Date("2026-07-20T14:05:06.000Z"),
      pid: "15234636",
      mode: "historical",
      shareUrl: "https://example.com/map/?pid=15234636",
      position: { latitude: 46.18845, longitude: -60.02123, zoom: 15 },
      activeLayers: [],
      events: [],
      civicAddresses: [],
      assessmentEvidence: {
        status: "ready",
        result: {
          matchMethod: "spatial",
          accounts: [
            {
              aan: "00000001",
              records: [{ taxYear: 2026, assessedValue: 100_000, taxableAssessedValue: 90_000, coordinates: [-61, 46] }],
            },
            {
              aan: "00000002",
              records: [{ taxYear: 2026, assessedValue: 200_000, taxableAssessedValue: 180_000, coordinates: [-61, 46] }],
            },
          ],
        },
      },
      dwellingEvidence: { status: "ready", accounts: [] },
      resourceResults: [],
    });

    expect(note.markdown).toContain("AAN 00000001");
    expect(note.markdown).toContain("AAN 00000002");
    expect(note.markdown).toContain("kept separate and are not summed");
    expect(note.markdown).not.toContain("$300,000");
  });

  it("records a PVSC source failure explicitly", () => {
    const note = buildEvidenceNote({
      generatedAt: new Date("2026-07-20T14:05:06.000Z"),
      pid: "15234636",
      mode: "current",
      shareUrl: "https://example.com/map/?pid=15234636",
      position: { latitude: 46.18845, longitude: -60.02123, zoom: 15 },
      activeLayers: [],
      events: [],
      civicAddresses: [],
      assessmentEvidence: { status: "error" },
      dwellingEvidence: { status: "blocked" },
      resourceResults: [],
    });

    expect(note.markdown).toContain("PVSC assessment source unavailable at export time.");
    expect(note.markdown).toContain(
      "Dwelling records were not looked up because no PVSC assessment account could be resolved.",
    );
  });

  it("records a dwelling source failure explicitly", () => {
    const note = buildEvidenceNote({
      generatedAt: new Date("2026-07-20T14:05:06.000Z"),
      pid: "15234636",
      mode: "current",
      shareUrl: "https://example.com/map/?pid=15234636",
      position: { latitude: 46.18845, longitude: -60.02123, zoom: 15 },
      activeLayers: [],
      events: [],
      civicAddresses: [],
      assessmentEvidence: {
        status: "ready",
        result: { matchMethod: "spatial", accounts: [] },
      },
      dwellingEvidence: { status: "error" },
      resourceResults: [],
    });

    expect(note.markdown).toContain(
      "PVSC residential dwelling source unavailable at export time.",
    );
  });
});
