import { expect, test, type Locator } from "@playwright/test";

// Synthetic civic point and imagery isolate layout/gestures from live services.
test.use({ hasTouch: true });

const civic = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-61.414, 46.059] }, properties: { pntid: "test-point", civicnum: "117", strname: "Test Driveway", strsuffix: "Rd", comm: "Long Point", county: "Inverness" } }] };
const tile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#94a58d"/><path d="M0 180 256 90" stroke="#eee3c9" stroke-width="12"/></svg>');

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

for (const viewport of [{ width: 390, height: 700 }, { width: 360, height: 640 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
  test(`Poker search and measurement fit ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const activate = (control: Locator) => viewport.width <= 860 ? control.tap() : control.click();
    const errors: string[] = [];
    const parcelQueries: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(() => localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted"));
    await page.route("https://**/*", route => {
      const url = route.request().url();
      if (url.includes("tntn-er5g")) return route.fulfill({ json: civic });
      if (url.includes("/query") && /NSPRD/i.test(url)) parcelQueries.push(url);
      if (url.includes("/query")) return route.fulfill({ json: { type: "FeatureCollection", features: [] } });
      if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/svg+xml", body: tile });
      return route.fulfill({ contentType: "text/css", body: "" });
    });
    await page.goto("/?basemap=osm");
    await expect(page).toHaveTitle(/NS Marks The Spot/);
    if (viewport.width <= 860) await page.getByRole("button", { name: "Search & layers", exact: true }).click();
    await page.getByRole("combobox", { name: "Map setup", exact: true }).selectOption("poker");
    const input = page.getByRole("combobox", { name: "Search by PID or civic address" });
    await input.fill("117 Test Driveway");
    await page.getByRole("button", { name: "Find parcel", exact: true }).click();
    await page.getByRole("option", { name: /117 Test Driveway/ }).click();
    await expect(page.locator(".poker-map-tools")).toHaveCount(0);
    await expect(input).toBeInViewport({ ratio: 1 });
    const searchBox = await box(input);
    const zoom = await box(page.locator(".leaflet-control-zoom"));
    const terrain = page.locator(".research-terrain-controls");
    await expect(terrain).toBeInViewport({ ratio: 1 });
    const terrainBox = await box(terrain);
    const searchPanel = await box(page.locator(".poker-search"));
    expect(terrainBox.y).toBeGreaterThanOrEqual(searchPanel.y + searchPanel.height + 8);
    if (viewport.width <= 860) {
      const layers = page.getByRole("button", { name: "Layers", exact: true });
      const layersBox = await box(layers);
      expect(terrainBox.y).toBeGreaterThanOrEqual(layersBox.y + layersBox.height + 8);
      await activate(layers);
      await expect(page.getByRole("combobox", { name: "Map setup", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close map controls", exact: true }).click();
      expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(zoom.y);
      const locate = await box(page.getByRole("button", { name: "Use my location", exact: true }));
      expect(locate.y).toBeGreaterThanOrEqual(zoom.y + zoom.height);
    }
    await expect(page.locator(".poker-civic-number")).toHaveCount(1);
    // The attribution strip was shown on entering Poker and folded at the
    // first map interaction (the search's Find button); the folded row keeps
    // only its toggle and the civic status, and the toggle restores it.
    const showLicences = page.getByRole("button", { name: "Show licences", exact: true });
    await expect(showLicences).toBeVisible();
    await expect(page.getByRole("link", { name: "© OpenStreetMap contributors" })).toHaveCount(0);
    expect((await box(page.locator(".map-attribution"))).height).toBeLessThanOrEqual(52);
    await activate(showLicences);
    await expect(page.getByRole("link", { name: "© OpenStreetMap contributors" })).toBeVisible();
    await activate(page.getByRole("button", { name: "Hide licences", exact: true }));
    await expect(showLicences).toBeVisible();
    // The strip's ResizeObserver republishes its height a frame after it
    // folds, and everything above it moves then; measure only once settled.
    await expect.poll(async () => {
      const strip = Math.ceil((await box(page.locator(".map-attribution"))).height);
      const measured = await page.locator(".app-shell").evaluate((shell) => getComputedStyle(shell).getPropertyValue("--map-attribution-height"));
      return measured === `${strip}px`;
    }).toBe(true);
    if (viewport.width <= 860) {
      const finishBox = await box(page.getByRole("button", { name: "Finish", exact: true }));
      const undoBox = await box(page.getByRole("button", { name: "Undo point", exact: true }));
      expect(finishBox.y).toBe(undoBox.y);
      expect(finishBox.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator(".measure-readout")).toHaveCount(0);
      const readout = await box(page.locator(".poker-workspace"));
      const scale = await box(page.locator(".leaflet-control-scale"));
      const screenScale = await box(page.locator(".display-scale-readout"));
      const attribution = await box(page.locator(".map-attribution"));
      // Folded, the strip is a corner pill and the scale bar and readout
      // share its row; the buttons sit above all three.
      expect(attribution.height).toBeLessThanOrEqual(48);
      expect(attribution.x + attribution.width).toBeLessThanOrEqual(viewport.width);
      expect(scale.y + scale.height / 2).toBeGreaterThanOrEqual(attribution.y);
      expect(scale.y + scale.height / 2).toBeLessThanOrEqual(attribution.y + attribution.height);
      expect(screenScale.y + screenScale.height).toBeLessThanOrEqual(attribution.y + attribution.height);
      expect(screenScale.x + screenScale.width).toBeLessThanOrEqual(attribution.x);
      expect(screenScale.x).toBeGreaterThanOrEqual(scale.x + scale.width);
      expect(readout.y + readout.height).toBeLessThanOrEqual(attribution.y);
      expect(readout.y + readout.height).toBeLessThanOrEqual(screenScale.y);
      if (viewport.width > viewport.height) expect(readout.x).toBeGreaterThanOrEqual(scale.x + scale.width);
      else expect(readout.y + readout.height).toBeLessThanOrEqual(scale.y);
    }
    // Click exposed map, then another point; panel controls must not add points.
    const map = page.locator(".map-canvas .leaflet-container");
    const mapBox = await box(map);
    // The civic tooltip anchors the synthetic point across Leaflet renderers.
    const marker = page.locator(".poker-civic-number");
    await expect(marker).toBeInViewport();
    const markerBox = await box(marker);
    if (viewport.width <= 860) {
      const dock = await box(page.locator(".poker-workspace"));
      if (viewport.width > viewport.height) expect(markerBox.x + markerBox.width).toBeLessThan(dock.x);
      else expect(markerBox.y + markerBox.height).toBeLessThan(dock.y);
    }
    const start = { x: markerBox.x + markerBox.width / 2 - mapBox.x, y: markerBox.y + markerBox.height + 10 - mapBox.y };
    for (const position of [start, { x: start.x + 40, y: start.y }]) {
      if (viewport.width <= 860) await map.tap({ position });
      else await map.click({ position });
    }
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeEnabled();
    await activate(page.getByRole("button", { name: "Finish", exact: true }));
    // The total lives on the map label; the strip only announces it.
    await expect(page.locator(".measure-endpoint-label")).toContainText(/m|ft/);
    await expect(page.locator(".poker-workspace [role=status]")).toContainText(/m|ft/);
    await expect(page.locator(".measure-readout")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeDisabled();
    await activate(page.getByRole("button", { name: "Clear", exact: true }));
    await expect(page.getByRole("button", { name: "Undo point", exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("poker-mobile.png") });
    await activate(input);
    await expect(input).toBeFocused();
    await expect.poll(() => input.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBeGreaterThan(0);
    if (viewport.width <= 860) {
      // Model the visible viewport reduction caused by the software keyboard.
      await page.setViewportSize({ width: viewport.width, height: 340 });
      await expect(page.locator(".app-shell")).toHaveCSS("height", "340px");
      await expect(input).toBeInViewport({ ratio: 1 });
      await input.fill("117 Test Driveway");
      await page.getByRole("button", { name: "Find parcel", exact: true }).click();
      const result = page.getByRole("option", { name: /117 Test Driveway/ });
      await expect(result).toBeInViewport({ ratio: 1 });
      expect((await box(result)).height).toBeGreaterThanOrEqual(44);
      await activate(result);
      await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeDisabled();
    }
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(parcelQueries).toEqual([]);
  });
}

test("Poker civic numbers in a crowded view never overlap each other or the map controls", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  // A 10 x 6 block of houses about 25 m apart, plus three units sharing one point and number.
  const features = Array.from({ length: 60 }, (_, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [-61.414 + (i % 10 - 4.5) * 0.00032, 46.059 + (Math.floor(i / 10) - 2.5) * 0.000225] },
    properties: { pntid: `grid-${i}`, civicnum: String(100 + i * 2), strname: "Test", strsuffix: "Rd", comm: "Long Point", county: "Inverness" } }));
  // Two houses just below the measure buttons, where the buttons settle once the footer folds.
  for (const [i, lng] of [-61.41562, -61.41476].entries()) features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, 46.05395] }, properties: { pntid: `band-${i}`, civicnum: String(900 + i * 2), strname: "Test", strsuffix: "Rd", comm: "Long Point", county: "Inverness" } });
  for (const unit of ["1", "2", "3"]) features.push({ type: "Feature", geometry: { type: "Point", coordinates: [-61.414, 46.0605] }, properties: { pntid: "shared", civicnum: "40", unit_num: unit, strname: "Test", strsuffix: "Rd", comm: "Long Point", county: "Inverness" } } as typeof features[number]);
  await page.addInitScript(() => localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted"));
  await page.route("https://**/*", route => {
    const url = route.request().url();
    if (url.includes("tntn-er5g")) return route.fulfill({ json: { type: "FeatureCollection", features } });
    if (url.includes("/query")) return route.fulfill({ json: { type: "FeatureCollection", features: [] } });
    if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/svg+xml", body: tile });
    return route.fulfill({ contentType: "text/css", body: "" });
  });
  await page.goto("/?basemap=osm&theme=poker&position=46.059,-61.414,16");
  // Every number keeps a tooltip, so the 3D view can still place it; units sharing a point are one.
  await expect(page.locator(".poker-civic-number")).toHaveCount(63);
  await expect(page.locator(".poker-civic-number", { hasText: /^40$/ })).toHaveCount(1);
  const shown = page.locator(".poker-civic-number:not(.is-unplaced)");
  const hidden = page.locator(".poker-civic-number.is-unplaced");
  const controls = page.locator(".poker-search, .mobile-map-chrome, .leaflet-control, .research-terrain-controls, .location-button, .poker-workspace, .display-scale-readout, .map-attribution");
  const expectClear = async () => {
    const boxes = await shown.evaluateAll(elements => elements.map(element => ({ text: element.textContent, ...element.getBoundingClientRect().toJSON() as DOMRect })));
    const collisions = boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5).map(b => `${a.text} × ${b.text}`));
    expect(collisions).toEqual([]);
    const rects = await controls.evaluateAll(elements => elements.map(element => ({ cls: element.className, ...element.getBoundingClientRect().toJSON() as DOMRect })).filter(r => r.width && r.height));
    expect(boxes.flatMap(b => rects.filter(r => b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom).map(r => `${b.text} ${JSON.stringify([b.left, b.top, b.right, b.bottom])} under ${r.cls} ${JSON.stringify([r.left, r.top, r.right, r.bottom])}`))).toEqual([]);
    // A number waiting for room is really not drawn.
    expect(await hidden.evaluateAll(elements => elements.filter(element => getComputedStyle(element).visibility !== "hidden").map(element => element.textContent))).toEqual([]);
  };
  // Houses about 15 px apart at zoom 16: the block's edge is labelled and the rest wait, dots kept.
  await expect.poll(() => shown.count()).toBeGreaterThanOrEqual(12);
  expect(await hidden.count()).toBeGreaterThan(0);
  await expectClear();
  const dock = (await page.locator(".poker-workspace").boundingBox())!;
  const band = await shown.evaluateAll((elements, bottom) => elements.filter(element => element.getBoundingClientRect().top > bottom).map(element => element.textContent), dock.y + dock.height);
  expect(band.length).toBeGreaterThan(0);
  // The phone footer folds by itself after a few seconds, sliding the measure buttons down
  // without the map moving; the numbers are placed again around the buttons' new position.
  await expect(page.locator(".map-region.attribution-folded")).toHaveCount(1, { timeout: 10_000 });
  await expect.poll(async () => { try { await expectClear(); return true; } catch { return false; } }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("poker-crowded-numbers.png") });
  // Two zoom steps closer there is room for every number.
  const scale = page.locator(".leaflet-control-scale-line").first();
  for (const metres of ["50 m", "30 m"]) {
    await page.locator(".leaflet-control-zoom-in").click();
    await expect(scale).toHaveText(metres);
  }
  await expect.poll(() => shown.count()).toBeGreaterThanOrEqual(50);
  // Only a number whose dot is under a control or off the map is still waiting.
  const rects = await controls.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON() as DOMRect).filter(r => r.width && r.height));
  const waiting = await hidden.evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { text: element.textContent, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }));
  expect(waiting.filter(dot => dot.x > 0 && dot.y > 0 && dot.x < 390 && dot.y < 844 && !rects.some(r => dot.x >= r.left - 25 && dot.x <= r.right + 25 && dot.y >= r.top - 25 && dot.y <= r.bottom + 25)).map(dot => dot.text)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("poker-crowded-numbers-z18.png") });
  await expectClear();
  expect(errors).toEqual([]);
});
