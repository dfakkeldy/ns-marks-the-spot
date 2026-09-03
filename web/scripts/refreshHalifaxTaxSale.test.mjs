import { describe, expect, it } from "vitest";

const landingHtml = `
  <h2>Tender Number: HRM-TaxSale23</h2>
  <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf">Tender instructions</a>
  <a href="/sites/default/files/documents/home-property/property-taxes/copy-of-sept15.2026newspaper.website-draft-aug-25.26.pdf">Schedule A</a>`;

const tenderText = `
  Halifax Regional Municipality Tax Sale by Tender
  September 15, 2026 at 10:00 am
  Tender # HRM-TaxSale23
  Paper submissions may be delivered to the Alderney Customer Service Centre located at
  40 Alderney Drive, Dartmouth, Nova Scotia between 8:30AM and 4:30PM.`;

function scheduleLine({ aan, owner = "OWNER OMITTED", description, pids, amount, hst, redeemable }) {
  return [
    aan.padEnd(10), owner.padEnd(120), description.padEnd(66),
    pids.join(", ").padStart(18), amount.padStart(13), hst.padStart(5),
    redeemable.padStart(8),
  ].join("");
}

const scheduleText = [
  scheduleLine({
    aan: "00276111", description: "1295 Higginsville Rd Higginsville - Dwelling",
    pids: ["00535617"], amount: "$2,972.46", hst: "No", redeemable: "Yes",
  }),
  scheduleLine({
    aan: "02365103", description: "8 Greenbank Crt Lot 12 Dartmouth - Dwelling",
    pids: ["00098723", "00632414"], amount: "$10,862.55", hst: "No", redeemable: "Yes",
  }),
  scheduleLine({
    aan: "05009715", description: "Pleasant St Lot 6 Dartmouth - Land",
    pids: ["40281776"], amount: "$8,076.88", hst: "Yes", redeemable: "No",
  }),
  scheduleLine({
    aan: "09417036", description: "40 Regency Park Dr Unit P19 Halifax Cc Unit #P19 *Parking Space",
    pids: ["41051889"], amount: "$1,534.03", hst: "No", redeemable: "Yes",
  }),
  scheduleLine({
    aan: "09417044", description: "40 Regency Park Dr Unit P20 Halifax Cc Unit #P20 *Parking Space",
    pids: ["41051897"], amount: "$1,534.06", hst: "No", redeemable: "Yes",
  }),
].join("\n");

async function loadModule() {
  return import(/* @vite-ignore */ "./refreshHalifaxTaxSale.mjs");
}

describe("Halifax September 2026 tender refresh", () => {
  it("resolves the single current tender and Schedule A from the official landing page", async () => {
    const { parseLandingPage } = await loadModule();
    expect(parseLandingPage(landingHtml)).toEqual({
      tenderNumber: "HRM-TaxSale23",
      tenderUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf",
      scheduleUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/copy-of-sept15.2026newspaper.website-draft-aug-25.26.pdf",
    });
  });

  it("resolves the sept3 website-draft Schedule A as the single official current file", async () => {
    const { parseLandingPage } = await loadModule();
    const sept3Landing = `
      <h2>Tender Number: HRM-TaxSale23</h2>
      <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf">Tender instructions</a>
      <a href="/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-sept3.26.pdf">SCHEDULE A</a>`;
    expect(parseLandingPage(sept3Landing)).toEqual({
      tenderNumber: "HRM-TaxSale23",
      tenderUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf",
      scheduleUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-sept3.26.pdf",
    });
  });

  it("rejects an external Schedule A origin or multiple official revisions", async () => {
    const { parseLandingPage } = await loadModule();
    const externalSchedule = landingHtml.replace(
      "/sites/default/files/documents/home-property/property-taxes/copy-of-sept15.2026newspaper.website-draft-aug-25.26.pdf",
      "https://example.test/sites/default/files/documents/home-property/property-taxes/copy-of-sept15.2026newspaper.website-draft-aug-25.26.pdf",
    );
    const multipleSchedules = `${landingHtml}
      <a href="/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-aug-13.26.pdf">Prior Schedule A</a>`;

    expect(() => parseLandingPage(externalSchedule)).toThrow(/found 1, 1, and 0/);
    expect(() => parseLandingPage(multipleSchedules)).toThrow(/found 1, 1, and 2/);
  });

  it("extracts the deadline and every owner-free Schedule A row", async () => {
    const { parseScheduleText, parseTenderText } = await loadModule();
    expect(parseTenderText(tenderText, "HRM-TaxSale23")).toEqual({
      eventDate: "2026-09-15",
      bidDeadlineTime: "10:00",
      venue: "Online or Alderney Customer Service Centre, 40 Alderney Drive, Dartmouth, Nova Scotia",
    });
    const listings = parseScheduleText(scheduleText);
    expect(listings).toHaveLength(5);
    expect(listings[0]).toEqual({
      item: 1, aan: "00276111", pids: ["00535617"],
      description: "1295 Higginsville Rd Higginsville - Dwelling",
      openingBidCents: 297_246, hst: false, redeemable: true,
      listingStatus: "advertised",
    });
    expect(listings[1].pids).toEqual(["00098723", "00632414"]);
    expect(listings[2]).toMatchObject({ openingBidCents: 807_688, hst: true, redeemable: false });
    expect(listings.at(-1)).toMatchObject({ aan: "09417044", pids: ["41051897"] });
    expect(JSON.stringify(listings)).not.toMatch(/OWNER OMITTED/);
  });

  it("extracts PIDs when the Schedule A PID column starts before offset 196", async () => {
    const { parseScheduleText } = await loadModule();
    // Live sept3 pdftotext: AAN at 0, description at 130, PID at 190, amount at 207.
    const liveLayoutLine = [
      "00276111".padEnd(130, " "),
      "1295 Higginsville Rd Higginsville - Dwelling".padEnd(60, " "),
      "00535617",
      "         $2,972.46     No      Yes",
    ].join("");
    const listings = parseScheduleText(liveLayoutLine);
    expect(listings).toEqual([{
      item: 1, aan: "00276111", pids: ["00535617"],
      description: "1295 Higginsville Rd Higginsville - Dwelling",
      openingBidCents: 297_246, hst: false, redeemable: true,
      listingStatus: "advertised",
    }]);
    expect(liveLayoutLine.indexOf("00535617")).toBe(190);
  });

  it("fails closed unless the current Schedule A has 19 rows and 20 unique PIDs", async () => {
    const { assertCurrentScheduleCounts } = await loadModule();
    const currentListings = [
      { pids: ["pid-00-a", "pid-00-b"] },
      ...Array.from({ length: 18 }, (_, index) => ({
        pids: [`pid-${String(index + 1).padStart(2, "0")}`],
      })),
    ];

    expect(() => assertCurrentScheduleCounts(currentListings)).not.toThrow();
    expect(() => assertCurrentScheduleCounts(currentListings.slice(0, 18))).toThrow(
      /Expected 19 Halifax Schedule A rows, found 18/,
    );
    expect(() => assertCurrentScheduleCounts([
      { pids: ["pid-00"] },
      ...currentListings.slice(1),
    ])).toThrow(/Expected 20 Halifax Schedule A PIDs, found 19/);
  });

  it("fails closed on a shifted column, duplicate PID, or unfamiliar status", async () => {
    const { parseScheduleText } = await loadModule();
    expect(() => parseScheduleText(scheduleText.replace(/^00276111/u, " 00276111"))).toThrow(/fixed Schedule A columns/i);
    expect(() => parseScheduleText(scheduleText.replace("00632414", "00535617"))).toThrow(/Duplicate Halifax PID 00535617/);
    expect(() => parseScheduleText(scheduleText.replace(/No\s+Yes/u, "Maybe  Yes"))).toThrow(/Could not parse owner-free Halifax row 1/);
  });

  it("retains all source rows when the current notice has no geometry exceptions", async () => {
    const { buildSnapshot, parseScheduleText } = await loadModule();
    const listings = parseScheduleText(scheduleText);
    const receipt = {
      tenderNumber: "HRM-TaxSale23",
      tenderUrl: "https://example.test/tender.pdf",
      scheduleUrl: "https://example.test/schedule.pdf",
      eventDate: "2026-09-15",
      bidDeadlineTime: "10:00",
      venue: "Online or Alderney Customer Service Centre, 40 Alderney Drive, Dartmouth, Nova Scotia",
      listings,
    };
    const snapshot = buildSnapshot(null, receipt, Buffer.from("tender"), Buffer.from("schedule"), new Date("2026-08-15T12:00:00Z"));

    expect(snapshot.ownerNamesExcluded).toBe(true);
    expect(snapshot.sourceRowCount).toBe(5);
    expect(snapshot.parcelIdentifierCount).toBe(6);
    expect(snapshot.mappedListingCount).toBe(5);
    expect(snapshot.mappedParcelIdentifierCount).toBe(6);
    expect(snapshot.geometryExceptions).toEqual([]);
    expect(snapshot.listings).toHaveLength(5);
    expect(snapshot.listings[0]).not.toHaveProperty("hst");
    expect(JSON.stringify(snapshot)).not.toMatch(/OWNER OMITTED/);
  });

  it("fails closed when a declared exception identifier no longer matches the official row", async () => {
    const { buildSnapshot, parseScheduleText } = await loadModule();
    const listings = parseScheduleText(scheduleText).filter(({ aan }) => aan !== "09417044");
    const receipt = {
      tenderNumber: "HRM-TaxSale23", tenderUrl: "https://example.test/tender.pdf",
      scheduleUrl: "https://example.test/schedule.pdf", eventDate: "2026-09-15",
      bidDeadlineTime: "10:00", venue: "Online", listings,
    };
    expect(() => buildSnapshot(null, receipt, Buffer.from("tender"), Buffer.from("schedule"), new Date(), [
      { aan: "09417036", pid: "41051889", reason: "no-nsprd-geometry", checkedOn: "2026-08-15" },
      { aan: "09417044", pid: "41051897", reason: "no-nsprd-geometry", checkedOn: "2026-08-15" },
    ])).toThrow(/exception AAN 09417044 and PID 41051897/);
  });
});
