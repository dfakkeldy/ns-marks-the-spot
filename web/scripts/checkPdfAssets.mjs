import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ASSET_DIRECTORIES,
  PDFJS_VERSION,
} from "./preparePdfAssets.mjs";

async function actualFiles(target) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name !== "asset-manifest.json") {
        files.push(relative(target, path).split(sep).join("/"));
      }
    }
  }
  for (const directory of ASSET_DIRECTORIES) {
    await visit(join(target, directory));
  }
  return files.sort();
}

export async function checkPdfAssets({ target }) {
  const exactTarget = resolve(target);
  const manifest = JSON.parse(
    await readFile(join(exactTarget, "asset-manifest.json"), "utf8"),
  );
  if (
    manifest.package !== "pdfjs-dist" ||
    manifest.version !== PDFJS_VERSION
  ) {
    throw new Error(`PDF.js asset version must be ${PDFJS_VERSION}`);
  }
  const listed = [];
  for (const file of manifest.files ?? []) {
    if (
      typeof file.path !== "string" ||
      file.path.includes("://") ||
      file.path.startsWith("//") ||
      file.path.startsWith("/") ||
      file.path.split("/").includes("..")
    ) {
      throw new Error(`invalid or remote PDF.js asset path: ${file.path}`);
    }
    const bytes = await readFile(join(exactTarget, file.path));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== file.sha256) {
      throw new Error(`PDF.js asset hash mismatch: ${file.path}`);
    }
    if (bytes.byteLength !== file.byteSize) {
      throw new Error(`PDF.js asset byte-size mismatch: ${file.path}`);
    }
    listed.push(file.path);
  }
  const actual = await actualFiles(exactTarget);
  if (JSON.stringify(actual) !== JSON.stringify([...listed].sort())) {
    throw new Error("PDF.js asset inventory does not match generated files");
  }
  return { filesChecked: listed.length };
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const result = await checkPdfAssets({
    target: resolve(
      scriptDirectory,
      `../public/vendor/pdfjs/${PDFJS_VERSION}`,
    ),
  });
  console.log(`checked ${result.filesChecked} PDF.js assets`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
