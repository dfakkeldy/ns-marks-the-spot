import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copies the datasets the iOS app bundles out of the web tree into a repo-root
 * `SharedData/` directory, with a SHA-256 manifest.
 *
 * The two surfaces read the same tax-sale numbers, so the numbers have to come
 * from the same bytes. Re-keying them by hand into Swift is how 481 becomes 480
 * in one place and nobody notices for a release.
 *
 * The manifest is a bundling allowlist as much as a checksum record: the Swift
 * side bundles exactly what the manifest lists and re-hashes it, so a file that
 * drifts, or one that appears in SharedData/ without going through this script,
 * fails the build rather than shipping.
 */

// An explicit list, never a directory glob. This constant is the boundary that
// keeps restricted content out: zoning, NSPRD parcels and anything carrying
// owner names are live-query-only and must never reach a bundled file. A glob
// would silently adopt whatever lands in web/src/data next.
export const SHARED_DATASETS = [
  "annapolisTaxSale.snapshot.json",
  "cbrmTaxSale.snapshot.json",
  "cbrmTaxSaleResults.snapshot.json",
  "cumberlandTaxSale.snapshot.json",
  "halifaxTaxSale.snapshot.json",
  "historicalMatchExceptions.json",
  "historicalSourceLedger.json",
  "historicalTaxSales.json",
  "invernessHydroPotential.json",
  "invernessTaxSale.snapshot.json",
  "middletonTaxSale.snapshot.json",
  "richmondTaxSale.snapshot.json",
  "victoriaTaxSale.snapshot.json",
];

export const MANIFEST_NAME = "manifest.json";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SOURCE = resolve(scriptDirectory, "..", "src", "data");
export const DEFAULT_TARGET = resolve(scriptDirectory, "..", "..", "SharedData");

/**
 * Where the Swift package keeps its copy of the subset it bundles.
 *
 * A second copy exists because SwiftPM bundles resources from inside the
 * package, and it is a second place the bytes can fall behind.
 */
export const DEFAULT_BUNDLE = resolve(
  scriptDirectory,
  "..",
  "..",
  "NSMarksCore",
  "Sources",
  "NSDataServices",
  "Resources",
  "SharedData",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Rejects anything that could escape the target directory or collide with the
 * manifest. Mirrors the guards in checkPdfAssets.mjs.
 */
function assertSafeName(name) {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name === MANIFEST_NAME ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("://") ||
    name.includes("..")
  ) {
    throw new Error(`Unsafe shared dataset name: ${JSON.stringify(name)}`);
  }
}

export async function exportSharedData({
  source = DEFAULT_SOURCE,
  target = DEFAULT_TARGET,
} = {}) {
  const exactTarget = resolve(target);
  await rm(exactTarget, { recursive: true, force: true });
  await mkdir(exactTarget, { recursive: true });

  const files = [];
  // Sorted so the manifest is byte-stable across runs and platforms; an
  // unordered manifest would produce a diff on every regeneration.
  for (const name of [...SHARED_DATASETS].sort()) {
    assertSafeName(name);
    const bytes = await readFile(join(source, name));
    // Parsing is a validity gate, not a transform: the copy is byte-identical,
    // so the hash the Swift side checks is the hash of the file the web reads.
    JSON.parse(bytes.toString("utf8"));
    await writeFile(join(exactTarget, name), bytes);
    files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
  }

  // Deliberately no generatedAt timestamp: the manifest must be reproducible so
  // that a rerun with unchanged inputs produces no diff, which is what lets CI
  // treat any diff as real drift.
  const manifest = { version: 1, files };
  await writeFile(
    join(exactTarget, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/**
 * Verifies an existing SharedData/ against its own manifest, against the
 * allowlist, and against the web's own copy of each dataset.
 *
 * The manifest check catches a corrupted copy and a stray file added by hand.
 * It cannot catch the failure that actually happened: a snapshot refreshed in
 * `web/src/data` without a re-export, which leaves the export and the app
 * bundle internally consistent and months behind the browser. The app then
 * carries a withdrawn parcel as a current tax-sale listing, with its own hash
 * agreeing. So the source bytes are compared too.
 */
export async function verifySharedData({
  source = DEFAULT_SOURCE,
  target = DEFAULT_TARGET,
} = {}) {
  const exactSource = resolve(source);
  const exactTarget = resolve(target);
  const manifest = JSON.parse(
    await readFile(join(exactTarget, MANIFEST_NAME), "utf8"),
  );
  const problems = [];

  const listed = new Set();
  for (const entry of manifest.files ?? []) {
    assertSafeName(entry.path);
    listed.add(entry.path);
    if (!SHARED_DATASETS.includes(entry.path)) {
      problems.push(`${entry.path} is not an allowed shared dataset`);
      continue;
    }
    const bytes = await readFile(join(exactTarget, entry.path));
    if (sha256(bytes) !== entry.sha256) {
      problems.push(`${entry.path} does not match its manifest hash`);
    }
    if (bytes.length !== entry.bytes) {
      problems.push(`${entry.path} does not match its manifest size`);
    }
    const sourceBytes = await readFile(join(exactSource, entry.path)).catch(
      () => null,
    );
    if (sourceBytes === null) {
      problems.push(`${entry.path} is no longer in the web's data directory`);
    } else if (sha256(sourceBytes) !== sha256(bytes)) {
      problems.push(
        `${entry.path} has drifted from web/src/data; run npm run export:shared-data`,
      );
    }
  }

  for (const name of SHARED_DATASETS) {
    if (!listed.has(name)) {
      problems.push(`${name} is missing from the manifest`);
    }
  }

  for (const entry of await readdir(exactTarget)) {
    if (entry !== MANIFEST_NAME && !listed.has(entry)) {
      problems.push(`${entry} is present but not listed in the manifest`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`SharedData verification failed:\n- ${problems.join("\n- ")}`);
  }
  return manifest;
}

/**
 * Checks the Swift package's copy against the export it was taken from.
 *
 * The app bundles a subset, so a file the package does not carry is not a
 * problem; a file it carries with different bytes is. The manifest must match
 * exactly, because the Swift side re-hashes its bundled bytes against its own
 * copy of it and would otherwise agree with itself while quoting last month's
 * numbers.
 */
export async function verifyBundledCopy({
  target = DEFAULT_TARGET,
  bundle = DEFAULT_BUNDLE,
} = {}) {
  const exactTarget = resolve(target);
  const exactBundle = resolve(bundle);
  const problems = [];

  for (const name of await readdir(exactBundle)) {
    if (name !== MANIFEST_NAME) assertSafeName(name);
    const exported = await readFile(join(exactTarget, name)).catch(() => null);
    if (exported === null) {
      problems.push(`${name} is bundled but not in the export`);
      continue;
    }
    const bundled = await readFile(join(exactBundle, name));
    if (sha256(bundled) !== sha256(exported)) {
      problems.push(
        `${name} in NSMarksCore has drifted from the export; copy it across`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Bundled SharedData verification failed:\n- ${problems.join("\n- ")}`);
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const verifyOnly = process.argv.includes("--verify");
  const run = verifyOnly
    ? async () => {
        const manifest = await verifySharedData();
        await verifyBundledCopy();
        return manifest;
      }
    : exportSharedData;
  run()
    .then((manifest) => {
      const action = verifyOnly ? "verified" : "exported";
      console.log(`SharedData ${action}: ${manifest.files.length} files`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
