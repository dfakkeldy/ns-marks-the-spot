import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("./src/styles.css", "utf8");

describe("custom map-theme controls", () => {
  it("shows keyboard focus on every picker and manager control", () => {
    const focusRule = styles.match(
      /\.map-theme-picker :is\(select, button\):focus-visible,\s*\.theme-manager-dialog :is\(input, button\):focus-visible\s*\{([^}]*)\}/,
    )?.[1];

    expect(focusRule).toMatch(
      /outline:\s*3px solid var\(--survey-blue\)/,
    );
    expect(focusRule).not.toMatch(/outline:\s*(?:0|none)/);
  });

  it("keeps every setup and theme-manager control 44px tall throughout the phone layout", () => {
    const phoneStart = styles.indexOf("@media (max-width: 860px)");
    const narrowPhoneStart = styles.indexOf(
      "@media (max-width: 560px)",
      phoneStart,
    );
    const phoneStyles = styles.slice(phoneStart, narrowPhoneStart);
    const controls = phoneStyles.match(
      /\.map-theme-picker select,\s*\.map-theme-actions button,\s*\.theme-manager-dialog input,\s*\.theme-manager-dialog button,\s*\.layer-category-heading,\s*\.layer-category-back\s*\{([^}]*)\}/,
    )?.[1];

    expect(phoneStart).toBeGreaterThanOrEqual(0);
    expect(narrowPhoneStart).toBeGreaterThan(phoneStart);
    expect(controls).toMatch(/min-height:\s*44px/);
  });
});

describe("desktop layer category disclosures", () => {
  it("keeps category headings scannable and keyboard focus visible", () => {
    const buttonDeclarations = styles.match(
      /\.layer-category-heading\s*\{([^}]*)\}/,
    )?.[1];
    const focusDeclarations = styles.match(
      /\.layer-category-heading:focus-visible\s*\{([^}]*)\}/,
    )?.[1];

    expect(buttonDeclarations).toMatch(/min-height:\s*56px/);
    expect(buttonDeclarations).toMatch(/width:\s*100%/);
    expect(focusDeclarations).toMatch(
      /outline:\s*3px solid var\(--survey-blue\)/,
    );
    expect(focusDeclarations).not.toMatch(/outline:\s*(?:0|none)/);
  });
});

describe("phone-focused layer categories", () => {
  it("keeps category and Back controls touch-friendly with visible focus", () => {
    const mobileStart = styles.indexOf("@media (max-width: 860px)");
    const mobileEnd = styles.indexOf("@media (max-width: 560px)", mobileStart);
    const mobileStyles = styles.slice(mobileStart, mobileEnd);
    const touchDeclarations = mobileStyles.match(
      /\.layer-category-heading,\s*\.layer-category-back\s*\{([^}]*)\}/,
    )?.[1];
    const backFocus = styles.match(
      /\.layer-category-back:focus-visible\s*\{([^}]*)\}/,
    )?.[1];

    expect(touchDeclarations).toMatch(/min-height:\s*44px/);
    expect(backFocus).toMatch(/outline:\s*3px solid var\(--survey-blue\)/);
    expect(backFocus).not.toMatch(/outline:\s*(?:0|none)/);
  });

  it("keeps the focused list in the existing map-overlay sheet", () => {
    const mobileStart = styles.indexOf("@media (max-width: 860px)");
    const mobileEnd = styles.indexOf("@media (max-width: 560px)", mobileStart);
    const mobileStyles = styles.slice(mobileStart, mobileEnd);

    expect(mobileStyles).toMatch(/\.layer-category-list--focused\s*\{/);
    expect(mobileStyles).toMatch(/\.layer-rail\s*\{[^}]*position:\s*absolute/s);
    expect(mobileStyles).toMatch(/\.layer-rail\s*\{[^}]*max-height:\s*min\(86svh, 760px\)/s);
  });

  it("keeps Data & licences tappable while the layer sheet is open", () => {
    const mobileStart = styles.indexOf("@media (max-width: 860px)");
    const mobileEnd = styles.indexOf("@media (max-width: 560px)", mobileStart);
    const mobileStyles = styles.slice(mobileStart, mobileEnd);
    const attributionZ = mobileStyles.match(
      /\.map-attribution\s*\{[^}]*z-index:\s*(\d+)/s,
    )?.[1];
    const railZ = mobileStyles.match(
      /\.layer-rail\s*\{[^}]*z-index:\s*(\d+)/s,
    )?.[1];

    expect(mobileStyles).toMatch(
      /\.layer-rail\.mobile-open\s*\{[^}]*bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom\)\)/s,
    );
    expect(Number(attributionZ)).toBeGreaterThan(Number(railZ));
  });
});

describe("tax-sale category master", () => {
  it("keeps the master touch-friendly with a visible keyboard focus", () => {
    const masterDeclarations = styles.match(
      /\.tax-sale-master\s*\{([^}]*)\}/,
    )?.[1];
    const focusDeclarations = styles.match(
      /\.tax-sale-master input:focus-visible\s*\{([^}]*)\}/,
    )?.[1];

    expect(masterDeclarations).toMatch(/min-height:\s*44px/);
    expect(focusDeclarations).toMatch(
      /outline:\s*3px solid var\(--survey-blue\)/,
    );
  });
});

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
    expect(inspectorDeclarations).toMatch(
      /bottom:\s*calc\(42px \+ env\(safe-area-inset-bottom\)\)/,
    );
    expect(inspectorDeclarations).toMatch(/overflow-y:\s*auto/);
  });

  it("keeps close controls usable when root text is enlarged", () => {
    const inspectorClose = styles.match(
      /\.inspector-close\s*\{([^}]*)\}/,
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
    expect(sheetClose).toMatch(/flex:\s*0 0 44px/);
    expect(sheetClose).toMatch(/width:\s*44px/);
    expect(sheetClose).toMatch(/height:\s*44px/);
    expect(sheetClose).toMatch(/font-size:\s*min\(1\.7rem, 32px\)/);
  });

  it("pins the inspector's close control above the panel's own scroll", () => {
    const header = styles.match(/\.inspector-header\s*\{([^}]*)\}/)?.[1];
    const inspectorClose = styles.match(
      /\.inspector-close\s*\{([^}]*)\}/,
    )?.[1];

    expect(header).toMatch(/position:\s*sticky/);
    expect(header).toMatch(/top:\s*0/);
    expect(header).toMatch(/margin:\s*0 -24px 16px/);
    // An absolutely positioned child of a scrollport is translated by the
    // scroll offset: that is how the close button used to leave the screen.
    expect(inspectorClose).not.toMatch(/position:\s*absolute/);
    expect(inspectorClose).toMatch(/flex:\s*0 0 44px/);
  });

  it("re-insets the pinned inspector header on the phone panel", () => {
    const phoneStart = styles.indexOf("@media (max-width: 560px)");
    const phoneEnd = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      phoneStart,
    );
    const phoneStyles = styles.slice(phoneStart, phoneEnd);
    const header = phoneStyles.match(
      /\.inspector-header\s*\{([^}]*)\}/,
    )?.[1];

    expect(phoneStart).toBeGreaterThanOrEqual(0);
    expect(phoneEnd).toBeGreaterThan(phoneStart);
    expect(header).toMatch(/margin-inline:\s*-20px/);
    expect(header).toMatch(/padding-left:\s*20px/);
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

  it("gives the phone's About and licence buttons a 44px target", () => {
    // Below 861px the header is hidden, so the attribution strip's About
    // and Data & licences buttons need the same 44px target the rail
    // controls get. In-row Review is a second licence path, not a smaller
    // footer target.
    const phoneStart = styles.indexOf("@media (max-width: 860px)");
    expect(phoneStart).toBeGreaterThan(-1);
    const phoneStyles = styles.slice(
      phoneStart,
      styles.indexOf("@media (max-width: 560px)", phoneStart),
    );

    expect(phoneStyles).toMatch(
      /\.map-attribution button\s*\{[^}]*min-height:\s*44px/,
    );
  });
});

describe("GeoPDF frame chooser layout", () => {
  it("wraps long imported filenames instead of widening a 320px chooser", () => {
    const headingDeclarations = styles.match(
      /\.geopdf-frame-chooser h2\s*\{([^}]*)\}/,
    )?.[1];

    expect(headingDeclarations).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("user map row layout", () => {
  it("wraps long imported filenames instead of widening a 320px layer panel", () => {
    const copyDeclarations = styles.match(
      /\.user-map-row \.layer-row > span:last-of-type\s*\{([^}]*)\}/,
    )?.[1];
    const opacityRangeDeclarations = styles.match(
      /\.user-map-opacity input\[type="range"\]\s*\{([^}]*)\}/,
    )?.[1];

    expect(copyDeclarations).toMatch(/overflow-wrap:\s*anywhere/);
    expect(opacityRangeDeclarations).toMatch(/margin:\s*0/);
  });
});

describe("map cartographic furniture", () => {
  it("keeps the coordinate readout above the two-line scale control", () => {
    const readoutDeclarations = styles.match(
      /\.position-readout\s*\{([^}]*)\}/,
    )?.[1];
    const displayScaleDeclarations = styles.match(
      /\.display-scale-readout\s*\{([^}]*)\}/,
    )?.[1];

    expect(readoutDeclarations).toMatch(/bottom:\s*72px/);
    expect(displayScaleDeclarations).toMatch(/bottom:\s*50px/);
  });
});

describe("standalone bottom safe area", () => {
  const mobileStart = styles.indexOf("@media (max-width: 860px)");
  const narrowStart = styles.indexOf("@media (max-width: 560px)", mobileStart);
  const mobileStyles = styles.slice(mobileStart, narrowStart);
  const narrowStyles = styles.slice(
    narrowStart,
    styles.indexOf("@media (prefers-reduced-motion: reduce)", narrowStart),
  );

  it("holds the licence strip and its buttons clear of the home indicator", () => {
    // index.html opts into viewport-fit=cover and standalone mode, so on the
    // Home Screen the page runs under the 34pt gesture zone. At this width
    // the strip is the only place the Province attribution, the coastal and
    // zoning notices and the Data & licences button render at all.
    const attribution = mobileStyles.match(
      /\.map-attribution\s*\{([^}]*)\}/,
    )?.[1];

    // max(2px, ...), not a bare env(): the base rule's padding shorthand
    // gives this strip 2px top and bottom, and this block re-declares only
    // the inline sides, so a bare env() would take the bottom to 0 on a
    // phone with no inset.
    expect(attribution).toMatch(
      /padding-bottom:\s*max\(2px, env\(safe-area-inset-bottom\)\)/,
    );
    // Everything in this sheet is border-box, so the bounds grow with the
    // padding or it eats the content box instead of sitting below it, and
    // the 44px buttons get clipped rather than moved.
    expect(attribution).toMatch(
      /min-height:\s*calc\(32px \+ env\(safe-area-inset-bottom\)\)/,
    );
    expect(attribution).toMatch(
      /max-height:\s*calc\(72px \+ env\(safe-area-inset-bottom\)\)/,
    );
  });

  it("moves everything anchored to the bottom edge by the same inset", () => {
    // Each of these clears either the strip or the indicator. The strip's
    // floor and cap both grew by exactly env(safe-area-inset-bottom), so a
    // bare pixel offset left behind lands back under one of them.
    expect(mobileStyles).toMatch(
      /\.leaflet-bottom\.leaflet-left\s*\{[^}]*bottom:\s*calc\(40px \+ env\(safe-area-inset-bottom\)\)/s,
    );
    expect(mobileStyles).toMatch(
      /\.measure-readout\s*\{[^}]*bottom:\s*calc\(16px \+ env\(safe-area-inset-bottom\)\)/s,
    );
    expect(mobileStyles).toMatch(
      /\.display-scale-readout\s*\{[^}]*bottom:\s*calc\(50px \+ env\(safe-area-inset-bottom\)\)/s,
    );
    // From 561px to 860px the narrow override below never runs, so without
    // this the inspector's Copy/Export/Print row keeps the base 18px and
    // sits in an iPad's indicator zone in standalone.
    expect(mobileStyles).toMatch(
      /\.parcel-inspector\s*\{[^}]*bottom:\s*calc\(18px \+ env\(safe-area-inset-bottom\)\)/s,
    );
    expect(narrowStyles).toMatch(
      /\.parcel-inspector\s*\{[^}]*bottom:\s*calc\(42px \+ env\(safe-area-inset-bottom\)\)/s,
    );
    // The write-failure alerts stack above the strip too: at 88px flat their
    // bottom rows, Dismiss included, are painted under it on a phone with an
    // indicator. Their phone rule lives with the rest of the vector-editing
    // CSS further down the sheet, in its own 860px block, so this reads the
    // whole file rather than the slice above.
    expect(styles).toMatch(
      /\.vector-edit-write-errors\s*\{[^}]*bottom:\s*calc\(88px \+ env\(safe-area-inset-bottom\)\)/s,
    );
    // The vector editor keeps its own phone block further down the sheet. Its
    // offset also has to clear the attribution strip (see the phone editing
    // panel block below), so the inset rides on that clearance rather than on
    // a bare 12px.
    expect(styles).toMatch(
      /\.vector-edit-panel\s*\{[^}]*env\(safe-area-inset-bottom\)/s,
    );
  });
});

describe("print document paged media", () => {
  it("leaves orientation to the active preview and isolates the live app while printing", () => {
    expect(styles).not.toMatch(/@page\s+(?:research|field)-sheet/);
    expect(styles).toMatch(/@media print\s*{/);
    expect(styles).toMatch(/body\.print-preview-open\s+\.app-shell\s*{[^}]*display:\s*none/s);
    expect(styles).toMatch(/\.print-document--inactive\s*{[^}]*display:\s*none/s);
    expect(styles).toMatch(/font-size:\s*9pt/);
    // The georeference overlay is NOT inside `.app-shell` — App.tsx renders it
    // as a sibling of `<PrintPreview>` — so the `.app-shell` rule above never
    // matches it and it prints at `position: fixed; z-index: 1800` over page 1
    // of the field sheet.
    //
    // Taken as the FIRST `.georeference-overlay` rule at or after `@media
    // print`, and asserted on that rule's BODY. Delete the print rule and this
    // match falls through to the screen rule further down the file — which
    // sets position/inset/pointer-events and no `display` at all — so the
    // assertion fails rather than being satisfied by the wrong rule.
    const printOverlay = styles
      .slice(styles.indexOf("@media print"))
      .match(/\.georeference-overlay\s*\{([^}]*)\}/);
    expect(printOverlay?.[1]).toMatch(/display:\s*none/);

    // The GeoPDF export UI has the same exposure and needs the same guard.
    // `<ExportDialog>` is also rendered outside `.app-shell`, so its
    // `position: fixed; z-index: 3100` backdrop prints; `.export-frame-layer`
    // IS inside `.app-shell` but that rule is keyed on
    // `body.print-preview-open`, so a bare Cmd+P while framing an export
    // prints the blue frame, its 4000px page-dimming shadow, and the toolbar.
    //
    // Read the same way as the overlay above: the FIRST rule at or after
    // `@media print` whose selector list names the class, asserted on that
    // rule's BODY. Selector text can't span a brace, so `[^{}]*` cannot run
    // backwards past the previous rule. Delete the print rule and each match
    // falls through to its screen rule — `.export-dialog-backdrop` sets
    // position/inset/z-index/display:flex, `.export-frame-layer` sets
    // position/inset/z-index/pointer-events — neither of which is
    // `display: none`, so these fail rather than matching the wrong rule.
    //
    // Anchored the same way as `.georeference-overlay` above: the selector
    // must be directly followed (after whitespace, and optionally more
    // comma-listed selectors) by the rule's own `{`. The surrounding comment
    // names `.export-frame-layer` too, but always with a backtick right
    // after the class name — never whitespace, a comma, or `{` — so it can
    // never satisfy this anchor. The previous, unanchored `[^{}]*` prefix
    // could: delete `.export-frame-layer` from the real selector list and
    // the match fell through to the comment mention, then bled forward past
    // it to the NEXT rule's `{` — which happened to be this same
    // `.export-dialog-backdrop` rule — and passed on borrowed `display: none`
    // that was never re-asserting `.export-frame-layer` at all.
    const printBlock = styles.slice(styles.indexOf("@media print"));
    for (const selector of [".export-dialog-backdrop", ".export-frame-layer"]) {
      const rule = printBlock.match(
        new RegExp(`\\${selector}\\s*(?:,\\s*[.\\w-]+\\s*)*\\{([^}]*)\\}`),
      );
      expect(rule?.[1], `${selector} must be hidden in @media print`)
        .toMatch(/display:\s*none/);
    }
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

describe("georeferencer overlay", () => {
  it("sits above the map furniture but below the app's dialogs", () => {
    // `^` + /m pins this to the TOP-LEVEL rule. The bare pattern took the
    // first `.georeference-overlay` anywhere in the file, which is now the
    // two-space-indented `display: none` override inside @media print — so
    // both of these tests silently started asserting against the print rule
    // instead, and the `not.toMatch(/background/)` guard below went vacuous.
    const overlay = styles.match(/^\.georeference-overlay\s*\{([^}]*)\}/m)?.[1];
    expect(overlay).toMatch(/position:\s*fixed/);
    expect(overlay).toMatch(/inset:\s*0/);
    const overlayZ = Number(overlay?.match(/z-index:\s*(\d+)/)?.[1]);
    const dialogZ = Number(
      styles
        .match(/\.dialog-backdrop\s*\{([^}]*)\}/)?.[1]
        ?.match(/z-index:\s*(\d+)/)?.[1],
    );
    expect(overlayZ).toBeGreaterThan(1200);
    expect(overlayZ).toBeLessThan(dialogZ);
  });

  it("leaves the app's own map visible and clickable", () => {
    // THE regression test for this feature. An earlier draft made the overlay
    // a full-bleed opaque card over a 72%-black scrim, so the app's map — the
    // thing the user must click to complete every control point — was both
    // dimmed and pointer-blocked. No GCP could ever be finished, while the
    // status line said "Now click the same spot on the map."
    //
    // jsdom does no layout, so a rendered-DOM test cannot see occlusion:
    // these three declarations are what make the difference, so they are what
    // gets asserted. Task 10's DOM test pins the matching structure.
    // Top-level rule only — see the anchoring note in the test above.
    const overlay = styles.match(/^\.georeference-overlay\s*\{([^}]*)\}/m)?.[1];
    expect(overlay).toMatch(/pointer-events:\s*none/);
    expect(overlay).not.toMatch(/background/);
    const panel = styles.match(/\.georeference-panel\s*\{([^}]*)\}/)?.[1];
    expect(panel).toMatch(/pointer-events:\s*auto/);
    // Spec: panel left ~45%, app map keeps the right ~55%. Anchored with a
    // negative lookbehind, not the bare `/width:\s*45vw/`: the panel rule
    // also declares `max-width: 45vw`, and the unanchored form matches
    // inside "max-width" too — so changing ONLY `width` (leaving `max-width`
    // untouched) left this assertion green. `\b` does not fix it either: the
    // `-`/`w` junction in "max-width" is itself a word boundary.
    expect(panel).toMatch(/(?<![-\w])width:\s*45vw/);
  });

  it("only splits into two panes where the scan track is usable", () => {
    // The scan track is `45vw - 380px`, because the panel is `width: 45vw` and
    // its side column is `minmax(320px, 380px)`. Measured live, resolved
    // gridTemplateColumns: 900px viewport -> "25px 380px"; 1024px -> 81px;
    // 1280px -> 196px. So the two-pane rule must NOT be unconditional — at the
    // spec's former 900px threshold it gives the user a 25px sliver to place
    // control points in, and at 1024px the rail-width column that the base
    // rule's own comment explicitly rejects.
    const wideStart = styles.indexOf("@media (min-width: 1200px)");
    expect(wideStart).toBeGreaterThan(-1);
    const widePanel = styles
      .slice(wideStart)
      .match(/\.georeference-panel\s*\{([^}]*)\}/)?.[1];
    expect(widePanel).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(320px,\s*380px\)/,
    );

    // …and it must live there and ONLY there. Moving this one declaration back
    // onto the base rule brings the whole cramped 900–1199px range straight
    // back with every other test in this file still green — the narrow block
    // would keep overriding it below 1200px, so nothing else would notice.
    // `^`/m pins the base rule, which is the top-level one at column 0.
    const basePanel = styles.match(/^\.georeference-panel\s*\{([^}]*)\}/m)?.[1];
    expect(basePanel).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
    expect(basePanel).not.toMatch(/minmax\(320px/);
    expect(styles.match(/minmax\(320px,\s*380px\)/g)).toHaveLength(1);

    // The two bounds are complements: no viewport may fall between them, and
    // none may match both. A flat 1199 would strand a zoomed 1199.5px client.
    expect(styles).toContain("@media (max-width: 1199.98px)");
  });

  it("hides the layer rail and crosshairs the map during a session", () => {
    // Both are spec (189 and 201–204) and both are pure CSS, so nothing else
    // in the suite would notice their absence.
    expect(styles).toMatch(
      /\.app-shell\.georeferencing\s+\.layer-rail\s*\{[^}]*display:\s*none/,
    );
    expect(styles).toMatch(
      /\.map-canvas--georeferencing\s+\.leaflet-container\s*\{[^}]*cursor:\s*crosshair/,
    );
  });

  // Not just phones: this layout now covers everything below 1200px, which
  // includes tablets and small laptops. See the min-width test above.
  it("stacks the split view instead of squeezing both panes", () => {
    // Anchored to the LAST @media block, which Step 8 appends at the very END
    // of the file. Three traps live here, all measured:
    //
    // 1. `/grid-template-columns:\s*minmax\(0,\s*1fr\)/` unanchored also
    //    matches the WIDE rule `minmax(0, 1fr) minmax(320px, 380px)` — so
    //    deleting the narrow override entirely left this test green. The
    //    trailing `;` is what pins it to a SINGLE column.
    // 2. An earlier draft told the executor to append into the pre-existing
    //    860px block at styles.css:2722 while the "Your maps" section it also
    //    named starts at 3767 — so `lastIndexOf` spanned the base rules and
    //    matched the wide rule anyway. The narrow rules go last, full stop.
    // 3. Anchoring on the literal "860px" is what let the georeferencer's
    //    breakpoint drift under the spec in the first place, so the query is
    //    asserted here as its own claim. It has now been wrong twice — 860px,
    //    then 899.98px — because the cramped range does not start at a
    //    viewport width of its own, it starts wherever the two-pane rule
    //    engages. See the min-width test below for the measurements. The two
    //    860px blocks belong to unrelated chrome and are not this one.
    const narrowStart = styles.lastIndexOf("@media (max-width:");
    const narrow = styles.slice(narrowStart);
    expect(narrow).toMatch(/^@media \(max-width: 1199\.98px\)/);
    expect(narrow).toContain(".georeference-panel");
    const panel = narrow.match(/\.georeference-panel\s*\{([^}]*)\}/)?.[1];
    expect(panel).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
    // Full-bleed here, not the wide 45vw column — and `max-width` has to be
    // released explicitly or the base rule keeps clamping it.
    expect(panel).toMatch(/width:\s*auto\s*;/);
    expect(panel).toMatch(/max-width:\s*none\s*;/);
    // …and the tab toggle only exists at this breakpoint.
    expect(narrow).toMatch(/\.georeference-tabs\s*\{[^}]*display:\s*flex/);
  });

  it("hides the PANEL on the narrow Map tab, not just the scan", () => {
    // Spec: choosing Map "hides the panel entirely and leaves a floating bar
    // carrying the prompt and a Back to scan button". An earlier draft hid
    // only `.georeference-scan`, leaving the opaque panel over the very map
    // the tab exists to expose — and its own comment claimed the opposite of
    // what the CSS did.
    const narrow = styles.slice(styles.lastIndexOf("@media (max-width:"));
    expect(narrow).toMatch(
      /\.georeference-panel\[data-tab="map"\]\s*\{[^}]*display:\s*none/,
    );
    expect(narrow).toMatch(
      /\.georeference-map-bar\[data-tab="map"\]\s*\{[^}]*display:\s*flex/,
    );
    // The bar is hidden everywhere else, including wide screens.
    const bar = styles.match(/\.georeference-map-bar\s*\{([^}]*)\}/)?.[1];
    expect(bar).toMatch(/display:\s*none/);
    expect(bar).toMatch(/pointer-events:\s*auto/);
  });

  it("marks the suspect control point by more than colour", () => {
    // WCAG 1.4.1: colour alone cannot be the only carrier of meaning.
    const suspect = styles.match(/\.gcp-row--suspect\s*\{([^}]*)\}/)?.[1];
    expect(suspect).toBeDefined();
    expect(suspect).toMatch(/border-inline-start|font-weight/);
  });

  it("styles the numbered GCP markers, and distinguishes a pending one", () => {
    // Without these the spec's hollow-then-solid numbered markers render as
    // unstyled bare text on both panes — the markers ARE the interaction.
    expect(styles).toMatch(/\.gcp-marker\s*\{/);
    const pending = styles.match(/\.gcp-marker--pending\s*\{([^}]*)\}/)?.[1];
    expect(pending).toBeDefined();
    // Hollow vs solid, not just a different hue.
    expect(pending).toMatch(/background|border-style/);
    expect(styles).toMatch(/\.gcp-marker--selected\s*\{/);
  });

  it("defines the visually-hidden helper the GCP list header uses", () => {
    // GcpList renders <span className="visually-hidden">Actions</span>. With
    // no rule for it, a literal "Actions" heading appears in the table.
    const hidden = styles.match(/\.visually-hidden\s*\{([^}]*)\}/)?.[1];
    expect(hidden).toBeDefined();
    // Clipped, not display:none — display:none removes it from the
    // accessibility tree, which defeats the point of the label.
    expect(hidden).toMatch(/clip-path|clip:/);
    expect(hidden).not.toMatch(/display:\s*none/);
  });

  it("styles the panel's own opacity control like its UserMapRows precedent", () => {
    // GeoreferencePanel renders `<label className="georeference-opacity">`
    // with no matching rule before this: the "Map opacity" label and its
    // range input fell back to unstyled inline flow. `.user-map-opacity`
    // (UserMapRows) is the direct precedent — a 2-column grid pairing a
    // muted label with a full-width range input.
    const opacity = styles.match(/\.georeference-opacity\s*\{([^}]*)\}/)?.[1];
    expect(opacity).toBeDefined();
    expect(opacity).toMatch(/display:\s*grid/);
    expect(opacity).toMatch(/grid-template-columns:\s*\S+\s+\S+/);
    const label = styles.match(/\.georeference-opacity small\s*\{([^}]*)\}/)?.[1];
    expect(label).toMatch(/color:\s*var\(--muted\)/);
    const range = styles.match(
      /\.georeference-opacity input\[type="range"\]\s*\{([^}]*)\}/,
    )?.[1];
    expect(range).toMatch(/width:\s*100%/);
  });

  it("gives the warp fieldset the same frame as the reference-layers one", () => {
    // The precedent directly above: `.georeference-opacity` shipped with no
    // rule and fell back to unstyled inline flow, which is why that test
    // exists. `.georeference-method` is a <fieldset> sitting in the same
    // footer grid as `.georeference-references`, so with no rule it falls back
    // to the UA's `2px groove` border and reads as a different KIND of control
    // beside its 1px-solid sibling. Asserted against that sibling rather than
    // against literal values, so the two can only drift together.
    const method = styles.match(/\.georeference-method\s*\{([^}]*)\}/)?.[1];
    const references = styles.match(/\.georeference-references\s*\{([^}]*)\}/)?.[1];
    expect(method).toBeDefined();
    expect(method).toMatch(/display:\s*grid/);
    // The UA default is a groove; an explicit border is the whole point.
    expect(method).toMatch(/border:\s*1px\s+solid/);
    expect(references).toMatch(/border:\s*1px\s+solid/);
    expect(method).toMatch(/border-radius:/);
    // The helper sentence is secondary text, like the locked-layers note.
    const helper = styles.match(/\.georeference-method small\s*\{([^}]*)\}/)?.[1];
    expect(helper).toMatch(/color:\s*var\(--muted\)/);
  });
});

describe("Geoman vertex handles on a coarse pointer", () => {
  // The `@media (pointer: coarse)` block, sliced at its own closing brace in
  // column 0 — every nested rule in this stylesheet closes indented.
  const coarse = styles.match(
    /@media \(pointer: coarse\) \{\n([\s\S]*?)\n\}/,
  )?.[1];
  const HANDLE =
    /\.leaflet-marker-draggable\.marker-icon:not\(\.marker-icon-middle\)\s*\{([^}]*)\}/;

  it("gives a draggable vertex handle the 44px canvas the native handle uses", () => {
    expect(coarse).toBeDefined();
    const handle = coarse!.match(HANDLE)?.[1];
    expect(handle).toBeDefined();
    // Geoman ships `.marker-icon` at 14px !important, so this has to carry
    // !important too AND out-specify one class, or it ties and loses.
    expect(handle).toMatch(/width:\s*44px\s*!important/);
    expect(handle).toMatch(/height:\s*44px\s*!important/);
    // Leaflet anchors a divIcon by margin; half the size is what centres it.
    expect(handle).toMatch(/margin:\s*-22px 0 0 -22px\s*!important/);
    // 44 = 22 disc + 2 x 11 padding, and only under border-box.
    expect(handle).toMatch(/box-sizing:\s*border-box/);
    expect(handle).toMatch(/padding:\s*11px/);
    // The canvas is the touch target; the disc below is what is seen.
    expect(handle).toMatch(/background-color:\s*transparent/);
    expect(handle).toMatch(/border:\s*0/);
    // The rule must stay scoped to draggable handles: Geoman gives vertices
    // placed while DRAWING the same `.marker-icon` at `draggable: false`,
    // and a tap on one of those is what finishes the shape.
    // Not a bare-name guard: the regression to keep out is any coarse-pointer
    // rule that enlarges Geoman's handle class without excluding the vertices
    // placed while DRAWING, which carry the same class at draggable: false.
    const coarseRules = [
      ...styles
        .slice(styles.indexOf("@media (pointer: coarse)"))
        .matchAll(/\n\s*([^\n{]*marker-icon[^\n{]*)\{/g),
    ].map(([, selector]) => selector.trim());
    expect(coarseRules.length).toBeGreaterThan(0);
    for (const selector of coarseRules) {
      expect(selector).toContain(".leaflet-marker-draggable");
      expect(selector).toContain(":not(.marker-icon-middle)");
    }
  });

  it("draws the seen disc at 22px, rim included", () => {
    // The `*` rule at the top of this file does not reach pseudo-elements,
    // so without its own border-box the 2px rim would make the disc 26px and
    // push it off the vertex it marks — a coordinate error, in a map.
    const disc = coarse!.match(
      /\.leaflet-marker-draggable\.marker-icon:not\(\.marker-icon-middle\)::before\s*\{([^}]*)\}/,
    )?.[1];
    expect(disc).toBeDefined();
    expect(disc).toMatch(/box-sizing:\s*border-box/);
    expect(disc).toMatch(/width:\s*22px/);
    expect(disc).toMatch(/height:\s*22px/);
  });

  it("swaps the Alt hint for one a touch user can act on", () => {
    // Both sentences are in the DOM and CSS picks, so the component never
    // has to ask what kind of pointer is in front of it.
    expect(styles).toMatch(
      /\.vector-edit-snap-hint-coarse\s*\{\s*display:\s*none/,
    );
    expect(coarse).toMatch(/\.vector-edit-snap-hint-fine\s*\{\s*display:\s*none/);
    expect(coarse).toMatch(
      /\.vector-edit-snap-hint-coarse\s*\{\s*display:\s*block/,
    );
  });
});


describe("phone vector editing panel", () => {
  // App.tsx renders <VectorEditPanel> outside `.app-shell`, as a sibling of
  // it, so this card's `bottom` is measured against the initial containing
  // block while the attribution strip's `bottom: 0` is measured against
  // `.app-shell`. jsdom does no layout, so the declarations that reconcile
  // those two frames are what gets asserted — the same reason the
  // georeferencer tests below assert CSS text rather than geometry.
  //
  // Sliced from the card's own base rule, not from the first
  // `@media (max-width: 860px)` in the sheet: there are three of those, and
  // the first is the layer rail's.
  // Anchored on the phone block's own comment: the sheet has several
  // `@media (max-width: 860px)` blocks, and rules can be added between this
  // one and the card's base rule.
  const panelBase = styles.indexOf(
    "/* On a phone the rail is a bottom sheet",
  );
  const phoneStart = styles.indexOf("@media (max-width: 860px)", panelBase);
  // Comments stripped: a regex over the rule body would otherwise match the
  // prose explaining the declaration rather than the declaration, and stay
  // green if someone deleted the value it is meant to pin.
  const phonePanel = styles
    .slice(phoneStart)
    .match(/\.vector-edit-panel\s*\{([^}]*)\}/s)?.[1]
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("lifts the card clear of the attribution strip", () => {
    const railClearance =
      styles
        .slice(styles.indexOf("@media (max-width: 860px)"))
        .match(
          /\.layer-rail\.mobile-open\s*\{[^}]*bottom:\s*calc\((\d+)px/s,
        )?.[1] ?? "";

    expect(panelBase).toBeGreaterThan(-1);
    expect(phoneStart).toBeGreaterThan(panelBase);
    expect(railClearance).not.toBe("");
    // Read off the sheet's rule rather than written out again, so the two can
    // only drift together — and stated against `--app-viewport-height`, the
    // height `.app-shell`, and so the strip's bottom edge, is set to. A bare
    // pixel offset here is measured from a different edge than the strip it
    // has to clear, which is how the card ended up underneath it.
    expect(phonePanel).toMatch(
      new RegExp(
        `bottom:[^;]*var\\(--app-viewport-height[^;]*${railClearance}px`,
      ),
    );
  });

  it("is chrome, so a printed page never stamps it", () => {
    // Rendered outside `.app-shell`, so the print block's shell rule cannot
    // reach it — and a page box is narrower than 860px, so the phone rule
    // above applies to paged media too.
    const printStyles = styles.slice(styles.indexOf("@media print {"));
    expect(printStyles).toMatch(
      /\.vector-edit-panel\s*\{[^}]*display:\s*none\s*!important/s,
    );
  });

  it("caps the card so Done editing cannot leave the viewport", () => {
    // Bottom-anchored and uncapped, a card carrying a selected feature's
    // fields, attributes and photos grew past the top of the initial
    // containing block, where nothing scrolls, taking "Done editing" with it.
    expect(phonePanel).toMatch(
      /max-height:\s*calc\(\s*var\(--app-viewport-height,\s*100dvh\)\s*-\s*92px/,
    );
    expect(phonePanel).toMatch(/overflow-y:\s*auto/);
  });
});

describe("page heading at every breakpoint", () => {
  it("hides the desktop header and the closed layer sheet on a phone, so the page heading cannot sit in either", () => {
    // App renders its one h1 as a clipped child of `.app-shell` because of
    // these two rules, and the DOM test can only pin where that heading sits.
    // The sheet has several `@media (max-width: 860px)` blocks; the first is
    // the layout one, which is where both of these live.
    const phoneStart = styles.indexOf("@media (max-width: 860px)");
    const narrowPhoneStart = styles.indexOf(
      "@media (max-width: 560px)",
      phoneStart,
    );
    const phoneStyles = styles.slice(phoneStart, narrowPhoneStart);

    expect(phoneStart).toBeGreaterThanOrEqual(0);
    expect(narrowPhoneStart).toBeGreaterThan(phoneStart);
    expect(phoneStyles).toMatch(/\.app-header\s*\{[^}]*display:\s*none/);
    expect(phoneStyles).toMatch(/\.layer-rail\s*\{[^}]*display:\s*none/);
  });
});
