/**
 * SPIKE ONLY — delete with this branch.
 *
 * Dumps what the shipping web parser extracts from every GeoPDF fixture so the
 * Swift CGPDF probe can be diffed against it rather than against my reading of
 * the code. Writes JSON to SPIKE_DUMP_PATH.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { it } from "vitest";
import {
  extractGeoPdfMetadata,
  type PdfViewportGeometry,
} from "./geoPdfMetadata";

const FIXTURE_DIR = join(__dirname, "..", "..", "test", "fixtures", "geopdf");

async function pageSize(
  bytes: Uint8Array,
): Promise<{ width: number; height: number; pageCount: number } | null> {
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    if (document.getPageCount() === 0) return null;
    const { width, height } = document.getPage(0).getSize();
    return { width, height, pageCount: document.getPageCount() };
  } catch {
    return null;
  }
}

function viewportFor(width: number, height: number): PdfViewportGeometry {
  return {
    width,
    height,
    transform: [1, 0, 0, -1, 0, height],
    viewBox: [0, 0, width, height],
  };
}

it("dumps web parser output for every GeoPDF fixture", async () => {
  const files = readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".pdf"))
    .sort();
  const dump: Record<string, unknown> = {};

  for (const file of files) {
    const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, file)));
    const size = await pageSize(bytes);
    const viewport = viewportFor(size?.width ?? 612, size?.height ?? 792);
    const extraction = await extractGeoPdfMetadata(bytes, viewport);
    dump[file] = {
      pageSize: size,
      producer: extraction.producer,
      pageStructure: extraction.pageStructure,
      rejected: extraction.rejected,
      candidates: extraction.candidates.map((candidate) => ({
        id: candidate.id,
        flavor: candidate.flavor,
        embeddedLabel: candidate.embeddedLabel,
        sourceRect: candidate.sourceRect,
        gcpCount: candidate.gcps.length,
        gcps: candidate.gcps.map((gcp) => ({
          pixel: gcp.pixel,
          map: gcp.map,
        })),
      })),
    };
  }

  const target = process.env.SPIKE_DUMP_PATH;
  if (!target) throw new Error("set SPIKE_DUMP_PATH");
  writeFileSync(target, JSON.stringify(dump, null, 2));
});
