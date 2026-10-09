import { expect, test } from "@playwright/test";
import { createCanvas } from "canvas";

const pixel = createCanvas(256, 256).toBuffer("image/png");
const excludedIds = ["wam-relative-wetness", "wam-predicted-flow", "forest-treatments"];
const excludedNames = ["WAM relative wetness", "WAM predicted flow", "Recorded forest treatments"];

function contrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const width of [390, 1440]) {
  for (const rhodena of [false, true]) {
    test(`Unavailable layers stay informational on ${rhodena ? "Rhodena" : "the map"} at ${width}px`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      const excludedRequests: string[] = [];
      const retainedRequests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      // Acknowledgement must never enable a hard-excluded source.
      await page.addInitScript(() => localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted"));
      // Keep provider transport deterministic; these are control and request-
      // boundary checks, not geographic evidence or new source clearance.
      await page.route("https://**/*", route => {
        const url = new URL(route.request().url());
        const selectors = url.searchParams.get("layers") ?? "";
        if (url.pathname.includes("FOR_WetAreasMapping_UT83") ||
          (url.pathname.includes("FOR_ProvLandscapeViewer_UT83") && /(?:^|[:,])(?:2|3)(?:,|$)/.test(selectors))) {
          excludedRequests.push(url.href);
        }
        if (url.pathname.includes("FOR_ProvLandscapeViewer_UT83") && selectors === "show:7") retainedRequests.push(url.href);
        const headers = { "access-control-allow-origin": "*" };
        if (route.request().resourceType() === "image" || url.pathname.endsWith(".png") || url.pathname.endsWith("/export")) {
          return route.fulfill({ contentType: "image/png", headers, body: pixel });
        }
        if (route.request().resourceType() === "stylesheet") return route.fulfill({ contentType: "text/css", headers, body: "" });
        return route.fulfill({ headers, json: { type: "FeatureCollection", features: [] } });
      });
      await page.goto(`${rhodena ? "/rhodena" : "/"}?basemap=osm&taxSale=off&layers=modern,${excludedIds.join(",")},forest-height&position=46.2,-60.5,14`);
      await expect(page).toHaveTitle(rhodena ? /Rhodena Wind/ : /NS Marks The Spot/);
      await expect(page.locator(".leaflet-container").first()).toBeVisible();
      await expect.poll(() => new URL(page.url()).searchParams.get("layers")).toBe("modern,forest-height");
      const openControls = async () => {
        if (width < 860) await page.getByRole("button", { name: rhodena ? "Rhodena Wind — summary and layers" : "Search & layers", exact: true }).click();
      };
      await openControls();
      const group = page.locator("details.unavailable-layers");
      const summary = group.locator("summary");
      await expect(group).not.toHaveAttribute("open");
      await expect(group.getByText(excludedNames[0], { exact: true })).toBeHidden();
      await summary.scrollIntoViewIfNeeded();
      await expect(summary).toBeInViewport();
      expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: testInfo.outputPath(`unavailable-collapsed-${width}.png`) });

      // Wait across the share-URL debounce before checking disclosure isolation.
      let previousUrl = "";
      let stableSamples = 0;
      await expect.poll(() => {
        const url = page.url();
        stableSamples = url === previousUrl ? stableSamples + 1 : 0;
        previousUrl = url;
        return stableSamples;
      }, { intervals: [600] }).toBeGreaterThanOrEqual(2);
      const shareState = page.url();
      await summary.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(summary).toBeFocused();
      const focus = await summary.evaluate(element => ({
        visible: element.matches(":focus-visible"),
        style: getComputedStyle(element).outlineStyle,
        width: parseFloat(getComputedStyle(element).outlineWidth),
      }));
      expect(focus.visible).toBe(true);
      expect(focus.style).not.toBe("none");
      expect(focus.width).toBeGreaterThan(0);
      await summary.press("Enter");
      await expect(group).toHaveAttribute("open");
      await expect(group.getByRole("listitem")).toHaveCount(3);
      for (const name of excludedNames) {
        const row = group.getByRole("listitem").filter({ hasText: name });
        await expect(row).toHaveAttribute("aria-disabled", "true");
        await expect(row.getByText(name, { exact: true })).toBeVisible();
        await row.getByText(name, { exact: true }).click();
        await expect(page.getByRole("checkbox", { name, exact: true })).toHaveCount(0);
      }
      await expect(group.getByText("Data-quality concerns", { exact: true })).toHaveCount(2);
      await expect(group.getByText("Permission unavailable", { exact: true })).toBeVisible();
      await expect(group.locator("input, button, select, textarea, a, [role=checkbox], [role=switch]")).toHaveCount(0);
      await expect(page).toHaveURL(shareState);
      await expect.poll(() => retainedRequests.length).toBeGreaterThan(0);
      for (const id of excludedIds) await expect(page.locator(`.map-layer-${id}`)).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("ns-marks-the-spot:province-license:v1"))).toBe("accepted");
      await group.evaluate(element => element.scrollIntoView({ block: "end" }));
      await page.screenshot({ path: testInfo.outputPath(`unavailable-expanded-${width}.png`) });

      const verifyTextContrast = async () => {
        const colors = await group.locator("li strong, li span, li p").evaluateAll(elements => elements.map(element => ({
          foreground: getComputedStyle(element).color,
          background: getComputedStyle(element.closest("li")!).backgroundColor,
        })));
        for (const { foreground, background } of colors) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      };
      await verifyTextContrast();
      if (width === 1440) {
        await page.getByRole("combobox", { name: "Interface appearance", exact: true }).selectOption("dark");
        await verifyTextContrast();
        await group.evaluate(element => element.scrollIntoView({ block: "end" }));
        await page.screenshot({ path: testInfo.outputPath(`unavailable-dark-${width}.png`) });
      }
      await summary.press("Space");
      await expect(group).not.toHaveAttribute("open");
      await expect(page).toHaveURL(shareState);
      await summary.click();
      await expect(group).toHaveAttribute("open");
      await page.reload();
      await openControls();
      await expect(group).not.toHaveAttribute("open");
      expect(excludedRequests).toEqual([]);
      expect(errors).toEqual([]);
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
