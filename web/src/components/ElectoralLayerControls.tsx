import type { ElectoralLayerId, ElectoralMode } from '../layers/electoralLayers';
import { electoralLayers, electoralLayerById } from '../layers/electoralLayers';
import { ContextLayerToggle } from './ContextLayerToggle';
import type { ContextLayerId } from '../layers/contextLayerCatalog';
import type { MapLayerId, MapLayerStatus } from './MapCanvas';
import { partyColours, sequentialColours } from '../elections/electoralData';

export function ElectoralLegend({ mode, night }: { mode: ElectoralMode; night: boolean }) {
  const colours = night ? 'night' : 'day';
  const labels = mode === 'margin' ? ['<5 points','5–<15','15–<30','30–<50','50–100'] : ['<40%','40–<45%','45–<50%','50–<55%','55–100%'];
  const entries = mode === 'winner' ? ['PC','Liberal','NDP','Independent'].map(party => [party, partyColours[colours][party as keyof typeof partyColours.day]]) : labels.map((label,i) => [label, sequentialColours[colours][i]]);
  return mode === 'boundaries' ? null : <div className="electoral-legend" aria-label={`${mode} legend`}>
    <strong>{mode === 'winner' ? 'Party' : mode === 'margin' ? 'Margin · share of valid votes' : 'Turnout · listed electors'}</strong>
    {entries.map(([label,colour]) => <span key={label}><i style={{ background: colour }} aria-hidden="true" />{label}</span>)}
    <span><i style={{background: partyColours[colours].Independent}} aria-hidden="true" />{mode === 'winner' ? 'Tie / unclassified · see district label' : 'Not available · see district label'}</span>
  </div>;
}
export function ElectoralLayerControls({ visibility, statuses, licenceAccepted, modes, onModeChange, onChange, onReviewLicence, night }: {
  visibility: Record<ContextLayerId, boolean>; statuses: Record<MapLayerId, MapLayerStatus>; licenceAccepted: boolean;
  modes: Record<ElectoralLayerId, ElectoralMode>; onModeChange: (id: ElectoralLayerId, mode: ElectoralMode) => void;
  onChange: (id: ContextLayerId, visible: boolean) => void; onReviewLicence: () => void; night: boolean;
}) {
  return <div className="electoral-controls">
    {(['Provincial','Federal','Municipal'] as const).map(level => <section key={level} aria-label={`${level} electoral layers`}>
      <h3>{level} <small>· {level === 'Provincial' ? 'Elections Nova Scotia' : level === 'Federal' ? 'Elections Canada' : 'Province & municipalities'}</small></h3>
      {electoralLayers.filter(l => l.electoral.level === level).map(l => {
        const layer = electoralLayerById[l.id];
        const enabled = visibility[layer.id] && (licenceAccepted || layer.licence !== 'province-restricted');
        return <div key={layer.id}>
          <ContextLayerToggle layer={layer} checked={visibility[layer.id]} licenceAccepted={licenceAccepted} status={statuses[layer.id]} onChange={v => onChange(layer.id,v)} onReviewLicence={onReviewLicence} />
          {layer.electoral.kind === 'results' || layer.electoral.kind === 'seats' ? <div className="electoral-modes">
            <label>Display <select aria-label={`${layer.name} display`} value={modes[layer.id]} onChange={e => onModeChange(layer.id,e.target.value as ElectoralMode)}>
              <option value="boundaries">Boundaries only</option><option value="winner">{layer.electoral.kind === 'seats' ? 'Seat party' : 'Winning party'}</option>
              {layer.electoral.kind === 'results' ? <><option value="margin">Margin of victory</option><option value="turnout">Turnout</option></> : null}
            </select></label>
            {enabled ? <ElectoralLegend mode={modes[layer.id]} night={night} /> : null}
          </div> : null}
        </div>;
      })}
    </section>)}
    <p className="resource-source-note">Data loads for the whole province. Taps and map bounds stay in this browser. Overlapping layers select polls and results first, then municipal, provincial and federal boundaries. Turn off layers to inspect beneath. One results wash is shown at a time. These records do not tell you where to vote.</p>
  </div>;
}
