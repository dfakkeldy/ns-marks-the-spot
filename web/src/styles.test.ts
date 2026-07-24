import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("./src/styles.css", "utf8");

describe("parcel sheet typographic hierarchy", () => {
  it("left-aligns prose facts and reserves right-aligned mono for figures", () => {
    const ddDeclarations = styles.match(
      /\.parcel-facts dd\s*\{([^}]*)\}/,
    )?.[1];
    expect(ddDeclarations).toMatch(/font-family:\s*"Inter"/);
    expect(ddDeclarations).toMatch(/text-align:\s*left/);

    const figureDeclarations = styles.match(
      /\.parcel-facts dd\.fact-figure\s*\{([^}]*)\}/,
    )?.[1];
    expect(figureDeclarations).toMatch(/IBM Plex Mono/);
    expect(figureDeclarations).toMatch(/text-align:\s*right/);
  });

  it("weights source and licence notes as footnotes without hiding them", () => {
    const footnoteDeclarations = styles.match(
      /\.section-footnote\s*\{([^}]*)\}/,
    )?.[1];
    expect(footnoteDeclarations).toMatch(/font-size:\s*0\.72rem/);
    expect(footnoteDeclarations).not.toMatch(/display:\s*none/);
    expect(footnoteDeclarations).not.toMatch(/visibility:\s*hidden/);
  });
});

describe("mobile parcel inspector layout", () => {
  it("keeps long desktop inspectors inside the map viewport", () => {
    const desktopEnd = styles.indexOf("@media (max-width: 860px)");
    const desktopStyles = styles.slice(0, desktopEnd);
    const inspectorDeclarations = desktopStyles.match(
      /\.parcel-inspector\s*\{([^}]*)\}/,
    )?.[1];

    expect(inspectorDeclarations).toMatch(/max-height:\s*calc\(100% - 36px\)/);
    expect(inspectorDeclarations).toMatch(/overflow-y:\s*auto/);
  });

  it("keeps the inspector above phone attribution and scrolls long content", () => {
    const mobileStart = styles.indexOf("@media (max-width: 560px)");
    const mobileEnd = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      mobileStart,
    );
    const mobileStyles = styles.slice(mobileStart, mobileEnd);
    const inspectorDeclarations = mobileStyles.match(
      /\.parcel-inspector\s*\{([^}]*)\}/,
    )?.[1];

    expect(mobileStart).toBeGreaterThanOrEqual(0);
    expect(mobileEnd).toBeGreaterThan(mobileStart);
    expect(inspectorDeclarations).toMatch(/top:\s*10px/);
    expect(inspectorDeclarations).toMatch(/bottom:\s*42px/);
    expect(inspectorDeclarations).toMatch(/overflow-y:\s*auto/);
  });

  it("keeps close controls usable when root text is enlarged", () => {
    const inspectorClose = styles.match(
      /\.inspector-close\s*\{([^}]*)\}/,
    )?.[1];
    const inspectorHeading = styles.match(
      /\.parcel-inspector h2\s*\{([^}]*)\}/,
    )?.[1];
    const mobileStart = styles.indexOf("@media (max-width: 860px)");
    const mobileEnd = styles.indexOf("@media (max-width: 560px)", mobileStart);
    const mobileStyles = styles.slice(mobileStart, mobileEnd);
    const sheetClose = mobileStyles.match(
      /\.mobile-sheet-header button\s*\{([^}]*)\}/,
    )?.[1];

    expect(inspectorClose).toMatch(/width:\s*44px/);
    expect(inspectorClose).toMatch(/height:\s*44px/);
    expect(inspectorClose).toMatch(/font-size:\s*min\(1\.8rem, 32px\)/);
    expect(inspectorHeading).toMatch(/padding-right:\s*52px/);
    expect(sheetClose).toMatch(/flex:\s*0 0 44px/);
    expect(sheetClose).toMatch(/width:\s*44px/);
    expect(sheetClose).toMatch(/height:\s*44px/);
    expect(sheetClose).toMatch(/font-size:\s*min\(1\.7rem, 32px\)/);
  });

  it("wraps long event metadata inside the inspector", () => {
    const factValues = styles.match(/\.parcel-facts dd\s*\{([^}]*)\}/)?.[1];

    expect(factValues).toMatch(/overflow-wrap:\s*anywhere/);
    expect(factValues).toMatch(/max-width:\s*60%/);
  });

  it("gives multi-event controls explicit compact copy styling", () => {
    expect(styles).toMatch(/\.section-intro\s*\{/);
    expect(styles).toMatch(/\.event-row\s*\{/);
    expect(styles).toMatch(/\.source-note\s*\+\s*\.source-note\s*\{/);
  });

  it("gives Plus Code directions links a touch-friendly target", () => {
    const linkDeclarations = styles.match(
      /\.plus-code-link\s*\{([^}]*)\}/,
    )?.[1];

    expect(linkDeclarations).toMatch(/min-height:\s*44px/);
  });

  it("gives the persistent feedback appeal a WCAG-sized target", () => {
    const linkDeclarations = styles.match(
      /\.feedback-link\s*\{([^}]*)\}/,
    )?.[1];

    expect(linkDeclarations).toMatch(/min-height:\s*24px/);
  });

  it("keeps the beta-list action visible while compacting the phone brand", () => {
    const mobileStart = styles.indexOf("@media (max-width: 560px)");
    const mobileEnd = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      mobileStart,
    );
    const mobileStyles = styles.slice(mobileStart, mobileEnd);

    expect(mobileStyles).toMatch(/\.app-brand strong,/);
    expect(mobileStyles).not.toMatch(/\.header-action\s*\{[^}]*display:\s*none/);
  });
});

describe("map cartographic furniture", () => {
  it("keeps the coordinate readout above the two-line scale control", () => {
    const readoutDeclarations = styles.match(
      /\.position-readout\s*\{([^}]*)\}/,
    )?.[1];

    expect(readoutDeclarations).toMatch(/bottom:\s*72px/);
  });
});

describe("print document paged media", () => {
  it("leaves orientation to the active preview and isolates the live app while printing", () => {
    expect(styles).not.toMatch(/@page\s+(?:research|field)-sheet/);
    expect(styles).toMatch(/@media print\s*{/);
    expect(styles).toMatch(/body\.print-preview-open\s+\.app-shell\s*{[^}]*display:\s*none/s);
    expect(styles).toMatch(/\.print-document--inactive\s*{[^}]*display:\s*none/s);
    expect(styles).toMatch(/font-size:\s*9pt/);
  });

  it("removes the screen-only preview backdrop before printing the selected document", () => {
    const printStyles = styles.slice(styles.indexOf("@media print"));

    expect(printStyles).toMatch(/\.print-preview-backdrop\s*{[^}]*position:\s*static/s);
    expect(printStyles).toMatch(/\.print-preview-stage\s*{[^}]*overflow:\s*visible/s);
    expect(printStyles).toMatch(
      /\.print-page:not\(:last-child\)\s*{[^}]*break-after:\s*page/s,
    );
    expect(printStyles).not.toMatch(
      /\.print-page\s*{[^}]*break-after:\s*page/s,
    );
  });

  it("gives every rendered layer category an explicit monochrome legend treatment", () => {
    const layerIds = [
      "selected-parcel", "current-tax-sale", "historical-tax-sale",
      "modern", "ns-aerial", "nsprd", "crown-lands", "flood-risk",
      "waterfalls", "water-features", "roads", "buildings", "contours",
      "mineral-occurrences", "mineral-tenure", "abandoned-mines",
      "mineral-proximity-parcels", "inverness-hydro-potential",
      "ns-well-logs",
      "published-river-flood-zones", "coastal-flood-current",
      "coastal-flood-2050", "coastal-flood-2100",
      "arsenic-risk-wells", "uranium-risk-wells",
      "manganese-risk-wells", "surficial-aquifers",
      "zoning-inverness", "zoning-victoria", "zoning-richmond",
      "zoning-cumberland", "zoning-halifax",
    ];
    const treatments = layerIds.map((id) => {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const declarations = styles.match(
        new RegExp(`\\.print-layer-symbol--${escapedId}\\s*\\{([^}]*)\\}`),
      )?.[1];
      expect(declarations, `missing explicit legend treatment for ${id}`)
        .toBeDefined();
      return declarations?.replace(/\s+/gu, " ").trim();
    });

    expect(new Set(treatments)).toHaveLength(layerIds.length);

    const nsprdTreatment = treatments[layerIds.indexOf("nsprd")];
    const selectedTreatment = treatments[layerIds.indexOf("selected-parcel")];
    expect(nsprdTreatment).toMatch(/border:\s*1pt solid #777/);
    expect(nsprdTreatment).toMatch(/background:\s*#fff/);
    expect(nsprdTreatment).not.toMatch(/gradient/);
    expect(selectedTreatment).toMatch(/repeating-linear-gradient/);
  });

  it("keeps the landscape field contract bounded and printable metadata at 9pt or larger", () => {
    const printStyles = styles.slice(styles.indexOf(".print-preview"));
    const fieldPage = styles.match(/\.print-field-page\s*\{([^}]*)\}/)?.[1];

    expect(fieldPage).toMatch(/height:\s*195\.5mm/);
    expect(fieldPage).toMatch(/display:\s*grid/);
    expect(styles).toMatch(/\.print-field-support\s*\{/);
    expect(styles).toMatch(
      /\.print-field-support\s*\{[^}]*grid-template-columns:\s*minmax\(0, 7fr\) minmax\(0, 2fr\) minmax\(0, 3fr\)/s,
    );
    expect(styles).toMatch(/\.print-field-support \.print-active-layer-legend ul\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
    expect(styles).toMatch(
      /\.print-field-required-attribution\s*\{[^}]*display:\s*block/s,
    );
    expect(styles).toMatch(
      /\.print-field-footer\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s,
    );
    expect(styles).toMatch(
      /\.print-document-tab\s*\{[^}]*border-left:\s*3mm solid #111/s,
    );
    expect(styles).toMatch(
      /\.print-field-map-frame::after\s*\{[^}]*border:\s*1pt solid #111/s,
    );
    expect(printStyles).not.toMatch(/font-size:\s*[0-8](?:\.\d+)?pt/);
  });

  it("fixes the research summary and field sheets to bounded Letter page grids", () => {
    const researchPage = styles.match(/\.print-research-summary\s*\{([^}]*)\}/)?.[1];
    const fieldPage = styles.match(/\.print-field-page\s*\{([^}]*)\}/)?.[1];

    expect(researchPage).toMatch(/height:\s*259mm/);
    expect(researchPage).toMatch(/display:\s*grid/);
    expect(researchPage).toMatch(/grid-template-rows:\s*17mm 12mm 32mm minmax\(70mm, 1fr\) 11mm 20mm/);
    expect(fieldPage).toMatch(/grid-template-rows:\s*18mm 10mm 72mm minmax\(52mm, 1fr\) 19mm/);
    expect(styles).toMatch(/\.print-research-support\s*\{/);
    expect(styles).toMatch(/\.print-active-layer-legend ul\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
    expect(styles).toMatch(/\.print-required-attribution\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
    expect(styles).toMatch(/\.print-research-summary \.print-attribution-links\s*\{[^}]*display:\s*block/s);
    expect(styles).toMatch(/\.print-research-summary \.print-attribution-links li\s*\{[^}]*display:\s*inline/s);
    expect(styles).toMatch(/\.print-qr\s*\{[^}]*overflow:\s*hidden/s);
  });
});
