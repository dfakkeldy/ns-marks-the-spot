import { expect, test, type Locator, type Page } from "@playwright/test";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABmJLR0QA/wD/AP+gvaeTAAAAsUlEQVR4nO3XMQrFMAzA0N9P75oz5ZK5Qrt36FbeEGk0GITw4mOtdf025q8FNAXQAprzORhjvC7MOT+TEWx/AQXQApoCaAFNAbSA5ugX2JwCaAFNAbSApgBaQFMALaApgBbQFEALaAqgBTQF0AKaAmgBTQG0gKYAWkBTAC2gKYAW0BRAC2gKoAU0BdACmgJoAU0BtICmAFpAUwAtoCmAFtAUQAtoCqAFNAXQApoCaAHNDbZrCxPxbzx1AAAAAElFTkSuQmCC",
  "base64",
);

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // Deterministic map imagery; the checks concern rendered controls and page
  // layout, not availability of the external tile server.
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
});

test.afterEach(async ({ page }) => {
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(runtimeErrors.get(page)).toEqual([]);
});

async function keyboardFocus(page: Page, control: Locator) {
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
  const outline = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return { visible: element.matches(":focus-visible"), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.visible).toBe(true);
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThan(0);
}

for (const width of [390, 1440]) {
  test(`road names and route shields stay above contrast strokes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    });
    await page.route("**/BASE_NSTDB_10k_Roads_UT83/MapServer/export?**", (route) =>
      route.fulfill({ contentType: "image/png", body: png }),
    );
    await page.goto("/?basemap=osm&taxSale=off&layers=roads&position=45.81355,-61.47775,16");
    const roadLayers = page.locator(".map-layer-roads");
    const checkOrder = async () => {
      await expect(roadLayers).toHaveCount(2);
      const passes = await roadLayers.evaluateAll((elements) => elements.map((element) => ({
        contrast: new URL(element.querySelector("img")!.src).searchParams.has("dynamicLayers"),
        zIndex: Number(getComputedStyle(element).zIndex),
      })));
      expect(passes.find(({ contrast }) => contrast)!.zIndex).toBeLessThan(
        passes.find(({ contrast }) => !contrast)!.zIndex,
      );
    };
    await checkOrder();
    if (width < 860) await page.getByRole("button", { name: "Search & layers", exact: true }).click();
    await page.getByRole("button", { name: /^Roads & Places/ }).click();
    const toggle = page.getByRole("checkbox", { name: "Roads, trails & culverts", exact: true });
    await toggle.press("Space");
    await expect(toggle).not.toBeChecked();
    await expect(roadLayers).toHaveCount(0);
    await toggle.press("Space");
    await expect(toggle).toBeChecked();
    await checkOrder();
  });
}

test("theme controls expose keyboard focus and open the manager", async ({ page }) => {
  await page.goto("/?basemap=osm");
  await expect(page).toHaveTitle(/NS Marks The Spot/);
  await keyboardFocus(page, page.getByRole("combobox", { name: "Map setup", exact: true }));
  const manage = page.getByRole("button", { name: "Manage themes", exact: true });
  await keyboardFocus(page, manage);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await keyboardFocus(page, dialog.getByRole("button", { name: "Cancel", exact: true }));
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
});

test("phone categories keep touch controls and attribution reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?basemap=osm");
  await page.getByRole("button", { name: "Search & layers", exact: true }).click();
  const setup = page.getByRole("combobox", { name: "Map setup", exact: true });
  const myMaps = page.getByRole("button", { name: /^My Maps/ });
  for (const control of [setup, myMaps]) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await expect(control).toBeInViewport();
  }
  await myMaps.click();
  const back = page.getByRole("button", { name: "Back to categories", exact: true });
  expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await page.getByRole("button", { name: "Data & licences", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByText("Provincial-first Atlas sources", { exact: true }).click();
  const closeSources = page.getByRole("dialog").getByRole("button", { name: "Close", exact: true });
  await closeSources.scrollIntoViewIfNeeded();
  await expect(closeSources).toBeInViewport();
  await closeSources.click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

for (const width of [390, 1024]) {
  test(`georeferencing leaves the map accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?basemap=osm");
    const open = page.getByRole("button", { name: "Search & layers", exact: true });
    if (width < 860) await open.click();
    await page.getByRole("button", { name: /^My Maps/ }).click();
    await page.getByLabel("Add a map file", { exact: true }).setInputFiles({ name: "scan.png", mimeType: "image/png", buffer: png });
    const panel = page.getByRole("region", { name: /^Georeferencing scan/ });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    await page.getByRole("tab", { name: "Map", exact: true }).click();
    await expect(panel).toBeHidden();
    const back = page.getByRole("button", { name: "Back to scan", exact: true });
    await expect(back).toBeInViewport();
    // A map click must reach the map, rather than an invisible scan panel.
    await page.locator(".map-canvas .leaflet-container").click({ position: { x: Math.floor(width / 2), y: 150 } });
    await back.click();
    await expect(panel).toBeVisible();
  });
}

for (const template of ["research", "field"]) {
  test(`${template} print stays within Letter bounds with visible attribution`, async ({ page }) => {
    await page.goto("/e2e/print.html");
    await page.getByLabel("Document template").selectOption(template);
    if (template === "research") await page.getByLabel("Include evidence appendix").uncheck();
    await expect(page.getByRole("button", { name: "Print / Save PDF", exact: true })).toBeEnabled();
    await page.emulateMedia({ media: "print" });
    const sheet = page.locator(template === "field" ? ".print-field-page" : ".print-research-summary");
    await expect(sheet).toBeVisible();
    const size = await sheet.boundingBox();
    const maxWidth = (template === "field" ? 279.4 : 215.9) * 96 / 25.4;
    const maxHeight = (template === "field" ? 215.9 : 279.4) * 96 / 25.4;
    expect(size?.width).toBeLessThanOrEqual(maxWidth);
    expect(size?.height).toBeLessThanOrEqual(maxHeight);
    const overflow = await sheet.evaluate((element) => ({
      x: element.scrollWidth - element.clientWidth,
      y: element.scrollHeight - element.clientHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
    const support = sheet.locator(template === "field" ? ".print-field-support" : ".print-research-support");
    const supportOverflow = await support.evaluate((element) => element.scrollHeight - element.clientHeight);
    expect(supportOverflow).toBeLessThanOrEqual(1);
    await expect(sheet.getByText(/OpenStreetMap contributors/).first()).toBeVisible();
    await expect(sheet.getByText(/not a survey/i).first()).toBeVisible();
    await expect(page.locator(".print-preview-backdrop")).not.toHaveCSS("position", "fixed");
  });
}
