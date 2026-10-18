import seatsReceipt from "./provincialSeatsReceipt.json";
import type { ElectoralLayer, ElectoralMode } from '../layers/electoralLayers';

export type ElectoralFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;
export type ElectoralCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;
export type ElectoralLoad = { status: 'ready'; collection: ElectoralCollection } | { status: 'licence-blocked' | 'returned-empty' | 'source-error' };
export type ElectoralSelection = { layer: ElectoralLayer; feature: ElectoralFeature };
export const partyNames = ['PC', 'Liberal', 'NDP', 'Green', 'Independent'] as const;
export type Party = typeof partyNames[number];
export const partyColours = {
  day: { PC: '#1e66cc', Liberal: '#be4d3c', NDP: '#d98f1a', Green: '#3f8a3a', Independent: '#718087' },
  night: { PC: '#3f86e0', Liberal: '#d24b3a', NDP: '#bb8a26', Green: '#5aa040', Independent: '#8a979c' },
};
export const sequentialColours = { day: ['#e6eff1','#c3d8dd','#93b9c3','#5f92a0','#316d7c'], night: ['#1d3a42','#2a5a66','#3f7f8e','#6fb0c0','#9fd6e2'] };
export function classifyResult(mode: 'margin' | 'turnout', value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const edges = mode === 'margin' ? [5, 15, 30, 50] : [40, 45, 50, 55];
  return edges.filter(edge => value >= edge).length;
}
function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
export function resultSummary(p: Record<string, unknown>) {
  const votes = partyNames.map(party => ({ party, votes: number(p[`${party}_Votes`]) }));
  if (votes.some(v => v.votes === null)) return null;
  const bars = votes.map(v => ({ party: v.party, votes: v.votes! })).sort((a,b) => b.votes-a.votes);
  const validVotes = bars.reduce((s,v) => s+v.votes, 0);
  const total = number(p.Total), rejected = number(p.Rejected), declined = number(p.Declined);
  if (!validVotes || total === null || rejected === null || declined === null || total !== validVotes + rejected + declined) return null;
  const turnout = number(p.PctVoterTurnout);
  return { validVotes, total, bars, winner: bars[0].party, tie: bars[0].votes === bars[1].votes,
    marginVotes: bars[0].votes-bars[1].votes, marginPoints: 100*(bars[0].votes-bars[1].votes)/validVotes,
    turnout: turnout !== null && turnout <= 100 ? turnout : null };
}
export function normalizedParty(value: unknown): Party | null {
  if (typeof value !== 'string') return null;
  if (/^(PC|Progressive Conservative|PC Party)/i.test(value)) return 'PC';
  if (/Liberal/i.test(value)) return 'Liberal';
  if (/NDP|New Democratic/i.test(value)) return 'NDP';
  if (/Independent/i.test(value)) return 'Independent';
  if (/Green/i.test(value)) return 'Green';
  return null;
}
export function isInstitution(layer: ElectoralLayer, p: Record<string, unknown>): boolean {
  return layer.electoral.kind === 'polls' && (['S','M'].includes(String(p.PD_TYPE)) || [p.RES_CARE,p.IND_POLL].some(value => value != null && String(value).trim() !== '' && !/^(N|NO|0|FALSE)$/i.test(String(value))));
}
export function electoralLabel(layer: ElectoralLayer, p: Record<string, unknown>): string {
  if (isInstitution(layer,p)) return 'Institutional poll · counts suppressed';
  if (layer.electoral.kind === 'polls') return `${p.ED_NAME ?? p.FED_NUM ?? ''} · PD ${p.PD_NO ?? `${p.PD_NUM}-${p.PD_NBR_SFX}`}`;
  return String(p.ED_NAME ?? p.ED_NAMEE ?? p.DISTNAME ?? `${p.mun ?? 'Municipality'} · district ${p.poll_dist ?? 'not stated'}`);
}
export function electoralId(p: Record<string, unknown>): string { return String(p.ED_NO ?? p.FED_NUM ?? p.DIST_ID ?? `${p.mu_code ?? ''}/${p.poll_dist ?? ''}`); }
export function electoralFill(layer: ElectoralLayer, p: Record<string, unknown>, mode: ElectoralMode, night: boolean) {
  const palette = night ? 'night' : 'day';
  if (mode === 'boundaries' || isInstitution(layer,p)) return { colour: 'transparent', label: 'Boundaries' };
  const result = resultSummary(p);
  if (mode === 'winner') {
    const party = layer.electoral.kind === 'seats' ? normalizedParty(p.Party) : result?.tie ? null : result?.winner;
    // Green is a bar only. Missing/unrecognised parties never acquire a party fill.
    return { colour: party && party !== 'Green' ? partyColours[palette][party] : partyColours[palette].Independent, label: party ?? (result?.tie ? 'Tie' : 'Result unavailable') };
  }
  const value = mode === 'margin' ? result?.marginPoints : result?.turnout;
  const band = classifyResult(mode, value ?? null);
  return { colour: band === null ? partyColours[palette].Independent : sequentialColours[palette][band], label: value == null ? 'Not available' : `${value.toFixed(1)}${mode === 'margin' ? ' point margin' : '% turnout'}` };
}

/** No point, viewport, district selected by the user, or bbox is accepted here. */
export async function loadElectoralCollection(layer: ElectoralLayer, licenceAccepted: boolean, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ElectoralLoad> {
  if (layer.licence === 'province-restricted' && !licenceAccepted) return { status: 'licence-blocked' };
  try {
    const features: ElectoralFeature[] = [], ids = new Set<string>();
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ f: 'geojson', where: '1=1', outSR: '4326', maxAllowableOffset: '0.00003', outFields: '*', returnGeometry: 'true', orderByFields: 'OBJECTID', resultRecordCount: '500', resultOffset: String(page*500) });
      const url = layer.electoral.asset ? `${import.meta.env.BASE_URL}elections/${layer.electoral.asset}` : `${layer.serviceUrl}/query?${params}`;
      const response = await fetcher(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Source response failed');
      const data = await response.json();
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.error) throw new Error('Invalid collection');
      for (const f of data.features) {
        if (!f.geometry || !['Polygon','MultiPolygon'].includes(f.geometry.type) || !f.properties || !Object.keys(f.properties).length) throw new Error('Missing source geometry or identity');
        const key = String(f.id ?? f.properties.source_row_id ?? f.properties.OBJECTID ?? `${f.properties.mu_code}/${f.properties.poll_dist}`);
        if (ids.has(key)) throw new Error('Repeated page or duplicate identity');
        ids.add(key); features.push(f);
      }
      if (layer.electoral.asset || !(data.exceededTransferLimit ?? data.properties?.exceededTransferLimit) && data.features.length < 500) {
        if (!features.length) return { status: 'returned-empty' };
        if (features.length !== layer.electoral.expectedCount) throw new Error('Source count changed; needs review');
        if (layer.id === 'provincial-seats-2026') {
          const rows = features.map(f => seatsReceipt.attributeFields.map(key => f.properties[key])).sort((a,b) => String(a[0]).localeCompare(String(b[0])));
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rows)));
          const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
          if (hash !== seatsReceipt.sha256) throw new Error('Seats source changed; dated claim needs review');
        }
        return { status: 'ready', collection: { type: 'FeatureCollection', features } };
      }
    }
  } catch { return { status: 'source-error' }; }
  return { status: 'source-error' };
}
