import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PDFJS_VERSION = "6.1.200";
export const ASSET_DIRECTORIES = [
  "cmaps",
  "standard_fonts",
  "iccs",
  "wasm",
];

async function inventory(target) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`refusing symbolic link in PDF.js assets: ${path}`);
      }
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const bytes = await readFile(path);
        files.push({
          path: relative(target, path).split(sep).join("/"),
          byteSize: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
  for (const directory of ASSET_DIRECTORIES) {
    await visit(join(target, directory));
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function preparePdfAssets({ source, target }) {
  const packageJson = JSON.parse(
    await readFile(join(source, "package.json"), "utf8"),
  );
  if (
    packageJson.name !== "pdfjs-dist" ||
    packageJson.version !== PDFJS_VERSION
  ) {
    throw new Error(
      `expected pdfjs-dist ${PDFJS_VERSION}, found ` +
      `${packageJson.name ?? "unknown"} ${packageJson.version ?? "unknown"}`,
    );
  }
  for (const directory of ASSET_DIRECTORIES) {
    const info = await stat(join(source, directory));
    if (!info.isDirectory()) {
      throw new Error(`missing PDF.js asset directory: ${directory}`);
    }
  }

  const exactTarget = resolve(target);
  await rm(exactTarget, { recursive: true, force: true });
  await mkdir(exactTarget, { recursive: true });
  for (const directory of ASSET_DIRECTORIES) {
    await cp(join(source, directory), join(exactTarget, directory), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  const manifest = {
    package: "pdfjs-dist",
    version: PDFJS_VERSION,
    files: await inventory(exactTarget),
  };
  await writeFile(
    join(exactTarget, "asset-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  await preparePdfAssets({
    source: resolve(scriptDirectory, "../node_modules/pdfjs-dist"),
    target: resolve(
      scriptDirectory,
      `../public/vendor/pdfjs/${PDFJS_VERSION}`,
    ),
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
