import { expect, test } from "@playwright/test";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const counties = ["Inverness", "Victoria", "Richmond", "Cape Breton"];

for (const width of [390, 1440]) {
  test(`Church subsection preserves layers and keyboard access at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    // Exercise real controls with deterministic transport, without querying
    // external map services or treating these pixels as geographic evidence.
    await page.route("https://**/*", (route) => {
      if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/png", body: pixel });
      if (route.request().resourceType() === "stylesheet") return route.fulfill({ contentType: "text/css", body: "" });
      return route.fulfill({ json: { type: "FeatureCollection", features: [] } });
    });
    const openHistory = async () => {
      if (width < 860) await page.getByRole("button", { name: "Search & layers", exact: true }).click();
      await page.getByRole("button", { name: /^Historical Maps/ }).click();
    };
    await page.goto("/?basemap=osm&taxSale=off&layers=fletcher&position=46.095,-61.35,14");
    await expect(page).toHaveTitle(/NS Marks The Spot/);
    await openHistory();
    const summary = page.locator("summary").filter({ hasText: /^A\.F\. Church county maps/ });
    const group = page.locator("details").filter({ has: summary });
    const fletcher = page.getByRole("checkbox", { name: "Fletcher historical map", exact: true });
    await expect(fletcher).toBeChecked();
    await expect(group).not.toHaveAttribute("open");
    await expect(summary).toContainText("4 maps · web tiles pending");
    await expect(group.getByText("Church — Inverness County", { exact: true })).toBeHidden();
    // Leaflet normalizes the initial centre after sizing the map. Wait across
    // the 500ms share-URL debounce before checking disclosure state isolation.
    let previousUrl = "";
    let stableSamples = 0;
    await expect.poll(() => {
      const url = page.url();
      stableSamples = url === previousUrl ? stableSamples + 1 : 0;
      previousUrl = url;
      return stableSamples;
    }, { intervals: [600] }).toBeGreaterThanOrEqual(2);
    const initialUrl = page.url();
    const initialOpacity = await page.locator("#fletcher-opacity").inputValue();
    await summary.scrollIntoViewIfNeeded();
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`church-collapsed-${width}.png`) });

    await summary.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(summary).toBeFocused();
    const outline = await summary.evaluate((element) => {
      const style = getComputedStyle(element);
      return { visible: element.matches(":focus-visible"), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.visible).toBe(true);
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThan(0);
    await summary.press("Enter");
    await expect(group).toHaveAttribute("open");
    for (const county of counties) await expect(group.getByText(`Church — ${county} County`, { exact: true })).toBeVisible();
    await expect(group.getByRole("checkbox")).toHaveCount(0);
    await expect(group.getByRole("link", { name: "David Rumsey Map Collection" })).toHaveAttribute("href", /davidrumsey\.com/);
    await expect(group).toContainText("Stanford University Libraries");
    await expect(group).toContainText("Web tiles are not produced yet");
    await expect(page).toHaveURL(initialUrl);
    await expect(fletcher).toBeChecked();
    await expect(page.locator("#fletcher-opacity")).toHaveValue(initialOpacity);
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`church-expanded-${width}.png`) });
    const sourceLink = group.getByRole("link", { name: "David Rumsey Map Collection" });
    await sourceLink.scrollIntoViewIfNeeded();
    await expect(sourceLink).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`church-sources-${width}.png`) });

    const inverness = group.locator(".layer-row").filter({ hasText: "Church — Inverness County" });
    await inverness.locator("summary").click();
    await expect(inverness.getByText("Coverage: Inverness County, Cape Breton Island", { exact: true })).toBeVisible();
    await expect(group).toHaveAttribute("open");
    await summary.press("Space");
    await expect(group).not.toHaveAttribute("open");
    await expect(page).toHaveURL(initialUrl);
    await fletcher.press("Space");
    await expect(fletcher).not.toBeChecked();
    await expect.poll(() => new URL(page.url()).searchParams.get("layers")?.split(",")).not.toContain("fletcher");
    await fletcher.press("Space");
    await expect(fletcher).toBeChecked();
    await expect(page).toHaveURL(initialUrl);
    await summary.click();
    await expect(group).toHaveAttribute("open");
    await page.reload();
    await openHistory();
    await expect(group).not.toHaveAttribute("open");
    await expect(fletcher).toBeChecked();
    await expect(page.locator("#fletcher-opacity")).toHaveValue(initialOpacity);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
