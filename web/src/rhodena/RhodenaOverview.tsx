import { RHODENA_SOURCE } from './catalog';
import parcels from './parcels.json';
export function RhodenaOverview({ onFit }: { onFit: () => void }) {
  return <div className="rhodena-overview">
    <p><strong>Rhodena · 2024 assessed proposal</strong><br/>Up to six turbines · 42 MW · up to 200 m above ground.</p>
    <button type="button" className="text-button" onClick={onFit}>Show Rhodena area</button>
    <p>Explore Creignish, Craigmore, Long Point and Judique. Use the map’s distance tool to measure between places. Dashed project lines are approximate traces; solid points use published coordinates.</p>
    <details><summary>Project status & evidence gaps</summary>
      <p>The <a href={`${RHODENA_SOURCE}EA_Approval_RhodenaWind.pdf`} target="_blank" rel="noreferrer">January 6, 2025 approval</a> is conditional. It does not establish that all permits or land authorizations have been obtained, or that construction has started.</p>
      <p>Checked September 26, 2026: the <a href="https://www.aboenergy.com/ca/company/projects/rhodena-wind/index.php" target="_blank" rel="noreferrer">developer’s schedule</a> lists winter 2027 procurement, construction in 2028–2030 and a target 2030 opening, subject to selection and change. This map uses the assessed 2024 layout; older 18/15-turbine proposals are excluded.</p>
      <p><strong>Two substation locations:</strong> the August noise model and October infrastructure drawing disagree. Both are identified separately; neither is asserted to be the final design.</p>
      <p><strong>Water and habitat:</strong> 2024 reviewers described 36 wetlands, up to 14 possible alterations and three wetlands of special significance. The report withholds their IDs to protect sensitive species; this map does not reconstruct those locations. Final wetland boundaries and detailed drainage works remain unverified.</p>
      <p>Reviewers reported six old-growth stands overlapping the assessment area, lichen concerns near infrastructure, lynx corridor implications and bird-survey gaps near T5–T6. These are dated findings, not proof that follow-up remains outstanding. Precise species and archaeological sites are not reproduced.</p>
      <p><strong>Context layers:</strong> Land & Property offers parcels, Crown land and protected areas. Forestry & Ecology offers old-growth policy; Water & Terrain offers water, contours, hillshade and wetness/flow models. Roads & Places offers mapped roads, recreation features and communities. These sources do not establish habitat absence, public access, a legal setback or site conditions.</p>
      <p>Project/assessment footprints, exact road widening, full field wetland and habitat survey geometry, final authorizations and updated modelling are not verified here. Public noise contours are available in Appendix L; shadow results are receptor tables and calendars in Appendix K. No contour is inferred from the distance rings. Anonymous receptors are not a complete inventory of nearby homes.</p>
      <p><a href={`${RHODENA_SOURCE}Comments_Part_1_Rhodena_Wind.pdf#page=32`} target="_blank" rel="noreferrer">2024 technical reviews</a>{' · '}<a href={`${RHODENA_SOURCE}rwp-Part-8-Appendix-J-Appendix-M.pdf#page=65`} target="_blank" rel="noreferrer">Noise model map</a>{' · '}<a href={`${RHODENA_SOURCE}rwp-Part-8-Appendix-J-Appendix-M.pdf#page=50`} target="_blank" rel="noreferrer">Shadow model</a>{' · '}<a href={RHODENA_SOURCE} target="_blank" rel="noreferrer">All drawings and studies</a></p>
      <p><a href="https://invernesscounty.ca/municipal-planning-strategy-land-use-bylaw-in-effect/" target="_blank" rel="noreferrer">Municipal planning source</a>{' · '}<a href="https://nova-scotia-gcp.com/stakeholder-resources/" target="_blank" rel="noreferrer">Procurement documents</a>. No legal compliance conclusion is inferred from these overlays.</p>
    </details>
    <details><summary>Land categories recorded in the assessment</summary>
      <p>Table 3.1, October 2024: {parcels.length} study-area PIDs. Categories describe that dated report, not current title, a turbine on every parcel, or permission to enter. The proponent describes private turbine sites; supporting infrastructure may involve Crown land. No owner names are included.</p>
      <p>Use PID search with the parcel layer to inspect a listed parcel. The approximate study outline must not be used to identify which parcels are included.</p>
      <div className="rhodena-parcels"><table><thead><tr><th>PID</th><th>Recorded category</th></tr></thead><tbody>{parcels.map(p=><tr key={p.pid}><td>{p.pid}</td><td>{p.category}</td></tr>)}</tbody></table></div>
      <p><a href={`${RHODENA_SOURCE}rwp-Part-1-EARD-to-Appendix-A-part-a-.pdf`} target="_blank" rel="noreferrer">Registration report, Table 3.1 (printed pages 7–9)</a></p>
    </details>
  </div>;
}
