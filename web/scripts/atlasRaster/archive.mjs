// The pinned provincial PMTiles archive: checksum verification against the
// web receipt and the exact tile coverage read from the archive directories.
// Coverage is the archive's own list of addressed tiles, never a bounding box.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { PMTiles, tileIdToZxy } from 'pmtiles';
import { Coverage } from './coverage.mjs';

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

/** Refuse to render from anything but the archive the web receipt pins. */
export async function verifyArchive(file, receipt) {
  const info = await stat(file);
  if (info.size !== receipt.bytes) {
    throw new Error(`${file} is ${info.size} bytes; the receipt pins ${receipt.archive} at ${receipt.bytes} bytes.`);
  }
  const sha256 = await sha256File(file);
  if (sha256 !== receipt.sha256) {
    throw new Error(`${file} has sha256 ${sha256}; the receipt pins ${receipt.sha256}.`);
  }
  return { archive: receipt.archive, sha256, bytes: info.size };
}

/** A pmtiles Source over a local file. */
export async function openArchive(file) {
  const handle = await open(file, 'r');
  const source = {
    getKey: () => file,
    async getBytes(offset, length) {
      const buffer = new Uint8Array(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length) throw new Error(`${file}: short read at ${offset} (${bytesRead} of ${length} bytes)`);
      return { data: buffer.buffer };
    },
  };
  return { source, archive: new PMTiles(source), close: () => handle.close() };
}

/** Every addressed tile in the archive, from the root and leaf directories. */
export async function readArchiveCoverage(file) {
  const { source, archive, close } = await openArchive(file);
  try {
    const header = await archive.getHeader();
    const coverage = new Coverage();
    const walk = async (offset, length) => {
      const entries = await archive.cache.getDirectory(source, offset, length, header);
      for (const entry of entries) {
        if (entry.runLength === 0) {
          await walk(header.leafDirectoryOffset + entry.offset, entry.length);
          continue;
        }
        for (let run = 0; run < entry.runLength; run++) {
          const [z, x, y] = tileIdToZxy(entry.tileId + run);
          coverage.add(z, x, y);
        }
      }
    };
    await walk(header.rootDirectoryOffset, header.rootDirectoryLength);
    if (coverage.total() !== header.numAddressedTiles) {
      throw new Error(`${file}: walked ${coverage.total()} tiles but the header addresses ${header.numAddressedTiles}.`);
    }
    return { header, coverage };
  } finally {
    await close();
  }
}
