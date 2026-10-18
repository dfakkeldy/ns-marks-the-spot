import { useId } from 'react';
import type { ReliefSettings } from './reliefMath';
import './reliefControls.css';

export function ReliefControls({ value, onChange }: { value: ReliefSettings; onChange: (value: ReliefSettings) => void }) {
  const id = useId();
  return <div className="relief-controls">
    <label className="relief-slider" htmlFor={`${id}-height`}><span>Height exaggeration</span><output>{value.exaggeration}×</output>
      <input id={`${id}-height`} type="range" min="1" max="10" step="0.5" value={value.exaggeration} onChange={event => onChange({ ...value, exaggeration: Number(event.target.value) })} />
    </label>
    <label className="relief-check"><input type="checkbox" checked={value.lowEnabled} onChange={event => onChange({ ...value, lowEnabled: event.target.checked })} />Separate low-ground scale</label>
    {value.lowEnabled ? <>
      <label className="relief-band" htmlFor={`${id}-band`}>Low-ground band
        <select id={`${id}-band`} value={value.lowThreshold} onChange={event => onChange({ ...value, lowThreshold: Number(event.target.value) as 20 | 100 })}>
          <option value="20">0–20 m</option><option value="100">0–100 m</option>
        </select>
      </label>
      <label className="relief-slider" htmlFor={`${id}-low`}><span>Low-ground exaggeration</span><output>{value.lowExaggeration}×</output>
        <input id={`${id}-low`} type="range" min="1" max="10" step="0.5" value={value.lowExaggeration} onChange={event => onChange({ ...value, lowExaggeration: Number(event.target.value) })} />
      </label>
      <p className="relief-note">Bands use source elevations. Higher terrain joins smoothly; measurements stay unchanged.</p>
    </> : null}
  </div>;
}
