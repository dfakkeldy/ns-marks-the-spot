import { useEffect, useRef, useState } from "react";
import federalMembers from "../elections/federalMembers.json";
import { electoralLayerById } from "../layers/electoralLayers";
import { loadElectoralCollection } from "../elections/electoralData";
import { ELECTION_BOUNDARY_NOTE, ENS_RESULTS_URL, ENS_WORKBOOK_URL } from '../layers/electoralLayers';
import { electoralId, electoralLabel, isInstitution, partyColours, resultSummary, type ElectoralSelection } from '../elections/electoralData';

export function DistrictInspector({ selection, onClose, night }: { selection: ElectoralSelection; onClose: () => void; night: boolean }) {
  const { layer, feature } = selection, p = feature.properties;
  const result = layer.electoral.kind === 'results' ? resultSummary(p) : null;
  const institution = isInstitution(layer,p);
  const panel = useRef<HTMLElement>(null);
  const [seats, setSeats] = useState<Awaited<ReturnType<typeof loadElectoralCollection>> | null>(null);
  const needsMla = layer.electoral.level === 'Provincial' && !p.MLA;
  useEffect(() => { panel.current?.focus({preventScroll:true}); }, [selection]);
  useEffect(() => {
    if (!needsMla) return;
    const controller = new AbortController();
    void loadElectoralCollection(electoralLayerById['provincial-seats-2026'], true, controller.signal).then(value => { if (!controller.signal.aborted) setSeats(value); });
    return () => controller.abort();
  }, [needsMla]);
  const mlaRecord = seats?.status === 'ready' ? seats.collection.features.find(f => f.properties.ED_NO === p.ED_NO)?.properties : null;
  const mp = layer.electoral.level === 'Federal' ? federalMembers.records[String(p.FED_NUM) as keyof typeof federalMembers.records] : null;

  return <aside ref={panel} tabIndex={-1} className="district-inspector" aria-label="District inspector" data-owns-escape onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <button className="text-button district-close" onClick={onClose} aria-label="Close district inspector">Close ×</button>
    <p className="electoral-eyebrow">{layer.electoral.level} · {institution ? 'Institutional poll' : `District ${electoralId(p)}`}</p>
    <h2>{electoralLabel(layer,p)}</h2>
    <p>{layer.electoral.kind === 'results' ? 'General election · 2024' : layer.name}</p>
    {typeof p.MLA === 'string' ? <p><strong>{layer.electoral.kind === 'results' ? 'MLA elected' : 'MLA in source'}:</strong> {p.MLA} · {String(p.PARTY ?? p.Party ?? 'Party not stated')}</p> : null}
    {needsMla ? <p><strong>MLA · seats source to June 23, 2026:</strong> {mlaRecord ? String(mlaRecord.MLA) : seats === null ? 'Loading source…' : 'Not available from source'}</p> : null}
    {mp ? <p><strong>MP:</strong> <a href={mp.officialPage} target="_blank" rel="noreferrer">{mp.name}</a><br />Current caucus: {mp.currentCaucus}. Checked {mp.checkedAt.slice(0,10)} (House of Commons). This is not party at election.</p> : null}
    {result ? <>
      <dl className="electoral-metrics"><div><dt>Margin</dt><dd>{result.marginVotes.toLocaleString('en-CA')} votes · {result.marginPoints.toFixed(2)} points{result.tie ? ' · Tie' : ''}</dd></div><div><dt>Turnout of listed electors</dt><dd>{result.turnout === null ? 'Not stated' : `${result.turnout.toFixed(1)}%`}</dd></div></dl>
      <h3>Share of valid votes</h3>
      <div className="electoral-vote-bars">{result.bars.map(({party,votes}) => <div key={party}><span>{party}</span><span className="electoral-bar-track"><span style={{width: `${100*votes/result.validVotes}%`, background: partyColours[night ? 'night' : 'day'][party]}} /></span><span>{(100*votes/result.validVotes).toFixed(1)}%</span><small>{votes.toLocaleString('en-CA')} votes</small></div>)}</div>
      <p>{result.validVotes.toLocaleString('en-CA')} valid votes. Rejected and declined ballots excluded from party shares; included in turnout.</p>
    </> : layer.electoral.kind === 'results' ? <p role="status">Result unavailable: missing or inconsistent source totals.</p> : <p>Boundary record. This source does not contain election results.</p>}
    {institution ? <p>Institution marker, not a neighbourhood. Counts and identifying poll labels are suppressed.</p> : null}
    <section className="electoral-evidence"><h3>Evidence</h3>
      <p><strong>{layer.licence === 'province-restricted' ? 'Official source, loaded directly' : 'Project-derived display extract of official boundaries'}</strong></p>
      <p>{layer.sourceDate}</p><p>{layer.webCaveat}</p>
      {layer.electoral.level === 'Provincial' && layer.webCaveat !== ELECTION_BOUNDARY_NOTE ? <p>{ELECTION_BOUNDARY_NOTE}</p> : null}
      <p>{layer.attribution}</p><p>{layer.scale}</p>
      <p><a href={layer.sourceUrl} target="_blank" rel="noreferrer">Official source</a> · <a href={layer.licenceUrl} target="_blank" rel="noreferrer">Licence</a></p>
      {layer.electoral.level === 'Provincial' ? <p><a href={ENS_RESULTS_URL} target="_blank" rel="noreferrer">Official 2024 results</a> · <a href={ENS_WORKBOOK_URL} target="_blank" rel="noreferrer">Poll-by-poll spreadsheet</a></p> : null}
      {layer.electoral.asset ? <p><a href={`${import.meta.env.BASE_URL}elections/source.json`} target="_blank" rel="noreferrer">Source receipt & conversion</a></p> : null}
    </section>
  </aside>;
}
