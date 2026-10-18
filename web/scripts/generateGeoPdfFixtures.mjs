import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { degrees, PDFDocument, PDFHexString, PDFName, rgb } from "pdf-lib";

const outputDirectory = fileURLToPath(
  new URL("../src/test/fixtures/geopdf/", import.meta.url),
);
const source = fileURLToPath(
  new URL("../src/test/fixtures/utm20-8x6.tif", import.meta.url),
);
const fixedDate = new Date("2026-07-27T00:00:00.000Z");
const generatedBy = "web/scripts/generateGeoPdfFixtures.mjs";
const wgs84Wkt =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,' +
  '298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",' +
  '0.0174532925199433],AUTHORITY["EPSG","4326"]]';

function outputPath(file) {
  const path = resolve(outputDirectory, file);
  const pathWithinOutput = relative(outputDirectory, path);
  if (
    pathWithinOutput === "" ||
    pathWithinOutput.startsWith("..") ||
    resolve(dirname(path)) !== resolve(outputDirectory)
  ) {
    throw new Error(`refusing to write outside ${outputDirectory}: ${path}`);
  }
  return path;
}

function setFixedMetadata(document, title) {
  document.setTitle(title);
  document.setCreator(generatedBy);
  document.setProducer("pdf-lib 1.17.1");
  document.setCreationDate(fixedDate);
  document.setModificationDate(fixedDate);
}

function measureDictionary(document, { epsg, gpts, lpts }) {
  const gcs = {
    Type: "GEOGCS",
    EPSG: epsg,
    ...(epsg === 4326 ? { WKT: PDFHexString.fromText(wgs84Wkt) } : {}),
  };
  return document.context.obj({
    Type: "Measure",
    Subtype: "GEO",
    Bounds: [0, 0, 0, 1, 1, 1, 1, 0],
    LPTS: lpts,
    GPTS: gpts,
    GCS: gcs,
  });
}

function attachMeasure(document, page, registration) {
  const measure = measureDictionary(document, registration);
  const viewport = document.context.obj({
    Type: "Viewport",
    BBox: registration.bbox,
    Name: PDFHexString.fromText("Map frame"),
    Measure: measure,
  });
  page.node.set(PDFName.of("VP"), document.context.obj([viewport]));
}

function drawPage(page, colour) {
  const { width, height } = page.getSize();
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({
    x: 20,
    y: 20,
    width: Math.max(1, width - 40),
    height: Math.max(1, height - 40),
    borderColor: colour,
    borderWidth: 4,
  });
}

async function createDocument(file, configure) {
  const document = await PDFDocument.create();
  setFixedMetadata(document, file);
  await configure(document);
  const bytes = await document.save({ useObjectStreams: false });
  await writeFile(outputPath(file), bytes);
}

const standardRegistration = {
  bbox: [0, 0, 300, 200],
  epsg: 4326,
  lpts: [0, 0, 0, 1, 1, 1, 1, 0],
  gpts: [45, -64, 46, -64, 46, -63, 45, -63],
};

const conversions = [
  ["ns-utm20-iso.pdf", "ISO32000"],
  ["ns-utm20-lgidict.pdf", "OGC_BP"],
];

for (const [file, encoding] of conversions) {
  execFileSync(
    "gdal_translate",
    [
      "-of",
      "PDF",
      "-co",
      `GEO_ENCODING=${encoding}`,
      "-co",
      "DPI=72",
      source,
      join(outputDirectory, file),
    ],
    { stdio: "inherit" },
  );
  await rm(outputPath(`${file}.aux.xml`), { force: true });
}

await createDocument("plain.pdf", async (document) => {
  drawPage(document.addPage([300, 200]), rgb(0.1, 0.3, 0.6));
});

await createDocument("rotated-cropped.pdf", async (document) => {
  const page = document.addPage([300, 200]);
  drawPage(page, rgb(0.1, 0.6, 0.3));
  page.setCropBox(50, 40, 200, 100);
  page.setRotation(degrees(90));
  attachMeasure(document, page, {
    ...standardRegistration,
    bbox: [50, 40, 250, 140],
  });
});

await createDocument("registration-page-2.pdf", async (document) => {
  drawPage(document.addPage([300, 200]), rgb(0.6, 0.3, 0.1));
  const secondPage = document.addPage([300, 200]);
  drawPage(secondPage, rgb(0.3, 0.1, 0.6));
  attachMeasure(document, secondPage, standardRegistration);
});

await createDocument("unsupported-crs.pdf", async (document) => {
  const page = document.addPage([300, 200]);
  drawPage(page, rgb(0.6, 0.1, 0.1));
  attachMeasure(document, page, {
    ...standardRegistration,
    epsg: 999999,
  });
});

await createDocument("malformed-measure.pdf", async (document) => {
  const page = document.addPage([300, 200]);
  drawPage(page, rgb(0.5, 0.2, 0.5));
  attachMeasure(document, page, {
    ...standardRegistration,
    lpts: [0, 0, 0, 1, 1, 1],
    gpts: [45, -64, 46, -63],
  });
});

const plainBytes = await readFile(outputPath("plain.pdf"));
await writeFile(
  outputPath("corrupt.pdf"),
  plainBytes.subarray(0, Math.floor(plainBytes.byteLength / 2)),
);

const generatedFiles = [
  ...conversions.map(([file]) => file),
  "plain.pdf",
  "rotated-cropped.pdf",
  "registration-page-2.pdf",
  "unsupported-crs.pdf",
  "malformed-measure.pdf",
  "corrupt.pdf",
].sort();

const receipt = await Promise.all(
  generatedFiles.map(async (file) => {
    const bytes = await readFile(outputPath(file));
    return {
      file,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength,
    };
  }),
);

console.log(JSON.stringify(receipt, null, 2));
