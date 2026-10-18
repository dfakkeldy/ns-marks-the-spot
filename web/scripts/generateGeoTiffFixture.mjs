// Regenerates web/src/test/fixtures/utm20-8x6.tif. Deterministic on purpose:
// tests assert exact metadata, so the fixture must never drift silently.
// Run: node web/scripts/generateGeoTiffFixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeArrayBuffer } from "geotiff";

const WIDTH = 8;
const HEIGHT = 6;

const values = new Uint8Array(WIDTH * HEIGHT * 3);
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const i = (y * WIDTH + x) * 3;
    values[i] = Math.round((x / (WIDTH - 1)) * 255); // red ramps west→east
    values[i + 1] = 0;
    values[i + 2] = Math.round((y / (HEIGHT - 1)) * 255); // blue ramps north→south
  }
}

const metadata = {
  width: WIDTH,
  height: HEIGHT,
  SamplesPerPixel: 3,
  BitsPerSample: [8, 8, 8],
  PhotometricInterpretation: 2,
  ModelPixelScale: [10, 10, 0],
  ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
  ProjectedCSTypeGeoKey: 26920,
  GTModelTypeGeoKey: 1,
  GTRasterTypeGeoKey: 1,
};

const buffer = writeArrayBuffer(values, metadata);
const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "test",
  "fixtures",
  "utm20-8x6.tif",
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(buffer));
console.log(`wrote ${out}`);
