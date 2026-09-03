import { describe, expect, it } from "vitest";

const noticeHtml = `
  <h2>Property Tax Sale Notice</h2>
  <h3>TAX SALE BY TENDER</h3>
  <h4>September 14, 2026</h4>
  <p>All sealed bids must be received by 12:00 noon at the Municipal Administration Building (495 Chebucto Street, Baddeck, NS B0E 1B0).</p>
  <table>
    <tr>
      <th>#</th><th>AAN</th><th>PID</th><th>ASSESSED TO</th>
      <th>PROPERTY DESCRIPTION</th><th>REDEEMABLE</th>
      <th>LAND REGISTERED</th><th>TOTAL OWING</th>
    </tr>
    <tr>
      <td>1</td><td>REMOVED</td><td>REMOVED</td><td>REMOVED</td>
      <td>REMOVED</td><td>REMOVED</td><td>REMOVED</td><td>REMOVED</td>
    </tr>
    <tr>
      <td>2</td><td>01510347</td><td>85057701</td><td>OWNER OMITTED</td>
      <td>30 Courtney Rd., Cape North, Land/Dwelling/Building</td>
      <td>YES</td><td>YES</td><td>$2,893.64</td>
    </tr>
    <tr>
      <td>3</td><td>01511165</td><td>85032795</td><td>OWNER OMITTED</td>
      <td>10608 No. 5 Hwy, Ross Ferry, Land/Dwelling</td>
      <td>NO</td><td>NO</td><td>$1,831.06</td>
    </tr>
    <tr>
      <td>4</td><td>02266288</td><td>85066322</td><td>OWNER OMITTED</td>
      <td>Big Harbour Rd., Port Bevis, Land Only 60 Acres +/- (HST Applicable)</td>
      <td>YES</td><td>NO</td><td>$1,167.51 + hst</td>
    </tr>
  </table>
  <p>Dated at Baddeck, N.S. August 13, 2026</p>`;

async function loadModule() {
  return import(/* @vite-ignore */ "./refreshVictoriaTaxSale.mjs");
}

describe("Victoria County September 2026 tender refresh", () => {
  it("extracts exact owner-free facts while keeping an opaque removed row distinct", async () => {
    const { parseVictoriaNotice } = await loadModule();

    const parsed = parseVictoriaNotice(noticeHtml);

    expect(parsed).toEqual({
      eventDate: "2026-09-14",
      bidDeadlineTime: "12:00",
      venue:
        "Municipal Administration Building, 495 Chebucto Street, Baddeck, NS B0E 1B0",
      publishedOn: "2026-08-13",
      sourceRowCount: 4,
      opaqueRemovedRowCount: 1,
      listings: [
        {
          item: 2,
          aan: "01510347",
          pid: "85057701",
          description: "30 Courtney Rd., Cape North, Land/Dwelling/Building",
          redeemable: true,
          landRegistered: true,
          totalOwingCents: 289_364,
          listingStatus: "advertised",
        },
        {
          item: 3,
          aan: "01511165",
          pid: "85032795",
          description: "10608 No. 5 Hwy, Ross Ferry, Land/Dwelling",
          redeemable: false,
          landRegistered: false,
          totalOwingCents: 183_106,
          listingStatus: "advertised",
        },
        {
          item: 4,
          aan: "02266288",
          pid: "85066322",
          description: "Big Harbour Rd., Port Bevis, Land Only 60 Acres +/- (HST Applicable)",
          redeemable: true,
          landRegistered: false,
          totalOwingCents: 116_751,
          listingStatus: "advertised",
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/OWNER OMITTED/);
  });

  it("fails closed on a partial removal, malformed identifier, or duplicate PID", async () => {
    const { parseVictoriaNotice } = await loadModule();
    const partialRemoval = noticeHtml.replace(
      "<td>REMOVED</td><td>REMOVED</td><td>REMOVED</td><td>REMOVED</td>",
      "<td>REMOVED</td><td>REMOVED</td><td>OWNER OMITTED</td><td>REMOVED</td>",
    );
    const malformed = noticeHtml.replace("85032795", "PID pending");
    const duplicate = noticeHtml.replace("85032795", "85057701");

    expect(() => parseVictoriaNotice(partialRemoval)).toThrow(
      /Could not reconcile Victoria row 1/,
    );
    expect(() => parseVictoriaNotice(malformed)).toThrow(
      /Could not parse all owner-free fields for Victoria row 3/,
    );
    expect(() => parseVictoriaNotice(duplicate)).toThrow(
      /Duplicate Victoria PID 85057701/,
    );
    const unknownMoneySuffix = noticeHtml.replace("$1,167.51 + hst", "$1,167.51 + gst");
    expect(() => parseVictoriaNotice(unknownMoneySuffix)).toThrow(
      /Could not parse all owner-free fields for Victoria row 4/,
    );
  });

  it("requires an archived official-page receipt before changed facts can be written", async () => {
    const { buildSnapshot, parseVictoriaNotice } = await loadModule();
    const parsed = parseVictoriaNotice(noticeHtml);

    expect(() => buildSnapshot(null, parsed, null)).toThrow(
      /archive receipt is required/i,
    );

    const snapshot = buildSnapshot(null, parsed, {
      url: "https://web.archive.org/web/20260815200820id_/https://victoriacounty.com/property-tax-sale-notice/",
      sha256: "5e55ee85b2c8f56f78b1162c4e4f25c07e3c6ef420a3bbee94ba3b0886c99895",
    });
    expect(snapshot.ownerNamesExcluded).toBe(true);
    expect(snapshot.sourceRowCount).toBe(4);
    expect(snapshot.opaqueRemovedRowCount).toBe(1);
    expect(snapshot.listings).toHaveLength(3);
    expect(snapshot.listings[0]).not.toHaveProperty("landRegistered");
    expect(JSON.stringify(snapshot)).not.toMatch(/OWNER OMITTED/);
  });
});
