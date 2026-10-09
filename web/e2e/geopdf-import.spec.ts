import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// A repository-owned GeoPDF fixture whose embedded registration places it
// automatically once PDF.js has rendered its page. Rendering it reaches the
// upsert calls in PDF.js's page-side display layer.
const geoPdf = readFileSync(
  new URL("../src/test/fixtures/geopdf/ns-utm20-iso.pdf", import.meta.url),
);

/**
 * A 64 pt page filled with a tiling pattern: blue 4 pt squares every 8 pt,
 * the way maps hatch areas. Resolving the pattern reaches the upsert calls in
 * the PDF.js worker, whose failure is silent: the hatch is left out.
 */
function hatchedPdf(): Buffer {
  const stream = (dict: string, data: string) =>
    `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 64 64] " +
      "/Resources << /Pattern << /Hatch 5 0 R >> >> /Contents 4 0 R >>",
    stream("", "/Pattern cs /Hatch scn 0 0 64 64 re f"),
    stream(
      "/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 " +
        "/BBox [0 0 8 8] /XStep 8 /YStep 8 /Resources << >>",
      "0 0 1 rg 0 0 4 4 re f",
    ),
  ];
  let pdf = "%PDF-1.7\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

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

async function importPdf(page: Page, name: string, buffer: Buffer) {
  await page
    .getByLabel("Add a map file", { exact: true })
    .setInputFiles({ name, mimeType: "application/pdf", buffer });
}

/** Share of the rendered preview drawn in the hatch's blue. */
async function hatchCoverage(page: Page) {
  const preview = page
    .getByRole("region", { name: /^Georeferencing hatched/ })
    .locator("img")
    .first();
  return preview.evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    let blue = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] < 60 && data[index + 1] < 60 && data[index + 2] > 200) {
        blue += 1;
      }
    }
    return blue / (size * size);
  });
}

async function importBothPdfs(page: Page) {
  await page.getByRole("button", { name: /^My Maps/ }).click();
  // Users see the outcome line: "<file> added" or "<file>: <reason>".
  const outcome = page.locator(".user-map-outcomes li");

  await importPdf(page, "ns-utm20-iso.pdf", geoPdf);
  await expect(outcome).toHaveText(
    "ns-utm20-iso.pdf added — Page 1 imported. " +
      "Placed from embedded GeoPDF coordinates.",
    { timeout: 20_000 },
  );
  await expect(
    page.getByRole("checkbox", { name: "ns-utm20-iso", exact: true }),
  ).toBeChecked();

  await importPdf(page, "hatched.pdf", hatchedPdf());
  await expect(outcome).toHaveText(/^hatched\.pdf added — Page 1 imported\./, {
    timeout: 20_000,
  });
  // A quarter of each 8 pt tile is blue; a blank preview means the worker
  // dropped the pattern.
  expect(await hatchCoverage(page)).toBeCloseTo(0.25, 1);
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
    await importBothPdfs(page);
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
  await importBothPdfs(page);
});
