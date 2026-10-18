import { expect, test } from "@playwright/test";

for (const path of ["/", "/rhodena"]) for (const width of [390, 1440]) {
  test(`shared research source controls and source states on ${path} at ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // Keep external basemaps deterministic; the audited core-habitat file is real.
    await page.route("https://**/*", route => {
      if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5ebde"/></svg>' });
      if (route.request().url().includes("/resource/gs26-c3fm.json")) return route.fulfill({ json: [{ source_row_id: "published-test-row", latitude: "45.785", longitude: "-61.405", structureid: "INV-TEST", structurename: "Published test structure" }] });
      return route.fulfill({ json: { type: "FeatureCollection", features: [] } });
    });
    await page.goto(`${path}?basemap=osm&taxSale=off&layers=modern&position=45.785,-61.405,13`);
    await expect(page).toHaveTitle(path === "/rhodena" ? /Rhodena Wind/ : /NS Marks The Spot/);
    if (width === 390) await page.getByRole("button", { name: path === "/rhodena" ? "Rhodena Wind — summary and layers" : "Search & layers", exact: true }).click();
    await page.getByRole("button", { name: /^Forestry & Ecology/ }).click();
    const core = page.getByRole("checkbox", { name: "Nova Scotia identified core habitat", exact: true });
    await expect(core).not.toBeChecked();
    await core.press("Space");
    await expect(page).toHaveURL(/ns-sar-core-habitat/);
    const coreRow = page.locator(".context-layer-control").filter({ has: core });
    await expect(coreRow).toContainText(/Ready · [1-9]/);
    await coreRow.getByText("Legend & source", { exact: true }).click();
    await expect(coreRow.getByRole("link", { name: "Licence", exact: true })).toHaveAttribute("href", /Unrestricted_Data_Use_Licence/);
    const proposed = page.getByRole("checkbox", { name: "Proposed federal terrestrial critical habitat", exact: true });
    await proposed.press("Space");
    await expect(page.locator(".context-layer-control").filter({ has: proposed })).toContainText("Source returned no records");
    await proposed.press("Space");
    await expect(page.getByRole("checkbox", { name: "Canadian National Wetlands Inventory", exact: true })).toBeVisible();
    if (width === 390) await page.getByRole("button", { name: "Back to categories", exact: true }).click();
    await page.getByRole("button", { name: /^Roads & Places/ }).click();
    const structures = page.getByRole("checkbox", { name: "Public Works bridges and culverts", exact: true });
    await structures.press("Space");
    await expect(page.locator(".context-layer-control").filter({ has: structures })).toContainText("Ready · 1 loaded");
    await expect(page).toHaveURL(/public-works-structures/);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440) {
      await page.locator(".leaflet-context-public-works-structures-pane .leaflet-interactive").click();
      await expect(page.locator(".leaflet-popup")).toContainText("INV-TEST");
      await expect(page.locator(".leaflet-popup")).toContainText("published-test-row");
      await page.locator(".leaflet-popup-close-button").click();
    }
    if (width === 390) await page.getByRole("button", { name: "Back to categories", exact: true }).click();
    await page.getByRole("button", { name: /^Water & Terrain/ }).click();
    const finer = page.getByRole("checkbox", { name: "Sub-tertiary watershed units", exact: true });
    await finer.press("Space");
    await expect(page.locator(".context-layer-control").filter({ has: finer })).toContainText("Outside this source’s mapped coverage");
    await page.screenshot({ path: `/tmp/gis-sources-${path === "/rhodena" ? "rhodena" : "main"}-${width}.png` });
    expect(errors).toEqual([]);
  });
}
