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
  "historicalMatchExceptions.json",
  "historicalSourceLedger.json",
  "historicalTaxSales.json",
  "invernessHydroPotential.json",
  "invernessTaxSale.snapshot.json",
  "middletonTaxSale.snapshot.json",
  "richmondTaxSale.snapshot.json",
];

export const MANIFEST_NAME = "manifest.json";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SOURCE = resolve(scriptDirectory, "..", "src", "data");
export const DEFAULT_TARGET = resolve(scriptDirectory, "..", "..", "SharedData");

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
 * Verifies an existing SharedData/ against its own manifest and against the
 * allowlist — catching both a corrupted copy and a stray file added by hand.
 */
export async function verifySharedData({ target = DEFAULT_TARGET } = {}) {
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

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const verifyOnly = process.argv.includes("--verify");
  const run = verifyOnly ? verifySharedData : exportSharedData;
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
