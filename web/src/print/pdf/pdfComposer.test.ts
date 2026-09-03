import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  COASTAL_HAZARD_ATTRIBUTION,
  COASTAL_HAZARD_LICENCE_URL,
} from "../../layers/layerCatalog";
import {
  extractGeoPdfMetadata,
  type PdfViewportGeometry,
} from "../../userMaps/parsers/geoPdfMetadata";
import { buildScaleBar } from "./scaleBar";
import { composeGeoPdf, type ComposeInput } from "./pdfComposer";
import { pdfTemplates } from "./templates/index";

type DrawnText = { text: string; x: number; y: number };

/**
 * A handful of cp1252 high-range bytes this suite's own fixtures and
 * generated strings (the attribution stamp, the overflow/ellipsis labels)
 * deliberately use, so assertions that check for them don't have to settle
 * for a placeholder.
 */
const CP1252_EXTRAS: Record<number, string> = {
  0x85: "…",
  0x91: "'",
  0x92: "'",
  0x93: "\"",
  0x94: "\"",
  0x96: "-",
  0x97: "-",
  0xa9: "©",
  0xb7: "·",
};

/**
 * Approximate WinAnsi-hex decode: exact for the printable-ASCII range
 * (0x20-0x7E) and the handful of extra cp1252 bytes above — together they
 * cover every character this suite's fixtures and `composeGeoPdf`'s own
 * generated strings use. Anything further outside that (accented letters
 * not exercised here, etc.) decodes to U+FFFD; no test below asserts on
 * those, so reimplementing the rest of the cp1252 table would just be
 * re-testing pdf-lib itself.
 */
function decodeWinAnsiHex(hex: string): string {
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (byte >= 0x20 && byte <= 0x7e) out += String.fromCharCode(byte);
    else out += CP1252_EXTRAS[byte] ?? "�";
  }
  return out;
}

/**
 * Decodes page 1's content stream and returns every `Tj`-shown string
 * alongside the `(x, y)` from the `Tm` operator that positioned it. This is
 * the content-inspection finding 4 asked for: none of the four original
 * tests looked past `getPageCount()`/`getSize()`/document info, so they'd
 * still pass if `composeGeoPdf` drew a blank page, leaked the legend past
 * `legend: null`, or overlapped the title with the map image.
 *
 * `composeGeoPdf` only ever calls `page.drawText` with single, already-
 * wrapped lines (or short unwrapped strings), which pdf-lib always renders
 * as one `Tm` (position) followed by one `Tj` (the shown text) inside a
 * `BT...ET` block — never the `TJ` array form, since nothing here sets
 * character/word spacing. That 1:1 Tm-to-Tj shape is what's parsed below;
 * it is not a general PDF content-stream parser.
 */
async function extractDrawnText(
  bytes: Uint8Array,
  pageIndex = 0,
): Promise<DrawnText[]> {
  const document = await PDFDocument.load(bytes);
  const page = document.getPage(pageIndex);
  const contents = page.node.Contents();

  const streamCandidates: unknown[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      streamCandidates.push(document.context.lookup(contents.get(i)));
    }
  } else if (contents) {
    streamCandidates.push(contents);
  }

  let raw = "";
  for (const candidate of streamCandidates) {
    if (candidate instanceof PDFRawStream) {
      const decoded = decodePDFRawStream(candidate).decode();
      raw += new TextDecoder("latin1").decode(decoded);
    }
  }

  const drawn: DrawnText[] = [];
  const num = "(-?[\\d.]+)";
  const tmRe = new RegExp(
    `${num}\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+Tm`,
  );
  const textObjectRe = /BT([\s\S]*?)ET/g;
  let objectMatch: RegExpExecArray | null;
  while ((objectMatch = textObjectRe.exec(raw))) {
    const block = objectMatch[1];
    const tm = tmRe.exec(block);
    if (!tm) continue;
    const x = Number(tm[5]);
    const y = Number(tm[6]);
    const tjRe = /<([0-9A-Fa-f]+)>\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRe.exec(block))) {
      drawn.push({ text: decodeWinAnsiHex(tjMatch[1]), x, y });
    }
  }
  return drawn;
}

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };

function testJpeg(): { jpegBytes: Uint8Array; widthPx: number; heightPx: number } {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#7788aa";
  ctx.fillRect(0, 0, 8, 8);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return {
    jpegBytes: Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)),
    widthPx: 8,
    heightPx: 8,
  };
}

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  const template = pdfTemplates.portrait;
  return {
    template,
    bounds,
    mapImage: testJpeg(),
    fields: {
      title: "Mabou Harbour",
      subtitle: "Fletcher sheet 14 over modern base",
      notes: "Walked the shore road boundary.",
    },
    legend: [
      { name: "OpenStreetMap base map", swatchColor: null },
      { name: "Fletcher sheet 14", swatchColor: "#b5651d" },
    ],
    attributionLines: [
      "Base map © OpenStreetMap contributors — openstreetmap.org/copyright",
      "Fletcher series scans courtesy David Rumsey Map Collection",
    ],
    qrPngBytes: null,
    scaleBar: buildScaleBar(bounds, template.mapFrame, template.scaleBar.maxWidth),
    generatedAt: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

function viewport(width: number, height: number): PdfViewportGeometry {
  return {
    width,
    height,
    transform: [1, 0, 0, -1, 0, height],
    viewBox: [0, 0, width, height],
  };
}

describe("composeGeoPdf", () => {
  it("produces a one-page Letter document carrying both registrations", async () => {
    const bytes = await composeGeoPdf(input());
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect({ width, height }).toEqual({ width: 612, height: 792 });
    const extraction = await extractGeoPdfMetadata(bytes, viewport(612, 792));
    expect(extraction.rejected).toEqual([]);
    expect(extraction.candidates).toHaveLength(2);
  });

  it("stamps document info from the fields", async () => {
    // updateMetadata: false — pdf-lib's own default load path unconditionally
    // rewrites Producer/ModificationDate on every load (see PDFDocument's
    // updateInfoDict), which would clobber the very field under test before
    // we ever read it back.
    const document = await PDFDocument.load(await composeGeoPdf(input()), {
      updateMetadata: false,
    });
    expect(document.getTitle()).toBe("Mabou Harbour");
    expect(document.getProducer()).toBe("NS Marks The Spot web map");
  });

  it("composes with the legend disabled and in landscape", async () => {
    const template = pdfTemplates.landscape;
    const bytes = await composeGeoPdf(input({
      template,
      legend: null,
      scaleBar: buildScaleBar(bounds, template.mapFrame, template.scaleBar.maxWidth),
    }));
    const document = await PDFDocument.load(bytes);
    const { width, height } = document.getPage(0).getSize();
    expect({ width, height }).toEqual({ width: 792, height: 612 });
  });

  it("stays under the size ceiling with a realistic map image", async () => {
    const bytes = await composeGeoPdf(input());
    expect(bytes.byteLength).toBeLessThan(15 * 1024 * 1024);
  });

  // --- Finding 1: WinAnsi crash on ordinary user text -----------------------

  it("does not throw when title/notes contain emoji, arrows, or other non-WinAnsi symbols", async () => {
    const bytes = await composeGeoPdf(input({
      fields: {
        // 🎉 (U+1F389) is a genuine astral-plane character (a surrogate
        // pair in UTF-16), unlike ✅/☂/→ which are all in the BMP — this
        // locks in that sanitizeForPdf's code-point iteration (`for...of`,
        // which walks by Unicode code point) handles a real surrogate pair
        // correctly instead of splitting it into two lone surrogates.
        title: "Mabou Harbour ✅ boundary walk → 🎉",
        subtitle: "Fletcher sheet 14 over modern base",
        notes: "Saw an odd marker near the wharf ☂ — flagged for follow-up.",
      },
    }));
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect({ width, height }).toEqual({ width: 612, height: 792 });
  });

  // --- Finding 2: title/subtitle collision for any title that wraps ---------

  it("keeps a 90+ character title inside titleBlock instead of spilling over the map", async () => {
    const template = pdfTemplates.portrait;
    const longTitle = "Mabou Harbour tax sale parcel survey walked end to end "
      + "along the old shoreline boundary from the government wharf pilings "
      + "past the mill foundation to the fence line at the property corner";
    expect(longTitle.length).toBeGreaterThan(90);

    const bytes = await composeGeoPdf(input({
      template,
      fields: {
        title: longTitle,
        subtitle: "Fletcher sheet 14 over modern base",
        notes: "",
      },
    }));
    const drawn = await extractDrawnText(bytes);
    const tb = template.titleBlock;
    const frame = template.mapFrame;

    // Select title-block text by its *content*, not by a y-position filter.
    // A position filter (e.g. "y above the map frame's top edge") is exactly
    // what a broken bounds guard would let slip past: an escaped title line
    // can land low enough to fall below that cutoff too, silently excluding
    // the very evidence this test exists to catch. Instead, identify the
    // drawn strings that belong to `longTitle` itself: `drawBoundedParagraph`
    // only ever draws either a verbatim wrapped substring of `longTitle` or
    // that substring's prefix + "…" (via `ellipsize`, which trims from the
    // end), so stripping a trailing ellipsis and checking containment in
    // `longTitle` identifies every title line regardless of where it landed.
    // No other drawn string on this page (subtitle, legend, scale bar,
    // north arrow, attribution) is a substring of `longTitle`.
    const titleText = drawn.filter((d) => {
      const stripped = d.text.endsWith("…") ? d.text.slice(0, -1) : d.text;
      return stripped.length > 0 && longTitle.includes(stripped);
    });
    expect(titleText.length).toBeGreaterThan(0);
    for (const entry of titleText) {
      expect(entry.y).toBeGreaterThanOrEqual(tb.y);
      expect(entry.y).toBeLessThanOrEqual(tb.y + tb.height);
    }

    // Direct, unconditional check for the real-world harm the bounds guard
    // exists to prevent: no drawn text of any kind — title or otherwise —
    // may fall within the map frame's rect. Unlike the per-entry check
    // above (which depends on correctly isolating title lines), this scans
    // every drawn string on the page against the frame's actual (x, y)
    // footprint, so it cannot be dodged by a selection filter that happens
    // to exclude the escaped lines.
    const insideMapFrame = drawn.filter(
      (d) => d.y >= frame.y && d.y <= frame.y + frame.height
        && d.x >= frame.x && d.x <= frame.x + frame.width,
    );
    expect(insideMapFrame).toEqual([]);

    // The title needs 4 wrapped lines but the block only has room for 2;
    // the last one that fits should say so with an ellipsis rather than
    // silently dropping the rest.
    expect(titleText.some((d) => d.text.endsWith("…"))).toBe(true);

    // With no room left, the subtitle must be suppressed entirely rather
    // than drawn past the block's bottom edge. ("over modern base" is
    // unique to the subtitle text — the default fixture's legend also
    // contains an entry literally named "Fletcher sheet 14".)
    expect(drawn.some((d) => d.text.includes("over modern base"))).toBe(false);
  });

  // --- Finding 4: content-stream assertions ---------------------------------

  it("draws the title, subtitle, and an attribution fragment", async () => {
    const drawn = await extractDrawnText(await composeGeoPdf(input()));
    const texts = drawn.map((d) => d.text);
    expect(texts.some((t) => t.includes("Mabou Harbour"))).toBe(true);
    expect(texts.some((t) => t.includes("Fletcher sheet 14 over modern base"))).toBe(true);
    expect(texts.some((t) => t.includes("OpenStreetMap contributors"))).toBe(true);
  });

  it("draws legend entries only when a legend is supplied — never leaks past legend: null", async () => {
    const withLegend = await extractDrawnText(await composeGeoPdf(input()));
    expect(withLegend.some((d) => d.text.includes("OpenStreetMap base map"))).toBe(true);
    expect(withLegend.some((d) => d.text.includes("Fletcher sheet 14"))).toBe(true);
    expect(withLegend.some((d) => d.text === "LEGEND")).toBe(true);
    expect(withLegend.some((d) => d.text.includes("Base map"))).toBe(true);

    const withoutLegend = await extractDrawnText(
      await composeGeoPdf(input({ legend: null })),
    );
    expect(withoutLegend.some((d) => d.text.includes("OpenStreetMap base map"))).toBe(false);
    expect(withoutLegend.some((d) => d.text === "LEGEND")).toBe(false);
    // The attribution strip is mandatory regardless of the legend.
    expect(withoutLegend.some((d) => d.text.includes("Base map"))).toBe(true);
  });

  // --- Also fix: notes truncation cue, hexToRgb fallback --------------------

  it("appends an ellipsis to the last notes line clipped by the titleBlock", async () => {
    const longNotes = Array.from(
      { length: 40 },
      (_, i) => `Line ${i} of the boundary-walk survey notes`,
    ).join(" ");
    const bytes = await composeGeoPdf(input({
      fields: { title: "Mabou Harbour", subtitle: "", notes: longNotes },
    }));
    const drawn = await extractDrawnText(bytes);
    const noteLines = drawn.filter((d) => d.text.includes("boundary-walk survey notes")
      || d.text.startsWith("Line "));
    expect(noteLines.length).toBeGreaterThan(0);
    expect(noteLines.some((d) => d.text.endsWith("…"))).toBe(true);
  });

  // --- Whole-branch review: the attribution strip must FIT, never be cut ----

  /**
   * What `exportAttributionLines` actually hands the composer for the app's
   * DEFAULT layer set: OSM, Fletcher, and the four default Province services
   * collapsed onto one line because they share the identical 149-character
   * `PROVINCE_ATTRIBUTION`. Real strings — a shortened stand-in would not
   * exercise the length that broke this.
   */
  const defaultLayerAttribution = [
    "Modern map: © OpenStreetMap contributors — " +
      "https://www.openstreetmap.org/copyright",
    "Fletcher geological maps: David Rumsey Map Collection, David Rumsey Map " +
      "Center, Stanford University Libraries — " +
      "https://creativecommons.org/licenses/by-nc-sa/3.0/",
    "NS Aerial, NS Property Boundaries, Water features, Roads, trails & " +
      "culverts: Contains information obtained under license from the " +
      "Province of Nova Scotia which is provided without warranty or " +
      "liability for errors or omissions. — " +
      "https://nsgiwa.novascotia.ca/documents/licenses/MapService/" +
      "Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
  ];

  for (const orientation of ["portrait", "landscape"] as const) {
    it(
      `renders every default-layer source and the stamp in the ${orientation} ` +
      "attribution strip",
      async () => {
        const drawn = await extractDrawnText(await composeGeoPdf(input({
          template: pdfTemplates[orientation],
          attributionLines: defaultLayerAttribution,
        })));
        // Join the drawn lines: the strip wraps, so any single fragment may
        // straddle two `Tj` strings. Collapse runs of whitespace so a phrase
        // split across a wrap point still matches.
        const strip = drawn.map((d) => d.text).join(" ")
          .replace(/\s+/gu, " ");

        // Every source's own name — the four Province layers are the ones
        // `lines.slice(0, maxLines)` used to drop off the end.
        for (const name of [
          "OpenStreetMap contributors",
          "David Rumsey Map Collection",
          "NS Aerial",
          "NS Property Boundaries",
          "Water features",
          "Roads, trails",
        ]) {
          expect(strip, `missing source: ${name}`).toContain(name);
        }
        // The Province licence text in full, not just its opening clause.
        expect(strip).toContain(
          "warranty or liability for errors or omissions.",
        );
        // Licence URLs — never emitted at all before this change.
        expect(strip).toContain("creativecommons.org/licenses/by-nc-sa/3.0/");
        expect(strip).toContain("NSPRD%20v1.pdf");
        // And the capture stamp, which sits last and so was dropped first.
        expect(strip).toContain("Generated 2026-07-31");
        // Nothing was cut: no ellipsis anywhere in the strip.
        expect(strip).not.toContain("…");
      },
    );
  }

  // The coastal licence requires three notices, not one, and the joined
  // paragraph is about six times the length the strip used to carry for that
  // source. If it no longer fits, the answer is the strip's height, not a
  // shorter notice — so this asserts the whole obligation reaches the page.
  it("carries the coastal licence's three notices in full, uncut", async () => {
    const bytes = await composeGeoPdf(input({
      attributionLines: [
        ...defaultLayerAttribution,
        "Coastal flooding — current, Coastal flooding — 2050, Coastal " +
          `flooding — 2100: ${COASTAL_HAZARD_ATTRIBUTION} — ` +
          COASTAL_HAZARD_LICENCE_URL,
      ],
    }));
    const document = await PDFDocument.load(bytes);
    let text = "";
    for (let index = 0; index < document.getPageCount(); index += 1) {
      text += `${(await extractDrawnText(bytes, index))
        .map((d) => d.text)
        .join(" ")} `;
    }
    text = text.replace(/\s+/gu, " ");

    // All three notices, the licence URL and the stamp reach the reader. The
    // strip alone cannot hold them at a readable size, which is why the
    // remainder gets its own page instead of an ellipsis mid-caveat.
    expect(text).toContain(
      "Reproduced and distributed with the permission of the Department of Service Nova Scotia.",
    );
    // Asserted from after the page break: the endorsement sentence starts on
    // the strip and finishes on the continuation page, which is the point.
    expect(text).toContain(
      "constituting an endorsement by the Department of Service Nova Scotia of this product.",
    );
    expect(text).toContain("scope, completeness, or currency.");
    expect(text).toContain("unrestrictedLicense.pdf");
    expect(text).toContain("Generated 2026-07-31");
    expect(text).not.toContain("…");
  });

  it("carries an attribution set too long for the strip onto its own pages", async () => {
    const absurd = Array.from(
      { length: 60 },
      (_, i) =>
        `Layer ${i}: Contains information obtained under license from the ` +
        "Province of Nova Scotia which is provided without warranty or " +
        `liability for errors or omissions. — https://example.invalid/${i}`,
    );
    const bytes = await composeGeoPdf(input({ attributionLines: absurd }));
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);

    const strip = (await extractDrawnText(bytes)).map((d) => d.text);
    // It still renders — a strip this overlong must not blank itself out.
    expect(strip.some((t) => t.includes("Layer 0"))).toBe(true);
    // …and the strip accounts for what it does not show.
    expect(
      strip.some((t) => t.includes("continue on the next page")),
    ).toBe(true);
    expect(strip.some((t) => t.endsWith("…"))).toBe(false);

    // The obligation itself reaches the reader rather than being cut: the
    // last layer's licence sentence and its URL are both on a later page.
    let continued = "";
    for (let index = 1; index < document.getPageCount(); index += 1) {
      continued += `${(await extractDrawnText(bytes, index))
        .map((d) => d.text)
        .join(" ")} `;
    }
    continued = continued.replace(/\s+/gu, " ");
    expect(continued).toContain("Sources and licences (continued)");
    expect(continued).toContain("Layer 59");
    expect(continued).toContain("https://example.invalid/59");
    expect(continued).toContain("Generated 2026-07-31");
  });

  it("falls back to the neutral chip colour instead of crashing on a malformed swatchColor", async () => {
    const bytes = await composeGeoPdf(input({
      legend: [{ name: "Mystery layer", swatchColor: "not-a-color" }],
    }));
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const drawn = await extractDrawnText(bytes);
    expect(drawn.some((d) => d.text.includes("Mystery layer"))).toBe(true);
  });
});
