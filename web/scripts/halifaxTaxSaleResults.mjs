const RESULTS_PAGE_URL = "https://www.halifax.ca/home-property/property-taxes/tax-sale/tax-sale-results";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sept", "oct", "nov", "dec"];

export function findHalifaxResultPdf(html, eventDate) {
  const [year, month, day] = eventDate.split("-");
  const filename = `tax-sale-website-results-${MONTHS[Number(month) - 1]}${Number(day)}.${year.slice(-2)}.pdf`;
  const urls = new Set();
  for (const [, href] of html.matchAll(/href=["']([^"']+)["']/giu)) {
    let url;
    try { url = new URL(href.replaceAll("&amp;", "&"), RESULTS_PAGE_URL); } catch { continue; }
    if (url.origin === new URL(RESULTS_PAGE_URL).origin &&
        url.pathname === `/sites/default/files/documents/home-property/property-taxes/${filename}`) {
      urls.add(String(url));
    }
  }
  if (urls.size !== 1) throw new Error(`Expected one official Halifax results PDF for ${eventDate}, found ${urls.size}.`);
  return [...urls][0];
}

function moneyCents(text) {
  if (!/^\$(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/u.test(text)) return null;
  const [whole, fraction] = text.slice(1).replaceAll(",", "").split(".");
  const amount = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function parseHalifaxResultText(text) {
  const lines = text.split(/\r?\n|\f/u).map((line) => line.trim()).filter(Boolean);
  const header = /^Assessment #\s{2,}PID\s{2,}Location\s{2,}Opening Bid\s{2,}Selling Price\s{2,}Redeemable$/u;
  if (!header.test(lines[0] ?? "")) throw new Error("Unexpected Halifax results header; refusing to guess columns.");
  const rows = [];
  const aans = new Set();
  const pidsSeen = new Set();
  for (const line of lines.slice(1)) {
    if (header.test(line)) continue;
    const cells = line.split(/\s{2,}/u);
    if (cells.length !== 6) throw new Error("Unexpected Halifax results columns.");
    const [aan, pidText, description, openingBid, sellingPrice, redeemable] = cells;
    const pids = pidText.split(/,\s*/u);
    const openingBidCents = moneyCents(openingBid);
    if (!/^\d{8}$/u.test(aan) || pids.some((pid) => !/^\d{8}$/u.test(pid)) ||
        !description || openingBidCents === null || !/^(Yes|No)$/u.test(redeemable)) {
      throw new Error("Could not parse owner-free Halifax result identifiers and fields.");
    }
    if (aans.has(aan) || pids.some((pid) => pidsSeen.has(pid)) || new Set(pids).size !== pids.length) {
      throw new Error("Duplicate Halifax result AAN or PID.");
    }
    aans.add(aan);
    pids.forEach((pid) => pidsSeen.add(pid));
    const winningBidCents = moneyCents(sellingPrice);
    if (sellingPrice !== "NO BIDS" && winningBidCents === null) {
      throw new Error("Unrecognized Halifax selling price; refusing to infer an outcome.");
    }
    rows.push({ aan, pids, description, openingBidCents, redeemable: redeemable === "Yes",
      outcome: sellingPrice === "NO BIDS" ? "unsold" : "sold", winningBidCents });
  }
  if (rows.length === 0) throw new Error("The Halifax results PDF contained no complete rows.");
  return rows;
}

export function buildHalifaxHistoricalAddition(notice, results, resultUrl, sourceDocumentSha256, today, current = null) {
  if (notice.tenderNumber !== "HRM-TaxSale23" || notice.eventDate !== "2026-09-15" ||
      notice.ownerNamesExcluded !== true || !/^[a-f\d]{64}$/u.test(sourceDocumentSha256) ||
      findHalifaxResultPdf(`<a href="${resultUrl}">Results</a>`, notice.eventDate) !== resultUrl) {
    throw new Error("Could not reconcile the Halifax results source with the retained dated notice.");
  }
  const byAan = new Map(notice.listings.map((listing) => [listing.aan, listing]));
  const byResultAan = new Map();
  if (byAan.size !== notice.listings.length) throw new Error("Duplicate Halifax notice AAN.");
  for (const row of results) {
    const listing = byAan.get(row.aan);
    if (!listing || byResultAan.has(row.aan) ||
        JSON.stringify(row.pids) !== JSON.stringify(listing.pids) ||
        row.description !== listing.description || row.openingBidCents !== listing.openingBidCents ||
        row.redeemable !== listing.redeemable) {
      throw new Error(`Could not reconcile Halifax result AAN ${row.aan} with its retained notice.`);
    }
    byResultAan.set(row.aan, row);
  }
  const eventId = `halifax-${notice.eventDate}`;
  const snapshot = {
    schemaVersion: 1, eventId, municipality: notice.municipality,
    source: resultUrl, landingPage: RESULTS_PAGE_URL,
    retrievedDate: current?.retrievedDate ?? today, saleDate: notice.eventDate,
    sourceDocumentSha256, ownerNamesExcluded: true, resultRowCount: results.length,
    missingNoticeRowCount: notice.listings.length - results.length, results,
  };
  if (current && JSON.stringify(current) !== JSON.stringify(snapshot)) {
    throw new Error(`${eventId} results changed after ingestion; refusing to rewrite verified outcomes automatically.`);
  }
  const records = notice.listings.map((listing) => {
    const result = byResultAan.get(listing.aan);
    return {
      eventId, recordId: `${eventId}-aan-${listing.aan}`, listingIdentifier: listing.aan,
      pids: listing.pids, civicDescription: listing.description,
      advertisedAmountCents: listing.openingBidCents,
      winningBidCents: result?.winningBidCents ?? null, outcome: result?.outcome ?? "unknown",
      resultNote: !result ? "Official results do not carry this notice row; no outcome is inferred."
        : result.outcome === "unsold" ? "Official selling price column reads NO BIDS."
        : "Official selling price column publishes a numeric selling price.",
      redemptionLabel: listing.redeemable ? "Redeemable - Yes" : "Redeemable - No",
      nspMatchStatus: "matched", nspMatchMethod: "exact-official-pid", reviewState: "notice-verified",
    };
  });
  const sold = results.filter(({ outcome }) => outcome === "sold").length;
  const notes = `The dated official Halifax results PDF prints ${results.length} rows: ${sold} numeric selling prices and ${results.length - sold} NO BIDS rows. Each result reconciles exactly with the retained Schedule A by AAN, PID, location, opening bid and redemption flag. ${snapshot.missingNoticeRowCount} notice rows are absent from the result PDF and remain unknown. No assessed-owner or bidder fields are retained.`;
  const event = {
    id: eventId, municipalityId: "halifax-regional-municipality", municipality: notice.municipality,
    shortMunicipality: "Halifax", saleDate: notice.eventDate, saleMethod: "sealed-tender",
    listingIdentifierLabel: "AAN", advertisedAmountLabel: "Opening bid", currency: "CAD",
    noticeUrl: notice.source, termsUrl: notice.tenderInstructions, landingPageUrl: notice.landingPage,
    resultStatus: "verified", resultUrl, retrievedOn: snapshot.retrievedDate,
    noticeSnapshotDate: notice.retrievedDate, resultSnapshotDate: snapshot.retrievedDate,
    noticeSha256: notice.scheduleDocumentSha256, resultSha256: sourceDocumentSha256, sourceNotes: notes,
  };
  const ledgerEntry = {
    municipality: notice.municipality, event: "September 15, 2026 tax sale by tender", status: "included",
    officialUrls: [notice.landingPage, notice.source, notice.tenderInstructions, RESULTS_PAGE_URL, resultUrl],
    documentSha256: [notice.scheduleDocumentSha256, sourceDocumentSha256],
    fieldsAvailable: ["AAN", "PID", "location", "opening bid", "selling price", "redeemable"],
    officialWinningBidsFound: sold > 0, notes,
  };
  return { snapshot, event, records, ledgerEntry };
}
