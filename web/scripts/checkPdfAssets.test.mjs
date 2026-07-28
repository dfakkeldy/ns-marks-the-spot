import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkPdfAssets } from "./checkPdfAssets.mjs";
import {
  ASSET_DIRECTORIES,
  preparePdfAssets,
} from "./preparePdfAssets.mjs";

async function fakePackage(version = "6.1.200") {
  const root = await mkdtemp(join(tmpdir(), "pdfjs-assets-source-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "pdfjs-dist", version }),
  );
  for (const [index, directory] of ASSET_DIRECTORIES.entries()) {
    await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, directory, "fixture.bin"), `asset-${index}`);
  }
  await mkdir(join(root, "build"), { recursive: true });
  await writeFile(join(root, "build", "must-not-copy.mjs"), "no");
  return root;
}

test("prepares only the pinned local asset directories with stable hashes", async () => {
  const source = await fakePackage();
  const parent = await mkdtemp(join(tmpdir(), "pdfjs-assets-target-"));
  const target = join(parent, "6.1.200");
  await mkdir(target);
  await writeFile(join(target, "stale.txt"), "stale");
  await writeFile(join(parent, "keep.txt"), "keep");

  const first = await preparePdfAssets({ source, target });
  const second = await preparePdfAssets({ source, target });
  assert.deepEqual(second, first);
  assert.equal(await readFile(join(parent, "keep.txt"), "utf8"), "keep");
  await assert.rejects(readFile(join(target, "stale.txt")));
  await assert.rejects(readFile(join(target, "build", "must-not-copy.mjs")));
  assert.equal((await checkPdfAssets({ target })).filesChecked, 4);
});

test("refuses any pdfjs-dist version other than the exact pin", async () => {
  const source = await fakePackage("6.1.201");
  const target = await mkdtemp(join(tmpdir(), "pdfjs-assets-refuse-"));
  await assert.rejects(
    preparePdfAssets({ source, target }),
    /6\.1\.200/,
  );
});

test("check refuses a changed asset hash", async () => {
  const source = await fakePackage();
  const target = await mkdtemp(join(tmpdir(), "pdfjs-assets-changed-"));
  await preparePdfAssets({ source, target });
  await writeFile(join(target, "cmaps", "fixture.bin"), "changed");
  await assert.rejects(checkPdfAssets({ target }), /hash/);
});
