import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  MANIFEST_NAME,
  SHARED_DATASETS,
  exportSharedData,
  verifyBundledCopy,
  verifySharedData,
} from "./exportSharedData.mjs";

async function fakeSource() {
  const root = await mkdtemp(join(tmpdir(), "shared-data-source-"));
  for (const [index, name] of SHARED_DATASETS.entries()) {
    await writeFile(join(root, name), JSON.stringify({ name, index }));
  }
  // Content that must never be exported, sitting right next to the allowlist.
  await writeFile(join(root, "zoningParcels.json"), JSON.stringify({ pid: 1 }));
  return root;
}

async function freshTarget() {
  const parent = await mkdtemp(join(tmpdir(), "shared-data-target-"));
  return join(parent, "SharedData");
}

test("exports exactly the allowlisted datasets with hashes", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  const manifest = await exportSharedData({ source, target });

  assert.equal(manifest.files.length, SHARED_DATASETS.length);
  const exported = (await readdir(target)).sort();
  assert.deepEqual(
    exported,
    [MANIFEST_NAME, ...SHARED_DATASETS].sort(),
    "only allowlisted datasets and the manifest are written",
  );
  for (const entry of manifest.files) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.ok(entry.bytes > 0);
  }
});

test("copies bytes identically so hashes describe the file the web reads", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });

  for (const name of SHARED_DATASETS) {
    assert.deepEqual(
      await readFile(join(target, name)),
      await readFile(join(source, name)),
      `${name} must be byte-identical to its source`,
    );
  }
});

test("is reproducible — a rerun produces an identical manifest", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  const first = await readFile(join(target, MANIFEST_NAME), "utf8");
  await exportSharedData({ source, target });
  const second = await readFile(join(target, MANIFEST_NAME), "utf8");
  assert.equal(first, second, "no timestamp or ordering churn");
});

test("lists files in sorted order", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  const manifest = await exportSharedData({ source, target });
  const paths = manifest.files.map((file) => file.path);
  assert.deepEqual(paths, [...paths].sort());
});

test("removes stale files left from a previous export", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  await writeFile(join(target, "leftover.json"), "{}");
  await exportSharedData({ source, target });
  assert.ok(!(await readdir(target)).includes("leftover.json"));
});

test("verifies a freshly exported directory", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  await verifySharedData({ source, target });
});

test("rejects an export left behind by a refreshed source dataset", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  // The refresh scripts rewrite these in place. Nothing else about the export
  // changes, so its own manifest keeps agreeing with itself.
  await writeFile(
    join(source, SHARED_DATASETS[0]),
    JSON.stringify({ refreshed: true }),
  );
  await assert.rejects(
    () => verifySharedData({ source, target }),
    /has drifted from web\/src\/data/,
  );
});

test("rejects a dataset whose bytes changed after export", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  await writeFile(join(target, SHARED_DATASETS[0]), JSON.stringify({ tampered: true }));
  await assert.rejects(
    () => verifySharedData({ source, target }),
    /does not match its manifest hash/,
  );
});

test("rejects an unlisted file dropped into the directory", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  await writeFile(join(target, "ownerNames.json"), "{}");
  await assert.rejects(
    () => verifySharedData({ source, target }),
    /present but not listed in the manifest/,
  );
});

test("rejects a manifest that lists a dataset outside the allowlist", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  await writeFile(join(target, "nsprdParcels.json"), "{}");
  const manifest = JSON.parse(await readFile(join(target, MANIFEST_NAME), "utf8"));
  manifest.files.push({
    path: "nsprdParcels.json",
    bytes: 2,
    sha256: "0".repeat(64),
  });
  await writeFile(join(target, MANIFEST_NAME), JSON.stringify(manifest));
  await assert.rejects(
    () => verifySharedData({ source, target }),
    /is not an allowed shared dataset/,
  );
});

test("rejects a manifest entry that tries to escape the directory", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  const manifest = JSON.parse(await readFile(join(target, MANIFEST_NAME), "utf8"));
  manifest.files.push({ path: "../escape.json", bytes: 1, sha256: "0".repeat(64) });
  await writeFile(join(target, MANIFEST_NAME), JSON.stringify(manifest));
  await assert.rejects(() => verifySharedData({ source, target }), /Unsafe shared dataset name/);
});

test("rejects a manifest missing an allowlisted dataset", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  const manifest = JSON.parse(await readFile(join(target, MANIFEST_NAME), "utf8"));
  const dropped = manifest.files.pop();
  await writeFile(join(target, MANIFEST_NAME), JSON.stringify(manifest));
  await assert.rejects(
    () => verifySharedData({ source, target }),
    new RegExp(`${dropped.path} is missing from the manifest`),
  );
});

test("fails loudly when a source dataset is absent", async () => {
  const source = await mkdtemp(join(tmpdir(), "shared-data-empty-"));
  await mkdir(source, { recursive: true });
  const target = await freshTarget();
  await assert.rejects(() => exportSharedData({ source, target }));
});

test("accepts a bundle carrying a subset of the export", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  const bundle = await freshTarget();
  await mkdir(bundle, { recursive: true });
  await writeFile(
    join(bundle, MANIFEST_NAME),
    await readFile(join(target, MANIFEST_NAME)),
  );
  await writeFile(
    join(bundle, SHARED_DATASETS[0]),
    await readFile(join(target, SHARED_DATASETS[0])),
  );
  await verifyBundledCopy({ target, bundle });
});

test("rejects a bundled dataset left behind by a re-export", async () => {
  const source = await fakeSource();
  const target = await freshTarget();
  await exportSharedData({ source, target });
  const bundle = await freshTarget();
  await mkdir(bundle, { recursive: true });
  await writeFile(
    join(bundle, MANIFEST_NAME),
    await readFile(join(target, MANIFEST_NAME)),
  );
  await writeFile(join(bundle, SHARED_DATASETS[0]), JSON.stringify({ stale: true }));
  await assert.rejects(
    () => verifyBundledCopy({ target, bundle }),
    /has drifted from the export/,
  );
});
