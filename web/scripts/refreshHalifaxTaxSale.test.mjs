import { describe, expect, it } from "vitest";

const landingHtml = `
  <h2>Tender Number: HRM-TaxSale23</h2>
  <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf">Tender instructions</a>
  <a href="/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-aug-13.26.pdf">Schedule A</a>`;

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
      scheduleUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-aug-13.26.pdf",
    });
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

  it("fails closed on a shifted column, duplicate PID, or unfamiliar status", async () => {
    const { parseScheduleText } = await loadModule();
    expect(() => parseScheduleText(scheduleText.replace(/^00276111/u, " 00276111"))).toThrow(/fixed Schedule A columns/i);
    expect(() => parseScheduleText(scheduleText.replace("00632414", "00535617"))).toThrow(/Duplicate Halifax PID 00535617/);
    expect(() => parseScheduleText(scheduleText.replace(/No\s+Yes/u, "Maybe  Yes"))).toThrow(/Could not parse owner-free Halifax row 1/);
  });

  it("retains all source rows while declaring two exact geometry exceptions", async () => {
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
    expect(snapshot.mappedListingCount).toBe(3);
    expect(snapshot.mappedParcelIdentifierCount).toBe(4);
    expect(snapshot.geometryExceptions).toEqual([
      { aan: "09417036", pid: "41051889", reason: "no-nsprd-geometry", checkedOn: "2026-08-15" },
      { aan: "09417044", pid: "41051897", reason: "no-nsprd-geometry", checkedOn: "2026-08-15" },
    ]);
    expect(snapshot.listings).toHaveLength(5);
    expect(snapshot.listings[0]).not.toHaveProperty("hst");
    expect(JSON.stringify(snapshot)).not.toMatch(/OWNER OMITTED/);
  });

  it("fails closed when an exception identifier no longer matches the official row", async () => {
    const { buildSnapshot, parseScheduleText } = await loadModule();
    const listings = parseScheduleText(scheduleText).filter(({ aan }) => aan !== "09417044");
    const receipt = {
      tenderNumber: "HRM-TaxSale23", tenderUrl: "https://example.test/tender.pdf",
      scheduleUrl: "https://example.test/schedule.pdf", eventDate: "2026-09-15",
      bidDeadlineTime: "10:00", venue: "Online", listings,
    };
    expect(() => buildSnapshot(null, receipt, Buffer.from("tender"), Buffer.from("schedule"))).toThrow(/exception AAN 09417044 and PID 41051897/);
  });
});
