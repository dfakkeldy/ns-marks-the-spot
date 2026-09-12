import { expect, test } from "@playwright/test";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
for (const width of [390, 1440]) {
  test(`GeoNova controls, source details and historical coal work at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted"));
    await page.route("**/data.novascotia.ca/resource/*.geojson?**", (route) => route.fulfill({ contentType: "application/geo+json", json: { type: "FeatureCollection", features: [] } }));
    await page.route("**/MapServer/export?**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
    await page.route("**/FeatureServer/0/query?**", (route) => route.fulfill({ contentType: "application/json", json: { type: "FeatureCollection", features: [] } }));
    await page.goto("/?basemap=osm&taxSale=off&layers=&position=46.2,-60.5,14");
    await expect(page).toHaveTitle(/NS Marks The Spot/);
    if (width < 860) await page.getByRole("button", { name: "Search & layers", exact: true }).click();
    await page.getByRole("button", { name: /^Roads & Places/ }).click();
    const lines = page.getByRole("checkbox", { name: "Electrical transmission lines", exact: true });
    await expect(lines).not.toBeChecked();
    await lines.locator("..").click();
    await expect(page).toHaveURL(/transmission-lines/);
    const control = page.locator(".context-layer-control").filter({ has: lines });
    await control.getByText("Legend & source", { exact: true }).click();
    await expect(control.getByRole("link", { name: "Official source" })).toHaveAttribute("href", "https://data.novascotia.ca/d/yjmz-hpnc");
    await expect(control).toContainText("Ready");
    await expect(page.getByRole("checkbox", { name: "Mapped campgrounds", exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Mapped cemeteries", exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Mapped shooting ranges", exact: true })).toBeVisible();
    if (width < 860) await page.getByRole("button", { name: "Back to categories", exact: true }).click();
    await page.getByRole("button", { name: /^Historical Maps/ }).click();
    const coal = page.getByRole("checkbox", { name: "Historical coal workings", exact: true });
    await coal.press("Space");
    await expect(page).toHaveURL(/historical-coal-workings/);
    await expect(page.locator(".context-layer-control").filter({ has: coal })).toContainText("Ready");
    await coal.press("Space");
    await expect(page).not.toHaveURL(/historical-coal-workings/);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const width of [390, 1440]) {
  test(`open Crown Land and Sentinel retain credits and switch backgrounds at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/tiles.maps.eox.at/**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
    await page.route("**/data.novascotia.ca/resource/*.geojson?**", (route) => route.fulfill({ contentType: "application/geo+json", json: {
      type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[-60.51,46.19],[-60.49,46.19],[-60.49,46.21],[-60.51,46.21],[-60.51,46.19]]] }, properties: { source_row_id: "crown-1", dnr_id: "test", partialown: "0" } }],
    } }));
    await page.goto("/?taxSale=off&layers=sentinel-2,crown-lands&position=46.2,-60.5,14");
    await expect(page.getByRole("dialog", { name: "Province data licence" })).toHaveCount(0);
    await expect(page.locator(".map-layer-crown-lands")).toBeVisible();
    await expect(page.locator(".map-layer-sentinel-2 img").first()).toBeVisible();
    await expect(page.locator(".leaflet-control-attribution")).toContainText("CC BY 4.0");
    if (width < 860) await page.getByRole("button", { name: "Search & layers", exact: true }).click();
    await page.getByRole("button", { name: /^Background Maps/ }).click();
    const satellite = page.getByRole("checkbox", { name: "Sentinel-2 satellite · 2016–2017" });
    await expect(satellite).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "NS Aerial" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Modern map" }).press("Space");
    await expect(satellite).not.toBeChecked();
    await satellite.press("Space");
    await expect(page.getByRole("checkbox", { name: "Modern map" })).not.toBeChecked();
    if (width < 860) await page.getByRole("button", { name: "Back to categories", exact: true }).click();
    await page.getByRole("button", { name: /^Land & Property/ }).click();
    const crown = page.getByRole("checkbox", { name: "Crown Lands" });
    await expect(crown).toBeChecked();
    await crown.locator("..").getByText("Source & scale", { exact: true }).click();
    await expect(crown.locator("..").getByRole("link", { name: "Crown Land", exact: true })).toHaveAttribute("href", "https://data.novascotia.ca/d/3nka-59nz");
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
