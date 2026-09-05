import { atlasPalettes, type AtlasMode } from './palette';

/**
 * Design specimens for historical site symbols (schools, mills, mines, forges)
 * that a later extraction effort may place from Fletcher's sheets. They are
 * drawn here only as unlocated key entries: no historical coordinates exist in
 * this module and nothing draws them on production geography.
 *
 * The two confidence states differ by shape, not just colour: a recorded
 * location is a solid ink silhouette; an approximate location is a hollow
 * outline inside a dashed ring, in muted ink.
 */
export type HistoricalSiteKind = 'school' | 'mill' | 'mine' | 'forge';
export type HistoricalSiteConfidence = 'recorded' | 'approximate';

type Symbol = { kind: HistoricalSiteKind; label: string; shape: string; detail?: string; detailWidth?: number };

/** 20 × 20 viewBox. `shape` is the closed silhouette; `detail` is stroked on top. */
export const historicalSiteSymbols: readonly Symbol[] = [
  { kind: 'school', label: 'School', shape: 'M4 9L10 4.5 16 9V16H4Z', detail: 'M10 4.5V1.5M10 1.5h2.5' },
  { kind: 'mill', label: 'Mill', shape: 'M10 3a7 7 0 1 1 0 14 7 7 0 1 1 0-14z', detail: 'M10 4v12M4 10h12M5.8 5.8l8.4 8.4M14.2 5.8l-8.4 8.4', detailWidth: 1.2 },
  { kind: 'mine', label: 'Mine', shape: 'M3.5 4.5 5.5 2.5 17.5 14.5 15.5 16.5ZM14.5 2.5 16.5 4.5 4.5 16.5 2.5 14.5Z' },
  { kind: 'forge', label: 'Forge', shape: 'M2.5 7h15l-3.5 3.5H11V14h3v2.5H6V14h3v-3.5H6.5Z' },
];

export const historicalSiteStates: readonly { confidence: HistoricalSiteConfidence; label: string; note: string }[] = [
  { confidence: 'recorded', label: 'Recorded location', note: 'Solid silhouette: the site is read at a drawn position that matches modern geography.' },
  { confidence: 'approximate', label: 'Approximate location', note: 'Hollow outline in a dashed ring: the sheet names the site but its position is uncertain.' },
];

/** Inline SVG markup for one specimen, sized in CSS by the caller. */
export function historicalSiteSvg(kind: HistoricalSiteKind, confidence: HistoricalSiteConfidence, mode: AtlasMode): string {
  const p = atlasPalettes[mode];
  const symbol = historicalSiteSymbols.find(entry => entry.kind === kind)!;
  const recorded = confidence === 'recorded';
  const ink = recorded ? p.ink : p.mutedInk;
  const ring = recorded ? '' : `<circle cx="10" cy="10" r="9.2" fill="none" stroke="${ink}" stroke-width="0.9" stroke-dasharray="2 1.6"/>`;
  const shape = `<path d="${symbol.shape}" transform="translate(10 10) scale(${recorded ? 1 : 0.72}) translate(-10 -10)" fill="${recorded ? ink : 'none'}" stroke="${ink}" stroke-width="${recorded ? 1 : 1.3}" stroke-linejoin="round"/>`;
  const detail = symbol.detail ? `<path d="${symbol.detail}" transform="translate(10 10) scale(${recorded ? 1 : 0.72}) translate(-10 -10)" fill="none" stroke="${recorded ? p.halo : ink}" stroke-width="${symbol.detailWidth ?? 1.4}" stroke-linecap="round"/>` : '';
  return `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${symbol.label}, ${confidence} location">${ring}${shape}${detail}</svg>`;
}

/**
 * Lettering specimens: printed wordings transcribed from Fletcher sheet 19
 * (docs/fletcher/label-extraction). They demonstrate the map's serif only.
 * `reading` describes how clearly the ink was read; it says nothing about
 * position. Every specimen is unlocated: no geometry exists for any of them
 * and none is a mapped feature.
 */
export type ReadingConfidence = 'clear' | 'tentative';
export const historicalLetteringSpecimens: readonly { id: string; wording: string; kind: string; reading: ReadingConfidence; italic: boolean }[] = [
  { id: 'F19-JUD-014', wording: 'Judique', kind: 'settlement', reading: 'clear', italic: false },
  { id: 'F19-JUD-020', wording: 'Rory Chisholm\u2019s Brook', kind: 'watercourse', reading: 'clear', italic: true },
  { id: 'F19-JUD-006', wording: 'Sh. Mill', kind: 'mill', reading: 'clear', italic: true },
  { id: 'F19-JUD-016', wording: 'Rev. Arch\u1d48. Chisholm', kind: 'person-label', reading: 'tentative', italic: true },
];
export const LETTERING_PLACEMENT = 'unlocated' as const;
