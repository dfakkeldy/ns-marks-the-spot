import { expect, test, type Page } from "@playwright/test";
import { createCanvas } from "canvas";

const excludedIds = ["wam-relative-wetness", "wam-predicted-flow", "forest-treatments"];
const excludedNames = ["WAM relative wetness", "WAM predicted flow", "Recorded forest treatments"];
const pixel = createCanvas(256, 256).toBuffer("image/png");

async function openCategory(page: Page, name: RegExp, width: number) {
  if (width < 860 && await page.getByRole("button", { name: "Back to categories", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Back to categories", exact: true }).click();
  }
  const category = page.getByRole("button", { name });
  if (await category.getAttribute("aria-expanded") !== "true") await category.click();
}

for (const width of [390, 1440]) {
  for (const rhodena of [false, true]) {
    test(`withheld forestry cannot be restored, viewed or exported on ${rhodena ? "Rhodena" : "the map"} at ${width}px`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      const forbiddenRequests: string[] = [];
      const forestHeightRequests: string[] = [];
      const forestHeightPdfRequests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(ids => {
        localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
        localStorage.setItem("ns-marks-the-spot:custom-themes", JSON.stringify({
          version: 1, themes: [{
            id: "legacy-forestry", name: "Legacy forestry", layerIds: ["modern", ...ids, "forest-height"],
            opacityOverrides: { "forest-treatments": 0.5, "forest-height": 0.7 },
            preferredCategoryIds: ["water-terrain", "forestry-ecology"], taxSaleEnabled: false, mapMode: "current",
          }],
        }));
      }, excludedIds);

      // Exercise the real map and compositor without sending any request to
      // a withheld provider. An attempted display/export request still fails
      // the test even though its synthetic response is fulfilled locally.
      await page.route("https://**/*", route => {
        const url = new URL(route.request().url());
        const selectors = url.searchParams.get("layers") ?? "";
        if (url.pathname.includes("FOR_WetAreasMapping_UT83") ||
          (url.pathname.includes("FOR_ProvLandscapeViewer_UT83") && /(?:^|[:,])(?:2|3)(?:,|$)/.test(selectors))) {
          forbiddenRequests.push(`${url.pathname}?layers=${selectors}`);
        }
        if (url.pathname.includes("FOR_ProvLandscapeViewer_UT83") && selectors === "show:7") {
          forestHeightRequests.push(url.href);
          if (route.request().resourceType() === "fetch" &&
            Number(url.searchParams.get("size")?.split(",")[0]) > 256) forestHeightPdfRequests.push(url.href);
        }
        if (url.origin === new URL(testInfo.project.use.baseURL!).origin) return route.continue();
        const headers = { "access-control-allow-origin": "*" };
        if (route.request().resourceType() === "image" || url.pathname.endsWith("/export")) {
          return route.fulfill({ contentType: "image/png", headers, body: pixel });
        }
        if (url.pathname.includes("/query") || url.pathname.endsWith(".geojson")) {
          return route.fulfill({ contentType: "application/json", headers, json: { type: "FeatureCollection", features: [] } });
        }
        return route.fulfill({ contentType: "text/css", headers, body: "" });
      });

      const entry = rhodena ? "/rhodena" : "./";
      await page.goto(`${entry}?basemap=osm&taxSale=off&layers=modern,${excludedIds.join(",")},forest-height&position=46.2,-60.5,14`);
      await expect(page).toHaveTitle(rhodena ? /Rhodena Wind/ : /NS Marks The Spot/);
      await expect(page.locator(".leaflet-container").first()).toBeVisible();
      await expect.poll(() => new URL(page.url()).searchParams.get("layers"))
        .toBe("modern,forest-height");
      if (width < 860) {
        await page.getByRole("button", { name: rhodena ? "Rhodena Wind — summary and layers" : "Search & layers", exact: true }).click();
      }
      await openCategory(page, /^Water & Terrain/, width);
      for (const name of excludedNames.slice(0, 2)) {
        await expect(page.getByRole("checkbox", { name, exact: true })).toHaveCount(0);
      }
      await openCategory(page, /^Forestry & Ecology/, width);
      await expect(page.getByRole("checkbox", { name: excludedNames[2], exact: true })).toHaveCount(0);
      const retained = page.getByRole("checkbox", { name: "Forest stand height", exact: true });
      await expect(retained).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "Leading forest species", exact: true })).toBeVisible();

      if (!rhodena) {
        await page.getByRole("combobox", { name: "Map setup", exact: true }).selectOption("legacy-forestry");
        await expect.poll(() => new URL(page.url()).searchParams.get("layers")).toBe("modern,forest-height");
        await expect(retained).toBeChecked();
      }
      for (const id of excludedIds) await expect(page.locator(`.map-layer-${id}`)).toHaveCount(0);
      await expect.poll(() => forestHeightRequests.length).toBeGreaterThan(0);

      // A real PDF download exercises export selection and image composition.
      await page.getByRole("button", { name: "Export map (PDF)", exact: true }).click();
      const continueButton = page.getByRole("button", { name: "Continue", exact: true });
      await expect(continueButton).toBeVisible();
      await continueButton.press("Enter");
      const downloadButton = page.getByRole("button", { name: "Download PDF", exact: true });
      await expect(downloadButton).toBeVisible();
      const [pdf] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
      expect(await pdf.failure()).toBeNull();
      expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
      expect(forestHeightPdfRequests.length).toBeGreaterThan(0);
      expect(forbiddenRequests).toEqual([]);
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
