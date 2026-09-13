import receipt from '../../public/atlas/crown/source.json';

export const crownReceipt = receipt;
export const CROWN_SOURCE_URL = 'https://data.novascotia.ca/d/3nka-59nz';
export const CROWN_NOTE = `${receipt.note} ${receipt.source.rejectedRecords.length} source records omitted.`;

export function crownTileUrl(base = document.baseURI) {
  return `pmtiles://${new URL(`atlas/crown/${receipt.archive}`, base).href}`;
}

export function crownReceiptUrl(base = document.baseURI) {
  return new URL('atlas/crown/source.json', base).href;
}

export function crownProvenance() {
  return `Crown Land (${CROWN_SOURCE_URL}), released ${receipt.source.released.slice(0, 10)}. ${CROWN_NOTE} ${receipt.transform} Archive ${receipt.archive}. Receipt: ${crownReceiptUrl()}`;
}
