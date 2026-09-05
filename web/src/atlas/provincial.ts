import receipt from '../../public/atlas/provincial/source.json';

export const provincialReceipt = receipt;
export const PROVINCIAL_ATTRIBUTION = receipt.attribution;
export const PROVINCIAL_LICENCE_URL = receipt.licenceUrl;

// Resolve against the app directory, including KinNoKi's nested hosting path.
export function provincialTileUrl(baseUrl = import.meta.env.VITE_PROVINCIAL_ATLAS_BASE_URL ?? '') {
  if (baseUrl) {
    const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error('Provincial Atlas host must be a public HTTP(S) directory URL.');
    }
    return `pmtiles://${new URL(receipt.archive, base).href}`;
  }
  return `pmtiles://${new URL(`atlas/provincial/${receipt.archive}`, document.baseURI).href}`;
}

export function provincialReceiptUrl() {
  return new URL('atlas/provincial/source.json', document.baseURI).href;
}

const labels: Record<string, string> = {
  '484g-adjn': 'NSRN', 'xf3i-vxcb': 'GeoNAMES', 'h8jb-hzrm': 'Water polygons',
  'fpca-jrmt': 'Water lines', 'xed8-vvg5': 'Woodland', '7bqh-hssn': 'Municipal boundaries',
};
export const provincialSourceDates = receipt.sources
  .map(source => `${labels[source.id] ?? source.name}: ${source.released.slice(0, 10)}`).join('; ');
export const PROVINCIAL_SCALE_NOTE = 'NSTDB 1:10,000; woodland generalized at 2 m. Closer zoom magnifies source detail. Roads and paths do not establish access permission. Null source geometries are omitted and listed in the receipt.';

export function provincialExportProvenance() {
  return `Archive ${receipt.archive}. ${provincialSourceDates}. ${PROVINCIAL_SCALE_NOTE} Receipt: ${provincialReceiptUrl()}`;
}
