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
