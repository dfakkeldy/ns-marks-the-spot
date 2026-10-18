import receipt from '../../public/atlas/crown/source.json';
import type { Source } from 'pmtiles';

export const crownReceipt = receipt;
export const CROWN_SOURCE_URL = 'https://data.novascotia.ca/d/3nka-59nz';
export const CROWN_NOTE = `${receipt.note} ${receipt.source.rejectedRecords.length} source records omitted.`;

export function crownTileUrl(base = document.baseURI) {
  return `pmtiles://${new URL(`atlas/crown/${receipt.archive}`, base).href}`;
}

/** Static hosting returns HTTP 200 even for Range requests. Fetch this bounded
 * 8 MB archive once, verify its receipt, and serve PMTiles' ranges in memory.
 * The much larger provincial archive keeps using real HTTP byte ranges. */
export function crownArchiveSource(url: string): Source {
  let archive: Promise<ArrayBuffer> | undefined;
  const load = async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Crown Land archive HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    if (data.byteLength !== receipt.bytes) throw new Error('Crown Land archive size does not match its receipt');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== receipt.sha256) throw new Error('Crown Land archive does not match its receipt');
    return data;
  };
  return {
    getKey: () => url,
    async getBytes(offset, length, signal) {
      signal?.throwIfAborted();
      // A cancelled tile must not abort the shared archive needed by other
      // tiles, including a 2D/3D handoff. Failed downloads remain retryable.
      archive ??= load().catch(error => { archive = undefined; throw error; });
      const data = await archive;
      signal?.throwIfAborted();
      return { data: data.slice(offset, offset + length) };
    },
  };
}

export function crownReceiptUrl(base = document.baseURI) {
  return new URL('atlas/crown/source.json', base).href;
}

export function crownProvenance() {
  return `Crown Land (${CROWN_SOURCE_URL}), released ${receipt.source.released.slice(0, 10)}. ${CROWN_NOTE} ${receipt.transform} Archive ${receipt.archive}. Receipt: ${crownReceiptUrl()}`;
}
