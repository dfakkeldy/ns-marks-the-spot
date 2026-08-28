import { describe, expect, it } from "vitest";

const noticeHtml = `
  <h2>August 20, 2026 Property Tax Sale</h2>
  <p>Location: Town Hall Council Chambers - 131 Commercial Street, Middleton</p>
  <p>Time: 10:00am</p>
  <table>
    <tr>
      <th>Civic Address</th><th>PID</th><th>Assessed Owner</th>
      <th>Total Due</th><th>AAN</th><th>Redeemable</th>
    </tr>
    <tr>
      <td>10 Example Street</td><td>05078472</td><td>OWNER OMITTED</td>
      <td>$0.07</td><td>03949001</td><td>Y</td>
    </tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr>
      <td>20 Sample Avenue</td><td>05193040</td><td>OWNER OMITTED</td>
      <td>$82,277.37</td><td>03334198</td><td>N</td>
    </tr>
  </table>`;

async function parse(html) {
  const modulePath = "./refreshMiddletonTaxSale.mjs";
  const { parseMiddletonNotice } = await import(/* @vite-ignore */ modulePath);
  return parseMiddletonNotice(html);
}

async function parseResults(html) {
  const modulePath = "./refreshMiddletonTaxSale.mjs";
  const { parseMiddletonResults } = await import(/* @vite-ignore */ modulePath);
  return parseMiddletonResults(html);
}

async function buildResultSnapshot(notice, parsed, archiveReceipt) {
  const modulePath = "./refreshMiddletonTaxSale.mjs";
  const { buildMiddletonResultSnapshot } = await import(
    /* @vite-ignore */ modulePath
  );
  return buildMiddletonResultSnapshot(
    notice,
    null,
    parsed,
    archiveReceipt,
    new Date("2026-08-20T20:00:00Z"),
  );
}

async function buildHistoricalAddition(notice, result) {
  const modulePath = "./refreshMiddletonTaxSale.mjs";
  const { buildMiddletonHistoricalAddition } = await import(
    /* @vite-ignore */ modulePath
  );
  return buildMiddletonHistoricalAddition(
    notice,
    result,
    "4224d48e990f3a97eb73304726cc4675d769bc5f28fd9fca22e278078f0edf13",
  );
}

describe("Middleton municipal notice refresh", () => {
  it("extracts exact owner-free notice fields and ignores empty table rows", async () => {
    expect(await parse(noticeHtml)).toEqual({
      eventDate: "2026-08-20",
      saleTime: "10:00",
      venue: "Town Hall Council Chambers - 131 Commercial Street, Middleton",
      listings: [
        {
          address: "10 Example Street",
          pid: "05078472",
          aan: "03949001",
          totalDueCents: 7,
          redeemable: true,
          listingStatus: "advertised",
        },
        {
          address: "20 Sample Avenue",
          pid: "05193040",
          aan: "03334198",
          totalDueCents: 8_227_737,
          redeemable: false,
          listingStatus: "advertised",
        },
      ],
    });
  });

  it("discards the result identity column and preserves printed dispositions", async () => {
    const resultsHtml = `
      <h2>August 20, 2026 Property Tax Sale Results</h2>
      <table>
        <tr>
          <th>No.</th><th>Property Sold</th><th>Property Description</th>
          <th>Opening Bid</th><th>Successful Bid</th>
        </tr>
        <tr><td>1</td><td>REMOVED</td><td></td><td></td><td></td></tr>
        <tr>
          <td>2</td><td>IDENTITY OMITTED</td><td>Land, 50 School Street, Middleton</td>
          <td>$84,616.12</td><td>NO BID</td>
        </tr>
        <tr>
          <td>3</td><td>IDENTITY OMITTED</td><td>Land, Senator Road, Middleton</td>
          <td>$15,813.51</td><td>$21,000.00</td>
        </tr>
      </table>`;

    expect(await parseResults(resultsHtml)).toEqual({
      saleDate: "2026-08-20",
      rows: [
        {
          rowNumber: 1,
          description: null,
          openingBidCents: null,
          winningBidCents: null,
          outcome: "withdrawn",
        },
        {
          rowNumber: 2,
          description: "Land, 50 School Street, Middleton",
          openingBidCents: 8_461_612,
          winningBidCents: null,
          outcome: "unsold",
        },
        {
          rowNumber: 3,
          description: "Land, Senator Road, Middleton",
          openingBidCents: 1_581_351,
          winningBidCents: 2_100_000,
          outcome: "sold",
        },
      ],
    });
    expect(JSON.stringify(await parseResults(resultsHtml))).not.toContain(
      "IDENTITY OMITTED",
    );
  });

  it("fails closed when a removed result row still carries parcel facts", async () => {
    const malformed = `
      <h2>August 20, 2026 Property Tax Sale Results</h2>
      <table>
        <tr>
          <th>No.</th><th>Property Sold</th><th>Property Description</th>
          <th>Opening Bid</th><th>Successful Bid</th>
        </tr>
        <tr><td>1</td><td>REMOVED</td><td>Ambiguous property</td><td></td><td></td></tr>
      </table>`;

    await expect(parseResults(malformed)).rejects.toThrow(
      /removed result row 1 still carries parcel facts/i,
    );
  });

  it("requires each retained notice listing to match one identifiable result row", async () => {
    const parsed = {
      saleDate: "2026-08-20",
      rows: [
        {
          rowNumber: 1,
          description: null,
          openingBidCents: null,
          winningBidCents: null,
          outcome: "withdrawn",
        },
        {
          rowNumber: 2,
          description: "LAND, 50 SCHOOL STREET, MIDDLETON",
          openingBidCents: 8_461_612,
          winningBidCents: null,
          outcome: "unsold",
        },
      ],
    };
    const notice = {
      municipality: "Town of Middleton",
      eventDate: "2026-08-20",
      listings: [
        {
          item: 1,
          address: "Land, 50 School Street, Middleton",
          pids: ["05193040"],
          aan: "03334198",
          totalDueCents: 8_351_154,
          redeemable: true,
          listingStatus: "advertised",
        },
      ],
    };
    const archiveReceipt = {
      timestamp: "20260820200525",
      url: "https://web.archive.org/web/20260820200525id_/https://www.discovermiddleton.ca/property-tax-sale-information",
      sha256: "d81652aee056a28dc013741a0b9f6d13e82df0305099a8ba6639240b5655b982",
    };

    expect(await buildResultSnapshot(notice, parsed, archiveReceipt)).toMatchObject({
      schemaVersion: 1,
      eventId: "middleton-2026-08-20",
      municipality: "Town of Middleton",
      retrievedDate: "2026-08-20",
      saleDate: "2026-08-20",
      ownerNamesExcluded: true,
      identityNamesExcluded: true,
      resultRowCount: 2,
      matchedNoticeListingCount: 1,
      opaqueRemovedRowCount: 1,
      archiveReceipt,
      results: parsed.rows,
    });

    const unmatchedNotice = {
      ...notice,
      listings: [
        { ...notice.listings[0], address: "A different official description" },
      ],
    };
    await expect(
      buildResultSnapshot(unmatchedNotice, parsed, archiveReceipt),
    ).rejects.toThrow(/did not match exactly one identifiable result row/i);
  });

  it("maps only exact notice descriptions and keeps no-bid separate from removed", async () => {
    const notice = {
      municipality: "Town of Middleton",
      source: "https://www.discovermiddleton.ca/property-tax-sale-information",
      retrievedDate: "2026-08-18",
      eventDate: "2026-08-20",
      listingCount: 2,
      listings: [
        {
          item: 1,
          address: "Land, 50 School Street, Middleton",
          pids: ["05193040"],
          aan: "03334198",
          totalDueCents: 8_351_154,
          redeemable: true,
          listingStatus: "advertised",
        },
        {
          item: 2,
          address: "Land, Senator Road, Middleton",
          pids: ["05030911"],
          aan: "01204483",
          totalDueCents: 1_536_838,
          redeemable: false,
          listingStatus: "advertised",
        },
      ],
    };
    const result = {
      eventId: "middleton-2026-08-20",
      source: notice.source,
      retrievedDate: "2026-08-20",
      saleDate: "2026-08-20",
      resultRowCount: 9,
      matchedNoticeListingCount: 2,
      opaqueRemovedRowCount: 7,
      archiveReceipt: {
        timestamp: "20260820200525",
        url: "https://web.archive.org/web/20260820200525id_/https://www.discovermiddleton.ca/property-tax-sale-information",
        sha256: "d81652aee056a28dc013741a0b9f6d13e82df0305099a8ba6639240b5655b982",
      },
      results: [
        {
          rowNumber: 1,
          description: null,
          openingBidCents: null,
          winningBidCents: null,
          outcome: "withdrawn",
        },
        {
          rowNumber: 4,
          description: "LAND, 50 SCHOOL STREET, MIDDLETON",
          openingBidCents: 8_461_612,
          winningBidCents: null,
          outcome: "unsold",
        },
        {
          rowNumber: 5,
          description: "LAND, SENATOR ROAD, MIDDLETON",
          openingBidCents: 1_581_351,
          winningBidCents: null,
          outcome: "unsold",
        },
      ],
    };

    const addition = await buildHistoricalAddition(notice, result);

    expect(addition.event).toMatchObject({
      id: "middleton-2026-08-20",
      saleMethod: "public-auction",
      resultStatus: "verified",
      noticeSha256:
        "4224d48e990f3a97eb73304726cc4675d769bc5f28fd9fca22e278078f0edf13",
      resultSha256:
        "d81652aee056a28dc013741a0b9f6d13e82df0305099a8ba6639240b5655b982",
    });
    expect(addition.records).toMatchObject([
      {
        listingIdentifier: "4",
        pids: ["05193040"],
        advertisedAmountCents: 8_461_612,
        winningBidCents: null,
        outcome: "unsold",
      },
      {
        listingIdentifier: "5",
        pids: ["05030911"],
        advertisedAmountCents: 1_581_351,
        winningBidCents: null,
        outcome: "unsold",
      },
    ]);
    expect(addition.ledgerEntry.notes).toContain(
      "7 additional rows print REMOVED without parcel identifiers",
    );
    expect(JSON.stringify(addition)).not.toMatch(/IDENTITY OMITTED|Property Sold/);
  });

  it("fails closed when a non-empty listing lacks an exact identifier", async () => {
    const malformed = noticeHtml.replace("05193040", "PID pending");

    await expect(parse(malformed)).rejects.toThrow(
      /Could not parse all owner-free fields for Middleton row 2/,
    );
  });

  it("fails closed on duplicate PIDs or an unfamiliar redemption status", async () => {
    const duplicate = noticeHtml.replace("05193040", "05078472");
    const unfamiliar = noticeHtml.replace("<td>N</td>", "<td>Pending</td>");

    await expect(parse(duplicate)).rejects.toThrow(/Duplicate Middleton PID/);
    await expect(parse(unfamiliar)).rejects.toThrow(
      /Could not parse all owner-free fields for Middleton row 2/,
    );
  });
});
