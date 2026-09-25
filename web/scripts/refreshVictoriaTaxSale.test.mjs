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

  it("classifies an empty official notice page without inventing listings", async () => {
    const { classifyVictoriaPage, parseVictoriaNotice } = await loadModule();
    const empty = "<p>There are no property tax sale notices at this time.</p>";

    expect(classifyVictoriaPage(empty)).toEqual({ kind: "empty-notice" });
    expect(() => parseVictoriaNotice(empty)).toThrow(
      /Could not parse the Victoria sale date/,
    );
    expect(() => classifyVictoriaPage(`${empty}${noticeHtml}`)).toThrow(
      /mixes an empty-notice statement/,
    );
  });

  it("parses owner-free result rows and fails closed on a SOLD row without a bid", async () => {
    const { parseVictoriaResultBbox } = await loadModule();
    const parsed = parseVictoriaResultBbox(resultBboxHtml());

    expect(parsed.saleDate).toBe("2026-09-14");
    expect(parsed.results.map(({ outcome, totalOwingCents, winningBidCents }) => ({
      outcome, totalOwingCents, winningBidCents,
    }))).toEqual([
      { outcome: "withdrawn", totalOwingCents: null, winningBidCents: null },
      { outcome: "sold", totalOwingCents: 116_751, winningBidCents: 5_190_000 },
      { outcome: "unsold", totalOwingCents: 200_118, winningBidCents: null },
      { outcome: "unspecified", totalOwingCents: null, winningBidCents: null },
    ]);
    expect(JSON.stringify(parsed)).not.toMatch(/OWNER OMITTED/);

    expect(() => parseVictoriaResultBbox(resultBboxHtml({ soldBid: "$ -" }))).toThrow(
      /SOLD without a total owing and successful bid/,
    );
  });

  it("reconciles identifiable result rows to retained notice PIDs and refuses a location mismatch", async () => {
    const {
      parseVictoriaNotice,
      parseVictoriaResultBbox,
      reconcileVictoriaResults,
    } = await loadModule();
    const notice = buildSnapshotShape(parseVictoriaNotice(noticeHtml));
    const parsed = parseVictoriaResultBbox(resultBboxHtml());
    // The fixture notice still advertises rows 2 and 3; the result fixture only
    // identifies the $1,167.51 and $2,001.18 rows. Use a notice that matches.
    const retained = {
      ...notice,
      eventDate: "2026-09-14",
      listings: [
        {
          item: 4,
          aan: "02266288",
          pids: ["85066322"],
          description: "Big Harbour Rd., Port Bevis, Land Only 60 Acres +/- (HST Applicable)",
          redeemable: true,
          totalOwingCents: 116_751,
        },
        {
          item: 7,
          aan: "02845776",
          pids: ["85062669"],
          description: "Meat Cove Rd., Bay St. Lawrence, Land/Building, 15,00 Sq. Feet +/-",
          redeemable: true,
          totalOwingCents: 200_118,
        },
      ],
    };

    const matches = reconcileVictoriaResults(retained, parsed);
    expect(matches.map(({ listing, result }) => [listing.item, result.outcome, listing.pids])).toEqual([
      [4, "sold", ["85066322"]],
      [7, "unsold", ["85062669"]],
    ]);

    const mismatched = {
      ...retained,
      listings: [{
        ...retained.listings[0],
        description: "Unrelated Rd., Somewhere Else, Land Only",
      }, retained.listings[1]],
    };
    expect(() => reconcileVictoriaResults(mismatched, parsed)).toThrow(
      /location disagrees/,
    );
  });

  it("picks the dated official results and terms PDFs from the landing page", async () => {
    const { findVictoriaResultPdf, findVictoriaTermsPdf } = await loadModule();
    const landing = `
      <a href="https://victoriacounty.com/wp-content/uploads/2026/03/Tax-Sale-Results-March-24-2026.pdf">March</a>
      <a href="https://victoriacounty.com/wp-content/uploads/2026/09/Tax-Sale-Results-for-September-14-2026.pdf">Sept results</a>
      <a href="/wp-content/uploads/2026/08/TERMS-FOR-TENDER-BIDS-FOR-TAX-SALE-SEPT-14-2026.pdf">terms</a>
    `;

    expect(findVictoriaResultPdf(landing, "2026-09-14")).toBe(
      "https://victoriacounty.com/wp-content/uploads/2026/09/Tax-Sale-Results-for-September-14-2026.pdf",
    );
    expect(findVictoriaTermsPdf(landing, "2026-09-14")).toBe(
      "https://victoriacounty.com/wp-content/uploads/2026/08/TERMS-FOR-TENDER-BIDS-FOR-TAX-SALE-SEPT-14-2026.pdf",
    );
  });
});

function word(xMin, yMin, value, width = Math.max(12, value.length * 6)) {
  return `<word xMin="${xMin}" yMin="${yMin}" xMax="${xMin + width}" yMax="${yMin + 8}">${value}</word>`;
}

function resultBboxHtml({ soldBid = "$ 51,900.00" } = {}) {
  const bidParts = soldBid.split(/\s+/u);
  return `<doc>${[
    word(527, 73, "TAX"), word(568, 73, "SALE"), word(620, 73, "RESULTS"),
    word(537, 97, "September"), word(635, 97, "14,"), word(665, 97, "2026"),
    word(251, 135, "TOTAL"), word(250, 149, "OWING"),
    word(115, 142, "LOCATION"), word(307, 142, "HST"), word(347, 142, "STATUS"),
    word(446, 142, "REDEEMABLE"), word(589, 142, "SUCCESSFUL"), word(666, 142, "BID"),
    word(52, 165, "71"), word(65, 165, "Long"), word(86, 165, "Tom"), word(241, 165, "N/A"),
    word(348, 165, "REMOVED"), word(477, 165, "N/A"), word(570, 165, "$"), word(690, 165, "-"),
    word(52, 206, "Big"), word(67, 206, "Harbour"), word(103, 206, "Rd.,"),
    word(121, 206, "Port"), word(140, 206, "Bevis"),
    word(241, 206, "$"), word(262, 206, "1,167.51"), word(311, 206, "YES"),
    word(358, 206, "SOLD"), word(478, 206, "YES"),
    word(570, 206, bidParts[0]), word(662, 206, bidParts.slice(1).join(" ") || "-"),
    word(52, 247, "Meat"), word(76, 247, "Cove"), word(98, 247, "Rd.,"),
    word(116, 247, "Bay"), word(133, 247, "St."), word(146, 247, "Lawrence"),
    word(241, 247, "$"), word(262, 247, "2,001.18"), word(312, 247, "NO"),
    word(348, 247, "NOT"), word(368, 247, "SOLD"), word(478, 247, "YES"),
    word(570, 247, "$"), word(690, 247, "-"),
    word(52, 274, "Aspy"), word(74, 274, "Bay,"), word(94, 274, "Sugarloaf"),
    word(241, 274, "N/A"), word(477, 274, "N/A"), word(570, 274, "$"), word(690, 274, "-"),
  ].join("")}</doc>`;
}

function buildSnapshotShape(parsed) {
  return {
    municipality: "Municipality of the County of Victoria",
    eventDate: parsed.eventDate,
    listings: parsed.listings.map((listing) => ({
      item: listing.item,
      aan: listing.aan,
      pids: [listing.pid],
      description: listing.description,
      redeemable: listing.redeemable,
      totalOwingCents: listing.totalOwingCents,
    })),
  };
}
