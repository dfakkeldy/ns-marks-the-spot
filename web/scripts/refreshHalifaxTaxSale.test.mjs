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
  it("recognizes the dated results landing page after tender documents are removed", async () => {
    const { classifyLandingPage } = await loadModule();
    expect(classifyLandingPage("<p>TAXSALE23 LIST – Tuesday, September 15,2026 RESULTS</p>")).toEqual({
      kind: "published-results", tenderNumber: "HRM-TaxSale23", eventDate: "2026-09-15",
    });
    expect(() => classifyLandingPage(`${landingHtml}<p>TAXSALE23 LIST – Tuesday, September 15,2026 RESULTS</p>`)).toThrow(/mixes/);
  });
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

  it("resolves the sept8 website-draft Schedule A as the single official current file", async () => {
    const { parseLandingPage } = await loadModule();
    const sept8Landing = `
      <h2>Tender Number: HRM-TaxSale23</h2>
      <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf">Tender instructions</a>
      <a href="/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-sept8.26.pdf">SCHEDULE A</a>`;
    expect(parseLandingPage(sept8Landing)).toEqual({
      tenderNumber: "HRM-TaxSale23",
      tenderUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf",
      scheduleUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-sept8.26.pdf",
    });
  });

  it("resolves the sept10 website-draft Schedule A as the single official current file", async () => {
    const { parseLandingPage } = await loadModule();
    const sept10Landing = `
      <h2>Tender Number: HRM-TaxSale23</h2>
      <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf">Tender instructions</a>
      <a href="/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-sept10.26.pdf">SCHEDULE A</a>`;
    expect(parseLandingPage(sept10Landing)).toEqual({
      tenderNumber: "HRM-TaxSale23",
      tenderUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf",
      scheduleUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-sept10.26.pdf",
    });
  });

  it("resolves the sept11 website-draft Schedule A as the single official current file", async () => {
    const { parseLandingPage } = await loadModule();
    const sept11Landing = `
      <h2>Tender Number: HRM-TaxSale23</h2>
      <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf">Tender instructions</a>
      <a href="/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-sept11.26.pdf">SCHEDULE A</a>`;
    expect(parseLandingPage(sept11Landing)).toEqual({
      tenderNumber: "HRM-TaxSale23",
      tenderUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf",
      scheduleUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept15.2026newspaper.website-draft-sept11.26.pdf",
    });
  });

  it("ignores a malformed landing-page href instead of aborting official PDF discovery", async () => {
    const { parseLandingPage } = await loadModule();
    const landing = `${landingHtml}
      <a href="https://tenderTender Doc SEPT15.26">Tender Doc SEPT15.26</a>`;
    expect(parseLandingPage(landing)).toEqual({
      tenderNumber: "HRM-TaxSale23",
      tenderUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf",
      scheduleUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/copy-of-sept15.2026newspaper.website-draft-aug-25.26.pdf",
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

  it("fails closed unless the current Schedule A has 10 rows and 11 unique PIDs", async () => {
    const { assertCurrentScheduleCounts } = await loadModule();
    const currentListings = [
      { pids: ["pid-00-a", "pid-00-b"] },
      ...Array.from({ length: 9 }, (_, index) => ({
        pids: [`pid-${String(index + 1).padStart(2, "0")}`],
      })),
    ];

    expect(() => assertCurrentScheduleCounts(currentListings)).not.toThrow();
    expect(() => assertCurrentScheduleCounts(currentListings.slice(0, 9))).toThrow(
      /Expected 10 Halifax Schedule A rows, found 9/,
    );
    expect(() => assertCurrentScheduleCounts([
      { pids: ["pid-00"] },
      ...currentListings.slice(1),
    ])).toThrow(/Expected 11 Halifax Schedule A PIDs, found 10/);
  });

  it("retains the last Schedule A when bidding is closed and results are unpublished", async () => {
    const { classifyLandingPage, assertHalifaxResultsStillHistorical } = await loadModule();
    const closedLanding = `
      <h1>Property Tax Sales</h1>
      <p>Please Bidding for <strong>TAXSALE23 LIST – Tuesday, September 15,2026 </strong>is now <strong>Closed.</strong></p>
      <p>Please continue to monitor this website page for the Results</p>`;
    const historicalResults = `
      <h1>Tax Sale Results</h1>
      <p>HRM-TaxSale22 (May 12, 2026) - RESULTS</p>
      <a href="/sites/default/files/documents/home-property/property-taxes/tax-sale-website-results-may-12.26.pdf">RESULTS</a>`;

    expect(classifyLandingPage(closedLanding)).toEqual({
      kind: "closed-awaiting-results",
      tenderNumber: "HRM-TaxSale23",
      eventDate: "2026-09-15",
    });
    expect(() => assertHalifaxResultsStillHistorical(historicalResults)).not.toThrow();
  });

  it("fails closed if a closed landing page still hosts tender PDFs or TaxSale23 results appear", async () => {
    const { classifyLandingPage, assertHalifaxResultsStillHistorical, parseLandingPage } =
      await loadModule();
    const closedWithPdf = `
      <p>Bidding for TAXSALE23 LIST – Tuesday, September 15, 2026 is now Closed.</p>
      <p>Please continue to monitor this website page for the Results</p>
      <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-sept15.26.pdf">Tender</a>`;
    const taxSale23Results = `
      <h1>Tax Sale Results</h1>
      <p>HRM-TaxSale23 (September 15, 2026) - RESULTS</p>`;

    const closedWithoutDocuments = `
      <p>Bidding for TAXSALE23 LIST – Tuesday, September 15, 2026 is now Closed.</p>
      <p>Please continue to monitor this website page for the Results</p>`;
    expect(() => classifyLandingPage(closedWithPdf)).toThrow(/mixes a closed TaxSale23 notice/);
    expect(() => parseLandingPage(closedWithoutDocuments)).toThrow(
      /found closed-awaiting-results/,
    );
    expect(() => assertHalifaxResultsStillHistorical(taxSale23Results)).toThrow(
      /TaxSale23 results appear/,
    );
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

const word = (xMin, yMin, xMax, yMax, value) =>
  `<word xMin="${xMin}" yMin="${yMin}" xMax="${xMax}" yMax="${yMax}">${value}</word>`;

const sale24Headers = [
  word(67, 72, 106, 80, "Assessment"),
  word(565, 72, 585, 80, "Parcel"),
  word(587, 72, 623, 80, "Description"),
  word(729, 72, 745, 80, "PIDS"),
  word(793, 72, 820, 80, "Opening"),
  word(822, 72, 832, 80, "Bid"),
  word(856, 72, 870, 80, "HST"),
  word(871, 72, 903, 80, "Relevant?"),
  word(910, 72, 949, 80, "Redeemable"),
].join("");

describe("Halifax December 2026 TaxSale24 tender refresh", () => {
  it("resolves the December 8 tender and November 6 Schedule A as the current official files", async () => {
    const { classifyLandingPage, parseLandingPage } = await loadModule();
    const landing = `
      <h2>Tender Number: HRM-TaxSale24</h2>
      <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-dec8.2026.pdf">Tender</a>
      <a href="/sites/default/files/documents/home-property/property-taxes/dec8.2026newspaper.websitenov6.pdf">SCHEDULE A</a>
      <a href="/sites/default/files/documents/home-property/property-taxes/00473049_2.pdf">AAN package</a>`;
    expect(classifyLandingPage(landing)).toEqual({
      kind: "current-tender",
      tenderNumber: "HRM-TaxSale24",
      tenderUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/tender-doc-dec8.2026.pdf",
      scheduleUrl: "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/dec8.2026newspaper.websitenov6.pdf",
    });
    expect(parseLandingPage(landing).tenderNumber).toBe("HRM-TaxSale24");
  });

  it("fails closed if TaxSale23 and TaxSale24 tender documents appear together", async () => {
    const { classifyLandingPage } = await loadModule();
    expect(() => classifyLandingPage(`${landingHtml}
      <h2>Tender Number: HRM-TaxSale24</h2>
      <a href="/sites/default/files/documents/home-property/property-taxes/tender-doc-dec8.2026.pdf">Tender</a>
      <a href="/sites/default/files/documents/home-property/property-taxes/dec8.2026newspaper.websitenov6.pdf">SCHEDULE A</a>`)).toThrow(
      /mixes TaxSale23 and TaxSale24/,
    );
  });

  it("reads owner-free bbox rows, drops a straddling owner/description word, and keeps a MOBILE row unmapped", async () => {
    const { parseScheduleBbox, assertCurrentScheduleCounts } = await loadModule();
    const bbox = `${sale24Headers}
      ${word(75, 81, 104, 88, "00473049")}
      ${word(126, 81, 211, 88, "OWNER")}
      ${word(489, 81, 500, 88, "43")}
      ${word(502, 81, 530, 88, "Margaret")}
      ${word(532, 81, 545, 88, "Rd")}
      ${word(547, 81, 568, 88, "Halifax")}
      ${word(570, 81, 573, 88, "-")}
      ${word(575, 81, 605, 88, "Dwelling")}
      ${word(722, 81, 751, 88, "00251272")}
      ${word(798, 81, 827, 88, "$2,409.49")}
      ${word(876, 81, 884, 88, "No")}
      ${word(924, 81, 935, 88, "Yes")}
      ${word(75, 97, 104, 104, "00754587")}
      ${word(126, 97, 439, 104, "OWNER")}
      ${word(441, 97, 503, 104, "OVERFLOW15TOKEN")}
      ${word(505, 97, 511, 104, "St")}
      ${word(513, 97, 543, 104, "Margarets")}
      ${word(545, 97, 556, 104, "Bay")}
      ${word(558, 97, 566, 104, "Rd")}
      ${word(568, 97, 577, 104, "Lot")}
      ${word(579, 97, 591, 104, "R-C")}
      ${word(665, 97, 690, 104, "Dwelling")}
      ${word(722, 97, 751, 104, "00591297")}
      ${word(798, 97, 827, 104, "$9,756.25")}
      ${word(876, 97, 884, 104, "No")}
      ${word(924, 97, 935, 104, "Yes")}
      ${word(75, 346, 104, 353, "09402438")}
      ${word(126, 346, 211, 353, "OWNER")}
      ${word(489, 346, 505, 353, "154")}
      ${word(507, 346, 530, 353, "Hilltop")}
      ${word(532, 346, 555, 353, "Drive")}
      ${word(703, 346, 729, 353, "MOBILE")}
      ${word(798, 346, 827, 353, "$5,846.33")}
      ${word(876, 346, 884, 353, "No")}
      ${word(924, 346, 935, 353, "Yes")}`;
    const parsed = parseScheduleBbox(bbox);
    expect(parsed.listings).toHaveLength(2);
    expect(parsed.mobileHomeWithoutPidCount).toBe(1);
    expect(parsed.listings[0]).toEqual({
      item: 1, aan: "00473049", pids: ["00251272"],
      description: "43 Margaret Rd Halifax - Dwelling",
      openingBidCents: 240_949, hst: false, redeemable: true,
      listingStatus: "advertised",
    });
    expect(parsed.listings[1]).toMatchObject({
      aan: "00754587", pids: ["00591297"],
      description: "St Margarets Bay Rd Lot R-C Dwelling",
    });
    expect(JSON.stringify(parsed)).not.toMatch(/OWNER|OVERFLOW15TOKEN/);
    expect(() => assertCurrentScheduleCounts(parsed.listings, "HRM-TaxSale24")).toThrow(
      /Expected 40 Halifax Schedule A exact-PID rows, found 2/,
    );
  });

  it("fails closed on a Schedule A row with neither a PID nor MOBILE", async () => {
    const { parseScheduleBbox } = await loadModule();
    const bbox = `${sale24Headers}
      ${word(75, 81, 104, 88, "00473049")}
      ${word(489, 81, 560, 88, "Dwelling")}
      ${word(798, 81, 827, 88, "$2,409.49")}
      ${word(876, 81, 884, 88, "No")}
      ${word(924, 81, 935, 88, "Yes")}`;
    expect(() => parseScheduleBbox(bbox)).toThrow(/neither an exact PID nor MOBILE/);
  });
});
