import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  extractSourcePdfUrl,
  mergeListings,
  parseBboxWords,
  parseHorizontalLines,
  parseSummaryRows,
  updateDatasetHash,
} from "./refreshInvernessTaxSale.mjs";

const word = (xMin, yMin, xMax, yMax, value) =>
  `<word xMin="${xMin}" yMin="${yMin}" xMax="${xMax}" yMax="${yMax}">${value}</word>`;

const summaryWords = [
  word(62, 146, 65, 152, "1"),
  word(67, 146, 88, 152, "00603988"),
  word(245, 146, 270, 152, "HIGHWAY"),
  word(272, 146, 290, 152, "19,"),
  word(392, 146, 416, 152, "$15,529.15"),
  word(438, 146, 445, 152, "NO"),
  word(524, 146, 545, 152, "50203256"),
  word(62, 157, 65, 163, "2"),
  word(67, 157, 88, 163, "01274201"),
  word(245, 157, 270, 163, "CRANDALL"),
  word(272, 157, 288, 163, "ROAD"),
  word(392, 157, 416, 163, "$1,295.63"),
  word(438, 157, 448, 163, "YES"),
  word(524, 157, 545, 163, "50000462"),
].join("\n");

describe("Inverness municipal notice refresh", () => {
  it("resolves the municipality's current revision instead of a fixed PDF name", () => {
    expect(
      extractSourcePdfUrl(
        '<a href="/wp-content/uploads/2026/07/Tax-Sale_August-11-3.pdf">View</a>',
      ),
    ).toBe(
      "https://invernesscounty.ca/wp-content/uploads/2026/07/Tax-Sale_August-11-3.pdf",
    );
  });

  it("fails closed when the landing page has no unambiguous current notice", () => {
    expect(() => extractSourcePdfUrl("<p>No notice</p>")).toThrow(
      /Expected one current Inverness August 11 notice PDF/,
    );
  });

  it("reads owner-free fields and detects a visually struck-through row", () => {
    const svg = `
      <svg height="792pt" viewBox="0 0 612 792">
        <path fill="none" stroke-width="0.375" d="M 60 632 L 200 632 " transform="matrix(1, 0, 0, -1, 0, 792)"/>
      </svg>`;
    const rows = parseSummaryRows(
      parseBboxWords(`<page>${summaryWords}</page>`),
      parseHorizontalLines(svg),
    );

    expect(rows).toEqual([
      {
        lien: 1,
        aan: "00603988",
        location: "HIGHWAY 19,",
        recoveryAmount: 15529.15,
        redeemable: false,
        pids: ["50203256"],
        listingStatus: "advertised",
      },
      {
        lien: 2,
        aan: "01274201",
        location: "CRANDALL ROAD",
        recoveryAmount: 1295.63,
        redeemable: true,
        pids: ["50000462"],
        listingStatus: "withdrawn",
      },
    ]);
  });

  it("preserves reviewed display locations while updating source facts", () => {
    expect(
      mergeListings(
        [{
          lien: 1,
          aan: "00603988",
          location: "Highway 19, Mabou",
          recoveryAmount: 1,
          redeemable: true,
          pids: ["50203256"],
        }],
        [{
          lien: 1,
          aan: "00603988",
          location: "HIGHWAY 19, MABOU",
          recoveryAmount: 15529.15,
          redeemable: false,
          pids: ["50203256"],
          listingStatus: "withdrawn",
        }],
      ),
    ).toEqual([{
      lien: 1,
      aan: "00603988",
      location: "Highway 19, Mabou",
      recoveryAmount: 15529.15,
      redeemable: false,
      pids: ["50203256"],
      listingStatus: "withdrawn",
    }]);
  });

  it("refuses to erase an earlier source row when a revision omits it", () => {
    expect(() => mergeListings([{ lien: 7 }], [])).toThrow(
      /refusing to delete evidence automatically/,
    );
  });

  it("updates provenance only when the source document or rows change", () => {
    const current = {
      retrievedDate: "2026-07-19",
      source: "https://example.com/old.pdf",
      listings: [{
        lien: 1,
        aan: "00603988",
        location: "Highway 19, Mabou",
        recoveryAmount: 15529.15,
        redeemable: false,
        pids: ["50203256"],
      }],
    };
    const snapshot = buildSnapshot(
      current,
      [{
        ...current.listings[0],
        listingStatus: "withdrawn",
      }],
      "https://example.com/new.pdf",
      Buffer.from("revision"),
      new Date("2026-07-22T12:00:00Z"),
    );

    expect(snapshot.retrievedDate).toBe("2026-07-22");
    expect(snapshot.listings[0].listingStatus).toBe("withdrawn");
    expect(snapshot.sourceDocumentSha256).toMatch(/^[a-f\d]{64}$/);
  });

  it("rewrites the exported dataset receipt", () => {
    const model =
      'export const INVERNESS_BOOK_DATASET_SHA256 =\n  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";';
    const hash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const updated = updateDatasetHash(model, hash);

    expect(updated).toContain(`"${hash}"`);
    expect(updateDatasetHash(updated, hash)).toBe(updated);
  });
});
