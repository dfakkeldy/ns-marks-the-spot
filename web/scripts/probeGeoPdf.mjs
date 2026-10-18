import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";

function scalar(value) {
  if (value instanceof PDFNumber) return value.asNumber();
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText();
  }
  if (value instanceof PDFName) return `/${value.decodeText()}`;
  return null;
}

function describe(value, depth = 0) {
  if (depth > 5 || value == null) return null;
  if (value instanceof PDFArray) {
    return Array.from({ length: value.size() }, (_, index) =>
      describe(value.lookup(index), depth + 1),
    );
  }
  if (value instanceof PDFDict) {
    return Object.fromEntries(
      value
        .keys()
        .map((key) => [
          key.decodeText(),
          describe(value.lookup(key), depth + 1),
        ]),
    );
  }
  return scalar(value);
}

async function probe(path) {
  const bytes = await readFile(path);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = pdf.getPage(0);
  const gdal = JSON.parse(
    execFileSync("gdalinfo", ["-json", path], { encoding: "utf8" }),
  );
  return {
    file: basename(path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    pageCount: pdf.getPageCount(),
    pageKeys: page.node
      .keys()
      .map((key) => key.decodeText())
      .sort(),
    vp: describe(page.node.lookup(PDFName.of("VP"))),
    lgiDict: describe(page.node.lookup(PDFName.of("LGIDict"))),
    gdal: {
      size: gdal.size,
      geoTransform: gdal.geoTransform ?? null,
      gcps: gdal.gcps ?? null,
      coordinateSystem: gdal.coordinateSystem?.wkt ?? null,
    },
  };
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  throw new Error("usage: node scripts/probeGeoPdf.mjs <file.pdf> [...]");
}
console.log(JSON.stringify(await Promise.all(paths.map(probe)), null, 2));
