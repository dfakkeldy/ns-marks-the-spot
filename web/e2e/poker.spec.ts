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
    if (viewport.width <= 860) {
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
