import { expect, test } from "@playwright/test";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const name = "LiDAR canopy height · Judique pilot";

for (const width of [390, 1440]) {
  test(`CHM pilot remains off until selected and retains dates, classes and credits at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted"));
    await page.route("**/e2e/chm-tiles/**", route => {
      requests.push(route.request().url());
      return route.fulfill({ contentType: "image/png", body: pixel });
    });
    await page.route("https://**/*", route => {
      if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/png", body: pixel, headers: { "access-control-allow-origin": "*" } });
      return route.fulfill({ contentType: "application/json", json: { type: "FeatureCollection", features: [] } });
    });
    await page.goto("/?basemap=osm&taxSale=off&layers=modern&position=45.88,-61.46,16");
    await expect(page).toHaveTitle(/NS Marks The Spot/);
    if (width < 860) await page.getByRole("button", { name: "Search & layers", exact: true }).click();
    await page.getByRole("button", { name: /^Forestry & Ecology/ }).click();
    const checkbox = page.getByRole("checkbox", { name, exact: true });
    await expect(checkbox).not.toBeChecked();
    expect(requests).toEqual([]);
    await checkbox.press("Space");
    await expect(checkbox).toBeChecked();
    await expect(page.locator(".map-layer-lidar-canopy-height img").first()).toBeAttached();
    const control = page.locator(".context-layer-control").filter({ has: checkbox });
    await expect(control).toContainText("Ready");
    await control.getByText("Legend & source", { exact: true }).click();
    await control.getByText("Source & scale", { exact: true }).click();
    await expect(control).toContainText("Sheet 1045850061400 · lidar 2017");
    await expect(control).toContainText("0–<2 m");
    await expect(control).toContainText("NoData");
    await expect(control).toContainText("not a timber cruise");
    await expect(control).toContainText("licence coverage is provisional");
    const showLicences = page.getByRole("button", { name: "Show licences", exact: true });
    if (await showLicences.isVisible()) await showLicences.click();
    await expect(page.locator("footer.map-attribution")).toContainText("shall not be construed");
    expect(requests.every(url => url.includes("/chm-judique-2017-20261019.1/"))).toBe(true);
    await checkbox.press("Space");
    await expect(page.locator(".map-layer-lidar-canopy-height")).toHaveCount(0);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("a restored CHM selection cannot request tiles before Province acknowledgement", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/e2e/chm-tiles/**", route => { requests.push(route.request().url()); return route.fulfill({ contentType: "image/png", body: pixel }); });
  await page.goto("/?basemap=osm&taxSale=off&layers=lidar-canopy-height&position=45.88,-61.46,16");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Continue without Province layers", exact: true }).click();
  await page.getByRole("button", { name: /^Forestry & Ecology/ }).click();
  const checkbox = page.getByRole("checkbox", { name, exact: true });
  await expect(checkbox).toBeDisabled();
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByRole("button", { name: `Review Province licence for ${name}` })).toBeVisible();
  expect(requests).toEqual([]);
});
