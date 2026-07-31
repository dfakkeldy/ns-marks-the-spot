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
    const printBlock = styles.slice(styles.indexOf("@media print"));
    for (const selector of [".export-dialog-backdrop", ".export-frame-layer"]) {
      const rule = printBlock.match(
        new RegExp(`[^{}]*\\${selector}[^{}]*\\{([^}]*)\\}`),
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
