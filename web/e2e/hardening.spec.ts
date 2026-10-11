import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`measurement keeps its points when a dialog handles Escape at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://**/*", route => route.fulfill({
      contentType: route.request().resourceType() === "image" ? "image/svg+xml" : "text/css",
      body: route.request().resourceType() === "image"
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#d4dfc8"/></svg>'
        : "",
    }));
    await page.goto("/?basemap=osm&taxSale=off&layers=modern&position=45.81355,-61.47775,14");
    await expect(page).toHaveTitle(/NS Marks The Spot/);
    await page.getByRole("button", { name: "Measure distance", exact: true }).click();
    const map = page.locator(".map-canvas .leaflet-container");
    await map.click({ position: { x: 180, y: 170 } });
    await map.click({ position: { x: 240, y: 210 } });
    const finish = page.getByRole("button", { name: "Finish", exact: true });
    await expect(finish).toBeEnabled();
    await page.getByRole("button", { name: "Show licences", exact: true }).click();
    await page.getByRole("button", { name: "About this map", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "About NS Marks The Spot" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(finish).toBeEnabled();
    await finish.click();
    await expect(page.getByRole("tooltip", { name: /^Total distance/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
