import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// A repository-owned GeoPDF fixture whose embedded registration places it
// automatically once PDF.js has rendered its page.
const geoPdf = readFileSync(
  new URL("../src/test/fixtures/geopdf/ns-utm20-iso.pdf", import.meta.url),
);

/**
 * Reports whether the engine itself provides the Map/WeakMap upsert methods,
 * in a page realm and in a worker. A fresh iframe realm and a fresh worker
 * show the engine's built-ins, unaffected by anything the app installs.
 */
async function engineUpsertSupport(page: Page) {
  return page.evaluate(async () => {
    const probe = (scope: typeof globalThis) =>
      [
        scope.Map.prototype,
        scope.WeakMap.prototype,
      ].every(
        (prototype) =>
          "getOrInsertComputed" in prototype && "getOrInsert" in prototype,
      );
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const inPage = probe(frame.contentWindow as unknown as typeof globalThis);
    frame.remove();
    const source = `postMessage((${probe.toString()})(globalThis));`;
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    const worker = new Worker(url);
    const inWorker = await new Promise<boolean | string>((resolve) => {
      worker.onmessage = ({ data }) => resolve(data as boolean);
      worker.onerror = () => resolve("worker failed");
    });
    worker.terminate();
    URL.revokeObjectURL(url);
    return { page: inPage, worker: inWorker };
  });
}

async function importGeoPdf(page: Page) {
  await page.getByRole("button", { name: /^My Maps/ }).click();
  await page
    .getByLabel("Add a map file", { exact: true })
    .setInputFiles({
      name: "ns-utm20-iso.pdf",
      mimeType: "application/pdf",
      buffer: geoPdf,
    });
  // Users see the outcome line: "<file> added" or "<file>: <reason>".
  await expect(page.locator(".user-map-outcomes li")).toHaveText(
    "ns-utm20-iso.pdf added — Page 1 imported. " +
      "Placed from embedded GeoPDF coordinates.",
    { timeout: 20_000 },
  );
  await expect(
    page.getByRole("checkbox", { name: "ns-utm20-iso", exact: true }),
  ).toBeChecked();
}

test("GeoPDF import works without Map upsert methods", async ({
  playwright,
  baseURL,
}) => {
  // Chromium 141 and other engines predating the upsert proposal lack
  // Map.prototype.getOrInsertComputed. This V8 flag removes the methods from
  // the page and every worker, reproducing those engines in current Chromium.
  const browser = await playwright.chromium.launch({
    args: ["--js-flags=--no-js-upsert"],
  });
  try {
    const page = await browser.newPage({
      baseURL,
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto("/?basemap=osm");
    expect(await engineUpsertSupport(page)).toEqual({
      page: false,
      worker: false,
    });
    await importGeoPdf(page);
  } finally {
    await browser.close();
  }
});

test("GeoPDF import works with native Map upsert methods", async ({
  page,
}) => {
  await page.goto("/?basemap=osm");
  expect(await engineUpsertSupport(page)).toEqual({
    page: true,
    worker: true,
  });
  await importGeoPdf(page);
});
